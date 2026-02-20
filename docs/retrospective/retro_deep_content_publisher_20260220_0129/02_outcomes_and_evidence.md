# Outcomes and Evidence

## Expected vs Actual
| Item | Expected | Actual | Gap |
|---|---|---|---|
| Schedule trigger timing | Weekly slot starts near configured KST minute (`16:07`) | Latest due slot started at `16:54` KST (`22173222589`) | Scheduler delay variance remains high; early "missed" diagnosis can be false-positive. |
| EN/KO channel publish behavior | EN and KO each publish exactly once per intended channel window | Incident window included Dev.to/Blogger miss perception and Hashnode duplicate concern | Delay + manual fallback + retry interactions increased duplicate/miss risk. |
| Profile separation | EN (developer) and KO (general productivity) generated independently | Regression observed where KO became translation-like copy of EN profile | Topic selection/generation coupling required profile-centric hardening. |
| Operability of diagnosis | One-command evidence capture for retrospective and incident handoff | Evidence capture was ad hoc before this round | New collector script now produces consistent retrospective evidence pack. |

## Evidence Index
| Evidence ID | Type | Path | Integrity Check |
|---|---|---|---|
| E-001 | Workflow run aggregate | `docs/retrospective/retro_deep_content_publisher_20260220_0129/evidence/run_summary.json` | pass |
| E-002 | Workflow run raw list | `docs/retrospective/retro_deep_content_publisher_20260220_0129/evidence/runs_200.json` | pass |
| E-003 | Slot health snapshot | `docs/retrospective/retro_deep_content_publisher_20260220_0129/evidence/slot_health_snapshot.txt` | pass |
| E-004 | Commit timeline | `docs/retrospective/retro_deep_content_publisher_20260220_0129/evidence/commits_since_2026-02-16.tsv` | pass |
| E-005 | Schedule RCA and runbook | `docs/SCHEDULE_TRIGGER_TROUBLESHOOTING.md` | pass |
| E-006 | EN/KO separation RCA | `docs/CONTENT_PROFILE_SEPARATION_TROUBLESHOOTING.md` | pass |
| E-007 | Repo config snapshot | `docs/retrospective/retro_deep_content_publisher_20260220_0129/evidence/repo_variables.tsv` | pass |
| E-008 | Secrets inventory snapshot (names only) | `docs/retrospective/retro_deep_content_publisher_20260220_0129/evidence/repo_secrets.tsv` | pass |

## Gap Categorization
- Process: rapid schedule-time changes happened faster than standardized observation windows.
- Execution: delayed scheduler arrivals overlapped with manual fallback attempts and raised duplicate risk.
- Validation: expected guard failures and true production failures were mixed in aggregate failure counts.
- Communication: "not triggered" wording was used before confirming delayed-arrival window with absolute timestamps.
