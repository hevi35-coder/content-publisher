/**
 * OAuth Manager - Handles OAuth 2.0 token refresh for Google APIs
 * 
 * Supports automatic token refresh using refresh_token.
 * Required env vars: BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function parsePositiveInt(rawValue, fallback) {
    const parsed = Number.parseInt(String(rawValue ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function isAbortError(error) {
    return !!(error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(error.message))));
}

class OAuthManager {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Load credentials from environment (called at runtime, not module load)
     */
    _loadCredentials() {
        return {
            clientId: process.env.BLOGGER_CLIENT_ID,
            clientSecret: process.env.BLOGGER_CLIENT_SECRET,
            refreshToken: process.env.BLOGGER_REFRESH_TOKEN,
            accessToken: process.env.BLOGGER_ACCESS_TOKEN
        };
    }

    /**
     * Check if we have valid credentials for auto-refresh
     */
    canAutoRefresh() {
        const creds = this._loadCredentials();
        return !!(creds.clientId && creds.clientSecret && creds.refreshToken);
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    async getAccessToken() {
        const creds = this._loadCredentials();

        // If we have a manual token and no refresh capability, use it
        if (!this.canAutoRefresh()) {
            if (!creds.accessToken) {
                throw new Error('BLOGGER_ACCESS_TOKEN is required when auto-refresh is not configured');
            }
            console.log('[OAuth] Using manual access token');
            return creds.accessToken;
        }

        // Check if current token is still valid
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Refresh the token
        return await this.refreshAccessToken();
    }

    _resolveRefreshPolicy() {
        const maxAttempts = parsePositiveInt(process.env.BLOGGER_OAUTH_REFRESH_MAX_ATTEMPTS, 3);
        const timeoutMs = parsePositiveInt(process.env.BLOGGER_OAUTH_REFRESH_TIMEOUT_MS, 10000);
        const retryBaseMs = parsePositiveInt(process.env.BLOGGER_OAUTH_REFRESH_RETRY_BASE_MS, 1500);
        const allowManualFallback = String(process.env.BLOGGER_OAUTH_ALLOW_MANUAL_FALLBACK || 'true').toLowerCase() !== 'false';

        return {
            maxAttempts,
            timeoutMs,
            retryBaseMs,
            allowManualFallback
        };
    }

    _shouldRetryRefresh(status, errorCode) {
        if (errorCode === 'invalid_grant') {
            return false;
        }
        if (status === 429) {
            return true;
        }
        if (status >= 500) {
            return true;
        }
        return false;
    }

    _refreshBackoff(attempt, retryBaseMs) {
        return retryBaseMs * Math.pow(2, attempt - 1);
    }

    async _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    _buildRefreshError(prefix, { status = 0, retryable = false, code = '', description = '' } = {}) {
        const err = new Error(prefix);
        err.status = status;
        err.retryable = retryable;
        err.code = code;
        err.description = description;
        return err;
    }

    async _refreshOnce(creds, timeoutMs) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        let response;

        try {
            response = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: creds.clientId,
                    client_secret: creds.clientSecret,
                    refresh_token: creds.refreshToken,
                    grant_type: 'refresh_token'
                }),
                signal: controller.signal
            });
        } catch (error) {
            if (isAbortError(error)) {
                throw this._buildRefreshError(
                    `OAuth refresh failed: timeout after ${timeoutMs}ms`,
                    { retryable: true, code: 'timeout' }
                );
            }

            throw this._buildRefreshError(
                `OAuth refresh failed: ${error.message}`,
                { retryable: true, code: 'network_error' }
            );
        } finally {
            clearTimeout(timeoutHandle);
        }

        const payloadText = await response.text();
        const payload = safeJsonParse(payloadText) || {};

        if (!response.ok) {
            const errorCode = payload.error || '';
            const errorDescription = payload.error_description || payload.error || `HTTP ${response.status}`;
            throw this._buildRefreshError(
                `OAuth refresh failed: ${errorDescription}`,
                {
                    status: response.status,
                    code: errorCode,
                    description: errorDescription,
                    retryable: this._shouldRetryRefresh(response.status, errorCode)
                }
            );
        }

        if (!payload.access_token) {
            throw this._buildRefreshError(
                'OAuth refresh failed: missing access_token in response',
                { retryable: false, code: 'missing_access_token' }
            );
        }

        return payload;
    }

    /**
     * Refresh the access token using refresh_token
     */
    async refreshAccessToken() {
        const creds = this._loadCredentials();
        const policy = this._resolveRefreshPolicy();
        console.log(`[OAuth] Refreshing access token (attempts=${policy.maxAttempts}, timeoutMs=${policy.timeoutMs})...`);

        let lastError = null;

        for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
            try {
                const data = await this._refreshOnce(creds, policy.timeoutMs);

                this.accessToken = data.access_token;
                const expiresIn = parsePositiveInt(data.expires_in, 3600);
                // Token typically expires in 3600 seconds, set expiry with 5 min buffer.
                this.tokenExpiry = Date.now() + ((Math.max(expiresIn - 300, 60)) * 1000);

                console.log('[OAuth] Access token refreshed successfully');
                return this.accessToken;
            } catch (error) {
                lastError = error;
                const canRetry = !!error.retryable && attempt < policy.maxAttempts;
                console.warn(`[OAuth] Refresh attempt ${attempt}/${policy.maxAttempts} failed: ${error.message}`);

                if (!canRetry) {
                    break;
                }

                const delayMs = this._refreshBackoff(attempt, policy.retryBaseMs);
                console.log(`[OAuth] Waiting ${delayMs}ms before retry...`);
                await this._sleep(delayMs);
            }
        }

        if (policy.allowManualFallback && creds.accessToken) {
            console.warn('[OAuth] Refresh failed; falling back to BLOGGER_ACCESS_TOKEN.');
            this.accessToken = creds.accessToken;
            this.tokenExpiry = Date.now() + (55 * 60 * 1000);
            return this.accessToken;
        }

        throw lastError || new Error('OAuth refresh failed: unknown error');
    }
}

// Singleton instance
const oauthManager = new OAuthManager();

module.exports = { oauthManager, OAuthManager };
