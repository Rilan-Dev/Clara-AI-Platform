## 2026-10-12 — DEV-01 live model catalogue continuation

- DEV-01/Forge continued the owner-authorized Gemini live model catalogue and ElevenLabs realtime TTS task on `feature/ai-core-from-doable-source`.
- Committed live catalogue metadata enrichment, successful-discovery stale model reconciliation, model-read synchronization, guarded ranking by known price/release metadata, live Gemini realtime selection in authenticated and embed session routes, live ElevenLabs realtime TTS resolution, and regression fixture updates.
- Source changes are committed; verification is pending. No tests/typecheck/build/migration/live API/CI/Vercel/deployment/browser run or PASS is claimed.
- Remaining: remove remaining static selectable Gemini lists/defaults in the legacy core catalogue/seed paths, ensure every UI consumes live provider capability results, add focused regressions, and run local focused checks when available.
- Related session: `docs/project-control/sessions/SESSION-DEV-20261012-01.md`. Exact next action is at the top of `docs/project-control/NEXT_ACTION.md`.

## 2026-10-09 — DEV-01 / Forge — realtime voice dispatch architect review

- **Role:** DEV-01 / Forge; performed the bounded architect-review action recorded in `NEXT_ACTION.md`.
- **Branch:** `feature/ai-core-from-doable-source`.
- **Review scope:** `src/modules/assistant/api/realtime.ts`, `src/modules/assistant/api/realtime-tool.ts`, `src/app/api/realtime/tool/route.ts`, `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`, and the authored realtime regression sources.
- **Outcome:** PASS_WITH_FOLLOWUP — SOURCE REVIEW ONLY. No substantial defect requiring FIX-01 handoff was identified.
- **Reviewed invariants:** default-off dual flags; fixed two-tool allowlist; authenticated non-platform-admin; KB membership and `kb:read`; server-derived org/agent/user/session identity; body-supplied identity ignored; shared Unified Tool Runtime; embed-key sessions explicitly blocked in the client dispatch.
- **Verification:** source review only. Tests/typecheck/build/CI/Vercel/Gates/deployment were not executed or awaited.
- **Lesson:** a model-provided function call is untrusted input; browser checks improve UX but the authenticated server route and Unified Tool Runtime remain the enforcement boundary.
- **Blockers/evidence gap:** focused regressions have not been executed; this review does not prove runtime correctness or deployment readiness.
- **Exact next action:** stop and await the next owner-authorized bounded task. Do not start unrelated implementation, a new phase, or deployment.

# Clara Project Worklog

## 2026-10-08 — I-6 MCP Tool Bridge implementation

- Owner instruction: continue next implementation without waiting for GitHub Actions, Vercel, continuous verification, or phase gates.
- Repository review established that I-3 is already implemented and I-4/I-5 are source-complete; they are not restarted.
- Started I-6: bounded MCP Tool Bridge.
- Added `docs/superpowers/plans/2026-10-08-integrations-i6-mcp-tool-bridge.md`.
- Added `src/modules/ai-platform-core/mcp-tool-bridge.ts`.
- Added `src/modules/ai-platform-core/mcp-tool-bridge.test.ts`.
- Exported I-6 bridge types/functions from `src/modules/ai-platform-core/index.ts`.
- Added project-control session `SESSION-060.md`.
- Reconciled the authoritative project-control headers to I-6 active state.
- I-6 is source implementation IN PROGRESS; no external gate or build result is claimed.
- Non-scope: MCP transport/server hosting, OAuth/persistence, marketplace, billing redesign, production promotion, unrelated features.

### I-6 continuation — MCP resolver identity hardening
- `aa062df`: resolver output must exactly match the already-allowlisted server/tool identity; mismatched descriptors are rejected before registration.
- `fb326688`: focused regression covers resolver identity drift.
- External execution remains deferred by owner instruction.

