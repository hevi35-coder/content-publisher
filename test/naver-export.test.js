const test = require('node:test');
const assert = require('node:assert/strict');
const {
    toNaverHtml,
    copyToClipboard,
    shouldUseSourceAsKoreanDraft
} = require('../scripts/export-naver');

test('toNaverHtml converts markdown headers and paragraphs', () => {
    const markdown = [
        '## 섹션 제목',
        '',
        '본문 문장입니다.'
    ].join('\n');

    const html = toNaverHtml(markdown);
    assert.match(html, /<h2 style="font-size:22px;[^"]*">섹션 제목<\/h2>/);
    assert.match(html, /<p style="margin:15px 0;line-height:1.8;">본문 문장입니다\.<\/p>/);
});

test('toNaverHtml converts bold and links to Naver-friendly HTML', () => {
    const markdown = '**강조** [공식 사이트](https://example.com)';
    const html = toNaverHtml(markdown);

    assert.match(html, /<b>강조<\/b>/);
    assert.match(
        html,
        /<a href="https:\/\/example\.com" style="color:#03c75a;text-decoration:underline;">공식 사이트<\/a>/
    );
});

test('toNaverHtml converts images to placeholders and lists to bullets', () => {
    const markdown = [
        '![커버](https://example.com/cover.png)',
        '',
        '- 첫 번째',
        '* 두 번째'
    ].join('\n');

    const html = toNaverHtml(markdown);
    assert.match(html, /📷 이미지: 커버/);
    assert.match(html, /• 첫 번째/);
    assert.match(html, /• 두 번째/);
});

test('toNaverHtml converts horizontal rules', () => {
    const markdown = '---';
    const html = toNaverHtml(markdown);

    assert.match(html, /<hr style="margin:30px 0;border:none;border-top:1px solid #e0e0e0;">/);
});

test('copyToClipboard skips non-darwin platforms', () => {
    let called = false;
    const result = copyToClipboard('hello', {
        platform: 'linux',
        run: () => {
            called = true;
            return { status: 0 };
        }
    });

    assert.equal(result, false);
    assert.equal(called, false);
});

test('copyToClipboard sends raw text to pbcopy on macOS', () => {
    let captured = null;
    const payload = 'dangerous "$(touch /tmp/x)" text';

    const result = copyToClipboard(payload, {
        platform: 'darwin',
        run: (cmd, options) => {
            captured = { cmd, options };
            return { status: 0 };
        }
    });

    assert.equal(result, true);
    assert.equal(captured.cmd, 'pbcopy');
    assert.equal(captured.options.input, payload);
    assert.equal(captured.options.encoding, 'utf8');
});

test('copyToClipboard returns false when pbcopy fails', () => {
    const result = copyToClipboard('hello', {
        platform: 'darwin',
        run: () => ({ status: 1 })
    });
    assert.equal(result, false);
});

test('shouldUseSourceAsKoreanDraft returns true for -ko draft paths', () => {
    const result = shouldUseSourceAsKoreanDraft(
        'drafts/2026-02-24-topic-ko.md',
        'English title',
        'English body'
    );
    assert.equal(result, true);
});

test('shouldUseSourceAsKoreanDraft returns true for Hangul title/content', () => {
    assert.equal(
        shouldUseSourceAsKoreanDraft('drafts/topic.md', '한국어 제목', 'English body'),
        true
    );
    assert.equal(
        shouldUseSourceAsKoreanDraft('drafts/topic.md', 'English title', '본문에 한글이 포함됨'),
        true
    );
});

test('shouldUseSourceAsKoreanDraft returns false for english-only source draft', () => {
    const result = shouldUseSourceAsKoreanDraft(
        'drafts/2026-02-24-topic.md',
        'English title',
        'English body only'
    );
    assert.equal(result, false);
});
