const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { FAILED_CONCLUSION_LIST } = require('../scripts/build-workflow-failure-context');

const AUTO_PUBLISH_WORKFLOW = path.resolve(__dirname, '../.github/workflows/auto-publish.yml');
const PUBLISH_SMOKE_WORKFLOW = path.resolve(__dirname, '../.github/workflows/publish-smoke.yml');
const PR_SANITY_WORKFLOW = path.resolve(__dirname, '../.github/workflows/pr-sanity.yml');
const WEEKLY_CONTENT_WORKFLOW = path.resolve(__dirname, '../.github/workflows/weekly-content.yml');
const NOTIFY_ON_FAILURE_WORKFLOW = path.resolve(__dirname, '../.github/workflows/notify-on-failure.yml');

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

test('auto-publish workflow keeps manual safety defaults and guardrails', () => {
    const yml = read(AUTO_PUBLISH_WORKFLOW);

    assert.match(yml, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*draft_files:/m);
    assert.match(yml, /dry_run:\s*\n[\s\S]*default:\s*'true'/m);
    assert.match(yml, /name:\s*Preflight Secret Validation/m);
    assert.match(yml, /VERIFY_PUBLISHED_URLS:\s*\$\{\{\s*vars\.VERIFY_PUBLISHED_URLS/m);
    assert.match(yml, /MIN_DRAFT_BODY_CHARS:\s*\$\{\{\s*vars\.MIN_DRAFT_BODY_CHARS/m);
    assert.match(yml, /name:\s*Resolve Target Draft Files/m);
    assert.match(yml, /name:\s*Manual Run Missing Draft Files/m);
    assert.match(yml, /No draft files resolved for manual run/m);
    assert.match(yml, /Auto Publish Summary/m);
    assert.match(yml, /\$GITHUB_STEP_SUMMARY/m);
    assert.match(yml, /name:\s*Notify on Failure \(Legacy Inline\)/m);
    assert.match(yml, /if:\s*\$\{\{\s*failure\(\)\s*&&\s*\(vars\.INLINE_FAILURE_NOTIFY == 'true'\)\s*\}\}/m);
});

test('publish-smoke workflow exists as daily dry-run rehearsal', () => {
    const yml = read(PUBLISH_SMOKE_WORKFLOW);

    assert.match(yml, /name:\s*Publish Smoke \(Dry Run\)/m);
    assert.match(yml, /cron:\s*'40 15 \* \* \*'/m);
    assert.match(yml, /DRY_RUN:\s*'true'/m);
    assert.match(yml, /actions\/cache\/restore@v4/m);
    assert.match(yml, /actions\/cache\/save@v4/m);
    assert.match(yml, /name:\s*Preflight Smoke Draft Validation/m);
    assert.match(yml, /run:\s*node scripts\/check-publish-secrets\.js/m);
    assert.match(yml, /name:\s*Build Failure Delta/m);
    assert.match(yml, /Newly Failed Since Previous Run/m);
    assert.match(yml, /Recovered Since Previous Run/m);
    assert.match(yml, /name:\s*Upload Smoke Diagnostics Artifact/m);
    assert.match(yml, /smoke-run\.log/m);
    assert.match(yml, /failed_files<<EOF/m);
});

test('workflow schedules stay pinned to intended KST windows', () => {
    const weekly = read(WEEKLY_CONTENT_WORKFLOW);
    const smoke = read(PUBLISH_SMOKE_WORKFLOW);

    // Weekly: Sunday 13:00 KST and Mon/Wed/Fri 13:00 KST
    assert.match(weekly, /cron:\s*'0 4 \* \* 0'/m);
    assert.match(weekly, /cron:\s*'0 4 \* \* 1,3,5'/m);

    // Smoke: Daily 00:40 KST
    assert.match(smoke, /cron:\s*'40 15 \* \* \*'/m);
});

test('pr-sanity workflow enforces regression tests', () => {
    const yml = read(PR_SANITY_WORKFLOW);
    assert.match(yml, /name:\s*Run Regression Tests/m);
    assert.match(yml, /run:\s*npm test/m);
});

test('weekly-content workflow includes preflight checks for topic/draft paths', () => {
    const yml = read(WEEKLY_CONTENT_WORKFLOW);

    assert.match(yml, /name:\s*Preflight Topic Inputs/m);
    assert.match(yml, /Missing required secret:\s*MODELS_TOKEN/m);
    assert.match(yml, /name:\s*Preflight Draft Inputs/m);
    assert.match(yml, /scripts\/check-gh-cli-auth\.sh/m);
    assert.match(yml, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/m);
    assert.match(yml, /Weekly Workflow Preflight/m);
    assert.match(yml, /\$GITHUB_STEP_SUMMARY/m);
    assert.match(yml, /name:\s*Notify on Failure \(Legacy Inline\)/m);
});

test('notify-on-failure watches all critical workflows', () => {
    const yml = read(NOTIFY_ON_FAILURE_WORKFLOW);
    assert.match(yml, /"Weekly Content Automation"/m);
    assert.match(yml, /"Publish Smoke \(Dry Run\)"/m);
    assert.match(yml, /"Auto Publish \(Content Publisher\)"/m);
    assert.match(yml, /\["failure","timed_out","cancelled","action_required","startup_failure"\]/m);
    for (const conclusion of FAILED_CONCLUSION_LIST) {
        assert.match(yml, new RegExp(`"${conclusion}"`));
    }
    assert.match(yml, /name:\s*Build Failure Context/m);
    assert.match(yml, /node scripts\/build-workflow-failure-context\.js/m);
    assert.match(yml, /node scripts\/send-workflow-failure-notification\.js/m);
    assert.match(yml, /ACTION_GUIDANCE:\s*\$\{\{\s*steps\.context\.outputs\.action_guidance\s*\}\}/m);
    assert.match(yml, /ERROR_HIGHLIGHTS:\s*\$\{\{\s*steps\.context\.outputs\.error_highlights\s*\}\}/m);
    assert.match(yml, /HIGHLIGHT_NOTE:\s*\$\{\{\s*steps\.context\.outputs\.highlight_note\s*\}\}/m);
    assert.match(yml, /name:\s*Write Incident Summary/m);
    assert.match(yml, /## Action Guidance/m);
    assert.match(yml, /## Error Highlights/m);
    assert.match(yml, /## Fetch Note/m);
    assert.match(yml, /## Highlight Note/m);
    assert.match(yml, /\$GITHUB_STEP_SUMMARY/m);
});
