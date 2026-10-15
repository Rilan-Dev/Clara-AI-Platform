# FIX-01 / Sentinel — Role-local memory

## Authority and scope
- Repository: `Rilan-Dev/Clara-AI-Platform`
- Branch: `feature/ai-core-from-doable-source`
- FIX-01 scope for this incident: trace the platform OAuth callback configuration defect, make the smallest safe source correction, add focused regression protection, and record evidence.
- Do not wait for DEV-01, CI, Vercel, or external gates. Route deployment, proxy-origin, database migration, and environment defects to OPS-01.
- This file is memory, not authorization. Follow the current explicit owner request and authoritative project-control documents.

## Current issue
- I-096 — OAuth callback placeholder and provider setup ambiguity.
- UI source: `src/features/admin/screens/platform-integrations-screen.tsx`.
- Validation source: `src/modules/integrations/oauth-app-validation.ts`.
- Regression source: `src/modules/integrations/oauth-app-validation.test.ts`.
- Canonical route in current source: `/api/integrations/oauth/callback`.

## Durable lessons
- Do not present a generic host/path placeholder as a provider-registration URI.
- Keep OAuth app credential setup distinct from end-user consent and connected-account readiness.
- The UI may derive the origin from the deployment, but the server must independently validate callback path and URI safety.
- Reuse the existing OAuth state/start/callback/token persistence lifecycle and Unified Tool Runtime; do not create a parallel OAuth or integration executor.
- Doable's documented platform-admin principles include exact callback registration, separate sign-in vs integration OAuth, and credential-source/readiness clarity. Do not copy its different callback routing scheme without source-level justification.

## Current evidence boundary
Source commits are recorded in `docs/project-control/ISSUES.md`, `docs/project-control/VERIFICATION_STATE.md`, and root `worklog.md`. Tests were authored but not executed. No live provider, deployment, build, or runtime PASS is claimed.


## 2026-10-10 — OAuth setup follow-up

Provider console instructions live in the pure `src/modules/integrations/oauth-setup-guides.ts` helper with regression source. Unknown IDs should not produce guessed provider links. The OAuth API may expose `credentialSource` and `secretConfigured` readiness only; never return secret bytes. Keep environment fallback deferred until credential precedence/rotation/audit semantics are designed. Tests authored in `oauth-setup-guides.test.ts` have not run because this execution environment has no checkout and GitHub DNS is unavailable. I-096 remains open.


## 2026-10-16 — KB ingest embedding: batch-contract fix lifecycle (clobber + recovery)

- Incident: the batch-contract degradation fix (embedBatch count-mismatch → sequential singles) was pushed as c40d266c at 2026-10-15 22:30 UTC, force-pushed off the branch by a stale-checkout push, and never deployed (the owner's redeploy predated the push; every Docker layer was cached). Owner evidence — old probe output without BATCH/QDRANT stages, the hard-fail "1 vectors for 20 inputs" signature, fully-cached build, containers left "Running" — proved the running image was pre-fix; the fix itself was never falsified.
- Recovery: rebased onto 977489ef as bfc7b816, preserving the parallel stale-default/ai-catalog work and their probe improvement (`body.embedding.values` parsing); restored the GEMINI_EMBEDDING_MODEL env override their reformat had dropped; probe now prints a build marker ("probe build: v3 …"). Pushed fast-forward only.
- Standing rule: never force-push feature/ai-core-from-doable-source; fetch + rebase before every push; verify the deployed artifact (git SHA → non-cached `COPY src` layer → probe v3 banner) before judging any fix.
- Open: production verification pending — owner gated deploy + Retry both documents (PoliciesEn001 embedding; SDAIA NDMO needs the probe's QDRANT stage verdict for its "[vector-store] getCollection failed" error). OpenAI key 401 and slow first-hop DNS (~4 s) are OPS-01 items, not blockers.
