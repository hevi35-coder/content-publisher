#!/usr/bin/env node
const fs = require('fs');
const { evaluateWeeklyScheduleHealth } = require('../lib/schedule-watchdog');
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function parseIntWithDefault(value, defaultValue) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStepOutput(key, value) {
    if (!process.env.GITHUB_OUTPUT) {
        return;
    }
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value)}\n`);
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
        error.responseBody = message;
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
                `Retrying GitHub API fetch (${attempt}/${attempts}) due to transient error (${statusText}) in ${waitMs}ms...`
            );
            await sleep(waitMs);
        }
    }

    const statusText = lastError && lastError.status ? `status=${lastError.status}` : 'status=unknown';
    const reason = lastError ? lastError.message : 'Failed to query GitHub API.';
    throw new Error(`WATCHDOG_API_UNAVAILABLE ${statusText}. ${reason}`);
}

async function main() {
    const repository = process.env.GITHUB_REPOSITORY || '';
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    const workflowRef =
        process.env.WEEKLY_WORKFLOW_REF ||
        process.env.WEEKLY_WORKFLOW_ID ||
        '.github/workflows/weekly-content.yml';
    const graceMinutes = parseIntWithDefault(process.env.SCHEDULE_WATCHDOG_GRACE_MINUTES, 120);
    const earlyAllowanceMinutes = parseIntWithDefault(process.env.SCHEDULE_WATCHDOG_EARLY_ALLOWANCE_MINUTES, 15);
    const apiMaxAttempts = parseIntWithDefault(process.env.SCHEDULE_WATCHDOG_API_MAX_ATTEMPTS, 3);
    const apiRetryBaseMs = parseIntWithDefault(process.env.SCHEDULE_WATCHDOG_API_RETRY_BASE_MS, 2000);
    const now = new Date();

    if (!token) {
        throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required for schedule watchdog.');
    }

    const runs = await fetchScheduledRunsWithRetry({
        repository,
        workflowRef,
        token,
        maxAttempts: apiMaxAttempts,
        retryBaseMs: apiRetryBaseMs
    });
    const runTimes = runs.map((run) => run.created_at);

    const result = evaluateWeeklyScheduleHealth({
        now,
        scheduledRunTimes: runTimes,
        graceMinutes,
        earlyAllowanceMinutes
    });

    writeStepOutput('watchdog_status', result.status);
    writeStepOutput('workflow_ref', workflowRef);
    writeStepOutput('due_slot_utc', result.dueSlotUtc || '');
    writeStepOutput('matched_run_at_utc', result.matchedRunAtUtc || '');

    console.log(`Watchdog status: ${result.status}`);
    console.log(`Workflow ref: ${workflowRef}`);
    console.log(`Now UTC: ${result.nowUtc}`);
    console.log(`Due slot UTC: ${result.dueSlotUtc || '(none)'}`);
    console.log(`Matched run UTC: ${result.matchedRunAtUtc || '(none)'}`);

    if (result.status === 'MISSED') {
        const errorMessage = [
            'SCHEDULE_SLOT_MISSED',
            `No scheduled Weekly Content Automation run detected for due slot ${result.dueSlotUtc}.`,
            `Search window start: ${result.windowStartUtc}.`
        ].join(' ');
        console.error(`::error::${errorMessage}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`::error::Weekly schedule watchdog failed: ${error.message}`);
    process.exit(1);
});
