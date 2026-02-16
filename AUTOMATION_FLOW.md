# 🔄 Content Publisher Weekly Automation Workflow

This diagram reflects the current production flow.

```mermaid
graph TD
    Sunday((📅 Sunday 01:00 KST)) -->|Trigger| TopicCommittee
    MWF((📅 Mon/Wed/Fri 01:00 KST)) -->|Trigger| DraftWriter

    subgraph "Phase 1: Topic Committee"
        TopicCommittee[Script: select_topic.js]
        TopicCommittee --> QueueUpd[Update TOPIC_QUEUE.md]
        QueueUpd --> TopicPR[Topic PR + Auto-Merge]
        TopicPR --> StatusTopic[Set required status: pr-sanity]
    end

    subgraph "Phase 2: Draft Writer + QA"
        DraftWriter[Script: generate_draft.js]
        DraftWriter --> Drafts[Create EN/KO drafts + covers]
        Drafts --> DraftPR[Draft PR + Auto-Merge]
        DraftPR --> StatusDraft[Set required status: pr-sanity]
    end

    StatusDraft --> MergeMain[Merge to main]
    MergeMain --> AutoPublish[Workflow: Auto Publish (Content Publisher)]
    AutoPublish --> Route{Filename Route}
    Route -- "*-ko.md" --> Blogger[📢 Blogger (Korean)]
    Route -- "*.md" --> Devto[📢 Dev.to (English)]
    Route -- "*.md" --> Hashnode[📢 Hashnode (English)]

    PRSanity[Workflow: PR Sanity] --> Gate[npm test regression gate]
    Gate --> TopicPR
    Gate --> DraftPR
```

## Operational Notes

1. Manual workflow runs default to `dry_run=true`.
2. Topic/Draft PRs are bot-created and use explicit required-status posting for branch protection compatibility.
3. Auto publish uses unified `publish.js` routing:
   - Korean draft -> Blogger
   - English draft -> Dev.to + Hashnode
