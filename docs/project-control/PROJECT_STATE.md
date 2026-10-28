## CURRENT AUTHORITATIVE STATE — 2026-10-29 — MCP TRANSPORT TEST SEAM

[architect source review] The active MCP Streamable HTTP follow-up now has an injectable DNS/HTTPS boundary in the shared transport. Production defaults still use system DNS and Node HTTPS; the injection seam exists to make security regressions deterministic without live network access.

- Regression source covers mixed public/private DNS rejection before socket creation, per-request DNS revalidation, oversized request rejection before network activity, and already-cancelled requests.
- Commits: `b7caf9615652fff7e928040a30753f21ac831dd0`, `45b7207d66553b668d1cddf4019f133c88d7e219`, `7f1ca90b1298490142a30229336785ae1e6d2e80`.
- No executable verification is claimed. The I-6 bridge source implementation is recorded complete in its plan; the broader MCP transport/runtime hardening follow-up remains active.
- **Next:** continue deterministic transport and resolver authorization regression coverage without waiting for CI/Vercel/Gates.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-27 — TOAST STACK UX CORRECTION

[architect source review] Shared toast notifications now anchor to the bottom-right corner. Hover no longer changes the card width from the compact stack width to a much wider panel, preventing the expansion rule from covering adjacent notifications. The title/message can still reveal their full text on hover, while cards retain a stable responsive width.

- Commits: `8be85cb88cf55caece569fa799fdfdc52b4f267d`, `4451c236d8cedeac2df5391dc2d02212a0e1bccd`.
- No executable verification is claimed.
- **Next:** continue the next authorized implementation item from `NEXT_ACTION.md`.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — FOCUSED CATALOGUE SOURCE AUDIT COMPLETE

[architect source review] Completed the authorized focused review of cross-provider discovery/reconciliation boundaries: Gemini/OpenAI pagination and response-shape validation, ElevenLabs voice pagination/response-shape validation, Sarvam failed-vs-empty discovery, and provider-specific incident status handling. Partial/malformed discovery is rejected before the affected provider's authoritative reconciliation; last-known rows are preserved. Coordinator review found provider failures isolated and reported as unhealthy, without blocking independent provider tasks.

- Regression source added for the reviewed failure boundaries; no executable verification was run or awaited.
- No test/type-check/build/live vendor API/CI/Vercel/Gate PASS is claimed.
- **Next:** continue with the next authorized catalogue/runtime task recorded in `docs/project-control/NEXT_ACTION.md`. This focused audit does not close the wider live-model-catalogue workstream or authorize unrelated scope.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — CATALOGUE RESPONSE-SHAPE HARDENING

[architect source review] Gemini/OpenAI model discovery and ElevenLabs voice discovery now validate pagination response shapes and fail closed before writes/reconciliation when responses are malformed or incomplete. Gemini token cycles, OpenAI cursor/page limits, ElevenLabs repeated/missing cursors/page limits, and Sarvam failed-vs-empty discovery semantics have regression source coverage.

- Latest commits: `b1b020be3a4ccfe27d9ac5fda1e9ed83b3f48d3c`, `ae7a050e278f5a2bec4f882ff60c25e65a840cb6`, `fbd595f16920dae522490525b335bd7c9e678284`, `23eae79dc676768e7dc3fd3320a62dd499cf1042`.
- Executable verification remains deferred; no tests/CI/Vercel/Gate PASS claimed.
- **Next:** review sync coordinator incident/status semantics for partial provider success vs health reporting.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — SARVAM CATALOGUE FAILURE SEMANTICS

[architect source review] Sarvam chat discovery now distinguishes a successful empty catalogue from failure of both supported endpoints. Successful empty discovery is authoritative; failed discovery retains the curated baseline and skips stale chat-row disabling, while recording a degraded provider incident.

- Commits: `d9aca70e90708fbf9ce9dfb431d0877143215864`, `e478b0818586b4502e97fd82bb119631514e54e1`.
- Executable verification remains deferred; no tests/CI/Vercel/Gate PASS claimed.
- **Next:** audit ElevenLabs voice pagination response-shape validation and reconciliation ordering within the same catalogue scope.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — CROSS-PROVIDER CATALOGUE PAGINATION HARDENING

[architect source review] OpenAI model discovery and ElevenLabs voice discovery now fail closed on incomplete pagination. Repeated/missing OpenAI cursors and 20-page truncation, plus repeated ElevenLabs voice cursors and 100-page truncation, abort before the provider's catalogue upsert/reconciliation boundary. Regression source asserts last-known rows remain untouched and a degraded incident is recorded.

- Commits: `85566ededf49b752d7cf9a04488ab43c51eb6374`, `2521a9d098a02f2a1b12e018253603f8beed672f`, `dc3e3a1cd3e87326725e740a4455c4240f3c8fc9`, `f8a43c010f96e2027e1ae32efcfef8a427a08013`.
- Executable verification remains deferred; no tests/CI/Vercel/Gate PASS claimed.
- **Next:** continue bounded cross-provider catalogue sync/reconciliation review with Sarvam vendor-discovery fallback and reconciliation semantics.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — GEMINI CATALOGUE AUDIT CORRECTIONS

[architect-verified] Gemini live catalogue source now refuses partial pagination before upsert/reconciliation. Focused regression source covers static metadata enrichment without static availability, failed discovery preserving last-known rows, successful empty discovery reconciling stale rows, and pagination truncation preserving existing rows.

- Implementation: `e70860232a726a849c89f191135be0d360a99ece`
- Regression source: `51b0162c5dcedc054dccbd09e26ffafe234f4964`
- Executable verification remains deferred; no test/CI/Vercel/Gate PASS claimed.
- Continue with the next authorized catalogue/runtime task from NEXT_ACTION.md; do not block on external verification.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — LIVE MODEL CATALOGUE AUDIT

[architect source review] Runtime model selection now independently filters rows by provider, capability, enabled flag, `vendor_live` provenance, and model kind. Regression source was updated to assert stale embedding defaults fail closed when discovery returns bootstrap-only or no rows, while a valid vendor-live row wins over rows with mismatched provider/capability/kind, disabled state, or bootstrap provenance.

- Runtime commit: `7edb8ef23bf56a2cb4708b6df038e6e3b29f94c8`
- Regression commit: `3e657cd364ba557e899d4455a1d778bcff2b1116`
- Verification: source review only; tests/build/CI/Vercel/Gates not run or awaited.
- Audit remains IN PROGRESS; static pricing/vector-dimension enrichment and catalogue sync/reconciliation failure-path review remain open.

---

## CURRENT STATE UPDATE — 2026-10-16 — GEMINI MODEL CATALOGUE AUDIT

[architect-reviewed source change] Runtime embedding resolution no longer fabricates selectable bootstrap entries from static metadata when the configured platform default is absent from enabled vendor-live governance rows. Stale/unavailable defaults emit a warning incident and remain unavailable rather than silently substituting an unadvertised model.

- Commit: `8b1d64d2bb06764342205040cf00918c864abebb`
- Status: Gemini live-catalogue audit IN PROGRESS; regression coverage and remaining consumer review are still pending.
- No tests, type-check, build, live API, CI/Vercel, or Gate execution was awaited.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-16 — SONNER + ORGANISATION NOTIFICATIONS

- Implemented smooth per-toast hover expansion with viewport-constrained growth; non-hovered toast messages remain compact.
- Organisation workspace now has a notification bell and dropdown sourced from organisation onboarding status and platform announcements. Status/announcement events are surfaced through Sonner; dismissible announcements persist their dismissed state per org; status banners can be closed for the session.
- Commits: `8476e1003f6727ef5d7294642f5553c8206a146a`, `3957bdd84000b6c5cd86ff6f3715981c729ec7f1`, `2f4d8bbc69c269b313cbb76527d07bff8cf0d34b`, `3d5453afdc514479a6d1ac836381361ed03195b9`, `b37fd82a47c1c9f1daad2184b973dfe5a75e339d`.
- Implementation committed directly to `feature/ai-core-from-doable-source` through GitHub file commits. No tests/build/browser/CI/Vercel/Gate verification was run or awaited.
- Next: continue live Gemini model-catalogue audit from NEXT_ACTION.md.

---

## SONNER TOAST UX — RESPONSIVE BOTTOM STACK — 2026-10-16

Global Sonner notifications now use bottom-center placement, an expanded stack with up to five visible notifications, and viewport-aware toast sizing for phone through desktop widths. Long error text continues to wrap safely and individual toasts expand on hover. Commits: `35be473c9a744a36c13d3a88a24688765ac62c40`, `2aea322552891bb1313e39902dfecf2aba2ae52c`. Browser/build/CI/Vercel/Gate verification was not run or awaited; no visual PASS claimed.

---

## SONNER TOAST UX — 2026-10-16

Implemented compact Sonner notifications: long titles/details are clamped to one line by default, the hovered toast expands and wraps safely, and toast width/stacking are bounded for consistent interaction. Commits: `146bf14e09c3b64879908b72d1fcda2a8e2ce221`, `f3fd7ad5c925c5075b6b03a9795f59dc31165660`. Visual verification deferred; no tests/build/CI/Vercel/Gate awaited.

---

## OWNER-REQUESTED UI CHANGE — LIVE NAVBAR NOTIFICATION CENTER — 2026-10-15

[architect source review] Platform-health alerts have been moved from a large dismissible banner into a top-right navbar bell with a count badge and a priority-labelled dropdown. The client refreshes on a 30-second interval and window focus; it uses Sonner to announce new incidents, critical escalations, and recoveries without requiring a route reload. Critical incidents use a persistent Risk toast with an explicit close control; warnings auto-dismiss.

- Source commits: `550449f4bde71d04977ffd26af5faad0659e2167`, `cfbf75807a6c386e2c17fc8edf5d6bb8a83f69e9`, `872e1fd137f8485e748050fba23f18fab89827f5`, `a1f32c17ee31a268e7407ed23cd6f9d3f5e392d7`.
- External verification was intentionally not run or awaited; no tests/build/CI/Vercel/Gate PASS is claimed.
- Next product implementation remains the live model-catalogue audit recorded in `NEXT_ACTION.md`.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-14 — EMBEDDING PROVIDER POLICY ISOLATED

