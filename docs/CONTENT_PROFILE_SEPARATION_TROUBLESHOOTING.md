# EN/KO Content Separation Troubleshooting

## Scope

- Symptom: Korean post content became near-translation of English developer-target content.
- Expected design:
  - EN: developer-target, Dev.to/Hashnode, separate topic generation.
  - KO: productivity/general-user target, Blogger/Naver workflow, separate topic generation.

## Root Cause

1. Single-topic fan-out in draft generation
   - Previous `generate_draft` flow selected one queue topic and fanned it out to multiple profiles.
   - On shared schedule days, EN/KO could be produced from the same source topic.
2. Weak profile-topic isolation
   - Dev profile accepted non-KR topics broadly.
   - KO profile depended on `KR-Only` tag, but queue/order conditions still allowed content coupling through single-topic flow.
3. Schedule/process coupling mismatch
   - Weekly schedule changed frequently, while generation remained topic-centric instead of profile-centric.

## Red-Team Risk Model

- If delayed schedule + manual fallback both run, duplicate generation windows appear.
- If publish verification fails post-success (especially Hashnode URL reachability), retries can create duplicate posts.
- If queue tagging drifts, profile separation can silently regress.

## Hotfixes Applied

1. Profile-centric generation
   - `generate_draft` now resolves profiles from KST schedule and selects independent queue topics per profile.
   - EN and KO are generated from different topic candidates by default on shared days.
2. Strict queue routing tags
   - `select_topic` normalization now enforces:
     - Global Dev: `[EN-Only]`
     - Productivity: `[KR-Only]`
3. Schedule-derived topic planning
   - Weekly topic mix/order derives from `config/weekly-schedule.json`, not hardcoded counts.
4. Same-day duplicate run guard
   - If same-day KST draft already exists for a profile, generation for that profile is skipped unless `ALLOW_SAME_DAY_REGEN=true`.
5. Hashnode duplicate publish mitigation
   - Hashnode public URL reachability verification is skipped by default.
   - Uncertain publish failures trigger post-check reconciliation before retry publish.

## Verification

- `node --test test/generate-draft-guardrails.test.js`
- `node --test test/select-topic-normalization.test.js`
- `node --test test/publisher-idempotency.test.js test/publish-url-verifier.test.js`
- `npm run schedule:check`
- `./scripts/ci-sanity-checks.sh`

## Operational Guidance

- Keep EN/KO schedule values in `config/weekly-schedule.json` as the single source of truth.
- After schedule changes, always run `npm run schedule:sync && npm run schedule:check`.
- During stabilization, treat "no run at exact minute" as pending until at least `T+60m` before manual fallback.
