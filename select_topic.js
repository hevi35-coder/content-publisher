const fs = require('fs');
const path = require('path');
const config = require('./config');
const client = require('./lib/ai-client');
const { pushToMain } = require('./lib/git-manager');

const QUEUE_PATH = config.paths.queue;
const ARCHIVE_PATH = config.paths.archive;
const { notifier } = require('./lib/notifier');
const KR_ONLY_TAG = '[KR-Only]';
const EN_ONLY_TAG = '[EN-Only]';
const WEEKLY_SCHEDULE_PATH = path.join(__dirname, 'config', 'weekly-schedule.json');
const WEEKDAY_INDEX = Object.freeze({
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6
});
const INDEX_TO_LONG = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const DEFAULT_WEEKLY_SCHEDULE = Object.freeze({
    en_weekday_kst: 'WED',
    kor_weekdays_kst: ['MON', 'WED', 'FRI']
});

function shouldAutoSyncQueue(env = process.env) {
    return String(env.AUTO_SYNC_QUEUE || '').toLowerCase() === 'true';
}

function syncQueueToMain(queuePath = QUEUE_PATH, env = process.env, syncFn = pushToMain) {
    if (!shouldAutoSyncQueue(env)) {
        console.log("⏭️ Auto-sync skipped (set AUTO_SYNC_QUEUE=true to enable direct push).");
        return false;
    }

    console.log("🔄 Auto-syncing to GitHub...");
    try {
        const success = syncFn(queuePath, 'chore: auto-update topic queue (Committee)');
        if (success) {
            console.log("✅ Changes pushed to main.");
            return true;
        }
        console.warn("⚠️ Git sync skipped or failed.");
        return false;
    } catch (gitError) {
        console.warn("⚠️ Git sync failed (running locally?):", gitError.message);
        return false;
    }
}

function normalizeWeekdayKey(value, fieldName) {
    const key = String(value || '').trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, key)) {
        throw new Error(`Invalid ${fieldName}: ${value}`);
    }
    return key;
}

function formatWeekdayList(indices = []) {
    return indices.map((index) => INDEX_TO_LONG[index]).join('/');
}

function loadWeeklyScheduleConfig() {
    if (!fs.existsSync(WEEKLY_SCHEDULE_PATH)) {
        return {
            enWeekday: DEFAULT_WEEKLY_SCHEDULE.en_weekday_kst,
            korWeekdays: [...DEFAULT_WEEKLY_SCHEDULE.kor_weekdays_kst]
        };
    }

    const raw = fs.readFileSync(WEEKLY_SCHEDULE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    const enWeekday = normalizeWeekdayKey(
        parsed.en_weekday_kst || DEFAULT_WEEKLY_SCHEDULE.en_weekday_kst,
        'en_weekday_kst'
    );

    const korWeekdays = Array.isArray(parsed.kor_weekdays_kst) && parsed.kor_weekdays_kst.length > 0
        ? parsed.kor_weekdays_kst.map((value) => normalizeWeekdayKey(value, 'kor_weekdays_kst'))
        : [...DEFAULT_WEEKLY_SCHEDULE.kor_weekdays_kst];

    return {
        enWeekday,
        korWeekdays
    };
}

function deriveWeeklyTopicSlots(schedule = loadWeeklyScheduleConfig()) {
    const enDayIndex = WEEKDAY_INDEX[schedule.enWeekday];
    const korDayIndices = [...new Set(schedule.korWeekdays.map((key) => WEEKDAY_INDEX[key]))];

    const slots = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        if (dayIndex === enDayIndex) {
            slots.push('en');
        }
        if (korDayIndices.includes(dayIndex)) {
            slots.push('ko');
        }
    }

    return {
        slots,
        enCount: slots.filter((slot) => slot === 'en').length,
        koCount: slots.filter((slot) => slot === 'ko').length,
        enDayIndex,
        korDayIndices
    };
}

function normalizeTopicField(value, fieldName, index) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        throw new Error(`Invalid response format: topics[${index}].${fieldName} is required`);
    }
    return normalized;
}

