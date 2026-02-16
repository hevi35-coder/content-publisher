const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

function makeDraftFile(filename, title) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-publisher-test-'));
    const filePath = path.join(tmpDir, filename);
    const content = [
        '---',
        `title: "${title}"`,
        'tags: [test]',
        'cover_image: "../assets/images/covers/test-cover.png"',
        '---',
        '',
        'Test body'
    ].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    return { tmpDir, filePath };
}

function runPublishCli(filePath, platformArg) {
    const args = ['publish.js', filePath];
    if (platformArg) args.push(platformArg);
    return execFileSync(process.execPath, args, {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            DRY_RUN: 'true'
        },
        encoding: 'utf8'
    });
}

function runPublishCliExpectFailure(filePath, platformArg) {
    try {
        runPublishCli(filePath, platformArg);
        assert.fail('Expected publish CLI to fail');
    } catch (error) {
        return `${error.stdout || ''}\n${error.stderr || ''}`;
    }
}

test('CLI routes English draft to devto+hashnode in dry-run mode', () => {
    const { tmpDir, filePath } = makeDraftFile('sample.md', 'English Routing Test');
    try {
        const output = runPublishCli(filePath);
        assert.match(output, /Platforms:\s*devto,\s*hashnode/);
        assert.match(output, /Publishing to DEVTO/);
        assert.match(output, /Publishing to HASHNODE/);
        assert.match(output, /\[DRY_RUN\]/);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('CLI routes Korean draft to blogger in dry-run mode', () => {
    const { tmpDir, filePath } = makeDraftFile('sample-ko.md', 'Korean Routing Test');
    try {
        const output = runPublishCli(filePath);
        assert.match(output, /Platforms:\s*blogger/);
        assert.match(output, /Publishing to BLOGGER/);
        assert.match(output, /\[DRY_RUN\]/);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('CLI rejects unsupported override platforms', () => {
    const { tmpDir, filePath } = makeDraftFile('sample.md', 'Invalid Platform Routing Test');
    try {
        const output = runPublishCliExpectFailure(filePath, 'devto,naver');
        assert.match(output, /Unsupported platforms: naver/);
        assert.doesNotMatch(output, /Publishing to DEVTO/);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
