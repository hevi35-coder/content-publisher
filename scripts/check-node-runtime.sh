#!/usr/bin/env bash
set -euo pipefail

MIN_NODE_MAJOR="${MIN_NODE_MAJOR:-20}"

if ! [[ "${MIN_NODE_MAJOR}" =~ ^[0-9]+$ ]]; then
  echo "::error::MIN_NODE_MAJOR must be a positive integer (received: ${MIN_NODE_MAJOR})"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "::error::Node.js is required but not installed."
  exit 1
fi

NODE_VERSION="$(node --version)"
if [[ "${NODE_VERSION}" =~ ^v([0-9]+)\..* ]]; then
  NODE_MAJOR="${BASH_REMATCH[1]}"
else
  echo "::error::Unable to parse Node.js version: ${NODE_VERSION}"
  exit 1
fi

if [ "${NODE_MAJOR}" -lt "${MIN_NODE_MAJOR}" ]; then
  echo "::error::Unsupported Node.js runtime ${NODE_VERSION}. Require Node.js >= ${MIN_NODE_MAJOR}."
  echo "[runtime-check] In Codex Cloud, set Node.js 20+ in preinstalled packages and recreate the environment."
  exit 1
fi

echo "[runtime-check] Node.js OK: ${NODE_VERSION} (required >= ${MIN_NODE_MAJOR})"
