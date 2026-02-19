const test = require('node:test');
const assert = require('node:assert/strict');
const {
    sanitizeDraftBodyContent,
    sanitizeDraftMarkdownContent,
    containsEditorialNotes
} = require('../lib/draft-cleaner');

test('sanitizeDraftMarkdownContent removes trailing "Changes Made" section and dangling fence', () => {
    const source = [
        '---',
        'title: "Sample"',
        'published: false',
        '---',
        '',
        '본문 시작',
        '마무리 문장',
        '```',
        '',
        '### Changes Made:',
        '1. removed hallucinations',
        '2. aligned with context'
    ].join('\n');

    const cleaned = sanitizeDraftMarkdownContent(source);

    assert.match(cleaned, /^---\n[\s\S]*\n---\n/);
    assert.doesNotMatch(cleaned, /Changes Made/i);
    assert.doesNotMatch(cleaned, /\n```\s*$/m);
    assert.match(cleaned, /마무리 문장/);
});

test('sanitizeDraftBodyContent keeps normal article code blocks', () => {
    const source = [
        '문서 시작',
        '```js',
        'console.log("hello");',
        '```',
        '문서 끝'
    ].join('\n');

    const cleaned = sanitizeDraftBodyContent(source);
    assert.match(cleaned, /```js/);
    assert.match(cleaned, /console\.log\("hello"\)/);
    assert.match(cleaned, /문서 끝/);
});

test('containsEditorialNotes detects trailing editorial leakage', () => {
    const source = [
        '문서 시작',
        '본문',
        '',
        '### Changes Made:',
        '1. fixed this'
    ].join('\n');

    assert.equal(containsEditorialNotes(source), true);
    assert.equal(containsEditorialNotes('정상 본문만 있는 문서'), false);
});

