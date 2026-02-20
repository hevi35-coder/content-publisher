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
    const hasInSteps = (patterns) => matchAny(normalizedSteps, patterns);
    const hasInLog = (patterns) => matchAny(normalizedLog, patterns);
    const isAutoPublishManual = normalizedWorkflow.includes('auto publish') && normalizedEvent === 'workflow_dispatch';
    const isWeeklyWorkflow = normalizedWorkflow.includes('weekly content automation');

    if (
        isAutoPublishManual &&
        hasInLog([
            'manual live publish blocked',
            'live_publish_confirm_token',
            'live_publish_confirm'
        ])
    ) {
        return {
            rootCauseCode: 'MANUAL_LIVE_PUBLISH_CONFIRM_BLOCKED',
            rootCause: 'Manual live publish was blocked by confirmation token guard.',
            summary: 'workflow_dispatch(dry_run=false) was rejected because live publish confirmation did not match policy.',
            suggestedActions: [
                'Set repository secret LIVE_PUBLISH_CONFIRM_TOKEN.',
                'Provide matching workflow_dispatch input live_publish_confirm.',
                'Use dry_run=true for rehearsal when confirmation token is unavailable.'
            ],
            failedSteps
        };
    }

    if (
        normalizedWorkflow.includes('notify on workflow failure') &&
        hasInLog([
            'write incident summary',
            'syntax error near unexpected token',
            'process completed with exit code 2'
        ])
    ) {
        return {
            rootCauseCode: 'NOTIFY_SUMMARY_RENDER_FAILED',
            rootCause: 'Failure notification workflow broke while rendering incident summary.',
            summary: 'Notify-on-failure completed email send, but summary rendering failed due to shell/script formatting issue.',
            suggestedActions: [
                'Move incident summary rendering to a dedicated script to avoid shell-quoting edge cases.',
                'Re-run Notify on Workflow Failure after patch and verify the summary step succeeds.',
                'Keep multiline context values out of inline shell conditionals.'
            ],
            failedSteps
        };
    }

    if (hasInLog(['manual_fallback_blocked_too_early'])) {
        return {
            rootCauseCode: 'MANUAL_FALLBACK_BLOCKED_TOO_EARLY',
            rootCause: 'Manual fallback was triggered before the minimum delay window.',
            summary: 'Fallback guard blocked the manual run to avoid overlap with delayed schedule arrivals.',
            suggestedActions: [
                'Wait until the reported wait_until timestamp, then retry.',
                'Use manual_fallback_force=true only in confirmed emergency scenarios.',
                'Keep watchdog/fallback policy unchanged unless delay profile shifts materially.'
            ],
            failedSteps
        };
    }

    if (hasInLog(['manual_fallback_blocked_already_triggered'])) {
        return {
            rootCauseCode: 'MANUAL_FALLBACK_BLOCKED_ALREADY_TRIGGERED',
            rootCause: 'Manual fallback was blocked because the due schedule slot already triggered.',
            summary: 'Guard prevented duplicate execution after detecting an existing scheduled run for the due slot.',
            suggestedActions: [
                'Inspect the matched schedule run and reuse its outputs.',
                'Do not retry manual fallback for the same due slot.',
                'Only force-run if there is clear evidence of downstream corruption.'
            ],
            failedSteps
        };
    }

    if (hasInLog(['manual_fallback_blocked_no_due_slot'])) {
        return {
            rootCauseCode: 'MANUAL_FALLBACK_BLOCKED_NO_DUE_SLOT',
            rootCause: 'Manual fallback guard could not resolve an expected due slot.',
            summary: 'Fallback run was blocked because due-slot resolution failed.',
            suggestedActions: [
                'Verify weekly schedule configuration and workflow ref consistency.',
                'Run schedule:sync and schedule:check, then retry.',
                'If repeated, inspect guard script logs and timezone assumptions.'
            ],
            failedSteps
        };
    }

    if (hasInLog(['[qualitygate:draft]', '(blocked)'])) {
        return {
            rootCauseCode: 'DRAFT_QUALITY_GATE_BLOCKED',
            rootCause: 'Draft generation was blocked by the draft quality threshold gate.',
            summary: 'Regeneration attempts ended below threshold and the fail-safe policy stopped publication.',
            suggestedActions: [
                'Review profile prompt/constraints and improve score drivers.',
                'Decide whether to enable ALLOW_LOW_QUALITY_DRAFTS temporarily for emergency continuity.',
                'Tune threshold/profile policy only with explicit content-quality approval.'
            ],
            failedSteps
        };
    }

    if (
        isAutoPublishManual &&
        hasInLog([
            'no publish target resolved',
            'no draft files changed',
            'no valid drafts/*.md',
            'no draft files resolved for manual run',
            'draft_files not found in repository'
        ])
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
        has(['weekly schedule watchdog', 'check weekly schedule run health']) &&
        hasInLog(['schedule_slot_missed', 'no scheduled weekly content automation run detected'])
    ) {
        return {
            rootCauseCode: 'WEEKLY_SCHEDULE_NOT_TRIGGERED',
            rootCause: 'Expected Weekly Content Automation schedule slot did not trigger.',
            summary: 'Watchdog detected that the expected schedule window elapsed without a scheduled run.',
            suggestedActions: [
                'Open Actions > Weekly Content Automation and confirm schedule is still enabled.',
                'Check repository Actions settings and recent workflow file changes on main.',
                'Run Weekly Content Automation manually (dry_run=true) as temporary backfill.'
            ],
            failedSteps
        };
    }

    if (
        has(['weekly schedule watchdog', 'check weekly schedule run health']) &&
        hasInLog(['watchdog_api_unavailable', 'github api'])
    ) {
        return {
            rootCauseCode: 'WATCHDOG_GITHUB_API_UNAVAILABLE',
            rootCause: 'Watchdog could not query GitHub Actions API reliably.',
            summary: 'Watchdog failed due to GitHub API availability/rate-limit issues, not because schedule was definitely missed.',
            suggestedActions: [
                'Re-run Weekly Schedule Watchdog manually to verify if the issue was transient.',
                'If this repeats, increase SCHEDULE_WATCHDOG_API_MAX_ATTEMPTS and retry backoff.',
                'Check GitHub Status for Actions/API incidents before triggering manual backfill.'
            ],
            failedSteps
        };
    }

    if (isWeeklyWorkflow && hasInLog(['missing required secret: models_token'])) {
        return {
            rootCauseCode: 'WEEKLY_MODELS_TOKEN_MISSING',
            rootCause: 'Weekly automation failed because MODELS_TOKEN secret was missing.',
            summary: 'Draft/topic preflight could not proceed without MODELS_TOKEN.',
            suggestedActions: [
                'Set repository secret MODELS_TOKEN and verify token validity.',
                'Re-run weekly workflow with dry_run=true to confirm preflight recovery.',
                'Keep secret rotation runbook updated to avoid silent expiry gaps.'
            ],
            failedSteps
        };
    }

    if (
        hasInLog(['missing required env vars', 'is missing in .env', 'blogger_access_token is required']) ||
        (hasInSteps(['run publisher']) && hasInLog(['devto_api_key', 'hashnode_pat', 'blogger_blog_id']))
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

    if (
        hasInSteps(['install dependencies']) ||
        hasInLog(['npm err', 'npm error', 'unable to resolve dependency', 'eresolve', 'enotfound'])
    ) {
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

    if (hasInSteps(['setup node.js', 'setup go', 'checkout code', 'set up job'])) {
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

    if (hasInSteps(['run topic committee', 'run draft writer'])) {
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
