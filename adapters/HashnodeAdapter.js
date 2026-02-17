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
        if (process.env.DRY_RUN === 'true') {
            return true;
        }
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

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Hashnode HTTP Error (${response.status}): ${body}`);
        }

        const result = await response.json();
        if (result.errors) {
            throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
        }
        if (!result.data) {
            throw new Error('GraphQL Error: Missing data in response');
        }
        return result.data;
    }

    async checkExists(title) {
        if (process.env.DRY_RUN === 'true') {
            return null;
        }

        await this.authenticate();

        // Lookup post by exact title in this publication to support upsert.
        // Query shape validated against Hashnode GraphQL endpoint.
        const query = `
            query PublicationPosts($id: ObjectId!, $first: Int!, $after: String) {
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

        let after = null;
        const normalizedTitle = title.trim().toLowerCase();
        const MAX_SCAN = 200; // bounded scan to avoid heavy pagination in automation
        let scanned = 0;

        while (scanned < MAX_SCAN) {
            const data = await this._graphqlRequest(query, {
                id: this.publicationId,
                first: 20,
                after
            });

            const posts = data?.publication?.posts;
            if (!posts) return null;

            for (const edge of posts.edges || []) {
                const node = edge?.node;
                if (!node?.title) continue;
                scanned++;
                if (node.title.trim().toLowerCase() === normalizedTitle) {
                    return {
                        id: node.id,
                        slug: node.slug,
                        url: node.url,
                        title: node.title
                    };
                }
            }

            if (!posts.pageInfo?.hasNextPage || !posts.pageInfo?.endCursor) {
                break;
            }
            after = posts.pageInfo.endCursor;
        }

        return null;
    }

    async publish(article) {
        await this.authenticate();

        if (process.env.DRY_RUN === 'true') {
            console.log('🚧 [Hashnode] DRY_RUN: Simulation mode. Skipping actual publish.');
            return {
                id: `dry-run-hashnode-id-${Date.now()}`,
                url: 'https://hashnode.com/dry-run-simulation',
                slug: 'dry-run',
                platform: this.name
            };
        }

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

        if (process.env.DRY_RUN === 'true') {
            console.log('🚧 [Hashnode] DRY_RUN: Simulation mode. Skipping actual update.');
            return {
                id: articleId,
                url: 'https://hashnode.com/dry-run-simulation',
                slug: 'dry-run',
                platform: this.name
            };
        }

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
