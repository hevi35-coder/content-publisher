# Weekly Schedule Trigger Troubleshooting

## Scope

- Workflow: `Weekly Content Automation` (`.github/workflows/weekly-content.yml`)
- Primary symptom: expected KST slot did not start near target time
- Incident focus dates:
  - `2026-02-18` (Wednesday, KST)
  - `2026-02-19` (Thursday, KST)

## Incident Timeline (KST)

| Time | Event | Evidence |
|---|---|---|
| 13:00 target window | `13:00` slot did not start at target minute | No schedule run near `04:00Z` |
| 14:23 actual | delayed schedule run started | run `22127736795` |
| 17:00 target window | `17:00` slot still not triggered during monitoring window | no new schedule run between `17:00` and `17:44` |
| 17:44 check | latest schedule run unchanged (`22127736795`) | API / `gh run list` |
| 16:07 target window (2026-02-19) | expected Thu slot not seen at target minute | no new `event=schedule` run near `07:07Z` during first monitor window |
| 16:21 manual fallback (2026-02-19) | operator-triggered run started before delayed schedule arrived | run `22172377711` (`workflow_dispatch`) |
| 16:54 actual schedule start (2026-02-19) | delayed schedule run eventually appeared | run `22173222589` (`schedule`, `07:54:19Z`) |
| 16:57 completion (2026-02-19) | delayed schedule run completed successfully | run `22173222589` success |

## Evidence Summary

- Workflow and repo state were normal during incident:
  - workflow state: `active`
  - default branch: `main`
  - Actions permissions: enabled
- Historical schedule run start times were consistently delayed vs defined cron:
  - sample absolute delays: `63, 65, 83, 111, 115, 119, 147, 160` minutes
  - this indicates scheduler drift / queue latency risk, not only job runtime issues
- On `2026-02-19`, expected `07:07Z` schedule event arrived at `07:54:19Z` (about `47m` late), then completed successfully.
- "Missed trigger" observations during early monitoring windows can be false alarms when delayed schedule events arrive later in the same hour.
- Weekly draft PR merge itself can succeed while downstream auto-publish is absent:
  - when merge is created by workflow `GITHUB_TOKEN`, a separate `push`-trigger workflow may not fire
  - this explains "draft exists but Dev.to/Blogger not published" in the same window
- Manual fallback before delayed scheduled run can create double execution risk (same-day duplicate generation/publish attempts).
- Prior runtime failure (separate issue) also existed:
  - direct main push for covers caused protected branch rejection (`GH006`)
  - fixed by `SKIP_COVER_MAIN_SYNC=true` in weekly draft flow

## Red-Team Hypotheses and Outcome

| Hypothesis | Result | Notes |
|---|---|---|
| Cron expression wrong | Rejected | Cron verified from workflow and reflected in API |
| Workflow disabled | Rejected | Workflow state `active` |
| Branch mismatch | Rejected | Runs and workflow on `main` |
| Token/event propagation limit on downstream trigger | Supported | weekly run merged PR, but `auto-publish` `push` trigger did not appear |
| GitHub scheduler queue/delay/drop | Supported | repeated large delays, including > 2h |
| True schedule "not triggered" on 2026-02-19 | Rejected | event eventually triggered at `07:54Z`; problem was delayed arrival |
| Runtime failure mistaken as trigger failure | Partially true | happened for earlier run, but does not explain absent new event |

## Stabilization Hotfix (Applied)

1. Top-of-hour contention avoidance:
   - `weekly_time_kst`: `17:00` -> `17:07` -> `16:07` (current)
   - rationale: avoid minute `:00` scheduler contention
2. Watchdog window realignment:
   - `watchdog_grace_minutes`: `180`
   - `watchdog_delay_minutes`: `210`
   - invariant: `delay > grace` (enforced)
3. Single-source schedule control:
   - all schedule-derived files are generated from `config/weekly-schedule.json`
   - `npm run schedule:sync` + `npm run schedule:check`
4. CI guardrails:
   - drift check runs in `scripts/ci-sanity-checks.sh`
   - tests assert schedule config alignment and watchdog invariants
5. Weekly -> Auto Publish explicit handoff:
   - after Draft PR auto-merge confirmation, weekly workflow dispatches `auto-publish.yml` directly
   - dispatch payload includes `draft_files` and `dry_run=false` for deterministic publish scope
6. Merge gating before handoff:
   - weekly workflow now waits for Draft PR `mergedAt` before dispatch
   - prevents dispatch against not-yet-merged drafts
7. Hashnode duplicate risk reduction:
   - URL reachability verification for Hashnode is skipped by default (opt-in only)
   - uncertain Hashnode publish failures now reconcile by re-checking existing posts before retry publish
8. Same-day duplicate generation guard:
   - `generate_draft` skips profiles that already have a same-day KST draft file
   - prevents delayed `schedule` + manual fallback from generating two drafts for the same profile/day
9. Manual fallback timing guard (enforced in workflow):
   - `workflow_dispatch` draft/both with `dry_run=false` is blocked before `T+60` from due slot
   - blocked when the due slot already has a `schedule` run (prevents manual+delayed double run)
   - emergency override exists: `manual_fallback_force=true` (explicit opt-in)
10. Post-publish Hashnode duplicate cleanup:
   - auto-publish now checks duplicate titles for target EN drafts
   - if duplicates exist, keep canonical post and remove retry duplicates automatically

## Operational Runbook (Until Stable)

1. T+20m (after expected slot): check if new `schedule` run exists.
2. If absent at T+20m:
   - keep monitoring; do not immediately conclude hard miss (observed real delay: 47m on `2026-02-19`).
3. If still absent at T+60m:
   - run `workflow_dispatch` with `run_target=draft` (`dry_run=false`) manually.
   - do not use `manual_fallback_force=true` unless there is a confirmed emergency.
   - if Draft PR already merged but publish missing, run `Auto Publish (Content Publisher)` manually with explicit `draft_files`.
4. T+90m: capture run ID + logs, append to this document.
5. If scheduler miss repeats 2+ times in 7 days: keep off-minute scheduling and open GitHub support ticket with run IDs/timestamps.

## Verification Checklist

- `npm run schedule:sync`
- `npm run schedule:check`
- `node --test test/schedule-watchdog.test.js test/workflow-guardrails.test.js`
- `node --test test/manual-fallback-guard.test.js test/hashnode-dedupe.test.js`
- `./scripts/ci-sanity-checks.sh`

## Definition of Done

- Scheduled run appears around configured minute (`16:07 KST`) within expected operational tolerance.
- No repeated missed trigger over a 7-day observation window.
- No false-positive watchdog miss caused by scheduler delay within configured grace.
