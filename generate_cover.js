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
    await page.setViewport({ width: 1000, height: 420 });

    // Extract keywords (simplistic approach: remove stopwords, pick longest words)
    const stopwords = ['the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with', 'by', 'at', 'from'];
    const keywords = title.split(' ')
        .filter(w => !stopwords.includes(w.toLowerCase()))
        .filter(w => w.length > 3)
        .slice(0, 3) // Take top 3 potential keywords
        .join(' ');

    const gradients = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Deep Purple/Blue
        'linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)', // Mint/Blue
        'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)', // Silver/White (Subtle)
        'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)', // Bright Blue
        'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', // Misty
        'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)'  // Cloud
    ];

    // Pick a random gradient based on title length or simple math
    const gradientIndex = title.length % gradients.length;
    const bg = gradients[gradientIndex];
    const textColor = (gradientIndex === 2 || gradientIndex === 4 || gradientIndex === 5) ? '#333' : '#fff';

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
                background: ${bg};
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: ${textColor};
                text-align: center;
            }
            .container {
                padding: 40px;
                max-width: 800px;
            }
            h1 {
                font-size: 64px;
                font-weight: 800;
                margin: 0;
                line-height: 1.2;
                letter-spacing: -0.02em;
                text-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .brand {
                position: absolute;
                bottom: 30px;
                right: 40px;
                font-size: 20px;
                font-weight: 600;
                opacity: 0.8;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${keywords || title}</h1>
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
