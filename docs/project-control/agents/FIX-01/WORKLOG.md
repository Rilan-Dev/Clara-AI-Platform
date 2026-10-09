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


## 2026-10-09 — Docker build: files-service module resolution
- **Symptom/evidence:** User's actual Docker build failed with webpack `Module not found: Can't resolve './files-service.js'` from `src/modules/integrations/runtime/runner-helpers.ts`; trace continued through `runner-core.ts` → integration tool bridge → chat route.
- **Root cause:** The runtime file is `files-service.ts`, but a dynamic import used a `.js` suffix inconsistent with this TS source/build setup.
- **Failed approaches:** Earlier import-suffix corrections addressed several sibling imports but missed this dynamic import; this is another distinct occurrence, not proof of broader build success.
- **Remedy:** Changed the import to extensionless `./files-service` (commit `bda45fd90379154e098d39076823829d2b741bd7`).
- **Prevention:** When a webpack error points to a TS module, inspect all static and dynamic imports in the implicated runtime module for explicit `.js` suffixes, but correct only demonstrated failures and avoid blanket replacements.
- **Evidence status:** User-provided build output is the failure evidence; source correction commit is the remedy evidence. No post-fix build/test/typecheck/CI/Vercel/deployment PASS is claimed. Existing container being healthy is an older running instance and does not verify the new image.
- **Next action:** Continue planned source work without waiting for external gates; when the ordinary Docker build is run again, address the next error from its actual output.
### SESSION-FIX-20261009-04 / 2026-10-09
- **Task:** Diagnose the owner-provided self-hosted backend logs and isolate PDF.js startup failure.
- **Authorization:** Owner supplied runtime logs in the active FIX-01 continuation; narrow source correction and incident recording.
- **Started from:** `feature/ai-core-from-doable-source`; latest known local container had been running for 14 hours, so its source/image age is not assumed current.
- **Actions:** Recovered project-control state and inspected migration tree, startup instrumentation, PDF parser, parser factory, and Dockerfile. Current branch contains a unique migration prefix 063 plus migration 065; the duplicate-063 runtime log likely comes from a different/older image bundle, but the exact image source commit is unknown. The OAuth table error is consistent with migration startup aborting before 065.
- **Files/code:** `src/modules/ingest/parsers/pdf.ts` now uses a type-only `PDFParse` import and dynamically loads `pdf-parse` only during `PDFParser.parse()`.
- **Evidence:** Owner log reports `DOMMatrix is not defined` and missing `@napi-rs/canvas`; source correction commit `cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`.
- **Failed approaches:** None attempted in runtime; no Docker commands were run from this session. Do not treat lazy loading as proof that PDF extraction itself works.
- **Next action:** When rebuilt from current branch, inspect any remaining duplicate migration prefix in the actual image; if a real PDF parse still fails on DOMMatrix, resolve the production PDF.js canvas runtime dependency.


### SESSION-FIX-20261009-04 / 2026-10-09
- **Task:** Diagnose owner-provided self-hosted backend logs and isolate the PDF.js startup failure.
- **Authorization:** Owner supplied runtime logs in the active FIX-01 continuation; narrow source correction and incident recording.
- **Started from:** `feature/ai-core-from-doable-source`; current local container age is 14 hours, so its image is not assumed current.
- **Actions:** Inspected migration tree, startup instrumentation, PDF parser, parser factory, and Dockerfile. Current branch contains one migration prefix 063 and includes migration 065; the duplicate-063 log likely comes from a different/older image bundle, but the exact image source commit is unknown. The OAuth table error is consistent with migration startup aborting before migration 065.
- **Files/code:** `src/modules/ingest/parsers/pdf.ts` now uses a type-only `PDFParse` import and dynamically loads `pdf-parse` only during `PDFParser.parse()`.
- **Evidence:** Owner log reports `DOMMatrix is not defined` and missing `@napi-rs/canvas`; source correction commit `cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`.
- **Failed approaches:** No runtime commands were run. Do not treat lazy loading as proof that PDF extraction itself works.
- **Next action:** When rebuilt from current branch, inspect any remaining duplicate migration prefix in the actual image; if a PDF parse still fails on DOMMatrix, resolve the production PDF.js canvas runtime dependency.

- **Follow-up dependency correction:** The lockfile already contained `@napi-rs/canvas@0.1.80` and platform-specific optional packages, but it was not a direct root dependency. Declared `@napi-rs/canvas@^0.1.80` in `package.json` and synchronized the root dependency list in `package-lock.json` (commits `3f1b5db3fdf5b009e05ca5b03ae197cc26af9338`, `9fa3a134e4492de0ba8ab2f323a3df1e7984b85b`). This improves dependency inclusion but remains unverified in the standalone Docker image.


### SESSION-FIX-20261009-05 / 2026-10-09
- **Task:** Diagnose PostgreSQL missing-relation logs and stop background consumers from repeatedly querying a schema after migration failure.
- **Authorization:** Owner supplied runtime evidence during FIX-01 continuation; narrow corrective maintenance.
- **Started from:** `feature/ai-core-from-doable-source`; recovered `CHAT_CONTINUITY.md` and `NEXT_ACTION.md`.
- **Actions:** Inspected migration runner, current migration filenames, node instrumentation, production seed, demo seed, and Dockerfile. Current migration directory has one `063` file and contains migration 065; current production seed upserts the demo organisation before its agent. Updated startup so background consumers only start after successful migrations.
- **Files/code:** `src/instrumentation.node.ts`.
- **Evidence:** Commit `039847f0c6cd8496dcdeec163eb087b366f52f9b`. Owner logs remain evidence from a running image of unknown source commit. No tests/build/DB operations executed.
- **Lesson:** A migration failure that is logged and swallowed must not be followed by DB consumers that assume the schema is ready. Keep HTTP available for diagnosis but gate background DB workloads.
- **Next action:** Rebuild current branch; inspect fresh migration output. If duplicate 063 persists, inspect the packaged migration directory. If the organisation FK failure persists, capture current seed stage output before modifying seed/data.
