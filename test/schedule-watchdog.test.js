const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    EXPECTED_WEEKDAYS_UTC,
    EXPECTED_HOUR_UTC,
    EXPECTED_MINUTE_UTC,
    getLatestExpectedSlotBefore,
    evaluateWeeklyScheduleHealth
} = require('../lib/schedule-watchdog');

const WEEKDAY_INDEX = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6
};

function parseScheduleConfig() {
    const raw = fs.readFileSync(path.resolve(__dirname, '../config/weekly-schedule.json'), 'utf8');
    const cfg = JSON.parse(raw);

    const m = String(cfg.weekly_time_kst || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    assert.ok(m, 'weekly_time_kst must be HH:MM');

    const hourKst = Number(m[1]);
    const minuteKst = Number(m[2]);
    const topicDayKst = WEEKDAY_INDEX[String(cfg.topic_weekday_kst || '').toUpperCase()];
    const draftDaysKst = cfg.draft_weekdays_kst.map((d) => WEEKDAY_INDEX[String(d).toUpperCase()]);
    const watchdogDelayMinutes = Number(cfg.watchdog_delay_minutes);
    const watchdogGraceMinutes = Number(cfg.watchdog_grace_minutes);
    assert.ok(Number.isInteger(watchdogDelayMinutes) && watchdogDelayMinutes >= 0, 'watchdog_delay_minutes must be >= 0');
    assert.ok(Number.isInteger(watchdogGraceMinutes) && watchdogGraceMinutes >= 0, 'watchdog_grace_minutes must be >= 0');

    const hourUtc = hourKst - 9 < 0 ? hourKst + 15 : hourKst - 9;
    const dayShift = hourKst - 9 < 0 ? -1 : 0;

    const topicDayUtc = (topicDayKst + dayShift + 7) % 7;
    const draftDaysUtc = draftDaysKst.map((day) => (day + dayShift + 7) % 7);

    return {
        hourUtc,
        minuteUtc: minuteKst,
        expectedWeekdaysUtc: [...new Set([topicDayUtc, ...draftDaysUtc])].sort((a, b) => a - b),
        watchdogDelayMinutes,
        watchdogGraceMinutes
    };
}

function toUtcDate(year, monthZeroBased, day, hour, minute) {
    return new Date(Date.UTC(year, monthZeroBased, day, hour, minute, 0, 0));
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

const derived = parseScheduleConfig();
const dueSlot = toUtcDate(2026, 1, 16, derived.hourUtc, derived.minuteUtc); // Monday slot reference


test('expected schedule constants stay aligned with weekly schedule config', () => {
    assert.deepEqual([...EXPECTED_WEEKDAYS_UTC].sort(), derived.expectedWeekdaysUtc);
    assert.equal(EXPECTED_HOUR_UTC, derived.hourUtc);
    assert.equal(EXPECTED_MINUTE_UTC, derived.minuteUtc);
});

test('getLatestExpectedSlotBefore resolves latest due slot with grace cutoff', () => {
    const cutoff = addMinutes(dueSlot, 23 * 60 + 30); // Tuesday before next slot
    const slot = getLatestExpectedSlotBefore(cutoff);
    assert.equal(slot.toISOString(), dueSlot.toISOString());
});

test('evaluateWeeklyScheduleHealth is healthy when matching schedule run exists', () => {
    const result = evaluateWeeklyScheduleHealth({
        now: addMinutes(dueSlot, 150),
        scheduledRunTimes: [addMinutes(dueSlot, 5).toISOString()],
        graceMinutes: 120,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'HEALTHY');
    assert.equal(result.dueSlotUtc, dueSlot.toISOString());
    assert.equal(result.matchedRunAtUtc, addMinutes(dueSlot, 5).toISOString());
});

test('evaluateWeeklyScheduleHealth reports missed when no schedule run is found', () => {
    const result = evaluateWeeklyScheduleHealth({
        now: addMinutes(dueSlot, 150),
        scheduledRunTimes: [addMinutes(dueSlot, -3 * 24 * 60 + 5).toISOString()], // previous Friday run
        graceMinutes: 120,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'MISSED');
    assert.equal(result.dueSlotUtc, dueSlot.toISOString());
    assert.equal(result.matchedRunAtUtc, '');
});

test('watchdog delay stays above grace to avoid stale slot checks', () => {
    assert.ok(
        derived.watchdogDelayMinutes > derived.watchdogGraceMinutes,
        `watchdog_delay_minutes (${derived.watchdogDelayMinutes}) must be > watchdog_grace_minutes (${derived.watchdogGraceMinutes})`
    );
});
