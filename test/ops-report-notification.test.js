const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWeeklyOpsNotificationDetails } = require('../lib/ops-report-notification');

test('buildWeeklyOpsNotificationDetails renders workflow and root cause summaries', () => {
    const details = buildWeeklyOpsNotificationDetails(
        {
            generatedAt: '2026-02-16T00:00:00.000Z',
            windowStart: '2026-02-09T00:00:00.000Z',
            windowEnd: '2026-02-16T00:00:00.000Z',
            lookbackDays: 7,
            workflowStats: [
                {
                    workflow: 'Weekly Content Automation',
                    summary: {
                        total: 4,
                        success: 3,
                        failure: 1,
                        cancelled: 0,
                        skipped: 0
                    }
                }
            ],
            rootCauseCounts: [
                { code: 'MANUAL_DRAFT_TARGET_MISSING', count: 2 },
                { code: 'WEEKLY_SCHEDULE_NOT_TRIGGERED', count: 1 }
            ],
            recentFailures: [{}, {}]
        },
        {
            reportRunUrl: 'https://github.com/owner/repo/actions/runs/123'
        }
    );

    assert.match(details.workflowHealth, /Weekly Content Automation/);
    assert.match(details.workflowHealth, /75.0%/);
    assert.match(details.failureRootCauseTop, /MANUAL_DRAFT_TARGET_MISSING\(2\)/);
    assert.equal(details.failureCount, '3');
    assert.equal(details.recentFailureCount, '2');
    assert.match(details.reportRunUrl, /actions\/runs\/123/);
});
