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

// Configuration
const MAX_REGENERATION_ATTEMPTS = 3;
const QUALITY_THRESHOLD = 70;
const KR_ONLY_TAG = '[KR-Only]';
const EN_ONLY_TAG = '[EN-Only]';

function allowLowQualityDrafts() {
    return String(process.env.ALLOW_LOW_QUALITY_DRAFTS || '').toLowerCase() === 'true';
}

function shouldSkipCoverMainSync() {
    return String(process.env.SKIP_COVER_MAIN_SYNC || '').toLowerCase() === 'true';
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

function extractNextTopicFromQueue(queueContent) {
    const lines = String(queueContent || '').split(/\r?\n/);
    const titleRegex = /^\*\s+\*\*(.+?)\*\*(.*)$/;
    const rationaleRegex = /^\s*\*\s+\*Rationale\*:\s+(.+?)\s*$/i;
    const angleRegex = /^\s*\*\s+\*MandaAct Angle\*:\s+(.+?)\s*$/i;

    for (let index = 0; index < lines.length; index++) {
        const titleMatch = lines[index].match(titleRegex);
        if (!titleMatch) {
            continue;
        }

        const suffix = String(titleMatch[2] || '');
        if (/\((?:Drafted|Published)\b/i.test(suffix)) {
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
            title: titleMatch[1].trim(),
            rationale,
            angle
        };
    }

    return null;
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

        // 1. Read Topic
        const topic = readTopic();
        if (!topic) {
            console.log('⚠️ No topics found in queue. Exiting.');
            return;
        }
        console.log(`📝 Selected Topic: ${topic.title}\n`);

        // 2. Read Context
        const context = fs.existsSync(CONTEXT_PATH)
            ? fs.readFileSync(CONTEXT_PATH, 'utf8')
            : 'MandaAct is a 9x9 Mandalart grid app for iOS.';

        // 3. Trend Validation
        console.log('🔍 Phase 1: Trend Validation');
        const trendResult = await validateTrend(topic);

        if (shouldRejectTopic(trendResult)) {
            console.log('❌ Topic rejected due to low trend relevance.');
            return;
        }

        // 4. Determine target platforms based on tags
        console.log('\n🚀 Phase 2: Parallel Draft Generation');

        const { profiles, isKROnly, isENOnly } = resolveTargetProfilesFromTitle(topic.title);

        // Clean title for AI generation (remove tags like [KR-Only], [SEO], etc)
        const originalTitle = topic.title;
        topic.title = topic.title.replace(/\[.*?\]\s*/g, '').trim();
        if (!topic.title) {
            throw new Error('Invalid topic title after tag normalization.');
        }
        console.log(`   Targeting: ${isKROnly ? 'KR Only' : isENOnly ? 'EN Only' : 'All Channels'}`);
        console.log(`   Clean Title: "${topic.title}"`);

        const tasks = profiles.map((profileId) => processDraft(topic, profileId, trendResult, context));

        const results = await Promise.all(tasks);
        const resultEN = results.find(r => r.language === 'en');
        const resultKO = results.find(r => r.language === 'ko');

        // 5. Results Summary
        console.log('\n═══════════════════════════════════════════════');
        console.log('📊 GENERATION COMPLETE');
        console.log('═══════════════════════════════════════════════\n');

        if (resultEN) {
            console.log('📄 English Draft:');
            console.log(`   File: drafts/${resultEN.filename}`);
            console.log(`   Quality: ${resultEN.qualityReport.score}/100 (${resultEN.qualityReport.grade})`);
            console.log(`   Attempts: ${resultEN.attempts}`);
        }

        if (resultKO) {
            console.log('\n📄 Korean Draft:');
            console.log(`   File: drafts/${resultKO.filename}`);
            console.log(`   Quality: ${resultKO.qualityReport.score}/100 (${resultKO.qualityReport.grade})`);
            console.log(`   Attempts: ${resultKO.attempts}`);
        }

        // 6. Update Queue (Dynamic specific to result existence)
        const queueContent = fs.readFileSync(QUEUE_PATH, 'utf8');
        const enScore = resultEN ? `EN:${resultEN.qualityReport.score}` : 'EN:Skip';
        const koScore = resultKO ? `KO:${resultKO.qualityReport.score}` : 'KO:Skip';
        const qualityBadge = `✅ ${enScore} ${koScore}`;

        const updatedQueue = buildDraftedQueueContent(queueContent, originalTitle, qualityBadge);
        fs.writeFileSync(QUEUE_PATH, updatedQueue, 'utf8');

        // 7. Auto-push cover images to main (optional in CI PR flow)
        if (shouldSkipCoverMainSync()) {
            console.log('⏭️ Skipping cover sync to main (SKIP_COVER_MAIN_SYNC=true).');
        } else {
            console.log('🔄 Syncing cover images to GitHub...');
            const coverSyncSuccess = pushCoversToMain(`Add cover images for: ${topic.title}`);
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
        if (resultEN) { files.push(resultEN.filename); qualityScores.en = resultEN.qualityReport.score; }
        if (resultKO) { files.push(resultKO.filename); qualityScores.ko = resultKO.qualityReport.score; }

        await notifier.stepComplete('draft_generation', {
            title: topic.title,
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
    createTopicSlug,
    resolveTargetProfilesFromTitle,
    buildDraftedQueueContent,
    extractNextTopicFromQueue
};
