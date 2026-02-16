# Publishing Workflow

## 1) Pre-flight

1. Ensure draft/asset changes are committed and pushed.
2. Confirm required secrets are set.
   - EN route: `DEVTO_API_KEY`, `HASHNODE_PAT`, `HASHNODE_PUBLICATION_ID`
   - KO route: `BLOGGER_BLOG_ID` + (`BLOGGER_ACCESS_TOKEN` or refresh-token trio)
3. Use `dry_run=true` first for safe validation.

## 2) Local CLI Publish

```bash
# Recommended: automatic routing by filename
# *-ko.md -> blogger
# *.md    -> devto,hashnode
node publish.js drafts/my-article.md

# Optional manual override
node publish.js drafts/my-article.md devto,hashnode,blogger
```

What happens:
- Converts local `../assets` paths to GitHub raw URLs.
- Applies platform-specific adaptation (`devto`, `hashnode`, `blogger`).
- Uses upsert behavior (check existing title, then update/publish).
- In `DRY_RUN=true`, external API writes and git push side effects are skipped.

## 3) GitHub Actions Flow

1. `Weekly Content Automation`
   - Sunday 01:00 KST: topic queue update.
   - Mon/Wed/Fri 01:00 KST: draft generation + PR + auto-merge.
2. `Auto Publish (Content Publisher)`
   - Triggers on `main` push with `drafts/**` changes.
   - Routes Korean drafts to Blogger, English drafts to Dev.to + Hashnode.
3. `PR Sanity`
   - Runs install + regression test gate (`npm test`) for PR safety.
