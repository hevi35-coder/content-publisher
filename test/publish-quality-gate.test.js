const test = require('node:test');
const assert = require('node:assert/strict');

const publishGate = require('../lib/publish-quality-gate');
const legacyGate = require('../lib/quality-gate');

test('publish-quality-gate passes valid adapted content', () => {
    const content = [
        '<p>This post explains a practical workflow for goal decomposition.</p>',
        '<p>It includes setup details, examples, and follow-up actions.</p>'
    ].join('\n');
    const result = publishGate.validateContent(content, 'A reasonable title');

    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.score, 100);
});

test('publish-quality-gate flags AI emojis and markdown leakage', () => {
    const content = '🚀 **Bold** text should be converted before publish and cleaned.';
    const result = publishGate.validateContent(content, 'A reasonable title');

    assert.equal(result.passed, false);
    assert.match(result.issues.join(' | '), /AI emoji found:/);
    assert.match(result.issues.join(' | '), /Unconverted bold markdown found/);
});

test('publish-quality-gate flags broken image references', () => {
    const content = '<img src="https://example.com/undefined-image.png" alt="broken" />';
    const result = publishGate.validateContent(content, 'A reasonable title');

    assert.equal(result.passed, false);
    assert.match(result.issues.join(' | '), /Broken image reference/);
});

test('publish-quality-gate flags editorial note leakage', () => {
    const content = [
        '<p>본문 내용입니다.</p>',
        '<h3>Changes Made:</h3>',
        '<p>1. remove hallucination text</p>'
    ].join('\n');
    const result = publishGate.validateContent(content, 'A reasonable title');

    assert.equal(result.passed, false);
    assert.match(result.issues.join(' | '), /Editorial notes leak detected/i);
});

test('legacy quality-gate shim keeps compatibility', () => {
    const content = '<p>Compatibility path for existing imports.</p>'.repeat(4);
    const title = 'Compatibility check title';

    const nextResult = publishGate.validateContent(content, title);
    const legacyResult = legacyGate.validateContent(content, title);

    assert.deepEqual(legacyResult, nextResult);
});
