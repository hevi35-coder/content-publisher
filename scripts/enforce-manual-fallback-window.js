#!/usr/bin/env node
const { evaluateManualFallbackEligibility } = require('../lib/manual-fallback-guard');

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function parseIntWithDefault(value, defaultValue) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function toBool(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStepOutput(key, value) {
    if (!process.env.GITHUB_OUTPUT) {
        return;
    }
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value)}\n`);
}

function shouldGuardManualDraftFallback(env = process.env) {
    const eventName = String(env.EVENT_NAME || '').trim();
    if (eventName !== 'workflow_dispatch') {
        return false;
    }

    const runTarget = String(env.RUN_TARGET || '').trim().toLowerCase();
    return runTarget === 'draft' || runTarget === 'both';
}

async function githubApiJson(urlPath, token) {
    const response = await fetch(`https://api.github.com${urlPath}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    if (!response.ok) {
        const message = await response.text();
        const error = new Error(`GitHub API ${response.status}: ${message}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

function isRetryableGithubApiError(error) {
    const statusCode = Number(error && error.status);
    return RETRYABLE_STATUS_CODES.has(statusCode);
}

async function fetchScheduledRuns({ repository, workflowRef, token, perPage = 30 }) {
    const [owner, repo] = String(repository || '').split('/');
    if (!owner || !repo) {
        throw new Error(`Invalid repository: ${repository}`);
    }

    const encodedWorkflowRef = encodeURIComponent(String(workflowRef || ''));
    if (!encodedWorkflowRef) {
        throw new Error('workflowRef is required');
    }

    const data = await githubApiJson(
        `/repos/${owner}/${repo}/actions/workflows/${encodedWorkflowRef}/runs?event=schedule&branch=main&per_page=${perPage}`,
        token
    );

    return data.workflow_runs || [];
}

async function fetchScheduledRunsWithRetry({
    repository,
    workflowRef,
    token,
    perPage = 30,
    maxAttempts = 3,
    retryBaseMs = 2000
}) {
    const attempts = Math.max(1, maxAttempts);
    const baseDelay = Math.max(100, retryBaseMs);
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fetchScheduledRuns({ repository, workflowRef, token, perPage });
        } catch (error) {
            lastError = error;
            const retryable = isRetryableGithubApiError(error);
            const isLastAttempt = attempt === attempts;
            if (!retryable || isLastAttempt) {
                break;
            }

            const waitMs = baseDelay * Math.pow(2, attempt - 1);
            const statusText = error && error.status ? `status=${error.status}` : 'status=unknown';
            console.warn(
                `Retrying fallback guard GitHub API fetch (${attempt}/${attempts}) due to transient error (${statusText}) in ${waitMs}ms...`
            );
            await sleep(waitMs);
        }
    }

    const statusText = lastError && lastError.status ? `status=${lastError.status}` : 'status=unknown';
    const reason = lastError ? lastError.message : 'Failed to query GitHub API.';
    throw new Error(`MANUAL_FALLBACK_GITHUB_API_UNAVAILABLE ${statusText}. ${reason}`);
}

async function main() {
    const env = process.env;
    if (!shouldGuardManualDraftFallback(env)) {
        console.log('Manual fallback guard skipped (not a workflow_dispatch draft/both run).');
        return;
    }

    const dryRun = toBool(env.DRY_RUN);
    if (dryRun) {
        console.log('Manual fallback guard bypassed (DRY_RUN=true).');
        writeStepOutput('manual_fallback_guard_status', 'SKIPPED_DRY_RUN');
        return;
    }

    const forced = toBool(env.MANUAL_FALLBACK_FORCE);
    if (forced) {
        console.warn('⚠️ Manual fallback guard force override enabled (MANUAL_FALLBACK_FORCE=true).');
        writeStepOutput('manual_fallback_guard_status', 'BYPASSED_FORCE');
        return;
    }

    const repository = env.GITHUB_REPOSITORY || '';
    const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';
    const workflowRef = env.WEEKLY_WORKFLOW_REF || '.github/workflows/weekly-content.yml';
    const minDelayMinutes = parseIntWithDefault(env.MANUAL_FALLBACK_MIN_DELAY_MINUTES, 60);
    const earlyAllowanceMinutes = parseIntWithDefault(env.MANUAL_FALLBACK_EARLY_ALLOWANCE_MINUTES, 15);
    const apiMaxAttempts = parseIntWithDefault(env.MANUAL_FALLBACK_API_MAX_ATTEMPTS, 3);
    const apiRetryBaseMs = parseIntWithDefault(env.MANUAL_FALLBACK_API_RETRY_BASE_MS, 2000);

    if (!token) {
        throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required for manual fallback guard.');
    }

    const runs = await fetchScheduledRunsWithRetry({
        repository,
        workflowRef,
        token,
        maxAttempts: apiMaxAttempts,
        retryBaseMs: apiRetryBaseMs
    });

    const runTimes = runs.map((run) => run.created_at);
    const result = evaluateManualFallbackEligibility({
        now: new Date(),
        scheduledRunTimes: runTimes,
        minDelayMinutes,
        earlyAllowanceMinutes
    });

    writeStepOutput('manual_fallback_guard_status', result.status);
    writeStepOutput('manual_fallback_due_slot_utc', result.dueSlotUtc || '');
    writeStepOutput('manual_fallback_wait_until_utc', result.waitUntilUtc || '');
    writeStepOutput('manual_fallback_matched_run_utc', result.matchedRunAtUtc || '');

    console.log(`Manual fallback guard status: ${result.status}`);
    console.log(`Now UTC: ${result.nowUtc}`);
    console.log(`Due slot UTC: ${result.dueSlotUtc || '(none)'}`);
    console.log(`Wait-until UTC: ${result.waitUntilUtc || '(none)'}`);
    console.log(`Matched schedule run UTC: ${result.matchedRunAtUtc || '(none)'}`);

    if (result.status === 'ALLOWED') {
        return;
    }

    if (result.status === 'BLOCKED_TOO_EARLY') {
        console.error(
            `::error::MANUAL_FALLBACK_BLOCKED_TOO_EARLY wait_until=${result.waitUntilUtc} due_slot=${result.dueSlotUtc} (policy: wait at least ${minDelayMinutes} minutes after expected slot).`
        );
        process.exit(1);
    }

    if (result.status === 'BLOCKED_ALREADY_TRIGGERED') {
        console.error(
            `::error::MANUAL_FALLBACK_BLOCKED_ALREADY_TRIGGERED matched_schedule_run=${result.matchedRunAtUtc} due_slot=${result.dueSlotUtc}.`
        );
        process.exit(1);
    }

    if (result.status === 'BLOCKED_NO_DUE_SLOT') {
        console.error('::error::MANUAL_FALLBACK_BLOCKED_NO_DUE_SLOT unable to resolve expected schedule slot.');
        process.exit(1);
    }

    console.error(`::error::MANUAL_FALLBACK_BLOCKED_UNKNOWN status=${result.status}`);
    process.exit(1);
}

main().catch((error) => {
    console.error(`::error::Manual fallback guard failed: ${error.message}`);
    process.exit(1);
});
