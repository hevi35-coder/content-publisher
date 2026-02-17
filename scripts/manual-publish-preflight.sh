#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/manual-publish-preflight.sh --files "<draft1,draft2>" [--dry-run true|false] [-R owner/repo]

Examples:
  ./scripts/manual-publish-preflight.sh --files "drafts/2026-02-16-example.md,drafts/2026-02-16-example-ko.md" --dry-run true -R hevi35-coder/content-publisher
  ./scripts/manual-publish-preflight.sh --files "drafts/2026-02-16-example.md" --dry-run false
EOF
}

FILES_INPUT="${TARGET_FILES:-}"
DRY_RUN_INPUT="${DRY_RUN:-true}"
REPO_INPUT="${GITHUB_REPOSITORY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --files|-f)
      FILES_INPUT="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN_INPUT="${2:-}"
      shift 2
      ;;
    --repo|-R)
      REPO_INPUT="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "::error::Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "${DRY_RUN_INPUT}" != "true" && "${DRY_RUN_INPUT}" != "false" ]]; then
  echo "::error::--dry-run must be 'true' or 'false' (received: ${DRY_RUN_INPUT})"
  exit 1
fi

FILES_NORMALIZED="$(
  printf '%s' "${FILES_INPUT}" \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | sed '/^$/d'
)"

if [[ -z "${FILES_NORMALIZED}" ]]; then
  echo "::error::--files is required for manual publish preflight."
  usage
  exit 1
fi

echo "[manual-preflight] Starting manual publish preflight..."
echo "[manual-preflight] DRY_RUN=${DRY_RUN_INPUT}"
if [[ -n "${REPO_INPUT}" ]]; then
  echo "[manual-preflight] Repository=${REPO_INPUT}"
fi
echo "[manual-preflight] Target files:"
printf '%s\n' "${FILES_NORMALIZED}"

./scripts/check-node-runtime.sh

if command -v gh >/dev/null 2>&1 && { [[ -n "${GH_TOKEN:-}" ]] || [[ -n "${GITHUB_TOKEN:-}" ]]; }; then
  if [[ -n "${REPO_INPUT}" ]]; then
    export GITHUB_REPOSITORY="${REPO_INPUT}"
  fi
  ./scripts/check-gh-cli-auth.sh
else
  echo "::warning::Skipping gh auth preflight (gh missing or GH_TOKEN/GITHUB_TOKEN not set)."
fi

DRY_RUN="${DRY_RUN_INPUT}" \
TARGET_FILES="${FILES_NORMALIZED}" \
MIN_DRAFT_BODY_CHARS="${MIN_DRAFT_BODY_CHARS:-120}" \
node scripts/check-publish-secrets.js

echo "[manual-preflight] ✅ Preflight passed. Safe to trigger Auto Publish workflow."
