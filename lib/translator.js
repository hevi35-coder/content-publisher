/**
 * Translator - GPT-based translation layer for Korean market
 * 
 * Handles localization and HTML conversion for Korean blog platforms.
 */
const client = require('./ai-client');
const { marked } = require('marked');
const matter = require('gray-matter');

/**
 * Translate and localize content from English to Korean
 * @param {string} content - English markdown content (without frontmatter)
 * @param {string} title - Article title
 * @returns {Promise<{title: string, content: string}>}
 */
async function translateToKorean(content, title) {
    const systemPrompt = `당신은 한국 IT 블로그 전문 에디터입니다.

영어 기술 블로그 글을 한국 독자를 위해 현지화하세요:

## 번역 규칙
1. 직역하지 말고, 한국 개발자가 쓴 것처럼 자연스럽게 의역
2. "~습니다" 체 사용 (블로그 톤)
3. 영어 기술 용어는 그대로 유지 (React, API, goal 등)
4. MandaAct, Mandalart 브랜드명 유지

## 금지 사항 (중요!)
1. 이모지 사용 금지 (🚀, 🎯, 👉 등 모든 이모지 사용하지 마세요)
2. **굵은 글씨** 마크다운 사용 금지 (강조 없이 자연스럽게)  
3. 과장된 표현 금지 ("정말 놀라운", "엄청난", "혁신적인" 등)
4. 과도한 느낌표 사용 금지 (문장당 최대 1개)

## 포맷 규칙
1. Markdown 헤더(##, ###)는 유지
2. 코드 블록 유지
3. 이미지 링크 유지
4. 줄바꿈과 문단 구조 유지

## 출력 형식
제목: [번역된 제목]

[번역된 본문]`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `영어 제목: ${title}\n\n영어 본문:\n${content}` }
        ],
        temperature: 0.4
    });

    const translatedText = response.choices[0].message.content;

    // Extract title from "제목: xxx" format
    const titleMatch = translatedText.match(/^제목:\s*(.+)$/m);
    const translatedTitle = titleMatch ? titleMatch[1].trim() : title;

    // Remove title line from content
    let translatedContent = translatedText
        .replace(/^제목:\s*.+\n+/m, '')
        .trim();

    console.log('✅ Translation completed (EN → KO)');
    console.log(`   Title: ${translatedTitle}`);

    return {
        title: translatedTitle,
        content: translatedContent
    };
}

/**
 * Parse markdown file and separate frontmatter from content
 */
function parseMarkdownContent(rawContent) {
    const { data, content } = matter(rawContent);
    return {
        frontmatter: data,
        content: content.trim()
    };
}

/**
 * Convert markdown to clean HTML using marked
 */
function markdownToHtml(markdown) {
    // Configure marked for clean output
    marked.setOptions({
        gfm: true,
        breaks: true
    });

    return marked.parse(markdown);
}

/**
 * Adapt content for a specific platform
 */
async function adaptForPlatform(article, platform, options = {}) {
    let adapted = { ...article };

    // No need to parse frontmatter - parseDraft() already removed it ✅

    switch (platform) {
        case 'blogger':
            // Translate to Korean for Korean market
            if (options.translate !== false) {
                const translated = await translateToKorean(adapted.content, adapted.title);
                adapted.title = translated.title;
                adapted.content = translated.content;
            }

            // Generate Korean cover image
            const { generateCover } = require('../generate_cover');
            const path = require('path');
            const config = require('../config');
            const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/-+/g, '-').substring(0, 50);
            const coverFileName = `${slugify(adapted.title)}-cover-ko.png`;
            const coverPath = path.join(__dirname, '../assets/images/covers', coverFileName);
            await generateCover(adapted.title, coverPath, { lang: 'ko' });

            // Auto-push cover to main branch
            const { pushCoversToMain } = require('./git-manager');
            pushCoversToMain(`Add Korean cover: ${coverFileName}`);

            // Build cover URL (GitHub raw)
            const coverUrl = `${config.github.assetBaseUrl}images/covers/${coverFileName}`;

            // Convert markdown to HTML using marked
            adapted.content = markdownToHtml(adapted.content);

            // Sanitize: remove any remaining AI patterns
            const { sanitize, sanitizeHtml } = require('./sanitizer');
            adapted.content = sanitizeHtml(adapted.content);

            // Quality gate: validate content
            const { validateContent } = require('./quality-gate');
            const validation = validateContent(adapted.content, adapted.title);
            if (!validation.passed) {
                console.warn(`[QualityGate] Issues found: ${validation.issues.join(', ')}`);
            }

            // Prepend cover image to content
            adapted.content = `<img src="${coverUrl}" alt="${adapted.title}" style="width:100%;max-width:1000px;margin-bottom:20px;">\n\n${adapted.content}`;

            console.log(`[Cover] Korean cover generated: ${coverFileName}`);
            break;

        case 'hashnode':
            // Keep English, adjust tags format
            adapted.tags = article.tags?.slice(0, 5);
            break;

        case 'devto':
            // Keep English, ensure tags are lowercase
            adapted.tags = article.tags?.map(t => t.toLowerCase().replace(/\s+/g, ''));
            break;

        default:
            break;
    }

    return adapted;
}

module.exports = { translateToKorean, adaptForPlatform, parseMarkdownContent, markdownToHtml };
