#!/usr/bin/env node
const { execFileSync } = require('child_process');
const { evaluateWeeklyScheduleHealth } = require('../lib/schedule-watchdog');
const { evaluateManualFallbackEligibility } = require('../lib/manual-fallback-guard');

const DEFAULT_WORKFLOW_REF = '.github/workflows/weekly-content.yml';
const DEFAULT_REPO = 'hevi35-coder/content-publisher';

function pad2(value) {
    return String(value).padStart(2, '0');
}

function toKstString(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return [
        kst.getUTCFullYear(),
        pad2(kst.getUTCMonth() + 1),
        pad2(kst.getUTCDate())
    ].join('-') + ` ${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}:${pad2(kst.getUTCSeconds())}`;
}

function parseIntWithDefault(value, defaultValue) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseArgs(argv) {
    const args = {
        repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
        workflowRef: DEFAULT_WORKFLOW_REF,
        perPage: 40,
        graceMinutes: 180,
        earlyAllowanceMinutes: 15,
        minDelayMinutes: 60,
        failOnMissed: false,
        json: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '');
        if ((token === '--repo' || token === '-R') && argv[i + 1]) {
            args.repo = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if ((token === '--workflow-ref' || token === '--workflow') && argv[i + 1]) {
            args.workflowRef = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if (token === '--per-page' && argv[i + 1]) {
            args.perPage = parseIntWithDefault(argv[i + 1], args.perPage);
            i += 1;
            continue;
        }
        if (token === '--grace-minutes' && argv[i + 1]) {
            args.graceMinutes = parseIntWithDefault(argv[i + 1], args.graceMinutes);
            i += 1;
            continue;
        }
        if (token === '--early-allowance-minutes' && argv[i + 1]) {
            args.earlyAllowanceMinutes = parseIntWithDefault(argv[i + 1], args.earlyAllowanceMinutes);
            i += 1;
            continue;
        }
        if (token === '--min-delay-minutes' && argv[i + 1]) {
            args.minDelayMinutes = parseIntWithDefault(argv[i + 1], args.minDelayMinutes);
            i += 1;
            continue;
        }
        if (token === '--fail-on-missed') {
            args.failOnMissed = true;
            continue;
        }
        if (token === '--json') {
            args.json = true;
            continue;
        }
    }

    if (!args.repo) {
        throw new Error('Repository is required (use --repo owner/repo).');
    }
    if (!args.workflowRef) {
        throw new Error('workflow-ref is required.');
    }
    return args;
}

function ensureGhReady() {
    try {
        execFileSync('gh', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
        throw new Error('gh CLI is not installed.');
    }
}

function execGhJson(args) {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function fetchScheduledRuns({ repo, workflowRef, perPage }) {
    const encodedWorkflowRef = encodeURIComponent(String(workflowRef));
    const endpoint =
        `repos/${repo}/actions/workflows/${encodedWorkflowRef}/runs?event=schedule&branch=main&per_page=${Math.max(1, perPage)}`;
    const data = execGhJson(['api', endpoint]);
    return Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
}

function fetchLatestRun({ repo, workflowName }) {
    const runs = execGhJson([
        'run',
        'list',
        '-R',
        repo,
        '--workflow',
        workflowName,
        '--limit',
        '1',
        '--json',
        'databaseId,workflowName,event,status,conclusion,createdAt,url,headSha'
    ]);
    return Array.isArray(runs) && runs.length > 0 ? runs[0] : null;
}

function mapRunSummary(run) {
    if (!run) {
        return null;
    }
    return {
        runId: String(run.databaseId || ''),
        workflowName: String(run.workflowName || ''),
        event: String(run.event || ''),
        status: String(run.status || ''),
        conclusion: String(run.conclusion || ''),
        createdAtUtc: String(run.createdAt || ''),
        createdAtKst: toKstString(run.createdAt || ''),
        url: String(run.url || ''),
        headSha: String(run.headSha || '')
    };
}

function printTextReport(report) {
    const health = report.health;
    const fallback = report.manualFallback;
    const latestScheduleRun = report.latestScheduleRun;
    const fallbackCommand =
        `gh workflow run weekly-content.yml -R ${report.repo} --ref main ` +
        `-f run_target=draft -f dry_run=false -f manual_fallback_force=false -f skip_draft_writer=false`;

    console.log('## Slot Health Report');
    console.log(`- Repo: ${report.repo}`);
    console.log(`- Weekly workflow ref: ${report.workflowRef}`);
    console.log(`- Now UTC: ${report.nowUtc}`);
    console.log(`- Now KST: ${report.nowKst}`);
    console.log(`- Health status: ${health.status}`);
    console.log(`- Due slot UTC: ${health.dueSlotUtc || 'n/a'}`);
    console.log(`- Due slot KST: ${health.dueSlotKst || 'n/a'}`);
    console.log(`- Matched scheduled run UTC: ${health.matchedRunAtUtc || 'n/a'}`);
    console.log(`- Matched scheduled run KST: ${health.matchedRunAtKst || 'n/a'}`);
    if (latestScheduleRun) {
        console.log(`- Latest schedule run: ${latestScheduleRun.runId} (${latestScheduleRun.status}/${latestScheduleRun.conclusion})`);
        console.log(`  - Created UTC: ${latestScheduleRun.createdAtUtc}`);
        console.log(`  - Created KST: ${latestScheduleRun.createdAtKst}`);
        console.log(`  - URL: ${latestScheduleRun.url}`);
    } else {
        console.log('- Latest schedule run: n/a');
    }

    console.log('');
    console.log('## Manual Fallback Gate');
    console.log(`- Gate status: ${fallback.status}`);
    console.log(`- Due slot UTC: ${fallback.dueSlotUtc || 'n/a'}`);
    console.log(`- Due slot KST: ${fallback.dueSlotKst || 'n/a'}`);
    console.log(`- Wait-until UTC: ${fallback.waitUntilUtc || 'n/a'}`);
    console.log(`- Wait-until KST: ${fallback.waitUntilKst || 'n/a'}`);
    console.log(`- Matched schedule run UTC: ${fallback.matchedRunAtUtc || 'n/a'}`);
    console.log(`- Matched schedule run KST: ${fallback.matchedRunAtKst || 'n/a'}`);

    console.log('');
    console.log('## Recommendation');
    if (health.status === 'HEALTHY') {
        console.log('- No action: expected slot is healthy.');
        return;
    }

    if (health.status === 'MISSED' && fallback.status === 'ALLOWED') {
        console.log('- Manual fallback is allowed now. Execute:');
        console.log(`  ${fallbackCommand}`);
        return;
    }

    if (health.status === 'MISSED' && fallback.status === 'BLOCKED_TOO_EARLY') {
        console.log('- Wait until wait-until time, then re-check or run fallback.');
        return;
    }

    if (health.status === 'MISSED' && fallback.status === 'BLOCKED_ALREADY_TRIGGERED') {
        console.log('- Do not trigger fallback: schedule run already exists in due window.');
        return;
    }

    console.log('- Re-check with --json output and inspect latest workflow runs below.');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    ensureGhReady();

    const now = new Date();
    const scheduledRuns = fetchScheduledRuns({
        repo: args.repo,
        workflowRef: args.workflowRef,
        perPage: args.perPage
    });
    const scheduledRunTimes = scheduledRuns.map((run) => run.created_at);

    const health = evaluateWeeklyScheduleHealth({
        now,
        scheduledRunTimes,
        graceMinutes: args.graceMinutes,
        earlyAllowanceMinutes: args.earlyAllowanceMinutes
    });
    const fallback = evaluateManualFallbackEligibility({
        now,
        scheduledRunTimes,
        minDelayMinutes: args.minDelayMinutes,
        earlyAllowanceMinutes: args.earlyAllowanceMinutes
    });

    const latestWeekly = mapRunSummary(fetchLatestRun({ repo: args.repo, workflowName: 'Weekly Content Automation' }));
    const latestWatchdog = mapRunSummary(fetchLatestRun({ repo: args.repo, workflowName: 'Weekly Schedule Watchdog' }));
    const latestAutoPublish = mapRunSummary(fetchLatestRun({ repo: args.repo, workflowName: 'Auto Publish (Content Publisher)' }));
    const latestScheduleRun = scheduledRuns.length > 0 ? {
        runId: String(scheduledRuns[0].id || ''),
        workflowName: String(scheduledRuns[0].name || ''),
        event: String(scheduledRuns[0].event || ''),
        status: String(scheduledRuns[0].status || ''),
        conclusion: String(scheduledRuns[0].conclusion || ''),
        createdAtUtc: String(scheduledRuns[0].created_at || ''),
        createdAtKst: toKstString(scheduledRuns[0].created_at || ''),
        url: String(scheduledRuns[0].html_url || ''),
        headSha: String(scheduledRuns[0].head_sha || '')
    } : null;

    const report = {
        repo: args.repo,
        workflowRef: args.workflowRef,
        nowUtc: now.toISOString(),
        nowKst: toKstString(now),
        health: {
            ...health,
            dueSlotKst: toKstString(health.dueSlotUtc || ''),
            matchedRunAtKst: toKstString(health.matchedRunAtUtc || '')
        },
        manualFallback: {
            ...fallback,
            dueSlotKst: toKstString(fallback.dueSlotUtc || ''),
            waitUntilKst: toKstString(fallback.waitUntilUtc || ''),
            matchedRunAtKst: toKstString(fallback.matchedRunAtUtc || '')
        },
        latestScheduleRun,
        latestRuns: {
            weeklyContent: latestWeekly,
            scheduleWatchdog: latestWatchdog,
            autoPublish: latestAutoPublish
        }
    };

    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printTextReport(report);
        console.log('');
        console.log('## Latest Workflow Runs');
        console.log(JSON.stringify(report.latestRuns, null, 2));
    }

    if (args.failOnMissed && report.health.status === 'MISSED') {
        process.exit(2);
    }
}

main();
