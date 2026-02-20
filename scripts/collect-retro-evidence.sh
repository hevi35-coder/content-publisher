#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <retrospective-dir> [repo] [since-date]"
  echo "Example: $0 docs/retrospective/retro_deep_20260220 hevi35-coder/content-publisher 2026-02-16"
  exit 1
fi

RETRO_DIR="$1"
REPO="${2:-hevi35-coder/content-publisher}"
SINCE_DATE="${3:-2026-02-16}"

if ! command -v gh >/dev/null 2>&1; then
  echo "::error::gh CLI is required."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is required."
  exit 1
fi

gh auth status >/dev/null 2>&1 || {
  echo "::error::gh authentication is required (GH_TOKEN or gh auth login)."
  exit 1
}

mkdir -p "${RETRO_DIR}/evidence"

echo "[retro-evidence] collecting workflow runs..."
gh run list -R "${REPO}" --limit 200 \
  --json databaseId,workflowName,event,status,conclusion,createdAt,headSha,url \
  > "${RETRO_DIR}/evidence/runs_200.json"

jq -r '.[] | "\(.createdAt)\t\(.workflowName)\t\(.event)\t\(.status)/\(.conclusion)\t\(.databaseId)\t\(.headSha)\t\(.url)"' \
  "${RETRO_DIR}/evidence/runs_200.json" \
  > "${RETRO_DIR}/evidence/runs_200.tsv"

jq '{
  total:(length),
  byWorkflow:(group_by(.workflowName)|map({
    workflow:.[0].workflowName,
    total:length,
    success:(map(select(.conclusion=="success"))|length),
    failure:(map(select(.conclusion=="failure"))|length),
    timed_out:(map(select(.conclusion=="timed_out"))|length),
    cancelled:(map(select(.conclusion=="cancelled"))|length)
  })),
  byEvent:(group_by(.event)|map({
    event:.[0].event,
    total:length,
    success:(map(select(.conclusion=="success"))|length),
    failure:(map(select(.conclusion=="failure"))|length)
  }))
}' "${RETRO_DIR}/evidence/runs_200.json" > "${RETRO_DIR}/evidence/run_summary.json"

echo "[retro-evidence] collecting repository settings snapshot..."
gh variable list -R "${REPO}" | sort > "${RETRO_DIR}/evidence/repo_variables.tsv"
gh secret list -R "${REPO}" | sort > "${RETRO_DIR}/evidence/repo_secrets.tsv"

echo "[retro-evidence] collecting commit timeline..."
git log --since="${SINCE_DATE}" --pretty=format:'%h\t%ad\t%s' --date=iso --reverse \
  > "${RETRO_DIR}/evidence/commits_since_${SINCE_DATE}.tsv"

if npm run --silent ops:slot-health >/tmp/retro_slot_health.txt 2>/dev/null; then
  cp /tmp/retro_slot_health.txt "${RETRO_DIR}/evidence/slot_health_snapshot.txt"
fi

echo "[retro-evidence] done:"
echo "  ${RETRO_DIR}/evidence"
