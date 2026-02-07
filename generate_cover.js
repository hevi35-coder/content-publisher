const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generateCover(title, outputPath) {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: "new"
    });
    const page = await browser.newPage();

    // Set viewport to Dev.to recommended aspect ratio (1000x420 is common for social, let's go with 1000x500 for a nice banner)
    // Set viewport to Dev.to recommended aspect ratio
    await page.setViewport({ width: 1000, height: 420 });

    // Use full title but ensure it doesn't overflow visually
    // We can let CSS handle wrapping, but maybe limit length if needed. 
    // validTitle for display
    const validTitle = title;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
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
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
                font-size: 72px;
                font-weight: 900;
                margin: 0;
                line-height: 1.1;
                letter-spacing: -0.02em;
                background: linear-gradient(90deg, #00C6FF 0%, #9D50BB 50%, #FF6B6B 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                padding-bottom: 10px; /* Prevent descender clipping */
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
            <h1>${validTitle}</h1>
        </div>
        <div class="brand">MandaAct</div>
    </body>
    </html>
    `;

    await page.setContent(htmlContent);
    await page.screenshot({ path: outputPath });
    await browser.close();
    console.log(`🖼️  Cover image generated: ${outputPath}`);
}

// Allow running directly: node generate_cover.js "My Awesome Title"
if (require.main === module) {
    const args = process.argv.slice(2);
    const title = args[0] || "Test Title For Cover";
    const out = args[1] || "test-cover.png";
    generateCover(title, out);
}

module.exports = { generateCover };
