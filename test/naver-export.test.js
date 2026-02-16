const test = require('node:test');
const assert = require('node:assert/strict');
const { toNaverHtml } = require('../scripts/export-naver');

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