[architect source update] Extracted the Gemini/OpenAI embedding provider fallback decision into a pure policy helper used by `resolve.ts`, with focused regression source covering explicit override and credential conditions. This keeps embedding provider selection separate from chat/realtime provider routing and does not mutate the persisted platform default or trigger re-indexing.

Commits: `204f2e588cab69e4d99206c85fd38c41e1f3d49f` (helper), `db3a0a303f83615266bc4224762cde7190ef89d2` (regression source).

**Next:** continue the remaining live-model catalogue audit in `NEXT_ACTION.md`. Owner-provided runtime logs show OpenAI credential rejection and Gemini network/API failure; do not infer that switching providers makes an invalid Gemini key or outbound connectivity healthy. No tests/build/live call/CI/Vercel/deployment was run or claimed.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-14 — GEMINI EMBEDDING CONTINUITY

[architect source update] Added embedding-only provider selection to let development continue when OpenAI is temporarily unavailable. `AI_EMBEDDING_PROVIDER=gemini` selects Gemini for RAG embeddings when `GEMINI_API_KEY` is configured without changing chat/realtime routing; missing OpenAI credentials also permit Gemini fallback. This does not mutate the persisted platform embedding default or trigger fleet re-indexing.

Commits: `4aaf0c5409eef0414542aeadae799ac52df96c27`, `a53ba5b97cbd36417ac498972d53a533cf0ee533`, `0621d8bed7726a2a68890a4dfe02246df3797210`, `9521837f00bebae3ec30ec5f7d1f04c6768aa51a`.

**Next:** configure the runtime override and Gemini credential; for the durable production change, select Gemini in Settings → AI Platform → Embeddings so the platform queues Qdrant fleet re-indexing. Continue live model-catalogue implementation without waiting for CI/Vercel. Verification remains pending; no PASS claimed.

---

# LIVE MODEL DISCOVERY — GEMINI + ELEVENLABS REALTIME — 2026-10-12

- **Agent/session:** DEV-01 / Forge — SESSION-DEV-20261012-01.
- **Branch:** `feature/ai-core-from-doable-source`.
- **Scope:** continue owner-authorized model discovery/filtering work without waiting for CI/Vercel. Gemini realtime models and ElevenLabs realtime TTS must be sourced from the provider live catalogue, not hardcoded selectable model lists.
- **Source changes committed:** live catalogue now enriches Gemini/OpenAI/ElevenLabs model rows with known pricing/release metadata; successful Gemini/OpenAI discovery reconciles stale seeded rows; confirmed live rows are re-enabled on upsert; model list reads trigger live sync and rank by known unit price then release metadata; provider option builders accept live model rows; Gemini realtime session and public embed session validate against vendor-discovered realtime models; Gemini provider no longer silently falls back to hardcoded chat/embedding model IDs; ElevenLabs realtime TTS uses live TTS rows.
- **Key commits:** `c84acc50538653a98a8bcdb3cb2dce3cc2b6c94c`, `45923e33361da9f360d42fce7c93a1129aeac0e1`, `00c6dd8a71197b527fab59cfec0c24cbd6d6ade5`, `07eb032b366386886ca01a47d48f5701dcdb491b`, `66f22879253530d5faf66c6575bb2f3ac128580d`, `ad7003c8a09cab44137411ceefe5b0840140c0fc`, `87bdfbc7f06baea44c465ce1a53cb2972db3ffa8`, `bdb9b3b54d32551fc67b9d2f9c374f4b172cbae0`, `2c489a24a4f81f7cd06502d53e46e2fa3d77f9bd`, `4496851781f13426a8db363764cabf8c8a85ccf2`, `6f0cea8f4d682ae76a3fa7a8a522512b91e648bb`, `9b850ec47a42103b5e6cb4b4916d19b4f26e7dbe`.
- **Verification boundary:** source commits/rereads only. Tests, type-check, lint/build, migration execution, live provider calls, CI/Vercel, deployment, and browser verification have not been run. No PASS claimed.
- **Remaining:** inspect and remove remaining static Gemini availability/default lists outside the two realtime routes (including legacy core option helpers, bootstrap/seed defaults, and any consumers not routed through governance); validate dynamic selectors in all admin/org/agent surfaces; add/fix focused regressions for empty/failed discovery and model sorting. Vendor list endpoints do not always expose authoritative prices/release dates; preserve honest unknown-price ordering and do not fabricate dates.
- **Exact next action:** continue DEV-01 from `docs/project-control/NEXT_ACTION.md`; inspect the remaining Gemini model catalog and all callers, then replace any remaining selectable static lists with the governance live catalogue. Do not wait for CI/Vercel.
- **Parallel known work:** FIX-01 I-097 type-check residuals remain active; follow the latest FIX-01 NEXT_ACTION separately. Do not assume those diagnostics are fixed.
- **Security:** API keys remain server-side. When provider discovery fails, realtime runtime selection fails closed instead of using a seeded static model.

---

# FIX-01 TYPE-CHECK ROOT-CAUSE CORRECTION — 2026-10-12

- Branch: `feature/ai-core-from-doable-source`.
- Source correction: `34aca73cd5ad2fc5c67396d1d35f24dcf38d7964` removes the incomplete ambient Stripe module declaration from `src/types/payments.d.ts` while preserving the Razorpay declaration.
- Confirmed root cause for the Stripe missing-member diagnostic cluster: the ambient module shadowed the installed Stripe SDK's official types.
- Issue I-097 remains IN PROGRESS until a fresh local type-check confirms which diagnostics remain.
- **Verification boundary:** No post-change type-check, tests, build, Docker, CI/Vercel, deployment, or live Stripe/billing verification was run. No PASS claimed.
- **Recovery:** `git pull origin feature/ai-core-from-doable-source`; `npm run type-check`.
- Unrelated user working-tree files, including untracked Doable-source extraction files and `tool-results/`, were not modified by this remote source correction.

# MCP RUNTIME IMPLEMENTATION UPDATE — 2026-10-11

- DEV-01 added `src/modules/ai-platform-core/mcp-streamable-http-resolver.ts` behind the existing `McpToolResolver` interface and connected source-level tool advertisement/dispatch in authenticated Chat and OpenAI realtime voice through the Unified Tool Runtime.
- The resolver performs per-request DNS validation with a pinned public IP, TLS verification, no redirects, bounded request/response sizes, timeout/cancellation, paginated discovery, schema conversion/validation, stale-schema checks, and execution-time tenant/caller/plan/grant rechecks.
- Migration 070 records a successful MCP discovery as `connected` while preserving the encrypted-credential requirement; the org UI shows the last handshake and supports bearer credential rotation. The migration is not applied/verified in this workflow.
- A bounded 3-second discovery singleflight cache is scoped to one exact execution context and credential fingerprint. Every resolution rechecks DB authorization; invocation bypasses the cache and re-discovers the current schema. No cross-request or cross-tenant cache is used.
- **Verification pending:** no tests, typecheck, lint/build, migration, live handshake, Chat/realtime E2E, CI, Vercel or deployment was run. This is not a PASS.
- Keep platform MCP servers disabled and `ENABLE_MCP=false` until focused execution tests and a controlled live handshake succeed.
- Details and next steps: `docs/project-control/sessions/SESSION-DEV-20261011-01.md` and `docs/project-control/NEXT_ACTION.md`.

---

# OAUTH APP SAVE FAILURE FIX — 2026-10-11

- Production evidence identified a runtime missing-export error: `normalizeScopes is not a function` in the platform integration OAuth-app PUT route.
- Fixed source by exporting `normalizeScopes` from `src/modules/integrations/oauth-app-validation.ts` (commit `bfc5fc00de27309598b4bcfe4813f8626de9b8b0` on `feature/ai-core-from-doable-source`).
- This is a source fix only. The deployed container must rebuild/reload the module before retest; live save is not verified.
- The pasted diagnostic command contained a session cookie and Google OAuth client secret. Rotate/revoke them before retry. Never store those values in project-control records.
- Detailed record: `docs/project-control/sessions/SESSION-DEV-20261011-01.md`.

# MCP CONTROL-PLANE UPDATE — 2026-10-10

- MCP control-plane source slice added on `feature/ai-core-from-doable-source`: migration 069; platform super-admin registry API; org-scoped encrypted connection and org/agent grant API; existing platform/org/agent integration UI panels; focused regression source.
- Credentials are encrypted and never returned by API; saved credentials are marked `configured`, not `connected`. Server defaults disabled.
- **Runtime remains incomplete:** no live transport/discovery/handshake or MCP tool registration in actual Chat/realtime voice is established. Keep servers disabled until resolver/runtime wiring lands.
- Current exact next action is in `docs/project-control/NEXT_ACTION.md`; detailed session in `docs/project-control/sessions/SESSION-DEV-20261010-02.md`.
- Verification boundary: source commits and rereads only; tests were authored but not run; no migration/build/deployment/runtime PASS claimed.

---

# CURRENT PROJECT STATE — 2026-10-09 — WHATSAPP CONNECTION + BRIEFING SENDER SOURCE ADDED

- Branch: `feature/ai-core-from-doable-source`.
- DEV-01 implemented Meta OAuth initiation/callback with user/agent permission recheck, encrypted token persistence, WABA/phone selection and one-active-phone constraints; WABA subscription; signed, idempotent webhook processing; durable inbound message and delivery-status rows; server-backed Messaging health; explicit briefing recipient/opt-in; and a CRON_SECRET-protected daily briefing sender registered every 15 minutes (UTC), processing up to three eligible connections per invocation and at most one successful run per connection/UTC date.
- Daily sends require an active connection, signed webhook verification, `daily_briefing_enabled`, E.164 recipient, opt-in, and a configured approved Meta template. Per-connection/date runs and outbound provider message IDs/statuses are persisted.
- The first briefing is a deterministic excerpt digest, not an AI-generated summary. Token expiry is persisted when Meta returns `expires_in`; expired tokens and Graph 401/403 or invalid-token codes mark the connection unhealthy and disable briefing eligibility. Messaging has a manual WABA access probe; proactive health checks/reconnect and ambiguous-run reconciliation remain follow-up.
- Setup guide: `docs/deployment/whatsapp-business.md`. Regression source authored but not run.
- No tests/typecheck/build/Docker/CI/Vercel/deployment/live Meta flow or actual scheduled delivery was run or awaited. No runtime PASS is claimed.
- Exact next action: follow `docs/project-control/NEXT_ACTION.md`; do not wait for external gates.

