# Dev.to Publisher (MandaAct)

Automated content pipeline for MandaAct's engineering blog on Dev.to.

## 🚀 Features

*   **Topic Selection**: GPT-4o analyzes trends and selects topics weekly.
*   **Draft Generation**: Writes articles with **Fact-Checking** to prevent hallucinations.
*   **Quality Gate**: SEO, readability, and content length validation (0-100 score).
*   **Cover Image**: Auto-generates branded cover images using Puppeteer.
*   **Auto-Publish**: Publishes when PR is merged; archives automatically.
*   **Auto-Merge**: PRs auto-merge after 24 hours if no review requested.

## 🔄 Workflow

| Day | Step | Script | Output |
|-----|------|--------|--------|
| Sun | Topic Selection | `select_topic.js` | `TOPIC_QUEUE.md` |
| Mon | Draft + Quality Check | `generate_draft.js` | PR + Score |
| Mon | Auto-Merge Enabled | GitHub Actions | Scheduled Merge |
| Tue+ | Publish (on merge) | `publish.js` | Dev.to Article |

## 🛠️ Tech Stack

*   **Node.js**: Core scripting.
*   **Puppeteer**: Cover images & verification.
*   **GitHub Actions**: CI/CD + scheduling.
*   **OpenAI GPT-4o**: Content intelligence via GitHub Models.
*   **Dev.to API**: CMS integration.

## 📂 Key Files

| File | Purpose |
|------|---------|
| `config.js` | Centralized settings (GitHub, paths, AI) |
| `lib/ai-client.js` | Shared OpenAI client |
| `quality_gate.js` | SEO + readability checker |
| `MandaAct_Context.md` | Product knowledge base |
| `TOPIC_QUEUE.md` | Upcoming topics |
| `ARCHIVE.md` | Published history (auto-updated) |

## 🔗 Knowledge Base (Obsidian)
*   [Project Overview](obsidian://open?vault=MyObsidianVault&file=10_Projects%2F01_Active%2FDevTo%20Publisher%2F00_Overview.md)
*   [Architecture](obsidian://open?vault=MyObsidianVault&file=30_Technical%2FDevTo_Publisher_Architecture.md)
*   [MandaAct Context](obsidian://open?vault=MyObsidianVault&file=30_Technical%2FMandaAct_Context.md)

