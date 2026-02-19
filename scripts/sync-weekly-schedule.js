#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'weekly-schedule.json');

const FILES = {
    weeklyWorkflow: path.join(ROOT, '.github', 'workflows', 'weekly-content.yml'),
    watchdogWorkflow: path.join(ROOT, '.github', 'workflows', 'schedule-watchdog.yml'),
    scheduleLib: path.join(ROOT, 'lib', 'schedule-watchdog.js'),
    readme: path.join(ROOT, 'README.md'),
    automationFlow: path.join(ROOT, 'AUTOMATION_FLOW.md')
};

const WEEKDAY_INDEX = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6
};

const INDEX_TO_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INDEX_TO_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const INDEX_TO_KO = ['일', '월', '화', '수', '목', '금', '토'];

function parseArgs(argv) {
    return {
        check: argv.includes('--check')
    };
}

function fail(message) {
    throw new Error(message);
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a - b);
}

function parseTime(timeText) {
    const m = String(timeText || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!m) {
        fail(`Invalid weekly_time_kst: ${timeText}`);
    }
    return {
        hour: Number(m[1]),
        minute: Number(m[2])
    };
}

function parseWeekday(value, field) {
    const key = String(value || '').trim().toUpperCase();
    const index = WEEKDAY_INDEX[key];
    if (typeof index !== 'number') {
        fail(`Invalid ${field}: ${value}`);
    }
    return index;
}

function parseWeekdayList(values, field) {
    if (!Array.isArray(values) || values.length === 0) {
        fail(`${field} must be a non-empty array`);
    }
    return values.map((value) => parseWeekday(value, field));
}

function formatLongDayList(indices) {
    return indices.map((index) => INDEX_TO_LONG[index]).join('/');
}

function formatKoDayList(indices) {
    return indices.map((index) => INDEX_TO_KO[index]).join('/');
}

function formatShortDayList(indices) {
    return indices.map((index) => INDEX_TO_SHORT[index]).join('/');
}

