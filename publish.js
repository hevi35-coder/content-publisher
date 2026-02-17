const fs = require('fs');
const path = require('path');
const { publishToAll } = require('./lib/publisher');
const { isKoreanDraft } = require('./lib/translator');
const { shouldForcePublish } = require('./lib/publish-visibility');
require('dotenv').config();

// Check for CLI arguments
const args = process.argv.slice(2);
let DRAFT_PATH = null;

if (args.length > 0) {
    DRAFT_PATH = args[0];
}

if (!DRAFT_PATH) {
    console.error("❌ Error: Please provide the path to the draft file.");
    process.exit(1);
}

if (!fs.existsSync(DRAFT_PATH)) {
    console.error(`❌ Error: File not found: ${DRAFT_PATH}`);
    process.exit(1);
}

function requireEnvVars(keys, routeName) {
    const missing = keys.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`[${routeName}] Missing required env vars: ${missing.join(', ')}`);
    }
}

function validateRouteSecrets(isKorean) {
    if (isKorean) {
        // Blogger route requires blog id and either manual access token or refresh-token trio.
        requireEnvVars(['BLOGGER_BLOG_ID'], 'blogger');
        const hasManualToken = !!process.env.BLOGGER_ACCESS_TOKEN;
        const hasRefreshFlow =
            !!process.env.BLOGGER_CLIENT_ID &&
            !!process.env.BLOGGER_CLIENT_SECRET &&
            !!process.env.BLOGGER_REFRESH_TOKEN;
        if (!hasManualToken && !hasRefreshFlow) {
            throw new Error(
                '[blogger] Set BLOGGER_ACCESS_TOKEN or all of BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN'
            );
        }
        return;
    }

    // English route
    requireEnvVars(['DEVTO_API_KEY', 'HASHNODE_PAT', 'HASHNODE_PUBLICATION_ID'], 'devto+hashnode');
}

async function runPublisher() {
    try {
        const filename = path.basename(DRAFT_PATH);
        const isKO = isKoreanDraft(filename);
        const isDryRun = process.env.DRY_RUN === 'true';

        if (isDryRun) {
            console.warn('⚠️ DRY_RUN=true: 외부 플랫폼에 실제 게시되지 않고 시뮬레이션으로 처리됩니다.');
        }
        if (shouldForcePublish()) {
            console.log('✅ FORCE_PUBLISH active: frontmatter published:false라도 실발행에서는 공개로 처리됩니다.');
        } else {
            console.log('ℹ️ FORCE_PUBLISH=false: frontmatter published 값을 존중합니다.');
        }

        // Determine platforms
        // Korean drafts -> Blogger
        // English drafts -> Dev.to + Hashnode
        const platforms = isKO ? ['blogger'] : ['devto', 'hashnode'];
        if (!isDryRun) {
            validateRouteSecrets(isKO);
        }

        console.log(`🚀 Routing ${filename} to platforms: ${platforms.join(', ')}`);

        const result = await publishToAll(DRAFT_PATH, platforms);

        if (result.errors.length > 0) {
            console.error("⚠️ Some platforms failed to publish.");
            process.exit(1);
        }

        console.log("🎉 All targeted platforms processed successfully.");
        process.exit(0);

    } catch (error) {
        console.error("❌ Unified Publisher failed:", error.message);
        process.exit(1);
    }
}

runPublisher();
