# Improvement Backlog

## Agency
| Action | Priority | Owner | Due | Verification | Status |
|---|---|---|---|---|---|
| Standardize incident failure taxonomy (`EXPECTED_GUARD_BLOCK`, `RUNTIME_FAILURE`, `PLATFORM_DELAY`) across retrospectives | P1 | Agency Ops | 2026-02-24 | New taxonomy referenced in next retrospective pack | In Progress |
| Add weekly reliability review template that separates scheduler delay from hard misses | P2 | Agency PM | 2026-02-26 | Template used in next weekly ops review | Planned |

## Agent
| Action | Priority | Owner | Due | Verification | Status |
|---|---|---|---|---|---|
| Enforce absolute timestamp wording when diagnosing "missed trigger" (`expected`, `observed`, `delta`) | P1 | Codex Agent | 2026-02-21 | Next incident note includes all three fields | In Progress |
| Keep deep-mode red-team contract mandatory for repeated issue class | P1 | Codex Agent | 2026-02-20 | Present in `03_redteam_report.md` | Done |

## Skill
| Action | Priority | Owner | Due | Verification | Status |
|---|---|---|---|---|---|
| Implement reusable retrospective evidence collection command | P1 | Project Maintainer | 2026-02-20 | `scripts/collect-retro-evidence.sh` run success and files regenerated | Done |
| Add optional classification summary output (`guard-blocked` vs `runtime`) to collector | P2 | Project Maintainer | 2026-02-24 | New evidence artifact created and referenced in ops report | Planned |

## Workflow
| Action | Priority | Owner | Due | Verification | Status |
|---|---|---|---|---|---|
| Keep workflow-dispatch handoff as primary publish path (not push) | P1 | Project Maintainer | 2026-02-21 | Next weekly slot shows dispatch path success and no push-path dependence | In Progress |
| Add report step to label expected guard-block failures as non-SLO incidents | P1 | Project Maintainer | 2026-02-24 | Weekly ops report section includes segmented counts | Planned |
