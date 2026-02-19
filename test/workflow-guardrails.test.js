const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { FAILED_CONCLUSION_LIST } = require('../scripts/build-workflow-failure-context');

const AUTO_PUBLISH_WORKFLOW = path.resolve(__dirname, '../.github/workflows/auto-publish.yml');
const PUBLISH_SMOKE_WORKFLOW = path.resolve(__dirname, '../.github/workflows/publish-smoke.yml');
const PR_SANITY_WORKFLOW = path.resolve(__dirname, '../.github/workflows/pr-sanity.yml');
const WEEKLY_CONTENT_WORKFLOW = path.resolve(__dirname, '../.github/workflows/weekly-content.yml');
const SCHEDULE_WATCHDOG_WORKFLOW = path.resolve(__dirname, '../.github/workflows/schedule-watchdog.yml');
const NOTIFY_ON_FAILURE_WORKFLOW = path.resolve(__dirname, '../.github/workflows/notify-on-failure.yml');
const CI_SANITY_SCRIPT = path.resolve(__dirname, '../scripts/ci-sanity-checks.sh');
const WEEKLY_SCHEDULE_CONFIG = path.resolve(__dirname, '../config/weekly-schedule.json');

const WEEKDAY_INDEX = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6
};

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function parseTime(timeText) {
    const m = String(timeText || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    assert.ok(m, 'weekly_time_kst must be HH:MM');
    return {
        hour: Number(m[1]),
        minute: Number(m[2])
    };
}

function toWeekdayIndex(value, field) {
    const index = WEEKDAY_INDEX[String(value || '').trim().toUpperCase()];
    assert.equal(typeof index, 'number', `invalid ${field}`);
    return index;
}

function toWeekdayList(values, field) {
    assert.ok(Array.isArray(values) && values.length > 0, `${field} must be a non-empty array`);
    return values.map((value) => toWeekdayIndex(value, field));
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a - b);
}

function convertKstToUtcDayTime(weekdayKst, hourKst, minuteKst) {
    let hourUtc = hourKst - 9;
    let dayShift = 0;
    while (hourUtc < 0) {
        hourUtc += 24;
        dayShift -= 1;
    }
    while (hourUtc >= 24) {
        hourUtc -= 24;
        dayShift += 1;
    }
    return {
        weekdayUtc: (weekdayKst + dayShift + 7) % 7,
        hourUtc,
        minuteUtc: minuteKst
    };
}

function shiftKstDayTime(weekdayKst, hourKst, minuteKst, deltaMinutes) {
    const total = hourKst * 60 + minuteKst + deltaMinutes;
    const dayShift = Math.floor(total / 1440);
    const minuteOfDay = ((total % 1440) + 1440) % 1440;
    return {
        weekdayKst: (weekdayKst + dayShift + 7) % 7,
        hourKst: Math.floor(minuteOfDay / 60),
        minuteKst: minuteOfDay % 60
    };
}

