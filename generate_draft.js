/**
 * Draft Generator v2 - Multi-language parallel content generation
 * 
 * Features:
 * - Trend validation before generation
 * - Parallel EN/KO draft generation
 * - Tone profile-based prompts
 * - Quality gate with regeneration loop
 * - Cover image generation for each language
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');
const config = require('./config');
const client = require('./lib/ai-client');
const { notifier } = require('./lib/notifier');
const { getProfile, buildPromptInstructions } = require('./lib/tone-profiles');
const { validateTrend, buildAvoidanceInstructions, shouldRejectTopic } = require('./lib/trend-validator');
const { checkQuality } = require('./draft-quality-gate');
const { enforceDraftQualityThreshold } = require('./lib/draft-quality-threshold');
const { injectCTAToFile } = require('./lib/cta-injector');
const { pushCoversToMain, shouldRequireGitSyncSuccess } = require('./lib/git-manager');
const { sanitizeDraftMarkdownContent } = require('./lib/draft-cleaner');

const QUEUE_PATH = config.paths.queue;
const CONTEXT_PATH = config.paths.context;
const DRAFTS_DIR = config.paths.drafts;
const WEEKLY_SCHEDULE_PATH = path.join(__dirname, 'config', 'weekly-schedule.json');

// Configuration
const MAX_REGENERATION_ATTEMPTS = 3;
const QUALITY_THRESHOLD = 70;
const KR_ONLY_TAG = '[KR-Only]';
const EN_ONLY_TAG = '[EN-Only]';
const INDEX_TO_WEEKDAY_KEY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_SCHEDULE = Object.freeze({
    en_weekday_kst: 'WED',
    kor_weekdays_kst: ['MON', 'WED', 'FRI']
});

function allowLowQualityDrafts() {
    return String(process.env.ALLOW_LOW_QUALITY_DRAFTS || '').toLowerCase() === 'true';
}

function shouldSkipCoverMainSync() {
    return String(process.env.SKIP_COVER_MAIN_SYNC || '').toLowerCase() === 'true';
}

function allowSameDayRegeneration() {
    return String(process.env.ALLOW_SAME_DAY_REGEN || '').toLowerCase() === 'true';
}

function createTopicSlug(title) {
    const normalizedTitle = String(title || '')
        .toLowerCase()
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/(^-|-$)+/g, '');

    if (normalizedTitle) {
        return normalizedTitle;
    }

    const hash = crypto
        .createHash('sha1')
        .update(String(title || 'untitled-topic'))
        .digest('hex')
        .slice(0, 10);

    return `topic-${hash}`;
}

function resolveTargetProfilesFromTitle(title) {
    const rawTitle = String(title || '');
    const isKROnly = rawTitle.includes(KR_ONLY_TAG);
    const isENOnly = rawTitle.includes(EN_ONLY_TAG);

    if (isKROnly && isENOnly) {
        throw new Error(`Invalid topic tags: ${KR_ONLY_TAG} and ${EN_ONLY_TAG} cannot be combined.`);
    }

    const profiles = [];
    if (!isKROnly) profiles.push('devto');
    if (!isENOnly) profiles.push('blogger_kr');

    if (profiles.length === 0) {
        throw new Error('No generation targets resolved from topic tags.');
    }

    return { profiles, isKROnly, isENOnly };
}

function stripTopicTags(title) {
    return String(title || '').replace(/\[.*?\]\s*/g, '').trim();
}

function topicMatchesProfile(title, profileId) {
    const rawTitle = String(title || '');
    const isKROnly = rawTitle.includes(KR_ONLY_TAG);
    const isENOnly = rawTitle.includes(EN_ONLY_TAG);

    if (isKROnly && isENOnly) {
        return false;
    }

    if (profileId === 'blogger_kr') {
        return isKROnly && !isENOnly;
    }

    if (profileId === 'devto') {
        return !isKROnly;
    }

    return true;
}

