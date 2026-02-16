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
