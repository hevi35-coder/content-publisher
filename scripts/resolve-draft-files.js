#!/usr/bin/env node
/**
 * Resolve draft files for auto-publish workflow.
 *
 * Resolution priority:
 * 1) workflow_dispatch input (INPUT_DRAFT_FILES)
 * 2) push diff (BEFORE_SHA..CURRENT_SHA)
 * 3) fallback latest commit diff (HEAD~1..HEAD)
 *
 * For workflow_dispatch, if no draft files are resolved, fail fast with a clear message.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ZERO_SHA = '0000000000000000000000000000000000000000';
const REPO_ROOT = process.cwd();

function runGit(args) {
    return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

function gitSucceeds(args) {
    try {
        execFileSync('git', args, {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'ignore', 'ignore']
        });
        return true;
    } catch {
        return false;
    }
}

function tryGit(args) {
    try {
        return runGit(args);
    } catch {
        return '';
    }
}

function splitInput(raw) {
    if (!raw) return [];
    return raw
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter(Boolean);
}

function normalizeDraftPath(input) {
    const trimmed = input.replace(/^["']|["']$/g, '').replace(/\\/g, '/');
    const withoutDot = trimmed.replace(/^\.\//, '');
    const withPrefix = withoutDot.startsWith('drafts/') ? withoutDot : `drafts/${withoutDot}`;

    if (!withPrefix.endsWith('.md')) return null;
    if (withPrefix.includes('..')) return null;
    if (!/^drafts\/.+\.md$/.test(withPrefix)) return null;
    return withPrefix;
}

function unique(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    }
    return result;
}

function parseDraftsFromDiff(diffOutput) {
    if (!diffOutput) return [];
    return unique(
        diffOutput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => /^drafts\/.+\.md$/.test(line))
    );
}

function filterExistingDrafts(paths) {
    return paths.filter((draftPath) => fs.existsSync(path.join(REPO_ROOT, draftPath)));
}

function resolveFromGit(eventName, beforeSha, currentSha) {
    if (eventName === 'push' && beforeSha && beforeSha !== ZERO_SHA) {
        if (gitSucceeds(['cat-file', '-e', `${beforeSha}^{commit}`])) {
            return parseDraftsFromDiff(tryGit(['diff', '--name-only', beforeSha, currentSha]));
        }
    }

    if (gitSucceeds(['rev-parse', '--verify', 'HEAD~1'])) {
        return parseDraftsFromDiff(tryGit(['diff', '--name-only', 'HEAD~1', 'HEAD']));
    }

    return parseDraftsFromDiff(tryGit(['show', '--pretty=', '--name-only', 'HEAD']));
}

function writeGithubOutput({ hasFiles, files, source }) {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!outputPath) {
        // Local debugging mode
        console.log(
            JSON.stringify(
                {
                    hasFiles,
                    files,
                    fileCount: files.length,
                    source
                },
                null,
                2
            )
        );
        return;
    }

    const lines = [];
    lines.push(`has_files=${hasFiles ? 'true' : 'false'}`);
    lines.push(`file_count=${files.length}`);
    lines.push(`source=${source}`);
    if (files.length > 0) {
        lines.push('files<<EOF');
        lines.push(files.join('\n'));
        lines.push('EOF');
    }

    fs.appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

function main() {
    const eventName = process.env.EVENT_NAME || '';
    const beforeSha = process.env.BEFORE_SHA || '';
    const currentSha = process.env.CURRENT_SHA || 'HEAD';
    const inputDraftFiles = process.env.INPUT_DRAFT_FILES || '';

    const rawInputPaths = splitInput(inputDraftFiles);
    if (rawInputPaths.length > 0) {
        const normalized = unique(rawInputPaths.map(normalizeDraftPath).filter(Boolean));
        if (normalized.length === 0) {
            fail('draft_files input exists but no valid markdown files were found.');
        }

        const missing = normalized.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)));
        if (missing.length > 0) {
            fail(`draft_files not found in repository: ${missing.join(', ')}`);
        }

        console.error(`[resolve-draft-files] Using ${normalized.length} file(s) from workflow input.`);
        writeGithubOutput({ hasFiles: true, files: normalized, source: 'workflow_input' });
        return;
    }

    const changed = resolveFromGit(eventName, beforeSha, currentSha);
    if (changed.length > 0) {
        const existing = filterExistingDrafts(changed);
        const skipped = changed.length - existing.length;
        if (skipped > 0) {
            console.error(`[resolve-draft-files] Skipping ${skipped} missing/deleted draft file(s).`);
        }
        if (existing.length > 0) {
            console.error(`[resolve-draft-files] Found ${existing.length} draft file(s) from git diff.`);
            writeGithubOutput({ hasFiles: true, files: existing, source: 'git_diff' });
            return;
        }
        console.error('[resolve-draft-files] No publishable draft files remain after filtering.');
        writeGithubOutput({ hasFiles: false, files: [], source: 'none' });
        return;
    }

    if (eventName === 'workflow_dispatch') {
        fail(
            'No draft files resolved for manual run. Set workflow input "draft_files" (for example: drafts/2026-02-16-example.md).'
        );
    }

    console.error('[resolve-draft-files] No draft files found.');
    writeGithubOutput({ hasFiles: false, files: [], source: 'none' });
}

main();