---

# CURRENT PROJECT STATE — 2026-10-09 — WHATSAPP SERVER LIFECYCLE SOURCE ADDED

- Branch: `feature/ai-core-from-doable-source`.
- DEV-01 added the Meta WhatsApp OAuth start/callback, encrypted token persistence, WABA/phone selection and uniqueness constraints, WABA subscription, signed webhook endpoint, transactional idempotent event processing, durable inbound message/delivery state, server-backed Messaging status, and a verified-webhook briefing eligibility flag.
- Added migration `067_whatsapp_business_lifecycle.sql`, regression source for webhook security helpers, and `docs/deployment/whatsapp-business.md`.
- Source commits include `27ad17cb8f9bff9d0278ce4eb68900e81fe2ecfe`, `89ce8d7b23e1fadb877c41f14540aa140b2f864b`, `496db2482512d39d632ee2c95c5ec2779a466bd4`, `3b238a36890b9f6d2acb8973a4e9681d6606ce26`, `19c6401062334447277171c3e44c906809378a6d`, `a5ccba51b4ecd06bc279c9f8f67b13c34cb1dc78`, `dc8f21c4cc0ee7a614d6aa2f20402e35dbe33ee5`, `30fca3dfe1d2fc6a847cc8da7ca725a4dcf93f0c`, and `392978f3df24a2656c43ed4b12241317ad1df66`.
- No tests/typecheck/build/Docker/CI/Vercel/live Meta flow or deployment were run or awaited. No runtime PASS is claimed.
- Remaining: outbound message sending and delivery-state capture, actual scheduled daily summary worker (only the readiness/preference flag exists), token expiry/revocation/reconnect health, and focused route-level regression source.
- Exact next action: follow `docs/project-control/NEXT_ACTION.md`; do not wait for CI/Vercel/Gates.

---

# CURRENT PROJECT STATE — 2026-10-09 — WHATSAPP MESSAGING UX ENTRY POINT ADDED

- Branch: `feature/ai-core-from-doable-source`.
- Current owner-authorized DEV-01 task: WhatsApp Business connection UX and its missing server-side lifecycle.
- Source commits add the per-agent Messaging page and Connect WhatsApp Business dialog, plus desktop sidebar/mobile tab navigation.
- The UI does not claim connected status: the repository has no WhatsApp-specific OAuth/connect route, verified webhook handler, or durable message store yet.
- Verification: GitHub source commits succeeded; tests/typecheck/build/Docker/CI/Vercel/live Meta connection were not run or awaited.
- Next action: implement server-side Meta WhatsApp connection, tenant/agent-safe phone binding, webhook verification and durable message state, then bind UI to actual connection health. See `docs/project-control/NEXT_ACTION.md`.

---

# CURRENT PROJECT STATE — 2026-10-09 — I-6 COMPLETE; OAUTH + SHARED POLICY IMPLEMENTED AT SOURCE LEVEL

- Branch: `feature/ai-core-from-doable-source`.
- I-6 MCP Tool Bridge: implementation complete at source level, including immutable policy snapshots before async resolver discovery. Regression source authored; executable verification remains deferred.
- Integrations & AI Enhancement Roadmap: owner-authorized and in progress.
- OAuth consent source includes one-time state hashing, expiry, encrypted PKCE verifier, org-authorized start, atomic callback consumption, HTTPS/no-redirect token exchange, entitlement rechecks, encrypted tenant-scoped token persistence, HEADER/BODY refresh parity, and safe callback status.
- Connection reliability source includes server-side credential validation, user-scoped health summaries, expired/error/revoked status, explicit disconnect/reconnect, and exact agent-scope deletion.
- Shared integration capability policy is centralized in `src/modules/ai-platform-core/integrations/integration-policy.ts` and reused by the I-4 bridge and AI action tool. Authorization query errors are sanitized; availability exposes only runtime-resolvable actions and safe readiness guidance.
- Verification status: regression sources authored; tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent were not run or awaited. No production recovery or runtime PASS is claimed.
- Next action: continue P1/P2 typed action safety and idempotency/approval hooks through the existing Unified Tool Runtime. See `docs/project-control/NEXT_ACTION.md`.

---

# CURRENT PROJECT STATE — 2026-10-09 — I-6 CLOSED AT SOURCE, OAUTH LIFECYCLE IN PROGRESS

- Branch: `feature/ai-core-from-doable-source`.
- I-6 MCP Tool Bridge: implementation complete at source level, including immutable policy snapshot before asynchronous resolver discovery. Regression source added; executable verification remains deferred.
- Integrations & AI Enhancement Roadmap: owner-authorized and in progress.
- P0 OAuth consent source: one-time state hash, short expiry, encrypted PKCE verifier, organisation-authorized start, atomic callback consumption, provider token exchange, encrypted connection persistence, refresh auth-mode parity, server-side credential validation, and safe connection health UI/API are implemented in source.
- Verification status: regression sources authored; no tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent were run or awaited. No production recovery or runtime PASS is claimed.
- Next action: continue bounded connection recovery and then P1 shared integration capability/readiness contracts. See `docs/project-control/NEXT_ACTION.md` for exact steps.

---

## 2026-10-09 — Integration runner webpack import correction

[architect-verified] Owner-provided self-hosted Docker output exposed five unresolved imports in src/modules/integrations/runtime/runner-core.ts. Changed the registry, credential-vault, context-builder, XRay, and runner-fetch imports from explicit .js suffixes to extensionless relative imports for Next.js webpack resolution.

- Source commit: b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd
- This is a source correction only. No build/deployment or current-head test success is claimed.
- Continue the active integrations roadmap; do not wait for GitHub Actions, Vercel, or Gates.

---

## CURRENT INCIDENT UPDATE — 2026-10-09 — OAUTH MIGRATION BUILD GUARD

[architect-verified] Added a production fail-closed guard in `scripts/migrate.ts`: production/Vercel migration runs now exit unsuccessfully if `SKIP_DB_MIGRATIONS=1` is configured. This closes a deployment-safety gap that could otherwise allow an application build to succeed while schema changes were skipped.

- Code commit: `176f9f26a13152f64aae505f1d04fee750f01411`.
- Project-control records updated: NEXT_ACTION `c88cd191df7d048f53653b8fb326938f2db23d86`, worklog `a45c350bd231f32a771bb56ac4b590e9923cff81`, VERIFICATION_STATE `50b1843d650c13619ce7cc2d7f8cd63b99ca0386`.
- The OAuth table migration is already uniquely numbered as `065_platform_integration_oauth_apps.sql`; the earlier duplicate-number correction remains in branch history.
- Tests, CI, Vercel build, live database migration state, deployment, and endpoint smoke test were not run or awaited. The live production incident is not marked resolved; corrected source must be deployed and migration success confirmed.

## CURRENT AUTHORITATIVE STATE — 2026-10-09 — REALTIME VOICE DISPATCH REVIEWED

[architect-verified] DEV-01 / Forge reviewed the bounded realtime voice integration dispatch source on `feature/ai-core-from-doable-source`. Outcome: **PASS_WITH_FOLLOWUP — SOURCE REVIEW ONLY**. No substantial defect requiring FIX-01 was identified. The endpoint rejects disabled rollout flags and non-allowlisted tools, requires authenticated non-platform-admin KB membership with `kb:read`, derives org/agent/user/session identity from server state, and invokes the existing Clara Unified Tool Runtime. The client explicitly blocks embed-key sessions from integration dispatch.

Focused regression source exists, but tests/build/CI/Vercel/Gates were not executed. No deployment or broader task closure is claimed. Exact next action: stop and await the next owner-authorized bounded task; do not infer authorization for unrelated implementation.

## CURRENT AUTHORITATIVE STATE — 2026-10-09 — REALTIME VOICE INTEGRATION DISPATCH SOURCE-COMPLETE

[developer-reported] The current authorized integration runtime task now includes realtime voice dispatch through the same Clara Unified Tool Runtime used by provider chat. Both rollout flags remain default-off. Integration descriptors require authenticated non-super-admin KB membership with `kb:read`; the invocation route resolves org/agent/user/session server-side and rejects unknown tool names.

- Source commits: a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.
- Regression source authored in `src/modules/assistant/api/realtime.test.ts` and `src/modules/assistant/api/realtime-tool.test.ts`.
- Tests/build/external CI/Vercel/Gates/deployment were not run or awaited.
- Task status: IN_PROGRESS pending architect review; this is not a deployment or PASS claim.

**Next:** architect review of the bounded source implementation; do not invent unrelated follow-on scope.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-09 — OAUTH APP CONFIGURATION MIGRATION COLLISION

[architect-verified] The reported OAuth application configuration GET 500 is consistent with duplicate numbered DB migrations: the OAuth-app table migration and payment-settings migration both used `063`, and the migration runner intentionally rejects duplicate numeric prefixes. The OAuth-app migration was renumbered to `065_platform_integration_oauth_apps.sql` after `064_sarvam_realtime_streaming.sql`.

- New migration commit: `a85d58837719a6c7ac8aef4a28c909a262289bec`
- Duplicate removal commit: `800826364c4b23be625629ebf9922687de84f342`
- No CI, Vercel build, Gate, or live endpoint verification was run/awaited.
- Source correction is not a production deployment claim.

**Next implementation:** continue realtime voice integration dispatch through the Unified Tool Runtime, as directed by `NEXT_ACTION.md`.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-09 — PROVIDER CHAT DISPATCH IMPLEMENTED

[architect-verified] The KB-aware provider chat route now has a default-off integration tool-calling path. When both `ENABLE_AI_PLATFORM_AGENT_LOOP` and `ENABLE_AI_PLATFORM_TOOL_CALLING` are explicitly enabled, and the configured provider implements `chatStreamWithTools`, the route exposes only `integration_availability` and `integration_action` to the model and delegates their execution through `getClaraToolRuntime()`. The runtime context is minted from server-resolved organisation, KB, agent, authenticated user, and optional session identity; request-body identity is not trusted.

