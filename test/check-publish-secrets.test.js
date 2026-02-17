const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, '../scripts/check-publish-secrets.js');

function runCheck(envOverrides = {}) {
    const result = spawnSync('node', [SCRIPT_PATH], {
        env: {
            ...process.env,
            ...envOverrides
        },
        encoding: 'utf8'
    });
    return result;
}

function createDraftFile(fileName, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-preflight-'));
    const filePath = path.join(dir, fileName);
    const title = options.title ?? 'Sample Title';
    const body = options.body ?? 'A'.repeat(200);
    const frontmatter = title ? `---\ntitle: ${title}\n---\n\n` : `---\n---\n\n`;
    fs.writeFileSync(filePath, `${frontmatter}${body}\n`, 'utf8');
    return { dir, filePath };
}

function cleanupDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test('passes when dry-run is enabled even without secrets', () => {
    const fixture = createDraftFile('sample.md');
    try {
        const result = runCheck({
            DRY_RUN: 'true',
            TARGET_FILES: fixture.filePath
        });
        assert.equal(result.status, 0);
        assert.match(result.stdout, /DRY_RUN=true/);
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('fails for english draft when devto/hashnode secrets are missing', () => {
    const fixture = createDraftFile('sample.md');
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            DEVTO_API_KEY: '',
            HASHNODE_PAT: '',
            HASHNODE_PUBLICATION_ID: ''
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing required publish secrets/);
        assert.match(result.stderr, /DEVTO_API_KEY/);
        assert.match(result.stderr, /HASHNODE_PAT/);
        assert.match(result.stderr, /HASHNODE_PUBLICATION_ID/);
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('passes for korean draft with manual blogger access token', () => {
    const fixture = createDraftFile('sample-ko.md');
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            BLOGGER_BLOG_ID: 'blog-id',
            BLOGGER_ACCESS_TOKEN: 'token'
        });
        assert.equal(result.status, 0);
        assert.match(result.stdout, /KO\(blogger\)/);
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('fails for korean draft when blogger token configuration is missing', () => {
    const fixture = createDraftFile('sample-ko.md');
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            BLOGGER_BLOG_ID: 'blog-id',
            BLOGGER_ACCESS_TOKEN: '',
            BLOGGER_CLIENT_ID: '',
            BLOGGER_CLIENT_SECRET: '',
            BLOGGER_REFRESH_TOKEN: ''
        });
        assert.equal(result.status, 1);
        assert.match(
            result.stderr,
            /BLOGGER_ACCESS_TOKEN or \(BLOGGER_CLIENT_ID \+ BLOGGER_CLIENT_SECRET \+ BLOGGER_REFRESH_TOKEN\)/
        );
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('fails when target draft file does not exist', () => {
    const result = runCheck({
        DRY_RUN: 'false',
        TARGET_FILES: '/tmp/does-not-exist.md',
        DEVTO_API_KEY: 'x',
        HASHNODE_PAT: 'y',
        HASHNODE_PUBLICATION_ID: 'z'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Draft file not found/);
});

test('fails when draft frontmatter title is missing', () => {
    const fixture = createDraftFile('sample.md', { title: '' });
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            DEVTO_API_KEY: 'x',
            HASHNODE_PAT: 'y',
            HASHNODE_PUBLICATION_ID: 'z'
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing frontmatter title/);
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('fails when draft body is too short', () => {
    const fixture = createDraftFile('sample.md', { body: 'short' });
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            DEVTO_API_KEY: 'x',
            HASHNODE_PAT: 'y',
            HASHNODE_PUBLICATION_ID: 'z'
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Draft body is too short/);
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('honors MIN_DRAFT_BODY_CHARS override', () => {
    const fixture = createDraftFile('sample.md', { body: 'A'.repeat(80) });
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            MIN_DRAFT_BODY_CHARS: '60',
            DEVTO_API_KEY: 'x',
            HASHNODE_PAT: 'y',
            HASHNODE_PUBLICATION_ID: 'z'
        });
        assert.equal(result.status, 0);
    } finally {
        cleanupDir(fixture.dir);
    }
});

test('fails when MIN_DRAFT_BODY_CHARS is invalid', () => {
    const fixture = createDraftFile('sample.md');
    try {
        const result = runCheck({
            DRY_RUN: 'false',
            TARGET_FILES: fixture.filePath,
            MIN_DRAFT_BODY_CHARS: 'abc',
            DEVTO_API_KEY: 'x',
            HASHNODE_PAT: 'y',
            HASHNODE_PUBLICATION_ID: 'z'
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /MIN_DRAFT_BODY_CHARS must be a positive integer/);
    } finally {
        cleanupDir(fixture.dir);
    }
});