### I-6 continuation — runtime/seam hardening
- `b59f1c9`: focused regressions now prove MCP execution preserves the exact caller execution context and that invalid input is rejected by the Unified Tool Runtime before resolver invocation; resolver server/tool identity drift is covered.
- `827eae5`: MCP resolver discovery exceptions now fail closed instead of escaping as provider/transport errors.
- `d571813`: regression covers unavailable resolver discovery.
- `0b1856b`: public `src/modules/ai-platform-core/index.ts` now exports the I-6 MCP bridge; this corrected a source-level seam gap found during architect review.
- Project-control current-state blocks were reconciled to I-6 and the stale Part-II Z.AI handoff state was removed; Z.AI remains STOPPED and ChatGPT remains implementation owner.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction.

### I-6 bounded hardening — 2026-10-08
- Source review found two bridge fail-closed gaps: explicit empty surface allowlists widened to the default surface set, and sanitized server/tool identifiers could collide.
- `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6` fixes both boundaries: omitted surfaces use the default, explicit empty surfaces deny all; normalized names carry an identity-derived suffix within the 64-character contract.
- `d4bfbe112863696c99ad7abb81857a9399f079c2` adds focused regressions for both cases.
- Session: `docs/project-control/sessions/SESSION-061.md`.
- External CI/Vercel/Gate-C/Gate-D remain deferred; I-6 stays IN PROGRESS.

### I-6 authorization-surface contract hardening — 2026-10-08
- Replaced the exported `authorizeMcpTool()` helper with `isMcpToolAllowlisted()` because the former name implied full authorization while only evaluating static server/tool allowlists.
- `6d37d607689a3379a253659ebd50046d6b1b8727`, `f6454910c436d14b29c768180f344e02159dd908`, and `8504c42a058fce9c8e38979c3d93899fd95345a2` align implementation, regression, and public export.
- Full surface/identity/RBAC/plan/tenant authorization remains owned by the Unified Tool Runtime.


### I-6 continued source hardening — 2026-10-08
- `635b5126`: resolved MCP capabilities are now bound to the exact provenance-verified execution-context identity used during resolver discovery; cross-context invocation fails closed with `TENANT_SCOPE_VIOLATION`.
- `55e7f36c`: regression covers cross-context invocation against a different tenant context.
- `02bff62a`: regressions cover default-off runtime construction and registration through the Unified Tool Runtime.
- `9eb58ab6`: malformed resolver descriptors are treated as unavailable capabilities when Unified Tool Runtime registration rejects them; unrelated valid capabilities can still register.
- `ddaa02bc`: regression covers malformed resolver schema output.
- Project-control NEXT_ACTION/PROJECT_STATE/VERIFICATION_STATE records updated.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction; no PASS/closure is claimed.

## 2026-10-08 — I-6 malformed surface allowlist + direct-context test correction

[architect-verified] Continued the owner-authorized I-6 source acceptance review without waiting for external CI/Vercel/Gate-C/Gate-D evidence. The MCP bridge now treats any malformed `allowedSurfaces` entry as a fail-closed registration error rather than silently discarding unknown values. A focused test also aligns direct allowlist-rejection construction with the required provenance-minted execution-context contract.

- Implementation: `030e905833097211adc0b69d202223c5e1f69de1`.
- Regression: `8b59963f594beac5980f2b1178b85400261642ab`.
- Test-contract correction: `b307056aa67c54024bc18b010d95ca13eec9ce73`.
- I-6 remains IN PROGRESS — bounded source hardening.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction.
- Next implementation remains bounded I-6 resolver/registration and capability-authorization acceptance review.


### I-6 / runtime configuration correction — 2026-10-08
- Replaced the fragile Next TypeScript config boundary with explicit ESM `next.config.mjs` and `process.cwd()` root resolution; removed the old `next.config.ts`.
- Removed the obsolete Next 16 `eslint` build option.
- Hardened the MCP bridge against malformed runtime policy/descriptor shapes and added focused regressions.
- No external CI, deployment gate, or continuous verification was awaited.


## 2026-10-09 — Self-hosted Clara CSS regression hotfix

- Inspected the live public site and latest `feature/ai-core-from-doable-source` source.
- Confirmed dependency configuration uses `tailwindcss@4.3` and `@tailwindcss/postcss@4.3.3`, while `src/app/globals.css` used legacy v3 `@tailwind base/components/utilities` directives.
- Corrected the CSS entry to `@import "tailwindcss";` plus `@config "../../tailwind.config.js";` so Tailwind v4 generates utilities using the existing design-token configuration.
- Commit: `449afb73ea2a111c633c91dcd34e03f9d6a7480c`.
- The Dockerfile already copies `.next/static` into the runner image. The host's Docker build/recreate and HTTP asset verification remain pending because no SSH/server execution tool is available in this chat. No live deployment success is claimed.
- Immediate next action: pull the commit on the Docker host, rebuild/recreate `clara-backend`, and verify the served CSS assets.


