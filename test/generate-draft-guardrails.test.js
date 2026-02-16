const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createTopicSlug,
    resolveTargetProfilesFromTitle,
    buildDraftedQueueContent,
    extractNextTopicFromQueue
} = require('../generate_draft');

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

test('buildDraftedQueueContent updates the exact topic line once', () => {
    const queue = [
        '## On Deck (Next Up)',
        '*   **[KR-Only] Focus Tactics**',
        '    *   *Rationale*: test',
        ''
    ].join('\n');

    const updated = buildDraftedQueueContent(queue, '[KR-Only] Focus Tactics', '✅ EN:80 KO:82');
    assert.match(updated, /\*   \*\*\[KR-Only\] Focus Tactics\*\* \(Drafted ✅ EN:80 KO:82\)/);
});

test('buildDraftedQueueContent rejects when topic line is missing', () => {
    const queue = [
        '## On Deck (Next Up)',
        '*   **[KR-Only] Another Topic**',
        ''
    ].join('\n');

    assert.throws(
        () => buildDraftedQueueContent(queue, '[KR-Only] Focus Tactics', '✅ EN:80 KO:82'),
        /topic line not found/
    );
});

test('buildDraftedQueueContent rejects duplicate topic lines', () => {
    const queue = [
        '## On Deck (Next Up)',
        '*   **[KR-Only] Focus Tactics**',
        '*   **[KR-Only] Focus Tactics**',
        ''
    ].join('\n');

    assert.throws(
        () => buildDraftedQueueContent(queue, '[KR-Only] Focus Tactics', '✅ EN:80 KO:82'),
        /duplicate topic lines/
    );
});

test('extractNextTopicFromQueue skips drafted topics and parses first pending topic', () => {
    const queue = [
        '## On Deck (Next Up)',
        '* **[KR-Only] Done Topic** (Drafted ✅ EN:Skip KO:78)',
        '  * *Rationale*: already done',
        '  * *MandaAct Angle*: done angle',
        '*   **Global Topic Next**',
        '    *   *Rationale*: latest trend',
        '    *   *MandaAct Angle*: map steps with 9x9',
        '    *   *Target*: developers',
        ''
    ].join('\n');

    const topic = extractNextTopicFromQueue(queue);
    assert.equal(topic.title, 'Global Topic Next');
    assert.equal(topic.rationale, 'latest trend');
    assert.equal(topic.angle, 'map steps with 9x9');
    assert.match(topic.fullMatch, /\*\s+\*\*Global Topic Next\*\*/);
    assert.match(topic.fullMatch, /\*Rationale\*:\s+latest trend/);
    assert.match(topic.fullMatch, /\*MandaAct Angle\*:\s+map steps with 9x9/);
});

test('extractNextTopicFromQueue tolerates CRLF and ignores incomplete blocks', () => {
    const queue = [
        '## On Deck (Next Up)',
        '*   **Broken Topic**',
        '    *   *Rationale*: missing angle',
        '*   **[KR-Only] Valid Topic**',
        '    *   *Rationale*: clear steps',
        '    *   *MandaAct Angle*: break into execution cells',
        ''
    ].join('\r\n');

    const topic = extractNextTopicFromQueue(queue);
    assert.equal(topic.title, '[KR-Only] Valid Topic');
    assert.equal(topic.rationale, 'clear steps');
    assert.equal(topic.angle, 'break into execution cells');
});
