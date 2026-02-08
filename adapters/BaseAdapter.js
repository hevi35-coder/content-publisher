/**
 * BaseAdapter - Abstract base class for platform adapters
 * 
 * All platform-specific adapters must extend this class and implement
 * the required methods.
 */
class BaseAdapter {
    constructor(config) {
        if (this.constructor === BaseAdapter) {
            throw new Error('BaseAdapter is abstract and cannot be instantiated');
        }
        this.name = 'base';
        this.config = config;
    }

    /**
     * Authenticate with the platform
     * @returns {Promise<boolean>} True if authentication successful
     */
    async authenticate() {
        throw new Error('authenticate() must be implemented');
    }

    /**
     * Publish an article to the platform
     * @param {Object} article - Article object with title, content, tags, coverImage
     * @returns {Promise<Object>} Published article info with url, id
     */
    async publish(article) {
        throw new Error('publish() must be implemented');
    }

    /**
     * Update an existing article
     * @param {string} articleId - Platform-specific article ID
     * @param {Object} article - Updated article object
     * @returns {Promise<Object>} Updated article info
     */
    async update(articleId, article) {
        throw new Error('update() must be implemented');
    }

    /**
     * Check if an article with the given title already exists
     * @param {string} title - Article title to check
     * @returns {Promise<Object|null>} Existing article or null
     */
    async checkExists(title) {
        throw new Error('checkExists() must be implemented');
    }

    /**
     * Upload an image to the platform (optional)
     * @param {string} imagePath - Local path to image
     * @returns {Promise<string|null>} Uploaded image URL or null
     */
    async uploadImage(imagePath) {
        return null; // Default: not supported
    }

    /**
     * Get platform name for logging
     */
    getName() {
        return this.name;
    }
}

module.exports = BaseAdapter;
