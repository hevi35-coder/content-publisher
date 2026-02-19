const { getLatestExpectedSlotBefore } = require('./schedule-watchdog');

function toIsoStringOrEmpty(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return '';
    }
    return value.toISOString();
}

function normalizeRunTimes(runTimes = []) {
    return runTimes
        .map((value) => (value instanceof Date ? value : new Date(value)))
        .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
        .sort((a, b) => b.getTime() - a.getTime());
}

function evaluateManualFallbackEligibility({
    now = new Date(),
    scheduledRunTimes = [],
    minDelayMinutes = 60,
    earlyAllowanceMinutes = 15
} = {}) {
    const nowUtc = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(nowUtc.getTime())) {
        throw new Error('Invalid "now" value');
    }

    const dueSlotUtc = getLatestExpectedSlotBefore(nowUtc);
    if (!dueSlotUtc) {
        return {
            status: 'BLOCKED_NO_DUE_SLOT',
            reason: 'NO_DUE_SLOT',
            nowUtc: toIsoStringOrEmpty(nowUtc),
            dueSlotUtc: '',
            waitUntilUtc: '',
            matchedRunAtUtc: ''
        };
    }

    const waitUntilUtc = new Date(dueSlotUtc.getTime() + minDelayMinutes * 60 * 1000);
    if (nowUtc < waitUntilUtc) {
        return {
            status: 'BLOCKED_TOO_EARLY',
            reason: 'TOO_EARLY',
            nowUtc: toIsoStringOrEmpty(nowUtc),
            dueSlotUtc: toIsoStringOrEmpty(dueSlotUtc),
            waitUntilUtc: toIsoStringOrEmpty(waitUntilUtc),
            matchedRunAtUtc: ''
        };
    }

    const windowStartUtc = new Date(dueSlotUtc.getTime() - earlyAllowanceMinutes * 60 * 1000);
    const runs = normalizeRunTimes(scheduledRunTimes);
    const matchedRun = runs.find((runAt) => runAt >= windowStartUtc && runAt <= nowUtc);
    if (matchedRun) {
        return {
            status: 'BLOCKED_ALREADY_TRIGGERED',
            reason: 'ALREADY_TRIGGERED',
            nowUtc: toIsoStringOrEmpty(nowUtc),
            dueSlotUtc: toIsoStringOrEmpty(dueSlotUtc),
            waitUntilUtc: toIsoStringOrEmpty(waitUntilUtc),
            matchedRunAtUtc: toIsoStringOrEmpty(matchedRun)
        };
    }

    return {
        status: 'ALLOWED',
        reason: 'ELIGIBLE',
        nowUtc: toIsoStringOrEmpty(nowUtc),
        dueSlotUtc: toIsoStringOrEmpty(dueSlotUtc),
        waitUntilUtc: toIsoStringOrEmpty(waitUntilUtc),
        matchedRunAtUtc: ''
    };
}

module.exports = {
    evaluateManualFallbackEligibility
};
