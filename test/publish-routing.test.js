const test = require('node:test');
const assert = require('node:assert/strict');

const { detectDefaultPlatforms, parsePlatformArg } = require('../publish');
const { getDefaultPlatformsFromDraftPath } = require('../lib/publisher');

test('detectDefaultPlatforms routes Korean drafts to blogger', () => {
    assert.deepEqual(detectDefaultPlatforms('/tmp/sample-ko.md'), ['blogger']);
});

test('detectDefaultPlatforms routes English drafts to devto and hashnode', () => {
    assert.deepEqual(detectDefaultPlatforms('/tmp/sample.md'), ['devto', 'hashnode']);
});

test('getDefaultPlatformsFromDraftPath applies the same routing rule', () => {
    assert.deepEqual(getDefaultPlatformsFromDraftPath('/tmp/post-ko.md'), ['blogger']);
    assert.deepEqual(getDefaultPlatformsFromDraftPath('/tmp/post.md'), ['devto', 'hashnode']);
});

test('parsePlatformArg normalizes and trims values', () => {
    assert.deepEqual(parsePlatformArg(' DEVTO, hashnode ,BLOGGER '), ['devto', 'hashnode', 'blogger']);
    assert.equal(parsePlatformArg('  ,  '), null);
    assert.equal(parsePlatformArg(''), null);
    assert.equal(parsePlatformArg(null), null);
});
