/**
 * RetryManager - Retry with timeout and verification
 * 
 * Executes operations with:
 * - Configurable retry count
 * - Timeout per attempt
 * - Verification after completion
 * - Exponential backoff
 */

class RetryManager {
    /**
     * Execute an operation with retry and verification
     * @param {Object} options
     * @param {string} options.name - Operation name for logging
     * @param {Function} options.fn - Async function to execute
     * @param {Function} options.verify - Optional async verification function
     * @param {number} options.maxRetries - Max retry attempts (default: 3)
     * @param {number} options.timeout - Timeout per attempt in ms (default: 30000)
     * @param {string} options.backoff - 'exponential' | 'linear' | 'none' (default: 'exponential')
     * @returns {Object} { success, result, attempts, error }
     */
    async execute({
        name,
        fn,
        verify = null,
        maxRetries = 3,
        timeout = 30000,
        backoff = 'exponential'
    }) {
        let lastError = null;
        let attempts = 0;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            attempts = attempt;
            console.log(`🔄 [${name}] Attempt ${attempt}/${maxRetries}...`);

            try {
                // Execute with timeout
                const result = await this._withTimeout(fn(), timeout, name);

                // Verify if verification function provided
                if (verify) {
                    console.log(`🔍 [${name}] Verifying result...`);
                    const isValid = await this._withTimeout(verify(result), timeout / 2, `${name}_verify`);

                    if (!isValid) {
                        throw new Error('Verification failed');
                    }
                    console.log(`✅ [${name}] Verification passed`);
                }

                console.log(`✅ [${name}] Success on attempt ${attempt}`);
                return { success: true, result, attempts, error: null };

            } catch (error) {
                lastError = error;
                console.error(`❌ [${name}] Attempt ${attempt} failed: ${error.message}`);

                if (attempt < maxRetries) {
                    const delay = this._calculateDelay(attempt, backoff);
                    console.log(`⏳ [${name}] Waiting ${delay}ms before retry...`);
                    await this._sleep(delay);
                }
            }
        }

        console.error(`💀 [${name}] All ${maxRetries} attempts failed`);
        return {
            success: false,
            result: null,
            attempts,
            error: lastError?.message || 'Unknown error'
        };
    }

    /**
     * Execute with timeout
     */
    async _withTimeout(promise, timeoutMs, operationName) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            promise
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Calculate delay based on backoff strategy
     */
    _calculateDelay(attempt, backoff) {
        const baseDelay = 1000; // 1 second

        switch (backoff) {
            case 'exponential':
                return baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s...
            case 'linear':
                return baseDelay * attempt; // 1s, 2s, 3s, 4s...
            case 'none':
                return baseDelay;
            default:
                return baseDelay;
        }
    }

    /**
     * Sleep helper
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute multiple operations in sequence with retry
     */
    async executeSequence(operations) {
        const results = [];

        for (const op of operations) {
            const result = await this.execute(op);
            results.push({ name: op.name, ...result });

            if (!result.success) {
                console.error(`🛑 Sequence stopped at ${op.name}`);
                break;
            }
        }

        return results;
    }
}

// Singleton instance
const retryManager = new RetryManager();

module.exports = { RetryManager, retryManager };
