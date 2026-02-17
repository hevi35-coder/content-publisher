const test = require('node:test');
const assert = require('node:assert/strict');
const {
    shouldForcePublish,
    resolveDevtoPublished,
    resolveBloggerIsDraft
} = require('../lib/publish-visibility');

test('default behavior forces public publish', () => {
    const prev = process.env.FORCE_PUBLISH;
    try {
        delete process.env.FORCE_PUBLISH;
        assert.equal(shouldForcePublish(), true);
        assert.equal(resolveDevtoPublished({ published: false }), true);
        assert.equal(resolveBloggerIsDraft({ published: false }), false);
    } finally {
        if (prev === undefined) delete process.env.FORCE_PUBLISH;
        else process.env.FORCE_PUBLISH = prev;
    }
});

test('FORCE_PUBLISH=false respects frontmatter draft flag', () => {
    const prev = process.env.FORCE_PUBLISH;
    try {
        process.env.FORCE_PUBLISH = 'false';
        assert.equal(shouldForcePublish(), false);
        assert.equal(resolveDevtoPublished({ published: false }), false);
        assert.equal(resolveBloggerIsDraft({ published: false }), true);
    } finally {
        if (prev === undefined) delete process.env.FORCE_PUBLISH;
        else process.env.FORCE_PUBLISH = prev;
    }
});

test('FORCE_PUBLISH=false keeps default public when frontmatter is unspecified', () => {
    const prev = process.env.FORCE_PUBLISH;
    try {
        process.env.FORCE_PUBLISH = 'false';
        assert.equal(resolveDevtoPublished({}), true);
        assert.equal(resolveBloggerIsDraft({}), false);
    } finally {
        if (prev === undefined) delete process.env.FORCE_PUBLISH;
        else process.env.FORCE_PUBLISH = prev;
    }
});
