const EXPECTED_WEEKDAYS_UTC = new Set([0, 2, 4, 6]);
const EXPECTED_HOUR_UTC = 16;
const EXPECTED_MINUTE_UTC = 0;

function toIsoStringOrEmpty(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return '';
    }
    return value.toISOString();
}

function getLatestExpectedSlotBefore(cutoffUtc) {
    if (!(cutoffUtc instanceof Date) || Number.isNaN(cutoffUtc.getTime())) {
        return null;
    }

    const baseYear = cutoffUtc.getUTCFullYear();
    const baseMonth = cutoffUtc.getUTCMonth();
    const baseDay = cutoffUtc.getUTCDate();

    for (let daysBack = 0; daysBack <= 8; daysBack += 1) {
        const candidate = new Date(
            Date.UTC(baseYear, baseMonth, baseDay - daysBack, EXPECTED_HOUR_UTC, EXPECTED_MINUTE_UTC, 0, 0)
        );
        if (!EXPECTED_WEEKDAYS_UTC.has(candidate.getUTCDay())) {
            continue;
        }
        if (candidate <= cutoffUtc) {
            return candidate;
        }
    }

    return null;
}

function normalizeRunTimes(runTimes = []) {
    return runTimes
        .map((value) => (value instanceof Date ? value : new Date(value)))
        .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
        .sort((a, b) => b.getTime() - a.getTime());
}

function evaluateWeeklyScheduleHealth({
    now = new Date(),
    scheduledRunTimes = [],
    graceMinutes = 120,
    earlyAllowanceMinutes = 15
} = {}) {
    const nowUtc = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(nowUtc.getTime())) {
        throw new Error('Invalid "now" value');
    }

    const cutoffUtc = new Date(nowUtc.getTime() - graceMinutes * 60 * 1000);
    const dueSlotUtc = getLatestExpectedSlotBefore(cutoffUtc);

    if (!dueSlotUtc) {
        return {
            status: 'NO_EXPECTED_SLOT',
            message: 'No expected schedule slot found in lookback window.',
            nowUtc: toIsoStringOrEmpty(nowUtc),
            cutoffUtc: toIsoStringOrEmpty(cutoffUtc),
            dueSlotUtc: '',
            windowStartUtc: '',
            matchedRunAtUtc: ''
        };
    }

    const windowStartUtc = new Date(dueSlotUtc.getTime() - earlyAllowanceMinutes * 60 * 1000);
    const runs = normalizeRunTimes(scheduledRunTimes);
    const matchedRun = runs.find((runAt) => runAt >= windowStartUtc && runAt <= nowUtc);

    if (matchedRun) {
        return {
            status: 'HEALTHY',
            message: 'Expected schedule slot has a matching scheduled run.',
            nowUtc: toIsoStringOrEmpty(nowUtc),
            cutoffUtc: toIsoStringOrEmpty(cutoffUtc),
            dueSlotUtc: toIsoStringOrEmpty(dueSlotUtc),
            windowStartUtc: toIsoStringOrEmpty(windowStartUtc),
            matchedRunAtUtc: toIsoStringOrEmpty(matchedRun)
        };
    }

    return {
        status: 'MISSED',
        message: 'No scheduled run found for the expected slot within the watchdog window.',
        nowUtc: toIsoStringOrEmpty(nowUtc),
        cutoffUtc: toIsoStringOrEmpty(cutoffUtc),
        dueSlotUtc: toIsoStringOrEmpty(dueSlotUtc),
        windowStartUtc: toIsoStringOrEmpty(windowStartUtc),
        matchedRunAtUtc: ''
    };
}

module.exports = {
    EXPECTED_WEEKDAYS_UTC,
    EXPECTED_HOUR_UTC,
    EXPECTED_MINUTE_UTC,
    getLatestExpectedSlotBefore,
    evaluateWeeklyScheduleHealth
};
