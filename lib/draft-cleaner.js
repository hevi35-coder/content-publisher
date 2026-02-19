/**
 * Draft Cleaner - Removes editorial leakage from AI-generated drafts.
 *
 * This targets non-article residue such as:
 * - "### Changes Made" sections from fact-check prompts
 * - trailing editorial summaries
 * - dangling markdown code fences at the end of body
 */

const EDITORIAL_START_PATTERNS = [
    /^(?:#{1,6}\s*)?(?:changes made|change log|what changed|revision notes?|editor(?:ial)? notes?)\s*:?\s*$/i,
    /^(?:#{1,6}\s*)?(?:변경 사항|수정 사항)\s*:?\s*$/i,
    /^this version accurately reflects/i,
    /^verified that all claims/i
];

function normalizeLineEndings(text) {
    return String(text || '').replace(/\r\n/g, '\n');
}

function stripOuterMarkdownFence(text) {
    let output = String(text || '').trim();
    output = output.replace(/^```(?:markdown|md)?\s*\n/i, '');
    output = output.replace(/\n```[\t ]*$/i, '');
    return output;
}

function findEditorialStartIndex(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const matched = EDITORIAL_START_PATTERNS.some((pattern) => pattern.test(line));
        if (!matched) continue;

        // Guard against false positives in the main body.
        const ratio = (i + 1) / lines.length;
        if (ratio < 0.45) continue;

        let start = i;
        if (start > 0 && /^```(?:markdown|md)?\s*$/i.test(lines[start - 1].trim())) {
            start -= 1;
        }
        return start;
    }

    return -1;
}

function trimTrailingArtifacts(lines) {
    const output = [...lines];

    while (output.length > 0 && output[output.length - 1].trim() === '') {
        output.pop();
    }

    while (output.length > 0 && /^```[\w-]*\s*$/i.test(output[output.length - 1].trim())) {
        output.pop();
    }

    while (output.length > 0 && output[output.length - 1].trim() === '') {
        output.pop();
    }

    return output;
}

function sanitizeDraftBodyContent(body) {
    const normalized = stripOuterMarkdownFence(normalizeLineEndings(body));
    const lines = normalized.split('\n');
    const editorialStart = findEditorialStartIndex(lines);
    const kept = editorialStart >= 0 ? lines.slice(0, editorialStart) : lines;
    const trimmed = trimTrailingArtifacts(kept);

    if (trimmed.length === 0) {
        return '';
    }

    return `${trimmed.join('\n')}\n`;
}

function splitFrontmatter(text) {
    const normalized = normalizeLineEndings(text);
    const match = normalized.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
    if (!match) {
        return { frontmatter: '', body: normalized };
    }

    return {
        frontmatter: match[0],
        body: normalized.slice(match[0].length)
    };
}

function sanitizeDraftMarkdownContent(markdown) {
    const cleanedSource = stripOuterMarkdownFence(normalizeLineEndings(markdown));
    const { frontmatter, body } = splitFrontmatter(cleanedSource);
    const cleanedBody = sanitizeDraftBodyContent(body).trimStart();

    if (!frontmatter) {
        return cleanedBody ? `${cleanedBody.trimEnd()}\n` : '';
    }

    const fm = frontmatter.endsWith('\n') ? frontmatter : `${frontmatter}\n`;
    const merged = `${fm}${cleanedBody}`.trimEnd();
    return merged ? `${merged}\n` : '';
}

function containsEditorialNotes(text) {
    const lines = normalizeLineEndings(text).split('\n');
    return findEditorialStartIndex(lines) >= 0;
}

module.exports = {
    sanitizeDraftBodyContent,
    sanitizeDraftMarkdownContent,
    containsEditorialNotes,
    splitFrontmatter
};

