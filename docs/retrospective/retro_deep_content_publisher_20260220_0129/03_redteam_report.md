# Red-Team Report

## Verdict
- `Approve`

## Blocking Count
- P0: 0
- P1: 2

## Findings
| Severity | Evidence | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|
| P1 | `evidence/slot_health_snapshot.txt`, `docs/SCHEDULE_TRIGGER_TROUBLESHOOTING.md` | Scheduler delay can be misread as hard no-trigger, causing premature manual fallback and overlap risk. | Keep strict `T+60` manual fallback gate, preserve watchdog auto-dispatch (`run_attempt==1`), and continue off-minute schedule strategy. | Medium |
| P1 | `evidence/run_summary.json`, runs `22188271658`, `22186300953` | Guard-blocked manual runs are counted as failures in global stats, which contaminates reliability interpretation. | Add explicit failure-class segmentation (expected guard block vs true publish/runtime failure) in ops report and review cadence. | Medium |
| P2 | run `22188534870` log (`[QualityGate:draft] blogger_kr score 65/70`) | KO draft generation can fail quality gate and skip publish window. | Define KO-specific fallback path (re-generation policy and threshold tuning criteria) with owner and SLA. | Medium-Low |
| P2 | `evidence/run_summary.json` (`Auto Publish` push path `0/6`) | Push-triggered auto-publish path is noisy and not reliable as primary handoff. | Keep workflow-dispatch handoff as primary contract and treat push path as best-effort only. | Low |

## Next Gate Recommendation
- `Proceed with Conditions`

## Generic vs Special Fit
| Topic | Generic Core | Conditional | Special Extension | Reason |
|---|---|---|---|---|
| Deep retrospective evidence pack + red-team contract | Yes | No | No | Reusable governance baseline for all scheduled automation projects. |
| Delayed-schedule operational policy (`T+60`, watchdog auto-fallback) | No | Yes | No | Apply when workflow has scheduled production impact and fallback risk. |
| Manual live publish confirmation token | No | Yes | No | Needed only for workflows allowing manual live publish path. |
| Hashnode dedupe and safe-delete policy | No | No | Yes | Channel-specific behavior and API semantics. |
| EN/KO profile separation guardrails | No | No | Yes | Product-domain specific content strategy split. |
