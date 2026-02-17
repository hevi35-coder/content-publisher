const test = require('node:test');
const assert = require('node:assert/strict');

const {
    FAILED_CONCLUSION_LIST,
    buildActionGuidance,
    buildSmokeHint,
    extractErrorHighlights,
    fetchFailedJobs,
    formatErrorHighlights,
    formatFailedJobs
} = require('../scripts/build-workflow-failure-context');

test('buildSmokeHint returns artifact hint for smoke workflow', () => {
    const hint = buildSmokeHint('Publish Smoke (Dry Run)', '12345', 'owner/repo');
    assert.match(hint, /publish-smoke-diagnostics-12345/);
    assert.match(hint, /https:\/\/github\.com\/owner\/repo\/actions\/runs\/12345#artifacts/);
});

test('buildSmokeHint returns empty string for non-smoke workflow', () => {
    const hint = buildSmokeHint('Weekly Content Automation', '12345');
    assert.equal(hint, '');
});

test('buildActionGuidance returns workflow-specific guidance', () => {
    const smoke = buildActionGuidance('Publish Smoke (Dry Run)');
    const auto = buildActionGuidance('Auto Publish (Content Publisher)');
    const weekly = buildActionGuidance('Weekly Content Automation');

    assert.match(smoke, /smoke-summary\.md/);
    assert.match(auto, /draft_files/);
    assert.match(weekly, /MODELS_TOKEN/);
});

test('formatFailedJobs summarizes failed job list', () => {
    const text = formatFailedJobs([
        { name: 'job-a', conclusion: 'failure', failedStep: 'step-1' },
        { name: 'job-b', conclusion: 'timed_out', failedStep: '' }
    ]);

    assert.match(text, /\[failure\] job-a -> step: step-1/);
    assert.match(text, /\[timed_out\] job-b/);
});

test('fetchFailedJobs includes all tracked failed conclusions', async () => {
    assert.deepEqual(FAILED_CONCLUSION_LIST, [
        'failure',
        'timed_out',
        'cancelled',
        'startup_failure',
        'action_required'
    ]);

    const mockFetch = async () => ({
        ok: true,
        async json() {
            return {
                jobs: [
                    {
                        name: 'ok-job',
                        conclusion: 'success',
                        steps: [{ name: 'done', conclusion: 'success' }]
                    },
                    {
                        name: 'failed-job',
                        conclusion: 'failure',
                        steps: [{ name: 'build', conclusion: 'failure' }]
                    },
                    {
                        name: 'cancelled-job',
                        conclusion: 'cancelled',
                        steps: [{ name: 'setup', conclusion: 'cancelled' }]
                    },
                    {
                        name: 'startup-failed-job',
                        conclusion: 'startup_failure',
                        steps: [{ name: 'bootstrap', conclusion: 'startup_failure' }]
                    },
                    {
                        name: 'action-required-job',
                        conclusion: 'action_required',
                        steps: [{ name: 'approval', conclusion: 'action_required' }]
                    }
                ]
            };
        }
    });

    const result = await fetchFailedJobs({
        repository: 'owner/repo',
        runId: '10',
        token: 'token',
        fetchImpl: mockFetch
    });

    assert.equal(result.jobs.length, 4);
    assert.equal(result.jobs[0].name, 'failed-job');
    assert.equal(result.jobs[0].failedStep, 'build');
    assert.equal(result.jobs[1].name, 'cancelled-job');
    assert.equal(result.jobs[2].name, 'startup-failed-job');
    assert.equal(result.jobs[3].name, 'action-required-job');
});

test('fetchFailedJobs returns note when required inputs are missing', async () => {
    const result = await fetchFailedJobs({
        repository: '',
        runId: '',
        token: ''
    });

    assert.equal(result.jobs.length, 0);
    assert.match(result.note, /Missing repository\/runId\/token/);
});

test('extractErrorHighlights returns only error-like log lines', () => {
    const highlights = extractErrorHighlights([
        'info: start',
        '::error::Missing required env vars token=ghp_abcdefghijklmnopqrstuvwxyz123456',
        `fatal: ${'x'.repeat(500)}`,
        'normal line'
    ].join('\n'));

    assert.equal(highlights.length, 2);
    assert.match(highlights[0], /Missing required env vars/);
    assert.doesNotMatch(highlights[0], /ghp_[A-Za-z0-9_]+/);
    assert.match(highlights[0], /\[REDACTED_TOKEN\]|\[REDACTED\]/);
    assert.match(highlights[1], /fatal:/i);
    assert.ok(highlights[1].length <= 280);
});

test('formatErrorHighlights returns fallback text for empty highlights', () => {
    const text = formatErrorHighlights([]);
    assert.match(text, /No error-like lines detected in failed logs/);
});
