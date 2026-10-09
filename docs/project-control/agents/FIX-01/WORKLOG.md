# FIX-01 Role-Local Worklog

Append-only operational history for FIX-01. This is not the source of authorization.

## Entry format

### <SESSION-ID> / <DATE>
- **Task:** <task>
- **Authorization:** <reference or safe-maintenance classification>
- **Started from:** <commit/ref>
- **Actions:** <what was done>
- **Files/code:** <paths>
- **Evidence:** <tests/checks/observations>
- **Blockers/dependencies:** <none or exact>
- **Lesson:** <reusable lesson or none>
- **Next action:** <exact next action>

### SESSION-FIX-20261009-01 / 2026-10-09
- **Task:** Correct Docker Next.js webpack unresolved imports with the smallest authorized source change.
- **Authorization:** Explicit request in owner-provided incident instructions: trace root cause, make smallest authorized corrective change, add regression protection where appropriate, record incident; do not expand unrelated scope.
- **Started from:** feature/ai-core-from-doable-source; reported build ref c922529f73d129d4da1241b40cf894985bfac9dc.
- **Actions:** Recovered shared memory, central event/session records, current phase/next action/verification state and FIX-01 role-local records. Confirmed the five target TypeScript files exist. Replaced five explicit .js sibling import specifiers with extensionless relative imports.
- **Files/code:** src/modules/integrations/runtime/context-builder.ts; src/modules/integrations/runtime/runner-core.ts.
- **Evidence:** Owner-provided Next.js 16.4.0 webpack log showed the five module-not-found errors. Source commits: ec1d0cd88d16e626ffbb9af7ed44a6b9e1320210 and 8da4ec31da847a9a024d27ad49c2ee53d67f0372. No post-change tests/build/Docker rebuild executed.
- **Blockers/dependencies:** Build result after correction is unknown; no code-level blocker identified from the reported errors.
- **Lesson:** An already-running healthy container after a failed build may be the previous image; never use its health as evidence that new source compiled. Match local import specifiers to the actual Next.js webpack resolver behavior.
- **Next action:** Resume the roadmap action in docs/project-control/NEXT_ACTION.md without waiting for CI/Vercel/Gates. Rebuild only when normal verification is next run; do not claim PASS or production recovery.
 
<!-- Append new entries below. -->


### SESSION-FIX-20261009-02 / 2026-10-09
- **Task:** Diagnose and correct the follow-on Docker Next.js webpack unresolved-module errors.
- **Authorization:** Explicit owner instruction to recover current state, trace root cause, make the smallest authorized corrective change, add regression protection where appropriate, and record the incident; no unrelated scope.
- **Started from:** `feature/ai-core-from-doable-source`; owner-reported build after local pull to `992d8385`.
- **Actions:** Read shared `AGENT_MEMORY.md`, central events/sessions/issues/verification, FIX-01 role-local memory/worklog, and `NEXT_ACTION.md`. Confirmed target files exist as TypeScript siblings. Changed the remaining five explicit `.js` import specifiers in three runtime files to extensionless imports.
- **Files/code:** `src/modules/integrations/runtime/connections-manager.ts`; `runner-core.ts`; `runner-fetch.ts`.
- **Evidence:** Source commits `f507443805130d1068b8fe570bc0940f4e8ace1b`, `8eb329af87f1225342b10b9c299fa8163812a9eb`, `21576b8e5e3db30fd5a61325712e0d89dfe38369`. The reported build log is the pre-correction failure evidence. No post-correction build/test run.
- **Blockers/dependencies:** Outcome of a new Docker build is unknown; no infrastructure/daemon failure is indicated by the shown webpack errors.
- **Lesson:** Correct only the concrete failing imports; deeper imports can surface after earlier failures are removed. A running old container is not evidence that new source compiled.
- **Next action:** Resume `docs/project-control/NEXT_ACTION.md`; do not wait for CI/Vercel/Gates and do not claim PASS or production recovery.


### SESSION-FIX-20261009-03 / 2026-10-09
- **Task:** Resolve the next concrete webpack missing-module failures.
- **Authorization:** Owner instruction to trace root cause, make the smallest authorized correction, record evidence/lessons/next action, and avoid unrelated scope.
- **Started from:** `feature/ai-core-from-doable-source`; latest user build had pulled through `0009c3bf`.
- **Actions:** Read the current project-control context and inspected the five failing import specifiers in the latest build log. Confirmed the registry module exists as `src/modules/integrations/registry/index.ts` and the other targets are sibling TypeScript modules. Changed six explicit `.js` imports in two files to extensionless imports.
- **Files:** `src/modules/integrations/runtime/execution-authorization.ts`; `src/modules/integrations/runtime/runner-helpers.ts`.
- **Evidence:** commits `d9d114c8492892ebf4ce16ae4e6d93baa8ab97a8` and `a47d087cfc5dc68251eb4c421dbdf4b1ac6c373b`. The provided log is pre-correction evidence. No post-correction build/test run.
- **Failed approach:** Earlier batches corrected only the modules surfaced by earlier logs; deeper explicit suffixes remained.
- **Lesson/prevention:** Continue tracing each fresh webpack failure through the importing file; don't infer build success from a healthy stale container.
- **Next action:** Continue the owner-authorized roadmap in `NEXT_ACTION.md`; do not wait for CI/Vercel/Gates and do not claim PASS.


## 2026-10-09 — OAuth token contract type alignment
- **Symptom:** Runner refresh reads `creds.authorization_method`, but `OAuth2TokenData` omitted that property, leaving the persisted OAuth client-auth mode outside the declared contract.
- **Root cause:** The OAuth consent/refresh contract evolved to persist HEADER/BODY mode without updating the shared runner token type.
- **Failed approaches:** None in this slice; no runtime build was run.
- **Remedy:** Declared optional `authorization_method?: "HEADER" | "BODY"` in `OAuth2TokenData` (commit `5d0d64c22c04c32f01a44cbb0ad95b3fee7b4921`). Optionality preserves compatibility with older token records; absent mode continues to use BODY behavior.
- **Prevention:** Keep persisted OAuth fields and the shared token interface updated together when consent or refresh semantics change.
- **Evidence:** Source diff/commit only. No build/test/typecheck/CI/Vercel/deployment PASS claimed.
- **Next action:** Continue the authorized P1/P2 integration-runtime work from `NEXT_ACTION.md`; inspect existing typed tool contracts before adding idempotency and approval/policy hooks. Do not add a second executor or wait for external gates.
