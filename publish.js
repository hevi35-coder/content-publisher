
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const matter = require('gray-matter');
require('dotenv').config();

const API_KEY = process.env.DEVTO_API_KEY;
const DRAFT_PATH = path.join(__dirname, 'drafts', '2026-02-07-mandaact-1-1-0-update.md');

if (!API_KEY) {
    console.error("❌ Error: DEVTO_API_KEY is missing in .env");
    process.exit(1);
}

async function publishArticle() {
    try {
        const fileContent = fs.readFileSync(DRAFT_PATH, 'utf8');
        const { data, content } = matter(fileContent);

        // Upload images if needed (Skip for now, assuming manual image hosting or existing URLs)
        // For a real production script, we'd upload local images to a host (e.g. Cloudinary/GitHub) 
        // and replace links. For this manual run, we assume the user will handle image hosting 
        // or we use the relative paths if Dev.to supports them (it doesn't support local relative).

        // IMPORTANT: Dev.to API requires a 'article' object
        const article = {
            title: data.title,
            body_markdown: fileContent, // Send the whole thing including frontmatter? No, Dev.to parser handles it usually, but API expects body_markdown.
            published: true, // User said "Deploy", so we set to true? Or draft? Let's safeguard as true if user said "Deploy".
            series: data.series,
            tags: data.tags,
            main_image: data.cover_image
        };

        console.log(`🚀 Publishing: ${article.title}...`);

        const response = await axios.post('https://dev.to/api/articles', { article }, {
            headers: {
                'api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ Success! Article published.");
        console.log(`🔗 Link: ${response.data.url}`);

    } catch (error) {
        console.error("❌ Publishing failed:", error.response ? error.response.data : error.message);
    }
}

publishArticle();
