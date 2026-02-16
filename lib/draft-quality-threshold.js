/**
 * Draft quality threshold guard.
 *
 * Keeps generation fail-safe by default when quality score does not
 * reach the required threshold after regeneration attempts.
 */

function getNumericScore(report) {
    if (!report || typeof report.score !== 'number' || Number.isNaN(report.score)) {
        return null;
    }
    return report.score;
}

function enforceDraftQualityThreshold(report, options = {}) {
    const threshold = typeof options.threshold === 'number' ? options.threshold : 70;
    const profileId = options.profileId || 'unknown-profile';
    const attempts = options.attempts ?? '?';
    const maxAttempts = options.maxAttempts ?? '?';
    const allowBelowThreshold = options.allowBelowThreshold === true;

    const score = getNumericScore(report);
    if (score !== null && score >= threshold) {
        return {
            passed: true,
            score,
            threshold,
            allowBelowThreshold
        };
    }

    const scoreText = score === null ? 'N/A' : String(score);
    const message =
        `[QualityGate:draft] ${profileId} score ${scoreText}/${threshold} after ${attempts}/${maxAttempts} attempts`;

    if (allowBelowThreshold) {
        console.warn(`${message} (continuing: ALLOW_LOW_QUALITY_DRAFTS=true)`);
        return {
            passed: false,
            score,
            threshold,
            allowBelowThreshold,
            warning: message
        };
    }

    throw new Error(`${message} (blocked)`);
}

module.exports = {
    enforceDraftQualityThreshold
};