## 2026-10-09 — Responsive login card hotfix

- Owner reported that the login page lost responsiveness and the card layout looked incorrect.
- Updated `src/features/admin/screens/login-screen.tsx`: small/dynamic viewport-safe minimum height, vertical padding for short screens, horizontal overflow protection, min-width-safe card wrapper, responsive header spacing, and explicit card padding that avoids the mobile `p-5` density override.
- Source commit: `4d6a9720383a77374d59a326a509a83940a3fa0c`.
- Project-control NEXT_ACTION now prioritizes Docker rebuild and visual checks on mobile/narrow and short viewports.
- No tests, build, device/browser validation, or self-hosted Docker deployment was run. Live fix remains pending rollout.


## 2026-10-09 — DEV-01 / Forge — realtime voice integration dispatch

- **Authorization:** Current `docs/project-control/NEXT_ACTION.md` bounded integration-runtime task; realtime voice dispatch through the Unified Tool Runtime was the explicit next implementation.
- **Started from:** `feature/ai-core-from-doable-source`, recovered from current committed project-control state.
- **Actions:** Added gated realtime integration tool descriptors, an authenticated server-side tool dispatch route, voice-client dispatch handling, and focused regression source for descriptor gating, tenant identity derivation, authorization, and runtime delegation.
- **Files/code:** `src/modules/assistant/api/realtime.ts`; `src/modules/assistant/api/realtime-tool.ts`; `src/app/api/realtime/tool/route.ts`; `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`; `src/modules/assistant/api/realtime.test.ts`; `src/modules/assistant/api/realtime-tool.test.ts`.
- **Implementation commits:** a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.
- **Evidence:** Source files and test source were inspected after edits. Tests/build were not executed; no CI/Vercel/Gates were awaited.
- **Blockers/dependencies:** Architect review pending. No deployment performed.
- **Lesson:** Realtime model tool descriptors are not an authorization boundary; every tool call must re-enter a same-origin authenticated endpoint and derive tenant/agent/user/session identity server-side before invoking the shared runtime.
- **Next action:** Architect review this bounded implementation; route any substantial defect to FIX-01. No unrelated implementation is authorized by this task.


## 2026-10-11 — Integrations settings page: configure-before-enable + MCP settings menu

- **Owner instruction (session task):** fix the Integrations settings page — most integrations had no configuration entry, everything was default-enabled, the layout was not responsive, and the MCP panel sat exposed at the top of the page; move MCP management into a dedicated settings menu. Referenced the doable-source control plane and the lovable design guidance.
- **Branch:** `feature/ai-core-from-doable-source`.
- **Control-plane parity with doable source (`integrations-admin.ts`):**
  - `src/modules/integrations/platform-credentials.ts` derives the credential fields a platform admin must supply (secret_text → API key; basic_auth → username/password; custom_auth → registry `customAuthFields`) and the `isPlatformConfigured` predicate (oauth2+requiresOAuthApp → platform OAuth app row; non-OAuth → platform credential row; none → always configured).
  - Focused regression suite `src/modules/integrations/platform-credentials.test.ts` (14 tests) covers field derivation, the configured predicate, input validation, and auth-type predicates.
