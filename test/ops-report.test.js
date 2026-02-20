const test = require('node:test');
const assert = require('node:assert/strict');

const {
    summarizeRuns,
    calculateSuccessRate,
    summarizeRootCauses,
    classifyFailureClass,
    summarizeFailureClasses,
    toWeeklyOpsMarkdown
} = require('../lib/ops-report');

test('summarizeRuns counts completed conclusions and in-progress runs', () => {
    const summary = summarizeRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'failure' },
        { status: 'completed', conclusion: 'cancelled' },
        { status: 'completed', conclusion: 'skipped' },
        { status: 'in_progress', conclusion: null }
    ]);

    assert.deepEqual(summary, {
        total: 5,
        success: 1,
        failure: 1,
        cancelled: 1,
        skipped: 1,
        inProgress: 1
    });
});

test('calculateSuccessRate returns percentage over completed runs', () => {
    const rate = calculateSuccessRate({
        success: 3,
        failure: 1,
        cancelled: 0,
        skipped: 0
    });
    assert.equal(rate, '75.0%');
});

test('summarizeRootCauses aggregates and sorts by count', () => {
    const result = summarizeRootCauses([
        { rootCauseCode: 'A' },
        { rootCauseCode: 'B' },
        { rootCauseCode: 'A' }
    ]);

    assert.deepEqual(result, [
        { code: 'A', count: 2 },
        { code: 'B', count: 1 }
    ]);
});

test('classifyFailureClass maps root causes into reliability classes', () => {
    assert.equal(classifyFailureClass('MANUAL_LIVE_PUBLISH_CONFIRM_BLOCKED'), 'EXPECTED_GUARD_BLOCK');
    assert.equal(classifyFailureClass('WATCHDOG_GITHUB_API_UNAVAILABLE'), 'PLATFORM_OR_EXTERNAL_RISK');
    assert.equal(classifyFailureClass('PUBLISH_SECRETS_MISSING'), 'ACTIONABLE_RUNTIME_FAILURE');
    assert.equal(classifyFailureClass('UNKNOWN_FAILURE'), 'UNKNOWN_OR_UNTRIAGED');
});

test('summarizeFailureClasses aggregates failure diagnoses by class', () => {
    const result = summarizeFailureClasses([
        { rootCauseCode: 'MANUAL_DRAFT_TARGET_MISSING' },
        { rootCauseCode: 'PUBLISH_SECRETS_MISSING' },
        { rootCauseCode: 'WATCHDOG_GITHUB_API_UNAVAILABLE' },
        { rootCauseCode: 'UNKNOWN_FAILURE' }
    ]);

    assert.deepEqual(result, [
        { klass: 'EXPECTED_GUARD_BLOCK', count: 1 },
        { klass: 'ACTIONABLE_RUNTIME_FAILURE', count: 1 },
        { klass: 'PLATFORM_OR_EXTERNAL_RISK', count: 1 },
        { klass: 'UNKNOWN_OR_UNTRIAGED', count: 1 }
    ]);
});

test('toWeeklyOpsMarkdown renders key report sections', () => {
    const markdown = toWeeklyOpsMarkdown({
        repository: 'owner/repo',
        generatedAt: '2026-02-16T00:00:00.000Z',
        windowStart: '2026-02-09T00:00:00.000Z',
        windowEnd: '2026-02-16T00:00:00.000Z',
        workflowStats: [
            {
                workflow: 'Weekly Content Automation',
                summary: {
                    total: 4,
                    success: 3,
                    failure: 1,
                    cancelled: 0,
                    skipped: 0,
                    inProgress: 0
                }
            }
        ],
        failureClassCounts: [{ klass: 'EXPECTED_GUARD_BLOCK', count: 1 }],
        rootCauseCounts: [{ code: 'MANUAL_DRAFT_TARGET_MISSING', count: 1 }],
        recentFailures: [
            {
                runId: 123456,
                runUrl: 'https://github.com/owner/repo/actions/runs/123456',
                workflow: 'Auto Publish (Content Publisher)',
                event: 'workflow_dispatch',
                rootCauseCode: 'MANUAL_DRAFT_TARGET_MISSING'
            }
        ]
    });

    assert.match(markdown, /Weekly Ops Reliability Report/);
    assert.match(markdown, /Workflow Health/);
    assert.match(markdown, /MANUAL_DRAFT_TARGET_MISSING/);
    assert.match(markdown, /Failure Class Split/);
    assert.match(markdown, /EXPECTED_GUARD_BLOCK/);
    assert.match(markdown, /123456/);
});
