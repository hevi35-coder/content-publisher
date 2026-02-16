/**
 * Quality Gate - SEO, readability, and content quality checker.
 *
 * Notes:
 * - Readability grade (Flesch-Kincaid) is only valid for English.
 * - Korean content uses language-aware word counting and skips English readability grading.
 */

const fs = require('fs');
const matter = require('gray-matter');
const { getProfile } = require('./lib/tone-profiles');

function stripMarkdown(text) {
    return String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/[>#*_~\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectContentLanguage(content, filePath = '') {
    const filename = String(filePath || '').toLowerCase();
    if (filename.endsWith('-ko.md')) return 'ko';

    const source = String(content || '');
    const hangulChars = (source.match(/[가-힣]/g) || []).length;
    const latinChars = (source.match(/[a-z]/gi) || []).length;

    if (hangulChars > 0 && hangulChars >= latinChars) {
        return 'ko';
    }

    return 'en';
}

function countWords(content, language = 'en') {
    const cleaned = stripMarkdown(content);
    if (!cleaned) return 0;

    if (language === 'ko') {
        return (cleaned.match(/[가-힣a-z0-9]+/gi) || []).length;
    }

    return cleaned
        .split(/\s+/)
        .filter((word) => /[a-z]/i.test(word))
        .length;
}

/**
 * Calculate Flesch-Kincaid Grade Level for English text.
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 */
function countSyllables(word) {
    const normalized = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.length <= 3) return 1;

    const vowels = 'aeiouy';
    let count = 0;
    let prevIsVowel = false;

    for (const char of normalized) {
        const isVowel = vowels.includes(char);
        if (isVowel && !prevIsVowel) count++;
        prevIsVowel = isVowel;
    }

    if (normalized.endsWith('e')) count--;
    if (
        normalized.endsWith('le') &&
        normalized.length > 2 &&
        !vowels.includes(normalized[normalized.length - 3])
    ) {
        count++;
    }

    return Math.max(1, count);
}

function calculateReadability(text, language = 'en') {
    const normalizedLanguage = language === 'ko' ? 'ko' : 'en';
    const cleaned = stripMarkdown(text);
    const sentences = cleaned.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0);
    const words = countWords(cleaned, normalizedLanguage);

    if (normalizedLanguage === 'ko') {
        return {
            supported: false,
            grade: null,
            readingEase: null,
            sentences: sentences.length,
            words,
            syllables: null
        };
    }

    const englishWords = cleaned.split(/\s+/).filter((w) => w.match(/[a-zA-Z]/));
    if (sentences.length === 0 || englishWords.length === 0) {
        return {
            supported: true,
            grade: 0,
            readingEase: 0,
            sentences: sentences.length,
            words,
            syllables: 0
        };
    }

    const totalSyllables = englishWords.reduce((sum, word) => sum + countSyllables(word), 0);
    const avgWordsPerSentence = englishWords.length / sentences.length;
    const avgSyllablesPerWord = totalSyllables / englishWords.length;

    const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
    const readingEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return {
        supported: true,
        grade: Math.round(grade * 10) / 10,
        readingEase: Math.round(readingEase * 10) / 10,
        sentences: sentences.length,
        words,
        syllables: totalSyllables
    };
}

function resolveProfile(profileId, language) {
    const fallbackProfileId = language === 'ko' ? 'blogger_kr' : 'devto';
    const resolvedProfileId = profileId || fallbackProfileId;

    try {
        return getProfile(resolvedProfileId);
    } catch (_error) {
        return getProfile(fallbackProfileId);
    }
}

function getWordCountPolicy(language) {
    if (language === 'ko') {
        return {
            tooShort: 450,
            slightlyShort: 800,
            tooLong: 3200,
            recommendedMin: 800
        };
    }

    return {
        tooShort: 800,
        slightlyShort: 1500,
        tooLong: 4000,
        recommendedMin: 1500
    };
}

/**
 * Main quality check function.
 * @param {string} filePath - Path to the markdown file
 * @param {object} options
 * @param {string} [options.profileId] - Optional tone profile id (devto, hashnode, blogger_kr)
 * @returns {object} Quality report with score and recommendations
 */
