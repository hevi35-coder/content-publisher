const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveGitIdentity } = require('../lib/git-manager');

test('resolveGitIdentity keeps explicit git config values when present', () => {
    const identity = resolveGitIdentity({
        currentName: 'Configured Name',
        currentEmail: 'configured@example.com',
        env: {}
    });

    assert.equal(identity.name, 'Configured Name');
    assert.equal(identity.email, 'configured@example.com');
});

test('resolveGitIdentity falls back to environment overrides', () => {
    const identity = resolveGitIdentity({
        currentName: '',
        currentEmail: '',
        env: {
            GIT_USER_NAME: 'Env Name',
            GIT_USER_EMAIL: 'env@example.com'
        }
    });

    assert.equal(identity.name, 'Env Name');
    assert.equal(identity.email, 'env@example.com');
});

test('resolveGitIdentity returns project defaults when config and env are missing', () => {
    const identity = resolveGitIdentity({
        currentName: '',
        currentEmail: '',
        env: {}
    });

    assert.equal(identity.name, 'MandaAct Bot');
    assert.equal(identity.email, 'bot@mandaact.com');
});
