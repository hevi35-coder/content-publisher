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
const { adaptForPlatform } = require('./translator');
const config = require('../config');
const { notifier } = require('./notifier');
const { retryManager } = require('./retry-manager');
require('dotenv').config();

// Adapter registry
const adapters = {
    devto: new DevtoAdapter(config),
    hashnode: new HashnodeAdapter(config),
    blogger: new BloggerAdapter(config)
};

/**
 * Parse a markdown draft file into an article object
 */
function parseDraft(draftPath) {
    const fileContent = fs.readFileSync(draftPath, 'utf8');
    const { data, content } = matter(fileContent);

    // Replace local asset paths with GitHub URLs (process content only, not frontmatter)
    let processedContent = content;  // ✅ Use content (body only), not fileContent
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

    // Execute with retry and verification
    const result = await retryManager.execute({
        name: `publish_${platform}`,
        fn: async () => {
            // Check if exists (upsert logic)
            const existing = await adapter.checkExists(adapted.title);

            if (existing) {
                console.log(`ℹ️  Found existing article. Updating...`);
                return await adapter.update(existing.id, adapted);
            } else {
                return await adapter.publish(adapted);
            }
        },
        verify: async (result) => {
            // Verify the article was published/updated
            if (!result || !result.url) return false;
            const exists = await adapter.checkExists(adapted.title);
            return !!exists;
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

module.exports = { publishToAll, publishToPlatform, parseDraft };

