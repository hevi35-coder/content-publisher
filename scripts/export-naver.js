#!/usr/bin/env node
/**
 * Naver Blog Export Script v2
 * 
 * Generates Naver-compatible HTML from markdown drafts.
 * Fixes: bold, links, line breaks, images
 * 
 * Usage: node scripts/export-naver.js <draft-path>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { spawnSync } = require('child_process');
const { notifier } = require('../lib/notifier');


/**
 * Pre-process markdown to convert inline elements before marked parsing
 */
function preprocessMarkdown(md) {
    // IMPORTANT: Image conversion must come BEFORE link conversion!
    // Convert ![alt](url) images to styled placeholder
    md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\n\n<div style="background:#f8f9fa;border:2px dashed #03c75a;border-radius:8px;padding:20px;margin:20px 0;text-align:center;color:#666;">📷 이미지: $1</div>\n\n');

    // Convert **bold** to <b>bold</b> (네이버 호환)
    md = md.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

    // Convert [text](url) links to <a> tags with inline styles
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#03c75a;text-decoration:underline;">$1</a>');

    return md;
}

/**
 * Convert markdown to Naver-compatible HTML
 */
function toNaverHtml(markdown) {
    let html = preprocessMarkdown(markdown);

    // Convert headers with inline styles
    html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:18px;font-weight:bold;color:#333;margin:25px 0 10px;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:22px;font-weight:bold;color:#222;margin:30px 0 15px;padding-bottom:10px;border-bottom:2px solid #03c75a;">$1</h2>');
    html = html.replace(/^# (.+)$/gm, ''); // Skip h1

    // Convert horizontal rules
    html = html.replace(/^---$/gm, '<hr style="margin:30px 0;border:none;border-top:1px solid #e0e0e0;">');

    // Convert bullet lists to styled items
    html = html.replace(/^(\*|-)\s+(.+)$/gm, '<p style="margin:8px 0;padding-left:20px;">• $2</p>');

    // Split by lines and wrap paragraphs
    const lines = html.split('\n');
    const processed = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) {
            processed.push('');
            continue;
        }
        // Skip if already has HTML tags at start
        if (line.startsWith('<') || line.startsWith('•')) {
            processed.push(line);
        } else if (line.startsWith('*(')) {
            // Caption - smaller italic text
            processed.push(`<p style="color:#666;font-size:14px;font-style:italic;margin:5px 0;">${line}</p>`);
        } else {
            processed.push(`<p style="margin:15px 0;line-height:1.8;">${line}</p>`);
        }
    }

    return processed.join('\n');
}

/**
 * Extract image references from markdown
 */
function extractImages(markdown) {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
        images.push({
            alt: match[1],
            path: match[2]
        });
    }
    return images;
}

function copyToClipboard(text, options = {}) {
    const platform = options.platform || process.platform;
    const run = options.run || spawnSync;

    if (platform !== 'darwin') {
        return false;
    }

    try {
        const result = run('pbcopy', {
            input: String(text || ''),
            encoding: 'utf8'
        });
        if (result.error) {
            return false;
        }
        return result.status === 0;
    } catch {
        return false;
    }
}

/**
 * Main export function
 */