function normalizeWeekdayKey(value, fieldName) {
    const key = String(value || '').trim().toUpperCase();
    if (!INDEX_TO_WEEKDAY_KEY.includes(key)) {
        throw new Error(`Invalid ${fieldName}: ${value}`);
    }
    return key;
}

function loadWeeklyScheduleConfig() {
    if (!fs.existsSync(WEEKLY_SCHEDULE_PATH)) {
        return {
            enWeekdayKst: DEFAULT_SCHEDULE.en_weekday_kst,
            korWeekdaysKst: [...DEFAULT_SCHEDULE.kor_weekdays_kst]
        };
    }

    const raw = fs.readFileSync(WEEKLY_SCHEDULE_PATH, 'utf8');
    const json = JSON.parse(raw);

    const enWeekdayKst = normalizeWeekdayKey(
        json.en_weekday_kst || DEFAULT_SCHEDULE.en_weekday_kst,
        'en_weekday_kst'
    );
    const korWeekdaysKst = Array.isArray(json.kor_weekdays_kst) && json.kor_weekdays_kst.length > 0
        ? json.kor_weekdays_kst.map((value) => normalizeWeekdayKey(value, 'kor_weekdays_kst'))
        : [...DEFAULT_SCHEDULE.kor_weekdays_kst];

    return {
        enWeekdayKst,
        korWeekdaysKst
    };
}

function getKstWeekdayKey(now = new Date()) {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        weekday: 'short'
    }).format(now);

    switch (weekday) {
    case 'Sun':
        return 'SUN';
    case 'Mon':
        return 'MON';
    case 'Tue':
        return 'TUE';
    case 'Wed':
        return 'WED';
    case 'Thu':
        return 'THU';
    case 'Fri':
        return 'FRI';
    case 'Sat':
        return 'SAT';
    default:
        throw new Error(`Unexpected KST weekday token: ${weekday}`);
    }
}

function resolveProfilesForKstWeekday(weekdayKey, schedule = loadWeeklyScheduleConfig()) {
    const key = normalizeWeekdayKey(weekdayKey, 'weekdayKey');
    const profiles = [];

    if (key === schedule.enWeekdayKst) {
        profiles.push('devto');
    }

    if (schedule.korWeekdaysKst.includes(key)) {
        profiles.push('blogger_kr');
    }

    return profiles;
}

function getProfilesForCurrentRun(now = new Date(), schedule = loadWeeklyScheduleConfig()) {
    const weekdayKey = getKstWeekdayKey(now);
    const scheduledProfiles = resolveProfilesForKstWeekday(weekdayKey, schedule);

    if (scheduledProfiles.length > 0) {
        return {
            weekdayKey,
            profiles: scheduledProfiles,
            fromSchedule: true
        };
    }

    return {
        weekdayKey,
        profiles: ['devto', 'blogger_kr'],
        fromSchedule: false
    };
}

function toKstDateString(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
}

function hasExistingDraftForProfile(profileId, kstDateString, draftsDir = DRAFTS_DIR) {
    if (!fs.existsSync(draftsDir)) {
        return false;
    }

    const prefix = `${String(kstDateString || '').trim()}-`;
    if (!prefix || prefix === '-') {
        return false;
    }

    const entries = fs.readdirSync(draftsDir, { withFileTypes: true });
    return entries.some((entry) => {
        if (!entry.isFile()) return false;
        const name = entry.name;
        if (!name.startsWith(prefix) || !name.endsWith('.md')) {
            return false;
        }

        const isKoreanDraft = /-ko\.md$/i.test(name);
        if (profileId === 'blogger_kr') {
            return isKoreanDraft;
        }
        if (profileId === 'devto') {
            return !isKoreanDraft;
        }

        return false;
    });
}

