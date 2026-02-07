# 🕵️‍♂️ Post-Mortem & Retrospective: MandaAct 1.1.0 Manual Publish

**Date**: 2026-02-07
**Participants**: Alex (PM), Sarah (Architect), David (DevOps/QA)
**Topic**: Review of the "Draft -> Manual Publish" Workflow

## 1. Executive Summary (Alex)
> "We successfully published the article and verified it. However, the process revealed significant friction points in **Asset Management** and **Verification**. We need to iron these out before we automate this for weekly content."

*   **Goal**: Publish MandaAct 1.1.0 Announcement.
*   **Result**: ✅ Success. Article is live with correct images.
*   **Time Spent**: High (due to image path issues and verification loops).

---

## 2. Technical Review (David & Sarah)

### 🟢 What Went Well
1.  **Scripted Publishing**: The `publish.js` script cleanly handles the API interaction. We didn't need to touch the Dev.to UI.
2.  **Markdown-First**: Writing in Markdown locally allowed us to use our own tools and version control.
3.  **Verification**: Adding `Puppeteer` and static analysis gives us high confidence that what we ship is not broken.

### 🔴 Challenges & Bottlenecks
1.  **The "Image Path" Dilemma**: 
    *   *Issue*: Dev.to requires public URLs. Local drafts use relative paths (`../assets`).
    *   *Friction*: We had to push assets to GitHub *before* publishing. If we changed an image (like the user did), we had to push again.
    *   *Insight*: Automation must handle "Asset Upload" as a distinct, pre-publish step.
2.  **Idempotency (Duplicate Titles)**: 
    *   *Issue*: Running the script twice failed because of "Title already exists".
    *   *Fix*: We implemented "Upsert" logic (Check -> Update/Create). This is **critical** for a weekly runner.
3.  **Draft vs. Live Verification**:
    *   *Issue*: Puppeteer sees 404 on Draft links.
    *   *Insight*: We need a way to preview drafts without publishing, or accept that "Browser Verification" only works for `published: true` or authenticated sessions.

---

## 3. Action Items for "Weekly Automation" (The Plan)

Based on this, here is how we should build the **Weekly Content System**:

1.  **Asset Pipeline Upgrade**:
    *   Instead of manually pushing screenshots, the weekly script should likely **auto-commit** generated images to a specific branch (`content-assets`) before attempting to publish.
    *   Or, use a dedicated image host (like Imgur API or Cloudinary) if GitHub raw links prove too slow/cached. (GitHub is fine for now if we accept the "push first" constraint).

2.  **Strict "Upsert" Policy**:
    *   The `publish.js` script is now robust. It should be the core of our GitHub Action. We must ensure it always checks for existing articles by title or slug to prevent spamming Dev.to.

3.  **Verification Strategy**:
    *   **Pre-Publish**: Static check (do regex matches exist in the content?).
    *   **Post-Publish**: Puppeteer check (is the live page rendering?).
    *   *New Request*: Add a **"Dry Run"** mode that validates the markdown structure and image existence locally without hitting the Dev.to API.

4.  **Content Separation**:
    *   We need a clearer folder structure for weekly content.
    *   Current: `drafts/` (mixed).
    *   Future: `drafts/weekly/YYYY-WW-Topic.md`.

---

## 4. Derived Directive
> **"Automation must be Idempotent and Self-Correcting."**
> We cannot rely on a human to fix image paths or retry failed jobs. The system must handle "Asset Sync" and "Article Update" autonomously.

Signed,
*The Expert Panel*

---

## 5. Phase 2 Retrospective: Weekly Automation System (2026-02-08)

### 🌟 Achievements
We moved from manual publishing to a **Fully Automated Content Pipeline**:

1.  **Subject Matter Expert (Topic Committee)**:
    *   Implemented `select_topic.js` using **GitHub Models (GPT-4o)**.
    *   It now runs on Sundays, acting as an "Editorial Board" that selects topics based on trends and checks against the `ARCHIVE.md` to avoid duplication.
    *   **Crucial Fix**: Enforced a "MandaAct Angle" to ensure topics always loop back to the product's USP (e.g., "Deep Work" -> "9x9 Grid").

2.  **The Ghostwriter (Draft Generator)**:
    *   Implemented `generate_draft.js`.
    *   It picks the top topic from `TOPIC_QUEUE.md` and writes a full Markdown draft in `drafts/`.
    *   **Hallucination Control**: We integrated a **Fact-Checker Agent** loop.
        *   *Problem*: AI invented features like "OCR" and "Deep Work Mode".
        *   *Solution*: The script now self-corrects by cross-referencing the draft against `MandaAct_Context.md`. If it finds a fake feature, it rewrites the section using real features (e.g., "AI Recommendations").

3.  **The Scheduler (GitHub Actions)**:
    *   Created `.github/workflows/weekly-content.yml`.
    *   **Sunday**: Topic Selection.
    *   **Monday**: Draft Generation & PR Creation.
    *   **Zero-Touch**: The user only needs to review the PR and merge to publish.

### 📉 Lessons Learned
*   **Context is King**: The AI *will* hallucinate if you don't give it a strict "Ground Truth" file. The `MandaAct_Context.md` was vital.
*   **Tokens Matter**: GitHub Models requires a separate token from OpenAI. Configuring this correctly in `.env` and Secrets is the first step.
*   **Verification Loops**: "Trust but Verify" applies to LLMs. The Fact-Checker loop added ~5 seconds to execution time but saved hours of manual editing.

### 🔄 Current Status
The system is **Active & Under Verification**.
*   **Next Steps**: Analyze initial outputs, refine prompts, and improve error handling.

