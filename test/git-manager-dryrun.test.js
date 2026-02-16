const test = require('node:test');
const assert = require('node:assert/strict');

const {
    pushToMain,
    shouldRequireGitSyncSuccess,
    isMainPushContext,
    getMainPushArgs
} = require('../lib/git-manager');

function withEnv(overrides, fn) {
    const previous = {
        DRY_RUN: process.env.DRY_RUN,
        CI: process.env.CI,
        STRICT_GIT_SYNC: process.env.STRICT_GIT_SYNC,
        GITHUB_REF: process.env.GITHUB_REF,
        GITHUB_REF_NAME: process.env.GITHUB_REF_NAME
    };

    Object.assign(process.env, overrides);

    try {
        fn();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test('pushToMain skips git side effects when DRY_RUN=true', () => {
    withEnv({ DRY_RUN: 'true' }, () => {
        const result = pushToMain('assets/images/covers/', 'test commit message');
        assert.equal(result, true);
    });
});

test('shouldRequireGitSyncSuccess defaults to false', () => {
    withEnv({ DRY_RUN: '', CI: '', STRICT_GIT_SYNC: '' }, () => {
        assert.equal(shouldRequireGitSyncSuccess(), false);
    });
});

test('shouldRequireGitSyncSuccess is false during DRY_RUN even in CI', () => {
    withEnv({ DRY_RUN: 'true', CI: 'true', STRICT_GIT_SYNC: 'true' }, () => {
        assert.equal(shouldRequireGitSyncSuccess(), false);
    });
});

test('shouldRequireGitSyncSuccess is true in CI mode', () => {
    withEnv({ DRY_RUN: 'false', CI: 'true', STRICT_GIT_SYNC: '' }, () => {
        assert.equal(shouldRequireGitSyncSuccess(), true);
    });
});

test('shouldRequireGitSyncSuccess is true with STRICT_GIT_SYNC override', () => {
    withEnv({ DRY_RUN: 'false', CI: '', STRICT_GIT_SYNC: 'true' }, () => {
        assert.equal(shouldRequireGitSyncSuccess(), true);
    });
});

test('isMainPushContext allows direct main branch pushes', () => {
    withEnv({ CI: '', GITHUB_REF: '', GITHUB_REF_NAME: '' }, () => {
        assert.equal(isMainPushContext('main'), true);
    });
});

test('isMainPushContext blocks non-main local branches', () => {
    withEnv({ CI: '', GITHUB_REF: '', GITHUB_REF_NAME: '' }, () => {
        assert.equal(isMainPushContext('codex/topic-branch'), false);
    });
});

test('isMainPushContext allows detached CI runs targeting main via GITHUB_REF', () => {
    withEnv({ CI: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: '' }, () => {
        assert.equal(isMainPushContext('HEAD'), true);
    });
});

test('isMainPushContext allows detached CI runs targeting main via GITHUB_REF_NAME', () => {
    withEnv({ CI: 'true', GITHUB_REF: '', GITHUB_REF_NAME: 'main' }, () => {
        assert.equal(isMainPushContext('HEAD'), true);
    });
});

test('isMainPushContext blocks detached CI runs for pull requests', () => {
    withEnv({ CI: 'true', GITHUB_REF: 'refs/pull/123/merge', GITHUB_REF_NAME: '' }, () => {
        assert.equal(isMainPushContext('HEAD'), false);
    });
});

test('getMainPushArgs pushes current HEAD to main', () => {
    assert.deepEqual(getMainPushArgs(), ['push', 'origin', 'HEAD:main']);
});

test('getMainPushArgs normalizes custom branch names', () => {
    assert.deepEqual(getMainPushArgs(' release '), ['push', 'origin', 'HEAD:release']);
});
