# Dev.to Publisher (MandaAct)

Automated content pipeline for MandaAct's engineering blog on Dev.to.

## 🚀 Features

*   **Topic Selection**: OpenAI (GPT-4o) analyzes trends and selects topics weekly.
*   **Draft Generation**: Writes full articles based on MandaAct context, including **Fact-Checking** to prevent hallucinations.
*   **Cover Image**: Automatically generates clean, branded cover images using Puppeteer.
*   **Auto-Publish**: Publishes to Dev.to automatically when a PR is merged to `main`.

## 🔄 Workflow

1.  **Sunday**: `select_topic.js` runs via GitHub Actions -> Updates `TOPIC_QUEUE.md`.
2.  **Monday**: `generate_draft.js` runs -> Creates a Draft + Cover Image -> Opens a PR.
3.  **Tuesday**: Human Review -> **Merge PR**.
4.  **Immediate**: `auto-publish.yml` triggers -> Publishes article to Dev.to.

## 🛠️ Tech Stack

*   **Node.js**: Scripting logic.
*   **Puppeteer**: Cover image generation & browser verification.
*   **GitHub Actions**: Scheduling and CI/CD.
*   **OpenAI API (GPT-4o)**: Content intelligence.
*   **Dev.to API**: CMS integration.

## 📂 Key Files

*   `MandaAct_Context.md`: The "Brain" (Product knowledge base). [Obsidian Link](obsidian://open?vault=MyObsidianVault&file=30_Technical%2FMandaAct_Context.md)
*   `ARCHIVE.md`: History of published topics.
*   `TOPIC_QUEUE.md`: Backlog of upcoming topics.
*   `AUTOMATION_FLOW.md`: Detailed diagram of the pipeline.
*   `WEEKLY_CONTENT_PLAN.md`: Strategic content pillars.

## 🔗 Knowledge Base (Obsidian)
*   **Project Overview**: [00_Overview.md](obsidian://open?vault=MyObsidianVault&file=10_Projects%2F01_Active%2FDevTo%20Publisher%2F00_Overview.md)
*   **Architecture**: [DevTo_Publisher_Architecture.md](obsidian://open?vault=MyObsidianVault&file=30_Technical%2FDevTo_Publisher_Architecture.md)
