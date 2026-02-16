/**
 * Git Manager - Handles automatic git operations for content publishing.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

function isDryRun() {
    return String(process.env.DRY_RUN || '').toLowerCase() === 'true';
}

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

/**
 * Commit and push files to main branch.
 * @param {string} filePattern - File pattern to add (e.g. assets/images/covers/)
 * @param {string} message - Commit message
 * @returns {boolean} Success status
 */
function pushToMain(filePattern, message) {
    try {
        if (isDryRun()) {
            console.log(`[Git] DRY_RUN enabled. Skipping push for ${filePattern}`);
            return true;
        }

        const status = runGit(['status', '--porcelain', '--', filePattern]);
        if (!status.trim()) {
            console.log(`[Git] No changes in ${filePattern} to push`);
            return true;
        }

        const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

        // Avoid destructive branch switching in local/dev environments.
        if (currentBranch !== 'main') {
            console.warn(
                `[Git] Auto-push skipped on branch "${currentBranch}". Run this on main to avoid side effects.`
            );
            return false;
        }

        console.log(`[Git] Syncing ${filePattern} to main...`);
        runGit(['add', '--', filePattern]);

        // Commit only target path to avoid including unrelated staged files.
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

module.exports = { pushCoversToMain, pushToMain };