function formatShortDayListCsv(indices) {
    return indices.map((index) => INDEX_TO_SHORT[index]).join(', ');
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

function replaceOnce(content, regex, replacement, label) {
    if (!regex.test(content)) {
        fail(`Missing expected pattern for ${label}`);
    }
    return content.replace(regex, replacement);
}

function derive() {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);

    if (cfg.timezone !== 'Asia/Seoul') {
        fail(`Unsupported timezone: ${cfg.timezone}. Only Asia/Seoul is supported.`);
    }

    const time = parseTime(cfg.weekly_time_kst);
    const topicWeekdayKst = parseWeekday(cfg.topic_weekday_kst, 'topic_weekday_kst');
    const draftWeekdaysKst = parseWeekdayList(cfg.draft_weekdays_kst, 'draft_weekdays_kst');
    const enWeekdayKst = parseWeekday(cfg.en_weekday_kst, 'en_weekday_kst');
    const korWeekdaysKst = parseWeekdayList(cfg.kor_weekdays_kst, 'kor_weekdays_kst');
    const watchdogDelayMinutes = Number(cfg.watchdog_delay_minutes);
    const watchdogGraceMinutes = Number(cfg.watchdog_grace_minutes);

    if (!Number.isInteger(watchdogDelayMinutes) || watchdogDelayMinutes < 0) {
        fail(`Invalid watchdog_delay_minutes: ${cfg.watchdog_delay_minutes}`);
    }

    if (!Number.isInteger(watchdogGraceMinutes) || watchdogGraceMinutes < 0) {
        fail(`Invalid watchdog_grace_minutes: ${cfg.watchdog_grace_minutes}`);
    }

    if (watchdogDelayMinutes <= watchdogGraceMinutes) {
        fail(
            `watchdog_delay_minutes (${watchdogDelayMinutes}) must be greater than watchdog_grace_minutes (${watchdogGraceMinutes}).`
        );
    }

    if (!draftWeekdaysKst.includes(enWeekdayKst)) {
        fail('en_weekday_kst must be included in draft_weekdays_kst.');
    }

    const outsideKor = korWeekdaysKst.filter((day) => !draftWeekdaysKst.includes(day));
    if (outsideKor.length > 0) {
        fail('kor_weekdays_kst must be subset of draft_weekdays_kst.');
    }

    const topicUtc = convertKstToUtcDayTime(topicWeekdayKst, time.hour, time.minute);
    const draftUtc = draftWeekdaysKst.map((day) => convertKstToUtcDayTime(day, time.hour, time.minute));
    const draftUtcWeekdays = uniqueSorted(draftUtc.map((entry) => entry.weekdayUtc));

    const topicCron = toCron(topicUtc.minuteUtc, topicUtc.hourUtc, [topicUtc.weekdayUtc]);
    const draftCron = toCron(topicUtc.minuteUtc, topicUtc.hourUtc, draftUtcWeekdays);

    const topicWatchdogKst = shiftKstDayTime(topicWeekdayKst, time.hour, time.minute, watchdogDelayMinutes);
    const draftWatchdogKst = draftWeekdaysKst.map((day) => shiftKstDayTime(day, time.hour, time.minute, watchdogDelayMinutes));

    const topicWatchdogUtc = convertKstToUtcDayTime(
        topicWatchdogKst.weekdayKst,
        topicWatchdogKst.hourKst,
        topicWatchdogKst.minuteKst
    );
    const draftWatchdogUtc = draftWatchdogKst.map((entry) =>
        convertKstToUtcDayTime(entry.weekdayKst, entry.hourKst, entry.minuteKst)
    );
    const draftWatchdogUtcWeekdays = uniqueSorted(draftWatchdogUtc.map((entry) => entry.weekdayUtc));

    const topicWatchdogCron = toCron(topicWatchdogUtc.minuteUtc, topicWatchdogUtc.hourUtc, [topicWatchdogUtc.weekdayUtc]);
    const draftWatchdogCron = toCron(topicWatchdogUtc.minuteUtc, topicWatchdogUtc.hourUtc, draftWatchdogUtcWeekdays);

    const expectedWeekdaysUtc = uniqueSorted([topicUtc.weekdayUtc, ...draftUtcWeekdays]);

    return {
        timeKstText: `${pad2(time.hour)}:${pad2(time.minute)}`,
        timeUtcText: `${pad2(topicUtc.hourUtc)}:${pad2(topicUtc.minuteUtc)}`,
        topicCron,
        draftCron,
        topicWatchdogCron,
        draftWatchdogCron,
        topicWeekdayKstLong: INDEX_TO_LONG[topicWeekdayKst],
        topicWeekdayKstShort: INDEX_TO_SHORT[topicWeekdayKst],
        topicWeekdayUtcLong: INDEX_TO_LONG[topicUtc.weekdayUtc],
        draftWeekdaysKstLong: formatLongDayList(draftWeekdaysKst),
        draftWeekdaysUtcLong: formatLongDayList(draftUtcWeekdays),
        topicWatchdogWeekdayKstLong: INDEX_TO_LONG[topicWatchdogKst.weekdayKst],
        topicWatchdogWeekdayUtcLong: INDEX_TO_LONG[topicWatchdogUtc.weekdayUtc],
        draftWatchdogWeekdaysKstLong: formatLongDayList(uniqueSorted(draftWatchdogKst.map((entry) => entry.weekdayKst))),
        draftWatchdogWeekdaysUtcLong: formatLongDayList(draftWatchdogUtcWeekdays),
        watchdogTimeKstText: `${pad2(topicWatchdogKst.hourKst)}:${pad2(topicWatchdogKst.minuteKst)}`,
        watchdogTimeUtcText: `${pad2(topicWatchdogUtc.hourUtc)}:${pad2(topicWatchdogUtc.minuteUtc)}`,
        watchdogGraceMinutes,
        expectedWeekdaysUtc,
        expectedHourUtc: topicUtc.hourUtc,
        expectedMinuteUtc: topicUtc.minuteUtc,
        draftWeekdaysKo: formatKoDayList(draftWeekdaysKst),
        draftWeekdaysKstShort: formatShortDayList(draftWeekdaysKst),
        draftWeekdaysKstShortCsv: formatShortDayListCsv(draftWeekdaysKst),
        enWeekdayKo: INDEX_TO_KO[enWeekdayKst],
        korWeekdaysKo: formatKoDayList(korWeekdaysKst)
    };
}

