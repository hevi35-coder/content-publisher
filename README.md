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
| 일요일 | 09:00 KST | Topic Selection |
| 월요일 | 09:00 KST | Draft + PR |
| 화요일 | - | Auto-Merge → Publish |

## 🚀 Quick Start

```bash
# 단일 플랫폼
node lib/publisher.js drafts/my-article.md devto

# 다중 플랫폼
node lib/publisher.js drafts/my-article.md devto,hashnode,blogger

# 네이버 수동 발행 준비
node scripts/export-naver.js drafts/my-article.md
```

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
- [Obsidian Docs](../MyObsidianVault/10_Projects/01_Active/DevTo%20Publisher/00_Overview.md)

