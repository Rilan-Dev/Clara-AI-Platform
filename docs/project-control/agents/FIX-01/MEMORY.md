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
