const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldAutoSyncQueue } = require('../select_topic');

test('shouldAutoSyncQueue is disabled by default', () => {
    assert.equal(shouldAutoSyncQueue({}), false);
    assert.equal(shouldAutoSyncQueue({ AUTO_SYNC_QUEUE: '' }), false);
});

test('shouldAutoSyncQueue enables only for explicit true', () => {
    assert.equal(shouldAutoSyncQueue({ AUTO_SYNC_QUEUE: 'true' }), true);
    assert.equal(shouldAutoSyncQueue({ AUTO_SYNC_QUEUE: 'TRUE' }), true);
});

test('shouldAutoSyncQueue rejects non-true values', () => {
    assert.equal(shouldAutoSyncQueue({ AUTO_SYNC_QUEUE: 'false' }), false);
    assert.equal(shouldAutoSyncQueue({ AUTO_SYNC_QUEUE: '1' }), false);
    assert.equal(shouldAutoSyncQueue({ AUTO_SYNC_QUEUE: 'yes' }), false);
});
