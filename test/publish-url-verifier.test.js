const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldVerifyPublishedUrls, verifyPublishedUrl } = require('../lib/publish-url-verifier');

function withEnv(vars, fn) {
    const prev = {};
    for (const [key, value] of Object.entries(vars)) {
        prev[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try {
        return fn();
    } finally {
        for (const [key, value] of Object.entries(prev)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

test('shouldVerifyPublishedUrls defaults to true', () => {
    withEnv({ DRY_RUN: undefined, VERIFY_PUBLISHED_URLS: undefined }, () => {
        assert.equal(shouldVerifyPublishedUrls(), true);
    });
});

test('shouldVerifyPublishedUrls is false in DRY_RUN', () => {
    withEnv({ DRY_RUN: 'true', VERIFY_PUBLISHED_URLS: undefined }, () => {
        assert.equal(shouldVerifyPublishedUrls(), false);
    });
});

test('shouldVerifyPublishedUrls respects VERIFY_PUBLISHED_URLS=false', () => {
    withEnv({ DRY_RUN: 'false', VERIFY_PUBLISHED_URLS: 'false' }, () => {
        assert.equal(shouldVerifyPublishedUrls(), false);
    });
});

test('verifyPublishedUrl returns true for 2xx/3xx status', async () => {
    const ok = await verifyPublishedUrl('https://example.com/post', {
        fetchImpl: async () => ({ status: 200 })
    });
    const redirect = await verifyPublishedUrl('https://example.com/post', {
        fetchImpl: async () => ({ status: 301 })
    });
    assert.equal(ok, true);
    assert.equal(redirect, true);
});

test('verifyPublishedUrl returns false for 4xx/5xx status', async () => {
    const bad = await verifyPublishedUrl('https://example.com/post', {
        fetchImpl: async () => ({ status: 404 })
    });
    assert.equal(bad, false);
});

test('verifyPublishedUrl returns false when fetch throws', async () => {
    const bad = await verifyPublishedUrl('https://example.com/post', {
        fetchImpl: async () => {
            throw new Error('network error');
        }
    });
    assert.equal(bad, false);
});

test('verifyPublishedUrl returns false for invalid url input', async () => {
    assert.equal(await verifyPublishedUrl(''), false);
    assert.equal(await verifyPublishedUrl('not-http://abc'), false);
});
