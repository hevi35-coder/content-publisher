#!/usr/bin/env node
const fs = require('fs');
const { execFileSync } = require('child_process');

const FAILED_CONCLUSION_LIST = [
    'failure',
    'timed_out',
    'cancelled',
    'startup_failure',
    'action_required'
];
const FAILED_CONCLUSIONS = new Set(FAILED_CONCLUSION_LIST);
const ERROR_PATTERNS = [/::error::/i, /\bfatal\b/i, /\berror:/i, /\bexception\b/i, /\bfailed\b/i];
const HIGHLIGHT_MAX_LENGTH = 280;

function sanitizeHighlightLine(line) {
    let sanitized = String(line || '');
    sanitized = sanitized.replace(/(github_pat_[A-Za-z0-9_]+)/g, '[REDACTED_TOKEN]');
    sanitized = sanitized.replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, '[REDACTED_TOKEN]');
    sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi, '$1[REDACTED]');
    sanitized = sanitized.replace(/([?&](?:token|access_token|auth)=)[^&\s]+/gi, '$1[REDACTED]');
    sanitized = sanitized.replace(
        /\b(token|secret|password|authorization)\b\s*[:=]\s*[^\s]+/gi,
        (_m, key) => `${key}=[REDACTED]`
    );
    if (sanitized.length > HIGHLIGHT_MAX_LENGTH) {
        return `${sanitized.slice(0, HIGHLIGHT_MAX_LENGTH - 3)}...`;
    }
    return sanitized;
}

function setOutput(name, value) {
    const outputPath = process.env.GITHUB_OUTPUT;
    const normalized = String(value ?? '');
    if (!outputPath) {
        console.log(`${name}=${normalized}`);
        return;
    }
    fs.appendFileSync(outputPath, `${name}<<EOF\n${normalized}\nEOF\n`);
}

function formatFailedJobs(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) {
        return 'No failed jobs detected via GitHub API.';
    }

    return jobs
        .slice(0, 10)
        .map((job, idx) => {
            const base = `${idx + 1}. [${job.conclusion}] ${job.name}`;
            return job.failedStep ? `${base} -> step: ${job.failedStep}` : base;
        })
        .join('\n');
}

function buildSmokeHint(workflowName, runId, repository = '') {
    if (!workflowName || !workflowName.includes('Publish Smoke')) {
        return '';
    }
    const artifactName = `publish-smoke-diagnostics-${runId}`;
    if (repository) {
        return `Check artifact: ${artifactName} (https://github.com/${repository}/actions/runs/${runId}#artifacts)`;
    }
    return `Check artifact: ${artifactName}`;
}

function buildActionGuidance(workflowName = '') {
    if (workflowName.includes('Publish Smoke')) {
        return [
            '1) smoke-summary.md / smoke-run.log 아티팩트 확인',
            '2) 실패 draft 파일 frontmatter(title)와 본문 길이, DRY_RUN 로그 점검',
            '3) 동일 파일로 Auto Publish 수동 리허설 재실행'
        ].join('\n');
    }
    if (workflowName.includes('Auto Publish')) {
        return [
            '1) workflow_dispatch 입력값 draft_files 확인',
            '2) Preflight Secret Validation 실패 키 확인',
            '3) FORCE_PUBLISH / VERIFY_PUBLISHED_URLS 변수값 확인 후 재실행'
        ].join('\n');
    }
    if (workflowName.includes('Weekly Content Automation')) {
        return [
            '1) MODELS_TOKEN 및 GH_TOKEN/GITHUB_TOKEN 유효성 확인',
            '2) Draft preflight(gh auth) 실패 로그 확인',
            '3) draft 생성 후 PR 생성 단계(gh pr create/merge) 오류 재검증'
        ].join('\n');
    }
    return 'Run URL에서 failed job/step을 확인하고 동일 조건으로 재실행하세요.';
}

