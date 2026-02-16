/**
 * Platform Adapter - Content formatting for each platform
 * 
 * v2: Translation removed (native generation handles language)
 * Now handles only format conversion and platform-specific adjustments.
 */

const matter = require('gray-matter');

let markedLoader = null;

async function getMarked() {
    if (!markedLoader) {
        markedLoader = import('marked').then((mod) => mod.marked || mod.default || mod);
    }
    return markedLoader;
}

/**
 * Parse markdown file and separate frontmatter from content
 */
function parseMarkdownContent(rawContent) {
    const { data, content } = matter(rawContent);
    return {
        frontmatter: data,
        content: content.trim()
    };
}

/**
 * Convert markdown to clean HTML using marked
 */
async function markdownToHtml(markdown) {
    const marked = await getMarked();
    marked.setOptions({
        gfm: true,
        breaks: true
    });
    return marked.parse(markdown);
}

/**
 * Adapt content for a specific platform
 * 
 * @param {object} article - Article object with title, content, tags, coverImage
 * @param {string} platform - Target platform: devto, hashnode, blogger
 * @param {object} options - Additional options (e.g., draftType)
 */
async function adaptForPlatform(article, platform, options = {}) {
    let adapted = { ...article };

    switch (platform) {
        case 'blogger':
            // For blogger, we expect a *-ko.md draft (already in Korean)
            // Just convert markdown to HTML

            // Convert markdown to HTML
            adapted.content = await markdownToHtml(adapted.content);

            // Sanitize: remove any remaining AI patterns
            const { sanitizeHtml } = require('./sanitizer');
            adapted.content = sanitizeHtml(adapted.content);

            // Quality gate: validate content
            const { validateContent } = require('./quality-gate');
            const validation = validateContent(adapted.content, adapted.title);
            if (!validation.passed) {
                console.warn(`[QualityGate] Issues found: ${validation.issues.join(', ')}`);
            }

            // Prepend cover image to content if exists
            if (adapted.coverImage) {
                adapted.content = `<img src="${adapted.coverImage}" alt="${adapted.title}" style="width:100%;max-width:1000px;margin-bottom:20px;">\n\n${adapted.content}`;
            }

            console.log(`[Adapt] Blogger: Markdown → HTML conversion complete`);
            break;

        case 'hashnode':
            // Keep English, adjust tags format
            adapted.tags = article.tags?.slice(0, 5);
            console.log(`[Adapt] Hashnode: Tags limited to 5`);
            break;

        case 'devto':
            // Keep English, ensure tags are lowercase
            adapted.tags = article.tags?.map(t => t.toLowerCase().replace(/\s+/g, ''));
            console.log(`[Adapt] Dev.to: Tags normalized`);
            break;

        default:
            break;
    }

    return adapted;
}

/**
 * Detect if draft is Korean version
 * @param {string} filename - Draft filename
 * @returns {boolean} True if Korean draft
 */
function isKoreanDraft(filename) {
    return filename.includes('-ko.md') || filename.endsWith('-ko.md');
}

/**
 * Get appropriate draft for platform
 * @param {string} basePath - Base draft path (without -ko suffix)
 * @param {string} platform - Target platform
 * @returns {string} Appropriate draft path
 */
function getDraftPathForPlatform(basePath, platform) {
    if (platform === 'blogger') {
        // For blogger, use Korean draft
        const koPath = basePath.replace('.md', '-ko.md');
        const fs = require('fs');
        if (fs.existsSync(koPath)) {
            console.log(`[Router] Using Korean draft for Blogger: ${koPath}`);
            return koPath;
        } else {
            console.warn(`[Router] Korean draft not found, falling back to EN: ${basePath}`);
            return basePath;
        }
    }
    // For devto and hashnode, use English draft
    return basePath;
}

module.exports = {
    adaptForPlatform,
    parseMarkdownContent,
    markdownToHtml,
    isKoreanDraft,
    getDraftPathForPlatform
};
