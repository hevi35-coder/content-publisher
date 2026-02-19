const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateManualFallbackEligibility } = require('../lib/manual-fallback-guard');

function utcDate(year, monthZeroBased, day, hour, minute) {
    return new Date(Date.UTC(year, monthZeroBased, day, hour, minute, 0, 0));
}

test('manual fallback guard blocks when called before T+60 window', () => {
    const dueSlot = utcDate(2026, 1, 19, 7, 7); // Thu 16:07 KST
    const now = utcDate(2026, 1, 19, 7, 30);

    const result = evaluateManualFallbackEligibility({
        now,
        scheduledRunTimes: [],
        minDelayMinutes: 60,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'BLOCKED_TOO_EARLY');
    assert.equal(result.dueSlotUtc, dueSlot.toISOString());
    assert.equal(result.waitUntilUtc, utcDate(2026, 1, 19, 8, 7).toISOString());
});

test('manual fallback guard blocks when schedule already triggered in due window', () => {
    const now = utcDate(2026, 1, 19, 9, 0);
    const scheduledRun = utcDate(2026, 1, 19, 7, 54);

    const result = evaluateManualFallbackEligibility({
        now,
        scheduledRunTimes: [scheduledRun.toISOString()],
        minDelayMinutes: 60,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'BLOCKED_ALREADY_TRIGGERED');
    assert.equal(result.matchedRunAtUtc, scheduledRun.toISOString());
});

test('manual fallback guard allows after T+60 when no schedule run exists', () => {
    const now = utcDate(2026, 1, 19, 9, 0);

    const result = evaluateManualFallbackEligibility({
        now,
        scheduledRunTimes: [],
        minDelayMinutes: 60,
        earlyAllowanceMinutes: 15
    });

    assert.equal(result.status, 'ALLOWED');
    assert.equal(result.reason, 'ELIGIBLE');
});