function filterProfilesWithoutSameDayDraft(profileIds, now = new Date(), draftsDir = DRAFTS_DIR) {
    const kstDate = toKstDateString(now);
    if (allowSameDayRegeneration()) {
        return {
            kstDate,
            activeProfiles: [...profileIds],
            skippedProfiles: []
        };
    }

    const activeProfiles = [];
    const skippedProfiles = [];
    for (const profileId of profileIds) {
        if (hasExistingDraftForProfile(profileId, kstDate, draftsDir)) {
            skippedProfiles.push(profileId);
        } else {
            activeProfiles.push(profileId);
        }
    }

    return {
        kstDate,
        activeProfiles,
        skippedProfiles
    };
}

function escapeRegExp(string) {
    return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDraftedQueueContent(queueContent, originalTitle, qualityBadge) {
    const safeQueueContent = String(queueContent || '');
    const safeTitle = String(originalTitle || '').trim();
    const safeBadge = String(qualityBadge || '').trim();

    if (!safeTitle) {
        throw new Error('Cannot update queue: original title is empty.');
    }
    if (!safeBadge) {
        throw new Error('Cannot update queue: quality badge is empty.');
    }

    const titleLinePattern = `^\\*\\s+\\*\\*${escapeRegExp(safeTitle)}\\*\\*\\s*$`;
    const exactLineRegexGlobal = new RegExp(titleLinePattern, 'gm');
    const matches = safeQueueContent.match(exactLineRegexGlobal) || [];

    if (matches.length === 0) {
        throw new Error(`Cannot update queue: topic line not found for "${safeTitle}".`);
    }
    if (matches.length > 1) {
        throw new Error(`Cannot update queue: duplicate topic lines found for "${safeTitle}".`);
    }

    const exactLineRegexSingle = new RegExp(titleLinePattern, 'm');
    return safeQueueContent.replace(
        exactLineRegexSingle,
        `*   **${safeTitle}** (Drafted ${safeBadge})`
    );
}

function normalizeUsedTitlesSet(usedTitles) {
    if (usedTitles instanceof Set) {
        return new Set([...usedTitles].map((title) => String(title || '').trim().toLowerCase()));
    }

    if (!usedTitles) {
        return new Set();
    }

    if (Array.isArray(usedTitles)) {
        return new Set(usedTitles.map((title) => String(title || '').trim().toLowerCase()));
    }

    return new Set([String(usedTitles || '').trim().toLowerCase()]);
}

function extractNextTopicFromQueue(queueContent, options = {}) {
    const { profileId = null, usedTitles = null } = options;
    const lines = String(queueContent || '').split(/\r?\n/);
    const titleRegex = /^\*\s+\*\*(.+?)\*\*(.*)$/;
    const rationaleRegex = /^\s*\*\s+\*Rationale\*:\s+(.+?)\s*$/i;
    const angleRegex = /^\s*\*\s+\*MandaAct Angle\*:\s+(.+?)\s*$/i;
    const usedTitleSet = normalizeUsedTitlesSet(usedTitles);

    for (let index = 0; index < lines.length; index++) {
        const titleMatch = lines[index].match(titleRegex);
        if (!titleMatch) {
            continue;
        }

        const suffix = String(titleMatch[2] || '');
        if (/\((?:Drafted|Published)\b/i.test(suffix)) {
            continue;
        }

        const rawTitle = titleMatch[1].trim();
        if (usedTitleSet.has(rawTitle.toLowerCase())) {
            continue;
        }

        if (profileId && !topicMatchesProfile(rawTitle, profileId)) {
            continue;
        }

        let rationale = '';
        let angle = '';
        let blockEnd = index;

        for (let cursor = index + 1; cursor < lines.length; cursor++) {
            const line = lines[cursor];
            if (/^\*\s+\*\*/.test(line) || /^##\s+/.test(line)) {
                break;
            }

            blockEnd = cursor;
            const rationaleMatch = line.match(rationaleRegex);
            if (rationaleMatch) {
                rationale = rationaleMatch[1].trim();
                continue;
            }

            const angleMatch = line.match(angleRegex);
            if (angleMatch) {
                angle = angleMatch[1].trim();
            }
        }

        if (!rationale || !angle) {
            continue;
        }

        return {
            fullMatch: lines.slice(index, blockEnd + 1).join('\n'),
            title: rawTitle,
            rationale,
            angle
        };
    }

    return null;
}

function selectTopicsForProfiles(queueContent, profileIds = []) {
    const selected = [];
    const usedTitles = new Set();

    for (const profileId of profileIds) {
        const topic = extractNextTopicFromQueue(queueContent, { profileId, usedTitles });
        if (!topic) {
            throw new Error(`No pending topic available for profile "${profileId}".`);
        }

        usedTitles.add(topic.title);
        selected.push({ profileId, topic });
    }

    return selected;
}

/**
 * Read topic from queue
 */
function readTopic() {
    const queueContent = fs.readFileSync(QUEUE_PATH, 'utf8');
    return extractNextTopicFromQueue(queueContent);
}

/**
 * Generate draft with specific tone profile
 */
async function generateWithProfile(topic, profileId, trendResult, context) {
    const profile = getProfile(profileId);
    const toneInstructions = buildPromptInstructions(profileId);
    const avoidanceInstructions = buildAvoidanceInstructions(trendResult);

    const isKorean = profile.language === 'ko';

    const systemPrompt = isKorean
        ? `당신은 MandaAct 블로그의 전문 작가입니다. 한국 독자를 위한 따뜻하고 친근한 글을 작성합니다.`
        : `You are an expert Ghostwriter for a developer productivity blog.`;

    const basePrompt = isKorean ? `
**주제**: ${topic.title}
**배경**: ${topic.rationale}
**MandaAct 연결점**: ${topic.angle}

## 제품 정보 (Ground Truth)
${context}

## 작성 규칙
${toneInstructions}
${avoidanceInstructions}

## 구조
1. **문제 인식**: 왜 기존 방법이 실패하는가
2. **해결책 (개념)**: 시각적 분해 / 9x9 그리드의 힘
3. **도구 (MandaAct)**: 어떻게 이 앱이 도움이 되는가 (Goal Diagnosis, 9x9 Grid, Sub-goal)
4. **실천 방안**: 독자가 바로 시도할 수 있는 것
5. **마무리**: 앱 다운로드 유도

## 제약사항
- "OCR", "Deep Work Mode" 기능 언급 금지 (존재하지 않음)
- 이모지 사용 금지
- **굵은 글씨** 마크다운 지양
- ~습니다 체 사용

## 출력 형식
YAML frontmatter 포함 마크다운:
---
title: "${topic.title}"
published: false
tags: [생산성, 개발자, 목표관리, mandaact]
cover_image: "PLACEHOLDER"
---

[본문]
` : `
**Topic**: ${topic.title}
**Context**: ${topic.rationale}
**Product Angle**: ${topic.angle}

## Product Information (Ground Truth)
${context}

## Tone & Style
${toneInstructions}
${avoidanceInstructions}

## Structure
1. **The Problem**: Why existing methods fail
2. **The Solution (Mental Model)**: Visual decomposition / 9x9 grid concept
3. **The Tool (MandaAct)**: How the app helps (Goal Diagnosis, 9x9 Grid, Sub-goal Decomposition)
4. **Practical Tips**: What readers can try immediately
5. **Call to Action**: App download

## Constraints
- Do NOT mention "OCR" or "Deep Work Mode" (these features don't exist)
- Follow the tone profile strictly

## Output Format
Markdown with YAML frontmatter:
---
title: "${topic.title}"
published: false
tags: [productivity, developers, career, mandaact]
series: "Building MandaAct"
cover_image: "PLACEHOLDER"
---

[Content body]
`;

    const response = await client.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: basePrompt }
        ],
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 3000
    });

    return response.choices[0].message.content;
}