- **Migration `071_platform_integration_credentials.sql`:** creates `platform_integration_credentials` (pgp_sym_encrypt with the server ENCRYPTION_KEY, same scheme as platform OAuth apps), flips `platform_integrations.enabled` default to FALSE, and resets seed-default-enabled rows that were never actually configured (OAuth-configured integrations keep their state). Idempotent; auto-discovered by the migration runner.
- **API:** `GET/PATCH /api/platform/integrations` now reports `configured` and rejects enabling an unconfigured integration with `INTEGRATION_NOT_CONFIGURED` (400). New `GET/PUT/DELETE /api/platform/integrations/[integrationId]/credentials` loads field shapes, upserts encrypted credentials, and disables the integration when credentials are removed so the configured/enable invariant cannot drift. All routes are super-admin gated and never return decrypted secret material.
- **Production seed:** `seedPlatformIntegrations` no longer force-enables the catalog; rows are inserted disabled and re-runs preserve admin-chosen enablement.
- **Settings → Integrations screen:** rebuilt responsive card grid (min-w-0 guards, flex-wrap action rows, 1/2/3-column grid, responsive filter bar with search + category + status tabs). Cards show Enabled / Ready to enable / Not configured state; the enable/disable toggle only renders after configuration; unconfigured cards show a Configure / Set up OAuth action that opens the matching dialog (OAuth app dialog for oauth2, encrypted credentials dialog for secret_text/basic_auth/custom_auth with remove-credentials flow).
- **MCP moved to a dedicated settings menu:** the MCP servers panel that sat at the top of the Integrations page was removed; `Settings → AI & voice → MCP servers` (`/settings/mcp`) now hosts a full screen with register-server dialog (registers disabled by default), tool allowlist approve/revoke, and enable/disable. The organisation-level MCP panel moved to the bottom of the organisation integrations page where org-scoped credential management belongs.
- **Toolchain:** `tsconfig.json` drops `baseUrl` — removed in TypeScript 7 (TS5102); `paths` resolve relative to the tsconfig as before.
- **Verification performed:** vitest platform-credentials suite 14/14 PASS; full integrations module suite shows the same 10 pre-existing runtime-test failures as the clean HEAD baseline (no regression); `tsc --noEmit` reports zero errors in every touched file (85 pre-existing errors in unrelated files both before and after); stylesheet guard 8/8 PASS. Full `next build` was attempted three times and OOM-killed by the sandbox's 4 GB limit — not a code failure; Docker rebuild on the deployment host remains the owner's rollout step.
- **Not done / pending owner action:** deploy-side migration run, Docker rebuild, live UI walkthrough of the new configure flows, and runtime OAuth verification remain pending. No CI/Vercel/Gate result is claimed.


## 2026-10-11 — MCP management: live discovery, edit/delete, org connection test, screen rebuilds

