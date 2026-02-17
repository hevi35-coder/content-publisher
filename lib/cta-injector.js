/**
 * CTA Injector - Guarantees Call-to-Action in every draft
 * 
 * Forcefully injects channel-specific CTA at the end of drafts.
 * This bypasses AI prompt reliability issues.
 */

const fs = require('fs');
const matter = require('gray-matter');

// App Store links (update with actual IDs)
const APP_LINKS = {
    appStore: {
        en: 'https://apps.apple.com/app/mandaact/id6756198473',
        ko: 'https://apps.apple.com/kr/app/mandaact/id6756198473'
    },
    website: 'https://mandaact.vercel.app'
};

/**
 * CTA templates per channel
 * Uses placeholders: {{appStoreUrl}}, {{websiteUrl}}
 */
const CTA_TEMPLATES = {
    devto: `
---

## 🚀 Ready to Try It?

MandaAct helps you break down big goals into actionable 9x9 grids. Stop drowning in endless to-do lists.

👉 **[Download MandaAct on the App Store]({{appStoreUrl}})**

*Available on iOS, iPadOS, and macOS.*
`,

    hashnode: `
---

## Try MandaAct

Transform your goals into actionable plans with the 9x9 Mandalart framework.

[Download on App Store]({{appStoreUrl}}) | [Learn More]({{websiteUrl}})
`,

    blogger_kr: `
<div style="margin: 30px 0; border-top: 1px solid #e0e0e0;"></div>

<h2>MandaAct 시작하기</h2>

<p>목표를 9x9 그리드로 시각화하고, 매일 실천 가능한 액션으로 분해하세요.</p>

<p>
  <a href="https://apps.apple.com/app/id6756198473" target="_blank" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
    App Store에서 다운로드
  </a>
</p>
<p style="font-size:12px;color:#999;word-break:break-all;">링크: https://apps.apple.com/app/id6756198473</p>

<p><small>iOS, iPadOS, macOS에서 사용 가능합니다.</small></p>
`
};

/**
 * Get resolved CTA for a channel
 * @param {string} channel - devto, hashnode, blogger_kr
 * @param {string} lang - en or ko
 * @returns {string} Resolved CTA block
 */
function getCTA(channel, lang = 'en') {
    const template = CTA_TEMPLATES[channel];
    if (!template) {
        console.warn(`[CTA] No template for channel: ${channel}`);
        return '';
    }

    const appStoreUrl = lang === 'ko' ? APP_LINKS.appStore.ko : APP_LINKS.appStore.en;

    return template
        .replace(/\{\{appStoreUrl\}\}/g, appStoreUrl)
        .replace(/\{\{websiteUrl\}\}/g, APP_LINKS.website);
}

/**
 * Check if content already has a CTA section
 * @param {string} content - Markdown content
 * @returns {boolean}
 */
function hasCTA(content) {
    const ctaPatterns = [
        /app store/i,
        /download.*mandaact/i,
        /다운로드/,
        /앱스토어/,
        /apps\.apple\.com/i
    ];

    return ctaPatterns.some(pattern => pattern.test(content));
}

/**
 * Inject CTA into draft content
 * @param {string} content - Full markdown content (with frontmatter)
 * @param {string} channel - Target channel
 * @param {object} options - { force: boolean, lang: string }
 * @returns {string} Content with CTA injected
 */
function injectCTA(content, channel, options = {}) {
    const { force = false, lang = 'en' } = options;
    const { data: frontmatter, content: body } = matter(content);

    // Check if CTA already exists
    if (!force && hasCTA(body)) {
        console.log(`[CTA] Already present, skipping injection for ${channel}`);
        return content;
    }

    // Get channel-specific CTA
    const cta = getCTA(channel, lang);

    // Append CTA to body
    const newBody = body.trim() + '\n' + cta;

    // Reconstruct with frontmatter
    const result = matter.stringify(newBody, frontmatter);

    console.log(`[CTA] Injected for ${channel} (${lang})`);
    return result;
}

/**
 * Inject CTA into a draft file
 * @param {string} filePath - Path to draft file
 * @param {string} channel - Target channel
 * @param {object} options - { force: boolean, lang: string }
 */
function injectCTAToFile(filePath, channel, options = {}) {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = injectCTA(content, channel, options);
    fs.writeFileSync(filePath, result, 'utf8');
    console.log(`[CTA] Updated: ${filePath}`);
}

/**
 * Detect channel from filename
 * @param {string} filename - Draft filename
 * @returns {{ channel: string, lang: string }}
 */
function detectChannelFromFilename(filename) {
    if (filename.includes('-ko.md')) {
        return { channel: 'blogger_kr', lang: 'ko' };
    }
    // Default to devto for English drafts
    return { channel: 'devto', lang: 'en' };
}

module.exports = {
    APP_LINKS,
    CTA_TEMPLATES,
    getCTA,
    hasCTA,
    injectCTA,
    injectCTAToFile,
    detectChannelFromFilename
};
