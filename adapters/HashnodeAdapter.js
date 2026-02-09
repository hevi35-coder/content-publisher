/**
 * HashnodeAdapter - Hashnode platform adapter
 * 
 * Handles publishing to Hashnode using their GraphQL API.
 * Requires: HASHNODE_PAT, HASHNODE_PUBLICATION_ID
 */
const BaseAdapter = require('./BaseAdapter');

class HashnodeAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.name = 'hashnode';
        this.pat = process.env.HASHNODE_PAT;
        this.publicationId = process.env.HASHNODE_PUBLICATION_ID;
        this.endpoint = 'https://gql.hashnode.com';
    }

    async authenticate() {
        if (!this.pat) {
            throw new Error('HASHNODE_PAT is missing in .env');
        }
        if (!this.publicationId) {
            throw new Error('HASHNODE_PUBLICATION_ID is missing in .env');
        }
        return true;
    }

    async _graphqlRequest(query, variables) {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.pat
            },
            body: JSON.stringify({ query, variables })
        });

        const result = await response.json();
        if (result.errors) {
            throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
        }
        return result.data;
    }

    async checkExists(title) {
        // Hashnode doesn't have a simple title-based lookup
        // Would need to fetch all posts and filter - skipping for now
        return null;
    }

    async publish(article) {
        await this.authenticate();

        const mutation = `
            mutation PublishPost($input: PublishPostInput!) {
                publishPost(input: $input) {
                    post {
                        id
                        slug
                        url
                    }
                }
            }
        `;

        const variables = {
            input: {
                publicationId: this.publicationId,
                title: article.title,
                contentMarkdown: article.content,
                tags: article.tags?.map(tag => ({ slug: tag.toLowerCase(), name: tag })) || [],
                coverImageOptions: article.coverImage ? {
                    coverImageURL: `${article.coverImage}?v=${Date.now()}`
                } : undefined
                // Note: Hashnode doesn't support draft status in PublishPostInput
                // Published articles can be unpublished manually from dashboard
            }
        };

        const data = await this._graphqlRequest(mutation, variables);
        const post = data.publishPost.post;

        console.log('✅ [Hashnode] Article published!');
        return {
            id: post.id,
            url: post.url,
            slug: post.slug,
            platform: this.name
        };
    }

    async update(articleId, article) {
        await this.authenticate();

        const mutation = `
            mutation UpdatePost($input: UpdatePostInput!) {
                updatePost(input: $input) {
                    post {
                        id
                        slug
                        url
                    }
                }
            }
        `;

        const variables = {
            input: {
                id: articleId,
                title: article.title,
                contentMarkdown: article.content,
                tags: article.tags?.map(tag => ({ slug: tag.toLowerCase(), name: tag })) || [],
                coverImageOptions: article.coverImage ? {
                    coverImageURL: `${article.coverImage}?v=${Date.now()}`
                } : undefined
            }
        };

        const data = await this._graphqlRequest(mutation, variables);
        const post = data.updatePost.post;

        console.log('✅ [Hashnode] Article updated!');
        return {
            id: post.id,
            url: post.url,
            slug: post.slug,
            platform: this.name
        };
    }
}

module.exports = HashnodeAdapter;
