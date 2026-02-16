const test = require('node:test');
const assert = require('node:assert/strict');

const { pushToMain } = require('../lib/git-manager');

test('pushToMain skips git side effects when DRY_RUN=true', () => {
    const previous = process.env.DRY_RUN;
    process.env.DRY_RUN = 'true';

    try {
        const result = pushToMain('assets/images/covers/', 'test commit message');
        assert.equal(result, true);
    } finally {
        if (previous === undefined) {
            delete process.env.DRY_RUN;
        } else {
            process.env.DRY_RUN = previous;
        }
    }
});
