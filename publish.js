
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const matter = require('gray-matter');
const puppeteer = require('puppeteer');
require('dotenv').config();

const API_KEY = process.env.DEVTO_API_KEY;
const DRAFT_PATH = path.join(__dirname, 'drafts', '2026-02-07-mandaact-1-1-0-update.md');

if (!API_KEY) {
    console.error("❌ Error: DEVTO_API_KEY is missing in .env");
    process.exit(1);
}

// Check for CLI arguments
const args = process.argv.slice(2);
if (args.length > 0 && args[0].startsWith('http')) {
    console.log(`🔍 Manual Verification Mode: ${args[0]}`);

    (async () => {
        // 1. Static Content Check
        try {
            const res = await axios.get(args[0], { headers: { 'User-Agent': 'Mozilla/5.0' } });
            await verifyImagesFromContent(res.data);
        } catch (err) {
            console.error("❌ Failed to fetch URL static content:", err.message);
        }

        // 2. Browser Check
        await verifyWithBrowser(args[0]);
    })();
    return;
}

async function publishArticle() {
    try {
        const fileContent = fs.readFileSync(DRAFT_PATH, 'utf8');
        const { data, content } = matter(fileContent);

        let contentBody = fileContent;

        // 1. Replace Local Asset Links with Remote GitHub Links
        const GITHUB_USERNAME = 'hevi35-coder';
        const REPO_NAME = 'devto-publisher';
        const BRANCH = 'main';
        const BASE_ASSET_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${BRANCH}/assets/`;

        // Replace relative paths like "../assets/"
        contentBody = contentBody.replace(/\.\.\/assets\//g, BASE_ASSET_URL);

        // Update frontmatter cover_image if it's local
        let mainImage = data.cover_image;
        if (mainImage && mainImage.startsWith('../assets')) {
            mainImage = mainImage.replace('../assets/', BASE_ASSET_URL);
        }

        // IMPORTANT: Dev.to API requires a 'article' object
        const article = {
            title: data.title,
            body_markdown: contentBody,
            published: true, // If we are updating a draft, this keeps it as draft if originally false? No, this publishes it? 
            // Wait, user said "Draft is published". 
            // If data.published is false in frontmatter, it might stay draft.
            series: data.series,
            tags: data.tags,
            main_image: mainImage
        };

        console.log(`🚀 Publishing: ${article.title}...`);

        // 2. Check if article already exists to avoid 422 "Title already used"
        let articleId = null;
        try {
            // Need to fetch user's articles to find if title exists
            const meArticles = await axios.get('https://dev.to/api/articles/me/all', {
                headers: { 'api-key': API_KEY }
            });
            // Normalize title for comparison
            const existing = meArticles.data.find(a => a.title.trim() === article.title.trim());
            if (existing) {
                articleId = existing.id;
                console.log(`ℹ️  Found existing article ID: ${articleId} (${existing.url}). Updating...`);
            }
        } catch (err) {
            console.warn("⚠️  Failed to fetch existing articles list. Defaulting to Create mode.", err.message);
        }

        let response;
        if (articleId) {
            // Update existing
            response = await axios.put(`https://dev.to/api/articles/${articleId}`, { article }, {
                headers: {
                    'api-key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            console.log("✅ Success! Article updated.");

        } else {
            // Create new
            response = await axios.post('https://dev.to/api/articles', { article }, {
                headers: {
                    'api-key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            console.log("✅ Success! Article published (created).");
        }

        console.log(`🔗 Link: ${response.data.url}`);

        // 3. Verify Images (Static Content)
        console.log("🔍 Verifying images from content...");
        await verifyImagesFromContent(contentBody);

        // 4. Verify with Browser (Live Rendering)
        console.log("🌐 Verifying with Puppeteer (Browser)...");
        await verifyWithBrowser(response.data.url);

    } catch (error) {
        if (error.response) {
            console.error(`❌ Publishing failed (${error.response.status}):`, error.response.data);
        } else {
            console.error("❌ Publishing failed:", error.message);
        }
    }
}

async function verifyImagesFromContent(htmlOrMarkdown) {
    try {
        const imgRegex = /(https:\/\/raw\.githubusercontent\.com\/[^)\"\s]+)/g;
        let match;
        const imageUrls = new Set();

        while ((match = imgRegex.exec(htmlOrMarkdown)) !== null) {
            imageUrls.add(match[1]);
        }

        if (imageUrls.size === 0) {
            console.log("⚠️ No GitHub raw images found in the content (static check).");
            return;
        }

        console.log(`Found ${imageUrls.size} unique images (static check). checking availability...`);

        let allValid = true;
        for (const url of imageUrls) {
            try {
                const res = await axios.head(url);
                if (res.status === 200) {
                    console.log(`✅ OK: ...${url.slice(-30)}`);
                } else {
                    console.error(`❌ BROKEN (${res.status}): ${url}`);
                    allValid = false;
                }
            } catch (err) {
                console.error(`❌ BROKEN: ${url} - ${err.message}`);
                allValid = false;
            }
        }

        if (allValid) {
            console.log("🎉 All images are verified accessible (static check)!");
        } else {
            console.error("⚠️ Some images are broken. Please check the 'assets' folder in GitHub.");
        }

    } catch (error) {
        console.error("❌ Verification failed:", error.message);
    }
}

async function verifyWithBrowser(articleUrl) {
    console.log(`🌐 Launching browser to verify: ${articleUrl}`);
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    try {
        // Capture console errors
        page.on('console', msg => {
            if (msg.type() === 'error') console.error(`Browser Console Error: ${msg.text()}`);
        });

        // Navigate to the page
        const response = await page.goto(articleUrl, { waitUntil: 'networkidle0' });

        // Even if 404, we want to see if we can check anything? 
        // No, if 404, we can't check images on page.
        if (!response.ok()) {
            console.error(`❌ Page Load Failed: ${response.status()} ${response.statusText()}`);
            await browser.close();
            return;
        }

        console.log("✅ Page loaded successfully.");

        // Check for broken images using browser JS execution
        const imageEvaluation = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            const brokenImages = images.filter(img => {
                return !img.complete || img.naturalWidth === 0;
            }).map(img => img.src);

            return {
                total: images.length,
                broken: brokenImages
            };
        });

        console.log(`🖼️  Found ${imageEvaluation.total} images on page.`);

        if (imageEvaluation.broken.length > 0) {
            console.error("❌ Broken Images Detected in Browser:");
            imageEvaluation.broken.forEach(src => console.error(`   - ${src}`));
        } else {
            console.log("🎉 All images rendered correctly in browser!");
        }

    } catch (error) {
        console.error("❌ Browser Verification Failed:", error.message);
    } finally {
        await browser.close();
    }
}

if (require.main === module && args.length === 0) {
    publishArticle();
}
