const test = require('node:test');
const assert = require('node:assert/strict');

const {
    summarizeWorkflowFailure,
    toDiagnosisMarkdown
} = require('../lib/workflow-failure-diagnoser');

test('summarizeWorkflowFailure classifies manual auto-publish with empty draft target', () => {
    const diagnosis = summarizeWorkflowFailure({
        workflowName: 'Auto Publish (Content Publisher)',
        eventName: 'workflow_dispatch',
        headBranch: 'main',
        failedJobs: [
            {
                name: 'publish',
                failedSteps: ['Identify Changed Draft Files']
            }
        ],
        failedLogExcerpt:
            'No draft files changed.\n::error::No publish target resolved. Provide workflow_dispatch draft_files'
    });

    assert.equal(diagnosis.rootCauseCode, 'MANUAL_DRAFT_TARGET_MISSING');
    assert.match(diagnosis.summary, /drafts\/\*\.md/i);
});

test('summarizeWorkflowFailure classifies missing publish secrets', () => {
    const diagnosis = summarizeWorkflowFailure({
        workflowName: 'Auto Publish (Content Publisher)',
        eventName: 'push',
        failedJobs: [
            {
                name: 'publish',
                failedSteps: ['Run Publisher']
            }
        ],
        failedLogExcerpt: '[devto] Missing required env vars: DEVTO_API_KEY'
    });

    assert.equal(diagnosis.rootCauseCode, 'PUBLISH_SECRETS_MISSING');
    assert.match(diagnosis.rootCause, /credentials/i);
});

test('summarizeWorkflowFailure falls back to unknown signature', () => {
    const diagnosis = summarizeWorkflowFailure({
        workflowName: 'Weekly Content Automation',
        eventName: 'schedule',
        failedJobs: []
    });

    assert.equal(diagnosis.rootCauseCode, 'UNKNOWN_FAILURE');
    assert.ok(Array.isArray(diagnosis.suggestedActions));
    assert.ok(diagnosis.suggestedActions.length > 0);
});

test('summarizeWorkflowFailure classifies watchdog missed schedule signature', () => {
    const diagnosis = summarizeWorkflowFailure({
        workflowName: 'Weekly Schedule Watchdog',
        eventName: 'schedule',
        failedJobs: [
            {
                name: 'watchdog',
                failedSteps: ['Check Weekly Schedule Run Health']
            }
        ],
        failedLogExcerpt:
            '::error::SCHEDULE_SLOT_MISSED No scheduled Weekly Content Automation run detected'
    });

    assert.equal(diagnosis.rootCauseCode, 'WEEKLY_SCHEDULE_NOT_TRIGGERED');
    assert.match(diagnosis.summary, /schedule window/i);
});

test('summarizeWorkflowFailure classifies watchdog github api unavailable signature', () => {
    const diagnosis = summarizeWorkflowFailure({
        workflowName: 'Weekly Schedule Watchdog',
        eventName: 'schedule',
        failedJobs: [
            {
                name: 'watchdog',
                failedSteps: ['Check Weekly Schedule Run Health']
            }
        ],
        failedLogExcerpt:
            '::error::Weekly schedule watchdog failed: WATCHDOG_API_UNAVAILABLE status=502. GitHub API 502'
    });

    assert.equal(diagnosis.rootCauseCode, 'WATCHDOG_GITHUB_API_UNAVAILABLE');
    assert.match(diagnosis.summary, /api availability/i);
});

test('toDiagnosisMarkdown renders key diagnosis fields', () => {
    const markdown = toDiagnosisMarkdown({
        workflowName: 'Auto Publish (Content Publisher)',
        runId: '22000000000',
        runUrl: 'https://github.com/example/repo/actions/runs/22000000000',
        eventName: 'workflow_dispatch',
        headBranch: 'main',
        diagnosis: {
            rootCauseCode: 'MANUAL_DRAFT_TARGET_MISSING',
            rootCause: 'Manual trigger missing files',
            summary: 'No drafts matched.',
            failedSteps: ['publish: Identify Changed Draft Files'],
            suggestedActions: ['Provide draft_files']
        }
    });

    assert.match(markdown, /MANUAL_DRAFT_TARGET_MISSING/);
    assert.match(markdown, /Provide draft_files/);
    assert.match(markdown, /22000000000/);
});
