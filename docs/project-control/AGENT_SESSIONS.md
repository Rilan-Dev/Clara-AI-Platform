### SESSION-DEV-20261012-01 — 2026-10-12
- **Agent:** DEV-01 / Forge
- **Invocation:** Recover current GitHub project-control state and continue authorized live model discovery; eliminate static Gemini model availability and ElevenLabs realtime TTS model selection.
- **Started from:** `feature/ai-core-from-doable-source`, after reading PROJECT_STATE, CURRENT_PHASE, NEXT_ACTION, shared memory, central sessions/handoffs, and DEV-01 role-local memory/worklog.
- **Scope:** provider live catalogue, capability filtering, model ranking, Gemini realtime session paths, ElevenLabs realtime TTS resolution, and durable project-control records.
- **Status:** ACTIVE — source commits made; remaining static catalogue/default audit and verification pending.
- **Completed:** live catalogue sync now records Gemini capability/token metadata and known prices; successful Gemini/OpenAI discovery disables stale seeded rows for reconciled kinds; confirmed rows re-enable on upsert; listProviderModels triggers synchronization and sorts by known cost/release metadata; Gemini session/embed realtime selection reads only vendor-discovered models; ElevenLabs realtime TTS selection reads live TTS rows; Gemini provider no longer has hardcoded chat/embedding fallback IDs; focused route test mocks updated for live catalog metadata.
- **Pending:** audit remaining Gemini static availability/default values and all callers; ensure live model selectors pass the catalogue records to shared option builders; add regressions for failed discovery and ranking; run focused tests/typecheck when available.
- **Blockers:** no repository-local runtime/test execution available in this session; source-level review only. Vendor APIs do not uniformly expose pricing/release dates.
- **Handoff:** none. Stay DEV-01; substantial unrelated defects go to FIX-01, infrastructure/deployment to OPS-01.
- **Evidence:** source commits include `c84acc50538653a98a8bcdb3cb2dce3cc2b6c94c`, `00c6dd8a71197b527fab59cfec0c24cbd6d6ade5`, `66f22879253530d5faf66c6575bb2f3ac128580d`, `ad7003c8a09cab44137411ceefe5b0840140c0fc`, `87bdfbc7f06baea44c465ce1a53cb2972db3ffa8`, `2c489a24a4f81f7cd06502d53e46e2fa3d77f9bd`, `6f0cea8f4d682ae76a3fa7a8a522512b91e648bb`, `9b850ec47a42103b5e6cb4b4916d19b4f26e7dbe`.
- **Exact next action:** follow the DEV-01 entry at the top of `docs/project-control/NEXT_ACTION.md`; do not wait for CI/Vercel.

### SESSION-DEV-20261011-01 — 2026-10-11
- **Agent:** DEV-01 / Forge
- **Invocation:** Implement secure Streamable HTTP MCP resolver and Chat/realtime runtime wiring through the Unified Tool Runtime.
- **Started from:** `feature/ai-core-from-doable-source`, after SESSION-DEV-20261010-02.
- **Scope:** MCP transport, discovery/schema validation, execution-time authorization, Chat and OpenAI realtime tool advertisement/dispatch.
- **Status:** ACTIVE — source implementation committed; verification pending.
- **Completed:** Resolver with HTTPS/DNS IP pinning/TLS/no redirects/timeouts/cancellation/size bounds; paginated discovery; schema conversion and stale-schema denial; DB-backed caller/tenant/plan/grant rechecks; request-scoped Chat runtime composition; realtime advertisement and dispatch; endpoint/IP regression source.
- **Pending:** Mocked transport/runtime tests; focused tests and type-check; controlled live handshake; tenant-scoped discovery cache only after invalidation semantics are reliable.
- **Blockers:** Tests, typecheck/build/migration/live MCP flow were not run in this source-only workflow.
- **Handoff:** None. Security/correctness remains DEV-01 until a concrete substantial defect requires FIX-01; infra-only issues go to OPS-01.
- **Next action:** Continue mocked transport and revocation/parity coverage; run focused tests and typecheck locally when available without polling CI/Vercel; keep servers disabled until a controlled live handshake succeeds.

### SESSION-DEV-20261009-02 — 2026-10-09
- **Agent:** DEV-01 / Forge
- **Invocation:** Finish explicitly requested I-6 MCP bounded hardening, then continue the Integrations & AI Enhancement Roadmap without waiting for CI/Vercel/Gates.
- **Started from:** `feature/ai-core-from-doable-source`; I-6 source completion record and owner-provided runner webpack build failure.
- **Scope:** Complete remaining MCP policy snapshot hardening; implement OAuth state/consent/token persistence and refresh compatibility; surface safe connection health; validate credential writes; unify integration capability policy.
- **Status:** ACTIVE
- **Completed:** I-6 source implementation complete; OAuth state/start/callback and UI consent path authored; token refresh honours HEADER/BODY auth mode; safe connection health, reconnect/disconnect and server-side credential validation added; shared integration capability authorization is reused by the I-4 bridge and AI action tool; AI availability reports runtime-resolvable actions and status-aware guidance.
- **Pending:** Continue P1/P2 typed action safety and idempotency/approval hooks through the existing Unified Tool Runtime.
- **Blockers:** No source-level blocker currently identified. Tests/build/Docker/CI/Vercel/Gates/deployment/live OAuth provider flow have not been run or awaited.
- **Handoff:** None.
- **Next action:** Continue bounded implementation using `docs/project-control/NEXT_ACTION.md`; do not wait for external gates and do not claim production recovery.

