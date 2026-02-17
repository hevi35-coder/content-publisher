#!/usr/bin/env bash
set -euo pipefail

echo "[cloud-setup] Starting initial environment setup..."

./scripts/check-node-runtime.sh

if ! command -v npm >/dev/null 2>&1; then
  echo "::error::npm is required but not installed."
  exit 1
fi
echo "[cloud-setup] npm: $(npm --version)"

if ! command -v gh >/dev/null 2>&1; then
  echo "[cloud-setup] gh CLI not found. Attempting installation..."
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "::error::apt-get is unavailable. Install gh manually or use an image with gh preinstalled."
    exit 1
  fi

  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO="sudo"
    else
      echo "::error::Root privileges are required to install gh (sudo not available)."
      exit 1
    fi
  fi

  ${SUDO} apt-get update -y
  ${SUDO} apt-get install -y gh
fi
echo "[cloud-setup] gh: $(gh --version | head -n 1)"

if [ -f package-lock.json ]; then
  echo "[cloud-setup] Installing dependencies with npm ci..."
  npm ci
else
  echo "[cloud-setup] package-lock.json not found. Using npm install..."
  npm install
fi

echo "[cloud-setup] Running sanity checks..."
./scripts/ci-sanity-checks.sh

echo "[cloud-setup] Setup complete."