- Route implementation: `df124e837b49a17d1e218eca9a585a8313dbdec6`.
- Both flags remain default-off; providers without tool-call support retain the existing streaming path.
- No tests, CI, Vercel build, or Gates were run or awaited.
- Active bounded task remains IN PROGRESS: realtime voice dispatch to the same authorised runtime is next.

**Next:** inspect the existing realtime voice tool invocation path and route its supported integration tool calls through the same Clara Unified Tool Runtime with provenance-verified context.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-09 — INTEGRATION RUNTIME DISPATCH

[architect-verified] Owner-authorized organisation integration setup/AI access task is active. Platform OAuth app configuration validation is hardened and has dedicated regression source. Provider chat and realtime voice dispatch remain the next bounded implementation items; this task is not yet complete.

- OAuth validation implementation: `175803e3b30605baf8546e49878c4a5d4dcf9255`
- Validation module extraction: `99aab21e6e31436073ed2ffe638c216f5f818a2a`, `7c0614d878c43ac50ec3e89d4c017a690c379d42`
- Regression source: `e8f1a1cf3b0bdcaea81a83a609a3be20bf5737d4`
- No tests, CI, Vercel build, or Gates were run or awaited.
- I-6 remains implementation-complete; the active task is organisation integration setup + AI access.

**Next:** provider chat tool-call dispatch through the Unified Tool Runtime with verified tenant/agent/user context.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — ORGANISATION INTEGRATION SETUP + AI ACCESS

[architect-verified] Owner-authorized integration usability/runtime task supersedes the prior "no authorized next implementation" state. The immediate defect is that organisation credential setup relies on a raw text/JSON field and does not guide users through provider-specific credentials. Agent access already enforces platform enablement, organisation grant, connection readiness, plan entitlement, and per-agent grants.

### Implemented in this task
- `src/features/admin/screens/org-integrations-screen.tsx` now renders structured credential fields using registry `customAuthFields` where available, with explicit fallback fields for secret-text, OAuth2, and basic-auth integrations.
- Added validation for required fields, request failure messages, success feedback, reconnect/update credentials flow, and a copyable OAuth callback reference.
- UI explicitly clarifies that the callback reference is not an interactive OAuth consent/token-exchange flow; do not represent OAuth as complete until a real server-side callback/state/token exchange is implemented.
- Commit: `5e6c99c06e1fa314c229e83de84832a6e6502b66`.

### Still required in this bounded task
1. Add a secure platform-level OAuth app configuration path for provider client IDs/secrets and callback configuration, using encrypted persistence and never echoing secrets.
2. Ensure provider chat tool-calling dispatch can invoke `integration_availability` and `integration_action` through the Unified Tool Runtime with provenance-verified tenant/agent/user context.
3. Ensure realtime voice agent tool invocation can reach the same authorised integration runtime without introducing a parallel executor or exposing credentials to the model.
4. Update focused regressions and project-control records as source implementation progresses.

### Security/rollout constraints
- Never return stored secret values to the browser.
- Keep exact platform → organisation → agent grants and plan entitlement checks.
- Integration execution must remain in the Unified Tool Runtime / existing runner; do not call provider APIs directly from UI.
- Do not fabricate an OAuth callback or claim a working OAuth flow from a displayed URL.
- Do not wait for CI, Vercel, Gate-C/Gate-D, or continuous verification; report external verification as deferred.
- Next implementation: continue the secure OAuth configuration/runtime dispatch items above, starting with actual route and provider-tool contracts.
- STOP: no broad unrelated provider rollout, billing redesign, production promotion, or changes to unrelated integrations.

---

## I-6 FINAL IMPLEMENTATION RECORD — 2026-10-09

[architect-verified] The final bounded I-6 source implementation is complete. The MCP bridge now validates the injected resolver both at public definition construction and before enabled runtime creation, including an empty request set. This closes the final runtime trust-boundary gap identified during bounded review.

- Final source correction: `74e410e2e21cb641b33e660981877a555cabfc96`
- Existing focused regression for malformed empty-request runtime: `bbdedae0497fc4b01ae0a4a4f4eb42e520add55c`
- I-6 implementation objective: **COMPLETE**.
- No additional I-6 source implementation item remains.
- External CI/Vercel/Gate-C/Gate-D remain deferred and are not represented as PASS.

---

## I-6 IMPLEMENTATION COMPLETION — 2026-10-08

[architect-verified] Bounded I-6 MCP Tool Bridge hardening is now source-complete. The final correction validates the resolver before runtime creation and commits normalized identity bookkeeping only after successful runtime registration, preventing malformed empty-request runtimes and rejected-capability poisoning.

- Resolver-boundary implementation: `2d1b4c1b53023883c33b478cc7ed637e80433911`
- Resolver-boundary regression: `358ac36cc0fd4d0ad4fd1804087b14408b2fa9ea`
- Registration bookkeeping correction: `63fe42e176e95732a46c3c16f20c586ab025ce99`
- I-6 implementation objective: **COMPLETE**.
- External CI/Vercel/Gate-C/Gate-D evidence remains deferred and is not represented as PASS.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE — FINAL REGISTRATION CORRECTION

[architect-verified] I-6 bounded implementation is complete. Final registration hardening ensures an MCP capability identity is recorded as registered only after Unified Tool Runtime registration actually commits. A rejected registration therefore cannot poison a later identical resolution attempt in the same runtime build.

- Implementation: `a215bb81b1bf53f1c4c98d5205aa841bb2a0ee43`
- Regression: `e4cdc946a15b76a004e4123be5eaf060b4edcd9d`
- I-6 status: **IMPLEMENTATION COMPLETE — EXTERNAL VERIFICATION DEFERRED**.
- No CI, Vercel build, Gate-C, or Gate-D completion is claimed.
- No further I-6 source implementation item remains authorized by the current plan.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE

[architect-verified] I-6 MCP Tool Bridge bounded implementation is complete. The bridge now has the required host-neutral descriptor/resolver contract, exact server/tool allowlisting, default-off runtime flag, provenance-verified execution-context binding, runtime schema validation, Unified Tool Runtime delegation, deterministic collision-resistant names, resolver/policy/descriptor runtime-boundary validation, fail-closed discovery/registration, isolated MCP runtime registration, and public AI Platform Core export.

Latest hardening:
- `aa6951a499fd66c40a467c646332d8cacd019648` — MCP policy runtime-boundary hardening.
- `17c925a11a478d910779c3ce77e946500252ed67` — malformed-policy regression.
- Prior I-6 hardening remains in history through resolver shape, exact execution-context binding, frozen resolution request, descriptor/schema validation, allowlist, collision, and runtime delegation corrections.

I-6 status: **IMPLEMENTATION COMPLETE — EXTERNAL VERIFICATION DEFERRED**.

No CI, Vercel build, Gate-C, or Gate-D completion is claimed. Those remain separate verification work and were intentionally not awaited.

No further I-6 source implementation item is authorized by the current project-control plan. The next implementation may begin only from the next explicitly authorized project-control action; do not invent an I-7 scope.

---

## CURRENT AUTHORITATIVE I-6 STATE — 2026-10-08 — REGISTRATION BOUNDARY HARDENING

[architect-verified] The MCP runtime builder validates the injected resolver before registration iteration, including the empty-request case. Malformed resolver input fails closed instead of producing a misleading empty runtime.

- Implementation: `a885eac30a6b6ce8056ecc57091f6319d8d032a2`
- Regression: `bbdedae0497fc4b01ae0a4a4f4eb42e520add55c`
- I-6 remains IN PROGRESS; external CI/Vercel/Gate evidence is deferred.

**Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 MCP RESOLVER SHAPE HARDENING

[architect-verified] Bounded I-6 source review identified that the public MCP ToolDefinition builder trusted the TypeScript resolver interface even though the resolver is an injected runtime boundary. The bridge now explicitly requires callable `resolve` and `invoke` methods and fails closed with a typed MCP resolver error before capability construction.

- Implementation: `d6ee7f8acd007ffe0b687f9acd7a1522e28efcab`
- Regression: `6fda566ecfe25361ee2bbf1901433ec46609fc53`
- I-6 remains IN PROGRESS — bounded source hardening.
- External CI/Vercel/Gate-C/Gate-D remain deferred and are not represented as PASS.

**Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 RESOLVER REQUEST IMMUTABILITY CORRECTION

[architect-verified] The active I-6 MCP bridge now passes a frozen resolution-request snapshot into the injected resolver, making the resolver's readonly request contract enforceable at runtime. The policy validator also rejects malformed non-boolean `requireUserId` values.

- Implementation: `9cfec56c90da88e367ac543e174716639802862b`
- Regression: `7ac7557abeb700f0a3a42ffd44ce58346c0b165a`
- Control update: `7a49feb4c664f9d857c2daa3b28a8148a2c27379`
- I-6 remains IN PROGRESS — bounded source hardening.
- External CI/Vercel/Gate-C/Gate-D remain deferred and are not represented as PASS.

**Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 MCP TOOL BRIDGE ACTIVE

[architect-verified] I-6 resolver request integrity is now hardened: the bridge snapshots the pre-resolution server/tool identity and provenance-verified execution context and rejects resolver mutation before capability construction.

- Implementation: `8eb6bff89abd1867c3136f2dcfa32eed8b9a8751`
- Regression: `556d48320a44b546919b9da177ec74c50c89f27a`
- I-6 remains IN PROGRESS — bounded source hardening.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction and are not represented as PASS.

**Next implementation:** continue remaining bounded I-6 resolver/registration and capability-authorization invariant review.

---
## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 MCP TOOL BRIDGE ACTIVE

[architect-verified] I-6 now requires an exact server/tool allowlist pairing; separate server and tool membership can no longer authorize a cross-product capability. Implementation `37ae1f648df78cd651bd7eecec0bcce1fd3847c0`; regression `a0ac98adacadbd77d78e98cb88bd49fac49e7167`.

- I-6 remains IN PROGRESS — bounded source hardening.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction and are not represented as PASS.

**Next implementation:** continue remaining bounded I-6 source acceptance/reconciliation work.

