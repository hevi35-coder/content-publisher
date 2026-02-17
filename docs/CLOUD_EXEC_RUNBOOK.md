# Cloud Execution Runbook (Content Publisher)

> 목적: Codex Cloud 에이전트가 이 문서를 읽고 **명령을 실제 실행**하여 수동 발행 리허설/실발행/실패 진단까지 완료하도록 하는 실행용 가이드

## 0. 실행 전제

- 워크스페이스 경로: `/workspace/content-publisher`
- 저장소: `hevi35-coder/content-publisher`
- 테스트 대상 draft 2개(권장):
  - 영문: `drafts/2026-02-09-why-developers-should-think-in-systems-not-tasks.md`
  - 한글: `drafts/2026-02-09-why-developers-should-think-in-systems-not-tasks-ko.md`

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
./scripts/check-node-runtime.sh
./scripts/cloud-env-maintenance.sh
./scripts/check-gh-cli-auth.sh
./scripts/ci-sanity-checks.sh
npm test --silent
```

## 4. DRY_RUN 사전 점검 + 수동 발행

### 4-1) one-shot preflight

```bash
./scripts/manual-publish-preflight.sh --files "$RUNBOOK_FILES" --dry-run true -R "$REPO"
```

### 4-2) Auto Publish 수동 실행 (DRY_RUN=true)

```bash
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

### 5-1) one-shot preflight (실시크릿 검증 포함)

```bash
./scripts/manual-publish-preflight.sh --files "$RUNBOOK_FILES" --dry-run false -R "$REPO"
```

### 5-2) Auto Publish 수동 실행 (DRY_RUN=false)

```bash
gh workflow run "Auto Publish (Content Publisher)" \
  -R "$REPO" \
  -f draft_files="$RUNBOOK_FILES" \
  -f dry_run=false
```

```bash
RUN_ID="$(gh run list -R "$REPO" --workflow "Auto Publish (Content Publisher)" --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" -R "$REPO" --exit-status
gh run view "$RUN_ID" -R "$REPO" --json name,conclusion,url,event,headBranch
```

## 6. 실패 시 표준 진단 (필수)

### 6-1) 워크플로우 기준 진단

```bash
node scripts/diagnose-workflow-run.js -R "$REPO" --workflow "Auto Publish (Content Publisher)"
```

### 6-2) 특정 run URL로 진단 파일 저장

```bash
FAILED_RUN_URL="$(gh run list -R "$REPO" --workflow "Auto Publish (Content Publisher)" --limit 20 --json url,conclusion --jq '[.[] | select(.conclusion != "success")][0].url')"
node scripts/diagnose-workflow-run.js -R "$REPO" --run-url "$FAILED_RUN_URL" -o run_log.txt
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
