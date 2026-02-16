const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    checkQuality,
    detectContentLanguage,
    countWords,
    calculateReadability
} = require('../draft-quality-gate');
const legacyGate = require('../quality_gate');

function createDraftFile({ filename, title, tags, content, coverImage = true, profile }) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gate-test-'));
    const filePath = path.join(tmpDir, filename);
    const lines = [
        '---',
        `title: "${title}"`,
        `tags: [${tags.join(', ')}]`,
        profile ? `profile: "${profile}"` : '',
        coverImage ? 'cover_image: "../assets/images/covers/test-cover.png"' : '',
        '---',
        '',
        content
    ].filter(Boolean);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return { tmpDir, filePath };
}

function getCheck(report, name) {
    const check = report.checks.find((item) => item.name === name);
    assert.ok(check, `Expected quality check "${name}" to exist`);
    return check;
}

test('detectContentLanguage uses filename suffix and content heuristics', () => {
    assert.equal(detectContentLanguage('English content only', '/tmp/post.md'), 'en');
    assert.equal(detectContentLanguage('한국어 문장입니다', '/tmp/post.md'), 'ko');
    assert.equal(detectContentLanguage('English content only', '/tmp/post-ko.md'), 'ko');
});

test('countWords and readability are language-aware for Korean content', () => {
    const koreanContent = '이 문서는 실행 전략과 목표 분해 과정을 설명합니다.';
    assert.ok(countWords(koreanContent, 'ko') > 0);

    const readability = calculateReadability(koreanContent, 'ko');
    assert.equal(readability.supported, false);
    assert.ok(readability.words > 0);
});

test('checkQuality skips English readability scoring for Korean draft and detects Korean CTA', () => {
    const sentence = '이 글은 목표 관리 방법을 설명합니다. 앱스토어에서 다운로드해 지금 시작해보세요.';
    const content = Array.from({ length: 150 }, () => sentence).join(' ');
    const { tmpDir, filePath } = createDraftFile({
        filename: 'sample-ko.md',
        title: '한국어 품질 게이트 검증을 위한 샘플 제목입니다',
        tags: ['생산성', '개발자', '습관'],
        content
    });

    try {
        const report = checkQuality(filePath);
        assert.equal(report.language, 'ko');
        assert.equal(report.profileId, 'blogger_kr');

        const readabilityCheck = getCheck(report, 'Readability');
        assert.equal(readabilityCheck.status, 'ℹ️');

        const ctaCheck = getCheck(report, 'Call to Action');
        assert.equal(ctaCheck.status, '✅');

        const wordCountCheck = getCheck(report, 'Word Count');
        assert.doesNotMatch(wordCountCheck.message, /^0 words/);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('checkQuality enforces channel-specific tag limits', () => {
    const sentence = 'This guide explains execution strategy and decomposition. Download it from the App Store to get started today.';
    const content = Array.from({ length: 140 }, () => sentence).join(' ');
    const tags = ['productivity', 'developers', 'career', 'focus', 'growth'];
    const { tmpDir, filePath } = createDraftFile({
        filename: 'sample.md',
        title: 'English quality gate sample title for profile-aware tag checks',
        tags,
        content
    });

    try {
        const hashnodeReport = checkQuality(filePath, { profileId: 'hashnode' });
        assert.equal(hashnodeReport.profileId, 'hashnode');
        assert.equal(getCheck(hashnodeReport, 'Tags').status, '✅');

        const devtoReport = checkQuality(filePath, { profileId: 'devto' });
        assert.equal(devtoReport.profileId, 'devto');
        assert.equal(getCheck(devtoReport, 'Tags').status, '⚠️');
        assert.match(getCheck(devtoReport, 'Tags').message, /devto allows max 4\./i);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('checkQuality throws on invalid explicit profile by default', () => {
    const sentence = 'This article explains how to plan and execute effectively. Download to get started.';
    const content = Array.from({ length: 120 }, () => sentence).join(' ');
    const { tmpDir, filePath } = createDraftFile({
        filename: 'sample.md',
        title: 'Profile validation should fail fast on invalid override',
        tags: ['productivity', 'developers', 'career'],
        content
    });

    try {
        assert.throws(
            () => checkQuality(filePath, { profileId: 'unknown_profile' }),
            /Invalid quality profile "unknown_profile"/
        );
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('checkQuality can fallback when strictProfile is disabled', () => {
    const sentence = 'This article explains how to plan and execute effectively. Download to get started.';
    const content = Array.from({ length: 120 }, () => sentence).join(' ');
    const { tmpDir, filePath } = createDraftFile({
        filename: 'sample.md',
        title: 'Optional fallback path for non-strict profile mode',
        tags: ['productivity', 'developers', 'career'],
        profile: 'unknown_profile',
        content
    });

    try {
        const report = checkQuality(filePath, { strictProfile: false });
        assert.equal(report.profileId, 'devto');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('legacy quality_gate shim keeps API compatibility', () => {
    assert.equal(legacyGate.checkQuality, checkQuality);
    assert.equal(legacyGate.detectContentLanguage, detectContentLanguage);
});

test('legacy quality_gate shim keeps CLI usage output', () => {
    try {
        execFileSync(process.execPath, ['quality_gate.js'], {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8'
        });
        assert.fail('Expected quality_gate.js to exit with usage');
    } catch (error) {
        const output = `${error.stdout || ''}\n${error.stderr || ''}`;
        assert.match(output, /Usage: node quality_gate\.js/);
        assert.match(output, /Alias of: node draft-quality-gate\.js/);
    }
});