---

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-6 MCP TOOL BRIDGE ACTIVE

## 2026-10-08 — I-6 resolution-context binding correction

## 2026-10-08 — I-6 malformed-capability registration hardening

[architect-verified] I-6 now treats malformed resolver descriptors as unavailable capabilities when Unified Tool Runtime registration rejects them, preserving unrelated valid registrations. Latest correction commits: 9eb58ab6, ddaa02bc.


[architect-verified] I-6 now binds each resolved MCP capability to the exact provenance-verified execution context used for resolver discovery; cross-context invocation fails closed. Focused regressions cover the context-binding boundary, default-off runtime builder, and runtime registration. Latest correction commits: 635b5126, 55e7f36c, 02bff62a.


[architect-verified] The owner has directed continuation to the next bounded integrations capability without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification. Repository branch `feature/ai-core-from-doable-source` is in the I-6 implementation continuation; the live branch tip must be read from GitHub at recovery time.

- I-3 Action Runner implementation is already present; it is not the current pending implementation.
- I-4 Unified Tool Runtime bridge is implementation-complete.
- I-5 Firecrawl search pilot is implementation-complete and default-off.
- I-6 is the active bounded capability: MCP tools resolved by a host adapter are represented as Clara `ToolDefinition` capabilities and executed only through the existing Unified Tool Runtime.
- I-6 hardening now includes resolver identity binding, resolver-failure fail-closed behavior, runtime schema/context regressions, and public AI Platform Core export.
- Latest I-6 implementation commits: `9e855c7`, `012aca0`, `95b75a8`, `fb326688`, `b59f1c9`, `827eae5`, `d571813`, `0b1856b`, `ff64b9b`, `12815df`, `d90cddbe`.
- I-089 mutation-boundary hardening is source-corrected: policy/descriptor bindings are snapshotted and normalized-name collisions fail closed.
- External execution evidence remains deferred by owner instruction and is not represented as Gate-C/Gate-D PASS.

**Next implementation:** continue the remaining bounded I-6 source-level acceptance/reconciliation work; do not wait on external CI/Vercel.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, production promotion, billing redesign, or unrelated implementation.

---
---

## 2026-10-08 — I-4/I-5 owner-authorized implementation continuation

[architect-verified] The owner explicitly directed continued development through **Integrations Framework I-4 — Unified Tool Runtime bridge** and **I-5 — First Provider Pilot**, without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

- I-2 remains implementation-complete with external verification deferred; no I-2 PASS/CLOSED is inferred.
- I-3 source implementation is treated as the prerequisite implementation track completed for continuation; external verification remains deferred and is not acceptance evidence.
- I-4/I-5 are now the active implementation scope.
- I-4 implementation commits: `f44caf5`, `a86ffd5`, `6be5dd5`, `9d746ed`, `8927e2c`.
- I-5 implementation commits: `829667e`, `b5f9640`, `92c611a`.
- Planning contract: `docs/superpowers/plans/2026-10-08-integrations-i4-i5.md`.
- I-4 uses the existing Phase 7 Unified Tool Runtime and delegates execution to the existing I-3 `runAction()`; no parallel executor exists.
- I-5 is default-off and limited to Firecrawl `search`; connection lifecycle remains the existing I-2 path.
- **STOP:** no MCP expansion, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

## 2026-10-08 — I-3 continuation checkpoint

[architect-verified] I-3 correction `77b806f65d002b53bb6a7d04294ec0164dc392d5` preserves redacted per-run HTTP traces in failed runner results; failure responses now retain deterministic trace evidence.
- No CI, Vercel, Gate-C, or Gate-D execution was awaited.
- Next bounded I-3 work remains strict schema edge cases, deterministic result propagation, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression coverage.

[architect-verified] The active phase remains **Integrations Framework I-3 — Action Runner**. Owner instruction explicitly permits continued implementation without waiting for GitHub Actions, Vercel, or phase gates.

- Current feature-branch tip must be read from GitHub at recovery time; the latest bounded I-3 implementation commits are listed below and no stale SHA is treated as authoritative.
- Latest I-3 corrections: typed egress/DNS/redirect failure propagation
- Latest I-3 continuation commits: `d3c18c3`
- Latest I-3 trace-hardening commits: `d0799b3` and `c764fa4`; arbitrary thrown HTTP errors now scrub known resolved secrets before trace storage., `62ef2fe`; action lookup and strict input rejection now use explicit host-owned error classifications rather than message parsing. with redacted blocked-request traces; recursive array-item action-input validation in strict mode; focused regression coverage for both.
- I-3 remains **IN PROGRESS**; no I-3 PASS/closure is inferred.
- I-2 remains implementation-complete with external verification deferred.
- **STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-3 ACTIVE

[architect-verified] Owner authorization explicitly advances implementation to **Integrations Framework I-3 — Action Runner** while I-2 executable verification remains deferred. I-2 is not claimed PASS/CLOSED. The active implementation scope is I-3 only; I-4/I-5, MCP, production promotion, and unrelated work remain out of scope.

Current I-3 implementation/support commits: `57f5fd9`, `99a574e`, `9e921b2`, `ef10442`, `70ba919`, `5b83952`. The latest bounded corrections complete typed egress/redirect classification at the fetch boundary and extend strict input validation into array items.

**Recovery rule:** this block supersedes older checkpoint prose below; historical I-2 entries remain historical evidence and must not be interpreted as the current active phase.

---
## 2026-10-07 — I-075 Activepieces action allowlist correction

[architect-verified] Bounded I-2 review corrected runner capability expansion: runAction() now enforces the Clara registry action allowlist before loading an external Activepieces piece. Implementation c1705ac81c4e77239feca6d518d3ef2afcd0403c; regression 3d41bdc09e125b3143bfb58ddf162b00bd335c8b. I-075 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 review only; do not wait for GitHub Actions or Vercel and do not expand to I-3/MCP/production.

## 2026-10-07 — I-074 execution-authorization source correction

[architect-verified] Bounded I-2 review corrected literal \\n escape text in `src/modules/integrations/runtime/execution-authorization.ts`. Commit `c6240da3ea64869ce4f49dafa4583cd9b626af88`. I-074 is RESOLVED by source correction. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 review only; do not wait for GitHub Actions or Vercel and do not expand to I-3/MCP/production.


## 2026-10-06 — I-073 OAuth refresh endpoint integrity correction

[architect-verified] Bounded I-2 source review found OAuth refresh trusted the connection-stored `token_url` even though the registry defines the authoritative OAuth token endpoint. Commits `59957d4ea03dfb89f8a90c9976322aae86821e73` and `6b781ed042003bd62f056d35b9f5952176b5cb73` bind refresh to `def.oauth2Config.tokenUrl`; regression `db0284111f94955c038e60bbb62fc59068d208a4` rejects mismatched endpoints and covers the matching path. I-073 is RESOLVED. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 source review only; no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-072 connection auth-type authority correction

[architect-verified] Bounded I-2 source review found organisation connection creation persisted caller-supplied `authType` instead of the registry definition. Commit `879e3cbcc98392a48fe8e461255460f8d0e06c4b` now persists `def.authType`; regression `be01ab6ac2d97cf36c6400ef43d121c9c8699902` covers conflicting caller input. I-072 is RESOLVED. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-071 custom integration error-body hardening

[architect-verified] Bounded I-2 source review identified raw provider response bodies in credential-bearing custom ElevenLabs TTS/STT and Supabase PostgREST errors. Commit `9c1a838c54cf036f67ac05810b3b6bea0b1f9799` removes response-body propagation; regression `0d1494ea8686c3186589cf657a8dc361d3443af4` covers the PostgREST failure boundary. I-071 is RESOLVED. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. No I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-067 IPv4-mapped IPv6 egress correction

[architect-verified] Bounded I-2 source review identified an SSRF bypass in the host egress policy: IPv4-mapped IPv6 literals encoded with the final IPv4 address as hexadecimal (for example `::ffff:7f00:1`) were treated as IPv6 and could bypass the private IPv4 ranges. The egress guard now decodes both dotted-decimal and hexadecimal IPv4-mapped forms before applying the IPv4 deny ranges.

- Implementation: `8d176739784d2d510f20d242b533a7383ac5de98`.
- Regression coverage: `ee76381b577f5ffdeb658f4ccdc9b7dd27653cc0`.
- I-067: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-064 AI integration-tool plan-resolution fail-closed correction

[architect-verified] Source review identified inconsistent fail-open plan resolution in the AI-visible integration_action and integration_availability boundaries. Both now use resolveOrgPlanLimits directly; execution denies on resolution failure and availability exposes no capabilities without authoritative entitlement. Implementation/test commits: 0f5c2ad1372be0c60ed72b11863b9aad8e48fda6, f394054afa6aa92e8c33ef5dbf7bb0554bf18730, c857a8777f0a9f6ea7f535734966b1d2546d1ca8, 305f59663e83ab8deea910b350c746c2af1420b6. I-064 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-06 — I-063 Supabase Management fallback authorization correction

[architect-verified] Source review found that the custom supabase.execute_sql action required the separate supabase-mgmt authorization even when no active Management connection existed, preventing the documented service-role/PostgREST fallback. The bounded correction adds a tenant/user/agent-scoped active-connection existence check without decrypting credentials; Management authorization and credential retrieval occur only when that optional connection exists. Implementation commits 6719be8bec7cf9f6deeae30fb1c3ff01b108a9ea and aa99287f844c7b99c381666df98071878050e5f5; regression 457b07d7db82736a1b7724e4da1476ff9477fbe7. I-063 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-06 — I-061 custom Management credential authorization correction

[architect-verified] Source review found that custom `supabase.execute_sql` directly read the separate `supabase-mgmt` credential without re-checking that integration's platform/plan/organisation/agent authorization. Commit `5f6d044a2ec1d8ddacaf9bde553f17576c14732e` adds the fail-closed authorization check before credential retrieval; regression `3ebbbf7113e851a427d310aee2d3a057a6b8ba83` covers denial-before-read. I-061 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



## 2026-10-06 — I-057 OAuth refresh disable-race correction

