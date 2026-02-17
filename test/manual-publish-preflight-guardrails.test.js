const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.resolve(__dirname, '../scripts/manual-publish-preflight.sh');
const README_PATH = path.resolve(__dirname, '../README.md');
const CLOUD_SETUP_DOC = path.resolve(__dirname, '../docs/CODEX_CLOUD_SETUP.md');
const REHEARSAL_DOC = path.resolve(__dirname, '../docs/CLOUD_MANUAL_PUBLISH_REHEARSAL_CHECKLIST.md');

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

test('manual preflight script chains runtime, auth, and publish preflight checks', () => {
    const script = read(SCRIPT_PATH);
    assert.match(script, /check-node-runtime\.sh/);
    assert.match(script, /check-gh-cli-auth\.sh/);
    assert.match(script, /node scripts\/check-publish-secrets\.js/);
    assert.match(script, /--files/);
    assert.match(script, /--dry-run/);
});

test('docs reference manual preflight one-shot command', () => {
    const readme = read(README_PATH);
    const cloudSetup = read(CLOUD_SETUP_DOC);
    const rehearsal = read(REHEARSAL_DOC);

    assert.match(readme, /manual-publish-preflight\.sh/);
    assert.match(cloudSetup, /manual-publish-preflight\.sh/);
    assert.match(rehearsal, /manual-publish-preflight\.sh/);
});
