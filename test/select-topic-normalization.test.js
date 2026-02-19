const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeGeneratedTopics,
    normalizeCategory,
    enforceWeeklyTopicMix,
    deriveWeeklyTopicSlots,
    loadWeeklyScheduleConfig
} = require('../select_topic');

test('normalizeGeneratedTopics rejects missing topics array', () => {
    assert.throws(
        () => normalizeGeneratedTopics({}),
        /'topics' array missing/
    );
});

test('normalizeGeneratedTopics rejects missing required topic fields', () => {
    assert.throws(
        () => normalizeGeneratedTopics({
            topics: [{ category: 'Global Dev', title: 'Valid title' }]
        }),
        /topics\[0\]\.rationale is required/
    );
});

test('normalizeCategory maps global-like categories to Global Dev', () => {
    assert.equal(normalizeCategory('Global Dev'), 'Global Dev');
    assert.equal(normalizeCategory('global developer trends'), 'Global Dev');
    assert.equal(normalizeCategory('Productivity'), 'Productivity');
    assert.equal(normalizeCategory('MandaAct habit systems'), 'Productivity');
    assert.equal(normalizeCategory('생산성'), 'Productivity');
});

test('normalizeCategory rejects unknown categories', () => {
    assert.throws(
        () => normalizeCategory('AI Lifestyle'),
        /unknown value "AI Lifestyle"/
    );
});

test('normalizeGeneratedTopics normalizes fields and language target tags', () => {
    const topics = normalizeGeneratedTopics({
        topics: [
            {
                category: 'Global Developer Trends',
                title: '  Modern API Design  ',
                rationale: '  why it matters ',
                mandaact_angle: ' clear execution ',
                target_audience: ' backend developers '
            },
            {
                category: 'Productivity',
                title: 'How to Keep Focus During Context Switches',
                rationale: 'too many interrupts',
                mandaact_angle: 'break goals into 9x9',
                target_audience: 'junior developers'
            },
            {
                category: 'Productivity',
                title: '[KR-Only] 이미 태그가 있는 제목',
                rationale: '기존 태그 유지',
                mandaact_angle: '실행 구조화',
                target_audience: '한국 독자'
            }
        ]
    });

    assert.equal(topics.length, 3);
    assert.equal(topics[0].category, 'Global Dev');
    assert.equal(topics[0].title, '[EN-Only] Modern API Design');
    assert.equal(topics[0].rationale, 'why it matters');

    assert.equal(topics[1].category, 'Productivity');
    assert.equal(topics[1].title, '[KR-Only] How to Keep Focus During Context Switches');

    assert.equal(topics[2].title, '[KR-Only] 이미 태그가 있는 제목');
});

test('normalizeGeneratedTopics rejects unknown category values', () => {
    assert.throws(
        () => normalizeGeneratedTopics({
            topics: [
                {
                    category: 'AI Lifestyle',
                    title: 'Modern API Design',
                    rationale: 'why it matters',
                    mandaact_angle: 'clear execution',
                    target_audience: 'backend developers'
                }
            ]
        }),
        /topics\[0\]\.category has unknown value/
    );
});

test('enforceWeeklyTopicMix rejects insufficient category mix', () => {
    const slotPlan = deriveWeeklyTopicSlots(loadWeeklyScheduleConfig());
    const normalized = normalizeGeneratedTopics({
        topics: [
            {
                category: 'Productivity',
                title: '첫 번째 생산성 주제',
                rationale: 'r1',
                mandaact_angle: 'a1',
                target_audience: 't1'
            },
            {
                category: 'Productivity',
                title: '두 번째 생산성 주제',
                rationale: 'r2',
                mandaact_angle: 'a2',
                target_audience: 't2'
            },
            {
                category: 'Productivity',
                title: '세 번째 생산성 주제',
                rationale: 'r3',
                mandaact_angle: 'a3',
                target_audience: 't3'
            }
        ]
    });

    assert.throws(
        () => enforceWeeklyTopicMix(normalized),
        new RegExp(`require at least ${slotPlan.enCount} Global Dev and ${slotPlan.koCount} Productivity topics`)
    );
});

test('enforceWeeklyTopicMix follows schedule-derived slot order and dedupes titles', () => {
    const slotPlan = deriveWeeklyTopicSlots(loadWeeklyScheduleConfig());
    const normalized = normalizeGeneratedTopics({
        topics: [
            {
                category: 'Productivity',
                title: 'Focus Tactics',
                rationale: 'r1',
                mandaact_angle: 'a1',
                target_audience: 't1'
            },
            {
                category: 'Global Dev',
                title: 'Modern API Design',
                rationale: 'r2',
                mandaact_angle: 'a2',
                target_audience: 't2'
            },
            {
                category: 'Productivity',
                title: 'Focus Tactics',
                rationale: 'r3',
                mandaact_angle: 'a3',
                target_audience: 't3'
            },
            {
                category: 'Productivity',
                title: 'Execution Framework',
                rationale: 'r4',
                mandaact_angle: 'a4',
                target_audience: 't4'
            },
            {
                category: 'Productivity',
                title: 'Habit Loop Design',
                rationale: 'r5',
                mandaact_angle: 'a5',
                target_audience: 't5'
            },
            {
                category: 'Global Dev',
                title: 'CI Guard Rails',
                rationale: 'r6',
                mandaact_angle: 'a6',
                target_audience: 't6'
            }
        ]
    });

    const weeklyTopics = enforceWeeklyTopicMix(normalized);
    assert.equal(weeklyTopics.length, slotPlan.slots.length);

    const expectedEnTitles = ['[EN-Only] Modern API Design'];
    const expectedKoTitles = ['[KR-Only] Focus Tactics', '[KR-Only] Execution Framework', '[KR-Only] Habit Loop Design'];
    let enCursor = 0;
    let koCursor = 0;

    for (let i = 0; i < slotPlan.slots.length; i += 1) {
        if (slotPlan.slots[i] === 'en') {
            assert.equal(weeklyTopics[i].title, expectedEnTitles[enCursor]);
            enCursor += 1;
        } else {
            assert.equal(weeklyTopics[i].title, expectedKoTitles[koCursor]);
            koCursor += 1;
        }
    }
});