---

# APCP Central Agent Sessions

Central index of autonomous agent sessions. Each agent also maintains its own role-local WORKLOG.md and MEMORY.md.

## Why this exists

A fresh chat may invoke any agent at any time. The next agent must be able to discover that another agent was active, what it was doing, what it left pending, and what lessons were learned without reopening the old chat.

## Session entry

### <SESSION-ID> — <YYYY-MM-DD>
- **Agent:** <DEV-01 | FIX-01 | OPS-01 | WORK-01>
- **Invocation:** <prompt/task summary>
- **Started from:** <commit/ref>
- **Scope:** <authorized task or safe maintenance task>
- **Status:** <ACTIVE | PAUSED | HANDOFF | COMPLETE | BLOCKED>
- **Completed:** <summary>
- **Pending:** <exact remaining work>
- **Blockers:** <none or durable blocker>
- **Handoff:** <AGENT_HANDOFF entry or none>
- **Next action:** <exact next action>

### SESSION-FIX-20261009-01 — 2026-10-09
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Recover current project-control context and fix the owner-provided Docker build failure with the smallest authorized source correction.
- **Started from:** feature/ai-core-from-doable-source at c922529f73d129d4da1241b40cf894985bfac9dc, as evidenced by the supplied log and current fetched branch state.
- **Scope:** Resolve the five reported relative import failures; record symptom, cause, failed approach, remedy, prevention, evidence and next action. No unrelated scope.
- **Status:** HANDOFF
- **Completed:** Changed the three relative imports in context-builder.ts and two in runner-core.ts from explicit .js suffixes to extensionless specifiers.
- **Pending:** No post-change test/build/Docker run was performed; rebuild outcome is unknown.
- **Blockers:** None identified at source level; executable confirmation is deferred.
- **Handoff:** EVT-FIX-003.
- **Next action:** Continue the existing authorized roadmap from docs/project-control/NEXT_ACTION.md; do not wait for CI/Vercel/Gates and do not claim production recovery.

## Concurrency rule

Multiple sessions may be ACTIVE simultaneously. Session records are coordination evidence only; they do not grant authorization and do not require another agent to stop.

### SESSION-OPS-20261009-01 — 2026-10-09
- **Agent:** OPS-01
- **Invocation:** Diagnose the reported clara-backend Vercel build failure as OPS-01 / Shipwright, make only the smallest authorized operational change, and route application defects to FIX-01.
- **Started from:** Vercel deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf; Vercel-Preview / 4ea79c3b3bbb5202a25f2411b63471354200b01d.
- **Scope:** Deployment diagnosis, infrastructure/application classification, evidence recording, and routing. No application-source correction authorized.
- **Status:** HANDOFF
- **Completed:** Confirmed the Vercel failure is deterministic application migration validation, not Vercel infrastructure. Recorded evidence and routed the duplicate 060 migration defect to FIX-01.
- **Pending:** FIX-01 must correct the duplicate migration filename/number on the deployment source.
- **Blockers:** Duplicate migration prefix 060 on the failed deployment source.
- **Handoff:** HANDOFF-OPS-20261009-01
- **Next action:** Do not poll. Resume only when a new authorized operational task or corrected deployment is available.


### SESSION-DEV-20261009-01 — 2026-10-09
- **Agent:** DEV-01 / Forge
- **Invocation:** Recover project state from GitHub and continue the next authorized product-development action.
- **Started from:** `feature/ai-core-from-doable-source`; the authoritative next action was realtime voice integration dispatch through the Unified Tool Runtime.
- **Scope:** Add gated realtime integration descriptors and authenticated dispatch; preserve current authorization/runtime contracts; author focused regressions and record project continuity.
- **Status:** HANDOFF
- **Completed:** Added session tool descriptors behind both default-off flags and authenticated KB membership; added `POST /api/realtime/tool`; connected the OpenAI Realtime client handler; authored regression source for descriptor gating, authorization, identity derivation, and runtime delegation.
- **Pending:** Architect review; tests/build remain unexecuted.
- **Blockers:** None known from source authoring; no deployment or runtime result claimed.
- **Handoff:** EVT-DEV-001 (architect review request; no authority transfer to FIX-01 unless a substantial defect is identified).
- **Next action:** Architect review the bounded implementation and regression source. Do not start unrelated work without a new authorized NEXT_ACTION.


