/**
 * Quality Gate - Validates content before publishing
 * 
 * Checks for AI patterns, formatting issues, and content quality.
 */

const { AI_EMOJIS } = require('./sanitizer');

/**
 * Validate content quality
 * @param {string} content - HTML or Markdown content
 * @param {string} title - Article title
 * @returns {{ passed: boolean, issues: string[], score: number }}
 */
function validateContent(content, title) {
    const issues = [];
    let score = 100;

    // Check for AI emojis
    for (const emoji of AI_EMOJIS) {
        if (content.includes(emoji)) {
            issues.push(`AI emoji found: ${emoji}`);
            score -= 5;
        }
    }

    // Check for bold markdown in HTML (should have been converted)
    if (/\*\*[^*]+\*\*/.test(content)) {
        issues.push('Unconverted bold markdown found');
        score -= 10;
    }

    // Check for excessive exclamation marks
    if (/!{2,}/.test(content)) {
        issues.push('Excessive exclamation marks');
        score -= 5;
    }

    // Check for empty content
    if (content.trim().length < 100) {
        issues.push('Content too short');
        score -= 30;
    }

    // Check for broken image references
    if (/<img[^>]*src=["'][^"']*undefined[^"']*["']/.test(content)) {
        issues.push('Broken image reference');
        score -= 20;
    }

    // Check title length
    if (title.length > 100) {
        issues.push('Title too long (>100 chars)');
        score -= 5;
    }

    return {
        passed: issues.length === 0,
        issues,
        score: Math.max(0, score)
    };
}

/**
 * Full quality check with logging
 */
function runQualityGate(content, title) {
    const result = validateContent(content, title);

    if (result.passed) {
        console.log(`[QualityGate] ✅ Passed (Score: ${result.score}/100)`);
    } else {
        console.log(`[QualityGate] ⚠️ Issues found (Score: ${result.score}/100):`);
        result.issues.forEach(issue => console.log(`   - ${issue}`));
    }

    return result;
}

module.exports = { validateContent, runQualityGate };
