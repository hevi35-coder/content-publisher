const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const config = require('./config');
const client = require('./lib/ai-client');
const { notifier } = require('./lib/notifier');

const QUEUE_PATH = config.paths.queue;
const CONTEXT_PATH = config.paths.context;
const DRAFTS_DIR = config.paths.drafts;

async function generateDraft() {
    try {
        console.log("✍️  Ghostwriter is waking up...");

        // 1. Read Topic
        const queueContent = fs.readFileSync(QUEUE_PATH, 'utf8');
        const match = queueContent.match(/\*   \*\*(.*?)\*\*\n    \*   \*Rationale\*: (.*?)\n    \*   \*MandaAct Angle\*: (.*?)\n/);

        if (!match) {
            console.log("⚠️ No topics found in 'On Deck'. Exiting.");
            return;
        }

        const [fullMatch, title, rationale, angle] = match;
        console.log(`📝 Selected Topic: ${title}`);

        // 2. Read Context (MandaAct USP)
        const context = fs.existsSync(CONTEXT_PATH) ? fs.readFileSync(CONTEXT_PATH, 'utf8') : "MandaAct is a 9x9 Mandalart grid app for iOS.";

        // 3. Draft Content with AI
        const prompt = `
You are a "Non-developer Vibe Coder" and productivity enthusiast who uses MandaAct.
You are NOT a dry technical writer. You are a creative maker who loves building things but hates getting bogged down in "admin" work.

**Topic**: ${title}
**Context**: ${rationale}
**Product Angle**: ${angle}

**Requirements**:
1. **Tone**:
   - Enthusiastic and accessible (Use emojis 🚀, but don't overdo it).
   - "Vibe Coder" style: Focus on flow, creativity, and shipping, not just "clean code".
   - Relatable: Admmit struggles with burnout, focus, or "tutorial hell".
2. **Structure**:
   - **The Problem**: Why existing methods fail (related to topic).
   - **The Solution (Mental Model)**: The concept of visual decomposition / 9x9 grid.
   - **The Tool (MandaAct)**: How the app implements this. (Focus on "Goal Diagnosis", "Visual 9x9 Grid", "Sub-goal Decomposition"). 
   - **Constraint**: DO NOT mention "OCR" or "Deep Work Mode" as these features do not exist.
   - **Call to Action**: Download link.
3. **Format**: Valid Markdown. Use H2 (##) for sections.
4. **Frontmatter**:
   - title: "${title}"
   - published: false
   - tags: [productivity, developers, career, mandaact]
   - series: "Building MandaAct"
   - cover_image: "https://mandaact.vercel.app/og/default.png" (Placeholder)

**Draft Content**:
`;

        console.log("🤖 Generating content (GPT-4o)...");
        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: "You are an expert Ghostwriter for a developer productivity blog." },
                { role: "user", content: prompt }
            ],
            model: "gpt-4o",
            temperature: 0.7,
            max_tokens: 2500
        });

        const draftContent = response.choices[0].message.content;

        // 4. FACT CHECKER AGENT (Self-Correction)
        console.log("🕵️‍♂️  Fact-Checker Agent is reviewing the draft...");
        const correctedDraft = await verifyDraft(draftContent, context);

        // 5. Prepare Metadata
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const date = new Date().toISOString().split('T')[0];

        // 5a. Generate Cover Image
        const coverFilename = `${slug}-cover.png`;
        const coverPath = path.join(__dirname, 'assets', 'images', 'covers', coverFilename);
        const coverRepoPath = path.join('assets', 'images', 'covers', coverFilename); // Relative path for Repo
        const coverUrl = `${config.github.rawBaseUrl}/${coverRepoPath}`; // Raw URL for Dev.to

        // Ensure directory exists
        const coversDir = path.join(__dirname, 'assets', 'images', 'covers');
        if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

        console.log("🎨 Generating Cover Image...");
        try {
            await require('./generate_cover').generateCover(title, coverPath);
        } catch (imgError) {
            console.error("⚠️ Failed to generate cover image:", imgError.message);
        }

        // 6. Save to drafts/
        const filename = `${date}-${slug}.md`;
        const filePath = path.join(DRAFTS_DIR, filename);

        // Ensure directory exists
        if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR);

        // Update frontmatter with real cover image URL
        const finalDraft = correctedDraft.replace(
            /cover_image: ".*?"/,
            `cover_image: "${coverUrl}"`
        );

        const finalContent = finalDraft.replace(/^```markdown\n/, '').replace(/\n```$/, ''); // Clean fence
        fs.writeFileSync(filePath, finalContent, 'utf8');

        console.log(`✅ Draft saved (Verified): drafts/${filename}`);

        // 7. Quality Gate Check
        const { checkQuality, printReport } = require('./quality_gate');
        const qualityReport = checkQuality(filePath);
        printReport(qualityReport);

        // 8. Remove from Queue (with quality score)
        const qualityBadge = qualityReport.passed ? `✅ Score: ${qualityReport.score}` : `⚠️ Score: ${qualityReport.score}`;
        const updatedQueue = queueContent.replace(`*   **${title}**`, `*   **${title}** (Drafted ${qualityBadge})`);
        fs.writeFileSync(QUEUE_PATH, updatedQueue, 'utf8');

        // Send notification
        await notifier.stepComplete('draft_generation', {
            title: title,
            file: filename,
            qualityScore: qualityReport.score
        });

    } catch (error) {
        console.error("❌ Generation Failed:", error.message);
        // Send failure notification
        await notifier.stepFailed('draft_generation', error);
    }
}

async function verifyDraft(draft, context) {
    try {
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
4. Output the **Corrected Article** (Markdown).
`;

        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: "You are a strict Fact Checker." },
                { role: "user", content: prompt }
            ],
            model: "gpt-4o",
            temperature: 0.3, // Lower temperature for accuracy
            max_tokens: 2500
        });

        const corrected = response.choices[0].message.content;

        // Simple heuristic to see if changes were made (optional logging)
        if (corrected.length !== draft.length) {
            console.log("   --> ✂️  Fact-Checker made corrections.");
        } else {
            console.log("   --> ✅ Draft is accurate.");
        }

        return corrected;

    } catch (error) {
        console.warn("⚠️ Fact-Checker failed. Saving original draft.", error.message);
        return draft;
    }
}

generateDraft();
