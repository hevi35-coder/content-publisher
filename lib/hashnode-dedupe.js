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

function parseTimestampMs(value) {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.getTime();
}

function parseTimestampForSort(value) {
    const timestamp = parseTimestampMs(value);
    if (timestamp === null) {
        return Number.POSITIVE_INFINITY;
    }
    return timestamp;
}

function parsePositiveNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function resolveNowMs(now) {
    if (now instanceof Date && !Number.isNaN(now.getTime())) {
        return now.getTime();
    }
    const parsed = new Date(now || Date.now());
    if (Number.isNaN(parsed.getTime())) {
        return Date.now();
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

    const aPublished = parseTimestampForSort(a && a.publishedAt);
    const bPublished = parseTimestampForSort(b && b.publishedAt);
    if (aPublished !== bPublished) {
        return aPublished - bPublished;
    }

    return String(a && a.id ? a.id : '').localeCompare(String(b && b.id ? b.id : ''));
}

function buildDedupePlan(posts, title, options = {}) {
    const normalizedTitle = normalizeTitleKey(title);
    const allCandidates = (Array.isArray(posts) ? posts : [])
        .filter((post) => normalizeTitleKey(post && post.title) === normalizedTitle);

    const safeMode = options && options.safeMode === true;
    const maxAgeHours = parsePositiveNumber(options && options.maxAgeHours, 12);
    const nowMs = resolveNowMs(options && options.now);
    const windowStartMs = nowMs - maxAgeHours * 60 * 60 * 1000;

    const candidates = safeMode
        ? allCandidates.filter((post) => {
            const publishedMs = parseTimestampMs(post && post.publishedAt);
            return publishedMs !== null && publishedMs >= windowStartMs;
        })
        : allCandidates;

    if (candidates.length <= 1) {
        const reason = safeMode && allCandidates.length > 1
            ? 'SAFE_MODE_NO_RECENT_DUPLICATES'
            : 'NO_DUPLICATES';
        return {
            normalizedTitle,
            safeMode,
            reason,
            totalMatches: allCandidates.length,
            recentMatches: candidates.length,
            keep: candidates[0] || null,
            remove: [],
            duplicates: Math.max(0, candidates.length - 1)
        };
    }

    const preferredSlug = slugifyTitle(title);
    const sorted = [...candidates].sort((a, b) => compareCanonicalCandidate(a, b, preferredSlug));
    const keep = sorted[0];
    let remove = sorted.slice(1);
    let reason = 'DUPLICATES_FOUND';

    if (safeMode) {
        const keepSuffixDepth = getNumericSuffixDepth(keep && keep.slug);
        if (keepSuffixDepth > 0) {
            return {
                normalizedTitle,
                safeMode,
                reason: 'SAFE_MODE_BASE_SLUG_MISSING',
                totalMatches: allCandidates.length,
                recentMatches: sorted.length,
                keep,
                remove: [],
                duplicates: sorted.length - 1
            };
        }

        const hasNonSuffixDuplicate = remove.some(
            (post) => getNumericSuffixDepth(post && post.slug) === 0
        );
        if (hasNonSuffixDuplicate) {
            return {
                normalizedTitle,
                safeMode,
                reason: 'SAFE_MODE_NON_SUFFIX_DUPLICATES',
                totalMatches: allCandidates.length,
                recentMatches: sorted.length,
                keep,
                remove: [],
                duplicates: sorted.length - 1
            };
        }

        remove = remove.filter((post) => getNumericSuffixDepth(post && post.slug) > 0);
        reason = remove.length > 0 ? 'SAFE_MODE_SUFFIX_DUPLICATES' : 'SAFE_MODE_NO_SUFFIX_DUPLICATES';
    }

    return {
        normalizedTitle,
        safeMode,
        reason,
        totalMatches: allCandidates.length,
        recentMatches: sorted.length,
        keep,
        remove,
        duplicates: sorted.length - 1
    };
}

module.exports = {
    normalizeTitleKey,
    slugifyTitle,
    getNumericSuffixDepth,
    buildDedupePlan
};
