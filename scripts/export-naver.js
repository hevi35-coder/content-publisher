#!/usr/bin/env node
/**
 * Naver Blog Export Script v3 (Persona Edition)
 * 
 * Generates Naver-compatible HTML from markdown drafts.
 * Uses Unicode/Text formatting to bypass editor tag stripping.
 * Implements "3 Persona" solutions:
 * - Engineer: &zwnj; for anti-linking
 * - UX Designer: Minimalist separators
 * - Growth Hacker: Localized KR App Store link
 * 
 * Usage: node scripts/export-naver.js <draft-path>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { notifier } = require('../lib/notifier');


/**
 * Pre-process markdown to convert inline elements before marked parsing
 */
function preprocessMarkdown(md) {
    // Convert ![alt](url) images to actual HTML img tags for visual preview/copy
    md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\n\n<img src="$2" alt="$1" style="max-width:100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 20px auto; display: block;">\n\n');

    // Convert **bold** to single quotes for emphasis (Unicode fallback)
    md = md.replace(/\*\*([^*]+)\*\*/g, "'$1'");

    // Convert [text](url) links to raw text: text (url)
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1');

    return md;
}

/**
 * Convert markdown to Naver-compatible HTML (Text Mode)
 * We use HTML tags (<p>) only for line breaks, but content is styled with text symbols.
 */
