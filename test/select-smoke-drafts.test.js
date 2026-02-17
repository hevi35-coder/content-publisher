const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { listDraftFiles, pickSmokeDrafts } = require('../scripts/select-smoke-drafts');

const SCRIPT_PATH = path.resolve(__dirname, '../scripts/select-smoke-drafts.js');

function mkTmpDraftDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'content-publisher-smoke-drafts-'));
}

function touch(dir, filename) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), '# draft', 'utf8');
}

function parseFilesBlock(output) {
    const marker = 'files<<EOF\n';
    const start = output.indexOf(marker);
    if (start === -1) return [];
    const rest = output.slice(start + marker.length);
    const end = rest.indexOf('\nEOF');
    const block = end === -1 ? rest : rest.slice(0, end);
    return block.split('\n').map((v) => v.trim()).filter(Boolean);
}

test('pickSmokeDrafts selects newest EN and KO drafts', () => {
    const files = [
        '2026-02-09-new-en.md',
        '2026-02-03-mid-en.md',
        '2026-02-10-new-ko-ko.md',
        '2026-02-03-mid-ko-ko.md'
    ];
    const selected = pickSmokeDrafts(files);
    assert.deepEqual(selected, ['drafts/2026-02-09-new-en.md', 'drafts/2026-02-10-new-ko-ko.md']);
});

test('listDraftFiles sorts markdown filenames descending', () => {
    const dir = mkTmpDraftDir();
    try {
        touch(dir, '2026-02-01-a.md');
        touch(dir, '2026-02-03-c.md');
        touch(dir, '2026-02-02-b.md');
        fs.writeFileSync(path.join(dir, 'ignore.txt'), 'x', 'utf8');

        const listed = listDraftFiles(dir);
        assert.deepEqual(listed, ['2026-02-03-c.md', '2026-02-02-b.md', '2026-02-01-a.md']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('script writes output with selected files', () => {
    const draftsDir = mkTmpDraftDir();
    const outFile = path.join(os.tmpdir(), `github-output-${Date.now()}-${Math.random()}.txt`);
    try {
        touch(draftsDir, '2026-02-10-english.md');
        touch(draftsDir, '2026-02-09-korean-ko.md');

        const result = spawnSync('node', [SCRIPT_PATH], {
            env: {
                ...process.env,
                DRAFTS_DIR: draftsDir,
                GITHUB_OUTPUT: outFile
            },
            encoding: 'utf8'
        });
        assert.equal(result.status, 0);

        const output = fs.readFileSync(outFile, 'utf8');
        assert.match(output, /has_files=true/);
        assert.match(output, /file_count=2/);
        assert.deepEqual(parseFilesBlock(output), [
            'drafts/2026-02-10-english.md',
            'drafts/2026-02-09-korean-ko.md'
        ]);
    } finally {
        fs.rmSync(draftsDir, { recursive: true, force: true });
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
});

test('script fails when draft directory has no markdown files', () => {
    const draftsDir = mkTmpDraftDir();
    try {
        const result = spawnSync('node', [SCRIPT_PATH], {
            env: {
                ...process.env,
                DRAFTS_DIR: draftsDir
            },
            encoding: 'utf8'
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /No draft markdown files found for smoke publish/);
    } finally {
        fs.rmSync(draftsDir, { recursive: true, force: true });
    }
});
