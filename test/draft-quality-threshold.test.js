const test = require('node:test');
const assert = require('node:assert/strict');

const { enforceDraftQualityThreshold } = require('../lib/draft-quality-threshold');

test('enforceDraftQualityThreshold passes when score meets threshold', () => {
    const result = enforceDraftQualityThreshold(
        { score: 82 },
        { profileId: 'devto', threshold: 70, attempts: 1, maxAttempts: 3 }
    );

    assert.equal(result.passed, true);
    assert.equal(result.score, 82);
});

test('enforceDraftQualityThreshold blocks when score is below threshold', () => {
    assert.throws(
        () => enforceDraftQualityThreshold(
            { score: 64 },
            { profileId: 'blogger_kr', threshold: 70, attempts: 3, maxAttempts: 3 }
        ),
        /\[QualityGate:draft\] blogger_kr score 64\/70/
    );
});

test('enforceDraftQualityThreshold blocks when report is missing', () => {
    assert.throws(
        () => enforceDraftQualityThreshold(
            null,
            { profileId: 'devto', threshold: 70, attempts: 3, maxAttempts: 3 }
        ),
        /score N\/A\/70/
    );
});

test('enforceDraftQualityThreshold allows continuation when override is enabled', () => {
    const result = enforceDraftQualityThreshold(
        { score: 50 },
        {
            profileId: 'devto',
            threshold: 70,
            attempts: 3,
            maxAttempts: 3,
            allowBelowThreshold: true
        }
    );

    assert.equal(result.passed, false);
    assert.equal(result.allowBelowThreshold, true);
    assert.match(result.warning, /\[QualityGate:draft\] devto score 50\/70/);
});
