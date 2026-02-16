/**
 * Backward compatibility shim.
 *
 * Draft quality scoring now lives in `draft-quality-gate.js`.
 * Keep this entrypoint for older scripts/imports.
 */

const draftQualityGate = require('./draft-quality-gate');

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node quality_gate.js <path-to-draft.md> [profile-id]');
        console.log('Alias of: node draft-quality-gate.js <path-to-draft.md> [profile-id]');
        process.exit(1);
    }

    const report = draftQualityGate.checkQuality(args[0], { profileId: args[1] });
    draftQualityGate.printReport(report);
    process.exit(report.passed ? 0 : 1);
}

module.exports = draftQualityGate;