function toCron(minuteUtc, hourUtc, weekdaysUtc) {
    return `${minuteUtc} ${hourUtc} * * ${weekdaysUtc.join(',')}`;
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveExpectedSchedule() {
    const cfg = JSON.parse(read(WEEKLY_SCHEDULE_CONFIG));
    const time = parseTime(cfg.weekly_time_kst);
    const topicDayKst = toWeekdayIndex(cfg.topic_weekday_kst, 'topic_weekday_kst');
    const draftDaysKst = toWeekdayList(cfg.draft_weekdays_kst, 'draft_weekdays_kst');
    const watchdogDelayMinutes = Number(cfg.watchdog_delay_minutes);
    const watchdogGraceMinutes = Number(cfg.watchdog_grace_minutes);

    assert.ok(Number.isInteger(watchdogDelayMinutes) && watchdogDelayMinutes >= 0, 'invalid watchdog_delay_minutes');
    assert.ok(Number.isInteger(watchdogGraceMinutes) && watchdogGraceMinutes >= 0, 'invalid watchdog_grace_minutes');
    assert.ok(watchdogDelayMinutes > watchdogGraceMinutes, 'watchdog_delay_minutes must be greater than watchdog_grace_minutes');

    const topicUtc = convertKstToUtcDayTime(topicDayKst, time.hour, time.minute);
    const draftUtc = draftDaysKst.map((day) => convertKstToUtcDayTime(day, time.hour, time.minute));
    const draftWeekdaysUtc = uniqueSorted(draftUtc.map((entry) => entry.weekdayUtc));

    const topicWatchdogKst = shiftKstDayTime(topicDayKst, time.hour, time.minute, watchdogDelayMinutes);
    const draftWatchdogKst = draftDaysKst.map((day) => shiftKstDayTime(day, time.hour, time.minute, watchdogDelayMinutes));
    const topicWatchdogUtc = convertKstToUtcDayTime(
        topicWatchdogKst.weekdayKst,
        topicWatchdogKst.hourKst,
        topicWatchdogKst.minuteKst
    );
    const draftWatchdogUtc = draftWatchdogKst.map((entry) =>
        convertKstToUtcDayTime(entry.weekdayKst, entry.hourKst, entry.minuteKst)
    );
    const draftWatchdogWeekdaysUtc = uniqueSorted(draftWatchdogUtc.map((entry) => entry.weekdayUtc));

    return {
        topicCron: toCron(topicUtc.minuteUtc, topicUtc.hourUtc, [topicUtc.weekdayUtc]),
        draftCron: toCron(topicUtc.minuteUtc, topicUtc.hourUtc, draftWeekdaysUtc),
        watchdogTopicCron: toCron(topicWatchdogUtc.minuteUtc, topicWatchdogUtc.hourUtc, [topicWatchdogUtc.weekdayUtc]),
        watchdogDraftCron: toCron(topicWatchdogUtc.minuteUtc, topicWatchdogUtc.hourUtc, draftWatchdogWeekdaysUtc),
        watchdogGraceMinutes
    };
}

test('auto-publish workflow keeps manual safety defaults and guardrails', () => {
    const yml = read(AUTO_PUBLISH_WORKFLOW);

    assert.match(yml, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*draft_files:/m);
    assert.match(yml, /dry_run:\s*\n[\s\S]*default:\s*'true'/m);
    assert.match(yml, /name:\s*Preflight Secret Validation/m);
    assert.match(yml, /VERIFY_PUBLISHED_URLS:\s*\$\{\{\s*vars\.VERIFY_PUBLISHED_URLS/m);
    assert.match(yml, /MIN_DRAFT_BODY_CHARS:\s*\$\{\{\s*vars\.MIN_DRAFT_BODY_CHARS/m);
    assert.match(yml, /name:\s*Resolve Target Draft Files/m);
    assert.match(yml, /name:\s*Manual Run Missing Draft Files/m);
    assert.match(yml, /No draft files resolved for manual run/m);
    assert.match(yml, /name:\s*Post-publish Hashnode Duplicate Cleanup/m);
    assert.match(yml, /node scripts\/hashnode-post-publish-dedupe\.js/m);
    assert.match(yml, /HASHNODE_AUTO_DEDUPE:\s*\$\{\{\s*vars\.HASHNODE_AUTO_DEDUPE/m);
    assert.match(yml, /Auto Publish Summary/m);
    assert.match(yml, /\$GITHUB_STEP_SUMMARY/m);
    assert.match(yml, /name:\s*Notify on Failure \(Legacy Inline\)/m);
    assert.match(yml, /if:\s*\$\{\{\s*failure\(\)\s*&&\s*\(vars\.INLINE_FAILURE_NOTIFY == 'true'\)\s*\}\}/m);
});

test('publish-smoke workflow exists as daily dry-run rehearsal', () => {
    const yml = read(PUBLISH_SMOKE_WORKFLOW);

    assert.match(yml, /name:\s*Publish Smoke \(Dry Run\)/m);
    assert.match(yml, /cron:\s*'40 15 \* \* \*'/m);
    assert.match(yml, /DRY_RUN:\s*'true'/m);
    assert.match(yml, /actions\/cache\/restore@v4/m);
    assert.match(yml, /actions\/cache\/save@v4/m);
    assert.match(yml, /name:\s*Preflight Smoke Draft Validation/m);
    assert.match(yml, /run:\s*node scripts\/check-publish-secrets\.js/m);
    assert.match(yml, /name:\s*Build Failure Delta/m);
    assert.match(yml, /Newly Failed Since Previous Run/m);
    assert.match(yml, /Recovered Since Previous Run/m);
    assert.match(yml, /name:\s*Upload Smoke Diagnostics Artifact/m);
    assert.match(yml, /smoke-run\.log/m);
    assert.match(yml, /failed_files<<EOF/m);
});

test('workflow schedules stay pinned to intended KST windows', () => {
    const expected = deriveExpectedSchedule();
    const weekly = read(WEEKLY_CONTENT_WORKFLOW);
    const watchdog = read(SCHEDULE_WATCHDOG_WORKFLOW);
    const smoke = read(PUBLISH_SMOKE_WORKFLOW);

    // Weekly schedule from config
    assert.match(weekly, new RegExp(`cron:\\s*'${escapeRegex(expected.topicCron)}'`, 'm'));
    assert.match(weekly, new RegExp(`cron:\\s*'${escapeRegex(expected.draftCron)}'`, 'm'));

    // Watchdog schedule and grace from config
    assert.match(watchdog, new RegExp(`cron:\\s*'${escapeRegex(expected.watchdogTopicCron)}'`, 'm'));
    assert.match(watchdog, new RegExp(`cron:\\s*'${escapeRegex(expected.watchdogDraftCron)}'`, 'm'));
    assert.match(watchdog, new RegExp(`SCHEDULE_WATCHDOG_GRACE_MINUTES:\\s*'${expected.watchdogGraceMinutes}'`, 'm'));

    // Smoke: Daily 00:40 KST
    assert.match(smoke, /cron:\s*'40 15 \* \* \*'/m);
});

test('pr-sanity workflow enforces regression tests', () => {
    const yml = read(PR_SANITY_WORKFLOW);
    assert.match(yml, /name:\s*Run Regression Tests/m);
    assert.match(yml, /run:\s*npm test/m);
});

test('ci-sanity script blocks schedule drift', () => {
    const script = read(CI_SANITY_SCRIPT);
    assert.match(script, /sync-weekly-schedule\.js --check/m);
});

test('weekly-content workflow includes preflight checks for topic/draft paths', () => {
    const yml = read(WEEKLY_CONTENT_WORKFLOW);

    assert.match(yml, /name:\s*Preflight Topic Inputs/m);
    assert.match(yml, /Missing required secret:\s*MODELS_TOKEN/m);
    assert.match(yml, /name:\s*Preflight Draft Inputs/m);
    assert.match(yml, /scripts\/check-gh-cli-auth\.sh/m);
    assert.match(yml, /name:\s*Enforce Manual Fallback Window/m);
    assert.match(yml, /node scripts\/enforce-manual-fallback-window\.js/m);
    assert.match(yml, /manual_fallback_force:/m);
    assert.match(yml, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/m);
    assert.match(yml, /actions:\s*write/m);
    assert.match(yml, /SKIP_COVER_MAIN_SYNC:\s*'true'/m);
    assert.match(yml, /Waiting for Draft PR merge before triggering Auto Publish/m);
    assert.match(yml, /gh workflow run auto-publish\.yml --ref main -f draft_files=.* -f dry_run=false/m);
    assert.match(yml, /Weekly Workflow Preflight/m);
    assert.match(yml, /\$GITHUB_STEP_SUMMARY/m);
    assert.match(yml, /name:\s*Notify on Failure \(Legacy Inline\)/m);
});

test('notify-on-failure watches all critical workflows', () => {
    const yml = read(NOTIFY_ON_FAILURE_WORKFLOW);
    assert.match(yml, /"Weekly Content Automation"/m);
    assert.match(yml, /"Publish Smoke \(Dry Run\)"/m);
    assert.match(yml, /"Auto Publish \(Content Publisher\)"/m);
    for (const conclusion of FAILED_CONCLUSION_LIST) {
        assert.match(yml, new RegExp(`\\b${escapeRegex(conclusion)}\\b`));
    }
    assert.match(yml, /name:\s*Evaluate Notification Eligibility/m);
    assert.match(yml, /should_notify=/m);
    assert.match(yml, /if:\s*steps\.gate\.outputs\.should_notify == 'true'/m);
    assert.match(yml, /name:\s*Build Failure Context/m);
    assert.match(yml, /node scripts\/build-workflow-failure-context\.js/m);
    assert.match(yml, /node scripts\/send-workflow-failure-notification\.js/m);
    assert.match(yml, /ACTION_GUIDANCE:\s*\$\{\{\s*steps\.context\.outputs\.action_guidance\s*\}\}/m);
    assert.match(yml, /ERROR_HIGHLIGHTS:\s*\$\{\{\s*steps\.context\.outputs\.error_highlights\s*\}\}/m);
    assert.match(yml, /HIGHLIGHT_NOTE:\s*\$\{\{\s*steps\.context\.outputs\.highlight_note\s*\}\}/m);
    assert.match(yml, /name:\s*Write Incident Summary/m);
    assert.match(yml, /Notification: skipped \(non-failure conclusion\)/m);
    assert.match(yml, /Notification: sent/m);
    assert.match(yml, /## Action Guidance/m);
    assert.match(yml, /## Error Highlights/m);
    assert.match(yml, /## Fetch Note/m);
    assert.match(yml, /## Highlight Note/m);
    assert.match(yml, /\$GITHUB_STEP_SUMMARY/m);
});
