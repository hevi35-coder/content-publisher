const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldAutoSyncQueue, syncQueueToMain } = require('../select_topic');

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

test('syncQueueToMain skips sync when auto-sync is disabled', () => {
    let called = false;
    const result = syncQueueToMain('/tmp/TOPIC_QUEUE.md', { AUTO_SYNC_QUEUE: 'false' }, () => {
        called = true;
        return true;
    });

    assert.equal(result, false);
    assert.equal(called, false);
});

test('syncQueueToMain triggers git sync when AUTO_SYNC_QUEUE=true', () => {
    let captured = null;
    const result = syncQueueToMain('/tmp/TOPIC_QUEUE.md', { AUTO_SYNC_QUEUE: 'true' }, (path, message) => {
        captured = { path, message };
        return true;
    });

    assert.equal(result, true);
    assert.deepEqual(captured, {
        path: '/tmp/TOPIC_QUEUE.md',
        message: 'chore: auto-update topic queue (Committee)'
    });
});

test('syncQueueToMain returns false when git sync fails', () => {
    const result = syncQueueToMain('/tmp/TOPIC_QUEUE.md', { AUTO_SYNC_QUEUE: 'true' }, () => false);
    assert.equal(result, false);
});

test('syncQueueToMain handles sync function errors safely', () => {
    const result = syncQueueToMain('/tmp/TOPIC_QUEUE.md', { AUTO_SYNC_QUEUE: 'true' }, () => {
        throw new Error('boom');
    });
    assert.equal(result, false);
});
