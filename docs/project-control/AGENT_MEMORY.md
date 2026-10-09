# APCP Shared Agent Memory

This is the shared, durable memory layer for all APCP agents. It is a memory/lessons record, not an authorization source.

## Authority order

1. Current explicit owner requirement
2. Repository-local governing instructions
3. GitHub committed source/state
4. Active authorization and project-control state
5. This shared memory
6. Per-agent memory
7. Chat/session memory

Memory never overrides current requirements, authorization, or repository truth.

## Purpose

Record reusable lessons so a newly invoked agent can avoid repeating known mistakes without needing a previous chat.

Record:
- recurring bugs and root causes;
- failed approaches and why they failed;
- successful remedies;
- regression-prevention rules;
- environment/deployment lessons;
- cross-agent lessons that materially affect future work.

Never record secrets, tokens, passwords, private keys, or sensitive personal data.

## Read-first rule

Every invoked agent reads this file before starting work, then reads its own role-local MEMORY.md and WORKLOG.md. The agent also reads AGENT_EVENTS.md, AGENT_SESSIONS.md, AGENT_HANDOFF.md, and AGENT_BACKLOG.md when relevant.

## Entry format

Append lessons under the owning agent section:

- **Date/session:** <date / session id>
- **Agent:** <agent id>
- **Issue/symptom:** <what happened>
- **Root cause:** <confirmed cause>
- **Failed approach:** <what did not work and why>
- **Remedy:** <what worked>
- **Prevention:** <how future agents should avoid recurrence>
- **Related record:** <issue/event/commit/path>

## Agent memory sections

### DEV-01 / Forge


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-01
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** Realtime voice exposed only `rag_search`; integration tools could not be invoked by a live voice session.
- **Root cause:** The Realtime session descriptor list and browser tool-call handler were not connected to the existing server-side integration runtime.
- **Failed approach:** Treating client-supplied KB/tenant/agent identity or a model tool descriptor as sufficient authorization would bypass server-side provenance and tenant boundaries.
- **Remedy:** Gate descriptors behind both existing default-off flags and authenticated KB membership; submit calls to a same-origin route that derives org/agent/user/session identity from server state and invokes the existing Unified Tool Runtime.
- **Prevention:** Every voice tool call must pass server authentication, KB access checks, a factory-minted execution context, and the existing runtime; public embed sessions must not receive these workspace integration tools.
- **Related record:** `src/modules/assistant/api/realtime-tool.ts`; source commits a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.

<!-- Append durable development lessons here. -->

### DEV-01 / 2026-10-09 — OAuth token refresh contract
- **Issue/symptom:** A provider OAuth token exchange may succeed with client credentials sent via HTTP Basic, but later refresh can fail if the runtime always places credentials in the form body.
- **Root cause:** OAuth client-auth mode was not preserved in the stored connection credential contract.
- **Remedy:** Persist `authorization_method` with OAuth2 token data and make both authorization-code exchange and refresh honor the provider registry's HEADER/BODY setting.
- **Prevention:** When adding an OAuth consent flow, review the full token lifecycle (authorization code, refresh, expiry, reconnect), not only the initial exchange. Never log token endpoint response bodies or credentials.
- **Related record:** `src/app/api/integrations/oauth/callback/route.ts`; `src/modules/integrations/runtime/runner-helpers.ts`; `src/modules/integrations/types.ts`.

### FIX-01 / Sentinel

- **Date/session:** 2026-10-09 / SESSION-FIX-20261009-01
- **Agent:** FIX-01 / Sentinel
- **Issue/symptom:** Docker production build failed resolving five relative TypeScript modules: `store.js`, `files-service.js`, `connections-manager.js` from `context-builder.ts`, and `action-input-validation.js`, `error-normalization.js` from `runner-core.ts`.
- **Root cause:** The source used explicit `.js` suffixes for sibling modules implemented as TypeScript files; Next.js webpack did not resolve those five imports in this build path. The target `.ts` modules exist in the same runtime directory.
- **Failed approach:** Rebuilding the image without correcting source could not change module resolution; bringing the service up with `--no-deps` merely left the previous healthy container running and was not evidence that the new source built.
- **Remedy:** Changed only those five relative imports to extensionless paths, consistent with the other runner-core imports and the existing Next.js webpack path.
- **Prevention:** For this Next.js webpack runtime, keep local TypeScript sibling imports extensionless where the build resolver does not map explicit `.js` specifiers to `.ts`. Do not weaken the build or substitute a stale container for a successful image build.
- **Related record:** `src/modules/integrations/runtime/context-builder.ts`; `src/modules/integrations/runtime/runner-core.ts`; commits `ec1d0cd88d16e626ffbb9af7ed44a6b9e1320210`, `8da4ec31da847a9a024d27ad49c2ee53d67f0372`; EVT-FIX-003.

