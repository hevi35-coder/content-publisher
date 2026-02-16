#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { summarizeWorkflowFailure, toDiagnosisMarkdown } = require('../lib/workflow-failure-diagnoser');

function parseArgs(argv) {
    const parsed = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith('--')) {
            continue;
        }
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            parsed[key] = 'true';
            continue;
        }
        parsed[key] = next;
        i += 1;
    }
    return parsed;
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
        throw new Error(`GitHub API ${response.status}: ${message}`);
    }
    return response.json();
}

async function fetchFailedJobs({ repository, runId, token }) {
    if (!repository || !runId || !token) {
        return [];
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
        return [];
    }

    const jobs = [];
    let page = 1;
    while (true) {
        const data = await githubApiJson(
            `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`,
            token
        );
        jobs.push(...(data.jobs || []));
        if (!data.jobs || data.jobs.length < 100) {
            break;
        }
        page += 1;
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

function readFailedLogExcerpt({ runId, repository }) {
    if (!runId || !repository) {
        return '';
    }
    try {
        const output = execSync(
            `gh run view ${runId} --repo ${repository} --log-failed`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 8 }
        );
        return output.slice(-12000);
    } catch (error) {
        return '';
    }
}

function writeOutputFiles({ outputDir, diagnosisPayload, markdown }) {
    fs.mkdirSync(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, 'failure-diagnosis.json');
    const markdownPath = path.join(outputDir, 'failure-diagnosis.md');
    fs.writeFileSync(jsonPath, JSON.stringify(diagnosisPayload, null, 2));
    fs.writeFileSync(markdownPath, markdown);
    return { jsonPath, markdownPath };
}

function writeStepSummary(markdown) {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function writeStepOutputs(diagnosis) {
    if (!process.env.GITHUB_OUTPUT) {
        return;
    }
    const lines = [
        `root_cause_code=${diagnosis.rootCauseCode}`,
        `root_cause=${diagnosis.rootCause}`,
        `summary=${diagnosis.summary}`
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const repository = args.repository || process.env.GITHUB_REPOSITORY || '';
    const runId = args['run-id'] || process.env.WORKFLOW_RUN_ID || '';
    const workflowName = args['workflow-name'] || process.env.WORKFLOW_NAME || '';
    const runUrl = args['run-url'] || process.env.WORKFLOW_RUN_URL || '';
    const eventName = args['event-name'] || process.env.WORKFLOW_EVENT_NAME || '';
    const headBranch = args['head-branch'] || process.env.WORKFLOW_HEAD_BRANCH || '';
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

    let failedJobs = [];
    let failedLogExcerpt = '';
    let internalError = '';

    try {
        failedJobs = await fetchFailedJobs({ repository, runId, token });
    } catch (error) {
        internalError = `Failed to fetch failed jobs: ${error.message}`;
    }

    failedLogExcerpt = readFailedLogExcerpt({ runId, repository });

    const diagnosis = summarizeWorkflowFailure({
        workflowName,
        eventName,
        headBranch,
        failedJobs,
        failedLogExcerpt
    });

    const diagnosisPayload = {
        generatedAt: new Date().toISOString(),
        repository,
        runId: String(runId),
        runUrl,
        workflowName,
        eventName,
        headBranch,
        internalError,
        failedJobs,
        failedLogExcerpt,
        ...diagnosis
    };

    const markdown = toDiagnosisMarkdown({
        workflowName,
        runId: String(runId),
        runUrl,
        eventName,
        headBranch,
        diagnosis
    });

    const outputDir = path.resolve(process.cwd(), 'output');
    const { jsonPath, markdownPath } = writeOutputFiles({ outputDir, diagnosisPayload, markdown });
    writeStepSummary(markdown);
    writeStepOutputs(diagnosis);

    console.log(`Diagnosis root cause: ${diagnosis.rootCauseCode}`);
    console.log(`Diagnosis summary: ${diagnosis.summary}`);
    console.log(`Diagnosis file: ${jsonPath}`);
    console.log(`Diagnosis markdown: ${markdownPath}`);
}

main().catch((error) => {
    console.error(`diagnose-workflow-failure failed: ${error.message}`);
    process.exit(0);
});
