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

const FAILURE_CLASS_ORDER = [
    'EXPECTED_GUARD_BLOCK',
    'ACTIONABLE_RUNTIME_FAILURE',
    'PLATFORM_OR_EXTERNAL_RISK',
    'UNKNOWN_OR_UNTRIAGED'
];

function classifyFailureClass(rootCauseCode = '') {
    const code = String(rootCauseCode || '').trim().toUpperCase();

    if (
        code === 'MANUAL_DRAFT_TARGET_MISSING' ||
        code === 'MANUAL_LIVE_PUBLISH_CONFIRM_BLOCKED' ||
        code === 'MANUAL_FALLBACK_BLOCKED_TOO_EARLY' ||
        code === 'MANUAL_FALLBACK_BLOCKED_ALREADY_TRIGGERED' ||
        code === 'MANUAL_FALLBACK_BLOCKED_NO_DUE_SLOT' ||
        code === 'DRAFT_QUALITY_GATE_BLOCKED'
    ) {
        return 'EXPECTED_GUARD_BLOCK';
    }

    if (code === 'WATCHDOG_GITHUB_API_UNAVAILABLE' || code === 'WEEKLY_SCHEDULE_NOT_TRIGGERED') {
        return 'PLATFORM_OR_EXTERNAL_RISK';
    }

    if (
        code === 'PUBLISH_SECRETS_MISSING' ||
        code === 'WEEKLY_AUTOMATION_STEP_FAILED' ||
        code === 'DEPENDENCY_INSTALL_FAILED' ||
        code === 'WORKFLOW_RUNTIME_SETUP_FAILED' ||
        code === 'WEEKLY_MODELS_TOKEN_MISSING' ||
        code === 'NOTIFY_SUMMARY_RENDER_FAILED'
    ) {
        return 'ACTIONABLE_RUNTIME_FAILURE';
    }

    return 'UNKNOWN_OR_UNTRIAGED';
}

function summarizeFailureClasses(failureDiagnoses = []) {
    const counts = new Map(FAILURE_CLASS_ORDER.map((key) => [key, 0]));

    for (const diagnosis of failureDiagnoses) {
        const klass = classifyFailureClass(diagnosis.rootCauseCode);
        counts.set(klass, (counts.get(klass) || 0) + 1);
    }

    return FAILURE_CLASS_ORDER
        .map((klass) => ({ klass, count: counts.get(klass) || 0 }))
        .filter((item) => item.count > 0);
}

function toWeeklyOpsMarkdown({
    repository = '',
    generatedAt = '',
    windowStart = '',
    windowEnd = '',
    workflowStats = [],
    failureClassCounts = [],
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

    const failureClassRows = failureClassCounts.length
        ? failureClassCounts.map((item) => `| ${item.klass} | ${item.count} |`).join('\n')
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
        '## Failure Class Split',
        '| Failure Class | Count |',
        '|---|---:|',
        failureClassRows,
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
    classifyFailureClass,
    summarizeFailureClasses,
    toWeeklyOpsMarkdown
};