function updateWeeklyWorkflow(content, d) {
    let updated = content;

    updated = replaceOnce(
        updated,
        /# 1\. Topic Committee: .*\n\s*- cron: '.*'/,
        `# 1. Topic Committee: ${d.topicWeekdayKstLong} at ${d.timeKstText} KST (${d.topicWeekdayUtcLong} ${d.timeUtcText} UTC)\n    - cron: '${d.topicCron}'`,
        'weekly workflow topic schedule'
    );

    updated = replaceOnce(
        updated,
        /# 2\. Draft Writer: .*\n\s*- cron: '.*'/,
        `# 2. Draft Writer: ${d.draftWeekdaysKstLong} at ${d.timeKstText} KST (${d.draftWeekdaysUtcLong} ${d.timeUtcText} UTC)\n    - cron: '${d.draftCron}'`,
        'weekly workflow draft schedule'
    );

    updated = replaceOnce(
        updated,
        /github\.event\.schedule == '[^']+' \|\| \(github\.event_name == 'workflow_dispatch' && \(github\.event\.inputs\.run_target == 'both' \|\| github\.event\.inputs\.run_target == 'topic'\)\)/g,
        `github.event.schedule == '${d.topicCron}' || (github.event_name == 'workflow_dispatch' && (github.event.inputs.run_target == 'both' || github.event.inputs.run_target == 'topic'))`,
        'weekly workflow topic condition'
    );

    updated = replaceOnce(
        updated,
        /github\.event\.schedule == '[^']+' \|\| \(github\.event_name == 'workflow_dispatch' && \(github\.event\.inputs\.run_target == 'both' \|\| github\.event\.inputs\.run_target == 'draft'\)\)/g,
        `github.event.schedule == '${d.draftCron}' || (github.event_name == 'workflow_dispatch' && (github.event.inputs.run_target == 'both' || github.event.inputs.run_target == 'draft'))`,
        'weekly workflow draft condition'
    );

    updated = replaceOnce(
        updated,
        /- name: Run Topic Committee \([^)]+\)/,
        `- name: Run Topic Committee (${d.topicWeekdayKstShort})`,
        'weekly workflow topic step name'
    );

    updated = replaceOnce(
        updated,
        /- name: Run Draft Writer \([^)]+\)/,
        `- name: Run Draft Writer (${d.draftWeekdaysKstShortCsv})`,
        'weekly workflow draft step name'
    );

    return updated;
}

function updateWatchdogWorkflow(content, d) {
    let updated = content;

    updated = replaceOnce(
        updated,
        /# Run after expected .*\n\s*# .*\n\s*- cron: '.*'/,
        `# Run after expected ${d.timeKstText} KST schedule (grace included)\n    # ${d.topicWatchdogWeekdayKstLong} ${d.watchdogTimeKstText} KST (${d.topicWatchdogWeekdayUtcLong} ${d.watchdogTimeUtcText} UTC)\n    - cron: '${d.topicWatchdogCron}'`,
        'watchdog topic schedule'
    );

    updated = replaceOnce(
        updated,
        /# .*\n\s*- cron: '.*'\n\s*workflow_dispatch:/,
        `# ${d.draftWatchdogWeekdaysKstLong} ${d.watchdogTimeKstText} KST (${d.draftWatchdogWeekdaysUtcLong} ${d.watchdogTimeUtcText} UTC)\n    - cron: '${d.draftWatchdogCron}'\n  workflow_dispatch:`,
        'watchdog draft schedule'
    );

    updated = replaceOnce(
        updated,
        /SCHEDULE_WATCHDOG_GRACE_MINUTES:\s*'\d+'/,
        `SCHEDULE_WATCHDOG_GRACE_MINUTES: '${d.watchdogGraceMinutes}'`,
        'watchdog grace minutes'
    );

    return updated;
}

function updateScheduleLib(content, d) {
    let updated = content;

    updated = replaceOnce(
        updated,
        /const EXPECTED_WEEKDAYS_UTC = new Set\(\[[^\]]+\]\);/,
        `const EXPECTED_WEEKDAYS_UTC = new Set([${d.expectedWeekdaysUtc.join(', ')}]);`,
        'schedule lib weekdays'
    );

    updated = replaceOnce(
        updated,
        /const EXPECTED_HOUR_UTC = \d+;/,
        `const EXPECTED_HOUR_UTC = ${d.expectedHourUtc};`,
        'schedule lib hour'
    );

    updated = replaceOnce(
        updated,
        /const EXPECTED_MINUTE_UTC = \d+;/,
        `const EXPECTED_MINUTE_UTC = ${d.expectedMinuteUtc};`,
        'schedule lib minute'
    );

    return updated;
}