[architect-verified] The I-2 credential refresh path was hardened against a concurrent disable: tenant-scoped decrypt/update now require an active connection, and the runner fails closed if the post-refresh active connection disappears. I-057 is RESOLVED by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
# PROJECT_STATE.md

## 2026-10-08 — I-3 typed runner error boundary hardening

[architect-verified] Continued bounded I-3 Action Runner review found that deterministic classification still depended primarily on matching provider/error message text. The runner now has a host-owned `IntegrationRunnerError` with explicit `IntegrationErrorCode` and retryability, and the core runner plus egress policy use typed classifications for key boundary failures. Legacy/provider errors retain conservative compatibility heuristics. A focused regression verifies explicit classifications take precedence over misleading provider wording.

- Corrections: `6deba78a0ce6a167bb3004164cb0bea8a84c4153`, `3128347169fc107d444bb6b5d5004cdd26a6c9b9`, `2a867bff3b3a19a68d40ad16a9a90fa9f590eef3`, `3a93d4b371b12e966effc80c9a73fc73480fd8ee`.
- Scope: I-3 Action Runner error contract, egress failure classification, and focused regression only.
- No CI, Vercel, Gate-C, Gate-D, or continuous verification was awaited.
- I-2 remains implementation-complete with external verification deferred; I-3 remains the active implementation phase.

**Next implementation:** continue bounded I-3 acceptance review for remaining action-runner gaps, especially strict input-schema coverage, egress/redirect boundaries, redacted trace invariants, deterministic result propagation, and tenant-isolation regression coverage.

**STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

 — Authoritative Current-State Summary

## 2026-10-06 — I-066 integration mutation plan resolution must fail closed

[architect-verified] Source review found that organisation enable/connect and agent enable mutation routes still used the UI-oriented `getOrgPlanLimits()` helper, which falls back to free-plan limits when authoritative plan resolution fails. The bounded correction switches those mutation authorization paths to `resolveOrgPlanLimits()` and returns 503 on resolution failure; focused regressions cover both routes. Implementation commits: `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98`; tests: `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`. I-066 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



## 2026-10-06 — I-065 OAuth expiry status must not overwrite an explicit disable

[architect-verified] Source review of the current I-2 credential vault found that `updateStatus(connectionId, orgId, status)` could overwrite a concurrently applied tenant/admin `disabled` or disconnect state with `expired` during OAuth failure cleanup. The bounded correction changes the status transition to apply only while the connection is still `active`; regression `ac162b6ce439861c0c2ac9a2650971cd79411ef7` asserts the active-state predicate. Implementation `c3ecd5d72940a2e8af4a53266e368c9d9e3dc8f7`. I-065 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



> ## CURRENT AUTHORITATIVE RECONCILIATION — 2026-10-05
> **This block supersedes stale earlier checkpoint prose in this document.** Repository truth at feature HEAD is **Integrations Framework I-2 — IMPLEMENTED / VERIFICATION PENDING**. The project-control Final State Contract is **RECONCILED / CONSISTENT** at this checkpoint; I-2 remains open because executable Gate-C evidence and final Gate-D review are incomplete. Phase 7 is **PASS — CLOSED** and is not reopened. I-1 remains historical/incomplete where its Gate-C evidence was never independently observed.
>
> Current feature branch: `feature/ai-core-from-doable-source`; current GitHub tip must be read from GitHub at recovery time. Latest bounded I-2 source correction reviewed here: **I-066 — `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98` + regressions `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`** [architect-verified]. The current feature tip must still be read from GitHub at recovery time. ChatGPT is the implementation owner under D-024. **Z.AI is STOPPED; there is no active developer handoff.**
>
> Completed I-2 corrections now include runtime trace redaction, organisation-scoped integration-store access, agent/org ownership enforcement, migration sequencing, database/RLS hardening, AI-visible action-output credential redaction, pre-execution action-input validation, and tenant-scoped OAuth access-token refresh with encrypted persistence, plus an outbound integration egress policy blocking non-public destinations and complete-payload trace redaction before truncation. Redirect following is also fail-closed in the generic runner (I-036). I-047 also closes the direct-connection path's integration-count entitlement bypass. I-048 makes the registry auth contract authoritative for OAuth refresh behavior. Project and agent scope are now modeled separately in the runner (I-037). The remaining bounded blockers are: Activepieces package manifest/lockfile synchronization, executable current-head build/test/typecheck/lint evidence, connector/OAuth smoke, browser verification, real connector/OAuth smoke where credentials are available, current-head browser verification, and final immutable/runtime/secret/governance scans. No I-3, MCP expansion, production promotion, or unrelated feature work is authorized.


> Canonical project-control document for the Clara AI Platform.
> A fresh ChatGPT/architect session reads this file first (after repository agent instructions) to reconstruct exact project state without chat history.
> Snapshot date: **2026-10-06 — Phase 7 CLOSED; Integrations I-2 implemented, verification pending; control-layer reconciliation CONSISTENT at the current checkpoint**. Repository state is authoritative; this file records a dated snapshot and always names the recovery command (see RISKS.md R-1: undated state drifts).
> Evidence classification: every field below is labeled **[developer-reported]** or **[architect-verified]**. See VERIFICATION_STATE.md for the definitions and full evidence register.

## Identity

| Field | Value | Evidence |
|---|---|---|
| Project | Clara AI Platform — multi-tenant RAG + Voice AI SaaS (Next.js 15, TypeScript, PostgreSQL/Supabase, Qdrant, Redis/BullMQ) | [architect-verified] README.md |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) | [architect-verified] |
| Current branch | `feature/ai-core-from-doable-source` | [developer-reported, 2026-10-02] |
| Authoritative source of truth | **GitHub repository state.** Chat/conversational memory is supplementary only (spec principle 6, DECISIONS.md D-001) | [architect-verified] spec |

## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] A bounded I-2 credential-access bypass was corrected in the Activepieces ConnectionsManager. Cross-integration credential lookup now passes through the same tenant/plan/platform/agent authorization boundary as direct integration execution. Implementation `3a17c31cb16bfa54cb79a48a13a757ae16486971`; regression `4f86976b505487906d18e526b6433be360e97a8b`. I-055 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING.

## 2026-10-06 — I-056 execution authorization fail-closed correction

[architect-verified] Source review found that the I-2 execution authorization boundary used the UI-oriented `getOrgPlanLimits()` helper, whose fallback converts plan-resolution/database failures into free-plan limits. This could allow an integration permitted on the free plan to execute without proving the organisation's actual entitlement. The bounded correction now calls `resolveOrgPlanLimits()` directly and denies execution when entitlement resolution fails. Implementation `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`; type correction `9ac86755c94132a86afbde804a7ca3b927e0e83b`; focused regression `220d1a66fe7279bb55296d31d5f9d5c3133b78ef`. I-056 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## Current phase

## 2026-10-06 — I-047 direct-connection limit correction

[architect-verified] Source review found that organisation-level connect could implicitly enable a previously-disabled integration without enforcing max_integrations. Commit 846c8d39add3430a5014c5573b3cc4d5ad86ee37 now enforces the organisation integration-count entitlement when connect would consume a new slot; regression coverage is 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-040 action-context scope correction checkpoint

[architect-verified] Source review found that the prior I-037 credential-scope correction did not propagate the explicit agent scope into the Activepieces action context. The action-context PostgresStore and cross-integration ConnectionsManager were still constructed with projectId. Commits a5680cd51c6d9ca961ab93effd20fb069d0e2bbe and a58edb20d5c95ce0fbd711cc0e23bff0582fc5ed correct this, and test commit 550b751b745d7a8a4a52854edc1cc328d7c891b2 adds focused regression coverage. Gate-C remains MISSING and Gate-D remains IN_PROGRESS; no I-2 PASS is claimed.


## 2026-10-06 — I-040 completion checkpoint

[architect-verified] The bounded scope correction now covers both the Activepieces action context and the Unified Tool Runtime integration-action boundary: explicit agentId is propagated into the store/connections manager and into runAction. Focused regression tests cover both propagation points. Gate-C remains MISSING and Gate-D remains IN_PROGRESS; no I-2 PASS is claimed.


## 2026-10-06 — I-043 owner continuation

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review corrected the AI-visible integration tool boundary: agent integration grants are now bound to the execution tenant through the authoritative `agents.org_id` relationship, and focused regression coverage rejects a cross-tenant agent before `runAction`. The existing I-042 project/agent scope correction remains intact.

- I-043: RESOLVED by architect source review.
- Correction commits: `870ac568d050a8a6f54c347684a1b6e4fe9015ca`, `b5a744cc57135e2e8f1037f7396c56ed57bc3656`, `26f0f5fd00d47641598854e0cbb813ac049b7459`.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.
## 2026-10-06 — I-2 owner continuation: runner correctness correction

[architect-verified] ChatGPT independently reviewed the current I-2 runner source and corrected a bounded ElevenLabs redirect error-message defect at `499feacf01907f82da9578b74cb8789931d10752`. The redirect remains fail-closed; only the action-specific error semantics were corrected. I-2 remains IMPLEMENTED — VERIFICATION PENDING, Gate-C remains MISSING, and Gate-D remains IN_PROGRESS. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.

## 2026-10-06 — I-044 credential-value error-boundary hardening

[architect-verified] Source review found a bounded I-2 observability defect: the runner's final catch boundary only performed pattern-based redaction, so a provider could echo a resolved credential value under a non-sensitive field name and have that value reach XRay, usage logging, or the returned error. Commit `a8a1997f958c37b524451618eb0d3bb4a3746b5f` retains the resolved credential values for the active run and applies value-based redaction before the error is recorded or returned.

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-045 organisation downgrade-unwind correction

[architect-verified] I-045 was identified and corrected within I-2: organisation-level `disable`/`disconnect` operations no longer depend on plan-limit resolution, while `enable`/`connect` remain fail-closed against current plan entitlement. Correction `4c653b18c488661a9000f21f73344ce90d669b1a`; focused regression `289bb2a9dc8d40532479c62980f0ab110a600849`. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-046 AI availability plan-entitlement correction

