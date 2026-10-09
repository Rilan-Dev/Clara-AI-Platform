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
