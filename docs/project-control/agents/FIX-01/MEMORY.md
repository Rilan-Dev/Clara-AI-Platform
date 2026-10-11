# FIX-01 Role-Local Memory

This is durable memory for FIX-01. It supplements, but never overrides, shared APCP memory or repository authority.

## Read before work
- docs/project-control/AGENT_MEMORY.md
- docs/project-control/AGENT_EVENTS.md
- docs/project-control/AGENT_SESSIONS.md
- docs/project-control/AGENT_HANDOFF.md
- docs/project-control/AGENT_BACKLOG.md
- this file
- current project-control state and applicable architecture/plan

## Record
- recurring issues;
- role-specific mistakes and prevention;
- successful patterns;
- failed approaches;
- environment-specific observations;
- lessons that should be promoted to AGENT_MEMORY.md when cross-agent.

## Do not store
Secrets, tokens, passwords, private keys, or sensitive personal data.


### 2026-10-09 — TypeScript sibling imports in Next.js webpack

- **Issue:** Docker's Next.js webpack build could not resolve five explicit `.js` sibling import specifiers whose targets are TypeScript source files.
- **Lesson:** For affected Next.js webpack paths, match the established extensionless relative-import convention. Fix the source specifier; do not weaken webpack/build settings or treat a healthy old container as proof of a successful rebuild.
- **Evidence:** `context-builder.ts` and `runner-core.ts`; EVT-FIX-003; commits `ec1d0cd88d16e626ffbb9af7ed44a6b9e1320210` and `8da4ec31da847a9a024d27ad49c2ee53d67f0372`.
- **Verification boundary:** Source correction only; post-change build outcome remains unknown.

<!-- Append durable FIX-01 lessons below. -->


### 2026-10-09 — Follow-on unresolved TypeScript sibling imports
- **Issue:** After the first five-import correction, webpack reported additional explicit `.js` imports in `connections-manager.ts`, `runner-core.ts`, and `runner-fetch.ts` whose targets are TypeScript files.
- **Lesson:** Fix every concrete unresolved specifier revealed by the import trace, but keep the correction limited to import paths; don't weaken webpack or infer build success from an old running container.
- **Evidence:** commits `f507443805130d1068b8fe570bc0940f4e8ace1b`, `8eb329af87f1225342b10b9c299fa8163812a9eb`, `21576b8e5e3db30fd5a61325712e0d89dfe38369`.
- **Verification boundary:** Source correction only; no post-change build/test was run.


### 2026-10-09 — Third webpack import-resolution pass
- **Symptom:** Latest Docker webpack output identified imports from `execution-authorization.ts` and `runner-helpers.ts` that could not resolve.
- **Cause:** Explicit `.js` suffixes remained on imports targeting TypeScript modules, including the registry's `index.ts`.
- **Remedy:** Six import specifiers corrected to extensionless paths; no runtime logic changed.
- **Prevention:** Each fresh build log is new evidence: inspect the complete failing trace and keep the correction narrowly tied to real target files.
- **Verification:** Post-correction build not run.
- **Commits:** `d9d114c8492892ebf4ce16ae4e6d93baa8ab97a8`, `a47d087cfc5dc68251eb4c421dbdf4b1ac6c373b`.


### 2026-10-09 — OAuth token type contract
When changing OAuth consent/refresh persistence, update `OAuth2TokenData` alongside the persisted fields. The refresh path reads optional `authorization_method` to preserve HEADER/BODY client authentication; missing values remain compatible with the existing BODY fallback. Source correction: `5d0d64c22c04c32f01a44cbb0ad95b3fee7b4921`. This is not build verification.


### 2026-10-09 — Dynamic TypeScript import suffixes
A dynamic import such as `await import("./files-service.js")` can fail webpack when the actual source module is `files-service.ts`. Align the import with the extensionless TypeScript import convention used by the neighboring runtime modules. Fix demonstrated imports individually; do not infer a build PASS from source changes or an older healthy container. Correction commit: `bda45fd90379154e098d39076823829d2b741bd7`.


### 2026-10-09 — PDF.js runtime must not load during general server bootstrap
When the parser registry is imported at server startup, a static `pdf-parse` runtime import can evaluate PDF.js and fail on missing browser canvas globals such as `DOMMatrix`, even before any PDF is parsed. Keep the dependency type-only at module scope and dynamically load it inside the PDF parse method. This isolates non-PDF startup paths, but does not replace the need for a working canvas/DOMMatrix dependency during actual PDF extraction. Source commit: `cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`; runtime verification pending.


### 2026-10-10 — Missing-schema logs and shared dialog overflow
- **Symptom:** Historical PostgreSQL logs repeatedly report missing application tables and one seed foreign-key failure; modal content reportedly collapses text into vertical words/letters and cards/dialogs have poor widths.
- **Cause:** Current source already gates self-hosted pollers behind migration readiness, so the old logs most likely came from an older image or incomplete migration run; this needs current-image evidence before changing DB logic. Shared dialog primitive lacked viewport-safe sizing/scrolling and shrink-safe text wrapping.
- **Failed approaches to avoid:** Manually create missing tables, reset the database, rewrite seed ordering without fresh source evidence, or patch every modal separately.
- **Remedy:** Shared dialog primitive correction committed as `8beed2bd32c117a3e7f8594c3d17d068471a5fd8`; DB code left unchanged because its readiness guard is already present.
- **Prevention:** Confirm runtime commit and migration result before diagnosing repeated missing relations. Fix shared primitives and test narrow viewports/long content before page-specific styling.
- **Verification:** Source inspection and commit only; no test/build/browser/database/runtime PASS claimed.

### 2026-10-12 — Stripe SDK ambient declaration shadowing

- **Symptom:** Stripe APIs and fields appeared missing from TypeScript across multiple billing routes, even though `stripe@23.0.0` was installed directly.
- **Root cause:** `src/types/payments.d.ts` declared a partial ambient `"stripe"` module and replaced the package's official type surface.
- **Remedy:** Remove only the Stripe ambient module declaration; preserve the separate Razorpay declaration. Commit `34aca73cd5ad2fc5c67396d1d35f24dcf38d7964`.
- **Failed approach to avoid:** Do not downgrade or reinstall the SDK before checking for ambient module declarations. `npm ls`/ `npm explain` showed no duplicate Stripe dependency.
- **Prevention:** Never use partial `declare module` definitions to model an installed third-party SDK. Use official types or a project-owned adapter.
- **Verification boundary:** Type-check after the source correction remains pending. Other non-Stripe errors in the supplied 44-error report are separate API-compatibility/type-contract issues and must be triaged from the next compiler output.

### 2026-10-12 — Type-check follow-up
- Owner's fresh run verified the Stripe shadowing correction reduced diagnostics from 44/19 files to 33/15.
- Compatibility changes are source-only and unverified by a post-change compiler run. Wait for fresh output before claiming diagnostics resolved.
- Installed APIs: Stripe SDK v23 type literal is 2026-09-30.endive; DayPicker v10 uses month_caption / button_previous / button_next and Chevron; react-resizable-panels v4 uses Group / Panel / Separator; Recharts v3 content payload is injected at runtime; ReactMarkdown v10 styling belongs on a wrapper.
- Keep Redis options structurally inferred rather than widening to ioredis v6 RedisOptions for BullMQ v6.
- Missing ws declarations should be resolved with official @types/ws and lockfile, not an incomplete ambient declaration.