function toNaverHtml(markdown) {
    let html = preprocessMarkdown(markdown);

    ['MandaAct', 'macOS', 'iOS', 'iPadOS'].forEach(kw => {
        // Insert Zero Width Space (\u200B) after first character to break auto-linking
        const replacement = kw[0] + '\u200B' + kw.substring(1);
        const regex = new RegExp(kw, 'g');
        html = html.replace(regex, replacement);
    });

    // Convert headers to Unicode styled text
    html = html.replace(/^### (.+)$/gm, '<p>■ $1</p>');
    html = html.replace(/^## (.+)$/gm, '<p>\n━━━━━━━━━━━━━━━\n<strong>$1</strong>\n━━━━━━━━━━━━━━━</p>');
    html = html.replace(/^# (.+)$/gm, ''); // Skip h1

    // Convert horizontal rules (UX Improvement: Minimalist Dots)
    html = html.replace(/^---$/gm, '<p align="center">· · ·</p>');

    // Convert bullet lists
    html = html.replace(/^(\*|-)\s+(.+)$/gm, '<p>• $2</p>');

    // Split by lines and wrap paragraphs
    const lines = html.split('\n');
    const processed = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('<')) {
            processed.push(line);
        } else {
            // Check for App Store Link in Draft and Replace with Functional KR Link
            if (line.includes('apps.apple.com')) {
                // Replace any App Store link with the correct KR link
                line = 'App Store: https://apps.apple.com/kr/app/id6756198473';
            }
            processed.push(`<p>${line}</p>`);
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

/**
 * Main export function
 */
async function exportForNaver(draftPath) {
    console.log('\n============================================');
    console.log('📋 네이버 블로그 발행 준비 (Persona v3)');
    console.log('============================================\n');

    // Read draft
    const content = fs.readFileSync(draftPath, 'utf8');
    const { data: frontmatter, content: markdown } = matter(content);

    // Translate to Korean if needed
    let koTitle = frontmatter.title;
    let koContent = markdown;

    // Check if Korean content exists
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
    const { pushToMain } = require('../lib/git-manager');
    const config = require('../config'); // Need config for rawBaseUrl
    const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/-+/g, '-').substring(0, 50);
    const coverFileName = `${slugify(koTitle)}-cover-ko.png`;
    const coverPath = path.join(__dirname, '../assets/images/covers', coverFileName);

    let coverImageUrl = '';
    try {
        await generateCover(koTitle, coverPath, { lang: 'ko' });
        console.log(`🎨 커버 이미지 생성: ${coverFileName}`);

        // Sync cover to GitHub immediately so the URL works
        pushToMain('assets/images/covers/', `add cover: ${coverFileName}`);

        // Construct Raw URL
        // config.github.rawBaseUrl usually looks like https://raw.githubusercontent.com/USER/REPO/main
        // If config requires loading, ensure it's loaded. 
        // Assuming config is available (imported above).
        coverImageUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'hevi35-coder/content-publisher'}/main/assets/images/covers/${coverFileName}`;

    } catch (e) {
        console.log('⚠️ 커버 생성 실패:', e.message);
    }

    // Extract images before conversion
    const images = extractImages(koContent);

    // Convert to Naver HTML (Text Mode)
    let html = toNaverHtml(koContent);

    // Prepend Cover Image if available
    if (coverImageUrl) {
        const coverHtml = `<img src="${coverImageUrl}" alt="Cover Image" style="max-width:100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin: 0 auto 30px auto; display: block;">\n<br>\n`;
        html = coverHtml + html;
        images.unshift({ alt: 'Cover Image', path: coverImageUrl });
    }

    // Create output directory
    const outputDir = path.join(__dirname, '../output/naver');
    fs.mkdirSync(outputDir, { recursive: true });

    // Save HTML with minimal styling
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
        p { margin: 15px 0; }
        strong { font-weight: bold; }
        
        /* Web Copy Button Styles */
        #copy-control {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            text-align: center;
        }
        #copy-btn {
            background: #03c75a;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 30px;
            font-size: 16px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: transform 0.2s;
        }
        #copy-btn:active { transform: scale(0.95); }
        #toast {
            visibility: hidden;
            min-width: 250px;
            background-color: #333;
            color: #fff;
            text-align: center;
            border-radius: 2px;
            padding: 16px;
            position: fixed;
            z-index: 1000;
            left: 50%;
            bottom: 80px;
            transform: translateX(-50%);
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        #toast.show { visibility: visible; opacity: 1; }
    </style>
</head>
<body>

<div id="copy-control">
    <button id="copy-btn" onclick="copyContent()">📋 블로그용 복사</button>
</div>
<div id="toast">복사완료! 블로그 앱에 붙여넣으세요.</div>

<div id="naver-content">
${html}
</div>

<script>
    async function copyContent() {
        const content = document.getElementById('naver-content');
        const btn = document.getElementById('copy-btn');
        const originalText = btn.innerText;

        try {
            if (navigator.clipboard && navigator.clipboard.write) {
                // Focus on Plain Text for Naver compatibility
                const htmlBlob = new Blob([content.innerHTML], { type: 'text/html' });
                const textBlob = new Blob([content.innerText], { type: 'text/plain' });
                
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': htmlBlob,
                        'text/plain': textBlob
                    })
                ]);
            } else {
                 const range = document.createRange();
                 range.selectNode(content);
                 window.getSelection().removeAllRanges();
                 window.getSelection().addRange(range);
                 document.execCommand('copy');
                 window.getSelection().removeAllRanges();
            }

            const toast = document.getElementById("toast");
            toast.className = "show";
            setTimeout(() => toast.className = toast.className.replace("show", ""), 3000);
            
            btn.innerText = "✅ 텍스트 복사됨!";
            setTimeout(() => btn.innerText = originalText, 2000);

        } catch (err) {
            console.error('Copy failed:', err);
            btn.innerText = "❌ 복사 실패";
            alert('클립보드 권한이 필요하거나 브라우저가 지원하지 않습니다.');
            setTimeout(() => btn.innerText = originalText, 2000);
        }
    }
</script>

</body>
</html>`;

    const htmlPath = path.join(outputDir, 'content.html');
    fs.writeFileSync(htmlPath, fullHtml);

    // Create timestamped backup
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '').substring(0, 6); // HHMMSS
    const safeTitle = koTitle.replace(/[^a-z0-9가-힣]+/g, '-').substring(0, 30);
    const versionedFilename = `content-${dateStr}-${timeStr}-${safeTitle}.html`;
    const versionedPath = path.join(outputDir, versionedFilename);
    fs.writeFileSync(versionedPath, fullHtml);
    console.log(`📦 백업 생성: ${versionedFilename}`);

    // Save plain text version
    const plainText = koContent
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\n[이미지: $1]\n')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/^#+\s/gm, '')
        .replace(/---/g, '· · ·');

    const textPath = path.join(outputDir, 'content.txt');
    fs.writeFileSync(textPath, `${koTitle}\n\n${plainText}`);

    // Save title
    const titlePath = path.join(outputDir, 'title.txt');
    fs.writeFileSync(titlePath, koTitle);

    // Copy title to clipboard
    try {
        const { execSync } = require('child_process');
        execSync(`echo "${koTitle}" | pbcopy`);
        console.log('📋 제목이 클립보드에 복사되었습니다\n');
    } catch (e) { }

    // Output summary
    console.log(`📝 제목: ${koTitle}`);
    console.log(`📷 이미지: ${images.length}개`);
    console.log(`\n📄 HTML: ${htmlPath}`);
    console.log(`📄 텍스트: ${textPath}`);
    console.log('\n✅ 네이버 복사 최적화 완료 (Persona v3)');

    // Links
    const webPreviewUrl = `https://raw.githack.com/hevi35-coder/content-publisher/main/output/naver/${versionedFilename}`;
    console.log('🔄 Syncing output/naver to GitHub...');
    pushToMain('output/naver/', `backup: naver export ${versionedFilename}`);

    // Prepare attachments
    const attachments = [];
    if (fs.existsSync(coverPath)) {
        attachments.push({
            filename: coverFileName,
            path: coverPath
        });
        console.log(`📎 이메일 첨부 추가: ${coverFileName}`);
    }

    await notifier.stepComplete('naver_export', {
        title: koTitle,
        images: images.length,
        htmlPath: htmlPath,
        backupPath: versionedPath,
        webPreviewUrl: webPreviewUrl
    }, attachments);

    return { title: koTitle, html, images };
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        process.exit(1);
    }
    exportForNaver(args[0])
        .then(() => console.log('✅ 네이버 발행 준비 완료!'))
        .catch(async e => {
            console.error('❌ 오류:', e.message);
            await notifier.stepFailed('naver_export', e);
            process.exit(1);
        });
}

module.exports = { exportForNaver, toNaverHtml };
