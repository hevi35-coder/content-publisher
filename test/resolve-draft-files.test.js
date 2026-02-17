const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, '../scripts/resolve-draft-files.js');

function git(cwd, args) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

function writeFile(repoDir, relativePath, content) {
    const fullPath = path.join(repoDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
}

function setupRepo() {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-publisher-resolve-'));
    git(repoDir, ['init', '-q']);
    git(repoDir, ['config', 'user.name', 'Test Bot']);
    git(repoDir, ['config', 'user.email', 'test@example.com']);
    return repoDir;
}

function commitAll(repoDir, message) {
    git(repoDir, ['add', '.']);
    git(repoDir, ['commit', '-m', message, '--quiet']);
    return git(repoDir, ['rev-parse', 'HEAD']);
}

function runResolver(repoDir, envOverrides = {}) {
    const outputPath = path.join(repoDir, `.github-output-${Date.now()}-${Math.random()}.txt`);
    const env = {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        ...envOverrides
    };
    const result = spawnSync('node', [SCRIPT_PATH], {
        cwd: repoDir,
        env,
        encoding: 'utf8'
    });
    const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    return { ...result, output };
}

function extractFilesFromOutput(output) {
    const marker = 'files<<EOF\n';
    const start = output.indexOf(marker);
    if (start === -1) return [];
    const rest = output.slice(start + marker.length);
    const end = rest.indexOf('\nEOF');
    const block = end === -1 ? rest : rest.slice(0, end);
    return block.split('\n').map((v) => v.trim()).filter(Boolean);
}

test('workflow_dispatch fails fast when input is empty', () => {
    const repoDir = setupRepo();
    try {
        const result = runResolver(repoDir, {
            EVENT_NAME: 'workflow_dispatch',
            INPUT_DRAFT_FILES: ''
        });

        assert.equal(result.status, 1);
        assert.match(
            result.stderr,
            /No draft files resolved for manual run\. Set workflow input "draft_files"/
        );
    } finally {
        fs.rmSync(repoDir, { recursive: true, force: true });
    }
});

test('workflow_dispatch resolves explicit draft input', () => {
    const repoDir = setupRepo();
    try {
        writeFile(repoDir, 'drafts/hello-world.md', '# hello');
        commitAll(repoDir, 'add draft');

        const result = runResolver(repoDir, {
            EVENT_NAME: 'workflow_dispatch',
            INPUT_DRAFT_FILES: 'drafts/hello-world.md'
        });

        assert.equal(result.status, 0);
        assert.match(result.output, /has_files=true/);
        assert.match(result.output, /source=workflow_input/);
        assert.deepEqual(extractFilesFromOutput(result.output), ['drafts/hello-world.md']);
    } finally {
        fs.rmSync(repoDir, { recursive: true, force: true });
    }
});

test('push diff excludes deleted drafts and keeps publishable drafts only', () => {
    const repoDir = setupRepo();
    try {
        writeFile(repoDir, 'drafts/deleted.md', '# delete me');
        writeFile(repoDir, 'drafts/keep.md', '# keep me v1');
        const beforeSha = commitAll(repoDir, 'add two drafts');

        fs.rmSync(path.join(repoDir, 'drafts/deleted.md'));
        writeFile(repoDir, 'drafts/keep.md', '# keep me v2');
        const currentSha = commitAll(repoDir, 'delete one and update one');

        const result = runResolver(repoDir, {
            EVENT_NAME: 'push',
            BEFORE_SHA: beforeSha,
            CURRENT_SHA: currentSha
        });

        assert.equal(result.status, 0);
        assert.match(result.output, /has_files=true/);
        assert.match(result.output, /source=git_diff/);
        assert.deepEqual(extractFilesFromOutput(result.output), ['drafts/keep.md']);
    } finally {
        fs.rmSync(repoDir, { recursive: true, force: true });
    }
});

test('push diff with only deleted drafts returns no files (non-fatal)', () => {
    const repoDir = setupRepo();
    try {
        writeFile(repoDir, 'drafts/only-delete.md', '# to be deleted');
        const beforeSha = commitAll(repoDir, 'add only-delete');

        fs.rmSync(path.join(repoDir, 'drafts/only-delete.md'));
        const currentSha = commitAll(repoDir, 'delete only-delete');

        const result = runResolver(repoDir, {
            EVENT_NAME: 'push',
            BEFORE_SHA: beforeSha,
            CURRENT_SHA: currentSha
        });

        assert.equal(result.status, 0);
        assert.match(result.output, /has_files=false/);
        assert.match(result.output, /source=none/);
        assert.deepEqual(extractFilesFromOutput(result.output), []);
    } finally {
        fs.rmSync(repoDir, { recursive: true, force: true });
    }
});