### SESSION-FIX-20261009-02 — 2026-10-09
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Recover project-control authority and diagnose/fix the next Docker webpack missing-module failures.
- **Started from:** `feature/ai-core-from-doable-source`; owner-reported local build after pull to `992d8385`.
- **Scope:** Trace only the reported unresolved relative imports, apply the smallest authorized correction, and record the incident. No unrelated scope.
- **Status:** HANDOFF
- **Completed:** Recovered shared memory, central agent records, FIX-01 role-local records, verification state and NEXT_ACTION. Confirmed the missing targets are existing TypeScript siblings and removed five remaining explicit `.js` suffixes across three runtime files.
- **Pending:** New Docker/Next build not run; successful compilation is not established.
- **Blockers:** Build evidence unavailable after source correction. No OPS-01 infrastructure action is indicated by this webpack module-resolution symptom.
- **Handoff:** Resume the existing owner-authorized roadmap in `docs/project-control/NEXT_ACTION.md`; do not wait for CI/Vercel/Gates.
- **Related commits:** `f507443805130d1068b8fe570bc0940f4e8ace1b`, `8eb329af87f1225342b10b9c299fa8163812a9eb`, `21576b8e5e3db30fd5a61325712e0d89dfe38369`.


### SESSION-FIX-20261009-03 — 2026-10-09
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Third pass on owner-provided Docker webpack unresolved-module errors.
- **Started from:** `feature/ai-core-from-doable-source`; user build pulled through `0009c3bf`.
- **Scope:** Fix only concrete imports reported by the latest build and persist the incident records.
- **Status:** HANDOFF
- **Completed:** Changed six explicit `.js` imports in `execution-authorization.ts` and `runner-helpers.ts` to extensionless imports. Registry import now resolves against the TypeScript registry module path.
- **Pending:** No post-correction Docker build or tests executed; compilation is unverified.
- **Related commits:** `d9d114c8492892ebf4ce16ae4e6d93baa8ab97a8`, `a47d087cfc5dc68251eb4c421dbdf4b1ac6c373b`.
- **Next:** Continue `NEXT_ACTION.md` without waiting for CI/Vercel/Gates; do not claim build PASS.


### SESSION-FIX-20261009-04 — 2026-10-09
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Diagnose user-provided `docker compose ps` and backend logs, correct confirmed startup failure source, and persist evidence/next action.
- **Started from:** `feature/ai-core-from-doable-source`; existing backend container age was 14 hours.
- **Scope:** Migration error classification, PDF.js startup failure, cron configuration warning, and OAuth schema symptom.
- **Status:** HANDOFF
- **Completed:** Corrected eager PDF.js runtime loading in `src/modules/ingest/parsers/pdf.ts` (commit `cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`). Confirmed the current branch has a single 063 migration and includes migration 065, so the existing container's duplicate-063 log cannot be attributed to the current branch tree without inspecting the image.
- **Pending:** Rebuild and inspect the actual packaged migration set; verify PDF parsing with the production runtime dependency; set `CRON_SECRET` in the self-hosted environment if the three local cron jobs are intended to run.
- **Blockers:** No current-image build or runtime verification was performed; the running container is not known to contain current source.
- **Next action:** Continue the authorized roadmap in `docs/project-control/NEXT_ACTION.md` without waiting for CI/Vercel/Gates; treat the next Docker build and any new runtime errors as separate evidence.


### SESSION-DEV-20261009-03 — 2026-10-09
- **Agent:** DEV-01 / Forge
- **Invocation:** Owner requested recovery and continuation of WhatsApp Business Messaging connection UX.
- **Started from:** `feature/ai-core-from-doable-source`; recovered project-control and DEV-01 role-local records from GitHub.
- **Scope:** Inspect existing agent navigation and integration patterns; add a reachable Messaging screen and connection-start affordance without falsely claiming a connection.
- **Status:** ACTIVE — UI entry point committed; backend connection lifecycle pending.
- **Completed:** Added per-agent Messaging route/screen, Connect WhatsApp Business dialog, Meta Business Manager handoff, and desktop/mobile navigation entries.
- **Blockers:** No WhatsApp-specific server connection, webhook verification, or durable message-state implementation found. UI explicitly remains Not connected.
- **Handoff:** None. Route substantial correctness/security bugs to FIX-01 and deployment/infrastructure work to OPS-01.
- **Next action:** Implement authenticated Meta connection initiation, tenant/agent-scoped phone binding, verified webhook processing, and persistent message state; then bind UI to backend status.


### SESSION-DEV-20261009-04 — 2026-10-09
- **Agent:** DEV-01 / Forge
- **Invocation:** Continue the exact owner-authorized WhatsApp Business server-side lifecycle after the Messaging UI commit; do not redesign the UI or wait for CI/Vercel/Gates.
- **Started from:** `feature/ai-core-from-doable-source`; project-control and DEV-01 role-local records recovered from GitHub.
- **Scope:** Meta OAuth initiation/callback, encrypted WABA/phone binding, webhook challenge/signature and idempotent processing, durable message/delivery state, server-backed UI status, and briefing readiness gate.
- **Status:** ACTIVE — OAuth, webhook, durable message state, recipient opt-in, and scheduled briefing sender source committed; token health/reconnect and route-level regression source remain.
- **Completed:** Added migration 067, authenticated per-agent OAuth start and callback, long-lived token exchange attempt, encrypted token storage, business/WABA phone selection, unique one-active-phone constraints, WABA subscription, webhook verification/signature checks, transactional dedupe and inbound message/status persistence, server-backed Messaging status, briefing eligibility gate, helper regression source, and Meta setup docs.
- **Pending:** Proactive revocation/permission-health probes; remaining route-level tests for phone uniqueness and duplicate webhook retries; ambiguous `sending` run reconciliation/provider-status races; possible grounded AI summary upgrade; normal future test/build/live Meta verification.
- **Blockers/dependencies:** Meta server variables and Meta app callback/webhook/scopes must be configured before live use. Daily briefing flag is preference/eligibility only; no scheduled delivery is claimed.
- **Handoff:** None. Route substantial correctness/security defects to FIX-01 and deployment/infrastructure-only work to OPS-01.
- **Next action:** Follow `docs/project-control/NEXT_ACTION.md`; add the remaining uniqueness/duplicate-retry regressions and proactive revocation/reconnect health. Do not poll CI/Vercel/Gates.