[architect-verified] I-2 source review found that the AI-visible `integration_availability` tool exposed platform/org/agent-enabled integrations without applying the organisation's current plan allowlist. Commit `48a55826f4c45fe71c891bd68f71075fc363f8fc` now resolves the current plan and filters the availability surface by `allowed_plans`, while `integration_action` remains independently fail-closed. Regression commit: `b3d090a1644d1982e1709d095458db9c593a5d42`.

I-046 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-054 runner execution-authorization correction

[architect-verified] I-054 is RESOLVED. `runAction()` now re-checks platform enablement, current plan entitlement, organisation grant, explicit agent scope, and the authoritative `agents.org_id` relationship before any integration action executes. Focused regression source covers plan downgrade, cross-tenant agent grant, and missing agent scope. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-058 custom integration egress/redirect correction

[architect-verified] Custom ElevenLabs and Supabase integration HTTP paths now use explicit host egress validation and manual redirect handling. I-058 is RESOLVED by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-059 Supabase Management API egress correction

[architect-verified] Source review identified a remaining credential-bearing native fetch in the custom Supabase Management API action outside the I-058 egress/redirect boundary. Commit `c7a2b7f4edb33cc919e2fe6c9a0bec2c981450be` now applies `assertSafeEgressUrl()`, manual redirect handling, and explicit 3xx rejection. I-059 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains source-level I-2 authorization/credential/egress review, followed by executable Gate-C evidence and final Gate-D review. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-060 custom Management credential agent-scope correction

[architect-verified] Source review identified a bounded I-2 credential-scope defect in the custom Supabase Management API action: its secondary `supabase-mgmt` credential lookup omitted the executing `agentId`. Commit `a90254ee5e4a7910fd92291810fe0cdff72c2ee0` now preserves explicit agent scope, with focused regression `040cfafb0d4aad1b9b95de9aafa3d5dfa975bd35`. I-060 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.

## 2026-10-06 — I-068 integration-route source correction

[architect-verified] Bounded I-2 source review found literal \\n escape text embedded between TypeScript statements in the organisation integration POST route and agent integration PATCH route. The escapes were replaced with actual statement newlines in c07b87596ffdc7959a4b507621b3a57d900c6a82. No authorization behavior was changed. I-068 is resolved by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 review only; do not wait for GitHub Actions or Vercel and do not expand to I-3/MCP/production.

## 2026-10-06 — I-070 agent-scoped FLOW store correction

[architect-verified] I-2 source review identified that FLOW store keys omitted agentId, allowing same-user cross-agent state collision inside one organisation. The bounded correction adds explicit agent scope to FLOW keys and focused regression coverage. Implementation f0f476e74b1fbd66ed3e716bdc23e9e6b775b; regression efc652c8096488e3cf8d2ac2422d108c345924ca. I-070 is resolved by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; continue bounded I-2 review only.

## 2026-10-07 — I-076 registry-authoritative action discovery

[architect-verified] Bounded I-2 source review found getIntegrationActions could advertise unreviewed Activepieces package actions through its sparse-match fallback, despite the runner execution boundary rejecting those actions. The fallback now stays within Clara's reviewed registry action set; custom Clara-owned actions remain exposed separately. Implementation 9435c6ce036634fe5f1126fa35c424db0e8582a2; focused regression 55271624623ec65ec1ae892bf8585063d2dc5371. I-076 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-07 — I-077 Supabase credential URL error-boundary hardening

[architect-verified] Bounded I-2 source review found the custom supabase.execute_sql action included credential-derived projectUrl in an error when project-ref parsing failed. The correction now returns a generic invalid-project-URL error. Implementation 6ae5663938c2144f2f880afe0d7ebdcd97ebf54a; focused regression 0f3347d8b679f0ea4110768fdf5f5c33de129d57. I-077 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-07 — I-078 runner early-rejection trace initialization correction

[architect-verified] Bounded I-2 source review found the registry action-allowlist rejection path referenced the normal XRay handle before initialization, causing a temporal-dead-zone ReferenceError instead of the intended structured fail-closed response. Correction ddd38bbf84f274a7f2daa159007a080f964b3046 removes that premature trace call. I-078 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-07 — I-079 AI action readiness user-scope correction

[architect-verified] Continued bounded I-2 source review found that `integration_action` readiness checked for any active organisation/agent connection but omitted the current `userId`. Because the runner already enforces tenant/user/agent credential scope, this was a readiness correctness issue rather than a credential-access bypass: another user's connection could make the AI tool report readiness for the current user, followed by a later runner failure. The readiness query now requires the same user scope and prioritizes the current user's connection.

- Implementation: `9e168851bc2e978f68c0576235e084eba63be4a2`
- Regression: `f2b3dc2ac263d5112dc8d6e7649acfdd76bc735a`
- I-079: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- No I-2 PASS is claimed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — I-080 AI availability regression alignment

[architect-verified] Continued bounded I-2 review found a stale `getOrgPlanLimits` mock reference in the AI availability cross-tenant regression after production had migrated to `resolveOrgPlanLimits`. Correction `3ed83c8ddcde22e05ddfa415bce134e7773fca75` aligns the test with the authoritative resolver; no production behavior changed.

- I-080 is RESOLVED by test-source correction.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- No I-2 PASS is claimed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — I-081 AI availability user-scope correction

[architect-verified] Bounded I-2 review found `integration_availability` could report another user's active connection as connected. Availability now requires user context and applies organisation + agent + user connection scope, preserving organisation-scoped connections.

- Implementation: `f9dc068c0ca6b4067d0cda6d44743d4f91ac82a5`
- Regression: `0e53c6a42fa316ddb776b565b32dd5b03599a69a`
- I-081: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-082 OAuth refresh credential-scope correction

[architect-verified] OAuth refresh now preserves the execution user and agent scope through credential-vault decrypt, expiry status updates, and refreshed-credential persistence. This closes a bounded I-2 scope gap where the initial connection lookup was user/agent scoped but subsequent refresh mutations used only connectionId + organisation.

- I-082 is RESOLVED by source review.
- Corrections: f74d3928ce875e40ebafba473e92da4c90305ca0; 4ea030a1d75e31983605e59026437de4336d5e16; bd238eaa379d51f11c9d867434cd0a77dc5ab1a0.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- No I-2 PASS is claimed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — Owner CI/CD pause control

[architect-verified] Automatic GitHub Actions triggers were disabled in .github/workflows/ci.yml by replacing push/pull_request execution with workflow_dispatch only; the file contains short restoration guidance. Vercel project clara-backend was paused because Git deployment-source controls are unavailable on the current Hobby plan. This is an operational owner control and does not change I-2 application behavior.

I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING; Gate-D remains IN PROGRESS. No CI, Vercel build, or Gate result was awaited.


## 2026-10-07 — I-084 OAuth refresh scope drift correction

[architect-verified] Current branch source was re-audited after I-082 and exposed a partial regression: runner-core passed user/agent scope to ensureTokenFresh, but the helper signature and some vault calls had reverted to unscoped form. The helper now propagates userId/agentId across decrypt, expiry status, and credential persistence. Corrections: bd6a7a58819d8ff9b203a9638c3d806d5e5caa15 and f5bc88e57667d886100f875b81fff9b1e71cd435.

I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING; Gate-D remains IN PROGRESS.


## 2026-10-07 — I-085 OAuth refresh lost-scope fail-closed correction

[architect-verified] Source review found a race boundary where an OAuth refresh could successfully obtain a new provider token but its scoped persistence update could match zero rows after concurrent connection state changes; the runner had no explicit signal and could continue. updateCredentials now returns success/failure from the scoped UPDATE, and ensureTokenFresh aborts when persistence loses the active connection scope. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING; Gate-D remains IN PROGRESS.


## 2026-10-07 — I-086 organisation integration mutation serialization correction

[architect-verified] Continued bounded I-2 source review identified a concurrency gap in the organisation integration connect path: its `FOR UPDATE` lock protected only an existing `organisation_integrations` row, so first-time connects with no existing grant row could race through the `max_integrations` count check. Commit `51c14f65b7dac8812ccae353bc23e9cf07694d8c` now acquires the organisation-level PostgreSQL advisory transaction lock before the connect grant/count read; disable and disconnect acquire the same lock to serialize the complete organisation integration mutation domain.

I-086 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN PROGRESS. No CI, Vercel, Gate-C, or Gate-D result was awaited. No I-2 PASS is claimed.

**Next planned implementation:** continue only the bounded I-2 credential/connection and authorization race review, then remaining custom-action, AI-tool, egress/secret, action-input, and tenant-isolation gaps. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — Gate-C execution readiness

[architect-verified] Gate-C preparation is complete at the repository level: CI remains manual-only and the platform health schedule is disabled. Gate-C is not falsely marked PASS; its sole remaining gap is executable current-head evidence. After that evidence exists, the next planned architect work is Gate-D final review.




## 2026-10-08 — I-6 bounded hardening checkpoint

[architect-verified] Continued I-6 source review identified and corrected two fail-closed bridge boundaries: explicit empty surface allowlists no longer widen to all Clara surfaces, and normalized MCP names now retain an identity-derived suffix to prevent ordinary sanitization collisions within the 64-character tool-name limit.

- Corrections: `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6`, `d4bfbe112863696c99ad7abb81857a9399f079c2`.
- I-6 remains the active implementation capability.
- External CI/Vercel/Gate-C/Gate-D evidence remains deferred by owner instruction.
- **Next implementation:** continue bounded I-6 source-level acceptance review; no MCP transport/server hosting, persistence/OAuth, marketplace, billing, production promotion, or unrelated implementation.


## 2026-10-08 — I-3 action-props hardening checkpoint

[architect-verified] Current-state continuation remains Integrations I-3 — Action Runner, IN PROGRESS. The malformed runtime action-props boundary is corrected at 7aa1ebc8521c377684c711d97710e0614f66b4e3 with focused regression 8ac329d38af49a6c3acba22ac25935fb8b151c3c. I-2 external verification remains deferred; no I-2 PASS is inferred. No I-4/I-5/MCP/production scope is authorized.


