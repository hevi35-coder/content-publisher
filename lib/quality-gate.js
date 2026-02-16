/**
 * Backward compatibility shim.
 *
 * The publish-time quality gate now lives in `publish-quality-gate.js`.
 * Keep this file to avoid breaking older imports.
 */

module.exports = require('./publish-quality-gate');