function updateReadme(content, d) {
    let updated = content;

    updated = replaceOnce(
        updated,
        /\| 일요일 \| .* KST \| Topic Selection \|/,
        `| 일요일 | ${d.timeKstText} KST | Topic Selection |`,
        'README sunday row'
    );

    updated = replaceOnce(
        updated,
        /\| [^|]+ \| .* KST \| Draft \+ PR \+ Auto-Merge \(EN: [^,]+, KOR: [^)]+\) \|/,
        `| ${d.draftWeekdaysKo} | ${d.timeKstText} KST | Draft + PR + Auto-Merge (EN: ${d.enWeekdayKo}, KOR: ${d.korWeekdaysKo}) |`,
        'README draft row'
    );

    updated = replaceOnce(
        updated,
        /- 스케줄 cron 가드레일\(주간 .* KST, 스모크 00:40 KST\)/,
        `- 스케줄 cron 가드레일(주간 ${d.timeKstText} KST, 스모크 00:40 KST)`,
        'README guardrail line'
    );

    return updated;
}

function updateAutomationFlow(content, d) {
    let updated = content;

    updated = replaceOnce(
        updated,
        /^[ \t]*[A-Za-z0-9_]+\(\(📅 Sunday .*?\)\) -->\|Trigger\| TopicCommittee$/m,
        `    Sunday((📅 Sunday ${d.timeKstText})) -->|Trigger| TopicCommittee`,
        'automation flow sunday line'
    );

    updated = replaceOnce(
        updated,
        /^[ \t]*[A-Za-z0-9_]+\(\(📅 .*?\)\) -->\|Trigger\| DraftWriter$/m,
        `    DraftSchedule((📅 ${d.draftWeekdaysKstShort} ${d.timeKstText})) -->|Trigger| DraftWriter`,
        'automation flow draft line'
    );

    updated = replaceOnce(
        updated,
        /2\. \*\*.* \(Draft Writer \+ Quality Gate\)\*\*:/,
        `2. **${d.draftWeekdaysKstShort} (Draft Writer + Quality Gate)**:`,
        'automation flow step heading'
    );

    updated = replaceOnce(
        updated,
        /Result: queue order is set for .* \(KO \/ EN\+KO \/ KO\)\./,
        `Result: queue order is set for ${d.draftWeekdaysKstShort} (KO / EN+KO / KO).`,
        'automation flow queue note'
    );

    return updated;
}

function applyFileUpdate(filePath, updater, checkMode, changedFiles) {
    const original = fs.readFileSync(filePath, 'utf8');
    const next = updater(original);

    if (next === original) {
        return;
    }

    changedFiles.push(path.relative(ROOT, filePath));

    if (!checkMode) {
        fs.writeFileSync(filePath, next, 'utf8');
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const d = derive();
    const changedFiles = [];

    applyFileUpdate(FILES.weeklyWorkflow, (content) => updateWeeklyWorkflow(content, d), args.check, changedFiles);
    applyFileUpdate(FILES.watchdogWorkflow, (content) => updateWatchdogWorkflow(content, d), args.check, changedFiles);
    applyFileUpdate(FILES.scheduleLib, (content) => updateScheduleLib(content, d), args.check, changedFiles);
    applyFileUpdate(FILES.readme, (content) => updateReadme(content, d), args.check, changedFiles);
    applyFileUpdate(FILES.automationFlow, (content) => updateAutomationFlow(content, d), args.check, changedFiles);

    if (args.check) {
        if (changedFiles.length > 0) {
            console.error('[schedule-sync] Out-of-sync files detected:');
            changedFiles.forEach((file) => console.error(`- ${file}`));
            process.exit(1);
        }
        console.log('[schedule-sync] OK: all schedule-derived files are in sync.');
        return;
    }

    if (changedFiles.length === 0) {
        console.log('[schedule-sync] No changes required.');
        return;
    }

    console.log('[schedule-sync] Updated files:');
    changedFiles.forEach((file) => console.log(`- ${file}`));
}

main();
