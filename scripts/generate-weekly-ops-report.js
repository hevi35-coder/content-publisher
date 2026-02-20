#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { summarizeWorkflowFailure } = require('../lib/workflow-failure-diagnoser');
const {
    summarizeRuns,
    summarizeFailureClasses,
    summarizeRootCauses,
    toWeeklyOpsMarkdown
} = require('../lib/ops-report');

const DEFAULT_WORKFLOWS = [
    'Weekly Content Automation',
    'Auto Publish (Content Publisher)',
    'Weekly Schedule Watchdog',
    'Notify on Workflow Failure'
];

function parseIntWithDefault(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseWorkflowNames(value) {
    if (!value) {
        return DEFAULT_WORKFLOWS;
    }
    const parsed = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return parsed.length ? parsed : DEFAULT_WORKFLOWS;
}

function toIso(value) {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : '';
}

function writeStepSummary(markdown) {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
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
        const body = await response.text();
        throw new Error(`GitHub API ${response.status}: ${body}`);
    }

    return response.json();
}

async function fetchWorkflows(repository, token) {
    const [owner, repo] = repository.split('/');
    const data = await githubApiJson(`/repos/${owner}/${repo}/actions/workflows?per_page=100`, token);
    return data.workflows || [];
}

async function fetchWorkflowRunsInWindow({
    repository,
    workflowRef,
    token,
    windowStartIso,
    maxPages = 4
}) {
    const [owner, repo] = repository.split('/');
    const runs = [];

    for (let page = 1; page <= maxPages; page += 1) {
        const data = await githubApiJson(
            `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/runs?per_page=100&page=${page}`,
            token
        );
        const pageRuns = data.workflow_runs || [];
        if (!pageRuns.length) {
            break;
        }

        let stop = false;
        for (const run of pageRuns) {
            const createdAt = String(run.created_at || '');
            if (createdAt && createdAt < windowStartIso) {
                stop = true;
                continue;
            }
            runs.push(run);
        }

        if (stop || pageRuns.length < 100) {
            break;
        }
    }

    return runs;
}

async function fetchFailedJobs(repository, runId, token) {
    const [owner, repo] = repository.split('/');
    const jobs = [];

    for (let page = 1; page <= 5; page += 1) {
        const data = await githubApiJson(
            `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`,
            token
        );
        const pageJobs = data.jobs || [];
        jobs.push(...pageJobs);
        if (pageJobs.length < 100) {
            break;
        }
    }

    return jobs
        .filter((job) => job.conclusion && job.conclusion !== 'success' && job.conclusion !== 'skipped')
        .map((job) => ({
            id: job.id,
            name: job.name,
            conclusion: job.conclusion,
            failedSteps: (job.steps || [])
                .filter((step) => step.conclusion && step.conclusion !== 'success' && step.conclusion !== 'skipped')
                .map((step) => step.name)
        }));
}

function getFailedLogExcerpt(repository, runId) {
    try {
        const output = execSync(
            `gh run view ${runId} --repo ${repository} --log-failed`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 8 }
        );
        return output.slice(-12000);
    } catch (_error) {
        return '';
    }
}

function writeOutputFiles(outputDir, payload, markdown) {
    fs.mkdirSync(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, 'weekly-ops-report.json');
    const markdownPath = path.join(outputDir, 'weekly-ops-report.md');
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(markdownPath, markdown);
    return { jsonPath, markdownPath };
}

function mapFailureEntry(repository, run, diagnosis) {
    return {
        runId: run.id,
        runUrl: run.html_url || `https://github.com/${repository}/actions/runs/${run.id}`,
        workflow: run.name || '',
        event: run.event || '',
        branch: run.head_branch || '',
        rootCauseCode: diagnosis.rootCauseCode,
        rootCause: diagnosis.rootCause
    };
}

async function main() {
    const repository = process.env.GITHUB_REPOSITORY || '';
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    const lookbackDays = parseIntWithDefault(process.env.OPS_REPORT_LOOKBACK_DAYS, 7);
    const workflowNames = parseWorkflowNames(process.env.OPS_REPORT_WORKFLOWS);
    const maxFailureDiagnoses = parseIntWithDefault(process.env.OPS_REPORT_MAX_FAILURE_DIAGNOSES, 30);
    const maxPagesPerWorkflow = parseIntWithDefault(process.env.OPS_REPORT_MAX_PAGES_PER_WORKFLOW, 4);
    const now = new Date();
    const windowStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    if (!repository) {
        throw new Error('GITHUB_REPOSITORY is required.');
    }
    if (!token) {
        throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required.');
    }

    const workflows = await fetchWorkflows(repository, token);
    const workflowMap = new Map(workflows.map((item) => [item.name, item.path || item.id]));

    const workflowStats = [];
    const failuresForDiagnosis = [];

    for (const workflowName of workflowNames) {
        const workflowRef = workflowMap.get(workflowName);
        if (!workflowRef) {
            workflowStats.push({
                workflow: workflowName,
                warning: 'workflow_not_found',
                summary: summarizeRuns([])
            });
            continue;
        }

        const runs = await fetchWorkflowRunsInWindow({
            repository,
            workflowRef,
            token,
            windowStartIso: toIso(windowStart),
            maxPages: maxPagesPerWorkflow
        });

        const summary = summarizeRuns(runs);
        workflowStats.push({ workflow: workflowName, summary, runsCount: runs.length });

        for (const run of runs) {
            const conclusion = String(run.conclusion || '').toLowerCase();
            if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
                failuresForDiagnosis.push(run);
            }
        }
    }

    failuresForDiagnosis.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const selectedFailures = failuresForDiagnosis.slice(0, Math.max(0, maxFailureDiagnoses));

    const diagnosedFailures = [];
    for (const run of selectedFailures) {
        let failedJobs = [];
        try {
            failedJobs = await fetchFailedJobs(repository, run.id, token);
        } catch (_error) {
            failedJobs = [];
        }

        const failedLogExcerpt = getFailedLogExcerpt(repository, run.id);
        const diagnosis = summarizeWorkflowFailure({
            workflowName: run.name || '',
            eventName: run.event || '',
            headBranch: run.head_branch || '',
            failedJobs,
            failedLogExcerpt
        });

        diagnosedFailures.push(mapFailureEntry(repository, run, diagnosis));
    }

    const rootCauseCounts = summarizeRootCauses(diagnosedFailures);
    const failureClassCounts = summarizeFailureClasses(diagnosedFailures);
    const recentFailures = diagnosedFailures.slice(0, 12);

    const reportPayload = {
        repository,
        generatedAt: toIso(now),
        lookbackDays,
        windowStart: toIso(windowStart),
        windowEnd: toIso(now),
        workflowStats,
        failureClassCounts,
        rootCauseCounts,
        recentFailures
    };

    const markdown = toWeeklyOpsMarkdown(reportPayload);
    const outputDir = path.resolve(process.cwd(), 'output');
    const { jsonPath, markdownPath } = writeOutputFiles(outputDir, reportPayload, markdown);
    writeStepSummary(markdown);

    console.log(`Weekly ops report generated: ${markdownPath}`);
    console.log(`Weekly ops report json: ${jsonPath}`);
}

main().catch((error) => {
    console.error(`::error::generate-weekly-ops-report failed: ${error.message}`);
    process.exit(1);
});
