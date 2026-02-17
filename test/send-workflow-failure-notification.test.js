const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDetailsFromEnv,
    escapeHtml,
    preBlock
} = require('../scripts/send-workflow-failure-notification');

test('escapeHtml escapes unsafe characters', () => {
    const text = `<script>alert("x")</script>&'`;
    const escaped = escapeHtml(text);
    assert.equal(escaped, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;');
});

test('preBlock wraps escaped text', () => {
    const block = preBlock('<b>danger</b>');
    assert.match(block, /^<pre/);
    assert.match(block, /&lt;b&gt;danger&lt;\/b&gt;/);
});

test('buildDetailsFromEnv maps workflow fields and preserves safety', () => {
    const details = buildDetailsFromEnv({
        WF_NAME: 'Auto Publish (Content Publisher)',
        WF_RUN_ID: '12345',
        WF_EVENT: 'workflow_dispatch',
        WF_BRANCH: 'main',
        WF_ACTOR: 'bot-user',
        WF_RUN_URL: 'https://github.com/owner/repo/actions/runs/12345',
        FAILED_JOBS: '1. [failure] publish',
        ERROR_HIGHLIGHTS: '1. ::error::Missing required env vars',
        FETCH_NOTE: 'api fetched',
        HIGHLIGHT_NOTE: 'note <unsafe>',
        SMOKE_HINT: 'artifact hint',
        ACTION_GUIDANCE: '1) check preflight',
        ERROR_MESSAGE: 'Detected 1 failed job(s).'
    });

    assert.match(details.runUrl, /<a href="https:\/\/github\.com\/owner\/repo\/actions\/runs\/12345">/);
    assert.match(details.failedJobs, /^<pre/);
    assert.match(details.errorHighlights, /^<pre/);
    assert.match(details.highlightNote, /note &lt;unsafe&gt;/);
    assert.equal(details.error, 'Detected 1 failed job(s).');
});
