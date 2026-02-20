#!/usr/bin/env node
const fs = require('fs');

function readEnv(name) {
    return String(process.env[name] || '');
}

function append(lines, outputPath) {
    const payload = `${lines.join('\n')}\n`;
    if (!outputPath) {
        process.stdout.write(payload);
        return;
    }
    fs.appendFileSync(outputPath, payload);
}

function addOptionalSection(lines, title, content) {
    if (!String(content || '').trim()) {
        return;
    }
    lines.push('');
    lines.push(`## ${title}`);
    lines.push(String(content));
}

function buildSummaryLines() {
    const shouldNotify = readEnv('SHOULD_NOTIFY') === 'true';
    const workflowName = readEnv('WF_NAME');
    const conclusion = readEnv('WF_CONCLUSION');
    const runUrl = readEnv('WF_RUN_URL');

    const lines = [
        '# Workflow Incident Summary',
        '',
        `- Workflow: ${workflowName}`,
        `- Conclusion: ${conclusion}`
    ];

    if (!shouldNotify) {
        lines.push('- Notification: skipped (non-failure conclusion)');
        lines.push(`- Run URL: ${runUrl}`);
        return lines;
    }

    lines.push('- Notification: sent');
    lines.push(`- Run URL: ${runUrl}`);
    lines.push('');
    lines.push('## Failed Jobs');
    lines.push(readEnv('SUMMARY_FAILED_JOBS'));
    lines.push('');
    lines.push('## Error Highlights');
    lines.push(readEnv('SUMMARY_ERROR_HIGHLIGHTS'));

    addOptionalSection(lines, 'Fetch Note', readEnv('SUMMARY_FETCH_NOTE'));
    addOptionalSection(lines, 'Highlight Note', readEnv('SUMMARY_HIGHLIGHT_NOTE'));
    addOptionalSection(lines, 'Action Guidance', readEnv('SUMMARY_ACTION_GUIDANCE'));
    addOptionalSection(lines, 'Smoke Hint', readEnv('SUMMARY_SMOKE_HINT'));

    return lines;
}

function main() {
    const outputPath = process.env.GITHUB_STEP_SUMMARY || '';
    const lines = buildSummaryLines();
    append(lines, outputPath);
}

if (require.main === module) {
    main();
}

module.exports = {
    buildSummaryLines
};
