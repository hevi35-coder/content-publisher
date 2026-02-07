# 🔄 Dev.to Weekly Automation Workflow

This diagram illustrates the "Zero-Touch" content pipeline for MandaAct.

```mermaid
graph TD
    %% Schedules
    Sunday((📅 Sunday 09:00)) -->|Trigger| TopicCommittee
    Monday((📅 Monday 09:00)) -->|Trigger| DraftWriter

    %% Phase 1: Topic Selection
    subgraph "Phase 1: Topic Committee"
        TopicCommittee[Script: select_topic.js]
        
        Archive[📄 ARCHIVE.md] --> TopicCommittee
        Trends[🌍 Market Trends] -.-> TopicCommittee
        
        TopicCommittee -->|GPT-4o API| AI_Topic[🤖 Topic Generation]
        AI_Topic -->|Enforce| MandaActAngle{MandaAct Angle?}
        
        MandaActAngle -- Yes --> QueueUpd[Update TOPIC_QUEUE.md]
        MandaActAngle -- No --> AI_Topic
    end

    %% Connection
    QueueUpd -->|Commit & Push| Repo[📂 GitHub Repo]
    Repo -->|Read Top Item| DraftWriter

    %% Phase 2: Draft Generation
    subgraph "Phase 2: Draft Writer"
        DraftWriter[Script: generate_draft.js]
        
        Context[📄 MandaAct_Context.md] --> DraftWriter
        Queue[📄 TOPIC_QUEUE.md] --> DraftWriter
        
        DraftWriter -->|GPT-4o API| AI_Draft[🤖 Draft Generation]
        AI_Draft -->|Puppeteer| CoverGen[🖼️ Cover Image Generation]

        %% Phase 3: Fact Checker
        subgraph "Phase 3: Quality Assurance"
            CoverGen --> FactCheck[🕵️‍♂️ Fact-Checker Agent]
            Context -->|Ground Truth| FactCheck
            
            FactCheck -->|Verify Features| Hallucination{Hallucination?}
            Hallucination -- Yes --> Fix[✂️ Rewrite Section] --> QualityGate
            Hallucination -- No --> QualityGate[📊 Quality Gate]
            
            QualityGate -->|SEO + Readability| Score{Score >= 70?}
            Score -- Pass --> FinalDraft[📝 Final Markdown]
            Score -- Fail --> WarningLog[⚠️ Log Warning]
            WarningLog --> FinalDraft
        end
    end

    %% Phase 4: Delivery + Auto-Merge
    FinalDraft -->|Save| DraftFile[📄 drafts/YYYY-MM-DD-slug.md]
    DraftFile -->|Create Branch| Branch[🌿 draft/weekly-date]
    Branch -->|Push & Open PR| PR[🚀 Pull Request]
    PR -->|Enable| AutoMerge[🔄 Auto-Merge (24h)]
    
    %% Phase 5: Publish
    AutoMerge -->|Merge to Main| Merge[🔀 Merge]
    Merge -->|Trigger| AutoPublish[🚀 Auto-Publish Workflow]
    AutoPublish -->|Exec| PublishScript[Script: publish.js]
    PublishScript -->|API| DevTo[📢 Dev.to Live]
    PublishScript -->|Update| ArchiveUpd[📄 ARCHIVE.md Updated]
```

## Workflow Steps

1.  **Sunday (Topic Committee)**:
    *   `select_topic.js` reads past articles (`ARCHIVE.md`) to avoid duplicates.
    *   Consults GPT-4o to pick a trending topic connecting to MandaAct.
    *   Result: New topic added to `TOPIC_QUEUE.md`.

2.  **Monday (Draft Writer + Quality Gate)**:
    *   `generate_draft.js` takes the top topic from Queue.
    *   **Generation**: Writes a full article draft with cover image.
    *   **Fact-Checking**: Reviews for hallucinations (OCR, Deep Work Mode → replaced).
    *   **Quality Gate**: Scores article (0-100) on SEO, readability, length, images.
    *   Opens PR with quality score badge.

3.  **Auto-Merge (24 hours)**:
    *   PR is set to auto-merge via `gh pr merge --auto`.
    *   If no changes requested, merges automatically.

4.  **Publish (on Merge)**:
    *   `auto-publish.yml` triggers `publish.js`.
    *   Article pushed to Dev.to.
    *   `ARCHIVE.md` automatically updated.

