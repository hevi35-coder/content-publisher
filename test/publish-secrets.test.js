const test = require('node:test');
const assert = require('node:assert/strict');

const { validateRouteSecrets } = require('../publish');

const ENV_KEYS = [
    'DEVTO_API_KEY',
    'HASHNODE_PAT',
    'HASHNODE_PUBLICATION_ID',
    'BLOGGER_BLOG_ID',
    'BLOGGER_ACCESS_TOKEN',
    'BLOGGER_CLIENT_ID',
    'BLOGGER_CLIENT_SECRET',
    'BLOGGER_REFRESH_TOKEN'
];

function withEnv(overrides, fn) {
    const snapshot = {};
    for (const key of ENV_KEYS) {
        snapshot[key] = process.env[key];
        delete process.env[key];
    }

    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === null) {
            delete process.env[key];
        } else {
            process.env[key] = String(value);
        }
    }

    try {
        fn();
    } finally {
        for (const key of ENV_KEYS) {
            if (snapshot[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = snapshot[key];
            }
        }
    }
}

test('validateRouteSecrets requires DEVTO_API_KEY for devto', () => {
    withEnv({}, () => {
        assert.throws(
            () => validateRouteSecrets(['devto']),
            /DEVTO_API_KEY/
        );
    });
});

test('validateRouteSecrets requires hashnode credentials for hashnode', () => {
    withEnv({}, () => {
        assert.throws(
            () => validateRouteSecrets(['hashnode']),
            /HASHNODE_PAT|HASHNODE_PUBLICATION_ID/
        );
    });
});

test('validateRouteSecrets accepts blogger with manual access token', () => {
    withEnv(
        {
            BLOGGER_BLOG_ID: 'blog-id',
            BLOGGER_ACCESS_TOKEN: 'manual-token'
        },
        () => {
            assert.doesNotThrow(() => validateRouteSecrets(['blogger']));
        }
    );
});

test('validateRouteSecrets accepts blogger with refresh-token flow', () => {
    withEnv(
        {
            BLOGGER_BLOG_ID: 'blog-id',
            BLOGGER_CLIENT_ID: 'client-id',
            BLOGGER_CLIENT_SECRET: 'client-secret',
            BLOGGER_REFRESH_TOKEN: 'refresh-token'
        },
        () => {
            assert.doesNotThrow(() => validateRouteSecrets(['blogger']));
        }
    );
});

test('validateRouteSecrets rejects blogger when auth path is incomplete', () => {
    withEnv(
        {
            BLOGGER_BLOG_ID: 'blog-id'
        },
        () => {
            assert.throws(
                () => validateRouteSecrets(['blogger']),
                /BLOGGER_ACCESS_TOKEN|BLOGGER_CLIENT_ID/
            );
        }
    );
});

test('validateRouteSecrets passes for combined EN route when all secrets exist', () => {
    withEnv(
        {
            DEVTO_API_KEY: 'devto-key',
            HASHNODE_PAT: 'hashnode-pat',
            HASHNODE_PUBLICATION_ID: 'hashnode-publication-id'
        },
        () => {
            assert.doesNotThrow(() => validateRouteSecrets(['devto', 'hashnode']));
        }
    );
});
