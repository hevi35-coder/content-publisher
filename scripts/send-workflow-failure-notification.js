#!/usr/bin/env node
function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function preBlock(text) {
    return `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(text)}</pre>`;
}

function buildDetailsFromEnv(env = process.env) {
    const runUrl = env.WF_RUN_URL || '';
    const safeRunUrl = escapeHtml(runUrl);

    return {
        workflow: escapeHtml(env.WF_NAME || ''),
        runId: escapeHtml(env.WF_RUN_ID || ''),
        trigger: escapeHtml(env.WF_EVENT || ''),
        branch: escapeHtml(env.WF_BRANCH || ''),
        actor: escapeHtml(env.WF_ACTOR || ''),
        runUrl: safeRunUrl ? `<a href="${safeRunUrl}">${safeRunUrl}</a>` : '',
        failedJobs: preBlock(env.FAILED_JOBS || 'No failed jobs summary available.'),
        errorHighlights: preBlock(env.ERROR_HIGHLIGHTS || 'No error highlights available.'),
        fetchNote: escapeHtml(env.FETCH_NOTE || ''),
        highlightNote: escapeHtml(env.HIGHLIGHT_NOTE || ''),
        smokeHint: escapeHtml(env.SMOKE_HINT || ''),
        actionGuidance: preBlock(env.ACTION_GUIDANCE || ''),
        error: env.ERROR_MESSAGE || 'Workflow failed. Check GitHub Actions logs for details.'
    };
}

async function main() {
    const { notifier } = require('../lib/notifier');
    const details = buildDetailsFromEnv(process.env);

    await notifier.send({
        type: 'step_failed',
        step: 'pipeline',
        status: 'failed',
        details
    });
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = {
    buildDetailsFromEnv,
    escapeHtml,
    preBlock
};
