# Publishing Workflow

1. **Commit & Push**: Ensure draft and assets are in GitHub.
2. **Environment Variables**: Configure `.env` or GitHub Secrets for platform keys.
   - EN route: `DEVTO_API_KEY`, `HASHNODE_PAT`, `HASHNODE_PUBLICATION_ID`
   - KO route: `BLOGGER_BLOG_ID` + OAuth token set
3. **Run Script**: `node publish.js <draft-path>`
   - `*-ko.md` → Blogger
   - English draft → Dev.to + Hashnode
4. **Verification**:
   - `publish.js` routes by filename and executes multi-platform publisher.
   - On CI, `.github/workflows/auto-publish.yml` publishes changed draft files on `main` pushes.
   - On CI, `.github/workflows/publish-smoke.yml` runs daily dry-run smoke publish for early detection and uploads diagnostics artifact (`smoke-summary.md`, `smoke-run.log`).
   - On CI, `.github/workflows/weekly-content.yml` preflight-checks `MODELS_TOKEN` and `gh` authentication before draft PR automation.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env
```

## Cloud Rehearsal

- 클라우드 수동 발행 전 체크리스트: `docs/CLOUD_MANUAL_PUBLISH_REHEARSAL_CHECKLIST.md`
