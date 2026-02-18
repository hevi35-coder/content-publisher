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

MAX_ATTEMPTS="${GH_AUTH_MAX_ATTEMPTS:-4}"
RETRY_BASE_MS="${GH_AUTH_RETRY_BASE_MS:-2000}"
REQUEST_TIMEOUT_SECONDS="${GH_AUTH_REQUEST_TIMEOUT_SECONDS:-10}"
TOTAL_TIMEOUT_SECONDS="${GH_AUTH_TOTAL_TIMEOUT_SECONDS:-60}"

is_positive_int() {
  [[ "${1}" =~ ^[1-9][0-9]*$ ]]
}

is_non_negative_int() {
  [[ "${1}" =~ ^[0-9]+$ ]]
}

if ! is_positive_int "${MAX_ATTEMPTS}"; then
  echo "::error::GH_AUTH_MAX_ATTEMPTS must be a positive integer (current: ${MAX_ATTEMPTS})."
  exit 1
fi
if ! is_non_negative_int "${RETRY_BASE_MS}"; then
  echo "::error::GH_AUTH_RETRY_BASE_MS must be a non-negative integer (current: ${RETRY_BASE_MS})."
  exit 1
fi
if ! is_positive_int "${REQUEST_TIMEOUT_SECONDS}"; then
  echo "::error::GH_AUTH_REQUEST_TIMEOUT_SECONDS must be a positive integer (current: ${REQUEST_TIMEOUT_SECONDS})."
  exit 1
fi
if ! is_positive_int "${TOTAL_TIMEOUT_SECONDS}"; then
  echo "::error::GH_AUTH_TOTAL_TIMEOUT_SECONDS must be a positive integer (current: ${TOTAL_TIMEOUT_SECONDS})."
  exit 1
fi

echo "[gh-preflight] Token source: ${TOKEN_SOURCE}"
echo "[gh-preflight] Retry config: attempts=${MAX_ATTEMPTS}, base_backoff_ms=${RETRY_BASE_MS}, request_timeout_s=${REQUEST_TIMEOUT_SECONDS}, total_timeout_s=${TOTAL_TIMEOUT_SECONDS}"
echo "[gh-preflight] Validating token with GitHub API..."
TMP_ERR="$(mktemp /tmp/gh-preflight.XXXXXX.err)"
trap 'rm -f "${TMP_ERR}"' EXIT

START_EPOCH="$(date +%s)"
DEADLINE_EPOCH="$((START_EPOCH + TOTAL_TIMEOUT_SECONDS))"

run_gh_api_once() {
  local probe_timeout="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "${probe_timeout}" gh api "$@" 2>"${TMP_ERR}"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${probe_timeout}" gh api "$@" 2>"${TMP_ERR}"
  else
    gh api "$@" 2>"${TMP_ERR}"
  fi
}

time_left_seconds() {
  local now
  now="$(date +%s)"
  echo $((DEADLINE_EPOCH - now))
}

probe_with_retry() {
  local endpoint="$1"
  local jq_filter="$2"
  local label="$3"
  local attempt=1
  local response=""
  local rc=0

  while [ "${attempt}" -le "${MAX_ATTEMPTS}" ]; do
    local remaining
    remaining="$(time_left_seconds)"
    if [ "${remaining}" -le 0 ]; then
      echo "[gh-preflight] ${label} probe timed out after ${TOTAL_TIMEOUT_SECONDS}s total budget." >&2
      return 124
    fi

    local probe_timeout="${REQUEST_TIMEOUT_SECONDS}"
    if [ "${remaining}" -lt "${probe_timeout}" ]; then
      probe_timeout="${remaining}"
    fi
    if [ "${probe_timeout}" -lt 1 ]; then
      probe_timeout=1
    fi

    if response="$(run_gh_api_once "${probe_timeout}" "${endpoint}" --jq "${jq_filter}")"; then
      printf '%s\n' "${response}"
      return 0
    else
      rc=$?
    fi

    if [ "${rc}" -eq 124 ]; then
      echo "[gh-preflight] ${label} probe attempt ${attempt}/${MAX_ATTEMPTS} timed out (${probe_timeout}s)." >&2
    else
      echo "[gh-preflight] ${label} probe attempt ${attempt}/${MAX_ATTEMPTS} failed (exit=${rc})." >&2
      cat "${TMP_ERR}" >&2 || true
    fi

    if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
      return "${rc}"
    fi

    local backoff_ms=$((RETRY_BASE_MS * (2 ** (attempt - 1))))
    if [ "${backoff_ms}" -gt 30000 ]; then
      backoff_ms=30000
    fi
    if [ "${backoff_ms}" -gt 0 ]; then
      local sleep_seconds
      sleep_seconds="$(awk -v ms="${backoff_ms}" 'BEGIN { printf "%.3f", ms / 1000 }')"
      echo "[gh-preflight] Retrying ${label} probe in ${sleep_seconds}s..." >&2
      sleep "${sleep_seconds}"
    fi

    attempt=$((attempt + 1))
  done

  return 1
}

if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  if REPO_NAME="$(probe_with_retry "repos/${GITHUB_REPOSITORY}" '.full_name' 'repository')"; then
    echo "[gh-preflight] Auth OK for repository: ${REPO_NAME}"
  else
    echo "[gh-preflight] Repository probe failed; trying user probe..."
    if LOGIN="$(probe_with_retry 'user' '.login' 'user')"; then
      echo "[gh-preflight] Auth OK as user: ${LOGIN}"
    else
      echo "::error::GitHub API auth failed after retries/time budget. Check token scope/expiration or GitHub status."
      cat "${TMP_ERR}" || true
      exit 1
    fi
  fi
else
  if LOGIN="$(probe_with_retry 'user' '.login' 'user')"; then
    echo "[gh-preflight] Auth OK as user: ${LOGIN}"
  else
    echo "::error::GitHub API auth failed after retries/time budget. Check token scope/expiration or GitHub status."
    cat "${TMP_ERR}" || true
    exit 1
  fi
fi

echo "[gh-preflight] gh auth status output:"
gh auth status || true
