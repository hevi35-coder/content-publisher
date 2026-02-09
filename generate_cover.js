/**
 * Cover Image Generator
 * 
 * Generates cover images with gradient text for blog posts.
 * Supports localization (English/Korean) for different platforms.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Generate cover image with title
 * @param {string} title - Title text
 * @param {string} outputPath - Output file path
 * @param {Object} options - Generation options
 * @param {string} options.lang - Language: 'en' or 'ko'
 */
async function generateCover(title, outputPath, options = {}) {
    const lang = options.lang || 'en';

    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: "new"
    });
    const page = await browser.newPage();

    await page.setViewport({ width: 1000, height: 420 });

    // Adjust font for Korean text (slightly smaller, different font stack)
    const fontSize = lang === 'ko' ? '58px' : '72px';
    const fontFamily = lang === 'ko'
        ? '"Pretendard", "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif'
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
        <style>
            body {
                margin: 0;
                padding: 0;
                width: 1000px;
                height: 420px;
                display: flex;
                justify-content: center;
                align-items: center;
                background: #FFFFFF;
                font-family: ${fontFamily};
                text-align: center;
            }
            .container {
                padding: 60px;
                max-width: 850px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100%;
            }
            h1 {
                font-size: ${fontSize};
                font-weight: 900;
                margin: 0;
                line-height: 1.2;
                letter-spacing: -0.02em;
                background: linear-gradient(90deg, #00C6FF 0%, #9D50BB 50%, #FF6B6B 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                padding-bottom: 10px;
            }
            .brand {
                position: absolute;
                bottom: 30px;
                right: 40px;
                font-size: 24px;
                font-weight: 700;
                color: #e0e0e0;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${title}</h1>
        </div>
        <div class="brand">MandaAct</div>
    </body>
    </html>
    `;

    await page.setContent(htmlContent);
    // Wait for font to load
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath });
    await browser.close();

    const langLabel = lang === 'ko' ? 'KO' : 'EN';
    console.log(`[Cover] ${langLabel} cover generated: ${outputPath}`);

    return outputPath;
}

// CLI support
if (require.main === module) {
    const args = process.argv.slice(2);
    const title = args[0] || "Test Title For Cover";
    const out = args[1] || "test-cover.png";
    const lang = args[2] || "en";
    generateCover(title, out, { lang });
}

module.exports = { generateCover };
