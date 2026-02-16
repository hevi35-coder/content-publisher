/**
 * Shared OpenAI client for GitHub Models.
 *
 * Lazy-initialized to avoid process exit side effects at require-time.
 * Consumers can keep using `client.chat.completions.create(...)`.
 */

const OpenAI = require('openai');
const config = require('../config');
require('dotenv').config();

let cachedClient = null;

function createClient() {
    const githubToken = process.env.GITHUB_MODELS_TOKEN;
    if (!githubToken) {
        throw new Error('GITHUB_MODELS_TOKEN is missing in .env');
    }

    return new OpenAI({
        baseURL: config.ai.baseURL,
        apiKey: githubToken
    });
}

function getClient() {
    if (!cachedClient) {
        cachedClient = createClient();
    }
    return cachedClient;
}

const helperExports = { getClient };

const lazyClient = new Proxy(helperExports, {
    get(target, prop, receiver) {
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }

        const client = getClient();
        const value = client[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    }
});

module.exports = lazyClient;