async function fetchFailedJobs({ repository, runId, token, fetchImpl = global.fetch }) {
    if (!repository || !runId || !token) {
        return { jobs: [], note: 'Missing repository/runId/token for GitHub API query.' };
    }

    const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`;
    const res = await fetchImpl(url, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'content-publisher-notify'
        }
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub API ${res.status}: ${body.slice(0, 400)}`);
    }

    const payload = await res.json();
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

    const failedJobs = jobs
        .filter((job) => FAILED_CONCLUSIONS.has(String(job.conclusion || '')))
        .map((job) => {
            const steps = Array.isArray(job.steps) ? job.steps : [];
            const failedStep =
                steps.find((s) => FAILED_CONCLUSIONS.has(String(s.conclusion || ''))) || null;
            return {
                name: String(job.name || 'unknown-job'),
                conclusion: String(job.conclusion || 'unknown'),
                failedStep: failedStep ? String(failedStep.name || '') : ''
            };
        });

    return { jobs: failedJobs, note: '' };
}

function extractErrorHighlights(logText, limit = 25) {
    const lines = String(logText || '').split('\n');
    const highlights = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) continue;
        highlights.push(sanitizeHighlightLine(trimmed));
        if (highlights.length >= limit) break;
    }
    return highlights;
}

function formatErrorHighlights(highlights) {
    if (!Array.isArray(highlights) || highlights.length === 0) {
        return 'No error-like lines detected in failed logs.';
    }
    return highlights.map((line, idx) => `${idx + 1}. ${line}`).join('\n');
}

async function fetchFailedLogHighlights({ repository, runId, token }) {
    if (!repository || !runId || !token) {
        return { highlights: [], note: 'Missing repository/runId/token for failed log query.' };
    }

    try {
        const env = {
            ...process.env,
            GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || token
        };
        const text = execFileSync(
            'gh',
            ['run', 'view', String(runId), '-R', repository, '--log-failed'],
            {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                env
            }
        );
        const highlights = extractErrorHighlights(text);
        const note =
            highlights.length === 0 ? 'Failed logs fetched, but no error-like lines were detected.' : '';
        return { highlights, note };
    } catch (err) {
        const stderr = String(err?.stderr || '').trim();
        const detail = stderr || err?.message || 'unknown error';
        return { highlights: [], note: `Failed to fetch failed log lines: ${detail}` };
    }
}

async function main() {
    const repository = process.env.WF_REPOSITORY || '';
    const runId = process.env.WF_RUN_ID || '';
    const workflowName = process.env.WF_NAME || '';
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

    let errorMessage = 'Workflow failed. Check GitHub Actions logs for details.';
    let failedJobsText = 'Failed job summary unavailable.';
    let fetchNote = '';
    let errorHighlightsText = 'No error-like lines detected in failed logs.';
    let highlightNote = '';

    try {
        const { jobs, note } = await fetchFailedJobs({ repository, runId, token });
        fetchNote = note;
        failedJobsText = formatFailedJobs(jobs);
        if (jobs.length > 0) {
            errorMessage = `Detected ${jobs.length} failed job(s).`;
        }
    } catch (err) {
        fetchNote = `Failed to fetch job details: ${err.message}`;
        errorMessage = 'Workflow failed and job detail fetch failed. Check run logs directly.';
    }

    const { highlights, note } = await fetchFailedLogHighlights({
        repository,
        runId,
        token
    });
    errorHighlightsText = formatErrorHighlights(highlights);
    highlightNote = note;

    const smokeHint = buildSmokeHint(workflowName, runId, repository);
    const actionGuidance = buildActionGuidance(workflowName);

    setOutput('error_message', errorMessage);
    setOutput('failed_jobs', failedJobsText);
    setOutput('error_highlights', errorHighlightsText);
    setOutput('fetch_note', fetchNote);
    setOutput('highlight_note', highlightNote);
    setOutput('smoke_hint', smokeHint);
    setOutput('action_guidance', actionGuidance);
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = {
    FAILED_CONCLUSION_LIST,
    buildActionGuidance,
    buildSmokeHint,
    extractErrorHighlights,
    fetchFailedLogHighlights,
    fetchFailedJobs,
    formatErrorHighlights,
    formatFailedJobs
};
