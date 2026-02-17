function shouldVerifyPublishedUrls() {
    if (process.env.DRY_RUN === 'true') return false;
    return process.env.VERIFY_PUBLISHED_URLS !== 'false';
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
    verifyPublishedUrl
};