/**
 * Verify draft with fact checker
 */
async function verifyDraft(draft, context) {
    const prompt = `
You are the "Quality Assurance Editor" for MandaAct.
Your job is to REMOVE HALLUCINATIONS from the article draft.

**Product Context (Ground Truth)**:
${context}

**Draft to Review**:
${draft}

**Instructions**:
1. Scan the draft for feature claims.
2. If the draft mentions features NOT in the Context (e.g., "OCR", "Deep Work Mode", "Social Sharing"), **REWRITE** those sections to refer to actual features (e.g., "Goal Diagnosis", "9x9 Grid", "Clarity Score").
3. Keep the tone and flow consistent.
4. Output ONLY the corrected article markdown (including original frontmatter).
5. Do NOT add explanations, notes, checklists, or sections like "Changes Made".
`;

    const response = await client.chat.completions.create({
        messages: [
            { role: 'system', content: 'You are a strict Fact Checker.' },
            { role: 'user', content: prompt }
        ],
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 3000
    });

    return response.choices[0].message.content;
}

/**
 * Save draft file
 */
function saveDraft(content, filename) {
    const filePath = path.join(DRAFTS_DIR, filename);

    // Ensure directory exists
    if (!fs.existsSync(DRAFTS_DIR)) {
        fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    }

    const cleanContent = sanitizeDraftMarkdownContent(content);
    fs.writeFileSync(filePath, cleanContent, 'utf8');

    return filePath;
}

