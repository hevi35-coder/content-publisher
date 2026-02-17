#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

function resolveMinBodyChars() {
    const raw = process.env.MIN_DRAFT_BODY_CHARS || '120';
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`MIN_DRAFT_BODY_CHARS must be a positive integer (received: ${raw})`);
    }
    return parsed;
}

function hasValue(key) {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
}

function parseTargetFiles(raw) {
    if (!raw) return [];
    return raw
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
}

function isKoreanDraftFile(filePath) {
    return /-ko\.md$/i.test(path.basename(filePath));
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function validateDraftFile(filePath, minBodyChars) {
    const errors = [];
    const safePath = String(filePath || '').trim();

    if (!safePath) {
        return ['Empty draft path'];
    }

    if (!fs.existsSync(safePath)) {
        return [`Draft file not found: ${safePath}`];
    }

    let data;
    let content;
    try {
        const raw = fs.readFileSync(safePath, 'utf8');
        const parsed = matter(raw);
        data = parsed.data || {};
        content = parsed.content || '';
    } catch (err) {
        return [`Failed to parse draft frontmatter: ${safePath} (${err.message})`];
    }

    const title = normalizeText(data.title);
    if (!title) {
        errors.push(`Missing frontmatter title: ${safePath}`);
    }

    const body = normalizeText(content);
    if (body.length < minBodyChars) {
        errors.push(
            `Draft body is too short (<${minBodyChars} chars): ${safePath}`
        );
    }

    return errors;
}

function main() {
    const dryRun = process.env.DRY_RUN === 'true';
    const files = parseTargetFiles(process.env.TARGET_FILES || '');
    let minBodyChars;
    try {
        minBodyChars = resolveMinBodyChars();
    } catch (err) {
        console.error(`::error::[preflight] ${err.message}`);
        process.exit(1);
    }

    if (files.length === 0) {
        console.log('[preflight] No target draft files. Nothing to validate.');
        process.exit(0);
    }

    const draftErrors = files.flatMap((file) => validateDraftFile(file, minBodyChars));
    if (draftErrors.length > 0) {
        console.error(`::error::[preflight] Invalid draft files: ${draftErrors.join(' | ')}`);
        process.exit(1);
    }

    if (dryRun) {
        console.log('[preflight] DRY_RUN=true -> skipping secret validation.');
        process.exit(0);
    }

    const hasKorean = files.some(isKoreanDraftFile);
    const hasEnglish = files.some((file) => !isKoreanDraftFile(file));
    const missing = [];

    if (hasEnglish) {
        ['DEVTO_API_KEY', 'HASHNODE_PAT', 'HASHNODE_PUBLICATION_ID'].forEach((key) => {
            if (!hasValue(key)) missing.push(key);
        });
    }

    if (hasKorean) {
        if (!hasValue('BLOGGER_BLOG_ID')) {
            missing.push('BLOGGER_BLOG_ID');
        }
        const hasManualToken = hasValue('BLOGGER_ACCESS_TOKEN');
        const hasRefreshFlow =
            hasValue('BLOGGER_CLIENT_ID') &&
            hasValue('BLOGGER_CLIENT_SECRET') &&
            hasValue('BLOGGER_REFRESH_TOKEN');
        if (!hasManualToken && !hasRefreshFlow) {
            missing.push('BLOGGER_ACCESS_TOKEN or (BLOGGER_CLIENT_ID + BLOGGER_CLIENT_SECRET + BLOGGER_REFRESH_TOKEN)');
        }
    }

    if (missing.length > 0) {
        console.error(`::error::[preflight] Missing required publish secrets: ${missing.join(', ')}`);
        process.exit(1);
    }

    const routes = [];
    if (hasEnglish) routes.push('EN(devto+hashnode)');
    if (hasKorean) routes.push('KO(blogger)');
    console.log(`[preflight] Secret validation passed for routes: ${routes.join(', ')}`);
}

main();
