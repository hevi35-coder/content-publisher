# Scope and Timeline

- Date: 2026-02-20 (KST)
- Project/Workstream: Content Publisher Ops Stabilization
- Timeframe: 2026-02-16 to 2026-02-20
- Retrospective mode: `Deep`
- Trigger reason: repeated schedule-miss perception, multi-channel publish inconsistency, and repeated hotfix loops.

## In Scope
- Weekly schedule trigger reliability (`weekly-content`, `schedule-watchdog`, fallback dispatch).
- Publish reliability for EN (`Dev.to`, `Hashnode`) and KO (`Blogger`, Naver handoff mail).
- EN/KO profile-content separation regression.
- Evidence reproducibility and retrospective governance hardening.

## Out of Scope
- Platform-internal SLA guarantees for GitHub scheduler, Dev.to, Hashnode, Blogger.
- Historical incidents before 2026-02-16.
- Content strategy redesign beyond current EN/KO dual-profile model.

## Timeline of Key Events
| Time | Event | Decision/Outcome |
|---|---|---|
| 2026-02-16 | Watchdog/fallback hardening wave started (`#56` to `#60`) | Added schedule watchdog, retries, and weekly ops report automation. |
| 2026-02-18 14:23 KST | Delayed `schedule` run observed (`22127736795`) | Confirmed scheduler delay pattern; shifted to off-minute windows and guardrails. |
| 2026-02-19 16:07 KST (expected) / 16:54 KST (actual) | Due slot arrived about 47 minutes late (`22173222589`) | Classified as delayed arrival, not hard no-trigger; retained `T+60` fallback policy. |
| 2026-02-19 | Channel/profile hotfixes landed (`1dd1afa`, `1390797`, `d6737ca`, `cb36e40`) | Hardened content separation and Hashnode dedupe safety policy. |
| 2026-02-20 | Retrospective deep run executed | Scaffolded evidence pack, added reusable collector script, completed red-team gate. |
