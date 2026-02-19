# Cloud Execution Runbook (Content Publisher)

> 목적: Codex Cloud 에이전트가 이 문서를 읽고 **명령을 실제 실행**하여 수동 발행 리허설/실발행/실패 진단까지 완료하도록 하는 실행용 가이드
>
> 주의: 이 runbook은 `main`의 현재 파일 구조를 기준으로 작성했다. 선택 스크립트가 없는 경우 자동으로 fallback 명령을 사용한다.

## 0. 실행 전제

- 워크스페이스 경로: `/workspace/content-publisher`
- 저장소: `hevi35-coder/content-publisher`
- 테스트 대상 draft 2개(권장):
  - 영문: `drafts/2026-02-09-why-developers-should-think-in-systems-not-tasks.md`
  - 한글: `drafts/2026-02-09-why-developers-should-think-in-systems-not-tasks-ko.md`
- `gh workflow run`/`gh run *`를 실행하려면 `GH_TOKEN`(또는 사전 `gh auth login`)이 필요하다.

## 1. 에이전트 실행 원칙

- 문서에 있는 명령은 설명만 하지 말고 **실제로 실행**한다.
- 단계마다 `성공/실패`, 핵심 로그 1~3줄, 다음 액션을 짧게 보고한다.
- 실패하면 즉시 중단하지 말고 `진단 단계`까지 실행한 뒤 결과를 보고한다.

## 2. 공통 변수 설정

```bash
cd /workspace/content-publisher
REPO="hevi35-coder/content-publisher"
RUNBOOK_FILES="drafts/2026-02-09-why-developers-should-think-in-systems-not-tasks.md,drafts/2026-02-09-why-developers-should-think-in-systems-not-tasks-ko.md"
```

## 3. 환경/기본 점검

```bash
set -euo pipefail

echo "[1/5] Node/npm 버전"
node -v
npm -v

echo "[2/5] 의존성 설치"
npm ci

echo "[3/5] openai 모듈 로드 확인"
node -e "require('openai'); console.log('openai module: OK')"

echo "[4/5] 선택 스크립트 점검(없으면 skip)"
[ -x ./scripts/check-node-runtime.sh ] && ./scripts/check-node-runtime.sh || echo "skip: scripts/check-node-runtime.sh"
[ -x ./scripts/cloud-env-maintenance.sh ] && ./scripts/cloud-env-maintenance.sh || echo "skip: scripts/cloud-env-maintenance.sh"
[ -x ./scripts/check-gh-cli-auth.sh ] && ./scripts/check-gh-cli-auth.sh || echo "skip: scripts/check-gh-cli-auth.sh"
[ -x ./scripts/ci-sanity-checks.sh ] && ./scripts/ci-sanity-checks.sh || echo "skip: scripts/ci-sanity-checks.sh"

echo "[5/5] 테스트"
npm test --silent
```

## 4. DRY_RUN 사전 점검 + 수동 발행

### 4-1) preflight

```bash
set -euo pipefail

if [ -x ./scripts/manual-publish-preflight.sh ]; then
  ./scripts/manual-publish-preflight.sh --files "$RUNBOOK_FILES" --dry-run true -R "$REPO"
else
  echo "fallback: manual-publish-preflight.sh 없음 -> 기본 파일 검증 실행"
  IFS=',' read -r -a FILES <<< "$RUNBOOK_FILES"
  [ "${#FILES[@]}" -gt 0 ] || { echo "::error::RUNBOOK_FILES가 비어 있습니다."; exit 1; }
  for file in "${FILES[@]}"; do
    file="$(echo "$file" | xargs)"
    [ -f "$file" ] || { echo "::error::draft 파일 없음: $file"; exit 1; }
    echo "ok: $file"
  done
fi
```

### 4-2) Auto Publish 수동 실행 (DRY_RUN=true)

```bash
set -euo pipefail
gh auth status >/dev/null 2>&1 || { echo "::error::gh 인증 미구성. GH_TOKEN 설정 또는 gh auth login 필요"; exit 1; }
[ -n "${LIVE_PUBLISH_CONFIRM_TOKEN:-}" ] || { echo "::error::LIVE_PUBLISH_CONFIRM_TOKEN 환경변수가 비어 있습니다."; exit 1; }

gh workflow run "Auto Publish (Content Publisher)" \
  -R "$REPO" \
  -f draft_files="$RUNBOOK_FILES" \
  -f dry_run=true
```

```bash
RUN_ID="$(gh run list -R "$REPO" --workflow "Auto Publish (Content Publisher)" --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" -R "$REPO" --exit-status
gh run view "$RUN_ID" -R "$REPO" --json name,conclusion,url,event,headBranch
```

## 5. 실발행 전환 (DRY_RUN=false)

### 5-1) preflight (실발행)