/**
 * Generate cover image for draft
 */
async function generateCoverImage(title, slug, lang = 'en') {
    const suffix = lang === 'ko' ? '-ko' : '';
    const coverFilename = `${slug}${suffix}-cover.png`;
    const coverPath = path.join(__dirname, 'assets', 'images', 'covers', coverFilename);

    // Ensure directory exists
    const coversDir = path.join(__dirname, 'assets', 'images', 'covers');
    if (!fs.existsSync(coversDir)) {
        fs.mkdirSync(coversDir, { recursive: true });
    }

    console.log(`🎨 Generating cover image (${lang.toUpperCase()})...`);
    try {
        await require('./generate_cover').generateCover(title, coverPath, { lang });
        console.log(`🖼️  Cover image generated: ${coverFilename}`);
    } catch (error) {
        console.error(`⚠️ Failed to generate cover image (${lang}):`, error.message);
    }

    const coverUrl = `${config.github.rawBaseUrl}/assets/images/covers/${coverFilename}`;
    return { coverFilename, coverPath, coverUrl };
}

/**
 * Process single draft with quality loop
 */
async function processDraft(topic, profileId, trendResult, context) {
    const profile = getProfile(profileId);
    const lang = profile.language;
    const suffix = lang === 'ko' ? '-ko' : '';

    console.log(`\n📝 Generating ${lang.toUpperCase()} draft (${profileId})...`);

    let draft = null;
    let qualityReport = null;
    let attempts = 0;

    // Quality gate loop
    while (attempts < MAX_REGENERATION_ATTEMPTS) {
        attempts++;
        console.log(`   Attempt ${attempts}/${MAX_REGENERATION_ATTEMPTS}...`);

        // Generate draft
        draft = await generateWithProfile(topic, profileId, trendResult, context);

        // Fact check
        console.log(`   🕵️ Fact-checking...`);
        draft = await verifyDraft(draft, context);

        // Save temporarily for quality check
        const slug = createTopicSlug(topic.title);
        const date = new Date().toISOString().split('T')[0];
        const tempFilename = `${date}-${slug}${suffix}.md`;
        const tempPath = saveDraft(draft, tempFilename);

        // Quality check
        qualityReport = checkQuality(tempPath, { profileId });

        if (qualityReport.score >= QUALITY_THRESHOLD) {
            console.log(`   ✅ Quality passed: ${qualityReport.score}/100`);
            break;
        } else {
            console.log(`   ⚠️ Quality score: ${qualityReport.score}/100 (need ${QUALITY_THRESHOLD}+)`);
            if (attempts < MAX_REGENERATION_ATTEMPTS) {
                console.log(`   🔄 Regenerating...`);
            }
        }
    }

    enforceDraftQualityThreshold(qualityReport, {
        profileId,
        threshold: QUALITY_THRESHOLD,
        attempts,
        maxAttempts: MAX_REGENERATION_ATTEMPTS,
        allowBelowThreshold: allowLowQualityDrafts()
    });

    // Generate cover image
    const slug = createTopicSlug(topic.title);
    const coverInfo = await generateCoverImage(topic.title, slug, lang);

    // Update draft with cover URL
    draft = draft.replace(/cover_image: ".*?"/, `cover_image: "${coverInfo.coverUrl}"`);

    // Final save
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${slug}${suffix}.md`;
    const filePath = saveDraft(draft, filename);

    // Inject CTA (forced, not prompt-dependent)
    console.log(`   📲 Injecting CTA...`);
    injectCTAToFile(filePath, profileId, { lang, force: false });

    return {
        profileId,
        language: lang,
        filename,
        filePath,
        qualityReport,
        coverInfo,
        attempts
    };
}

/**
 * Main draft generation function
 */
async function generateDraft() {
    try {
        console.log('✍️  Ghostwriter v2 is waking up...');
        console.log('═══════════════════════════════════════════════\n');

        // 1. Resolve profiles for this run from KST schedule
        const now = new Date();
        const schedule = loadWeeklyScheduleConfig();
        const runPlan = getProfilesForCurrentRun(now, schedule);
        console.log(`🗓️ KST Weekday: ${runPlan.weekdayKey}`);
        if (runPlan.fromSchedule) {
            console.log(`🎯 Scheduled profiles: ${runPlan.profiles.join(', ')}`);
        } else {
            console.warn('⚠️ Current day is outside configured schedule. Falling back to both profiles (devto, blogger_kr).');
        }

        const profileFilter = filterProfilesWithoutSameDayDraft(runPlan.profiles, now);
        if (profileFilter.skippedProfiles.length > 0) {
            console.warn(
                `⚠️ Existing same-day drafts detected for ${profileFilter.kstDate}: ${profileFilter.skippedProfiles.join(', ')}. Skipping.`
            );
        }
        if (profileFilter.activeProfiles.length === 0) {
            console.log('⚠️ All scheduled profiles already have same-day drafts. Exiting without new generation.');
            return;
        }

        // 2. Select independent queue topics per profile
        const queueContent = fs.readFileSync(QUEUE_PATH, 'utf8');
        const selections = selectTopicsForProfiles(queueContent, profileFilter.activeProfiles);
        if (selections.length === 0) {
            console.log('⚠️ No pending topics found in queue. Exiting.');
            return;
        }

        console.log('📝 Selected Topics:');
        selections.forEach(({ profileId, topic }) => {
            const cleanTitle = stripTopicTags(topic.title);
            console.log(`   - [${profileId}] ${topic.title} → "${cleanTitle}"`);
        });
        console.log('');

        // 3. Read Context
        const context = fs.existsSync(CONTEXT_PATH)
            ? fs.readFileSync(CONTEXT_PATH, 'utf8')
            : 'MandaAct is a 9x9 Mandalart grid app for iOS.';

        // 4. Generate drafts per profile/topic pair (no cross-language translation)
        console.log('🔍 Phase 1: Trend Validation + Draft Generation');
        const generated = [];
        let updatedQueue = queueContent;

        for (const { profileId, topic } of selections) {
            const originalTitle = topic.title;
            const cleanTitle = stripTopicTags(originalTitle);
            if (!cleanTitle) {
                throw new Error(`Invalid topic title after tag normalization: "${originalTitle}"`);
            }

            const generationTopic = {
                ...topic,
                title: cleanTitle
            };

            console.log(`\n🔍 Trend validation for [${profileId}] "${cleanTitle}"...`);
            const trendResult = await validateTrend(generationTopic);
            if (shouldRejectTopic(trendResult)) {
                throw new Error(`[${profileId}] Topic rejected due to low trend relevance: "${cleanTitle}"`);
            }

            console.log(`🚀 Generating profile draft: ${profileId}`);
            const result = await processDraft(generationTopic, profileId, trendResult, context);
            generated.push({
                ...result,
                originalTitle
            });

            const enScore = result.language === 'en' ? `EN:${result.qualityReport.score}` : 'EN:Skip';
            const koScore = result.language === 'ko' ? `KO:${result.qualityReport.score}` : 'KO:Skip';
            const qualityBadge = `✅ ${enScore} ${koScore}`;
            updatedQueue = buildDraftedQueueContent(updatedQueue, originalTitle, qualityBadge);
        }

        // 5. Results Summary
        console.log('\n═══════════════════════════════════════════════');
        console.log('📊 GENERATION COMPLETE');
        console.log('═══════════════════════════════════════════════\n');

        generated.forEach((result) => {
            const label = result.language === 'ko' ? 'Korean' : 'English';
            console.log(`📄 ${label} Draft (${result.profileId}):`);
            console.log(`   Topic: ${result.originalTitle}`);
            console.log(`   File: drafts/${result.filename}`);
            console.log(`   Quality: ${result.qualityReport.score}/100 (${result.qualityReport.grade})`);
            console.log(`   Attempts: ${result.attempts}`);
        });

        // 6. Update Queue (each selected topic independently)
        fs.writeFileSync(QUEUE_PATH, updatedQueue, 'utf8');

        // 7. Auto-push cover images to main (optional in CI PR flow)
        if (shouldSkipCoverMainSync()) {
            console.log('⏭️ Skipping cover sync to main (SKIP_COVER_MAIN_SYNC=true).');
        } else {
            console.log('🔄 Syncing cover images to GitHub...');
            const coverTitleSummary = generated.map((item) => stripTopicTags(item.originalTitle)).join(' | ');
            const coverSyncSuccess = pushCoversToMain(`Add cover images for: ${coverTitleSummary}`);
            if (!coverSyncSuccess) {
                if (shouldRequireGitSyncSuccess()) {
                    throw new Error('Cover image sync failed. Aborting to avoid broken cover URLs.');
                }
                console.warn('⚠️ Cover image sync failed. Continuing because STRICT_GIT_SYNC is disabled.');
            }
        }

        // 8. Send notification
        const files = [];
        const qualityScores = {};
        generated.forEach((item) => {
            files.push(item.filename);
            qualityScores[item.language] = item.qualityReport.score;
        });

        await notifier.stepComplete('draft_generation', {
            title: generated.map((item) => stripTopicTags(item.originalTitle)).join(' | '),
            files: files,
            qualityScores: qualityScores
        });

        console.log('\n✅ All drafts generated successfully!');

    } catch (error) {
        console.error('❌ Generation Failed:', error.message);
        await notifier.stepFailed('draft_generation', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    generateDraft();
}

module.exports = {
    generateDraft,
    generateWithProfile,
    processDraft,
    shouldSkipCoverMainSync,
    allowSameDayRegeneration,
    createTopicSlug,
    stripTopicTags,
    topicMatchesProfile,
    loadWeeklyScheduleConfig,
    getKstWeekdayKey,
    resolveProfilesForKstWeekday,
    getProfilesForCurrentRun,
    toKstDateString,
    hasExistingDraftForProfile,
    filterProfilesWithoutSameDayDraft,
    resolveTargetProfilesFromTitle,
    selectTopicsForProfiles,
    buildDraftedQueueContent,
    extractNextTopicFromQueue
};