<!-- Append durable error/root-cause lessons here. -->

### OPS-01 / Shipwright
<!-- Append durable CI/CD/deployment/infrastructure lessons here. -->

### WORK-01 / Rover
<!-- Append durable daily-worker/maintenance lessons here. -->

### OPS-01 / 2026-10-09
- **Issue/symptom:** Vercel clara-backend build failed during db:migrate with duplicate migration number 060.
- **Root cause:** deployment commit 4ea79c3b3bbb5202a25f2411b63471354200b01d introduced a second 060 migration while 060_sarvam_realtime_streaming.sql already existed; the migration runner correctly rejects duplicate numeric prefixes.
- **Failed approach:** treating the failure as Vercel infrastructure and bypassing db:migrate or weakening the guard.
- **Remedy:** route the migration-source correction to FIX-01 and preserve the fail-closed guard.
- **Prevention:** distinguish deterministic repository migration failures from Vercel platform failures before changing deployment configuration.
- **Related record:** EVT-OPS-001; BACKLOG-OPS-001; deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf.

## Memory conflict rule

If shared memory conflicts with current repository state or current requirements, ignore the stale memory, record the conflict in AGENT_EVENTS.md or ISSUES.md when material, and follow current repository truth.

### OPS-01 / 2026-10-09 — split deployment paths
- **Issue/symptom:** Vercel-Preview and feature/ai-core-from-doable-source had different active failures even though both had historical migration/Tailwind blockers recorded.
- **Root cause:** Vercel-Preview was at an older divergent source state with a missing CliLog import and incomplete seed dependency set; the feature branch Dockerfile had a brittle assumption that ioredis transitive dependencies are top-level hoisted.
- **Remedy:** Diagnose each deployment path against its exact branch/commit and route application/build defects to FIX-01; do not change Vercel infrastructure or weaken Docker/npm reproducibility.
- **Prevention:** Always inspect the actual deployed ref and latest build stage before relying on prior incident records.
- **Related record:** EVT-OPS-003; EVT-OPS-004; HANDOFF-OPS-20261009-02.


### FIX-01 / 2026-10-09 — Follow-on webpack sibling import failures
- **Date/session:** 2026-10-09 / SESSION-FIX-20261009-02
- **Agent:** FIX-01 / Sentinel
- **Issue/symptom:** Docker's Next.js 16.4.0 webpack build still reported unresolved `credential-vault.js`, `execution-authorization.js`, `runner-helpers.js`, and `error-normalization.js` imports after an earlier five-import correction.
- **Root cause:** Three runtime files still used explicit `.js` suffixes for sibling modules implemented as TypeScript source: `connections-manager.ts`, `runner-core.ts`, and `runner-fetch.ts`. The import traces exposed the exact remaining specifiers.
- **Failed approach:** The prior correction only addressed the five imports shown in the earlier build log; it did not cover newly exposed sibling imports in the dependency chain. Re-running Docker without source changes cannot fix resolution.
- **Remedy:** Converted the five remaining relative imports in those three files to extensionless paths, matching the already established local webpack convention.
- **Prevention:** When a module-resolution build error moves deeper through the import graph, inspect each exact failing specifier and its source extension; don't assume the previous batch covered the whole dependency chain.
- **Related record:** `connections-manager.ts`, `runner-core.ts`, `runner-fetch.ts`; commits `f507443805130d1068b8fe570bc0940f4e8ace1b`, `8eb329af87f1225342b10b9c299fa8163812a9eb`, `21576b8e5e3db30fd5a61325712e0d89dfe38369`.


### FIX-01 / 2026-10-09 — Third webpack import-resolution pass
- **Date/session:** 2026-10-09 / SESSION-FIX-20261009-03
- **Issue/symptom:** The next owner-provided Docker build exposed five further unresolved imports in `execution-authorization.ts` and `runner-helpers.ts`: registry index, error normalization, credential vault, runner fetch, and runtime types.
- **Root cause:** These files retained explicit `.js` suffixes for TypeScript source imports; the registry import used an explicit `../registry/index.js` despite the actual registry being `src/modules/integrations/registry/index.ts`.
- **Failed approach:** Correcting only import statements reported in previous webpack output left deeper dependency imports unresolved. The newly pasted build was run against the prior correction state and did not include this newest correction.
- **Remedy:** Changed only the six remaining explicit `.js` import specifiers in the two affected files to extensionless paths.
- **Prevention:** Follow each fresh webpack import trace to the importing file and compare the resolved target path and extension; do not stop at the first layer or treat an old running container as proof.
- **Related record:** `execution-authorization.ts`, `runner-helpers.ts`; commits `d9d114c8492892ebf4ce16ae4e6d93baa8ab97a8`, `a47d087cfc5dc68251eb4c421dbdf4b1ac6c373b`; I-092.