```bash
set -euo pipefail

if [ -x ./scripts/manual-publish-preflight.sh ]; then
  ./scripts/manual-publish-preflight.sh --files "$RUNBOOK_FILES" --dry-run false -R "$REPO"
else
  echo "fallback: manual-publish-preflight.sh 없음 -> 기본 파일 검증 실행"
  IFS=',' read -r -a FILES <<< "$RUNBOOK_FILES"
  [ "${#FILES[@]}" -gt 0 ] || { echo "::error::RUNBOOK_FILES가 비어 있습니다."; exit 1; }
  for file in "${FILES[@]}"; do
    file="$(echo "$file" | xargs)"
    [ -f "$file" ] || { echo "::error::draft 파일 없음: $file"; exit 1; }
    echo "ok: $file"
  done
  echo "주의: 실발행은 GitHub Actions 저장소 시크릿(DEVTO/HASHNODE/BLOGGER)이 사전에 구성되어 있어야 합니다."
fi
```

### 5-2) Auto Publish 수동 실행 (DRY_RUN=false)

```bash
set -euo pipefail
gh auth status >/dev/null 2>&1 || { echo "::error::gh 인증 미구성. GH_TOKEN 설정 또는 gh auth login 필요"; exit 1; }

gh workflow run "Auto Publish (Content Publisher)" \
  -R "$REPO" \
  -f draft_files="$RUNBOOK_FILES" \
  -f dry_run=false \
  -f live_publish_confirm="$LIVE_PUBLISH_CONFIRM_TOKEN"
```

```bash
RUN_ID="$(gh run list -R "$REPO" --workflow "Auto Publish (Content Publisher)" --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" -R "$REPO" --exit-status
gh run view "$RUN_ID" -R "$REPO" --json name,conclusion,url,event,headBranch
```

## 6. 실패 시 표준 진단 (필수)

### 6-1) 워크플로우 기준 진단

```bash
set -euo pipefail

if [ -f scripts/diagnose-workflow-run.js ]; then
  node scripts/diagnose-workflow-run.js -R "$REPO" --workflow "Auto Publish (Content Publisher)"
elif [ -f scripts/diagnose-workflow-failure.js ]; then
  node scripts/diagnose-workflow-failure.js \
    --repository "$REPO" \
    --workflow-name "Auto Publish (Content Publisher)" \
    --run-id "" \
    --run-url "" \
    --event-name "workflow_dispatch" \
    --head-branch "main"
else
  echo "::error::진단 스크립트를 찾을 수 없습니다."
  exit 1
fi
```

### 6-2) 실패 run 기준 진단 파일 저장 (`run_log.txt`)

```bash
set -euo pipefail

FAILED_RUN_URL="$(gh run list -R "$REPO" --workflow "Auto Publish (Content Publisher)" --limit 20 --json url,conclusion --jq '[.[] | select(.conclusion != "success")][0].url' || true)"
if [ -z "${FAILED_RUN_URL:-}" ] || [ "$FAILED_RUN_URL" = "null" ]; then
  echo "실패 run URL을 찾지 못했습니다." > run_log.txt
  exit 0
fi

if [ -f scripts/diagnose-workflow-run.js ]; then
  node scripts/diagnose-workflow-run.js -R "$REPO" --run-url "$FAILED_RUN_URL" -o run_log.txt
elif [ -f scripts/diagnose-workflow-failure.js ]; then
  node scripts/diagnose-workflow-failure.js \
    --repository "$REPO" \
    --workflow-name "Auto Publish (Content Publisher)" \
    --run-id "" \
    --run-url "$FAILED_RUN_URL" \
    --event-name "workflow_dispatch" \
    --head-branch "main"
  if [ -f output/failure-diagnosis.md ]; then
    cp output/failure-diagnosis.md run_log.txt
  fi
else
  echo "::error::진단 스크립트를 찾을 수 없습니다." > run_log.txt
  exit 1
fi
```

## 7. 최종 보고 포맷 (에이전트 출력 템플릿)

아래 형식으로만 간단히 보고:

```text
[Step] Environment checks
- status: success|failed
- key log: ...

[Step] DRY_RUN preflight
- status: success|failed
- key log: ...

[Step] DRY_RUN workflow run
- status: success|failed
- run url: ...

[Step] REAL preflight
- status: success|failed
- key log: ...

[Step] REAL workflow run
- status: success|failed
- run url: ...

[Step] Diagnosis (if failed)
- status: success|failed
- report: run_log.txt (or inline summary)
```

## 8. 클라우드에 보낼 자연어 프롬프트 예시

```text
/workspace/content-publisher/docs/CLOUD_EXEC_RUNBOOK.md를 기준으로 명령을 실제 실행해.
설명만 하지 말고 단계별로 실행 결과를 요약해줘.
실패가 나면 diagnose 단계까지 수행해서 run_log.txt까지 생성해.
```
