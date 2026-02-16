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

    _normalizeTitle(title) {
        return String(title || '').trim().toLowerCase();
    }

    async checkExists(title) {
        await this.authenticate();

        const targetTitle = this._normalizeTitle(title);
        if (!targetTitle) return null;

        const query = `
            query GetPublicationPosts($id: ObjectId!, $first: Int!, $after: String) {
                publication(id: $id) {
                    posts(first: $first, after: $after) {
                        edges {
                            node {
                                id
                                title
                                slug
                                url
                            }
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }
        `;

        const MAX_PAGES = 5;
        const PAGE_SIZE = 20;
        let after = null;

        try {
            for (let i = 0; i < MAX_PAGES; i++) {
                const data = await this._graphqlRequest(query, {
                    id: this.publicationId,
                    first: PAGE_SIZE,
                    after
                });

                const edges = data?.publication?.posts?.edges || [];
                for (const edge of edges) {
                    const post = edge?.node;
                    if (!post) continue;
                    if (this._normalizeTitle(post.title) === targetTitle) {
                        return post;
                    }
                }

                const pageInfo = data?.publication?.posts?.pageInfo;
                if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) {
                    break;
                }
                after = pageInfo.endCursor;
            }
        } catch (err) {
            console.warn('⚠️ [Hashnode] Failed to check existing posts:', err.message);
            return null;
        }

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
