function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function buildFailedSteps(failedJobs = []) {
    return failedJobs.flatMap((job) =>
        (job.failedSteps || []).map((step) => `${job.name}: ${step}`)
    );
}

function matchAny(text, candidates) {
    return candidates.some((candidate) => text.includes(candidate));
}

function summarizeWorkflowFailure({
    workflowName = '',
    eventName = '',
    headBranch = '',
    failedJobs = [],
    failedLogExcerpt = ''
} = {}) {
    const failedSteps = buildFailedSteps(failedJobs);
    const normalizedWorkflow = normalizeText(workflowName);
    const normalizedEvent = normalizeText(eventName);
    const normalizedBranch = normalizeText(headBranch);
    const normalizedSteps = failedSteps.map(normalizeText).join('\n');
    const normalizedLog = normalizeText(failedLogExcerpt);
    const searchable = [normalizedWorkflow, normalizedEvent, normalizedBranch, normalizedSteps, normalizedLog].join('\n');

    const has = (patterns) => matchAny(searchable, patterns);

    if (
        has(['identify changed draft files']) &&
        has(['no publish target resolved', 'no draft files changed', 'no valid drafts/*.md']) &&
        normalizedEvent === 'workflow_dispatch'
    ) {
        return {
            rootCauseCode: 'MANUAL_DRAFT_TARGET_MISSING',
            rootCause: 'Manual auto-publish was triggered without valid draft targets.',
            summary: 'workflow_dispatch could not resolve any drafts/*.md file, so publishing did not start.',
            suggestedActions: [
                'Set workflow_dispatch draft_files with one or more drafts/*.md paths.',
                'Run once with dry_run=true first to validate file targeting.',
                'If this should be automatic, trigger by pushing changed drafts to main.'
            ],
            failedSteps
        };
    }

    if (
        has(['missing required env vars', 'is missing in .env', 'blogger_access_token is required']) ||
        (has(['run publisher']) && has(['devto_api_key', 'hashnode_pat', 'blogger_blog_id']))
    ) {
        return {
            rootCauseCode: 'PUBLISH_SECRETS_MISSING',
            rootCause: 'Publishing credentials are missing or incomplete.',
            summary: 'Publisher failed before or during publish because required platform secrets were unavailable.',
            suggestedActions: [
                'Verify DEVTO_API_KEY, HASHNODE_PAT, HASHNODE_PUBLICATION_ID, and Blogger credentials.',
                'Re-run in dry_run=true after fixing secrets to verify routing.',
                'Keep token names consistent between GitHub Actions secrets and local cloud env secrets.'
            ],
            failedSteps
        };
    }

    if (has(['install dependencies', 'npm err', 'npm ci'])) {
        return {
            rootCauseCode: 'DEPENDENCY_INSTALL_FAILED',
            rootCause: 'Dependency installation failed in GitHub Actions.',
            summary: 'npm install step failed, so workflow could not proceed to publishing logic.',
            suggestedActions: [
                'Inspect npm error logs in the failed run and resolve lockfile/dependency issues.',
                'Confirm workflow Node.js version matches package requirements.',
                'Retry the workflow after dependency fix is merged to main.'
            ],
            failedSteps
        };
    }

    if (has(['setup node.js', 'setup go', 'checkout code'])) {
        return {
            rootCauseCode: 'WORKFLOW_RUNTIME_SETUP_FAILED',
            rootCause: 'Workflow runtime setup failed before business logic started.',
            summary: 'Action runner setup (checkout/runtime toolchain) failed, preventing task execution.',
            suggestedActions: [
                'Check GitHub Actions status and action versions used in workflow files.',
                'Re-run the workflow to rule out transient runner/network failures.',
                'If persistent, pin or update failing setup actions.'
            ],
            failedSteps
        };
    }

    if (has(['run topic committee', 'run draft writer'])) {
        return {
            rootCauseCode: 'WEEKLY_AUTOMATION_STEP_FAILED',
            rootCause: 'Weekly automation logic failed during topic or draft stage.',
            summary: 'Weekly pipeline reached business logic but failed in topic selection or draft generation.',
            suggestedActions: [
                'Review workflow logs for failing script output (select_topic.js / generate_draft.js).',
                'Validate required AI and GitHub tokens in repository secrets.',
                'Re-run with workflow_dispatch dry_run=true first to isolate logic issues without side effects.'
            ],
            failedSteps
        };
    }

    return {
        rootCauseCode: 'UNKNOWN_FAILURE',
        rootCause: 'Workflow failed but root cause could not be classified automatically.',
        summary: 'Automatic diagnosis did not match known failure signatures.',
        suggestedActions: [
            'Open failed job logs and inspect the first failing step.',
            'Capture recurring failure signatures and add them to workflow-failure-diagnoser rules.',
            'Re-run workflow after applying targeted fix.'
        ],
        failedSteps
    };
}

function toDiagnosisMarkdown({
    workflowName = '',
    runId = '',
    runUrl = '',
    eventName = '',
    headBranch = '',
    diagnosis
}) {
    const failedStepLines = diagnosis.failedSteps.length
        ? diagnosis.failedSteps.map((step) => `- ${step}`).join('\n')
        : '- (no failed step metadata available)';
    const actionLines = diagnosis.suggestedActions.map((action) => `- ${action}`).join('\n');

    return [
        '# Workflow Failure Diagnosis',
        '',
        `- Workflow: ${workflowName || '(unknown)'}`,
        `- Run ID: ${runId || '(unknown)'}`,
        `- Trigger: ${eventName || '(unknown)'}`,
        `- Branch: ${headBranch || '(unknown)'}`,
        `- Run URL: ${runUrl || '(unknown)'}`,
        '',
        `## Root Cause (${diagnosis.rootCauseCode})`,
        diagnosis.rootCause,
        '',
        '## Summary',
        diagnosis.summary,
        '',
        '## Failed Steps',
        failedStepLines,
        '',
        '## Recommended Actions',
        actionLines,
        ''
    ].join('\n');
}

module.exports = {
    summarizeWorkflowFailure,
    toDiagnosisMarkdown
};
