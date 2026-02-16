/**
 * Publisher - Multi-platform publishing router
 *
 * Routes articles to platform adapters:
 * - devto
 * - hashnode
 * - blogger
 */
const fs = require('fs');
const matter = require('gray-matter');
const DevtoAdapter = require('../adapters/DevtoAdapter');
const HashnodeAdapter = require('../adapters/HashnodeAdapter');
const BloggerAdapter = require('../adapters/BloggerAdapter');
const { adaptForPlatform } = require('./translator');
const {
    SUPPORTED_PLATFORMS,
    normalizePlatforms,
    getDefaultPlatformsFromDraftPath,
    parsePlatformArg,
    assertSupportedPlatforms
} = require('./platform-routing');
const config = require('../config');
const { notifier } = require('./notifier');
const { retryManager } = require('./retry-manager');
const { pushCoversToMain } = require('./git-manager');
const { waitForUrl } = require('./asset-verifier');
require('dotenv').config();

function toSlug(text) {
    const slug = String(text || 'article')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    return slug || 'article';
}

const adapters = {
    devto: new DevtoAdapter(config),
    hashnode: new HashnodeAdapter(config),
    blogger: new BloggerAdapter(config)
};

function resolveDryRun(options = {}) {
    if (options.dryRun === true) return true;
    return String(process.env.DRY_RUN || '').toLowerCase() === 'true';
}

function parseDraft(draftPath) {
    const fileContent = fs.readFileSync(draftPath, 'utf8');
    const { data, content } = matter(fileContent);

    let processedContent = content;
    const assetBaseUrl = config.github.assetBaseUrl;
    processedContent = processedContent.replace(/\.\.\/assets\//g, assetBaseUrl);

    let coverImage = data.cover_image;
    if (coverImage && coverImage.startsWith('../assets')) {
        coverImage = coverImage.replace('../assets/', assetBaseUrl);
    }

    return {
        title: data.title,
        content: processedContent,
        tags: data.tags || [],
        coverImage,
        series: data.series,
        rawFrontmatter: data
    };
}

async function publishToPlatform(article, platform, options = {}) {
    const adapter = adapters[platform];
    if (!adapter) {
        throw new Error(`Unknown platform: ${platform}`);
    }

    const dryRun = resolveDryRun(options);
    console.log(`\n📤 Publishing to ${platform.toUpperCase()}...`);

    const adapted = await adaptForPlatform(article, platform, options);

    if (dryRun) {
        const dryRunResult = {
            id: `dry-run-${platform}-${Date.now()}`,
            url: `https://dry-run.local/${platform}/${toSlug(adapted.title)}`,
            platform
        };

        await notifier.stepComplete(`publish_${platform}`, {
            url: dryRunResult.url,
            attempts: 1,
            dryRun: true
        });

        console.log(`🧪 [DRY_RUN] ${platform}: ${dryRunResult.url}`);
        return dryRunResult;
    }

    const result = await retryManager.execute({
        name: `publish_${platform}`,
        fn: async () => {
            const existing = await adapter.checkExists(adapted.title);
            if (existing) {
                console.log('ℹ️  Found existing article. Updating...');
                return adapter.update(existing.id, adapted);
            }
            return adapter.publish(adapted);
        },
        verify: async (publishResult) => {
            if (!publishResult || !publishResult.url) return false;
            const exists = await adapter.checkExists(adapted.title);
            return !!exists;
        },
        maxRetries: 3,
        timeout: 60000,
        backoff: 'exponential'
    });

    if (!result.success) {
        await notifier.stepFailed(`publish_${platform}`, result.error);
        throw new Error(result.error);
    }

    await notifier.stepComplete(`publish_${platform}`, {
        url: result.result.url,
        attempts: result.attempts
    });

    console.log(`🔗 ${platform}: ${result.result.url}`);
    return result.result;
}

async function publishToAll(draftPath, platforms = [], options = {}) {
    const dryRun = resolveDryRun(options);
    const targetPlatforms = Array.isArray(platforms) && platforms.length > 0
        ? normalizePlatforms(platforms)
        : getDefaultPlatformsFromDraftPath(draftPath);

    if (targetPlatforms.length === 0) {
        throw new Error('No target platforms resolved.');
    }
    assertSupportedPlatforms(targetPlatforms);

    console.log('═══════════════════════════════════════');
    console.log('🚀 Content Publisher - Multi-Platform');
    console.log('═══════════════════════════════════════\n');

    const article = parseDraft(draftPath);
    console.log(`📄 Draft: ${article.title}`);
    console.log(`🏷️  Tags: ${article.tags.join(', ')}`);
    console.log(`📷 Cover: ${article.coverImage ? 'Yes' : 'No'}`);
    console.log(`📡 Platforms: ${targetPlatforms.join(', ')}`);
    console.log(`🧪 DRY_RUN: ${dryRun}\n`);

    if (article.coverImage && !dryRun) {
        console.log('🔄 [Git] Syncing assets...');
        pushCoversToMain(`Add cover for: ${article.title}`);

        if (article.coverImage.startsWith('http')) {
            console.log('⏳ [Asset] Waiting for availability...');
            const available = await waitForUrl(article.coverImage, { timeout: 60000 });
            if (!available) {
                console.warn('⚠️ [Asset] Warning: Cover image might not be available yet.');
            }
        }
    } else if (article.coverImage && dryRun) {
        console.log('🧪 [DRY_RUN] Skipping asset sync and availability polling.');
    }

    const results = [];
    const errors = [];

    for (const platform of targetPlatforms) {
        try {
            const result = await publishToPlatform(article, platform, options);
            results.push(result);
        } catch (err) {
            console.error(`❌ [${platform}] Failed: ${err.message}`);
            errors.push({ platform, error: err.message });
        }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('📊 PUBLICATION SUMMARY');
    console.log('═══════════════════════════════════════');
    results.forEach((r) => console.log(`   ✅ ${r.platform}: ${r.url}`));
    errors.forEach((e) => console.log(`   ❌ ${e.platform}: ${e.error}`));
    console.log('═══════════════════════════════════════\n');

    if (results.length > 0) {
        const urlSummary = results.map((r) => `${r.platform}: ${r.url}`).join('\n');
        await notifier.pipelineComplete({
            published: results.length,
            failed: errors.length,
            urls: urlSummary,
            dryRun
        });
    }

    return { results, errors };
}

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node lib/publisher.js <draft-path> [platforms]');
        console.log(`  platforms: comma-separated list (${SUPPORTED_PLATFORMS.join(',')})`);
        console.log('  Example: node lib/publisher.js drafts/my-article.md devto,blogger');
        process.exit(1);
    }

    const draftPath = args[0];
    const platforms = parsePlatformArg(args[1]) || getDefaultPlatformsFromDraftPath(draftPath);

    publishToAll(draftPath, platforms, { dryRun: resolveDryRun() })
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
}

module.exports = { publishToAll, publishToPlatform, parseDraft, getDefaultPlatformsFromDraftPath };
