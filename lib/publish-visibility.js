function shouldForcePublish() {
    // Safe default: explicit publish flows should post publicly unless FORCE_PUBLISH=false is set.
    return process.env.FORCE_PUBLISH !== 'false';
}

function resolveDevtoPublished(rawFrontmatter = {}) {
    if (shouldForcePublish()) return true;
    if (rawFrontmatter.published === undefined) return true;
    return rawFrontmatter.published === true;
}

function resolveBloggerIsDraft(rawFrontmatter = {}) {
    if (shouldForcePublish()) return false;
    return rawFrontmatter.published === false;
}

module.exports = {
    shouldForcePublish,
    resolveDevtoPublished,
    resolveBloggerIsDraft
};