function checkQuality(filePath, options = {}) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content } = matter(fileContent);

    const language = detectContentLanguage(content, filePath);
    const profile = resolveProfile(options.profileId || frontmatter.profile, language);
    const wordPolicy = getWordCountPolicy(language);

    const report = {
        score: 100,
        checks: [],
        passed: true,
        language,
        profileId: profile.id
    };

    // 1. SEO: Title Length (channel-aware max)
    const title = frontmatter.title || '';
    const titleLength = title.length;
    const titleMaxLength = profile.seo?.titleMaxLength || (language === 'ko' ? 50 : 60);
    if (titleLength < 30) {
        report.checks.push({
            name: 'Title Length',
            status: '⚠️',
            message: `Too short (${titleLength} chars). Aim for 50-60.`,
            penalty: 10
        });
        report.score -= 10;
    } else if (titleLength > titleMaxLength + 10) {
        report.checks.push({
            name: 'Title Length',
            status: '⚠️',
            message: `Too long (${titleLength} chars). ${profile.id} target is <= ${titleMaxLength}.`,
            penalty: 5
        });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Title Length', status: '✅', message: `Good (${titleLength} chars)`, penalty: 0 });
    }

    // 2. SEO: Tags (channel-aware max)
    const tags = frontmatter.tags || [];
    const minTags = language === 'ko' ? 2 : 3;
    const maxTags = profile.seo?.tagsCount || (language === 'ko' ? 10 : 4);
    if (tags.length < minTags) {
        report.checks.push({
            name: 'Tags',
            status: '⚠️',
            message: `Only ${tags.length} tags. Use ${minTags}-${maxTags} for better discovery.`,
            penalty: 5
        });
        report.score -= 5;
    } else if (tags.length > maxTags) {
        report.checks.push({
            name: 'Tags',
            status: '⚠️',
            message: `${tags.length} tags. ${profile.id} allows max ${maxTags}.`,
            penalty: 5
        });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Tags', status: '✅', message: `${tags.length} tags`, penalty: 0 });
    }

    // 3. Readability
    const readability = calculateReadability(content, language);
    if (!readability.supported) {
        report.checks.push({
            name: 'Readability',
            status: 'ℹ️',
            message: 'Skipped for Korean content (English-only metric).',
            penalty: 0
        });
    } else if (readability.grade < 6) {
        report.checks.push({
            name: 'Readability',
            status: '⚠️',
            message: `Grade ${readability.grade} - Too simple for technical audience.`,
            penalty: 10
        });
        report.score -= 10;
    } else if (readability.grade > 14) {
        report.checks.push({
            name: 'Readability',
            status: '⚠️',
            message: `Grade ${readability.grade} - Too complex. Simplify sentences.`,
            penalty: 10
        });
        report.score -= 10;
    } else {
        report.checks.push({
            name: 'Readability',
            status: '✅',
            message: `Grade ${readability.grade} (Good for developers)`,
            penalty: 0
        });
    }

    // 4. Content Length (language-aware)
    const wordCount = readability.words;
    if (wordCount < wordPolicy.tooShort) {
        report.checks.push({
            name: 'Word Count',
            status: '⚠️',
            message: `${wordCount} words. Too short. Aim for ${wordPolicy.recommendedMin}+.`,
            penalty: 15
        });
        report.score -= 15;
    } else if (wordCount < wordPolicy.slightlyShort) {
        report.checks.push({
            name: 'Word Count',
            status: '⚠️',
            message: `${wordCount} words. Slightly short for engagement.`,
            penalty: 5
        });
        report.score -= 5;
    } else if (wordCount > wordPolicy.tooLong) {
        report.checks.push({
            name: 'Word Count',
            status: '⚠️',
            message: `${wordCount} words. Consider splitting into series.`,
            penalty: 5
        });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Word Count', status: '✅', message: `${wordCount} words`, penalty: 0 });
    }

    // 5. Images
    const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];
    const coverImage = frontmatter.cover_image;
    const totalImages = imageMatches.length + (coverImage ? 1 : 0);

    if (totalImages === 0) {
        report.checks.push({
            name: 'Images',
            status: '❌',
            message: 'No images. Add at least 1 for engagement.',
            penalty: 15
        });
        report.score -= 15;
    } else if (totalImages === 1 && coverImage) {
        report.checks.push({
            name: 'Images',
            status: '⚠️',
            message: 'Only cover image. Add inline images.',
            penalty: 5
        });
        report.score -= 5;
    } else {
        report.checks.push({ name: 'Images', status: '✅', message: `${totalImages} images`, penalty: 0 });
    }

    // 6. Call to Action
    const lower = content.toLowerCase();
    const ctaKeywords = [
        'download',
        'try it',
        'get started',
        'app store',
        '다운로드',
        '지금 시작',
        '시작해',
        '앱스토어',
        '앱 스토어'
    ];
    const hasCallToAction = ctaKeywords.some((keyword) => lower.includes(keyword));
    if (!hasCallToAction) {
        report.checks.push({ name: 'Call to Action', status: '⚠️', message: 'No clear CTA detected.', penalty: 10 });
        report.score -= 10;
    } else {
        report.checks.push({ name: 'Call to Action', status: '✅', message: 'CTA detected', penalty: 0 });
    }

    report.passed = report.score >= 70;
    report.grade =
        report.score >= 90 ? 'A' :
        report.score >= 80 ? 'B' :
        report.score >= 70 ? 'C' :
        report.score >= 60 ? 'D' : 'F';

    return report;
}

function printReport(report) {
    console.log('\n📊 ═══════════════════════════════════════════');
    console.log('   QUALITY GATE REPORT');
    console.log('═══════════════════════════════════════════════');
    console.log(`   Profile: ${report.profileId} | Language: ${report.language}\n`);

    for (const check of report.checks) {
        console.log(`   ${check.status} ${check.name}: ${check.message}`);
    }

    console.log('\n───────────────────────────────────────────────');
    console.log(`   📈 Final Score: ${report.score}/100 (Grade: ${report.grade})`);
    console.log(`   ${report.passed ? '✅ PASSED' : '❌ FAILED'} - ${report.passed ? 'Ready to publish' : 'Needs improvement'}`);
    console.log('═══════════════════════════════════════════════\n');

    return report;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node draft-quality-gate.js <path-to-draft.md> [profile-id]');
        process.exit(1);
    }

    const report = checkQuality(args[0], { profileId: args[1] });
    printReport(report);

    process.exit(report.passed ? 0 : 1);
}

module.exports = {
    checkQuality,
    printReport,
    calculateReadability,
    detectContentLanguage,
    countWords
};