## 2026-10-08 — I-3 implementation continuation checkpoint
[architect-verified] The active implementation capability remains Integrations Framework I-3 — Action Runner, IN PROGRESS. External CI/Vercel/Gate-C/Gate-D evidence remains deferred by owner instruction. Latest bounded source corrections in this continuation are redirect egress error-classification preservation (`42527f0a2c83e8b7d3d6baa5fd70c8d1c2dd7d78`, regression `e74b9f6f1e82102474ccb53c56da3931fde3fdd6`) and strict validation fail-closed handling for absent schemas (`d6bdaa4238b9694430a4a484af2eb480f28fa5eb`, regression `d90a314df428bd13d18a6655a81bd498945d549e`). No I-3 closure or external verification is inferred. Next implementation remains deterministic result propagation, strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression coverage. No I-4/I-5, MCP expansion, production promotion, or unrelated implementation is authorized.


### I-6 Follow-up — 2026-10-08
- Removed an unused context-value snapshot from the MCP resolver path after exact execution-context object binding became the authoritative invariant.
- Commit: `9e3ab09931ea10584803f51feb6073c2eafce06f`.
- External CI/Vercel/Gates were not awaited.
- Next: continue bounded I-6 registration/capability-authorization invariant review.


## 2026-10-09 — Integration discovery hardening

[architect-verified] Connected integration discovery now requires user and agent identity and filters candidates by active scoped connection, platform enablement, organisation and agent grants, and organisation plan allowlist before registration. Execution remains in Unified Tool Runtime and the existing runner. Commits: `8aac1c8a5b0e4f61c3f36f2d416c0fc3da6102b5`, `e0a3001e6911fc896df0611e83756c78ecb22da4`, `d722ff3f547a00b90c027b45e479944aa3cf9827`. Chat/realtime dispatch and secure OAuth app configuration remain incomplete. No tests or live provider integrations were run; CI/Vercel/Gates remain deferred.

---

# CURRENT PROJECT STATE — 2026-10-12 — ORGANIZATION-OWNED MCP + PLAN ENTITLEMENTS IMPLEMENTED

- Branch: `feature/ai-core-from-doable-source`.
- The 2026-10-12 owner directive (organization-owned MCP product, platform-admin-configurable plan entitlements, subscription validation, usage enforcement, global governance, agent permissions, chat/realtime runtime integration, security controls, regression tests) is implemented at source level. Full record: `docs/plans/mcp-organization-owned-endpoints.md`.
- Migration `069_mcp_organization_owned_endpoints.sql` is additive and authored; it has NOT been applied to any live database from this environment.
- 91 new focused tests pass locally (`vitest`); the full suite result 1334 passed / 50 failed matches the pre-change branch baseline exactly (stash-diff verified, zero new failures). No CI/Vercel/deployment/live handshake was run or awaited; no runtime PASS is claimed.
- `ENABLE_MCP` remains OFF. Evidence required before enabling: migration applied on the deployed revision, governance + plan entitlements configured via admin UI, controlled live handshake, focused suites green there.
- Exact next action: follow `docs/project-control/NEXT_ACTION.md` (2026-10-12 section); do not wait for external gates.

## FIX-01 type-check follow-up — 2026-10-12
- Owner's post-pull compiler run verified the Stripe ambient declaration fix removed the Stripe missing-member cluster, reducing diagnostics from 44/19 files to 33/15 files.
- FIX-01 committed narrow compatibility changes for the next known diagnostics. These edits are not yet type-checked locally.
- Verification remains pending; do not call this phase PASS. Next action is a fresh local type-check after pulling latest branch. Keep development moving without waiting for CI/Vercel.

## FIX-01 follow-up — 2026-10-12
- Latest owner compiler run found 5 residual errors in 4 files.
- Three targeted corrections are now committed: DayPicker v10 navigation class names, relative imports/mocks in context-builder test, and Redis options/legacy URL handling.
- No post-correction type-check has been supplied. The ws declaration dependency remains outstanding. Do not claim PASS.

## FIX-01 type-check follow-up — 2026-10-12
- Latest owner-provided local type-check output reports two remaining errors after the prior batch: one obsolete DayPicker v10 class key and missing `ws` declarations.
- Calendar class-name correction is committed at `829ae96818a84a39110b65517917d9280c57684b`, source-only pending fresh type-check.
- The remaining package dependency fix is `@types/ws`, installed with npm so the lockfile is generated correctly. No PASS is claimed until the next local compiler output.

## FIX-01 — type-check result — 2026-10-12
- Current owner-provided evidence: `npm run type-check` passes with zero diagnostics after adding official `@types/ws`.
- Environment compatibility risk surfaced during install: local Node v20.20.0 does not satisfy multiple installed package engines; strongest observed minimum is Node >=22.22 (`machina`). Align local, Docker, and deployment runtimes to Node 22.22+ before treating test/runtime behavior as validated.
- npm reports 37 audit vulnerabilities; dependency remediation is a separate reviewed task. No `npm audit fix --force` was run.
- The owner still needs to commit the generated `@types/ws` manifest/lockfile update after reviewing the working tree. No tests/build/runtime/deployment PASS is claimed.


## 2026-10-12 — Subscription entitlement authority audit

- GitHub issue #296 tracks stale legacy provider-list authority and adjacent entitlement fail-open risks.
- Code corrections are on branch `fix/subscription-ai-entitlements-authority`; do not merge or deploy without the normal review.
- Plan entitlements are now the intended authority for runtime provider access; org AI settings' legacy provider lists are compatibility data only.
- Regression tests were added but not executed. Current state is unverified; no PASS.

## 2026-10-12 — OpenAI realtime voice latency diagnostic checkpoint

The voice-latency workstream is being tracked separately from other feature/type-check work and is active on `fix/openai-vad-audio-diagnostics-clean` (PR #295; do not merge without owner authorization). Durable details: `docs/project-control/sessions/SESSION-VOICE-LATENCY-20261012-01.md`.

Owner-provided five-turn benchmark completed after benchmark-only synthetic silent-audio keepalive and bounded finalization wait. Per-turn TTFA was 8273, 6078, 5213, 1447, 1704 ms (median 5213 ms). RAG took 7249, 5186, 4433, 527, 663 ms; STT 1.1–1.6 s, LLM-first 0.59–0.81 s, TTS-first 0.68–0.94 s. These numbers show latency remains far above the aspirational <=500 ms grounded-answer target. Welcome audio and acknowledgements must not be counted as grounded answers.

Privacy-safe RAG timing instrumentation is committed to capture browser elapsed, HTTP status, Server-Timing, and numeric server timing fields without query/context/credentials. **Next evidence required:** run the updated benchmark to `tool-results/openai-rag-stage-timings.json` and inspect server stage timings before changing production RAG. No production latency fix/deployment/pass is claimed. Keep GitHub Actions manual-only and continue without waiting for CI/Vercel.


## DEV-01 — Live Gemini catalogue audit — 2026-10-12
- Current bounded work: replace static availability decisions with live governance catalogue, including environment/seed defaults and embedding dimension safety.
- Commits in this continuation: 865e657901d479e29ce1625b1869edfaa0eb04d5 (release-date parsing), d7d6a144750799ab127b92e84e2546dacb20e59b (live-only embedding fallback), c7321aa2f63b099ffbf7ffdb873cd362e7b5f8a3 and 6bed6c178884df567e8478974d693ed033f49631 (legacy env examples), af5e16ef22bc79249fee95b3d09cc74a10e4edc2 (seed semantics), 1d9de9d29483c3b8781194e6988d0e84a703aad9 (unknown Gemini embedding dimensions fail closed), 4869b25802fae07ff5061c2e970cc4cc4418856a (governance availability views).
- Static Gemini model entries remain pricing/vector compatibility metadata only. No hardcoded chat/embedding/realtime model defaults were found in the current production seed; env-specified IDs are candidates and runtime resolution validates against live rows.
- Verification remains pending: no tests/type-check/build/live provider calls/UI/deployment were run or awaited. No PASS is claimed.


- Follow-up regression source added at src/modules/ai-core/providers/gemini.test.ts for known/fixed dimensions, Matryoshka output dimensions, unknown models and invalid overrides (commit 712eebf8e4295bc987c65db2d1acb371af987972). Not run.


- During the catalogue audit, DEV-01 found duplicated top-level exports and a dangling SQL fragment in registry-db.ts; removed the duplicated tail in commit 8a79e296d24227f7e2caf97724c551d85b8eb4b8. Issue I-098 is recorded and handed to FIX-01 for independent diff/export review and local type-check/focused governance tests. No verification PASS is claimed.


- Removed direct GEMINI_CHAT_MODEL/GEMINI_EMBEDDING_MODEL fallbacks from GeminiProvider so environment IDs cannot bypass governance resolution; added regression source proving this boundary (commits a02e92d47982a3977b82d1d3071e507eefe2feab, ffff0cf29be92740c8709fb4bc389b3522a6e350). Tests not run.

## CURRENT DEV-01 OPTIONAL FEATURES SOURCE STATE — 2026-10-22

Owner-authorized DEV-01 work implements deployment-local disablement of Feature 13 (embeddable widget/demo) and Feature 23 (integrations, MCP, WhatsApp) on `feature/ai-core-from-doable-source`, without deleting source/data. Development defaults ON; production defaults OFF; server-only env keys `CLARA_FEATURE_EMBEDDABLE_WIDGET` / `CLARA_FEATURE_INTEGRATIONS` can override each independently. Central policy/middleware, no-store UI availability, optional navigation and KB/publish/landing/AI-console gating, integration runner and MCP call-time guards are committed (source starts `3a651654`, latest relevant `954a2261`). Existing app/store isolation (`CLARA_ENV`/PG schema/Qdrant/queues) and other features preserved. Documentation updated in `.env.example`, `docs/deployment/environments.md`, Feature 13/23.

**Implementation state: SOURCE_COMMITTED, runtime not verified.** Regression sources authored; no focused Vitest/typecheck/build/real OAuth/WhatsApp/MCP/dev-prod requests, CI/Vercel or production deployment was executed this session. A production source push does not itself change running configuration. DEV-01 session `SESSION-DEV-20261022-FEATURE-FLAGS-01`; OPS handoff `HANDOFF-DEV-20261022-OPS01-FEATURE-FLAGS`. See `NEXT_ACTION.md` for exact tests and deployment boundaries. Do not wait on external gates; continue independent authorized work only.
