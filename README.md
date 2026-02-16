# Content Publisher

> 🚀 Multi-platform content publishing for MandaAct marketing.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📤 Multi-Platform | Dev.to, Hashnode, Blogger 동시 발행 |
| 🌐 Dual-Language Drafting | EN/KO 초안 병렬 생성 후 채널별 라우팅 |
| 🖼️ Cover Generation | 언어별 자동 커버 이미지 생성 |
| 🔐 OAuth Auto-Refresh | Blogger 토큰 자동 갱신 |
| 📦 Git Auto-Push | 커버 이미지 main 자동 푸시 |
| 🔍 Quality Gate | AI 패턴 제거, SEO 검증 |
| 📧 **Email Notifications** | 단계별 알림 (Gmail SMTP) |
| 🔄 **Retry with Verification** | 타임아웃 + 재시도 + 검증 |

## 📅 주간 자동화 스케줄

| 요일 | 시간 | 작업 |
|------|------|------|
| 일요일 | 01:00 KST | Topic Selection |
| 월/수/금 | 01:00 KST | Draft + PR + Auto-Merge |
| main push | 이벤트 기반 | Auto Publish (KO→Blogger, EN→Dev.to+Hashnode) |

## 🚀 Quick Start

```bash
# 자동 라우팅 (권장)
# *-ko.md -> blogger
# *.md    -> devto,hashnode
node publish.js drafts/my-article.md

# 단일 플랫폼
node lib/publisher.js drafts/my-article.md devto

# 다중 플랫폼
node lib/publisher.js drafts/my-article.md devto,hashnode,blogger

# 네이버 수동 발행 준비
node scripts/export-naver.js drafts/my-article.md
```

## 🧪 Safe Validation (Workflow Dispatch)

- `Weekly Content Automation` 수동 실행 시 `dry_run=true`로 실행하면 draft 단계에서 브랜치 푸시/PR 생성을 생략합니다.
- `Auto Publish (Content Publisher)` 수동 실행 시 `dry_run=true`로 실행하면 외부 플랫폼 API 호출과 커버 이미지 푸시를 시뮬레이션합니다.
- `Auto Publish (Content Publisher)` 수동 실행에서 `draft_files`가 비어 있거나 형식이 잘못되면 즉시 실패하여 원인과 조치 방법을 로그에 출력합니다.
- 두 workflow 모두 `workflow_dispatch` 기본값은 `dry_run=true`입니다.

## 🚨 Failure Diagnosis

- `Notify on Workflow Failure`는 `Weekly Content Automation` 및 `Auto Publish (Content Publisher)`의 main 브랜치 실패를 감지합니다.
- 실패 시 원인 분류(`output/failure-diagnosis.json`, `output/failure-diagnosis.md`)를 생성하고 메일 본문에 조치 가이드를 포함합니다.

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
│   ├── translator.js       # 플랫폼별 포맷 적응
│   ├── oauth-manager.js    # OAuth 자동 갱신
│   ├── git-manager.js      # Git 자동 푸시
│   ├── publish-quality-gate.js # 발행 직전 품질 검증
│   ├── quality-gate.js     # (호환 레이어) publish-quality-gate.js
│   └── sanitizer.js        # AI 패턴 제거
├── scripts/
│   └── export-naver.js     # 📝 네이버 블로그 HTML 생성
├── generate_cover.js       # 커버 이미지 생성
├── select_topic.js         # 주제 선정
├── generate_draft.js       # 초안 작성
├── draft-quality-gate.js   # 드래프트 품질 점수/SEO 평가
├── quality_gate.js         # (호환 레이어) draft-quality-gate.js
├── publish.js              # 자동 라우팅 엔트리포인트
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

# Draft Quality Gate (Optional)
# default(false): quality score below threshold blocks draft pipeline
# true: continue draft pipeline even when quality is below threshold
ALLOW_LOW_QUALITY_DRAFTS=false

# Topic Committee Auto Sync (Optional)
# default(false): select_topic.js does not push directly to main
# true: allow direct git push from select_topic.js
AUTO_SYNC_QUEUE=false

# Git Sync Strict Mode (Optional)
# default(false): local/dev keeps warning-only behavior on git sync failure
# true: fail the pipeline when cover/asset sync to main fails
# note: CI=true already enforces strict behavior automatically
STRICT_GIT_SYNC=false
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

## 📚 Documentation

- [네이버 수동 발행 가이드](docs/NAVER_MANUAL_GUIDE.md)
- [Obsidian Docs](../MyObsidianVault/10_Projects/01_Active/Content%20Publisher/00_Overview.md)
