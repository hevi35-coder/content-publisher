function normalizeTitleKey(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function slugifyTitle(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

function getNumericSuffixDepth(slug) {
    const suffixMatch = String(slug || '').match(/(?:-\d+)+$/);
    if (!suffixMatch) {
        return 0;
    }
    return suffixMatch[0]
        .split('-')
        .filter(Boolean)
        .length;
}

function parseTimestamp(value) {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) {
        return Number.POSITIVE_INFINITY;
    }
    return parsed.getTime();
}

function compareCanonicalCandidate(a, b, preferredSlug) {
    const aSlug = String(a && a.slug ? a.slug : '').toLowerCase();
    const bSlug = String(b && b.slug ? b.slug : '').toLowerCase();

    const aExact = preferredSlug && aSlug === preferredSlug ? 1 : 0;
    const bExact = preferredSlug && bSlug === preferredSlug ? 1 : 0;
    if (aExact !== bExact) {
        return bExact - aExact;
    }

    const aSuffixDepth = getNumericSuffixDepth(aSlug);
    const bSuffixDepth = getNumericSuffixDepth(bSlug);
    if (aSuffixDepth !== bSuffixDepth) {
        return aSuffixDepth - bSuffixDepth;
    }

    const aPublished = parseTimestamp(a && a.publishedAt);
    const bPublished = parseTimestamp(b && b.publishedAt);
    if (aPublished !== bPublished) {
        return aPublished - bPublished;
    }

    return String(a && a.id ? a.id : '').localeCompare(String(b && b.id ? b.id : ''));
}

function buildDedupePlan(posts, title) {
    const normalizedTitle = normalizeTitleKey(title);
    const candidates = (Array.isArray(posts) ? posts : [])
        .filter((post) => normalizeTitleKey(post && post.title) === normalizedTitle);

    if (candidates.length <= 1) {
        return {
            normalizedTitle,
            keep: candidates[0] || null,
            remove: [],
            duplicates: Math.max(0, candidates.length - 1)
        };
    }

    const preferredSlug = slugifyTitle(title);
    const sorted = [...candidates].sort((a, b) => compareCanonicalCandidate(a, b, preferredSlug));

    return {
        normalizedTitle,
        keep: sorted[0],
        remove: sorted.slice(1),
        duplicates: sorted.length - 1
    };
}

module.exports = {
    normalizeTitleKey,
    slugifyTitle,
    getNumericSuffixDepth,
    buildDedupePlan
};