function normalizeCategory(rawCategory, index = null) {
    const normalized = String(rawCategory || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (!normalized) {
        const pointer = index === null ? 'category' : `topics[${index}].category`;
        throw new Error(`Invalid response format: ${pointer} is required`);
    }

    if (normalized.includes('global')) {
        return 'Global Dev';
    }

    if (
        normalized.includes('productivity') ||
        normalized.includes('생산성') ||
        normalized.includes('mandaact')
    ) {
        return 'Productivity';
    }

    const pointer = index === null ? 'category' : `topics[${index}].category`;
    throw new Error(`Invalid response format: ${pointer} has unknown value "${rawCategory}"`);
}

function normalizeGeneratedTopics(result) {
    if (!result || !Array.isArray(result.topics)) {
        throw new Error("Invalid response format: 'topics' array missing.");
    }
    if (result.topics.length === 0) {
        throw new Error("Invalid response format: 'topics' array is empty.");
    }

    return result.topics.map((topic, index) => {
        if (!topic || typeof topic !== 'object') {
            throw new Error(`Invalid response format: topics[${index}] must be an object.`);
        }

        const category = normalizeCategory(topic.category, index);
        const rawTitle = normalizeTopicField(topic.title, 'title', index);
        let title = rawTitle;
        if (category === 'Productivity' && !title.includes(KR_ONLY_TAG)) {
            title = `${KR_ONLY_TAG} ${title}`;
        }
        if (category === 'Global Dev' && !title.includes(EN_ONLY_TAG)) {
            title = `${EN_ONLY_TAG} ${title}`;
        }

        return {
            category,
            title,
            rationale: normalizeTopicField(topic.rationale, 'rationale', index),
            mandaact_angle: normalizeTopicField(topic.mandaact_angle, 'mandaact_angle', index),
            target_audience: normalizeTopicField(topic.target_audience, 'target_audience', index)
        };
    });
}

function enforceWeeklyTopicMix(topics, schedule = loadWeeklyScheduleConfig()) {
    const normalizedTopics = Array.isArray(topics) ? topics : [];
    if (normalizedTopics.length < 2) {
        throw new Error('Invalid response format: need at least 2 topics.');
    }

    const uniqueTopics = [];
    const seenTitles = new Set();
    for (const topic of normalizedTopics) {
        const key = topic.title.toLowerCase();
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        uniqueTopics.push(topic);
    }

    const globalTopics = uniqueTopics.filter((topic) => topic.category === 'Global Dev');
    const productivityTopics = uniqueTopics.filter((topic) => topic.category === 'Productivity');
    const slotPlan = deriveWeeklyTopicSlots(schedule);

    if (globalTopics.length < slotPlan.enCount || productivityTopics.length < slotPlan.koCount) {
        throw new Error(
            `Invalid response format: require at least ${slotPlan.enCount} Global Dev and ${slotPlan.koCount} Productivity topics.`
        );
    }

    const enPool = [...globalTopics];
    const koPool = [...productivityTopics];
    const ordered = [];

    for (const slot of slotPlan.slots) {
        if (slot === 'en') {
            ordered.push(enPool.shift());
        } else if (slot === 'ko') {
            ordered.push(koPool.shift());
        }
    }

    return ordered.filter(Boolean);
}

async function selectTopic() {
    try {
        console.log("🕵️‍♂️  Topic Committee in Session...");

        // 1. Read Context
        const archiveContent = fs.existsSync(ARCHIVE_PATH) ? fs.readFileSync(ARCHIVE_PATH, 'utf8') : "";
        const queueContent = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH, 'utf8') : "";
        const weeklySchedule = loadWeeklyScheduleConfig();
        const slotPlan = deriveWeeklyTopicSlots(weeklySchedule);
        const enScheduleDay = INDEX_TO_LONG[slotPlan.enDayIndex];
        const koScheduleDays = formatWeekdayList(slotPlan.korDayIndices);

        console.log(
            `📅 Weekly slot plan: EN ${slotPlan.enCount} topic(s) on ${enScheduleDay}, KO ${slotPlan.koCount} topic(s) on ${koScheduleDays}`
        );

        // 2. Formulate the Prompt
        const systemPrompt = `
You are the "Editorial Committee" for MandaAct, a productivity app for developers (based on Mandalart 9x9 grid).
Your goal is to select high-impact topics for this week's multi-channel content plan.

Target Audience: Developers, Indie Hackers, Junior Devs.
Tone: Professional, Insightful, "No Fluff".

TheTopic should:
1. Be relevant to Developers (Productivity, Lifestyle, AI).
2. **MUST have a clear connection to MandaAct's core philosophy** (Breaking 9x9 goals down, visual planning, or execution focus).
3. NOT be a duplicate of the [Archive].

[Archive of Published Topics]:
${archiveContent}

[Current Queue]:
${queueContent}

Weekly schedule in KST:
- English channel day: ${enScheduleDay}
- Korean channel days: ${koScheduleDays}
`;

        const userPrompt = `
Please analyze the current context and generate **${slotPlan.enCount + slotPlan.koCount} distinct topics** in TWO categories:

### Category A: Global Developer Trends (Generate ${slotPlan.enCount} Topic${slotPlan.enCount > 1 ? 's' : ''})
- **Focus**: Technical depth, coding best practices, system architecture, engineering career.
- **Target**: Global developers (Dev.to, Hashnode).
- **Style**: Professional, technical, insightful.
- **Constraint**: **MUST** include the tag "[EN-Only]" in the title.
- **Schedule**: This will be published on **${enScheduleDay}**.

### Category B: Productivity & MandaAct (Generate ${slotPlan.koCount} Topic${slotPlan.koCount > 1 ? 's' : ''})
- **Focus**: Goal setting, Mandalart usage, life-hacking, overcoming procrastination, self-improvement.
- **Target**: Korean productivity seekers (Naver Blog, Blogger).
- **Style**: Motivational, practical, easy to read.
- **Constraint**: **MUST** include the tag "[KR-Only]" in the title (e.g., "[KR-Only] How to...").
- **Schedule**: These will be published on **${koScheduleDays}**.

### Output Format
Return a JSON object with a "topics" array containing all topics (${slotPlan.enCount} Global + ${slotPlan.koCount} Productivity).
{
    "topics": [
        {
            "category": "Global Dev",
            "title": "[EN-Only] Title of the article",
            "rationale": "Why this is trending...",
            "mandaact_angle": "Connection to MandaAct...",
            "target_audience": "Senior Devs, etc."
        },
        {
            "category": "Productivity",
            "title": "[KR-Only] Title of the article",
            "rationale": "Why this matters...",
            "mandaact_angle": "Connection to MandaAct...",
            "target_audience": "General public, etc."
        },
        {
            "category": "Productivity",
            "title": "[KR-Only] Another Title...",
            ...
        }
    ]
}
`;

        // 3. Call AI (GitHub Models - GPT-4o)
        console.log(
            `🤖 Consulting the Oracle (GPT-4o) for ${slotPlan.enCount + slotPlan.koCount} topics (${slotPlan.enCount} Tech / ${slotPlan.koCount} Productivity)...`
        );
        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            model: "gpt-4o",
            temperature: 0.7,
            max_tokens: 1500,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        const topics = enforceWeeklyTopicMix(normalizeGeneratedTopics(result), weeklySchedule);

        console.log(`\n✅ Committee Decision: Generated ${topics.length} topics.`);

        // 4. Update Queue with Strict Ordering
        let newEntries = "";

        // Helper to formatting
        const formatTopic = (t) => `*   **${t.title}**\n    *   *Rationale*: ${t.rationale}\n    *   *MandaAct Angle*: ${t.mandaact_angle}\n    *   *Target*: ${t.target_audience}\n\n`;

        // Sequence follows schedule-derived slot order.
        topics.forEach((topic) => {
            newEntries += formatTopic(topic);
        });

        let newQueueContent = queueContent;
        // Prepend to "On Deck"
        if (newQueueContent.includes('## On Deck (Next Up)')) {
            newQueueContent = newQueueContent.replace('## On Deck (Next Up)', `## On Deck (Next Up)\n${newEntries}`);
        } else {
            newQueueContent = `## On Deck (Next Up)\n${newEntries}\n` + newQueueContent;
        }

        fs.writeFileSync(QUEUE_PATH, newQueueContent, 'utf8');
        console.log(`📝 ${topics.length} topics added to TOPIC_QUEUE.md`);

        // 5. Automated Sync (Git Push)
        // Safe default: disabled unless AUTO_SYNC_QUEUE=true.
        // CI workflow handles commit/push in a dedicated step.
        syncQueueToMain();

        // Send notification
        await notifier.stepComplete('topic_selection', {
            count: topics.length,
            topics: topics.map(t => t.title).join(', ')
        });

    } catch (error) {
        console.error("❌ Topic Selection Failed:", error.message);
        if (error.response) console.error(error.response.data);

        // Send failure notification
        await notifier.stepFailed('topic_selection', error);
        throw error;
    }
}

if (require.main === module) {
    selectTopic().catch(() => {
        process.exit(1);
    });
}

module.exports = {
    selectTopic,
    shouldAutoSyncQueue,
    syncQueueToMain,
    loadWeeklyScheduleConfig,
    deriveWeeklyTopicSlots,
    normalizeGeneratedTopics,
    enforceWeeklyTopicMix,
    normalizeTopicField,
    normalizeCategory
};
