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
