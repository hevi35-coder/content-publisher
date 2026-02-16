const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeGeneratedTopics,
    normalizeCategory
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
});

test('normalizeGeneratedTopics normalizes fields and KR-only title tags', () => {
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
    assert.equal(topics[0].title, 'Modern API Design');
    assert.equal(topics[0].rationale, 'why it matters');

    assert.equal(topics[1].category, 'Productivity');
    assert.equal(topics[1].title, '[KR-Only] How to Keep Focus During Context Switches');

    assert.equal(topics[2].title, '[KR-Only] 이미 태그가 있는 제목');
});
