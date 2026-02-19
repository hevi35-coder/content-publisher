#!/usr/bin/env node
const fs = require('fs');
const matter = require('gray-matter');
const { buildDedupePlan, normalizeTitleKey } = require('../lib/hashnode-dedupe');

function toBool(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function parsePositiveFloat(value, fallback) {
    const parsed = Number.parseFloat(String(value || ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function parseTargetFiles(raw) {
    return String(raw || '')
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean);
}

function isKoreanDraftFile(filePath) {
    return /-ko\.md$/i.test(String(filePath || ''));
}

function collectEnglishDraftTitles(targetFiles) {
    const unique = new Map();

    for (const filePath of targetFiles) {
        if (isKoreanDraftFile(filePath)) {
            continue;
        }
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ [HashnodeDedupe] Draft file not found, skipping: ${filePath}`);
            continue;
        }

        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const { data } = matter(raw);
            const title = String(data && data.title ? data.title : '').trim();
            if (!title) {
                console.warn(`⚠️ [HashnodeDedupe] Missing frontmatter title, skipping: ${filePath}`);
                continue;
            }
            unique.set(normalizeTitleKey(title), title);
        } catch (error) {
            console.warn(`⚠️ [HashnodeDedupe] Failed to read draft (${filePath}): ${error.message}`);
        }
    }

    return [...unique.values()];
}

async function graphqlRequest({ endpoint, pat, query, variables }) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: pat
        },
        body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Hashnode HTTP Error (${response.status}): ${body}`);
    }

    const payload = await response.json();
    if (payload.errors) {
        throw new Error(`Hashnode GraphQL Error: ${JSON.stringify(payload.errors)}`);
    }

    return payload.data || {};
}

async function fetchPublicationPosts({ endpoint, pat, publicationId, pageSize = 20, maxScan = 240 }) {
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
                            publishedAt
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

    const posts = [];
    let after = null;

    while (posts.length < maxScan) {
        const data = await graphqlRequest({
            endpoint,
            pat,
            query,
            variables: {
                id: publicationId,
                first: pageSize,
                after
            }
        });

        const conn = data && data.publication ? data.publication.posts : null;
        if (!conn) {
            break;
        }

        for (const edge of conn.edges || []) {
            if (edge && edge.node) {
                posts.push(edge.node);
            }
        }

        if (!conn.pageInfo || !conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) {
            break;
        }

        after = conn.pageInfo.endCursor;
    }

    return posts;
}

async function removePost({ endpoint, pat, postId }) {
    const mutation = `
        mutation RemovePost($input: RemovePostInput!) {
            removePost(input: $input) {
                post {
                    id
                    slug
                    url
                }
            }
        }
    `;

    const data = await graphqlRequest({
        endpoint,
        pat,
        query: mutation,
        variables: {
            input: {
                id: postId
            }
        }
    });

    return data && data.removePost ? data.removePost.post : null;
}

async function main() {
    const dryRun = toBool(process.env.DRY_RUN);
    const enabled = !String(process.env.HASHNODE_AUTO_DEDUPE || '').trim()
        || String(process.env.HASHNODE_AUTO_DEDUPE || '').trim().toLowerCase() === 'true';
    if (!enabled) {
        console.log('[HashnodeDedupe] Disabled by HASHNODE_AUTO_DEDUPE=false.');
        return;
    }
    if (dryRun) {
        console.log('[HashnodeDedupe] DRY_RUN=true. Skipping duplicate cleanup.');
        return;
    }

    const targetFiles = parseTargetFiles(process.env.TARGET_FILES || '');
    const titles = collectEnglishDraftTitles(targetFiles);
    if (titles.length === 0) {
        console.log('[HashnodeDedupe] No English draft titles in target files. Skipping.');
        return;
    }

    const pat = String(process.env.HASHNODE_PAT || '').trim();
    const publicationId = String(process.env.HASHNODE_PUBLICATION_ID || '').trim();
    if (!pat || !publicationId) {
        throw new Error('HASHNODE_PAT and HASHNODE_PUBLICATION_ID are required for dedupe cleanup.');
    }

    const endpoint = String(process.env.HASHNODE_GQL_ENDPOINT || 'https://gql.hashnode.com').trim();
    const maxScan = parsePositiveInt(process.env.HASHNODE_DEDUPE_MAX_SCAN, 240);
    const dedupeMaxAgeHours = parsePositiveFloat(process.env.HASHNODE_DEDUPE_MAX_AGE_HOURS, 12);
    const dedupeNow = new Date();

    console.log(
        `[HashnodeDedupe] Loading posts (maxScan=${maxScan}, maxAgeHours=${dedupeMaxAgeHours}, safeMode=true)...`
    );
    const posts = await fetchPublicationPosts({
        endpoint,
        pat,
        publicationId,
        maxScan
    });
    console.log(`[HashnodeDedupe] Loaded ${posts.length} post(s) from publication.`);

    let removedCount = 0;
    let duplicateGroups = 0;

    for (const title of titles) {
        const plan = buildDedupePlan(posts, title, {
            safeMode: true,
            maxAgeHours: dedupeMaxAgeHours,
            now: dedupeNow
        });
        if (!plan.keep || plan.remove.length === 0) {
            console.log(
                `[HashnodeDedupe] No auto-removable duplicates for title: "${title}"` +
                    ` (reason=${plan.reason}, totalMatches=${plan.totalMatches}, recentMatches=${plan.recentMatches}).`
            );
            continue;
        }

        duplicateGroups += 1;
        console.log(
            `[HashnodeDedupe] Duplicates found for "${title}".` +
                ` keep=${plan.keep.slug || plan.keep.id}, remove=${plan.remove.length}, reason=${plan.reason}`
        );

        for (const duplicate of plan.remove) {
            const removed = await removePost({
                endpoint,
                pat,
                postId: duplicate.id
            });
            removedCount += 1;
            console.log(
                `[HashnodeDedupe] Removed duplicate id=${duplicate.id} slug=${duplicate.slug || ''} -> ${
                    removed && removed.url ? removed.url : '(no url)'
                }`
            );
        }
    }

    console.log(`[HashnodeDedupe] Completed. duplicateGroups=${duplicateGroups}, removed=${removedCount}`);
}

main().catch((error) => {
    console.error(`::error::[HashnodeDedupe] ${error.message}`);
    process.exit(1);
});
