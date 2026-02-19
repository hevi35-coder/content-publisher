/**
 * Publish Quality Gate - Validates post-adaptation content before API publish.
 *
 * Scope:
 * - Runs on per-platform adapted body (HTML/Markdown) right before publish.
 * - Focuses on structural/safety checks, not SEO scoring.
 */

const { AI_EMOJIS } = require('./sanitizer');
const { containsEditorialNotes } = require('./draft-cleaner');

/**
 * Validate adapted publish content.
 * @param {string} content - HTML or Markdown content.
 * @param {string} title - Article title.
 * @returns {{ passed: boolean, issues: string[], score: number }}
 */
function validateContent(content, title) {
    const issues = [];
    let score = 100;
    const body = String(content || '');
    const safeTitle = String(title || '');

    // 1. Check for AI emojis
    for (const emoji of AI_EMOJIS) {
        if (body.includes(emoji)) {
            issues.push(`AI emoji found: ${emoji}`);
            score -= 5;
        }
    }

    // 2. Check for markdown bold leakage in HTML path
    if (/\*\*[^*]+\*\*/.test(body)) {
        issues.push('Unconverted bold markdown found');
        score -= 10;
    }

    // 3. Check for excessive punctuation
    if (/!{2,}/.test(body)) {
        issues.push('Excessive exclamation marks');
        score -= 5;
    }

    // 4. Check for minimum meaningful content size
    if (body.trim().length < 100) {
        issues.push('Content too short');
        score -= 30;
    }

    // 5. Check for broken image references
    if (/<img[^>]*src=["'][^"']*undefined[^"']*["']/.test(body)) {
        issues.push('Broken image reference');
        score -= 20;
    }

    // 6. Check title length
    if (safeTitle.length > 100) {
        issues.push('Title too long (>100 chars)');
        score -= 5;
    }

    // 7. Block leaked editorial notes from generation/fact-check stage
    if (containsEditorialNotes(body) || /<h[1-6][^>]*>\s*changes made\s*:?\s*<\/h[1-6]>/i.test(body)) {
        issues.push('Editorial notes leak detected (e.g., "Changes Made")');
        score -= 30;
    }

    return {
        passed: issues.length === 0,
        issues,
        score: Math.max(0, score)
    };
}

/**
 * Full quality check with logging.
 */
function runQualityGate(content, title) {
    const result = validateContent(content, title);

    if (result.passed) {
        console.log(`[QualityGate:publish] ✅ Passed (Score: ${result.score}/100)`);
    } else {
        console.log(`[QualityGate:publish] ⚠️ Issues found (Score: ${result.score}/100):`);
        result.issues.forEach((issue) => console.log(`   - ${issue}`));
    }

    return result;
}

module.exports = { validateContent, runQualityGate };
