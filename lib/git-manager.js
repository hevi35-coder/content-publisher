/**
 * Git Manager - Handles automatic git operations for content publishing
 * 
 * Auto-commits and pushes cover images to main branch.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

function runGit(args, options = {}) {
    return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: options.stdio || 'pipe'
    });
}

function formatGitError(error) {
    const stdout = error?.stdout ? String(error.stdout).trim() : '';
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    return [stderr, stdout, error?.message].filter(Boolean).join(' | ');
}

function normalizeValue(value) {
    return String(value || '').trim();
}

function resolveGitIdentity({ currentName = '', currentEmail = '', env = process.env } = {}) {
    const name = normalizeValue(currentName) ||
        normalizeValue(env.GIT_USER_NAME) ||
        normalizeValue(env.GIT_AUTHOR_NAME) ||
        normalizeValue(env.GIT_COMMITTER_NAME) ||
        'MandaAct Bot';

    const email = normalizeValue(currentEmail) ||
        normalizeValue(env.GIT_USER_EMAIL) ||
        normalizeValue(env.GIT_AUTHOR_EMAIL) ||
        normalizeValue(env.GIT_COMMITTER_EMAIL) ||
        'bot@mandaact.com';

    return { name, email };
}

function readGitConfig(key) {
    try {
        return runGit(['config', '--get', key]).trim();
    } catch {
        return '';
    }
}

function ensureGitIdentity() {
    const currentName = readGitConfig('user.name');
    const currentEmail = readGitConfig('user.email');
    const { name, email } = resolveGitIdentity({ currentName, currentEmail });

    if (!normalizeValue(currentName)) {
        runGit(['config', 'user.name', name]);
    }
    if (!normalizeValue(currentEmail)) {
        runGit(['config', 'user.email', email]);
    }
    if (!normalizeValue(currentName) || !normalizeValue(currentEmail)) {
        console.log(`[Git] Configured local git identity: ${name} <${email}>`);
    }

    return { name, email };
}

/**
 * Commit and push files to main branch
 * @param {string} filePattern - File pattern to add (e.g. 'assets/images/covers/')
 * @param {string} message - Commit message
 * @returns {boolean} Success status
 */
function pushToMain(filePattern, message) {
    try {
        // Check if there are any changes
        const status = runGit(['status', '--porcelain', '--', filePattern]);

        if (!status.trim()) {
            console.log(`[Git] No changes in ${filePattern} to push`);
            return true;
        }

        // Get current branch
        const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

        // Avoid destructive branch switching in local/dev environments.
        if (currentBranch !== 'main') {
            console.warn(
                `[Git] Auto-push skipped on branch "${currentBranch}". Run this on main to avoid stash/checkout side effects.`
            );
            return false;
        }

        console.log(`[Git] Syncing ${filePattern} to main...`);
        ensureGitIdentity();
        runGit(['add', '--', filePattern]);

        // Commit only target path to prevent accidentally including unrelated staged files.
        try {
            runGit(['commit', '-m', message, '--', filePattern], { stdio: 'inherit' });
        } catch (commitError) {
            const commitOutput = `${commitError?.stdout || ''}\n${commitError?.stderr || ''}`;
            if (/nothing to commit|no changes added to commit/i.test(commitOutput)) {
                console.log('[Git] No changes to commit');
                return true;
            }
            throw commitError;
        }

        runGit(['push', 'origin', 'main'], { stdio: 'inherit' });
        console.log('[Git] Pushed to main');
        return true;
    } catch (error) {
        console.error('[Git] Auto-push failed:', formatGitError(error));
        return false;
    }
}

function pushCoversToMain(message = 'Add cover images') {
    return pushToMain('assets/images/covers/', message);
}

module.exports = { ensureGitIdentity, pushCoversToMain, pushToMain, resolveGitIdentity };
