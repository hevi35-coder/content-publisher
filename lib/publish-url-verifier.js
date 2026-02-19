function shouldVerifyPublishedUrls() {
    if (process.env.DRY_RUN === 'true') return false;
    return process.env.VERIFY_PUBLISHED_URLS !== 'false';
}

function shouldVerifyUrlForPlatform(platform, url) {
    const normalizedPlatform = String(platform || '').toLowerCase();
    const targetUrl = String(url || '');

    // Hashnode frequently returns non-2xx to CI bots even when the post exists.
    // Verifying by public URL causes false negatives and duplicate publishes on retries.
    if (normalizedPlatform === 'hashnode') {
        return String(process.env.VERIFY_HASHNODE_URLS || '').toLowerCase() === 'true';
    }

    if (!targetUrl.startsWith('http')) {
        return false;
    }

    return true;
}

async function verifyPublishedUrl(url, options = {}) {
    const {
        fetchImpl = fetch,
        timeoutMs = 15000
    } = options;

    if (!url || !url.startsWith('http')) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal
        });
        return response.status >= 200 && response.status < 400;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    shouldVerifyPublishedUrls,
    shouldVerifyUrlForPlatform,
    verifyPublishedUrl
};
