#!/usr/bin/env bash
set -euo pipefail

echo "[ci-sanity] Validate GitHub workflow YAML files"
ruby -ryaml -e 'Dir.glob(".github/workflows/*.yml").sort.each { |f| YAML.load_file(f); puts "OK #{f}" }'

echo "[ci-sanity] Syntax-check top-level Node scripts"
node --check config.js
node --check publish.js
node --check generate_draft.js
node --check generate_cover.js
node --check quality_gate.js
node --check select_topic.js

echo "[ci-sanity] Syntax-check module directories"
find adapters lib scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check

echo "[ci-sanity] Syntax-check shell scripts"
while IFS= read -r script; do
  bash -n "$script"
  echo "OK $script"
done < <(find scripts -type f -name '*.sh' | sort)

echo "[ci-sanity] Completed"
