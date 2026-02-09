const fs = require('fs');
const config = require('./config');
const client = require('./lib/ai-client');

const QUEUE_PATH = config.paths.queue;
const ARCHIVE_PATH = config.paths.archive;
const { notifier } = require('./lib/notifier');

async function selectTopic() {
    try {
        console.log("🕵️‍♂️  Topic Committee in Session...");

        // 1. Read Context
        const archiveContent = fs.existsSync(ARCHIVE_PATH) ? fs.readFileSync(ARCHIVE_PATH, 'utf8') : "";
        const queueContent = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH, 'utf8') : "";

        // 2. Formulate the Prompt
        const systemPrompt = `
You are the "Editorial Committee" for MandaAct, a productivity app for developers (based on Mandalart 9x9 grid).
Your goal is to select ONE high-impact topic for this week's Dev.to article.

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
Please analyze the current context and:
1. Generate 3 potential new topic ideas based on current developer trends.
2. Select the BEST one that naturally leads to mentioning MandaAct.
3. Output ONLY the selected topic in JSON format:
{
    "title": "The Title of the Article",
    "rationale": "Why this topic? Why now?",
    "mandaact_angle": "How does MandaAct (9x9 grid, AI Suggestion, Goal Diagnosis) solve this problem?",
    "target_audience": "Who is this for?"
}
`;

        // 3. Call AI (GitHub Models - GPT-4o)
        console.log("🤖 Consulting the Oracle (GPT-4o)...");
        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            model: "gpt-4o", // Ensuring we use a capable model available on GitHub Models
            temperature: 0.7,
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);

        console.log("\n✅ Committee Decision:");
        console.log(`Title: ${result.title}`);
        console.log(`Rationale: ${result.rationale}`);
        console.log(`MandaAct Angle: ${result.mandaact_angle}`);

        // 4. Update Queue
        // We prepend it to the "On Deck" section
        let newQueueContent = queueContent;
        const entry = `*   **${result.title}**\n    *   *Rationale*: ${result.rationale}\n    *   *MandaAct Angle*: ${result.mandaact_angle}\n    *   *Target*: ${result.target_audience}\n`;

        if (newQueueContent.includes('## On Deck (Next Up)')) {
            newQueueContent = newQueueContent.replace('## On Deck (Next Up)', `## On Deck (Next Up)\n${entry}`);
        } else {
            newQueueContent = `## On Deck (Next Up)\n${entry}\n\n` + newQueueContent;
        }

        fs.writeFileSync(QUEUE_PATH, newQueueContent, 'utf8');
        console.log("📝 Topic added to TOPIC_QUEUE.md");

        // Send notification
        await notifier.stepComplete('topic_selection', {
            title: result.title,
            rationale: result.rationale
        });

    } catch (error) {
        console.error("❌ Topic Selection Failed:", error.message);
        if (error.response) console.error(error.response.data);

        // Send failure notification
        await notifier.stepFailed('topic_selection', error);
    }
}

selectTopic();