- **Owner instruction (session task):** both MCP screens and the integrations page had poor UI/UX; MCP servers could not be edited or deleted; the n8n MCP connection to https://n8n.ostechnologies.in/mcp-server/http could not be made to succeed. Reference the doable source for the production-ready MCP flow (logic + UI), then develop, test, and verify.
- **Doable-source reference adopted:** MCP panel spec (`UI_CAPABILITY_MATRIX.md`) — list, refresh, active/inactive, reconnect/test, delete, loading, empty, error states; add-server form with auth + discovery + validation; connector-card expandable pattern with status dots, transport badges, tool counts, confirm-delete. Backend pattern from `services/api/src/routes/connectors.ts` — POST /test that runs a live handshake and caches the discovered tool list, DELETE with runtime cleanup.
- **Root cause of "cannot connect n8n":** the org connect action only stored encrypted credentials with status 'configured'; nothing transitioned to 'connected' outside a chat-time dispatch, which itself requires pre-approved tool rows that could not be known without discovery (chicken-and-egg), plus ENABLE_MCP. The settings UI offered no live handshake at all.
- **Resolver (`mcp-streamable-http-resolver.ts`):** added exported `probeStreamableHttpServer()` — a live initialize → notifications/initialized → paginated tools/list handshake sharing the hardened transport (DNS re-resolution, private-range rejection, pinned sockets, no redirects, 8s/1MB bounds), with actionable error fidelity (HTTP 401/403/404/405 hints, JSON-RPC error surfacing, stable error codes) and no token logging. Protocol negotiation now accepts the known MCP revisions (2024-11-05, 2025-03-26, 2025-06-18) per spec instead of exact-equality on one string. Also fixed pre-existing type errors (LookupFunction import moved to node:net; auth header Record typing) — module typecheck errors 7 → 0.
- **Platform API:** new `POST /api/platform/mcp-servers/test` (super-admin; probes a registered server or a raw endpoint before registration; never echoes the token). New `DELETE` handler removing a server with its full cascade (tools, org connections, org/agent grants — all ON DELETE CASCADE from migration 069). POST displayName typing fixed.
- **Org API (`/api/orgs/[orgId]/mcp-servers`):** new `test` action — decrypts the stored org credentials, runs the live probe, and records `connected` + `last_connected_at` or `error` + `last_error_code` (credentials kept so a rotated token just needs re-entry). GET query now typed (fixes pre-existing TS2345).
- **Screens rebuilt on the doable pattern:** platform MCP screen — expandable server cards (status dot, tool-count chip, endpoint, details grid), register/edit dialog with **Discover tools** (live handshake; select discovered tools to import into the allowlist), per-server Test connection with an optional API key field, Approve-all/Approve/Revoke tools, enable/disable, and confirm-delete. Org MCP panel — status chips (Connected / Credentials saved / Error / Not connected), connect dialog for the bearer token, **Test connection** with discovered-tool feedback, grant/revoke tool toggles, confirm-disconnect. Integrations screen — stats row, refresh button, loading state.
- **Critical packaging fix:** `.gitignore` rule `mcp-servers` (added in ed3890bc for the top-level vendored dir) silently ignored ANY path named mcp-servers — the new `src/app/api/platform/mcp-servers/test/route.ts` would not have been committed. Scoped to `/mcp-servers`.
- **Verification performed:** resolver suite 36/36 PASS (18 new probe tests); integrations suite 14/14 PASS; ai-platform-core suite shows the same 12 pre-existing failures as clean HEAD with 6 additional passing tests and zero new failures; `tsc --noEmit` clean in every touched file (total errors 85 → 78, all remaining pre-existing in untouched files); stylesheet guard 8/8 PASS; **live probe executed against the real n8n endpoint** — DNS/range checks pass and the unauthenticated call returns the intended actionable result (`HTTP 401 — check the API key / bearer token`, errorCode MCP_UNAUTHORIZED, ~800ms). A full tools/list round-trip requires the owner's real n8n API key, which is not present in this environment.
- **Owner rollout steps for n8n:** pull on the Docker host → rebuild → register/edit the n8n server (auth mode: org bearer token) → Discover tools with the n8n API key (n8n Settings → n8n API) → approve the imported tools → enable the server → org: connect with the key → Test connection (expect Connected + tool list) → grant tools to the org/agents → set ENABLE_MCP=1 for runtime dispatch. No CI/Vercel/Gate result is claimed; full `next build` remains blocked by the sandbox 4 GB OOM limit.

## 2026-10-11 — MCP platform credentials + OAuth 2.1 sign-in (Task C round 3)

User report: registration was n8n-specific, the discovery API key was never stored
(test-by-serverId returned 401 MCP_UNAUTHORIZED), and OAuth-login MCP servers
could not be connected at all.

- Migration 072: `platform_mcp_servers.auth_mode` gains `oauth`; new encrypted
  `platform_credentials_encrypted` (bearer token or OAuth token set), oauth
  status/error/connected-at columns, and one-time `platform_mcp_oauth_states`
  (SHA-256 state digest, encrypted PKCE verifier + client secret) mirroring
  migration 066; idempotent.
- New `mcp-oauth.ts`: MCP-spec OAuth 2.1 client — RFC 9728 resource probe,
  RFC 8414 metadata discovery (path-inserted → origin → OIDC fallback),
  RFC 7591 dynamic client registration (public client + PKCE S256, manual
  client fallback), authorization-code exchange and refresh rotation. All
  requests ride the hardened shared transport.
- Extracted `mcp-http-transport.ts` from the resolver (DNS pinning, private-
  range rejection, no redirects, bounded size/time) so the OAuth client reuses
  the same guards without import cycles; resolver re-exports its guards.
- Resolver `getAuthorizedServer`: tenant bearer wins, else the platform
  credential; oauth servers resolve their access token with silent refresh +
  encrypted write-back. Same for admin `test` (serverId mode now uses the
  stored credential — fixes the 401) and org `test`.
- API: POST/PATCH accept authMode `oauth` + encrypted bearerToken storage
  (blank keeps current; auth-mode switch clears credential + resets OAuth
  state); GET exposes hasPlatformCredential/oauthStatus; new routes
  `oauth/start` (probe + discovery + DCR + PKCE state → authorization URL),
  `oauth/callback` (single-use state, code exchange, encrypted token storage,
  redirect back to /settings/mcp), `oauth/disconnect`.
