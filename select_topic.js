const fs = require('fs');
const { execSync } = require('child_process');
const config = require('./config');
const client = require('./lib/ai-client');

const QUEUE_PATH = config.paths.queue;
const ARCHIVE_PATH = config.paths.archive;
const { notifier } = require('./lib/notifier');

function shouldAutoSyncQueue(env = process.env) {
    return String(env.AUTO_SYNC_QUEUE || '').toLowerCase() === 'true';
}

async function selectTopic() {
    try {
        console.log("🕵️‍♂️  Topic Committee in Session...");

        // 1. Read Context
        const archiveContent = fs.existsSync(ARCHIVE_PATH) ? fs.readFileSync(ARCHIVE_PATH, 'utf8') : "";
        const queueContent = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH, 'utf8') : "";

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
`;

        const userPrompt = `
Please analyze the current context and generate **3 distinct topics** in TWO categories:

### Category A: Global Developer Trends (Generate 1 Topic)
- **Focus**: Technical depth, coding best practices, system architecture, engineering career.
- **Target**: Global developers (Dev.to, Hashnode).
- **Style**: Professional, technical, insightful.
- **Schedule**: This will be published on **Monday**.

### Category B: Productivity & MandaAct (Generate 2 Topics)
- **Focus**: Goal setting, Mandalart usage, life-hacking, overcoming procrastination, self-improvement.
- **Target**: Korean productivity seekers (Naver Blog, Blogger).
- **Style**: Motivational, practical, easy to read.
- **Constraint**: **MUST** include the tag "[KR-Only]" in the title (e.g., "[KR-Only] How to...").
- **Schedule**: These will be published on **Wednesday and Friday**.

### Output Format
Return a JSON object with a "topics" array containing all 3 topics (1 Global, 2 Productivity).
{
    "topics": [
        {
            "category": "Global Dev",
            "title": "Title of the article",
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
        console.log("🤖 Consulting the Oracle (GPT-4o) for 3 topics (1 Tech / 2 Prod)...");
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

        if (!result.topics || !Array.isArray(result.topics)) {
            throw new Error("Invalid response format: 'topics' array missing.");
        }

        console.log(`\n✅ Committee Decision: Generated ${result.topics.length} topics.`);

        // 4. Update Queue with Strict Ordering
        // Order: 1. Global Dev (Mon), 2. Productivity (Wed), 3. Productivity (Fri)
        let newEntries = "";

        // Helper to formatting
        const formatTopic = (t) => `*   **${t.title}**\n    *   *Rationale*: ${t.rationale}\n    *   *MandaAct Angle*: ${t.mandaact_angle}\n    *   *Target*: ${t.target_audience}\n\n`;

        // Find topics by category
        const devTopic = result.topics.find(t => t.category === "Global Dev");
        const prodTopics = result.topics.filter(t => t.category === "Productivity");

        // Sequence: [Dev, Prod, Prod]
        if (devTopic) newEntries += formatTopic(devTopic);
        prodTopics.forEach(t => newEntries += formatTopic(t));

        // Fallback if AI didn't respect categories strictly
        const remaining = result.topics.filter(t => t !== devTopic && !prodTopics.includes(t));
        remaining.forEach(t => newEntries += formatTopic(t));

        let newQueueContent = queueContent;
        // Prepend to "On Deck"
        if (newQueueContent.includes('## On Deck (Next Up)')) {
            newQueueContent = newQueueContent.replace('## On Deck (Next Up)', `## On Deck (Next Up)\n${newEntries}`);
        } else {
            newQueueContent = `## On Deck (Next Up)\n${newEntries}\n` + newQueueContent;
        }

        fs.writeFileSync(QUEUE_PATH, newQueueContent, 'utf8');
        console.log("📝 3 Topics added to TOPIC_QUEUE.md");

        // 5. Automated Sync (Git Push)
        // Safe default: disabled unless AUTO_SYNC_QUEUE=true.
        // CI workflow handles commit/push in a dedicated step.
        if (shouldAutoSyncQueue()) {
            console.log("🔄 Auto-syncing to GitHub...");
            try {
                execSync(`git add ${QUEUE_PATH}`);
                execSync('git commit -m "chore: auto-update topic queue (Committee)"');
                execSync('git push origin main');
                console.log("✅ Changes pushed to main.");
            } catch (gitError) {
                console.warn("⚠️ Git sync failed (running locally?):", gitError.message);
                // Don't throw error here, just warn, as prompt generation was successful
            }
        } else {
            console.log("⏭️ Auto-sync skipped (set AUTO_SYNC_QUEUE=true to enable direct push).");
        }

        // Send notification
        await notifier.stepComplete('topic_selection', {
            count: result.topics.length,
            topics: result.topics.map(t => t.title).join(', ')
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

module.exports = { selectTopic, shouldAutoSyncQueue };
