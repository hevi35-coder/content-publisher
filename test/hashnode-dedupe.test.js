const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeTitleKey,
    slugifyTitle,
    getNumericSuffixDepth,
    buildDedupePlan
} = require('../lib/hashnode-dedupe');

test('normalizeTitleKey trims and lowercases titles', () => {
    assert.equal(normalizeTitleKey('  Hello   World  '), 'hello world');
});

test('slugifyTitle converts title to hashnode-like slug key', () => {
    assert.equal(
        slugifyTitle('Optimizing Developer Onboarding: A Blueprint'),
        'optimizing-developer-onboarding-a-blueprint'
    );
});

test('getNumericSuffixDepth detects retry suffix depth', () => {
    assert.equal(getNumericSuffixDepth('post-slug'), 0);
    assert.equal(getNumericSuffixDepth('post-slug-1'), 1);
    assert.equal(getNumericSuffixDepth('post-slug-1-2'), 2);
});

test('buildDedupePlan keeps canonical slug and removes retry suffix duplicates', () => {
    const posts = [
        {
            id: 'a',
            title: 'Optimizing Developer Onboarding: A Blueprint for Scalable Teams',
            slug: 'optimizing-developer-onboarding-a-blueprint-for-scalable-teams',
            publishedAt: '2026-02-19T07:25:04Z'
        },
        {
            id: 'b',
            title: 'Optimizing Developer Onboarding: A Blueprint for Scalable Teams',
            slug: 'optimizing-developer-onboarding-a-blueprint-for-scalable-teams-1',
            publishedAt: '2026-02-19T07:25:06Z'
        },
        {
            id: 'c',
            title: 'Optimizing Developer Onboarding: A Blueprint for Scalable Teams',
            slug: 'optimizing-developer-onboarding-a-blueprint-for-scalable-teams-1-1',
            publishedAt: '2026-02-19T07:25:08Z'
        }
    ];

    const plan = buildDedupePlan(posts, 'Optimizing Developer Onboarding: A Blueprint for Scalable Teams');
    assert.equal(plan.keep.id, 'a');
    assert.deepEqual(plan.remove.map((post) => post.id), ['b', 'c']);
    assert.equal(plan.duplicates, 2);
});

test('buildDedupePlan returns no-op when duplicates are absent', () => {
    const posts = [
        {
            id: 'x',
            title: 'One Title',
            slug: 'one-title',
            publishedAt: '2026-02-19T01:00:00Z'
        }
    ];

    const plan = buildDedupePlan(posts, 'One Title');
    assert.equal(plan.keep.id, 'x');
    assert.equal(plan.remove.length, 0);
    assert.equal(plan.duplicates, 0);
});

test('buildDedupePlan safe mode removes only recent retry-suffix duplicates', () => {
    const posts = [
        {
            id: 'a',
            title: 'One Title',
            slug: 'one-title',
            publishedAt: '2026-02-19T07:25:00Z'
        },
        {
            id: 'b',
            title: 'One Title',
            slug: 'one-title-1',
            publishedAt: '2026-02-19T07:25:30Z'
        },
        {
            id: 'c',
            title: 'One Title',
            slug: 'one-title-1-1',
            publishedAt: '2026-02-19T07:25:45Z'
        }
    ];

    const plan = buildDedupePlan(posts, 'One Title', {
        safeMode: true,
        now: '2026-02-19T08:00:00Z',
        maxAgeHours: 2
    });

    assert.equal(plan.keep.id, 'a');
    assert.deepEqual(plan.remove.map((post) => post.id), ['b', 'c']);
    assert.equal(plan.reason, 'SAFE_MODE_SUFFIX_DUPLICATES');
});

test('buildDedupePlan safe mode blocks deletion when canonical base slug is missing in recent window', () => {
    const posts = [
        {
            id: 'old-base',
            title: 'One Title',
            slug: 'one-title',
            publishedAt: '2026-02-18T01:00:00Z'
        },
        {
            id: 'new-1',
            title: 'One Title',
            slug: 'one-title-1',
            publishedAt: '2026-02-19T07:25:30Z'
        },
        {
            id: 'new-2',
            title: 'One Title',
            slug: 'one-title-1-1',
            publishedAt: '2026-02-19T07:25:45Z'
        }
    ];

    const plan = buildDedupePlan(posts, 'One Title', {
        safeMode: true,
        now: '2026-02-19T08:00:00Z',
        maxAgeHours: 2
    });

    assert.equal(plan.keep.id, 'new-1');
    assert.equal(plan.remove.length, 0);
    assert.equal(plan.reason, 'SAFE_MODE_BASE_SLUG_MISSING');
});

test('buildDedupePlan safe mode keeps old duplicates untouched when outside age window', () => {
    const posts = [
        {
            id: 'a',
            title: 'One Title',
            slug: 'one-title',
            publishedAt: '2026-02-18T07:25:00Z'
        },
        {
            id: 'b',
            title: 'One Title',
            slug: 'one-title-1',
            publishedAt: '2026-02-18T07:25:30Z'
        }
    ];

    const plan = buildDedupePlan(posts, 'One Title', {
        safeMode: true,
        now: '2026-02-19T08:00:00Z',
        maxAgeHours: 2
    });

    assert.equal(plan.remove.length, 0);
    assert.equal(plan.reason, 'SAFE_MODE_NO_RECENT_DUPLICATES');
});