- Org API: oauth servers connect platform-managed (no tenant token, requires
  completed platform sign-in); bearer servers accept an optional tenant token
  when a platform key is stored.
- UI: registration is fully generic (any Streamable HTTP MCP server; n8n only
  as an example), three auth modes, stored-encrypted bearer field, OAuth
  scopes + manual-client option, "Register and sign in" flow, per-card OAuth
  status chip with Sign in/Reconnect/Disconnect, callback banner, and
  "Import discovered tools" after a successful card-level test. Org panel
  adapts its connect dialog to the three auth modes.
- Tests: 29 new mcp-oauth unit tests + 4 route validation tests + org route
  suite rewritten with SQL-keyed mocks (fixes two pre-existing flaky
  assertions) + opt-in live discovery test. 76/76 pass; typecheck at the
  pre-existing 78-error baseline; integrations suites unchanged vs HEAD.
  Live verification: full OAuth discovery against the production n8n instance
  (401 probe + RFC 8414 metadata + DCR endpoint) and Notion's hosted MCP.


## 2026-10-12 — DEV-01 Gemini live catalogue and defaults audit
- Fixed model release-date extraction in src/modules/ai-governance/core/live-catalog.ts (commit 865e657901d479e29ce1625b1869edfaa0eb04d5).
- Corrected embedding recovery in src/modules/ai-core/resolve.ts: fallback candidates must be enabled vendor-live embedding rows and must respect the organisation allow-list (commit d7d6a144750799ab127b92e84e2546dacb20e59b).
- Removed static Gemini model IDs from legacy .env.example.v2 and .env.example.v3; clarified that env IDs are preferences only. Production seed has no static model ID defaults and now documents this contract (commits c7321aa2f63b099ffbf7ffdb873cd362e7b5f8a3, 6bed6c178884df567e8478974d693ed033f49631, af5e16ef22bc79249fee95b3d09cc74a10e4edc2).
- GeminiProvider.getEmbeddingDimension() now uses known dimension metadata or explicit configuration and throws for unknown dimensions rather than guessing 768 (commit 1d9de9d29483c3b8781194e6988d0e84a703aad9).
- Governance registry counts, default-model summaries, and provider workspace model inventory exclude seed-only rows (commit 4869b25802fae07ff5061c2e970cc4cc4418856a).
- No tests, type-check, build, live provider API, UI or deployment verification was run. No PASS is claimed. Next: targeted regressions and remaining consumer audit.


## 2026-10-12 — Gemini model ID normalization follow-up
- Current branch audit found malformed escaping in model-prefix normalization in src/modules/assistant/api/geminiSession.ts and src/app/api/embed/session/route.ts. Corrected these to strip a literal models/ prefix properly (commits 024f37a9a3599f5e036a13aea9524c60f234c6b7 and 32e7908b84d386d5b0a9c4607b0128dec382a20c).
- This is source-only; no test/type-check/build/live vendor/deployment verification was run. No PASS is claimed.


- Added source-level regression fixture for a prefixed Gemini realtime model ID in the embed session route test (commit bff9ccbae2f89717a4f111ef931d8a7f6c822eff). No test execution or PASS claimed.


- Hardened Gemini embedding dimension overrides: explicit dimensions must be positive integers <=3072; known fixed-size models reject mismatches; gemini-embedding-001 retains compatible Matryoshka dimensions; unknown models require explicit dimensions (commit 1b91683b4079736898be686e380417a064884c76).
- Added focused GeminiProvider dimension regression source (commit 712eebf8e4295bc987c65db2d1acb371af987972). No tests/type-check/build were run.


- GeminiProvider now requires chat/embedding model IDs in the resolved config and does not independently fall back to GEMINI_CHAT_MODEL or GEMINI_EMBEDDING_MODEL. Added regression source ensuring environment preferences cannot bypass live governance resolution. Commits a02e92d47982a3977b82d1d3071e507eefe2feab, ffff0cf29be92740c8709fb4bc389b3522a6e350. No tests/type-check/build were run.
