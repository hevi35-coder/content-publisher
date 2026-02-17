#!/usr/bin/env bash
set -euo pipefail

echo "[gh-preflight] Checking GitHub CLI availability..."
if ! command -v gh >/dev/null 2>&1; then
  echo "::error::gh CLI is not installed. Install gh in setup script first."
  exit 1
fi

TOKEN_SOURCE=""
if [ -n "${GH_TOKEN:-}" ]; then
  TOKEN_SOURCE="GH_TOKEN"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  export GH_TOKEN="${GITHUB_TOKEN}"
  TOKEN_SOURCE="GITHUB_TOKEN (aliased to GH_TOKEN)"
fi

if [ -z "${GH_TOKEN:-}" ]; then
  echo "::error::Missing GH_TOKEN (or GITHUB_TOKEN). Set one of them in the environment."
  exit 1
fi

echo "[gh-preflight] Token source: ${TOKEN_SOURCE}"
echo "[gh-preflight] Validating token with GitHub API..."
TMP_ERR="$(mktemp /tmp/gh-preflight.XXXXXX.err)"
trap 'rm -f "${TMP_ERR}"' EXIT
if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  if REPO_NAME="$(gh api "repos/${GITHUB_REPOSITORY}" --jq '.full_name' 2>"${TMP_ERR}")"; then
    echo "[gh-preflight] Auth OK for repository: ${REPO_NAME}"
  else
    echo "[gh-preflight] Repository probe failed; trying user probe..."
    if LOGIN="$(gh api user --jq '.login' 2>"${TMP_ERR}")"; then
      echo "[gh-preflight] Auth OK as user: ${LOGIN}"
    else
      echo "::error::GitHub API auth failed. Check token scope/expiration."
      cat "${TMP_ERR}" || true
      exit 1
    fi
  fi
else
  if LOGIN="$(gh api user --jq '.login' 2>"${TMP_ERR}")"; then
    echo "[gh-preflight] Auth OK as user: ${LOGIN}"
  else
    echo "::error::GitHub API auth failed. Check token scope/expiration."
    cat "${TMP_ERR}" || true
    exit 1
  fi
fi

echo "[gh-preflight] gh auth status output:"
gh auth status || true
