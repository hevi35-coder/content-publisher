const { calculateSuccessRate } = require('./ops-report');

function formatWorkflowHealth(workflowStats = []) {
    if (!Array.isArray(workflowStats) || workflowStats.length === 0) {
        return '(no workflow stats)';
    }

    return workflowStats
        .map((item) => {
            const summary = item.summary || {};
            const rate = calculateSuccessRate({
                success: summary.success || 0,
                failure: summary.failure || 0,
                cancelled: summary.cancelled || 0,
                skipped: summary.skipped || 0
            });
            return `${item.workflow}: ${summary.success || 0}/${summary.total || 0} success (${rate})`;
        })
        .join(' | ');
}

function formatTopRootCauses(rootCauseCounts = [], limit = 5) {
    if (!Array.isArray(rootCauseCounts) || rootCauseCounts.length === 0) {
        return '(no failures)';
    }

    return rootCauseCounts
        .slice(0, limit)
        .map((item) => `${item.code}(${item.count})`)
        .join(', ');
}

function buildWeeklyOpsNotificationDetails(report = {}, options = {}) {
    const totalFailureCount = (report.rootCauseCounts || []).reduce(
        (sum, item) => sum + (Number(item.count) || 0),
        0
    );

    const details = {
        reportWindowUtc: `${report.windowStart || '(unknown)'} ~ ${report.windowEnd || '(unknown)'}`,
        generatedAtUtc: report.generatedAt || '(unknown)',
        lookbackDays: String(report.lookbackDays || '(unknown)'),
        workflowHealth: formatWorkflowHealth(report.workflowStats || []),
        failureRootCauseTop: formatTopRootCauses(report.rootCauseCounts || []),
        failureCount: String(totalFailureCount),
        recentFailureCount: String((report.recentFailures || []).length)
    };

    if (options.reportRunUrl) {
        details.reportRunUrl = options.reportRunUrl;
    }

    return details;
}

module.exports = {
    buildWeeklyOpsNotificationDetails
};