### SESSION-FIX-20261010-01 — 2026-10-10
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Recover repository/project-control context; trace owner-provided missing PostgreSQL relations and repair modal/card width and vertical word-wrapping defects with minimal scope.
- **Started from:** `feature/ai-core-from-doable-source`; current branch source fetched from GitHub. Historical database logs are dated 2026-10-08.
- **Scope:** Inspect shared/central/role-local memory, current phase/next action/issues/verification; trace migration readiness and seed order; fix shared dialog layout; record root cause, remedy, prevention and evidence.
- **Status:** HANDOFF
- **Completed:** Confirmed `src/instrumentation.node.ts` gates local background DB consumers behind successful migrations; confirmed current production seed source imports the expected integration/observability dependencies and project-control already records organisation-before-agent ordering. Updated shared `src/components/ui/dialog.tsx` for viewport-safe width/height, scrollable long content, min-width handling and word wrapping.
- **Pending:** No browser screenshot/UI test, typecheck, unit test, build, Docker rebuild, DB migration run, or live runtime log comparison was executed. Database incident remains unconfirmed against the current image; no production recovery is claimed.
- **Blockers:** Need a fresh runtime image/commit and migration output to confirm whether historical errors persist.
- **Handoff:** EVT-FIX-010.
- **Next action:** Continue the currently authorized roadmap; on the next ordinary runtime verification, confirm deployed/running commit and migration result before any further DB code change. Do not wait/poll for CI/Vercel gates.


### SESSION-FIX-20261010-02 — 2026-10-10
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Continue UI audit for popup/card width and text-wrapping defects; preserve separate OPS-01 ownership for historical missing-schema errors.
- **Started from:** `feature/ai-core-from-doable-source`, after Modal correction commit `ef069e3f8ac64d65288855497326e9c6ad0c6b5e`.
- **Scope:** Shared dialog/popover/card primitives and regression protection only.
- **Status:** ACTIVE
- **Completed:** Updated Popover, HoverCard, AlertDialog, Sheet, Drawer, Tooltip and DropdownMenu sizing/wrapping; added `src/components/ui/layout-primitives.test.ts`; recorded worklog, shared lesson and event EVT-FIX-012.
- **Pending:** Search feature-level bespoke popup/card class overrides; run focused test/typecheck and perform browser visual review when local runner/browser is available.
- **Blockers:** No local execution/browser verification in this session. Historical database schema issue is routed to OPS-01 and does not block UI work.
- **Handoff:** None; OPS-01 owns the separate runtime/migration investigation.
- **Next action:** Continue bounded source audit without waiting for DEV-01 or CI/Vercel; do not claim visual pass until browser evidence exists.


## SESSION-FIX-20261010-03 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue custom feature-screen popup/card wrapping audit after shared primitive repairs.
- **Result:** Corrected two feature-specific credential/OAuth dialogs, the AI capability drawer, and KB identifier wrapping. Expanded focused source-contract regression coverage.
- **Evidence:** GitHub source writes accepted; changed files re-fetched and inspected. Test/typecheck/build/browser checks remain outstanding and are not claimed as passing.
- **Dependencies:** OPS-01 owns missing PostgreSQL relations and seed FK runtime investigation; no schema reset or manual table creation.
- **Next:** Continue targeted source audit; run focused Vitest and typecheck plus mobile/desktop browser inspection when local execution is available.


## SESSION-FIX-20261010-04 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Audit further bespoke overlays and long URL/identifier presentation.
- **Result:** Fixed subscription/plan editor overlays, billing-history drawer, publish-review dialog, knowledge-base creation dialog, and published URL wrapping; extended focused layout contract tests.
- **Evidence:** GitHub accepted source and test writes; no local execution, typecheck/build, or browser visual check was available. No PASS claimed.
- **Routing:** OPS-01 remains responsible for PostgreSQL missing relations and seed FK failure; no DB changes.
- **Next:** Continue custom overlay/card source audit; run focused Vitest and typecheck and inspect mobile/desktop when local execution is available.


## SESSION-FIX-20261010-05 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue custom overlay/card audit and eliminate awkward blanket word breaking on user-visible identifiers.
- **Result:** Corrected API key/account/profile and create-agent overlays, published URL popover, publish/deploy dialogs, organisation detail values, verification email labels, API endpoint path, and email template link wrapping. Focused source-contract test suite now has 8 tests.
- **Evidence:** Changed source and test files were re-fetched from GitHub. Local checkout is unavailable, so Vitest/typecheck and browser visual checks were not run; no pass claimed.
- **Routing:** OPS-01 owns missing PostgreSQL relations and seed FK failure; no DB changes.
- **Next:** Continue bounded custom dialog/card audit; run focused Vitest/typecheck and inspect mobile/desktop when local execution is available.


