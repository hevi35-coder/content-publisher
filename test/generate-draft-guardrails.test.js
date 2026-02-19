const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    shouldSkipCoverMainSync,
    allowSameDayRegeneration,
    createTopicSlug,
    stripTopicTags,
    topicMatchesProfile,
    resolveProfilesForKstWeekday,
    toKstDateString,
    hasExistingDraftForProfile,
    filterProfilesWithoutSameDayDraft,
    resolveTargetProfilesFromTitle,
    selectTopicsForProfiles,
    buildDraftedQueueContent,
    extractNextTopicFromQueue
} = require('../generate_draft');

function withEnv(vars, fn) {
    const previous = {};
    for (const [key, value] of Object.entries(vars)) {
        previous[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
        if (typeof value === 'undefined') {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        return fn();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (typeof value === 'undefined') {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test('shouldSkipCoverMainSync defaults to false', () => {
    const prev = process.env.SKIP_COVER_MAIN_SYNC;
    delete process.env.SKIP_COVER_MAIN_SYNC;
    try {
        assert.equal(shouldSkipCoverMainSync(), false);
    } finally {
        if (typeof prev === 'undefined') {
            delete process.env.SKIP_COVER_MAIN_SYNC;
        } else {
            process.env.SKIP_COVER_MAIN_SYNC = prev;
        }
    }
});

test('shouldSkipCoverMainSync is true when env is enabled', () => {
    const prev = process.env.SKIP_COVER_MAIN_SYNC;
    process.env.SKIP_COVER_MAIN_SYNC = 'TrUe';
    try {
        assert.equal(shouldSkipCoverMainSync(), true);
    } finally {
        if (typeof prev === 'undefined') {
            delete process.env.SKIP_COVER_MAIN_SYNC;
        } else {
            process.env.SKIP_COVER_MAIN_SYNC = prev;
        }
    }
});

test('allowSameDayRegeneration defaults to false and respects explicit true', () => {
    withEnv({ ALLOW_SAME_DAY_REGEN: undefined }, () => {
        assert.equal(allowSameDayRegeneration(), false);
    });
    withEnv({ ALLOW_SAME_DAY_REGEN: 'true' }, () => {
        assert.equal(allowSameDayRegeneration(), true);
    });
});

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

test('stripTopicTags removes bracket tags used for routing', () => {
    const cleaned = stripTopicTags('[KR-Only] [SEO] 목표 분해 실전 가이드');
    assert.equal(cleaned, '목표 분해 실전 가이드');
});

test('topicMatchesProfile enforces profile-specific language target tags', () => {
    assert.equal(topicMatchesProfile('[KR-Only] Focus Tactics', 'blogger_kr'), true);
    assert.equal(topicMatchesProfile('[KR-Only] Focus Tactics', 'devto'), false);
    assert.equal(topicMatchesProfile('[EN-Only] Modern API Design', 'devto'), true);
    assert.equal(topicMatchesProfile('[EN-Only] Modern API Design', 'blogger_kr'), false);
});

test('resolveProfilesForKstWeekday returns both profiles on shared day', () => {
    const profiles = resolveProfilesForKstWeekday('THU', {
        enWeekdayKst: 'THU',
        korWeekdaysKst: ['TUE', 'THU', 'SAT']
    });
    assert.deepEqual(profiles, ['devto', 'blogger_kr']);
});

test('toKstDateString uses Asia/Seoul date boundaries', () => {
    const kstDate = toKstDateString(new Date('2026-02-19T00:30:00Z'));
    assert.equal(kstDate, '2026-02-19');
});

test('hasExistingDraftForProfile detects EN and KO draft files separately', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-guardrails-'));
    try {
        fs.writeFileSync(path.join(tempDir, '2026-02-19-api-reliability.md'), '---\n---\n');
        fs.writeFileSync(path.join(tempDir, '2026-02-19-9x9-plan-ko.md'), '---\n---\n');

        assert.equal(hasExistingDraftForProfile('devto', '2026-02-19', tempDir), true);
        assert.equal(hasExistingDraftForProfile('blogger_kr', '2026-02-19', tempDir), true);
        assert.equal(hasExistingDraftForProfile('blogger_kr', '2026-02-20', tempDir), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('filterProfilesWithoutSameDayDraft skips profiles with existing daily drafts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-guardrails-'));
    try {
        fs.writeFileSync(path.join(tempDir, '2026-02-19-api-reliability.md'), '---\n---\n');

        withEnv({ ALLOW_SAME_DAY_REGEN: 'false' }, () => {
            const result = filterProfilesWithoutSameDayDraft(
                ['devto', 'blogger_kr'],
                new Date('2026-02-19T01:00:00Z'),
                tempDir
            );
            assert.equal(result.kstDate, '2026-02-19');
            assert.deepEqual(result.activeProfiles, ['blogger_kr']);
            assert.deepEqual(result.skippedProfiles, ['devto']);
        });
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('filterProfilesWithoutSameDayDraft keeps all profiles when override is enabled', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-guardrails-'));
    try {
        fs.writeFileSync(path.join(tempDir, '2026-02-19-api-reliability.md'), '---\n---\n');
        fs.writeFileSync(path.join(tempDir, '2026-02-19-9x9-plan-ko.md'), '---\n---\n');

        withEnv({ ALLOW_SAME_DAY_REGEN: 'true' }, () => {
            const result = filterProfilesWithoutSameDayDraft(
                ['devto', 'blogger_kr'],
                new Date('2026-02-19T01:00:00Z'),
                tempDir
            );
            assert.deepEqual(result.activeProfiles, ['devto', 'blogger_kr']);
            assert.deepEqual(result.skippedProfiles, []);
        });
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

test('extractNextTopicFromQueue supports profile filter with used title exclusions', () => {
    const queue = [
        '## On Deck (Next Up)',
        '*   **[KR-Only] Habit Reset Plan**',
        '    *   *Rationale*: build consistency',
        '    *   *MandaAct Angle*: 9x9 daily action',
        '*   **[EN-Only] Event-Driven Architecture**',
        '    *   *Rationale*: scalable systems',
        '    *   *MandaAct Angle*: map migration milestones',
        ''
    ].join('\n');

    const enTopic = extractNextTopicFromQueue(queue, { profileId: 'devto' });
    const koTopic = extractNextTopicFromQueue(queue, { profileId: 'blogger_kr', usedTitles: [enTopic.title] });

    assert.equal(enTopic.title, '[EN-Only] Event-Driven Architecture');
    assert.equal(koTopic.title, '[KR-Only] Habit Reset Plan');
});

test('selectTopicsForProfiles picks distinct topics for each profile', () => {
    const queue = [
        '## On Deck (Next Up)',
        '*   **[KR-Only] Morning Momentum Blueprint**',
        '    *   *Rationale*: improve consistency',
        '    *   *MandaAct Angle*: break routine into 9x9',
        '*   **[EN-Only] Optimizing API Reliability**',
        '    *   *Rationale*: backend incidents',
        '    *   *MandaAct Angle*: define incident playbooks',
        ''
    ].join('\n');

    const selected = selectTopicsForProfiles(queue, ['devto', 'blogger_kr']);
    assert.equal(selected.length, 2);
    assert.equal(selected[0].profileId, 'devto');
    assert.equal(selected[0].topic.title, '[EN-Only] Optimizing API Reliability');
    assert.equal(selected[1].profileId, 'blogger_kr');
    assert.equal(selected[1].topic.title, '[KR-Only] Morning Momentum Blueprint');
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
