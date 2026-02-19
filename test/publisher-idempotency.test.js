const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isUncertainPublishError,
    recoverHashnodeExistingPost
} = require('../lib/publisher');

test('isUncertainPublishError classifies timeout/network style failures', () => {
    assert.equal(isUncertainPublishError(new Error('Timeout after 60000ms')), true);
    assert.equal(isUncertainPublishError(new Error('fetch failed: socket hang up')), true);
    assert.equal(isUncertainPublishError(new Error('ECONNRESET while publishing')), true);
    assert.equal(isUncertainPublishError(new Error('GraphQL Error: invalid input')), false);
});

test('recoverHashnodeExistingPost returns match when post appears after short delay', async () => {
    let checks = 0;
    const adapter = {
        checkExists: async () => {
            checks += 1;
            if (checks < 3) {
                return null;
            }
            return { id: 'post-1', slug: 'hello-world', url: 'https://hashnode.example/hello-world' };
        }
    };

    const recovered = await recoverHashnodeExistingPost(adapter, 'Hello World', {
        attempts: 4,
        delayMs: 1
    });

    assert.equal(recovered.id, 'post-1');
    assert.equal(checks, 3);
});

test('recoverHashnodeExistingPost tolerates transient check errors and continues', async () => {
    let checks = 0;
    const adapter = {
        checkExists: async () => {
            checks += 1;
            if (checks === 1) {
                throw new Error('temporary api error');
            }
            return { id: 'post-2', slug: 'stable-post', url: 'https://hashnode.example/stable-post' };
        }
    };

    const recovered = await recoverHashnodeExistingPost(adapter, 'Stable Post', {
        attempts: 3,
        delayMs: 1
    });

    assert.equal(recovered.id, 'post-2');
    assert.equal(checks, 2);
});

test('recoverHashnodeExistingPost returns null when no post is found', async () => {
    let checks = 0;
    const adapter = {
        checkExists: async () => {
            checks += 1;
            return null;
        }
    };

    const recovered = await recoverHashnodeExistingPost(adapter, 'Missing', {
        attempts: 3,
        delayMs: 1
    });

    assert.equal(recovered, null);
    assert.equal(checks, 3);
});
