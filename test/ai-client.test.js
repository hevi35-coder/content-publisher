const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

function runNodeSnippet(snippet, envOverrides = {}) {
    return execFileSync(process.execPath, ['-e', snippet], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            ...envOverrides
        },
        encoding: 'utf8'
    });
}

test('ai-client can be imported without token until first API access', () => {
    const output = runNodeSnippet(
        "const client = require('./lib/ai-client'); console.log(typeof client.getClient);",
        { GITHUB_MODELS_TOKEN: '' }
    );
    assert.match(output, /function/);
});

test('ai-client throws descriptive error on first API access without token', () => {
    try {
        runNodeSnippet(
            `
                const client = require('./lib/ai-client');
                try {
                    void client.chat;
                    process.exit(0);
                } catch (error) {
                    console.error(error.message);
                    process.exit(2);
                }
            `,
            { GITHUB_MODELS_TOKEN: '' }
        );
        assert.fail('Expected ai-client access to fail without token');
    } catch (error) {
        const output = `${error.stdout || ''}\n${error.stderr || ''}`;
        assert.match(output, /GITHUB_MODELS_TOKEN is missing in \.env/);
    }
});
