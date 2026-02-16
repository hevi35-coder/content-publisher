const test = require('node:test');
const assert = require('node:assert/strict');
const { createTopicSlug, resolveTargetProfilesFromTitle } = require('../generate_draft');

test('createTopicSlug keeps Korean titles usable for filenames', () => {
    const slug = createTopicSlug('만다라트의 완벽 가이드');
    assert.ok(slug.length > 0);
    assert.equal(slug, '만다라트의-완벽-가이드');
});

test('createTopicSlug normalizes English punctuation', () => {
    const slug = createTopicSlug('Designing for Chaos: Building Resilient Systems!');
    assert.equal(slug, 'designing-for-chaos-building-resilient-systems');
});

test('createTopicSlug falls back to deterministic hash when title is symbols only', () => {
    const first = createTopicSlug('!!!');
    const second = createTopicSlug('!!!');

    assert.match(first, /^topic-[a-f0-9]{10}$/);
    assert.equal(first, second);
});

test('resolveTargetProfilesFromTitle returns all channels when no language tag is present', () => {
    const result = resolveTargetProfilesFromTitle('System Design for Busy Developers');
    assert.deepEqual(result, {
        profiles: ['devto', 'blogger_kr'],
        isKROnly: false,
        isENOnly: false
    });
});

test('resolveTargetProfilesFromTitle honors KR-Only tag', () => {
    const result = resolveTargetProfilesFromTitle('[KR-Only] 목표 분해 실전 가이드');
    assert.deepEqual(result, {
        profiles: ['blogger_kr'],
        isKROnly: true,
        isENOnly: false
    });
});

test('resolveTargetProfilesFromTitle honors EN-Only tag', () => {
    const result = resolveTargetProfilesFromTitle('[EN-Only] Event-Driven Architecture in Practice');
    assert.deepEqual(result, {
        profiles: ['devto'],
        isKROnly: false,
        isENOnly: true
    });
});

test('resolveTargetProfilesFromTitle rejects conflicting tags', () => {
    assert.throws(
        () => resolveTargetProfilesFromTitle('[KR-Only] [EN-Only] invalid topic'),
        /cannot be combined/
    );
});