## SESSION-FIX-20261010-06 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue current-branch audit for custom overlays/cards, clipped content, and identifier wrapping.
- **Result:** Constrained fullscreen prompt editor to viewport; changed workspace copy fields from truncation to natural wrapping; made embed API-key value/header overflow-safe. Focused source-contract suite now contains 9 tests.
- **Evidence:** GitHub accepted changes. Vitest/typecheck and browser-level mobile/desktop inspection remain outstanding because local execution is unavailable. No PASS claimed.
- **Routing:** OPS-01 owns missing PostgreSQL relations and seed FK failure; no database changes.
- **Next:** Continue current-branch source audit and run focused tests/typecheck/visual review when local execution is available.


## SESSION-FIX-20261010-07 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue current-branch audit for clipping, horizontal overflow and long values hidden by aggressive wrapping/truncation.
- **Result:** AI provider diagnostic cards now use natural wrapping; workspace Organisation ID is no longer truncated; Qdrant collection identifier now wraps naturally. Added regression coverage; focused source-contract suite has 10 tests.
- **Evidence:** GitHub accepted source/test writes. Vitest, typecheck and browser-level mobile/desktop checks remain outstanding; no PASS claimed.
- **Routing:** OPS-01 owns missing PostgreSQL relations and seed FK failure. No DB modifications.
- **Next:** Continue auditing remaining bespoke dialogs and cards; test and inspect layouts when local execution is available, without waiting on CI/Vercel.


## SESSION-FIX-20261010-08 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue current-branch audit for clipped values and truncation in remaining admin cards.
- **Result:** Corrected the remaining KB collection identifier `break-all` case; recent-agent labels/descriptions and analytics top-query strings now wrap naturally. Regression suite has 11 source-contract tests.
- **Evidence:** GitHub accepted writes. Vitest/typecheck/browser checks are not yet run; no PASS claimed.
- **Routing:** OPS-01 owns missing PostgreSQL relations and seed FK failure; no database mutation.
- **Next:** Continue the remaining custom overlay/card audit and execute focused checks plus mobile/desktop review when local execution is available, without waiting on CI/Vercel.


## SESSION-FIX-20261010-09 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Correct the exact width issue demonstrated in the landing demo and OAuth app settings; inspect the surrounding layout for related overflow.
- **Result:** Chat bubbles now have explicit remaining-row width bounds and shrink-safe natural wrapping; demo container/header/citation rows are responsive. OAuth form fields have explicit shrink/max-width constraints and the footer wraps on narrow viewports. Added regression source-contract coverage; suite contains 12 tests.
- **Evidence:** GitHub accepted changes. No local Vitest/typecheck or browser visual review; no PASS claimed.
- **Routing:** OPS-01 owns PostgreSQL missing relations and seed FK failure. No DB changes.
- **Next:** Continue similar source audit; run focused checks and mobile/desktop inspection when local execution is available, without waiting on CI/Vercel.


## SESSION-FIX-20261010-10 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Search for equivalent width issues beyond the landing demo and OAuth modal.
- **Result:** Corrected the same intrinsic-width/flex-bubble issue in the live conversation window, including welcome text, user messages, and assistant responses. Regression suite now has 13 source-contract tests.
- **Evidence:** GitHub accepted source/test updates; no local test/typecheck/browser PASS.
- **Routing:** OPS-01 owns PostgreSQL missing relations and seed FK failure; no DB modifications.
- **Next:** Continue related card/dialog text-width audit and perform focused tests plus mobile/desktop visual review when local execution is available.


## SESSION-FIX-20261010-11 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue current-branch audit for clipped text and fixed-width rows in admin cards.
- **Result:** Email audit subjects, billing audit notes, and email variable descriptions/custom values now wrap naturally instead of truncating. Regression suite contains 14 source-contract tests.
- **Evidence:** GitHub accepted updates. Vitest/typecheck and browser-level mobile/desktop review remain outstanding; no PASS claimed.
- **Routing:** OPS-01 owns PostgreSQL missing relations and seed FK failure. No DB changes.
- **Next:** Continue custom overlay/card audit and run focused tests plus mobile/desktop review when local execution is available, without waiting on CI/Vercel.


## SESSION-FIX-20261010-12 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue current-branch audit for long URLs, names, filenames and labels clipped in flex rows/cards.
- **Result:** Payment webhook URL, organisation member identity, uploaded document labels and web source labels/URLs now use shrink-safe wrapping. Focused source-contract suite contains 15 tests.
- **Evidence:** GitHub accepted changes; Vitest/typecheck and responsive browser checks remain pending. No runtime PASS claimed.
- **Routing:** OPS-01 remains owner for PostgreSQL missing relations and seed FK failure; no DB changes.
- **Next:** Continue audit of remaining cards, popovers and dialogs, then run focused checks and mobile/desktop visual review when local execution is available. Do not wait for CI/Vercel.


