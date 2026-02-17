const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const DevtoAdapter = require('../adapters/DevtoAdapter');
const BloggerAdapter = require('../adapters/BloggerAdapter');
const { oauthManager } = require('../lib/oauth-manager');

function withEnv(key, value, fn) {
    const prev = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
        return fn();
    } finally {
        if (prev === undefined) delete process.env[key];
        else process.env[key] = prev;
    }
}

test('Dev.to checkExists throws on API error by default (fail-closed)', async () => {
    const originalGet = axios.get;
    axios.get = async () => {
        throw new Error('temporary api error');
    };

    const adapter = new DevtoAdapter({});
    try {
        await withEnv('CHECK_EXISTS_FAIL_OPEN', undefined, async () => {
            await assert.rejects(
                async () => adapter.checkExists('hello'),
                /\[Dev\.to\] checkExists failed: temporary api error/
            );
        });
    } finally {
        axios.get = originalGet;
    }
});

test('Dev.to checkExists returns null when fail-open is explicitly enabled', async () => {
    const originalGet = axios.get;
    axios.get = async () => {
        throw new Error('temporary api error');
    };

    const adapter = new DevtoAdapter({});
    try {
        await withEnv('CHECK_EXISTS_FAIL_OPEN', 'true', async () => {
            const result = await adapter.checkExists('hello');
            assert.equal(result, null);
        });
    } finally {
        axios.get = originalGet;
    }
});

test('Blogger checkExists throws on API error by default (fail-closed)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error('network down');
    };

    const adapter = new BloggerAdapter({});
    adapter.accessToken = 'token';
    try {
        await withEnv('CHECK_EXISTS_FAIL_OPEN', undefined, async () => {
            await assert.rejects(
                async () => adapter.checkExists('hello'),
                /\[Blogger\] checkExists failed: network down/
            );
        });
    } finally {
        global.fetch = originalFetch;
    }
});

test('Blogger checkExists returns null when fail-open is explicitly enabled', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error('network down');
    };

    const adapter = new BloggerAdapter({});
    adapter.accessToken = 'token';
    try {
        await withEnv('CHECK_EXISTS_FAIL_OPEN', 'true', async () => {
            const result = await adapter.checkExists('hello');
            assert.equal(result, null);
        });
    } finally {
        global.fetch = originalFetch;
    }
});

test('Blogger checkExists authenticates and uses bearer token when accessToken is missing', async () => {
    const originalFetch = global.fetch;
    const originalGetAccessToken = oauthManager.getAccessToken;
    const prevBlogId = process.env.BLOGGER_BLOG_ID;
    process.env.BLOGGER_BLOG_ID = 'blog-id';

    let authHeader = '';
    global.fetch = async (_url, options = {}) => {
        authHeader = options?.headers?.Authorization || '';
        return {
            ok: true,
            status: 200,
            json: async () => ({
                items: [{ id: '42', title: 'hello' }]
            })
        };
    };
    oauthManager.getAccessToken = async () => 'fresh-token';

    const adapter = new BloggerAdapter({});
    try {
        const result = await withEnv('CHECK_EXISTS_FAIL_OPEN', undefined, async () => {
            return adapter.checkExists('hello');
        });
        assert.equal(result.id, '42');
        assert.equal(authHeader, 'Bearer fresh-token');
    } finally {
        global.fetch = originalFetch;
        oauthManager.getAccessToken = originalGetAccessToken;
        if (prevBlogId === undefined) delete process.env.BLOGGER_BLOG_ID;
        else process.env.BLOGGER_BLOG_ID = prevBlogId;
    }
});
