/**
 * Quality Gate - SEO, Readability, and Content Quality Checker
 * 
 * Checks:
 * 1. SEO: Title length (50-60 chars optimal), description presence
 * 2. Readability: Flesch-Kincaid Grade Level (target: 8-12 for developers)
 * 3. Content: Word count (1500-3000 optimal for Dev.to)
 * 4. Images: At least 1 image required
 */

const fs = require('fs');
const matter = require('gray-matter');

/**
 * Calculate Flesch-Kincaid Grade Level
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 */
function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;

    // Count vowel groups
    const vowels = 'aeiouy';
    let count = 0;
    let prevIsVowel = false;

    for (let char of word) {
        const isVowel = vowels.includes(char);
        if (isVowel && !prevIsVowel) count++;
        prevIsVowel = isVowel;
    }

    // Adjust for silent e
    if (word.endsWith('e')) count--;
    // Adjust for -le ending
    if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) count++;

    return Math.max(1, count);
}

function calculateReadability(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.match(/[a-zA-Z]/));

    if (sentences.length === 0 || words.length === 0) {
        return { grade: 0, score: 0 };
    }

    const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = totalSyllables / words.length;

    // Flesch-Kincaid Grade Level
    const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

    // Flesch Reading Ease (for reference)
    const readingEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return {
        grade: Math.round(grade * 10) / 10,
        readingEase: Math.round(readingEase * 10) / 10,
        sentences: sentences.length,
        words: words.length,
        syllables: totalSyllables
    };
}

/**
 * Main Quality Check Function
 * @param {string} filePath - Path to the markdown file
 * @returns {object} Quality report with score and recommendations
 */
function checkQuality(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content } = matter(fileContent);

    const report = {
        score: 100,
        checks: [],
        passed: true
    };

    // 1. SEO: Title Length (50-60 chars optimal)
    const title = frontmatter.title || '';
    const titleLength = title.length;
    if (titleLength < 30) {
        report.checks.push({ name: 'Title Length', status: '⚠️', message: `Too short (${titleLength} chars). Aim for 50-60.`, penalty: 10 });
        report.score -= 10;
    } else if (titleLength > 70) {
        report.checks.push({ name: 'Title Length', status: '⚠️', message: `Too long (${titleLength} chars). May be truncated in search.`, penalty: 5 });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Title Length', status: '✅', message: `Good (${titleLength} chars)`, penalty: 0 });
    }

    // 2. SEO: Tags
    const tags = frontmatter.tags || [];
    if (tags.length < 3) {
        report.checks.push({ name: 'Tags', status: '⚠️', message: `Only ${tags.length} tags. Use 3-5 for better discovery.`, penalty: 5 });
        report.score -= 5;
    } else if (tags.length > 5) {
        report.checks.push({ name: 'Tags', status: '⚠️', message: `${tags.length} tags. Dev.to allows max 4.`, penalty: 5 });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Tags', status: '✅', message: `${tags.length} tags`, penalty: 0 });
    }

    // 3. Readability
    const readability = calculateReadability(content);
    if (readability.grade < 6) {
        report.checks.push({ name: 'Readability', status: '⚠️', message: `Grade ${readability.grade} - Too simple for technical audience.`, penalty: 10 });
        report.score -= 10;
    } else if (readability.grade > 14) {
        report.checks.push({ name: 'Readability', status: '⚠️', message: `Grade ${readability.grade} - Too complex. Simplify sentences.`, penalty: 10 });
        report.score -= 10;
    } else {
        report.checks.push({ name: 'Readability', status: '✅', message: `Grade ${readability.grade} (Good for developers)`, penalty: 0 });
    }

    // 4. Content Length
    const wordCount = readability.words;
    if (wordCount < 800) {
        report.checks.push({ name: 'Word Count', status: '⚠️', message: `${wordCount} words. Too short. Aim for 1500+.`, penalty: 15 });
        report.score -= 15;
    } else if (wordCount < 1500) {
        report.checks.push({ name: 'Word Count', status: '⚠️', message: `${wordCount} words. Slightly short for engagement.`, penalty: 5 });
        report.score -= 5;
    } else if (wordCount > 4000) {
        report.checks.push({ name: 'Word Count', status: '⚠️', message: `${wordCount} words. Consider splitting into series.`, penalty: 5 });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Word Count', status: '✅', message: `${wordCount} words`, penalty: 0 });
    }

    // 5. Images
    const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];
    const coverImage = frontmatter.cover_image;
    const totalImages = imageMatches.length + (coverImage ? 1 : 0);

    if (totalImages === 0) {
        report.checks.push({ name: 'Images', status: '❌', message: 'No images. Add at least 1 for engagement.', penalty: 15 });
        report.score -= 15;
    } else if (totalImages === 1 && coverImage) {
        report.checks.push({ name: 'Images', status: '⚠️', message: 'Only cover image. Add inline images.', penalty: 5 });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Images', status: '✅', message: `${totalImages} images`, penalty: 0 });
    }

    // 6. Call to Action
    const hasCallToAction = content.toLowerCase().includes('download') ||
        content.toLowerCase().includes('try it') ||
        content.toLowerCase().includes('get started') ||
        content.toLowerCase().includes('app store');
    if (!hasCallToAction) {
        report.checks.push({ name: 'Call to Action', status: '⚠️', message: 'No clear CTA detected.', penalty: 10 });
        report.score -= 10;
    } else {
        report.checks.push({ name: 'Call to Action', status: '✅', message: 'CTA detected', penalty: 0 });
    }

    // Final assessment
    report.passed = report.score >= 70;
    report.grade = report.score >= 90 ? 'A' : report.score >= 80 ? 'B' : report.score >= 70 ? 'C' : report.score >= 60 ? 'D' : 'F';

    return report;
}

/**
 * Print quality report to console
 */
function printReport(report) {
    console.log('\n📊 ═══════════════════════════════════════════');
    console.log('   QUALITY GATE REPORT');
    console.log('═══════════════════════════════════════════════\n');

    for (const check of report.checks) {
        console.log(`   ${check.status} ${check.name}: ${check.message}`);
    }

    console.log('\n───────────────────────────────────────────────');
    console.log(`   📈 Final Score: ${report.score}/100 (Grade: ${report.grade})`);
    console.log(`   ${report.passed ? '✅ PASSED' : '❌ FAILED'} - ${report.passed ? 'Ready to publish' : 'Needs improvement'}`);
    console.log('═══════════════════════════════════════════════\n');

    return report;
}

// CLI support
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node quality_gate.js <path-to-draft.md>');
        process.exit(1);
    }

    const report = checkQuality(args[0]);
    printReport(report);

    process.exit(report.passed ? 0 : 1);
}

module.exports = { checkQuality, printReport, calculateReadability };
