# Content Publisher

> 🚀 Multi-platform content publishing for MandaAct marketing.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📤 Multi-Platform | Dev.to, Hashnode, Blogger 동시 발행 |
| 🌐 Auto-Translation | GPT-4o 영→한 번역 (Blogger) |
| 🖼️ Cover Generation | 언어별 자동 커버 이미지 생성 |
| 🔐 OAuth Auto-Refresh | Blogger 토큰 자동 갱신 |
| 📦 Git Auto-Push | 커버 이미지 main 자동 푸시 |
| 🔍 Quality Gate | AI 패턴 제거, SEO 검증 |
| 📧 **Email Notifications** | 단계별 알림 (Gmail SMTP) |
| 🔄 **Retry with Verification** | 타임아웃 + 재시도 + 검증 |

## 📅 주간 자동화 스케줄

| 요일 | 시간 | 작업 |
|------|------|------|
| 매일 | 00:40 KST | Publish Smoke (Dry Run, diagnostics artifact 업로드) |
| 일요일 | 13:00 KST | Topic Selection |
| 월/수/금 | 13:00 KST | Draft + PR + Auto-Merge (EN: 수요일, KOR: 월/수/금) |
| main push | 이벤트 기반 | Auto Publish (KO→Blogger, EN→Dev.to+Hashnode) |

## 🚀 Quick Start

```bash
# 단일 플랫폼
node lib/publisher.js drafts/my-article.md devto

# 다중 플랫폼
node lib/publisher.js drafts/my-article.md devto,hashnode,blogger

# 네이버 수동 발행 준비
node scripts/export-naver.js drafts/my-article.md
```

### GitHub Actions 수동 발행

- `Auto Publish (Content Publisher)`를 수동 실행할 때 `draft_files` 입력값을 넣으세요.
- 입력 예시: `drafts/2026-02-16-example.md,drafts/2026-02-16-example-ko.md`
- 수동 실행에서 `draft_files`가 비어 있으면 워크플로우는 즉시 실패합니다(무의미한 성공 방지).
- 수동 실행의 `dry_run` 기본값은 `true`입니다(안전 기본값).
- `dry_run=true`이면 실제 게시 없이 시뮬레이션만 수행됩니다.
- `dry_run=false`일 때는 워크플로우에서 채널별 필수 시크릿을 사전 검증합니다(누락 시 즉시 실패).
- 프리플라이트에서 draft 파일 무결성도 검증합니다(파일 존재, frontmatter `title`, 본문 최소 길이).
- 본문 최소 길이는 Repository Variable `MIN_DRAFT_BODY_CHARS`(기본 `120`)로 조정할 수 있습니다.
- `MIN_DRAFT_BODY_CHARS`는 양의 정수여야 하며, 잘못 설정되면 preflight가 즉시 실패합니다.
- 기본값은 실발행 공개(`FORCE_PUBLISH=true` 동작)이며, draft 상태를 유지하려면 `FORCE_PUBLISH=false`를 명시하세요.
- GitHub Actions에서는 Repository Variable `FORCE_PUBLISH` 기본값을 `true`로 두는 것을 권장합니다.
- `VERIFY_PUBLISHED_URLS` 기본값은 `true`이며, 실발행 후 URL 공개 접근 가능성을 추가 검증합니다.

## 📁 Architecture

```
content-publisher/
├── adapters/
│   ├── DevtoAdapter.js     # Dev.to API
│   ├── HashnodeAdapter.js  # Hashnode GraphQL
│   └── BloggerAdapter.js   # Blogger REST
├── lib/
│   ├── publisher.js        # Main router + Retry + Notify
│   ├── notifier.js         # 📧 Email notifications (Gmail)
│   ├── retry-manager.js    # 🔄 Retry with verification
│   ├── translator.js       # EN→KO + 플랫폼 적응
│   ├── oauth-manager.js    # OAuth 자동 갱신
│   ├── git-manager.js      # Git 자동 푸시
│   ├── quality-gate.js     # 품질 검증
│   └── sanitizer.js        # AI 패턴 제거
├── scripts/
│   └── export-naver.js     # 📝 네이버 블로그 HTML 생성
├── generate_cover.js       # 커버 이미지 생성
├── select_topic.js         # 주제 선정
├── generate_draft.js       # 초안 작성
└── config.js
```

## 🔐 Environment Variables

```env
# AI (Required)
GITHUB_MODELS_TOKEN=xxx

# Dev.to
DEVTO_API_KEY=xxx

# Hashnode
HASHNODE_PAT=xxx
HASHNODE_PUBLICATION_ID=xxx

# Blogger (Google OAuth)
BLOGGER_BLOG_ID=xxx
BLOGGER_CLIENT_ID=xxx
BLOGGER_CLIENT_SECRET=xxx
BLOGGER_REFRESH_TOKEN=xxx

# Email Notifications (Gmail SMTP)
GMAIL_USER=xxx@gmail.com
GMAIL_APP_PASSWORD=xxx
NOTIFY_EMAIL_TO=xxx@email.com

# Optional safety override (default: fail-closed)
# true 로 설정하면 checkExists API 조회 실패 시 fail-open(신규 발행 시도)합니다.
# CHECK_EXISTS_FAIL_OPEN=true
```

