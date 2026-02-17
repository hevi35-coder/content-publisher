#!/usr/bin/env bash
set -euo pipefail

echo "[cloud-maintenance] Running lightweight maintenance..."

./scripts/check-node-runtime.sh

if [ ! -d node_modules ]; then
  echo "[cloud-maintenance] node_modules not found. Installing dependencies..."
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "::warning::gh CLI is not installed. Run ./scripts/cloud-env-setup.sh to install it."
else
  echo "[cloud-maintenance] gh: $(gh --version | head -n 1)"
fi

echo "[cloud-maintenance] Verifying syntax and workflow YAML..."
./scripts/ci-sanity-checks.sh

echo "[cloud-maintenance] Maintenance complete."
