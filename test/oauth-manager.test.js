const test = require('node:test');
const assert = require('node:assert/strict');
const { OAuthManager } = require('../lib/oauth-manager');

function withEnv(vars, fn) {
    const previous = {};
    for (const [key, value] of Object.entries(vars)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    const finalize = () => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.finally(finalize);
        }
        finalize();
        return result;
    } catch (error) {
        finalize();
        throw error;
    }
}

function createJsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
            return JSON.stringify(payload);
        }
    };
}

test('oauth manager uses manual blogger access token when refresh flow is not configured', async () => {
    await withEnv(
        {
            BLOGGER_ACCESS_TOKEN: 'manual-token',
            BLOGGER_CLIENT_ID: undefined,
            BLOGGER_CLIENT_SECRET: undefined,
            BLOGGER_REFRESH_TOKEN: undefined
        },
        async () => {
            const manager = new OAuthManager();
            const originalFetch = global.fetch;
            global.fetch = async () => {
                throw new Error('fetch should not be called');
            };

            try {
                const token = await manager.getAccessToken();
                assert.equal(token, 'manual-token');
            } finally {
                global.fetch = originalFetch;
            }
        }
    );
});

test('oauth refresh retries transient timeout and succeeds', async () => {
    await withEnv(
        {
            BLOGGER_ACCESS_TOKEN: undefined,
            BLOGGER_CLIENT_ID: 'cid',
            BLOGGER_CLIENT_SECRET: 'csecret',
            BLOGGER_REFRESH_TOKEN: 'rtoken',
            BLOGGER_OAUTH_REFRESH_MAX_ATTEMPTS: '3',
            BLOGGER_OAUTH_REFRESH_RETRY_BASE_MS: '1',
            BLOGGER_OAUTH_REFRESH_TIMEOUT_MS: '500'
        },
        async () => {
            const manager = new OAuthManager();
            const originalFetch = global.fetch;
            let calls = 0;
            global.fetch = async () => {
                calls += 1;
                if (calls === 1) {
                    const err = new Error('aborted');
                    err.name = 'AbortError';
                    throw err;
                }
                return createJsonResponse(200, { access_token: 'fresh-token', expires_in: 3600 });
            };

            try {
                const token = await manager.getAccessToken();
                assert.equal(token, 'fresh-token');
                assert.equal(calls, 2);
            } finally {
                global.fetch = originalFetch;
            }
        }
    );
});

test('oauth refresh does not retry invalid_grant and throws immediately', async () => {
    await withEnv(
        {
            BLOGGER_ACCESS_TOKEN: undefined,
            BLOGGER_CLIENT_ID: 'cid',
            BLOGGER_CLIENT_SECRET: 'csecret',
            BLOGGER_REFRESH_TOKEN: 'rtoken',
            BLOGGER_OAUTH_REFRESH_MAX_ATTEMPTS: '4',
            BLOGGER_OAUTH_REFRESH_RETRY_BASE_MS: '1',
            BLOGGER_OAUTH_ALLOW_MANUAL_FALLBACK: 'false'
        },
        async () => {
            const manager = new OAuthManager();
            const originalFetch = global.fetch;
            let calls = 0;
            global.fetch = async () => {
                calls += 1;
                return createJsonResponse(400, {
                    error: 'invalid_grant',
                    error_description: 'Token has been expired or revoked.'
                });
            };

            try {
                await assert.rejects(
                    () => manager.getAccessToken(),
                    /expired or revoked/
                );
                assert.equal(calls, 1);
            } finally {
                global.fetch = originalFetch;
            }
        }
    );
});

test('oauth refresh can fallback to manual token when refresh fails and fallback is enabled', async () => {
    await withEnv(
        {
            BLOGGER_ACCESS_TOKEN: 'manual-fallback-token',
            BLOGGER_CLIENT_ID: 'cid',
            BLOGGER_CLIENT_SECRET: 'csecret',
            BLOGGER_REFRESH_TOKEN: 'rtoken',
            BLOGGER_OAUTH_REFRESH_MAX_ATTEMPTS: '2',
            BLOGGER_OAUTH_ALLOW_MANUAL_FALLBACK: 'true'
        },
        async () => {
            const manager = new OAuthManager();
            const originalFetch = global.fetch;
            global.fetch = async () =>
                createJsonResponse(400, {
                    error: 'invalid_grant',
                    error_description: 'Token has been expired or revoked.'
                });

            try {
                const token = await manager.getAccessToken();
                assert.equal(token, 'manual-fallback-token');
            } finally {
                global.fetch = originalFetch;
            }
        }
    );
});
