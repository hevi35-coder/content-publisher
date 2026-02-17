const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SETUP_SCRIPT = path.resolve(__dirname, '../scripts/cloud-env-setup.sh');
const MAINTENANCE_SCRIPT = path.resolve(__dirname, '../scripts/cloud-env-maintenance.sh');
const NODE_CHECK_SCRIPT = path.resolve(__dirname, '../scripts/check-node-runtime.sh');
const CLOUD_SETUP_DOC = path.resolve(__dirname, '../docs/CODEX_CLOUD_SETUP.md');

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

test('cloud setup and maintenance scripts enforce Node runtime guard', () => {
    const setup = read(SETUP_SCRIPT);
    const maintenance = read(MAINTENANCE_SCRIPT);
    const nodeCheck = read(NODE_CHECK_SCRIPT);

    assert.match(setup, /\.\/scripts\/check-node-runtime\.sh/);
    assert.match(maintenance, /\.\/scripts\/check-node-runtime\.sh/);
    assert.match(nodeCheck, /MIN_NODE_MAJOR.*20/);
    assert.match(nodeCheck, /Unsupported Node\.js runtime/);
});

test('cloud setup documentation includes Node runtime check command', () => {
    const doc = read(CLOUD_SETUP_DOC);
    assert.match(doc, /check-node-runtime\.sh/);
    assert.match(doc, /Node\.js >=20/);
});