## SESSION-FIX-20261010-13 — FIX-01 / Sentinel — 2026-10-10
- **Goal:** Continue the long-text width audit in analytics and configuration pickers.
- **Result:** Analytics query cells, organisation usage labels/metrics, ConfigEditor option text, and translator language names now wrap naturally. Source-contract suite contains 16 tests.
- **Evidence:** GitHub accepted updates; Vitest/typecheck and mobile/desktop visual inspection have not run. No runtime PASS claimed.
- **Coordination:** Current NEXT_ACTION.md is DEV-01 WhatsApp briefing work; this UI audit is independent. OPS-01 remains owner for the PostgreSQL incident.
- **Next:** Continue UI clipping audit, then run focused tests/typecheck and responsive browser review when local execution is available; do not wait on CI/Vercel.


### SESSION-FIX-20261010-01 — 2026-10-10
- **Role:** FIX-01 / Sentinel
- **Scope:** Landing page and login-card clipping correction.
- **Implementation:** Landing hero container now has explicit full-width/shrink-safe constraints; long hero and feature-card text wraps. Login card and inputs are width-constrained and form/password wrappers can shrink.
- **Commits:** `4dcf32954d6e2c31ac3b022977af20dba7565e24`, `06c9343cb0cf3f8ffcc76bfacde63a22f58aeb40`; regression source update follows.
- **Verification:** Source-only; Vitest/typecheck/browser verification not run.
- **Pending:** Inspect the live public landing/login pages at narrow mobile and desktop widths, continue remaining auth-card audit, then continue the authorized roadmap without waiting on external gates.


### SESSION-FIX-20261010-02 — 2026-10-10
- **Role:** FIX-01 / Sentinel
- **Scope:** Public/auth card clipping audit.
- **Implementation:** Responsive fixes for signup wizard/plan cards, forgot-password card, reset-password card/form fields, and email-verification states. Added source-contract test for all four screens.
- **Commits:** `e88747825ffb3923543e056e14c46b0c88cafe1c`, `b45db54a1342b9153face2848232428c1c00a6ef`, `2de0043febf3d0f20f7e2c996ae6da2cbd729736`, `eac422cfaa8cf7199ad56968448d0ab7fc2b1c43`; test/docs commits recorded separately.
- **Verification:** Live browser DOM checks returned HTTP 200 for landing and login mobile presets. Screenshot capture endpoint failed upstream; no visual pass claimed. Vitest and typecheck not run because no local repository runtime is attached.
- **Next:** Continue public/auth screen audit and normal roadmap work independently of CI/Vercel.


### SESSION-FIX-20261010-03 — 2026-10-10
- **Role:** FIX-01 / Sentinel, with independent roadmap continuation
- **Scope:** Finish source-level UI/auth audit; resume the current WhatsApp lifecycle roadmap without external-gate polling.
- **Implementation:** Public/auth cards and input widths hardened; fixed Meta error classification ordering in daily briefing sender; added scheduled connection health probe with expiry/revocation gating and health-check timestamp migration.
- **Verification:** Live DOM audit HTTP 200 for landing/login desktop and mobile presets, plus signup/forgot mobile. Browser screenshot endpoint returned upstream 502; visual verdict pending. Vitest/typecheck not run due absent local repo runtime.
- **Next:** Route-level WhatsApp expiry/uniqueness tests, safe reconnect, ambiguous sending-run reconciliation, grounded AI briefing evaluation; continue UI audit. OPS-01 still owns the PostgreSQL missing-relations/seed incident.


### SESSION-FIX-20261010-04 — 2026-10-10
- **Role:** FIX-01 / Sentinel
- **Scope:** Public pricing/checkout/signup-verification clipping audit.
- **Implementation:** Hardened pricing card widths and feature/FAQ wrapping; checkout plan summary and payment panel shrink/wrap behavior; receipt rows and transaction reference; signup-verification content cards. Added source-contract test coverage.
- **Verification:** No local runtime; Vitest/typecheck not run. Live DOM checks are HTTP 200 but predate latest branch commits. Screenshot service failed upstream 502; visual PASS not claimed.
- **Next:** Finish remaining public/auth surfaces and continue WhatsApp roadmap work without external-gate polling.


### SESSION-FIX-20261010-05 — 2026-10-10
- **Role:** FIX-01 / Sentinel
- **Scope:** Route-level regression for scheduled WhatsApp health checks.
- **Implementation:** Added coverage for unauthorized cron requests, expiry transitions, Meta auth/permission rejection, and transient rate limits.
- **Commit:** `023ba0b25b615f3badd6ff5b30b47b93afe7d832`.
- **Verification:** Tests authored, not run. Local clone attempt could not resolve github.com; no local repository/dependency runtime available.
- **Next:** Safe reconnect and expiry coverage, ambiguous sending-run reconciliation, then continue grounded AI briefing evaluation and remaining UI audit without waiting for CI/Vercel.


### SESSION-FIX-20261010-06 — 2026-10-10
- **Role:** FIX-01 / Sentinel with roadmap continuation
- **Implementation:** Explicit safe-reconnect state in Messaging UI; stale ambiguous WhatsApp briefing sends are quarantined as terminal unknown outcomes after 30 minutes rather than automatically retried; route tests authored.
- **Commits:** `ab9a776eced829f8e88847d1c42a72170a70f8e3`, `2ab69e96434de51baadd8ebfaad6a85e563ffe97`, `afe11cf0ff1a95e4e6524f2e02b90cc168f785fb`, `3d506bf3e91734e9b9851702e0651dcc2d6c49cf`.
- **Verification:** Source-only; no Vitest/typecheck or live Meta send was run. The local clone failed because GitHub DNS was unavailable in this runtime.
- **Next:** Phone uniqueness, duplicate webhook and monotonic delivery regression; safe unknown-send recovery; grounded AI briefing evaluation; remaining public/auth clipping audit.


