# Codex Cloud Environment Setup (Content Publisher)

## 1. 환경 변수 / 시크릿

- 환경 변수(예시)
  - `DRY_RUN=true`
  - `AUTO_SYNC_QUEUE=false`
- 시크릿(필요 시)
  - `GH_TOKEN` (또는 `GITHUB_TOKEN`)
  - `DEVTO_API_KEY`, `HASHNODE_PAT`, `HASHNODE_PUBLICATION_ID`
  - `BLOGGER_BLOG_ID`, `BLOGGER_ACCESS_TOKEN` 또는 OAuth 세트

## 2. 설정 스크립트 입력 위치

- **설정 스크립트(초기 1회)** 입력값:
  - `./scripts/cloud-env-setup.sh`
- **유지 관리 스크립트(작업 전 반복)** 입력값:
  - `./scripts/cloud-env-maintenance.sh`

## 3. 실행 후 빠른 점검

- `./scripts/check-node-runtime.sh` (`Node.js >=20` 강제 검증)
- `./scripts/check-gh-cli-auth.sh`
- `./scripts/manual-publish-preflight.sh --files "<draft1,draft2>" --dry-run true -R <owner/repo>` (수동 발행 one-shot preflight)
- `node scripts/diagnose-workflow-run.js -R <owner/repo>` (최신 실패 run 진단)
- `node scripts/diagnose-workflow-run.js -R <owner/repo> --workflow "Auto Publish (Content Publisher)"` (워크플로우 단위 진단)
- `npm test`
- `./scripts/ci-sanity-checks.sh`

## 4. 실패 시 우선 확인

- `gh` 미설치: setup script가 성공했는지 확인
- Node 버전 불일치: `./scripts/check-node-runtime.sh` 실행 결과 확인 (`Node.js 20+` 필요)
- 토큰 누락: `GH_TOKEN` 또는 `GITHUB_TOKEN` 주입 여부 확인
- 수동 발행 no-op: `draft_files` 입력값 누락 여부 확인
- 실패 run 원인 추출: `node scripts/diagnose-workflow-run.js -R <owner/repo> --run-url <actions-run-url> -o run_log.txt`
