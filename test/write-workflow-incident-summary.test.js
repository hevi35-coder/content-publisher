const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSummaryLines } = require('../scripts/write-workflow-incident-summary');

function withEnv(overrides, fn) {
    const restore = new Map();
    for (const [key, value] of Object.entries(overrides)) {
        restore.set(key, process.env[key]);
        process.env[key] = value;
    }

    try {
        return fn();
    } finally {
        for (const [key, previous] of restore.entries()) {
            if (previous === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous;
            }
        }
    }
}

test('buildSummaryLines renders skipped summary when should_notify=false', () => {
    const lines = withEnv(
        {
            SHOULD_NOTIFY: 'false',
            WF_NAME: 'Auto Publish (Content Publisher)',
            WF_CONCLUSION: 'success',
            WF_RUN_URL: 'https://github.com/example/repo/actions/runs/1'
        },
        () => buildSummaryLines()
    );

    const text = lines.join('\n');
    assert.match(text, /Notification: skipped \(non-failure conclusion\)/);
    assert.doesNotMatch(text, /## Failed Jobs/);
});

test('buildSummaryLines renders full sections when should_notify=true', () => {
    const lines = withEnv(
        {
            SHOULD_NOTIFY: 'true',
            WF_NAME: 'Auto Publish (Content Publisher)',
            WF_CONCLUSION: 'failure',
            WF_RUN_URL: 'https://github.com/example/repo/actions/runs/2',
            SUMMARY_FAILED_JOBS: '1. [failure] publish -> step: Run Publisher',
            SUMMARY_ERROR_HIGHLIGHTS: '1. ::error::sample',
            SUMMARY_ACTION_GUIDANCE: '1) do-a\n2) do-b',
            SUMMARY_FETCH_NOTE: '',
            SUMMARY_HIGHLIGHT_NOTE: '',
            SUMMARY_SMOKE_HINT: 'Check artifact xyz'
        },
        () => buildSummaryLines()
    );

    const text = lines.join('\n');
    assert.match(text, /Notification: sent/);
    assert.match(text, /## Failed Jobs/);
    assert.match(text, /## Error Highlights/);
    assert.match(text, /## Action Guidance/);
    assert.match(text, /## Smoke Hint/);
});
