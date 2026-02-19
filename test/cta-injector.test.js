const test = require('node:test');
const assert = require('node:assert/strict');
const { getCTA, injectCTA, hasCTA } = require('../lib/cta-injector');

test('blogger CTA includes app store and website links', () => {
    const cta = getCTA('blogger_kr', 'ko');
    assert.match(cta, /apps\.apple\.com/i);
    assert.match(cta, /mandaact\.vercel\.app/i);
});

test('injectCTA appends website-only footer when app store link exists without website', () => {
    const source = [
        '---',
        'title: "sample"',
        '---',
        '',
        '본문 내용',
        '',
        '앱 다운로드: https://apps.apple.com/kr/app/mandaact/id6756198473'
    ].join('\n');

    const injected = injectCTA(source, 'blogger_kr', { lang: 'ko' });
    assert.match(injected, /mandaact\.vercel\.app/i);
});

test('injectCTA skips when both app and website links already exist', () => {
    const source = [
        '---',
        'title: "sample"',
        '---',
        '',
        '본문 내용',
        '',
        '앱 다운로드: https://apps.apple.com/app/mandaact/id6756198473',
        '웹사이트: https://mandaact.vercel.app'
    ].join('\n');

    const injected = injectCTA(source, 'devto', { lang: 'en' });
    assert.equal(injected, source);
});

test('hasCTA requires both app store and website links for supported channels', () => {
    const onlyApp = 'Download: https://apps.apple.com/app/mandaact/id6756198473';
    const appAndSite = `${onlyApp}\nhttps://mandaact.vercel.app`;

    assert.equal(hasCTA(onlyApp, 'blogger_kr'), false);
    assert.equal(hasCTA(appAndSite, 'blogger_kr'), true);
});

