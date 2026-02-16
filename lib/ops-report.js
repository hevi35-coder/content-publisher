function summarizeRuns(runs = []) {
    const summary = {
        total: 0,
        success: 0,
        failure: 0,
        cancelled: 0,
        skipped: 0,
        inProgress: 0
    };

    for (const run of runs) {
        summary.total += 1;
        const conclusion = String(run.conclusion || '').toLowerCase();
        const status = String(run.status || '').toLowerCase();

        if (status && status !== 'completed') {
            summary.inProgress += 1;
            continue;
        }

        if (conclusion === 'success') {
            summary.success += 1;
        } else if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
            summary.failure += 1;
        } else if (conclusion === 'cancelled') {
            summary.cancelled += 1;
        } else if (conclusion === 'skipped') {
            summary.skipped += 1;
        }
    }

    return summary;
}

function calculateSuccessRate(summary) {
    const completed = summary.success + summary.failure + summary.cancelled + summary.skipped;
    if (completed === 0) {
        return 'n/a';
    }
    return `${((summary.success / completed) * 100).toFixed(1)}%`;
}

function summarizeRootCauses(failureDiagnoses = []) {
    const counts = new Map();
    for (const diagnosis of failureDiagnoses) {
        const code = diagnosis.rootCauseCode || 'UNKNOWN_FAILURE';
        counts.set(code, (counts.get(code) || 0) + 1);
    }

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ code, count }));
}

function toWeeklyOpsMarkdown({
    repository = '',
    generatedAt = '',
    windowStart = '',
    windowEnd = '',
    workflowStats = [],
    rootCauseCounts = [],
    recentFailures = []
}) {
    const statsRows = workflowStats.length
        ? workflowStats
            .map((item) => {
                const summary = item.summary || summarizeRuns(item.runs || []);
                return `| ${item.workflow} | ${summary.total} | ${summary.success} | ${summary.failure} | ${summary.cancelled} | ${summary.skipped} | ${calculateSuccessRate(summary)} |`;
            })
            .join('\n')
        : '| (none) | 0 | 0 | 0 | 0 | 0 | n/a |';

    const rootCauseRows = rootCauseCounts.length
        ? rootCauseCounts.map((item) => `| ${item.code} | ${item.count} |`).join('\n')
        : '| (no failures) | 0 |';

    const failureRows = recentFailures.length
        ? recentFailures
            .map((item) => `- [${item.runId}](${item.runUrl}) | ${item.workflow} | ${item.event} | ${item.rootCauseCode}`)
            .join('\n')
        : '- No failures in this window.';

    return [
        '# Weekly Ops Reliability Report',
        '',
        `- Repository: ${repository || '(unknown)'}`,
        `- Generated At (UTC): ${generatedAt || '(unknown)'}`,
        `- Window Start (UTC): ${windowStart || '(unknown)'}`,
        `- Window End (UTC): ${windowEnd || '(unknown)'}`,
        '',
        '## Workflow Health',
        '| Workflow | Total | Success | Failure | Cancelled | Skipped | Success Rate |',
        '|---|---:|---:|---:|---:|---:|---:|',
        statsRows,
        '',
        '## Failure Root Causes',
        '| Root Cause Code | Count |',
        '|---|---:|',
        rootCauseRows,
        '',
        '## Recent Failures',
        failureRows,
        ''
    ].join('\n');
}

module.exports = {
    summarizeRuns,
    calculateSuccessRate,
    summarizeRootCauses,
    toWeeklyOpsMarkdown
};
