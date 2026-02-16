const path = require('path');

const SUPPORTED_PLATFORMS = Object.freeze(['devto', 'hashnode', 'blogger']);

function normalizePlatforms(platforms) {
    if (!Array.isArray(platforms)) return [];
    return [...new Set(
        platforms
            .map((platform) => String(platform || '').trim().toLowerCase())
            .filter(Boolean)
    )];
}

function isKoreanDraftPath(draftPath) {
    const filename = path.basename(String(draftPath || '')).toLowerCase();
    return filename.endsWith('-ko.md');
}

function getDefaultPlatformsFromDraftPath(draftPath) {
    return isKoreanDraftPath(draftPath) ? ['blogger'] : ['devto', 'hashnode'];
}

function parsePlatformArg(platformArg) {
    if (!platformArg) return null;
    const parsed = normalizePlatforms(platformArg.split(','));
    return parsed.length > 0 ? parsed : null;
}

function getUnsupportedPlatforms(platforms) {
    return normalizePlatforms(platforms).filter((platform) => !SUPPORTED_PLATFORMS.includes(platform));
}

function assertSupportedPlatforms(platforms) {
    const unsupported = getUnsupportedPlatforms(platforms);
    if (unsupported.length > 0) {
        throw new Error(
            `Unsupported platforms: ${unsupported.join(', ')}. Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`
        );
    }
}

module.exports = {
    SUPPORTED_PLATFORMS,
    normalizePlatforms,
    isKoreanDraftPath,
    getDefaultPlatformsFromDraftPath,
    parsePlatformArg,
    getUnsupportedPlatforms,
    assertSupportedPlatforms
};
