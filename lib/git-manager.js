/**
 * Git Manager - Handles automatic git operations for content publishing
 * 
 * Auto-commits and pushes cover images to main branch.
 */
const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

/**
 * Commit and push cover images to main branch
 * @param {string} message - Commit message
 * @returns {boolean} Success status
 */
function pushCoversToMain(message = 'Add cover images') {
    try {
        const cwd = REPO_ROOT;

        // Check if there are any new cover images
        const status = execSync('git status --porcelain assets/images/covers/', { cwd, encoding: 'utf-8' });

        if (!status.trim()) {
            console.log('[Git] No new cover images to push');
            return true;
        }

        // Get current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();

        // If on main, just add, commit, push
        if (currentBranch === 'main') {
            execSync('git add assets/images/covers/', { cwd });
            execSync(`git commit -m "${message}"`, { cwd });
            execSync('git push origin main', { cwd });
            console.log('[Git] Cover images pushed to main');
            return true;
        }

        // If on another branch, stash, checkout main, apply, push, return
        console.log(`[Git] On branch ${currentBranch}, switching to main for push...`);

        // Stash any other changes
        execSync('git stash --include-untracked', { cwd });

        // Add cover images before checkout
        execSync('git add assets/images/covers/', { cwd });

        // Checkout main
        execSync('git checkout main', { cwd });
        execSync('git pull origin main', { cwd });

        // Restore cover files from stash
        try {
            execSync('git stash pop', { cwd });
        } catch (e) {
            // Stash might be empty, ignore
        }

        // Add, commit, push
        execSync('git add assets/images/covers/', { cwd });
        try {
            execSync(`git commit -m "${message}"`, { cwd });
            execSync('git push origin main', { cwd });
            console.log('[Git] Cover images pushed to main');
        } catch (e) {
            console.log('[Git] No changes to commit');
        }

        // Return to original branch
        execSync(`git checkout ${currentBranch}`, { cwd });

        return true;
    } catch (error) {
        console.error('[Git] Auto-push failed:', error.message);
        return false;
    }
}

module.exports = { pushCoversToMain };
