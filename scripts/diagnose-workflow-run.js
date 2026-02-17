#!/usr/bin/env node
const { execFileSync } = require('child_process');
const { buildActionGuidance, buildSmokeHint, FAILED_CONCLUSION_LIST } = require('./build-workflow-failure-context');

const CRITICAL_WORKFLOWS = new Set([
    'Auto Publish (Content Publisher)',
    'Publish Smoke (Dry Run)',
    'Weekly Content Automation'
]);

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

function parseArgs(argv) {
    const args = {
        repo: process.env.GITHUB_REPOSITORY || '',
        runId: '',
        runUrl: '',
        output: '',
        workflow: ''
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if ((token === '--repo' || token === '-R') && argv[i + 1]) {
            args.repo = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if (token === '--run-id' && argv[i + 1]) {
            args.runId = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if (token === '--run-url' && argv[i + 1]) {
            args.runUrl = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if ((token === '--output' || token === '-o') && argv[i + 1]) {
            args.output = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if (token === '--workflow' && argv[i + 1]) {
            args.workflow = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
    }

    if (!args.runId && args.runUrl) {
        args.runId = parseRunIdFromUrl(args.runUrl);
    }
    return args;
}

function parseRunIdFromUrl(url) {
    const text = String(url || '').trim();
    const match = text.match(/\/actions\/runs\/(\d+)/i);
    return match ? match[1] : '';
}

function execGhJson(args) {
    const output = execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output);
}

function execGhText(args) {
    return execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function pickTargetRun(runs, desiredWorkflow = '') {
    if (!Array.isArray(runs)) return null;
    const normalizedWorkflow = String(desiredWorkflow || '').trim();
    return runs.find((run) => {
        const name = String(run.name || '');
        const conclusion = String(run.conclusion || '');
        if (normalizedWorkflow) {
            return name === normalizedWorkflow && FAILED_CONCLUSIONS.has(conclusion);
        }
        return CRITICAL_WORKFLOWS.has(name) && FAILED_CONCLUSIONS.has(conclusion);
    }) || null;
}

function extractFailedJobs(jobs) {
    if (!Array.isArray(jobs)) return [];
    return jobs
        .filter((job) => FAILED_CONCLUSIONS.has(String(job.conclusion || '')))
        .map((job) => {
            const steps = Array.isArray(job.steps) ? job.steps : [];
            const failedStep = steps.find((step) =>
                FAILED_CONCLUSIONS.has(String(step.conclusion || ''))
            );
            return {
                name: String(job.name || 'unknown-job'),
                conclusion: String(job.conclusion || 'unknown'),
                failedStep: failedStep ? String(failedStep.name || '') : '',
                url: String(job.url || '')
            };
        });
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

function formatFailedJobs(failedJobs) {
    if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
        return 'No failed jobs detected in run payload.';
    }
    return failedJobs
        .slice(0, 15)
        .map((job, idx) => {
            const base = `${idx + 1}. [${job.conclusion}] ${job.name}`;
            const withStep = job.failedStep ? `${base} -> step: ${job.failedStep}` : base;
            return job.url ? `${withStep} (${job.url})` : withStep;
        })
        .join('\n');
}

function formatHighlights(highlights) {
    if (!Array.isArray(highlights) || highlights.length === 0) {
        return 'No error-like lines detected in failed log output.';
    }
    return highlights.map((line, idx) => `${idx + 1}. ${line}`).join('\n');
}

function buildDiagnosisReport({ repo, run, failedJobs, highlights, logNote = '' }) {
    const workflowName = String(run.name || '');
    const runId = String(run.databaseId || run.id || '');
    const runUrl = String(run.url || '');
    const smokeHint = buildSmokeHint(workflowName, runId, repo);
    const guidance = buildActionGuidance(workflowName);

    const sections = [];
    sections.push('# Workflow Run Diagnosis');
    sections.push('');
    sections.push(`- Repository: ${repo}`);
    sections.push(`- Workflow: ${workflowName}`);
    sections.push(`- Run ID: ${runId}`);
    sections.push(`- Status: ${run.status || 'unknown'}`);
    sections.push(`- Conclusion: ${run.conclusion || 'unknown'}`);
    sections.push(`- Event: ${run.event || 'unknown'}`);
    sections.push(`- Branch: ${run.headBranch || 'unknown'}`);
    sections.push(`- URL: ${runUrl || 'n/a'}`);
    sections.push('');
    sections.push('## Failed Jobs');
    sections.push(formatFailedJobs(failedJobs));
    sections.push('');
    sections.push('## Error Highlights');
    sections.push(formatHighlights(highlights));
    if (logNote) {
        sections.push('');
        sections.push('## Log Note');
        sections.push(logNote);
    }
    sections.push('');
    sections.push('## Action Guidance');
    sections.push(guidance);
    if (smokeHint) {
        sections.push('');
        sections.push('## Smoke Hint');
        sections.push(smokeHint);
    }
    sections.push('');
    sections.push('## Suggested Next Commands');
    sections.push(`- gh run view ${runId} -R ${repo} --log-failed`);
    sections.push(`- gh run view ${runId} -R ${repo} --json jobs`);
    return sections.join('\n');
}

function ensureGhReady() {
    try {
        execFileSync('gh', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
        throw new Error('gh CLI is not installed. Run ./scripts/cloud-env-setup.sh first.');
    }

    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
        throw new Error('Missing GH_TOKEN or GITHUB_TOKEN.');
    }
}

function resolveRun({ repo, runId, workflow }) {
    if (runId) {
        return String(runId);
    }
    const runs = execGhJson([
        'run',
        'list',
        '-R',
        repo,
        '--limit',
        '50',
        '--json',
        'databaseId,name,status,conclusion,event,headBranch,url,createdAt'
    ]);
    const target = pickTargetRun(runs, workflow);
    if (!target) {
        return '';
    }
    return String(target.databaseId || '');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.repo) {
        console.error('Usage: node scripts/diagnose-workflow-run.js -R <owner/repo> [--workflow "<name>"] [--run-id <id>|--run-url <url>] [-o output.md]');
        process.exit(1);
    }

    try {
        ensureGhReady();
        const targetRunId = resolveRun({ repo: args.repo, runId: args.runId, workflow: args.workflow });
        if (!targetRunId) {
            if (args.workflow) {
                console.log(`[diagnose] No failed run found for workflow "${args.workflow}" in ${args.repo}.`);
            } else {
                console.log(`[diagnose] No failed critical workflow run found in ${args.repo}.`);
            }
            process.exit(0);
        }

        const run = execGhJson([
            'run',
            'view',
            targetRunId,
            '-R',
            args.repo,
            '--json',
            'databaseId,name,status,conclusion,event,headBranch,url,jobs'
        ]);

        let highlights = [];
        let logNote = '';
        try {
            const failedLog = execGhText(['run', 'view', targetRunId, '-R', args.repo, '--log-failed']);
            highlights = extractErrorHighlights(failedLog);
        } catch (err) {
            const stderr = String(err?.stderr || '').trim();
            logNote = stderr || 'Unable to fetch failed logs for this run.';
        }

        const failedJobs = extractFailedJobs(run.jobs);
        const report = buildDiagnosisReport({
            repo: args.repo,
            run,
            failedJobs,
            highlights,
            logNote
        });

        if (args.output) {
            require('fs').writeFileSync(args.output, `${report}\n`, 'utf8');
            console.log(`[diagnose] Wrote diagnosis report to ${args.output}`);
        } else {
            console.log(report);
        }
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        console.error(`::error::[diagnose] ${message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    buildDiagnosisReport,
    extractErrorHighlights,
    extractFailedJobs,
    parseArgs,
    parseRunIdFromUrl,
    pickTargetRun
};
