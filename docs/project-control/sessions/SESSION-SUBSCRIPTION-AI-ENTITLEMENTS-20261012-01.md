# SESSION — Subscription AI entitlement authority audit — 2026-10-12

## Goal
Resolve the reported Sarvam session rejection and audit adjacent subscription/provider authorization risks without mutating production organisation settings.

## Source findings
- `src/modules/ai-core/resolve.ts` rejected provider selection against legacy `org_ai_settings.allowed_providers` before live governance validation. The legacy organisation AI settings PATCH returns HTTP 410, so this field can be stale.
- `src/modules/voice-core/resolve.ts` already treats `allowedVoiceProviders` as legacy compatibility data and uses platform capability/health → subscription entitlement → agent selection.
- `src/modules/ai-governance/core/entitlements-db.ts` joined capabilities, provider entitlements, and model exceptions, then limited the joined rows to 200. This could truncate entitlement rows; missing providers were implicitly allowed.
- Expired/non-active subscription fallback used Free rows but inherited the previous paid plan's `voice_enabled` fallback metadata.

## Changes made
- Removed the legacy org provider-list rejection from the AI brain resolver.
- Platform-default fallback now filters candidates through the live governance gate.
- Split entitlement queries and removed the cross-product limit.
- Missing provider rows are denied when the entitlement matrix is active; compatibility all-allowed behavior remains only when the entire provider matrix is empty.
- Expired/non-active subscriptions resolve against Free plan metadata.
- Added focused tests:
  - `src/modules/ai-core/resolve-provider-entitlement.test.ts`
  - `src/modules/ai-governance/core/entitlements-db.test.ts`

## Tracking
- GitHub issue: #296 — https://github.com/Rilan-Dev/Clara-AI-Platform/issues/296
- Branch: `fix/subscription-ai-entitlements-authority`

## Verification state
No tests, type-check, build, DB migration, production session, CI, Vercel, or deployment has been run. No PASS claimed.

## Next action
Run the two focused Vitest files, then `npm run type-check`; fix any reported failures. Then perform controlled Sarvam session checks against plans that allow and deny Sarvam. Do not expose tokens/cookies and do not wait/poll CI/Vercel.


## Additional adjacent-path finding
- `validateAgentAISelection` had a fail-open early return when a known provider was missing from the platform registry. It skipped plan entitlement checks. The function now keeps only the legacy platform-registry fallback while still checking the current subscription's capability/provider/model entitlements.
- Added a regression test in `src/modules/ai-governance/core/resolver.test.ts`.
- This correction is also unverified until focused Vitest and type-check output is available.