### SESSION-FIX-20261010-07 — 2026-10-10
- **Role:** FIX-01 / Sentinel
- **Scope:** Public contact form clipping audit.
- **Implementation:** Contact page wrappers/cards/inputs are now shrink-safe; regression assertions added.
- **Commits:** `59a671286a55ff04bd34ba41003c5db015b5afa2`, `518c238d84e93f4d214e0ff802c9b317fd834e01`.
- **Verification:** Not run locally; no Vitest/typecheck/browser screenshot PASS claimed.
- **Next:** Continue remaining UI surfaces and WhatsApp roadmap.


### SESSION-DEV-20261010-01 — 2026-10-10
- **Agent:** DEV-01 / Forge
- **Invocation:** Audit MCP completed/pending functionality and plan platform-admin/org UI plus chat/realtime voice usage.
- **Started from:** `feature/ai-core-from-doable-source`; recovered NEXT_ACTION and role-local memory/worklog.
- **Scope:** MCP source audit, gap analysis, UI/authorization architecture and project-control continuity.
- **Status:** ACTIVE
- **Completed:** Inspected I-6 bridge/test, integration policy/bridge, realtime dispatch and existing UI paths; added MCP roadmap and updated NEXT_ACTION.
- **Pending:** Persistent server registry/credential contract, platform-admin and org UI/API, host transport/resolver, chat/realtime MCP registration, isolation/security regression source.
- **Blockers:** None to planning; inspect migration and credential-vault conventions before schema/API changes.
- **Handoff:** None.
- **Next action:** Implement registry/credential/grant contract and platform/org UI in existing integration surfaces; retain Unified Tool Runtime and default-deny surfaces until explicitly wired.

### SESSION-DEV-20261010-02 — 2026-10-10
- **Agent:** DEV-01 / Forge
- **Invocation:** Implement next MCP server registry/connection/grant contract and admin/org/agent UI.
- **Started from:** Current branch and MCP audit session SESSION-DEV-20261010-01.
- **Scope:** Migration, server/org APIs, UI panels, focused regression source and control records.
- **Status:** ACTIVE
- **Completed:** Migration 069; platform registry API; org connection/org-tool/agent-tool grant API; platform, organisation and agent UI in existing integration surfaces; endpoint and tenant-isolation test source; NEXT_ACTION updated.
- **Pending:** Streamable HTTP transport/resolver, live discovery/handshake, chat/realtime MCP registration, invocation-time reauthorization and executable tests/typecheck/build.
- **Blockers:** Runtime needs DNS/IP SSRF checks and entry-point tracing; config is not live connectivity.
- **Handoff:** None. FIX-01 for substantial security/correctness defects; OPS-01 for deployment/infrastructure-only work.
- **Next action:** Implement the transport/resolver and wire authorized MCP tools into actual Chat and realtime voice via the Unified Tool Runtime.

### SESSION-DEV-20261011-01 — 2026-10-11
- **Agent:** DEV-01 / Forge
- **Invocation:** Diagnose user-provided production Gmail OAuth-app save failure and fix the source-level root cause.
- **Status:** SOURCE FIX COMMITTED; runtime verification pending.
- **Root cause/fix:** Exported the previously non-exported `normalizeScopes` helper imported by the platform OAuth-app PUT route. Commit: `bfc5fc00de27309598b4bcfe4813f8626de9b8b0`.
- **Next:** Rebuild/redeploy and retry with rotated OAuth secret/fresh session; no CI/Vercel polling.


### SESSION-FIX-20261011-01 — 2026-10-11
- **Role:** FIX-01 / Sentinel
- **Scope:** Root-cause-first investigation of Stripe `invoice.paid` foreign-key failure.
- **Repository/runtime evidence:** User reports branch `feature/ai-core-from-doable-source`, pull fast-forward to `1fbd3bf2`, Docker build success, backend startup and `[migrate] All migrations already applied`. Repeated event `evt_1UP9JaSH7giJdRbDjderTSey` fails because organisation `d8f78644-3198-41db-bcc3-278ecad0ecb4` is absent.
- **Source trace:** `invoiceOrgId()` reads Stripe metadata; webhook inserts returned ID into `billing_events` without proving tenant existence. Immediate failure is data referential mismatch; deeper cause is unknown.
- **Changes:** No runtime/application code changed. Added durable memory/event/backlog/worklog record and routed read-only database/Stripe correlation to OPS-01.
- **Failed approaches avoided:** No placeholder org, FK bypass, database reset/reseed, migration changes, or webhook semantics change.
- **Verification:** Source inspection only; no direct database query, Stripe API lookup, tests, typecheck, or live correction. Not resolved; no PASS claimed.
- **Next:** OPS-01 correlates event invoice/subscription/customer to `org_subscriptions` and `organisations` in the actual container DB. FIX-01 resumes only if evidence identifies an application-side lifecycle defect.


