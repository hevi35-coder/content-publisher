# Publishing Workflow

1.  **Commit & Push**: Ensure all assets and drafts are pushed to GitHub.
2.  **Environment Variables**: Create a `.env` file with `DEVTO_API_KEY`.
3.  **Run Script**: `node publish.js`
    *   The script reads the draft.
    *   Replaces local `../assets` links with `raw.githubusercontent.com` links.
    *   Posts to Dev.to.
    *   **Auto-Verification**: Fetches the published URL and checks if all images load (200 OK).

## Setup
```bash
npm install
cp .env.example .env
# Edit .env
```
