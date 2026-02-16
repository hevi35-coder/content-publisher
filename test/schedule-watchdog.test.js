const test = require('node:test');
const assert = require('node:assert/strict');

const {
    EXPECTED_WEEKDAYS_UTC,
    getLatestExpectedSlotBefore,
    evaluateWeeklyScheduleHealth
} = require('../lib/schedule-watchdog');

test('expected schedule weekdays set is fixed to 0/2/4/6 UTC', () => {
    assert.deepEqual([...EXPECTED_WEEKDAYS_UTC].sort(), [0, 2, 4, 6]);
});

test('getLatestExpectedSlotBefore resolves latest due slot with grace cutoff', () => {
    const cutoff = new Date('2026-02-16T16:30:00Z'); // Monday UTC
    const slot = getLatestExpectedSlotBefore(cutoff);
    assert.equal(slot.toISOString(), '2026-02-15T16:00:00.000Z'); // Sunday slot
});

test('evaluateWeeklyScheduleHealth is healthy when matching schedule run exists', () => {
    const result = evaluateWeeklyScheduleHealth({
        now: new Date('2026-02-16T18:30:00Z'),
        scheduledRunTimes: ['2026-02-15T16:35:00Z'],
        graceMinutes: 120,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'HEALTHY');
    assert.equal(result.dueSlotUtc, '2026-02-15T16:00:00.000Z');
    assert.equal(result.matchedRunAtUtc, '2026-02-15T16:35:00.000Z');
});

test('evaluateWeeklyScheduleHealth reports missed when no schedule run is found', () => {
    const result = evaluateWeeklyScheduleHealth({
        now: new Date('2026-02-16T18:30:00Z'),
        scheduledRunTimes: ['2026-02-13T16:05:00Z'],
        graceMinutes: 120,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'MISSED');
    assert.equal(result.dueSlotUtc, '2026-02-15T16:00:00.000Z');
    assert.equal(result.matchedRunAtUtc, '');
});
