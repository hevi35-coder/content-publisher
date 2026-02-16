#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { notifier } = require('../lib/notifier');
const { buildWeeklyOpsNotificationDetails } = require('../lib/ops-report-notification');

function readWeeklyOpsReport() {
    const reportPath = path.resolve(process.cwd(), 'output', 'weekly-ops-report.json');
    if (!fs.existsSync(reportPath)) {
        throw new Error(`weekly ops report file not found: ${reportPath}`);
    }
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

async function main() {
    const report = readWeeklyOpsReport();
    const reportRunUrl =
        process.env.WEEKLY_OPS_REPORT_RUN_URL ||
        (process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
            ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : '');

    const details = buildWeeklyOpsNotificationDetails(report, { reportRunUrl });
    const result = await notifier.stepComplete('weekly_ops_report', details);

    if (!result.sent) {
        const reason = result.reason || result.error || 'unknown';
        console.warn(`Weekly ops report notification skipped: ${reason}`);
    }
}

main().catch((error) => {
    console.error(`send-weekly-ops-report-notification failed: ${error.message}`);
    process.exit(1);
});
