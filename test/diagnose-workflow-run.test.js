const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDiagnosisReport,
    extractErrorHighlights,
    extractFailedJobs,
    parseArgs,
    parseRunIdFromUrl,
    pickTargetRun
} = require('../scripts/diagnose-workflow-run');

test('parseRunIdFromUrl extracts run id from actions URL', () => {
    assert.equal(
        parseRunIdFromUrl('https://github.com/owner/repo/actions/runs/123456789'),
        '123456789'
    );
    assert.equal(parseRunIdFromUrl('invalid-url'), '');
});

test('parseArgs resolves run id from run url', () => {
    const args = parseArgs([
        '--repo',
        'owner/repo',
        '--workflow',
        'Auto Publish (Content Publisher)',
        '--run-url',
        'https://github.com/owner/repo/actions/runs/987654321',
        '--output',
        'run_log.txt'
    ]);

    assert.equal(args.repo, 'owner/repo');
    assert.equal(args.workflow, 'Auto Publish (Content Publisher)');
    assert.equal(args.runId, '987654321');
    assert.equal(args.output, 'run_log.txt');
});

test('pickTargetRun prefers failed critical workflow run', () => {
    const target = pickTargetRun([
        { name: 'Random Workflow', conclusion: 'failure', databaseId: 1 },
        { name: 'Auto Publish (Content Publisher)', conclusion: 'success', databaseId: 2 },
        { name: 'Publish Smoke (Dry Run)', conclusion: 'timed_out', databaseId: 3 }
    ]);
    assert.equal(target.databaseId, 3);
});

test('pickTargetRun supports explicit workflow filter', () => {
    const target = pickTargetRun([
        { name: 'Release', conclusion: 'failure', databaseId: 11 },
        { name: 'Publish Smoke (Dry Run)', conclusion: 'failure', databaseId: 12 }
    ], 'Release');

    assert.equal(target.databaseId, 11);
});

test('extractFailedJobs returns failed job and failed step details', () => {
    const failed = extractFailedJobs([
        { name: 'ok', conclusion: 'success', steps: [{ name: 'done', conclusion: 'success' }] },
        { name: 'build', conclusion: 'failure', steps: [{ name: 'test', conclusion: 'failure' }] }
    ]);

    assert.equal(failed.length, 1);
    assert.equal(failed[0].name, 'build');
    assert.equal(failed[0].failedStep, 'test');
});

test('extractErrorHighlights keeps only error-like lines', () => {
    const highlights = extractErrorHighlights([
        'info: start',
        '::error::Missing required env vars authorization=Bearer abcdefghijklmnopqrstuvwxyz123456',
        `fatal: ${'y'.repeat(500)}`,
        'done'
    ].join('\n'));

    assert.equal(highlights.length, 2);
    assert.match(highlights[0], /Missing required env vars/);
    assert.doesNotMatch(highlights[0], /Bearer\s+[A-Za-z0-9._-]{20,}/i);
    assert.match(highlights[0], /Bearer \[REDACTED\]|\[REDACTED\]/);
    assert.match(highlights[1], /fatal:/i);
    assert.ok(highlights[1].length <= 280);
});

test('buildDiagnosisReport includes metadata, guidance, and smoke hint', () => {
    const report = buildDiagnosisReport({
        repo: 'owner/repo',
        run: {
            databaseId: 99,
            name: 'Publish Smoke (Dry Run)',
            status: 'completed',
            conclusion: 'failure',
            event: 'schedule',
            headBranch: 'main',
            url: 'https://github.com/owner/repo/actions/runs/99'
        },
        failedJobs: [{ name: 'smoke-publish', conclusion: 'failure', failedStep: 'Run Smoke Publish' }],
        highlights: ['::error::Smoke publish failed for one or more files.'],
        logNote: ''
    });

    assert.match(report, /Workflow Run Diagnosis/);
    assert.match(report, /Publish Smoke \(Dry Run\)/);
    assert.match(report, /Action Guidance/);
    assert.match(report, /Smoke Hint/);
    assert.match(report, /publish-smoke-diagnostics-99/);
});
