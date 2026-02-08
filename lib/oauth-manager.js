/**
 * OAuth Manager - Handles OAuth 2.0 token refresh for Google APIs
 * 
 * Supports automatic token refresh using refresh_token.
 * Required env vars: BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN
 */

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

    /**
     * Refresh the access token using refresh_token
     */
    async refreshAccessToken() {
        const creds = this._loadCredentials();
        console.log('[OAuth] Refreshing access token...');

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                refresh_token: creds.refreshToken,
                grant_type: 'refresh_token'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OAuth refresh failed: ${error.error_description || error.error}`);
        }

        const data = await response.json();

        this.accessToken = data.access_token;
        // Token typically expires in 3600 seconds, set expiry with 5 min buffer
        this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

        console.log('[OAuth] Access token refreshed successfully');
        return this.accessToken;
    }
}

// Singleton instance
const oauthManager = new OAuthManager();

module.exports = { oauthManager, OAuthManager };
