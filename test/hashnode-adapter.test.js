const test = require('node:test');
const assert = require('node:assert/strict');
const HashnodeAdapter = require('../adapters/HashnodeAdapter');

function createAdapter() {
    const adapter = new HashnodeAdapter({});
    adapter.authenticate = async () => true;
    return adapter;
}

test('Hashnode checkExists returns matching post by normalized title', async () => {
    const adapter = createAdapter();
    adapter._graphqlRequest = async () => ({
        publication: {
            posts: {
                edges: [
                    { node: { id: '1', title: '  System Design  ', slug: 'system-design', url: 'https://example.com/1' } },
                    { node: { id: '2', title: 'Other', slug: 'other', url: 'https://example.com/2' } }
                ],
                pageInfo: { hasNextPage: false, endCursor: null }
            }
        }
    });

    const found = await adapter.checkExists('system design');
    assert.ok(found);
    assert.equal(found.id, '1');
});

test('Hashnode checkExists paginates until it finds a match', async () => {
    const adapter = createAdapter();
    let callCount = 0;

    adapter._graphqlRequest = async (_query, variables) => {
        callCount += 1;
        if (!variables.after) {
            return {
                publication: {
                    posts: {
                        edges: [{ node: { id: '10', title: 'First Page', slug: 'first-page', url: 'https://example.com/10' } }],
                        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' }
                    }
                }
            };
        }

        return {
            publication: {
                posts: {
                    edges: [{ node: { id: '20', title: 'Target Post', slug: 'target-post', url: 'https://example.com/20' } }],
                    pageInfo: { hasNextPage: false, endCursor: null }
                }
            }
        };
    };

    const found = await adapter.checkExists('target post');
    assert.ok(found);
    assert.equal(found.id, '20');
    assert.equal(callCount, 2);
});

test('Hashnode checkExists returns null when no post matches', async () => {
    const adapter = createAdapter();
    adapter._graphqlRequest = async () => ({
        publication: {
            posts: {
                edges: [{ node: { id: '1', title: 'Different Title', slug: 'different', url: 'https://example.com/1' } }],
                pageInfo: { hasNextPage: false, endCursor: null }
            }
        }
    });

    const found = await adapter.checkExists('missing title');
    assert.equal(found, null);
});

test('Hashnode checkExists returns null on query failure', async () => {
    const adapter = createAdapter();
    adapter._graphqlRequest = async () => {
        throw new Error('network error');
    };

    const found = await adapter.checkExists('any title');
    assert.equal(found, null);
});
