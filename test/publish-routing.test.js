const test = require('node:test');
const assert = require('node:assert/strict');

const { detectDefaultPlatforms, parsePlatformArg } = require('../publish');
const { getDefaultPlatformsFromDraftPath } = require('../lib/publisher');
const { assertSupportedPlatforms } = require('../lib/platform-routing');

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
    assert.deepEqual(parsePlatformArg('devto, DEVTO, hashnode'), ['devto', 'hashnode']);
    assert.equal(parsePlatformArg('  ,  '), null);
    assert.equal(parsePlatformArg(''), null);
    assert.equal(parsePlatformArg(null), null);
});

test('assertSupportedPlatforms rejects unknown platforms', () => {
    assert.throws(
        () => assertSupportedPlatforms(['devto', 'naver']),
        /Unsupported platforms: naver/
    );
});
