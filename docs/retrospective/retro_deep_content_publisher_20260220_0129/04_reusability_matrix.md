# Reusability Matrix

## Classification Rules
- `Generic Core`: default agency baseline
- `Conditional`: only with explicit entry criteria
- `Special Extension`: project-specific and non-default

## Matrix
| Capability/Rule | Generic Core | Conditional | Special Extension | Entry Criteria | Owner |
|---|---|---|---|---|---|
| Retrospective evidence pack scaffold + validator usage | Yes | No | No | Any deep retrospective request | Agency Ops |
| `scripts/collect-retro-evidence.sh` evidence collector | Yes | No | No | `gh` + `jq` available, repository has Actions history | Project Ops |
| Red-team mandatory contract (`Verdict`, `Blocking Count`, `Findings`, `Next Gate Recommendation`, `Generic vs Special Fit`) | Yes | No | No | Deep retrospective mode | Agency Ops |
| Scheduler delay handling (`T+60` fallback + watchdog guard) | No | Yes | No | Scheduled workflow with business-critical slot timing | Project Ops |
| Manual live publish confirmation token guard | No | Yes | No | Manual dispatch path exists with `dry_run=false` | Project Maintainer |
| Hashnode post-publish dedupe safe mode | No | No | Yes | Hashnode channel enabled | Content Publisher Maintainer |
| EN/KO profile-separated generation and routing | No | No | Yes | Multi-profile bilingual content pipeline | Content Strategy + Maintainer |

## Rollout Decision
- Adopt now: evidence collector script, red-team contract enforcement, retrospective pack validation.
- Defer: failure-class segmentation in weekly ops report, KO quality-gate fallback policy.
- Reject: none.