## 🌍 Platform Support

| Platform | Language | API | Auto-Publish | Retry |
|----------|----------|-----|--------------|-------|
| Dev.to | English | REST | ✅ | ✅ |
| Hashnode | English | GraphQL | ✅ | ✅ |
| Blogger | **Korean** | REST + OAuth | ✅ | ✅ |
| Naver Blog | Korean | - | ⚠️ [Manual](docs/NAVER_MANUAL_GUIDE.md) | - |

## 📧 Notifications

각 발행 단계에서 이메일 알림:
- ✅ 발행 성공 (플랫폼별 URL 포함)
- ❌ 발행 실패 (에러 상세)
- 🎉 파이프라인 완료 요약
- `notify-on-failure`는 Weekly/Smoke/Auto Publish 워크플로우의 비정상 종료(`failure`, `timed_out`, `cancelled` 등)를 별도로 감시합니다.
- 실패 메일에는 workflow/job 실패 요약(실패 job/step, 브랜치, 트리거, 실행 URL)이 포함됩니다.
- 실패 메일에는 failed log에서 추출한 `Error Highlights`(최대 25줄)가 포함됩니다.
- `Error Highlights`는 민감 패턴(token/authorization 등)을 마스킹하고 길이를 제한해 전송합니다.
- 실패 메일에는 workflow 유형별 즉시 조치 가이드(Weekly/Auto/Smoke 분기)가 포함됩니다.
- `notify-on-failure` 실행 페이지의 Step Summary에도 실패 요약이 기록됩니다.
- Step Summary에는 실패 job 목록, `Error Highlights`, fetch/highlight note, 즉시 조치 가이드가 포함됩니다.
- 각 워크플로우의 인라인 메일(step `Notify on Failure (Legacy Inline)`)은 기본 비활성화이며, 필요 시 Repository Variable `INLINE_FAILURE_NOTIFY=true`로 켤 수 있습니다.
- Smoke 실패 시 `publish-smoke-diagnostics-*` 아티팩트에 실패 파일과 로그 스니펫이 저장됩니다.
- Smoke Summary에는 이전 실행 대비 실패 파일 변화(신규 실패/복구)가 함께 표시됩니다.
- Smoke 실행 전에도 draft 무결성 preflight(`check-publish-secrets`)를 수행합니다.

## ✅ CI Sanity

- `PR Sanity` 워크플로우는 아래를 자동 검증합니다.
  - GitHub Actions YAML 문법
  - 스케줄 cron 가드레일(주간 13:00 KST, 스모크 00:40 KST)
  - 워크플로우 summary 가드레일(`GITHUB_STEP_SUMMARY` 핵심 섹션)
  - 핵심 JS 스크립트 구문 오류 (`node --check`)
  - 회귀 테스트 (`npm test`)
- 로컬에서도 동일하게 실행 가능:
  - `./scripts/ci-sanity-checks.sh`
  - `npm test`
- 클라우드에서 GitHub Actions 진단(`gh run list` 등) 전에는:
  - `./scripts/check-node-runtime.sh` (`Node.js >=20` 확인)
  - `./scripts/check-gh-cli-auth.sh`
- 수동 발행 one-shot preflight:
  - `./scripts/manual-publish-preflight.sh --files "<draft1,draft2>" --dry-run true -R <owner/repo>`
- 실패 run 원인 자동 진단:
  - 최신 실패 run 자동 탐지: `node scripts/diagnose-workflow-run.js -R <owner/repo>`
  - 특정 워크플로우만 필터링: `node scripts/diagnose-workflow-run.js -R <owner/repo> --workflow "Auto Publish (Content Publisher)"`
  - 특정 run URL 진단 + 파일 저장: `node scripts/diagnose-workflow-run.js -R <owner/repo> --run-url <actions-run-url> -o run_log.txt`
- Codex 클라우드 환경 설정 스크립트:
  - Setup script: `./scripts/cloud-env-setup.sh`
  - Maintenance script: `./scripts/cloud-env-maintenance.sh`
- `Weekly Content Automation` 워크플로우는 실행 초기에 preflight를 수행합니다.
  - `MODELS_TOKEN` 누락 시 즉시 실패
  - Draft 경로에서는 `GH_TOKEN/GITHUB_TOKEN` + `gh` API 인증 사전 점검

## 📚 Documentation

- [네이버 수동 발행 가이드](docs/NAVER_MANUAL_GUIDE.md)
- [클라우드 수동 발행 리허설 체크리스트](docs/CLOUD_MANUAL_PUBLISH_REHEARSAL_CHECKLIST.md)
- [Codex 클라우드 환경 세팅](docs/CODEX_CLOUD_SETUP.md)
- [클라우드 실행 Runbook](docs/CLOUD_EXEC_RUNBOOK.md)
- [Obsidian Docs](../MyObsidianVault/10_Projects/01_Active/Content%20Publisher/00_Overview.md)