async function exportForNaver(draftPath) {
    console.log('\n============================================');
    console.log('📋 네이버 블로그 발행 준비');
    console.log('============================================\n');

    // Read draft
    const content = fs.readFileSync(draftPath, 'utf8');
    const { data: frontmatter, content: markdown } = matter(content);

    // Translate to Korean if needed
    let koTitle = frontmatter.title;
    let koContent = markdown;

    // Check if Korean content exists (from Blogger publish)
    const slug = path.basename(draftPath, '.md');
    const koCachePath = path.join(__dirname, '../.cache/ko', `${slug}.json`);

    if (fs.existsSync(koCachePath)) {
        const cached = JSON.parse(fs.readFileSync(koCachePath, 'utf8'));
        koTitle = cached.title;
        koContent = cached.content;
        console.log('✅ 한국어 번역 캐시 사용');
    } else {
        try {
            const { translateToKorean } = require('../lib/translator');
            const translated = await translateToKorean(markdown, frontmatter.title);
            koTitle = translated.title;
            koContent = translated.content;

            fs.mkdirSync(path.dirname(koCachePath), { recursive: true });
            fs.writeFileSync(koCachePath, JSON.stringify({ title: koTitle, content: koContent }));
            console.log('✅ 한국어 번역 완료');
        } catch (e) {
            console.log('⚠️ 번역 실패, 원본 사용:', e.message);
        }
    }

    // Generate Korean cover image
    const { generateCover } = require('../generate_cover');
    const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/-+/g, '-').substring(0, 50);
    const coverFileName = `${slugify(koTitle)}-cover-ko.png`;
    const coverPath = path.join(__dirname, '../assets/images/covers', coverFileName);

    try {
        await generateCover(koTitle, coverPath, { lang: 'ko' });
        console.log(`🎨 커버 이미지 생성: ${coverFileName}`);
    } catch (e) {
        console.log('⚠️ 커버 생성 실패:', e.message);
    }

    // Extract images before conversion
    const images = extractImages(koContent);

    // Convert to Naver HTML
    const html = toNaverHtml(koContent);

    // Create output directory
    const outputDir = path.join(__dirname, '../output/naver');
    fs.mkdirSync(outputDir, { recursive: true });

    // Save HTML with rich styling that survives copy-paste
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${koTitle}</title>
    <style>
        body { 
            font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            font-size: 16px;
            line-height: 2;
            color: #333;
            max-width: 700px;
            margin: 0 auto;
            padding: 30px;
            background: #fff;
        }
        h2 { 
            font-size: 22px; 
            font-weight: bold; 
            color: #222;
            margin: 30px 0 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #03c75a;
        }
        h3 { 
            font-size: 18px; 
            font-weight: bold; 
            color: #333;
            margin: 25px 0 10px;
        }
        p { 
            margin: 15px 0; 
            text-align: justify;
        }
        a { 
            color: #03c75a; 
            text-decoration: underline;
            font-weight: 500;
        }
        ul, ol {
            margin: 15px 0;
            padding-left: 25px;
        }
        li {
            margin: 8px 0;
        }
        hr { 
            margin: 30px 0; 
            border: none; 
            border-top: 1px solid #e0e0e0; 
        }
        .image-placeholder {
            background: #f8f9fa;
            border: 2px dashed #03c75a;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
            color: #666;
        }
        .image-placeholder .icon { font-size: 24px; }
        .cta-box {
            background: linear-gradient(135deg, #03c75a 0%, #00a84d 100%);
            color: white;
            padding: 20px 25px;
            border-radius: 12px;
            margin: 25px 0;
        }
        .cta-box a { color: white; font-weight: bold; }
        .tag { 
            display: inline-block;
            background: #e8f5e9;
            color: #2e7d32;
            padding: 5px 12px;
            border-radius: 15px;
            margin: 3px;
            font-size: 14px;
        }
    </style>
</head>
<body>
${html}
</body>
</html>`;

    const htmlPath = path.join(outputDir, 'content.html');
    fs.writeFileSync(htmlPath, fullHtml);

    // Create timestamped backup (Versioning)
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = koTitle.replace(/[^a-z0-9가-힣]+/g, '-').substring(0, 30);
    const versionedFilename = `content-${dateStr}-${safeTitle}.html`;
    const versionedPath = path.join(outputDir, versionedFilename);
    fs.writeFileSync(versionedPath, fullHtml);
    console.log(`📦 백업 생성: ${versionedFilename}`);

    // Save plain text version for easy copy
    const plainText = koContent
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold markers
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\n[이미지: $1]\n')  // Image placeholders
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')  // Links as text
        .replace(/^#+\s/gm, '')  // Remove header markers
        .replace(/---/g, '────────────');  // HR

    const textPath = path.join(outputDir, 'content.txt');
    fs.writeFileSync(textPath, `${koTitle}\n\n${plainText}`);

    // Save title
    const titlePath = path.join(outputDir, 'title.txt');
    fs.writeFileSync(titlePath, koTitle);

    // Copy title to clipboard (macOS)
    if (copyToClipboard(koTitle)) {
        console.log('📋 제목이 클립보드에 복사되었습니다\n');
    }

    // Output summary
    console.log(`📝 제목: ${koTitle}`);
    console.log(`📷 이미지: ${images.length}개`);
    if (images.length > 0) {
        console.log('\n🖼️ 이미지 목록 (수동 업로드 필요):');
        images.forEach((img, i) => {
            console.log(`   ${i + 1}. ${img.alt || '이미지'}: ${img.path}`);
        });
    }
    console.log(`\n📄 HTML: ${htmlPath}`);
    console.log(`📄 텍스트: ${textPath}`);

    console.log('\n============================================');
    console.log('📋 발행 단계');
    console.log('============================================');
    console.log('1. blog.naver.com → 글쓰기');
    console.log('2. 제목 붙여넣기 (Cmd+V, 클립보드에 복사됨)');
    console.log('3. 다음 중 하나 선택:');
    console.log('   [HTML] content.html 열기 → 전체 선택 → 복사 → 붙여넣기');
    console.log('   [텍스트] content.txt 열기 → 전체 선택 → 복사 → 붙여넣기');
    console.log('4. 이미지 직접 업로드 (드래그 또는 사진 버튼)');
    console.log('5. 설정: 이미지 크기 → 원본');
    console.log('6. 발행');
    console.log('\n⚠️ 참고: 네이버 API가 없어 이미지는 수동 업로드 필요');
    console.log('💡 팁: 모바일 대응은 네이버 블로그 자체에서 자동 처리됨');
    console.log('============================================\n');

    // Prepare attachments
    const attachments = [
        {
            filename: versionedFilename,
            path: versionedPath
        },
        {
            filename: 'content.txt',
            path: textPath
        }
    ];

    // Add cover image if exists
    if (fs.existsSync(coverPath)) {
        attachments.push({
            filename: coverFileName,
            path: coverPath
        });
    }

    // Send notification with attachments
    await notifier.stepComplete('naver_export', {
        title: koTitle,
        images: images.length,
        htmlPath: htmlPath,
        backupPath: versionedPath,
        previewHtml: html // ✅ Embed content for mobile copy-paste
    }, attachments);

    return { title: koTitle, html, images };
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node scripts/export-naver.js <draft-path>');
        console.log('Example: node scripts/export-naver.js drafts/my-article.md');
        process.exit(1);
    }

    exportForNaver(args[0])
        .then(() => console.log('✅ 네이버 발행 준비 완료!'))
        .catch(async e => {
            console.error('❌ 오류:', e.message);
            // Send failure notification
            await notifier.stepFailed('naver_export', e);
            process.exit(1);
        });
}

module.exports = { exportForNaver, toNaverHtml, copyToClipboard };