### SESSION-FIX-20261011-02 — 2026-10-11
- **Role:** FIX-01 / Sentinel
- **Scope:** MCP platform server test route missing bearer credential error classification.
- **Finding:** User's request only contained `serverId`. Source resolves the stored credential and returns `MCP_NO_PLATFORM_CREDENTIAL` without calling the remote resolver when no stored/temporary bearer token exists. The 502 status was misleading for this local configuration failure.
- **Correction:** Specific missing-credential response changed to HTTP 400. Added route test proving no upstream handshake is attempted for this case.
- **Commits:** `426e06fde3da96ee60b155ecafcf3b6c59825105`; `9e63b8bffcacf391557ad281303294a6e5352d18`.
- **Verification:** Source/test authored only; no Vitest, typecheck, build, deployment, or live handshake run. No PASS claimed.
- **Security:** Advised revocation/rotation of the session cookie exposed in the user-supplied curl.
- **Next:** Enter/save a valid bearer credential or send a temporary `bearerToken`; then diagnose any actual probe failure independently.

### SESSION-FIX-20261012-01 — 2026-10-12
- **Agent:** FIX-01 / Sentinel
- **Invocation:** Recover repository/control state and root-cause the owner-provided TypeScript diagnostics; apply smallest authorized correction and record the incident.
- **Started from:** `feature/ai-core-from-doable-source` at `59831ec646a1ed21caa8c80af863d129d3ebe034`.
- **Scope:** Diagnose the reported type-check errors, starting with the shared Stripe type surface; no unrelated feature, dependency, deployment, or infrastructure work.
- **Status:** HANDOFF — first root cause corrected; follow-up compiler evidence pending.
- **Completed:** Removed the incomplete ambient Stripe module declaration from `src/types/payments.d.ts`; retained Razorpay's separate declaration. Commit `34aca73cd5ad2fc5c67396d1d35f24dcf38d7964`.
- **Pending:** Re-run local type-check after pulling the correction; determine whether Stripe diagnostics clear and triage residual ioredis/BullMQ, UI library, PDF metadata, test import, and `ws` type errors independently.
- **Blockers:** No executable repository checkout is available to this agent; post-change type-check evidence must come from the user's local repository.
- **Handoff:** EVT-FIX-20261012-01.
- **Next action:** `git pull origin feature/ai-core-from-doable-source` then `npm run type-check`; share only the new residual diagnostics. Do not wait for CI/Vercel.

### SESSION-FIX-20261012-02 — Type-check residual correction
- Role: FIX-01 / Sentinel. Date: 2026-10-12.
- Status: HANDOFF — source corrections committed; post-change local type-check pending.
- Baseline: owner reported 33 errors in 15 files after the Stripe shadowing correction, down from 44 errors in 19 files.
- Changes: narrow dependency API/type compatibility fixes. Official @types/ws remains pending because no package-manager-generated dependency/lock update was available in this pass.
- Next: owner pulls latest branch and supplies fresh npm run type-check output. No CI/Vercel wait.

### SESSION-DEV-20261022-FEATURE-FLAGS-01 — 2026-10-22
- **Agent:** DEV-01 / Forge
- **Owner authorization:** New task to develop completely environment-local runtime/UI/API disablement for Feature 13 (Embeddable Widget) and Feature 23 (Integrations/MCP/WhatsApp) while retaining functional development behavior and protecting production. No production changes, infrastructure work, or other agent role ownership.
- **Branch/ref:** `feature/ai-core-from-doable-source`; began at `a1d2ae230fb3368f88e29f2735d686946f7f1088`, latest relevant source commit `954a2261f0e4cd0fbeac205097a4c0075f870f99`. GitHub connector direct source commits; no alternate branch or force-push.
- **Recovery:** Shared architecture/project state, CHAT_CONTINUITY, NEXT_ACTION/CURRENT_PHASE, AGENT_MEMORY/EVENTS/SESSIONS/HANDOFF/BACKLOG, DEV-01 role-local memory/worklog, verification records and relevant feature docs/source inspected.
- **State:** SOURCE_IMPLEMENTED / VERIFICATION_NOT_RUN. Production defaults off; development defaults on using per-process server flags; optional per-stack overrides, fail-closed request middleware including OPTIONS, no-store UI availability, sidebar/settings/landing/KB/publish/AI console hiding, super-admin status, and direct integration/MCP tool runtime gates. Feature ownership is narrow; native chat/voice/RAG/KB/billing untouched.
- **Tests:** Feature-policy, route middleware and navigation fixtures authored; existing MCP/integration tests adjusted to explicit dev env; added direct runner and prebuilt MCP invocation denial regression. Not executed, no runtime/deployment PASS.
- **Records:** `docs/project-control/agents/DEV-01/WORKLOG.md`, `MEMORY.md`, central AGENT_EVENTS and NEXT_ACTION; `docs/deployment/environments.md`, Feature 13/23 and .env.example.
- **Dependencies:** OPS-01 must configure and verify separate dev/prod environments and deployment; no CI/Vercel polling. Bug reports with reproducible failure go to FIX-01.
- **Next DEV-01:** When local checkout exists, run focused Vitest suites and type-check once, fix targeted failures. Reassess any additional owned surfaces only with concrete route evidence; avoid unrelated scope.
