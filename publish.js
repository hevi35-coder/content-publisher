#!/usr/bin/env node
/**
 * Unified publish entrypoint for automation.
 *
 * Default routing:
 * - Korean drafts (*-ko.md) -> blogger
 * - English drafts (*.md)   -> devto,hashnode
 *
 * Optional override:
 * - node publish.js <draft-path> devto,hashnode,blogger
 */
const fs = require('fs');
const path = require('path');
const { publishToAll } = require('./lib/publisher');
const { isKoreanDraft } = require('./lib/translator');
require('dotenv').config();

function isDryRun() {
    return String(process.env.DRY_RUN || '').toLowerCase() === 'true';
}

function detectDefaultPlatforms(draftPath) {
    const filename = path.basename(draftPath);
    return isKoreanDraft(filename) ? ['blogger'] : ['devto', 'hashnode'];
}

function parsePlatformArg(platformArg) {
    if (!platformArg) return null;
    const platforms = platformArg
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
    return platforms.length > 0 ? platforms : null;
}

function requireEnvVars(keys, routeName) {
    const missing = keys.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`[${routeName}] Missing required env vars: ${missing.join(', ')}`);
    }
}

function validateRouteSecrets(platforms) {
    if (platforms.includes('devto')) {
        requireEnvVars(['DEVTO_API_KEY'], 'devto');
    }

    if (platforms.includes('hashnode')) {
        requireEnvVars(['HASHNODE_PAT', 'HASHNODE_PUBLICATION_ID'], 'hashnode');
    }

    if (platforms.includes('blogger')) {
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
    }
}

async function main() {
    const args = process.argv.slice(2);
    const draftPath = args[0];

    if (!draftPath) {
        console.error('Usage: node publish.js <draft-path> [platforms]');
        console.error('  platforms (optional): comma-separated (devto,hashnode,blogger)');
        console.error('  default routing: *-ko.md -> blogger, *.md -> devto,hashnode');
        process.exit(1);
    }

    if (!fs.existsSync(draftPath)) {
        console.error(`❌ Draft file not found: ${draftPath}`);
        process.exit(1);
    }

    const overridePlatforms = parsePlatformArg(args[1]);
    const platforms = overridePlatforms || detectDefaultPlatforms(draftPath);

    if (platforms.length === 0) {
        console.error('❌ No target platforms resolved.');
        process.exit(1);
    }

    const dryRun = isDryRun();
    if (!dryRun) {
        validateRouteSecrets(platforms);
    } else {
        console.log('🧪 DRY_RUN enabled: skipping secret validation.');
    }

    console.log(`📄 Draft: ${draftPath}`);
    console.log(`📡 Platforms: ${platforms.join(', ')}`);
    console.log(`🧪 DRY_RUN: ${dryRun}\n`);

    const { errors } = await publishToAll(draftPath, platforms, { dryRun });
    if (errors.length > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('❌ Unified Publisher failed:', err.message);
    process.exit(1);
});
