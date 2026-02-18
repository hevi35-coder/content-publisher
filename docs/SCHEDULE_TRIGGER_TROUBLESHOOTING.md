# Weekly Schedule Trigger Troubleshooting

## Scope

- Workflow: `Weekly Content Automation` (`.github/workflows/weekly-content.yml`)
- Primary symptom: expected KST slot did not start near target time
- Incident focus date: `2026-02-18` (Wednesday, KST)

## Incident Timeline (KST)

| Time | Event | Evidence |
|---|---|---|
| 13:00 target window | `13:00` slot did not start at target minute | No schedule run near `04:00Z` |
| 14:23 actual | delayed schedule run started | run `22127736795` |
| 17:00 target window | `17:00` slot still not triggered during monitoring window | no new schedule run between `17:00` and `17:44` |
| 17:44 check | latest schedule run unchanged (`22127736795`) | API / `gh run list` |

## Evidence Summary

- Workflow and repo state were normal during incident:
  - workflow state: `active`
  - default branch: `main`
  - Actions permissions: enabled
- Historical schedule run start times were consistently delayed vs defined cron:
  - sample absolute delays: `63, 65, 83, 111, 115, 119, 147, 160` minutes
  - this indicates scheduler drift / queue latency risk, not only job runtime issues
- Prior runtime failure (separate issue) also existed:
  - direct main push for covers caused protected branch rejection (`GH006`)
  - fixed by `SKIP_COVER_MAIN_SYNC=true` in weekly draft flow

## Red-Team Hypotheses and Outcome

| Hypothesis | Result | Notes |
|---|---|---|
| Cron expression wrong | Rejected | Cron verified from workflow and reflected in API |
| Workflow disabled | Rejected | Workflow state `active` |
| Branch mismatch | Rejected | Runs and workflow on `main` |
| Token/permission block on trigger | Rejected | Trigger absence happened before job-level auth |
| GitHub scheduler queue/delay/drop | Supported | repeated large delays, including > 2h |
| Runtime failure mistaken as trigger failure | Partially true | happened for earlier run, but does not explain absent new event |

## Stabilization Hotfix (Applied)

1. Top-of-hour contention avoidance:
   - `weekly_time_kst`: `17:00` -> `17:07`
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

## Operational Runbook (Until Stable)

1. T+20m (after expected slot): check if new `schedule` run exists.
2. If absent at T+20m: run `workflow_dispatch` with `run_target=draft` (`dry_run=false`) manually.
3. T+40m: capture run ID + logs, append to this document.
4. If scheduler miss repeats 2+ times in 7 days: keep off-minute scheduling and open GitHub support ticket with run IDs/timestamps.

## Verification Checklist

- `npm run schedule:sync`
- `npm run schedule:check`
- `node --test test/schedule-watchdog.test.js test/workflow-guardrails.test.js`
- `./scripts/ci-sanity-checks.sh`

## Definition of Done

- Scheduled run appears around configured minute (`17:07 KST`) within expected operational tolerance.
- No repeated missed trigger over a 7-day observation window.
- No false-positive watchdog miss caused by scheduler delay within configured grace.
