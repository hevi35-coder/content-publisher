/**
 * Publisher - Multi-platform publishing router
 * 
 * Routes articles to appropriate platform adapters.
 * Supports: devto, hashnode, blogger
 * 
 * Features:
 * - Retry with verification
 * - Step-by-step notifications
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const DevtoAdapter = require('../adapters/DevtoAdapter');
const HashnodeAdapter = require('../adapters/HashnodeAdapter');
const BloggerAdapter = require('../adapters/BloggerAdapter');
const { adaptForPlatform, getDraftPathForPlatform } = require('./translator');
const { getDefaultPlatformsFromDraftPath } = require('./platform-routing');
const config = require('../config');
const { notifier } = require('./notifier');
const { retryManager } = require('./retry-manager');
const { pushCoversToMain } = require('./git-manager');
const { waitForUrl } = require('./asset-verifier');
const { shouldVerifyPublishedUrls, shouldVerifyUrlForPlatform, verifyPublishedUrl } = require('./publish-url-verifier');
const { sanitizeDraftBodyContent } = require('./draft-cleaner');
require('dotenv').config();

const HASHNODE_RECOVERY_ATTEMPTS = Math.max(
    1,
    Number.parseInt(String(process.env.HASHNODE_RECOVERY_ATTEMPTS || '4'), 10) || 4
);
const HASHNODE_RECOVERY_DELAY_MS = Math.max(
    250,
    Number.parseInt(String(process.env.HASHNODE_RECOVERY_DELAY_MS || '4000'), 10) || 4000
);

// Adapter registry
const adapters = {
    devto: new DevtoAdapter(config),
    hashnode: new HashnodeAdapter(config),
    blogger: new BloggerAdapter(config)
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUncertainPublishError(error) {
    const message = String(error && error.message ? error.message : '').toLowerCase();
    if (!message) {
        return false;
    }

    return [
        'timeout',
        'timed out',
        'network',
        'socket',
        'fetch failed',
        'econnreset',
        'ehostunreach',
        'enotfound',
        'etimedout'
    ].some((token) => message.includes(token));
}

async function recoverHashnodeExistingPost(adapter, title, options = {}) {
    const attempts = Number.isFinite(options.attempts) ? Math.max(1, options.attempts) : HASHNODE_RECOVERY_ATTEMPTS;
    const delayMs = Number.isFinite(options.delayMs) ? Math.max(250, options.delayMs) : HASHNODE_RECOVERY_DELAY_MS;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const existing = await adapter.checkExists(title);
            if (existing) {
                return existing;
            }
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [hashnode] Recovery check ${attempt}/${attempts} failed: ${error.message}`);
        }

        if (attempt < attempts) {
            await sleep(delayMs);
        }
    }

    if (lastError) {
        console.warn(`⚠️ [hashnode] Recovery exhausted with last error: ${lastError.message}`);
    }

    return null;
}

/**
 * Parse a markdown draft file into an article object
 */
