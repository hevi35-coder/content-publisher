/**
 * BloggerAdapter - Google Blogger platform adapter
 * 
 * Handles publishing to Blogger using REST API v3.
 * Requires: BLOGGER_BLOG_ID, Google OAuth 2.0 credentials
 * 
 * API Docs: https://developers.google.com/blogger/docs/3.0/reference
 */
const BaseAdapter = require('./BaseAdapter');
const { oauthManager } = require('../lib/oauth-manager');
const { resolveBloggerIsDraft, shouldForcePublish } = require('../lib/publish-visibility');

class BloggerAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.name = 'blogger';
        this.blogId = process.env.BLOGGER_BLOG_ID;
        this.baseUrl = 'https://www.googleapis.com/blogger/v3';
    }

    async authenticate() {
        if (!this.blogId) {
            throw new Error('BLOGGER_BLOG_ID is missing in .env');
        }
        // Get access token (auto-refreshes if configured)
        this.accessToken = await oauthManager.getAccessToken();
        return true;
    }

    async checkExists(title) {
        const failOpen = process.env.CHECK_EXISTS_FAIL_OPEN === 'true';
        try {
            // checkExists is called before publish/update in upsert flow.
            // Ensure access token exists so fail-closed mode doesn't fail on missing auth state.
            if (!this.accessToken) {
                await this.authenticate();
            }

            const response = await fetch(
                `${this.baseUrl}/blogs/${this.blogId}/posts?maxResults=50`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                }
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.items) {
                return data.items.find(p => p.title.trim() === title.trim()) || null;
            }
            return null;
        } catch (err) {
            if (failOpen) {
                console.warn('⚠️ [Blogger] checkExists failed; fail-open enabled. Proceeding as new publish.', err.message);
                return null;
            }
            throw new Error(`[Blogger] checkExists failed: ${err.message}`);
        }
    }

    async publish(article) {
        if (process.env.DRY_RUN === 'true') {
            console.log('🚧 [Blogger] DRY_RUN: Simulation mode. Skipping actual publish.');
            console.log(`   Title: ${article.title}`);
            console.log(`   Labels: ${article.tags}`);
            return {
                id: 'dry-run-blog-id-' + Date.now(),
                url: 'https://mandaact.blogspot.com/dry-run-simulation',
                platform: this.name
            };
        }

        await this.authenticate();

        if (article?.rawFrontmatter?.published === false && shouldForcePublish()) {
            console.log('ℹ️ [Blogger] Frontmatter is draft but FORCE_PUBLISH is active -> publishing publicly.');
        }

        const payload = {
            kind: 'blogger#post',
            blog: { id: this.blogId },
            title: article.title,
            content: article.content, // HTML content
            labels: article.tags || [],
            isDraft: resolveBloggerIsDraft(article.rawFrontmatter)
        };

        const response = await fetch(
            `${this.baseUrl}/blogs/${this.blogId}/posts/`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Blogger API Error: ${JSON.stringify(error)}`);
        }

        const post = await response.json();

        console.log('✅ [Blogger] Article published!');
        return {
            id: post.id,
            url: post.url,
            platform: this.name
        };
    }

    async update(articleId, article) {
        if (process.env.DRY_RUN === 'true') {
            console.log('🚧 [Blogger] DRY_RUN: Simulation mode. Skipping actual update.');
            return {
                id: articleId,
                url: 'https://mandaact.blogspot.com/dry-run-simulation',
                platform: this.name
            };
        }

        await this.authenticate();

        if (article?.rawFrontmatter?.published === false && shouldForcePublish()) {
            console.log('ℹ️ [Blogger] Frontmatter is draft but FORCE_PUBLISH is active -> updating as public.');
        }

        const payload = {
            kind: 'blogger#post',
            id: articleId,
            blog: { id: this.blogId },
            title: article.title,
            content: article.content,
            labels: article.tags || [],
            isDraft: resolveBloggerIsDraft(article.rawFrontmatter)
        };

        const response = await fetch(
            `${this.baseUrl}/blogs/${this.blogId}/posts/${articleId}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Blogger API Error: ${JSON.stringify(error)}`);
        }

        const post = await response.json();

        console.log('✅ [Blogger] Article updated!');
        return {
            id: post.id,
            url: post.url,
            platform: this.name
        };
    }
}

module.exports = BloggerAdapter;
