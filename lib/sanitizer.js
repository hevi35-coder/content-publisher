/**
 * Sanitizer - Remove AI-like patterns from content
 * 
 * Cleans up AI-generated content markers:
 * - Excessive emojis
 * - Markdown bold (**text**) that shouldn't be exposed
 * - Overly enthusiastic expressions
 */

// Emojis commonly overused by AI
const AI_EMOJIS = ['🚀', '🎯', '👉', '🎉', '✨', '💡', '🔥', '💪', '⭐', '🌟', '📢', '📣', '🏆', '🙌'];

/**
 * Remove AI-style patterns from content
 * @param {string} content - Raw content
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized content
 */
function sanitize(content, options = {}) {
    let sanitized = content;

    // 1. Remove AI emojis (keep functional ones like ✅, ❌)
    if (options.removeEmojis !== false) {
        AI_EMOJIS.forEach(emoji => {
            sanitized = sanitized.replace(new RegExp(emoji, 'g'), '');
        });
        // Clean up leftover whitespace from emoji removal
        sanitized = sanitized.replace(/^\s+$/gm, '');
    }

    // 2. Convert **bold text** to plain text (for platforms that render raw markdown)
    if (options.removeBold !== false) {
        // Preserve bold in headings, only remove inline bold
        sanitized = sanitized.replace(/\*\*([^*\n]+)\*\*/g, '$1');
    }

    // 3. Remove excessive punctuation (!!!, ???)
    if (options.cleanPunctuation !== false) {
        sanitized = sanitized.replace(/!{2,}/g, '!');
        sanitized = sanitized.replace(/\?{2,}/g, '?');
    }

    // 4. Clean up multiple empty lines
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    // 5. Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
}

/**
 * Sanitize for HTML content (post-markdown conversion)
 */
function sanitizeHtml(html, options = {}) {
    let sanitized = html;

    // Remove emojis from HTML
    if (options.removeEmojis !== false) {
        AI_EMOJIS.forEach(emoji => {
            sanitized = sanitized.replace(new RegExp(emoji, 'g'), '');
        });
    }

    // Remove empty paragraphs
    sanitized = sanitized.replace(/<p>\s*<\/p>/g, '');

    return sanitized;
}

module.exports = { sanitize, sanitizeHtml, AI_EMOJIS };
