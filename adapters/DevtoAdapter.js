/**
 * DevtoAdapter - Dev.to platform adapter
 * 
 * Handles publishing to Dev.to using their REST API.
 * Extracted from the original publish.js logic.
 */
const axios = require('axios');
const fs = require('fs');
const puppeteer = require('puppeteer');
const BaseAdapter = require('./BaseAdapter');
const { resolveDevtoPublished, shouldForcePublish } = require('../lib/publish-visibility');

class DevtoAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.name = 'devto';
        this.apiKey = process.env.DEVTO_API_KEY;
        this.baseUrl = 'https://dev.to/api';
    }

    async authenticate() {
        if (!this.apiKey) {
            throw new Error('DEVTO_API_KEY is missing in .env');
        }
        return true;
    }

    async checkExists(title) {
        const failOpen = process.env.CHECK_EXISTS_FAIL_OPEN === 'true';
        try {
            const response = await axios.get(`${this.baseUrl}/articles/me/all`, {
                headers: { 'api-key': this.apiKey }
            });
            return response.data.find(a => a.title.trim() === title.trim()) || null;
        } catch (err) {
            if (failOpen) {
                console.warn('⚠️ [Dev.to] checkExists failed; fail-open enabled. Proceeding as new publish.', err.message);
                return null;
            }
            throw new Error(`[Dev.to] checkExists failed: ${err.message}`);
        }
    }

    async publish(article) {
        if (process.env.DRY_RUN === 'true') {
            console.log('🚧 [Dev.to] DRY_RUN: Simulation mode. Skipping actual publish.');
            console.log(`   Title: ${article.title}`);
            console.log(`   Tags: ${article.tags}`);
            return {
                id: 'dry-run-id-' + Date.now(),
                url: 'https://dev.to/dry-run-simulation',
                platform: this.name
            };
        }

        await this.authenticate();

        if (article?.rawFrontmatter?.published === false && shouldForcePublish()) {
            console.log('ℹ️ [Dev.to] Frontmatter is draft but FORCE_PUBLISH is active -> publishing publicly.');
        }

        const payload = {
            article: {
                title: article.title,
                body_markdown: article.content,
                published: resolveDevtoPublished(article.rawFrontmatter),
                tags: article.tags,
                main_image: article.coverImage ? `${article.coverImage}?v=${Date.now()}` : undefined,
                series: article.series
            }
        };

        const response = await axios.post(`${this.baseUrl}/articles`, payload, {
            headers: {
                'api-key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ [Dev.to] Article published!');
        return {
            id: response.data.id,
            url: response.data.url,
            platform: this.name
        };
    }

    async update(articleId, article) {
        if (process.env.DRY_RUN === 'true') {
            console.log('🚧 [Dev.to] DRY_RUN: Simulation mode. Skipping actual update.');
            return {
                id: articleId,
                url: 'https://dev.to/dry-run-simulation',
                platform: this.name
            };
        }

        await this.authenticate();

        const payload = {
            article: {
                title: article.title,
                body_markdown: article.content,
                published: true,
                tags: article.tags,
                main_image: article.coverImage ? `${article.coverImage}?v=${Date.now()}` : undefined,
                series: article.series
            }
        };

        const response = await axios.put(`${this.baseUrl}/articles/${articleId}`, payload, {
            headers: {
                'api-key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ [Dev.to] Article updated!');
        return {
            id: response.data.id,
            url: response.data.url,
            platform: this.name
        };
    }

    /**
     * Verify article after publishing (browser check)
     */
    async verify(url) {
        console.log(`🌐 [Dev.to] Verifying: ${url}`);
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        try {
            const response = await page.goto(url, { waitUntil: 'networkidle0' });
            if (!response.ok()) {
                console.error(`❌ Page load failed: ${response.status()}`);
                return false;
            }

            const imageEval = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img'));
                const broken = images.filter(img => !img.complete || img.naturalWidth === 0);
                return { total: images.length, broken: broken.map(i => i.src) };
            });

            if (imageEval.broken.length > 0) {
                console.error('❌ Broken images:', imageEval.broken);
                return false;
            }

            console.log(`🎉 [Dev.to] Verified! ${imageEval.total} images OK.`);
            return true;
        } finally {
            await browser.close();
        }
    }
}

module.exports = DevtoAdapter;
