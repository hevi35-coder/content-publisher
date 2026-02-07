# 📅 Weekly Content Automation Plan (MandaAct)

**Goal**: Establish a consistent "Productivity for Developers" brand presence on Dev.to by publishing high-quality, target-tailored content once a week.

## 1. Content Strategy: "Target-Tailored"
We will focus on the intersection of **Developer Life** and **Productivity Science**, positioning MandaAct as the solution.

### Target Audience
*   **Developers** experiencing burnout or "tutorial hell".
*   **Indie Hackers** juggling multiple projects.
*   **Junior Devs** trying to learn structured goal setting.

### Thematic Pillars (Rotation)
1.  **The Science of Planning**: Why 9x9 grids work better than linear lists.
2.  **Dev Lifestyle**: Managing side projects without quitting your day job.
3.  **Mental Models**: Applying engineering principles (recursion, decomposition) to life goals.
4.  **MandaAct Case Studies**: Real examples of usage.

---

## 2. Weekly Workflow (The Machine)

We will implement a **semi-automated** workflow initially to ensure quality, moving to **fully automated** as confidence grows.

### **Phase 0: The Topic Committee (Sunday - Fully Automated)**
*   **Trigger**: Scheduled GitHub Action (Sunday 00:00 UTC).
*   **Mechanism**: `node select_topic.js`
*   **The "Committee" (Simulated Agents)**:
    1.  **Trend Analyst**: Scans for "Hot keywords" in productivity (e.g., "Developer Burnout", "Rust vs Go", "Deep Work").
    2.  **Product Owner**: Ensures alignment with MandaAct features (OCR, 9x9 Grid).
    3.  **Editor-in-Chief**: Checks for duplicates against `ARCHIVE.md` and selects the winner.
*   **Output**: appends the winning topic to `TOPIC_QUEUE.md` with a "Rationale" and "Target Audience".

### **Phase 1: "Assisted Autopilot" (Current)**
### 2. The Ghostwriter (Monday)
*   **Role**: Content Creator
*   **Persona**: "The Vibe Coder" (Enthusiastic, Relatable, "Shipping over Admin")
*   **Action**: 
    1.  Reads the top topic from `TOPIC_QUEUE.md`.
    2.  Generates a draft using `MandaAct_Context.md` as ground truth.
    3.  **Fact-Check**: Self-corrects any feature hallucinations.
    4.  **Delivery**: Creates a Pull Request (PR) for mobile review. (SD/DALL-E or layered text).
        *   **Action**: Create Pull Request (PR) to `main`.
    *   **Tuesday (User)**:
        *   Review PR.
        *   (Optional) Tweak content/images.
        *   **Action**: Merge PR.
    *   **Wednesday (Agent via GitHub Action)**:
        *   Trigger: On Push to `main` (filtered by folder).
        *   **Action**: Run `publish.js` (Upsert/Publish).
        *   **Action**: Run Browser Verification.

---

## 3. Implementation Steps

### Step 1: Content Queue & Archive
*   `TOPIC_QUEUE.md`: Upcoming topics.
*   `ARCHIVE.md`: List of already published titles (to avoid duplicates).

### Step 2: The Committee Script (`select_topic.js`)
*   **Role**: The "Brain" that runs on Sundays.
*   **Logic**:
    *   Input: `ARCHIVE.md` list.
    *   Process: Calls LLM with `System: You are a fierce editorial board...`.
    *   Output: Adds 1 high-quality topic to Queue.

### Step 3: Content Generator Script (`generate_draft.js`)
*   **Input**: Topic Title + Tone (Professional/Witty).
*   **Output**: `drafts/YYYY-MM-DD-slug.md` with:
    *   Frontmatter (tags, series).
    *   Hook (Problem statement).
    *   Solution (MandaAct logic).
    *   Call to Action (App Store link).

### Step 3: GitHub Action Workflow (`.github/workflows/auto-publish.yml`)
*   **Trigger**: Push to `drafts/**` on `main`.
*   **Job**:
    1.  Checkout code.
    2.  Install dependencies (`npm ci`).
    3.  Run `node publish.js` (configured for idempotency).

---

## 4. Next Actions
1.  **Approve**: Validated this Weekly Plan?
2.  **Setup**: Create `TOPIC_QUEUE.md`.
3.  **Build**: Create the GitHub Action for auto-publishing on merge.
