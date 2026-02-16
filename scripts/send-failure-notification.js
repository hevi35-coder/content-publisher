#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { notifier } = require('../lib/notifier');

function readDiagnosisFile() {
    const diagnosisPath = path.resolve(process.cwd(), 'output', 'failure-diagnosis.json');
    if (!fs.existsSync(diagnosisPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(diagnosisPath, 'utf8'));
    } catch (error) {
        return null;
    }
}

function joinLines(values = [], separator = ' | ') {
    if (!Array.isArray(values) || values.length === 0) {
        return '';
    }
    return values.join(separator);
}

async function main() {
    const diagnosis = readDiagnosisFile();
    const workflowName = process.env.WORKFLOW_NAME || diagnosis?.workflowName || 'Unknown workflow';
    const runUrl = process.env.WORKFLOW_RUN_URL || diagnosis?.runUrl || '';
    const eventName = process.env.WORKFLOW_EVENT_NAME || diagnosis?.eventName || '';
    const headBranch = process.env.WORKFLOW_HEAD_BRANCH || diagnosis?.headBranch || '';

    const details = {
        workflow: workflowName,
        trigger: eventName || '(unknown)',
        branch: headBranch || '(unknown)',
        runUrl,
        rootCause: diagnosis?.rootCause || 'Failure detected (automatic diagnosis unavailable)',
        diagnosisSummary: diagnosis?.summary || 'Check failed workflow logs.',
        failedSteps: joinLines(diagnosis?.failedSteps, ', ') || '(not available)',
        recommendedActions: joinLines(diagnosis?.suggestedActions) || 'Check failed logs and retry after fix.'
    };

    if (diagnosis?.rootCauseCode) {
        details.rootCauseCode = diagnosis.rootCauseCode;
    }

    await notifier.send({
        type: 'step_failed',
        step: 'pipeline',
        status: 'failed',
        details
    });
}

main().catch((error) => {
    console.error(`send-failure-notification failed: ${error.message}`);
    process.exit(0);
});
