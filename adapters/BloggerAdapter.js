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
        try {
            const response = await fetch(
                `${this.baseUrl}/blogs/${this.blogId}/posts?maxResults=50`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                }
            );
            const data = await response.json();
            if (data.items) {
                return data.items.find(p => p.title.trim() === title.trim()) || null;
            }
            return null;
        } catch (err) {
            console.warn('⚠️ [Blogger] Failed to check existing posts:', err.message);
            return null;
        }
    }

    async publish(article) {
        await this.authenticate();

        const payload = {
            kind: 'blogger#post',
            blog: { id: this.blogId },
            title: article.title,
            content: article.content, // HTML content
            labels: article.tags || [],
            isDraft: article.rawFrontmatter.published === false  // ✅ Use isDraft instead of status
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
        await this.authenticate();

        const payload = {
            kind: 'blogger#post',
            id: articleId,
            blog: { id: this.blogId },
            title: article.title,
            content: article.content,
            labels: article.tags || [],
            isDraft: article.rawFrontmatter.published === false  // ✅ Use isDraft
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