function parseDraft(draftPath) {
    const fileContent = fs.readFileSync(draftPath, 'utf8');
    const { data, content } = matter(fileContent);

    // Replace local asset paths with GitHub URLs (process content only, not frontmatter)
    let processedContent = sanitizeDraftBodyContent(content);  // ✅ Use content (body only), not fileContent
    const assetBaseUrl = config.github.assetBaseUrl;
    processedContent = processedContent.replace(/\.\.\/assets\//g, assetBaseUrl);

    // Process cover image
    let coverImage = data.cover_image;
    if (coverImage && coverImage.startsWith('../assets')) {
        coverImage = coverImage.replace('../assets/', assetBaseUrl);
    }

    return {
        title: data.title,
        content: processedContent,  // ✅ Pure markdown body without frontmatter
        tags: data.tags || [],
        coverImage: coverImage,
        series: data.series,
        rawFrontmatter: data
    };
}

/**
 * Publish to a single platform with retry and notification
 */
async function publishToPlatform(article, platform, options = {}) {
    const adapter = adapters[platform];
    if (!adapter) {
        throw new Error(`Unknown platform: ${platform}`);
    }

    console.log(`\n📤 Publishing to ${platform.toUpperCase()}...`);

    // Adapt content for platform
    const adapted = await adaptForPlatform(article, platform, options);
    const isDryRun = process.env.DRY_RUN === 'true';

    // Execute with retry and verification
    const result = await retryManager.execute({
        name: `publish_${platform}`,
        fn: async () => {
            if (isDryRun) {
                return await adapter.publish(adapted);
            }

            // Check if exists (upsert logic)
            const existing = await adapter.checkExists(adapted.title);

            if (existing) {
                console.log(`ℹ️  Found existing article. Updating...`);
                return await adapter.update(existing.id, adapted);
            }

            try {
                return await adapter.publish(adapted);
            } catch (error) {
                if (platform !== 'hashnode' || !isUncertainPublishError(error)) {
                    throw error;
                }

                console.warn(
                    `⚠️ [hashnode] Publish result uncertain (${error.message}). Re-checking existing posts before retry.`
                );
                const recovered = await recoverHashnodeExistingPost(adapter, adapted.title);
                if (recovered) {
                    console.log(`✅ [hashnode] Recovered existing post after uncertain publish: ${recovered.url || recovered.id}`);
                    return {
                        id: recovered.id,
                        slug: recovered.slug,
                        url: recovered.url,
                        platform
                    };
                }

                throw error;
            }
        },
        verify: async (result) => {
            // Verify the article was published/updated
            if (!result || !result.url) return false;

            // DRY_RUN must not call external APIs or fail verification.
            if (isDryRun) return true;

            let existsVerified = false;

            // Hashnode list API can be eventually consistent right after publish.
            // Trust successful mutation response to avoid duplicate re-publishes on retries.
            if (platform === 'hashnode') {
                existsVerified = !!result.id;
            } else {
                const exists = await adapter.checkExists(adapted.title);
                existsVerified = !!exists;
            }
            if (!existsVerified) return false;

            if (shouldVerifyPublishedUrls() && shouldVerifyUrlForPlatform(platform, result.url)) {
                const urlReachable = await verifyPublishedUrl(result.url);
                if (!urlReachable) {
                    console.error(`❌ [${platform}] Published URL is not publicly reachable: ${result.url}`);
                    return false;
                }
            }

            return true;
        },
        maxRetries: 3,
        timeout: 60000, // 60 seconds per attempt
        backoff: 'exponential'
    });

    if (!result.success) {
        // Send failure notification
        await notifier.stepFailed(`publish_${platform}`, result.error);
        throw new Error(result.error);
    }

    // Send success notification
    await notifier.stepComplete(`publish_${platform}`, {
        url: result.result.url,
        attempts: result.attempts
    });

    console.log(`🔗 ${platform}: ${result.result.url}`);
    return result.result;
}

/**
 * Publish to multiple platforms with notifications
 */
async function publishToAll(draftPath, platforms = ['devto'], options = {}) {
    console.log('═══════════════════════════════════════');
    console.log('🚀 Content Publisher - Multi-Platform');
    console.log('═══════════════════════════════════════\n');

    const article = parseDraft(draftPath);
    console.log(`📄 Draft: ${article.title}`);
    console.log(`🏷️  Tags: ${article.tags.join(', ')}`);
    console.log(`📷 Cover: ${article.coverImage ? 'Yes' : 'No'}\n`);

    // 1. Auto-push cover images to GitHub
    if (article.coverImage) {
        console.log('🔄 [Git] Syncing assets...');
        // Push cover images to main branch
        pushCoversToMain(`Add cover for: ${article.title}`);

        // 2. Wait for GitHub Raw availability (Polling)
        // Extract raw URL if present
        if (article.coverImage.startsWith('http')) {
            console.log('⏳ [Asset] Waiting for availability...');
            const available = await waitForUrl(article.coverImage, { timeout: 60000 });
            if (!available) {
                console.warn('⚠️ [Asset] Warning: Cover image might not be available yet.');
            }
        }
    }

    const results = [];
    const errors = [];

    for (const platform of platforms) {
        try {
            const result = await publishToPlatform(article, platform, options);
            results.push(result);
        } catch (err) {
            console.error(`❌ [${platform}] Failed: ${err.message}`);
            errors.push({ platform, error: err.message });
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════');
    console.log('📊 PUBLICATION SUMMARY');
    console.log('═══════════════════════════════════════');
    results.forEach(r => console.log(`   ✅ ${r.platform}: ${r.url}`));
    errors.forEach(e => console.log(`   ❌ ${e.platform}: ${e.error}`));
    console.log('═══════════════════════════════════════\n');

    // Send pipeline complete notification
    if (results.length > 0) {
        const urlSummary = results.map(r => `${r.platform}: ${r.url}`).join('\n');
        await notifier.pipelineComplete({
            published: results.length,
            failed: errors.length,
            urls: urlSummary
        });
    }

    return { results, errors };
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node lib/publisher.js <draft-path> [platforms]');
        console.log('  platforms: comma-separated list (devto,hashnode,blogger)');
        console.log('  Example: node lib/publisher.js drafts/my-article.md devto,blogger');
        process.exit(1);
    }

    const draftPath = args[0];
    const platforms = args[1] ? args[1].split(',') : ['devto'];

    publishToAll(draftPath, platforms)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
}

module.exports = {
    publishToAll,
    publishToPlatform,
    parseDraft,
    getDefaultPlatformsFromDraftPath,
    isUncertainPublishError,
    recoverHashnodeExistingPost
};
