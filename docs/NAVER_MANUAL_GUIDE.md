# 네이버 블로그 수동 발행 가이드

> 네이버 블로그 API가 2020년 5월에 종료되어, 수동 발행 워크플로우를 최적화했습니다.

## 🚀 Quick Start

```bash
# 1. 발행 준비 (한국어 번역 + HTML 생성)
node scripts/export-naver.js drafts/your-article.md

# 2. HTML 파일 열기
open output/naver/content.html
```

## 📋 발행 단계

### Step 1: 스크립트 실행
```bash
node scripts/export-naver.js drafts/2026-02-07-mandaact-1-1-0-update.md
```

**출력:**
- � 제목 → 클립보드에 자동 복사
- 📄 `output/naver/content.html` → 본문 HTML
- 📄 `output/naver/content.txt` → 플레인 텍스트 (백업)

### Step 2: 네이버 블로그 에디터 열기
1. [blog.naver.com](https://blog.naver.com) 접속
2. **글쓰기** 버튼 클릭

### Step 3: 제목 붙여넣기
- 제목 필드 클릭 → `Cmd+V` (클립보드에 이미 복사됨)

### Step 4: 본문 붙여넣기
1. `content.html` 파일이 열린 브라우저 탭으로 이동
2. `Cmd+A` (전체 선택) → `Cmd+C` (복사)
3. 네이버 에디터의 본문 영역 클릭 → `Cmd+V` (붙여넣기)

### Step 5: 이미지 업로드
스크립트 실행 시 출력된 이미지 목록 확인:
```
🖼️ 이미지 목록 (수동 업로드 필요):
   1. 목표 진단 화면: ../assets/screenshots/screenshot_report.png
   2. AI 추천 화면: ../assets/screenshots/screenshot_ai_suggest.png
```

이미지 위치에 해당 파일 드래그 또는 **사진** 버튼으로 업로드

### Step 6: 설정 및 발행
- 이미지 크기: **원본** 선택
- 카테고리 선택
- **발행** 버튼 클릭

---

## ⏱️ 예상 소요 시간

| 단계 | 시간 |
|------|------|
| 스크립트 실행 | 10초 |
| 복사/붙여넣기 | 1분 |
| 이미지 업로드 | 2분 |
| 설정 및 발행 | 1분 |
| **총합** | **~5분** |

---

## 🔧 스크립트 기능

### `export-naver.js`가 하는 일:
1. ✅ 마크다운 파싱
2. ✅ 한국어 번역 (캐시 지원)
3. ✅ **bold** → `<b>` 변환
4. ✅ 링크 → 클릭 가능한 `<a>` 태그
5. ✅ 제목/본문 스타일링
6. ✅ 이미지 위치 표시
7. ✅ 제목 클립보드 복사

### 출력 파일
```
output/naver/
├── content.html   # 스타일링된 HTML (복사용)
├── content.txt    # 플레인 텍스트 (백업)
└── title.txt      # 제목
```

---

## ⚠️ 알려진 제한사항

| 항목 | 상태 | 이유 |
|------|------|------|
| API 자동 발행 | ❌ | 네이버 API 종료 (2020.05) |
| 이미지 자동 업로드 | ❌ | API 없음 |
| 브라우저 자동화 | ⚠️ | 한국어 입력 + iframe 복잡성 |

---

## 💡 팁

- **모바일 최적화**: 네이버 블로그 자체에서 자동 처리됨
- **SEO**: 제목에 키워드 포함, 본문 첫 문단에 핵심 내용
- **해시태그**: 글 마지막에 `#키워드` 형태로 추가
