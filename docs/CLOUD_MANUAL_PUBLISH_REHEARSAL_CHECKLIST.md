# Cloud Manual Publish Rehearsal Checklist

> 대상: Codex 클라우드 환경에서 `Auto Publish (Content Publisher)`를 수동 실행하기 전/중/후 점검

## 1. 사전 점검 (필수)

- [ ] 컨테이너 런타임 확인: Node.js 20
  - [ ] `./scripts/check-node-runtime.sh` 통과 (`Node.js >=20`)
- [ ] Codex 환경 스크립트 설정
  - [ ] Setup: `./scripts/cloud-env-setup.sh`
  - [ ] Maintenance: `./scripts/cloud-env-maintenance.sh`
- [ ] (진단용) GitHub CLI 인증 점검: `./scripts/check-gh-cli-auth.sh`
  - [ ] `GH_TOKEN` 또는 `GITHUB_TOKEN` 설정 확인
- [ ] 워크플로우 대상 draft 경로 확인 (`drafts/*.md`)
- [ ] 영어/한글 라우팅 확인
  - [ ] 영문 draft: Dev.to + Hashnode
  - [ ] 한글 draft (`*-ko.md`): Blogger
- [ ] GitHub Actions Secrets 설정 확인
  - [ ] `DEVTO_API_KEY`
  - [ ] `HASHNODE_PAT`
  - [ ] `HASHNODE_PUBLICATION_ID`
  - [ ] `BLOGGER_BLOG_ID`
  - [ ] `BLOGGER_ACCESS_TOKEN` 또는 (`BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET`, `BLOGGER_REFRESH_TOKEN`)
  - [ ] 실패 알림용: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL_TO`
- [ ] 환경 변수 확인
  - [ ] 리허설 단계: `DRY_RUN=true`
  - [ ] 실제 발행 단계: `DRY_RUN=false`
  - [ ] (선택) `MIN_DRAFT_BODY_CHARS` 임계값 확인 (기본 `120`)
- [ ] one-shot preflight 실행
  - [ ] `./scripts/manual-publish-preflight.sh --files "<draft1,draft2>" --dry-run true -R <owner/repo>`

## 2. DRY_RUN 리허설 (권장)

- [ ] GitHub Actions에서 `Auto Publish (Content Publisher)` 수동 실행
- [ ] `draft_files` 입력값 지정 (콤마/줄바꿈 가능)
  - 예시: `drafts/2026-02-16-example.md,drafts/2026-02-16-example-ko.md`
  - 미입력 시 워크플로우는 즉시 실패(`No draft files resolved for manual run`)
- [ ] `dry_run` 입력값 확인
  - 기본값 `true` (권장 유지)
  - 실발행 테스트가 아닌 경우 절대 `false`로 변경하지 않기
- [ ] 로그 확인
  - [ ] `Resolve Target Draft Files`에서 대상 파일 수가 기대값과 일치
  - [ ] `Preflight Secret Validation`에서 draft 무결성(파일/제목/본문 길이) 통과
  - [ ] `Publish Mode Summary`에서 `DRY_RUN=true` 경고 출력
  - [ ] `Run Publisher`에서 플랫폼 라우팅이 기대값과 일치
  - [ ] 각 플랫폼 로그에 `DRY_RUN: Simulation mode` 출력
- [ ] 결과 판정
  - [ ] 워크플로우 종료 상태: `success`
  - [ ] 외부 채널(Dev.to/Hashnode/Blogger)에 실제 신규 글이 생성되지 않음

## 3. 실제 수동 발행 (전환)

- [ ] `DRY_RUN=false`로 변경
- [ ] `live_publish_confirm` 입력
  - [ ] 기본값: `LIVE_PUBLISH_OK`
  - [ ] 저장소 변수 `LIVE_PUBLISH_CONFIRM_TOKEN`을 쓰는 경우 해당 값으로 입력
- [ ] 동일 `draft_files`로 다시 수동 실행
- [ ] 실행 후 검증
  - [ ] `PUBLICATION SUMMARY`에 플랫폼별 성공 URL 출력
  - [ ] Dev.to/Hashnode/Blogger 대시보드에서 게시 확인
  - [ ] 실패 알림 메일 정상 수신(실패 케이스가 있을 때)

## 4. 실패 시 즉시 점검 포인트

- [ ] `draft_files` 오탈자 또는 파일 미존재 (`Draft file not found`)
- [ ] 수동 실행인데 `draft_files` 미입력 (`No draft files resolved for manual run`)
- [ ] 시크릿 누락 (`Missing required env vars`)
- [ ] 토큰 권한/만료 문제 (Dev.to/Hashnode/Blogger API 인증 실패)
- [ ] `DRY_RUN=true` 상태로 실제 발행을 기대한 오인
- [ ] 표준 진단 실행: `node scripts/diagnose-workflow-run.js -R <owner/repo> --run-url <actions-run-url> -o run_log.txt`

## 5. 운영 권장 규칙

- [ ] 새 환경에서는 반드시 DRY_RUN 1회 성공 후 실발행
- [ ] 실발행은 한 번에 1~2개 draft로 시작
- [ ] 실패 로그(run URL)를 `run_log.txt` 또는 이슈에 남겨 재발 방지
