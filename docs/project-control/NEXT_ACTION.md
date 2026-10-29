## TOAST CARD EXPANSION + OVERFLOW CORRECTION — 2026-10-29

- Corrected the shared Sonner toast so hover expands the **toast card itself**, not only its title/description text. Compact cards are capped by default; hovered cards grow up to the viewport-safe `min(70vh, 32rem)` height and scroll internally for exceptionally long content.
- Removed the text's fixed hover max-height so the card controls the expansion; retained wrapping for long tokens, reserved close-button space, stable responsive width, and `expand={false}` to avoid expanding the entire stack.
- Commit: `e05f395cd82fd9c110fad75f3067772d5881f753`.
- No tests, type-check, build, CI, Vercel, or Gate was run or awaited.
- Next: continue the active project-control item after this targeted UI correction; do not wait for external verification.

---

## TOAST HOVER-ONLY EXPANSION — 2026-10-29

- Updated `src/components/ui/sonner.tsx` so toast titles and descriptions are compact and clipped by default, then expand vertically only for the toast under the pointer. The expanded content animates its maximum height; neighboring toasts remain compact.
- Explicitly set Sonner `expand={false}` to keep hover from expanding the whole notification stack. Existing responsive width, spacing, close-button placement, and card transitions are preserved.
- Commit: `4bbef64de73017d68e2d1b7ea1e298900d8d41e8`.
- No tests, type-check, build, CI, Vercel, or Gate was run or awaited.
- Next: continue the active project-control item after this targeted UI correction; do not wait for external verification.

---

## PLATFORM HEALTH TOAST READABILITY + DISMISSAL — 2026-10-29

- Updated the shared Sonner toast styling so titles and descriptions render in full without hover; long messages wrap and the card grows vertically while the stack can animate layout changes. Close control is anchored inside the card's upper-right with reserved text space.
- Platform health alerts now remain until the user dismisses them, and dismissals are remembered per incident in browser local storage so 30-second polling does not repeatedly resurface a closed incident. Active incidents remain available from the existing notification-bell panel. A recovered incident clears its dismissal record, so a future recurrence can notify again.
- Commits: `2ada4b8c8ac73d54c174128de1a579e69c7ccd57` (toast layout), `daffff899d5a2625da6becba1d68c5655d5196bf` (remember dismissals), `81757a0d0efd779dca7ed2e6c30ce1eb37f95224` (keep actionable alerts until dismissal).
- No tests, type-check, build, CI, Vercel, or Gate was run or awaited.
- Next implementation remains the active project-control item: source-review MCP discovery singleflight/cancellation and Chat/realtime authorization parity. Do not wait for CI/Vercel and do not claim executable verification.

---

## MCP AUTHORIZATION DENIAL CASES — 2026-10-29

- Extended mocked resolver regression source to cover disabled/unapproved server lookup and current-plan denial. Both paths must return unavailable before any outbound MCP transport request.
- Latest test commit: `cadf110a3c6a12412261d0ce1a950cf159a519c7`.
- No tests, type-check, build, CI, Vercel, Gate, or live MCP handshake was run or awaited.
- Next: finish source-only review of singleflight/cancellation and Chat/realtime parity, then choose the next authorized implementation plan. MCP remains disabled pending controlled verification.

---

## MCP AUTHORIZATION TEST FIXTURE UPDATE — 2026-10-29

- Resolver regression fixtures now use a syntactically allowed HTTPS hostname while all network calls remain mocked; no live DNS or provider request is needed for these source cases.
- Latest regression commits: `f7a27399fd5ae487a3dbda34cb4d76e14773eebc`, `0368a4e4bb21b4940cc8f94794d844d52b64e66f`, `80b2ea48f744bce2a347fb6a210c88c488301a48`.
- No tests or other executable verification were run.
- Next: finish source-level review of discovery singleflight and Chat/realtime authorization parity, then record the bounded MCP implementation status without asserting unobserved verification.

---

## MCP RESOLVER AUTHORIZATION FRESHNESS — SOURCE REGRESSIONS — 2026-10-29

- Added mocked resolver regressions proving a revoked organization/agent-grant lookup fails before any invocation transport call, and a changed remote input schema is rejected before the side-effecting `tools/call` RPC.
- Test file: `src/modules/ai-platform-core/mcp-streamable-http-resolver.authorization.test.ts`.
- Commits: `f7a27399fd5ae487a3dbda34cb4d76e14773eebc`, `0368a4e4bb21b4940cc8f94794d844d52b64e66f`.
- Together with the transport regressions below, source coverage now addresses grant revocation, stale schema, DNS revalidation, mixed public/private DNS, pinned lookup, redirects, request/response size limits, active timeout and cancellation.
- No tests/type-check/build/CI/Vercel/Gate/live MCP handshake was run or awaited; authored test cases are not execution evidence.
- **Next implementation:** review singleflight behavior under parallel discovery and cancellation; ensure one cancelled waiter cannot poison an unrelated in-flight request and authorization is rechecked before cache reuse. Then review Chat/realtime parity and record remaining source-level gaps without claiming production readiness.
- Keep MCP disabled pending controlled verification/handshake. Do not wait for CI/Vercel.

---

## MCP STREAMABLE HTTP — TRANSPORT SECURITY REGRESSION COVERAGE — 2026-10-29

- Added deterministic injection seams for DNS resolution and HTTPS requests in `mcpHttpRequest`; production defaults remain system DNS and Node HTTPS.
- Added source regressions for mixed public/private DNS rejection before socket creation, DNS revalidation on each request (public answer then private answer), oversized request rejection, pre-cancelled requests, redirects, active request timeout, cancellation after request start, response-size enforcement, and socket lookup pinning to the checked IP.
- Commits: `b7caf9615652fff7e928040a30753f21ac831dd0`, `45b7207d66553b668d1cddf4019f133c88d7e219`, `7f1ca90b1298490142a30229336785ae1e6d2e80`, `f6f262578ff348faf4844e32b5ef75853820fcc2`, `fddf1d33d3230e254ae514d5dcdcfead30ac95a4`, `aa2e79d5c450b5714b0ca1c9c0c50ed45a49dcb2`.
- No tests, type-check, build, CI, Vercel, Gate, live DNS, or MCP handshake was run or awaited; regression source is not executable PASS evidence.
- **Next implementation:** add deterministic resolver/runtime regressions for revoked organization/agent grants and stale tool schemas; review discovery singleflight cancellation/authorization behavior. Keep MCP disabled pending owner-authorized focused verification and controlled live handshake.
- **STOP:** no production readiness claim or unrelated scope expansion.

---

## MCP STREAMABLE HTTP — DETERMINISTIC TRANSPORT REGRESSION SEAM — 2026-10-29

- Continued the active MCP follow-up from `sessions/SESSION-DEV-20261011-01.md`; this is the authorized follow-on to the I-6 bridge, not a claim that CI or runtime verification passed.
- Added injectable DNS-resolution and HTTPS-request dependencies to `mcpHttpRequest`, preserving production defaults while enabling deterministic transport-boundary regressions.
- Added `src/modules/ai-platform-core/mcp-http-transport.test.ts` coverage for mixed public/private DNS answers rejected before socket creation, per-request DNS revalidation (simulated public-to-private change), request-size rejection before network activity, and pre-cancelled requests.
- Commits: `b7caf9615652fff7e928040a30753f21ac831dd0` (transport seams), `45b7207d66553b668d1cddf4019f133c88d7e219` (regressions), `7f1ca90b1298490142a30229336785ae1e6d2e80` (unused type import cleanup).
- No tests, type-check, build, CI, Vercel, Gate, live DNS, or MCP handshake was run or awaited.
- **Next implementation:** extend deterministic transport regressions to redirect refusal, timeout/cancellation during an active request, response-size enforcement, and pinned-address lookup; then add mocked resolver/runtime authorization regressions for revoked grants and stale schemas. Keep MCP disabled until owner-authorized focused verification/live handshake; do not wait for CI/Vercel.
- **STOP:** do not claim MCP production readiness or widen into unrelated work.

---

## TOAST NOTIFICATION PLACEMENT + HOVER EXPANSION — 2026-10-27

- Corrected the shared Sonner host from bottom-center to **bottom-right**.
- Removed the forced hover width growth that let an expanded toast overlap the stack and obscure neighboring notifications. Toast cards keep a stable responsive width; hover reveals the full title/message text and elevates the hovered card without widening the whole notification stack.
- Removed the always-expanded stack setting so notifications return to their compact stacked presentation when not being interacted with.
- Commits: `8be85cb88cf55caece569fa799fdfdc52b4f267d` (stable toast width / hover behavior), `4451c236d8cedeac2df5391dc2d02212a0e1bccd` (bottom-right host position).
- No tests, build, CI, Vercel, or Gate was run or awaited.
- **Next:** continue the next authorized implementation item in this file; if the user reports the stack still visually overlaps after browser review, refine only the Sonner stack layout/hover transitions. No verification pass is claimed.

---

## LIVE MODEL CATALOGUE — BOUNDED SOURCE AUDIT COMPLETE — 2026-10-16

- Source-reviewed the sync coordinator after the provider-level pagination/schema fixes. Each provider runs in an isolated task; discovery exceptions are recorded as provider-specific unhealthy incidents, and one provider's failure does not prevent the other provider tasks from running. Keyless providers do not generate a false healthy vendor-contact claim.
- OpenAI and Gemini malformed pages, pagination cursor/limit failures, ElevenLabs malformed/repeated/missing-cursor/limit failures, and Sarvam failed-versus-successful-empty discovery now fail closed before unsafe stale-row reconciliation. Focused regression source exists for these boundaries.
- No further coordinator defect was identified in this bounded source review.
- Latest source commits: `b1b020be3a4ccfe27d9ac5fda1e9ed83b3f48d3c`, `ae7a050e278f5a2bec4f882ff60c25e65a840cb6`, `fbd595f16920dae522490525b335bd7c9e678284`, `23eae79dc676768e7dc3fd3320a62dd499cf1042`; prior provider-boundary commits are recorded immediately below in this file.
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No executable PASS is claimed.
- **Disposition:** this focused live-catalogue source audit is complete. The wider live-model-catalogue workstream remains open for the next authorized catalogue/runtime task recorded in this file. This is not project-wide phase closure and does not authorize unrelated scope.

---

## LIVE MODEL CATALOGUE — MALFORMED RESPONSE + PAGINATION BOUNDARIES — 2026-10-16

- Extended fail-closed page-shape validation to OpenAI and Gemini. OpenAI pages must contain a model array, a boolean `has_more`, and non-empty model IDs. Gemini pages must contain a models array and a correctly typed optional page token; token cycles are detected across the entire discovery run.
- Extended ElevenLabs voice page validation: `voices` must be an array, `has_more` must be boolean, and a page claiming more results must provide a non-empty next-page token. Invalid or incomplete responses abort before catalogue upsert/reconciliation.
- Added focused regression source for malformed HTTP-200 OpenAI/Gemini responses and missing ElevenLabs continuation cursors, in addition to pagination limit/repetition and Sarvam discovery-failure cases.
- Commits: `b1b020be3a4ccfe27d9ac5fda1e9ed83b3f48d3c` (ElevenLabs validation), `ae7a050e278f5a2bec4f882ff60c25e65a840cb6` (OpenAI/Gemini validation), `fbd595f16920dae522490525b335bd7c9e678284` (ElevenLabs regression), `23eae79dc676768e7dc3fd3320a62dd499cf1042` (OpenAI/Gemini regressions).
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No executable PASS is claimed.
- **Next implementation:** finish the bounded cross-provider catalogue audit by reviewing the sync coordinator's incident/status semantics and ensuring a partially successful provider sync cannot be reported healthy. Then record whether the authorized catalogue source audit is complete; do not infer runtime verification or project-wide phase closure.

---

## LIVE MODEL CATALOGUE — SARVAM DISCOVERY FAILURE BOUNDARY — 2026-10-16

- Sarvam chat discovery now treats the first successful endpoint response as authoritative even when it contains zero rows; it only falls back from `/v2/models` to `/v1/models` when the preferred endpoint errors.
- When both endpoints fail, the sync keeps its curated baseline but does not disable last-known vendor-discovered chat rows, and the provider is reported degraded rather than healthy.
- Added regression source for both failed discovery preserving prior rows and successful-empty discovery reconciling stale chat rows.
- Commits: `d9aca70e90708fbf9ce9dfb431d0877143215864` (runtime), `e478b0818586b4502e97fd82bb119631514e54e1` (regressions).
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No executable PASS is claimed.
- **Next implementation:** continue the existing catalogue/runtime review by auditing ElevenLabs voice pagination response-shape validation and provider reconciliation ordering. Preserve last-known rows whenever the vendor response is malformed or incomplete.

---

## LIVE MODEL CATALOGUE — OPENAI + ELEVENLABS PAGINATION FAIL-CLOSED — 2026-10-16

- Continued the authorized catalogue/runtime review beyond Gemini: OpenAI model discovery now follows cursor pagination and refuses missing/repeated cursors or a still-present page at the 20-page bound before any upsert/stale-row reconciliation.
- ElevenLabs voice discovery now refuses repeated cursors or a still-present page at the 100-page bound before writing TTS/STS/voice rows or reconciling stale rows.
- Added focused regression source asserting partial OpenAI and ElevenLabs discovery leaves existing provider rows untouched and emits the provider-degraded incident. Test module loading was made fresh per case to avoid the module-level five-minute sync TTL coupling cases.
- Commits: `85566ededf49b752d7cf9a04488ab43c51eb6374` (ElevenLabs guard), `2521a9d098a02f2a1b12e018253603f8beed672f` (OpenAI guard), `dc3e3a1cd3e87326725e740a4455c4240f3c8fc9` (ElevenLabs regressions), `f8a43c010f96e2027e1ae32efcfef8a427a08013` (OpenAI regressions + fresh module setup).
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No executable PASS is claimed.
- **Next implementation:** continue the already-authorized cross-provider catalogue sync/reconciliation boundary review, prioritizing Sarvam's vendor-discovery fallback/reconciliation semantics. Keep provider credentials and runtime model availability fail-closed; do not expand into unrelated product scope.

---

## GEMINI LIVE MODEL CATALOGUE — DISCOVERY/RECONCILIATION AUDIT SOURCE WORK COMPLETE — 2026-10-16

- Added a hard fail-closed pagination boundary to Gemini discovery: a repeated page token or a still-present next-page token at the 20-page limit throws before any Gemini upsert or stale-row reconciliation. Partial discovery can no longer be mistaken for a complete catalogue.
- Added `src/modules/ai-governance/core/live-catalog.test.ts` regression source covering static price/context metadata and embedding dimension enrichment on genuinely discovered rows, failed discovery preserving last-known rows, successful empty discovery disabling stale rows, and pagination-limit failure leaving existing rows untouched.
- Implementation commit: `e70860232a726a849c89f191135be0d360a99ece`.
- Regression source commit: `51b0162c5dcedc054dccbd09e26ffafe234f4964`.
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No executable PASS is claimed.
- Source audit items supplied in the current action are addressed. The broader live-catalogue workstream remains open only for any further scope already recorded elsewhere in this file; do not infer project-wide phase closure from this focused audit.

---

## KB INGEST EMBEDDING — FIX CLOBBERED BY FORCE-PUSH + NO-OP DEPLOY — RECOVERED — 2026-10-16

- Symptom recurrence explained: the owner redeploy ("Already up to date." + ALL Docker layers cached → containers not recreated) ran BEFORE the fix landed on GitHub, and the fix commit c40d266c was subsequently force-pushed off the branch by a stale-checkout push (owner's a9e5b8e3 export-qdrant + the stale-default/ai-catalog session → head 977489ef). The running image was 6cbece5a the whole time — the probe output WITHOUT BATCH/QDRANT stages and the hard-fail "1 vectors for 20 inputs" signature are pre-fix behavior, NOT a failure of the fix.
- Recovery: c40d266c rebased onto 977489ef as bfc7b816 (their resolve.ts catalogue filtering and probe `embedding.values` parsing preserved; GEMINI_EMBEDDING_MODEL env override restored; no other session's work discarded). Merged-branch verification: 15/15 targeted (relay integration 6, embed batches 2, ingest pipeline 2, resolve-embedding-default 5) + ai-core sweep 90/90.
- The probe now prints `probe build: v3 — stages: endpoint egress · batch-contract · qdrant` — any probe output WITHOUT that line is a pre-fix image and says nothing about the fix.
- Branch rule recorded (EVT-FIX-20261016-01, AGENT_MEMORY.md): NEVER force-push feature/ai-core-from-doable-source; always fetch + rebase before pushing.
- **Owner deploy gate — all three must hold before judging the fix:** (1) `git log --oneline -2` shows the embedBatch fix commit (bfc7b816) and/or the probe-marker commit on top; (2) the Docker build shows `COPY src ./src` NOT cached and the worker/backend containers "Started" (not "Running"); (3) `docker compose exec clara-worker node scripts/probe-embedding-egress.mjs` prints the v3 build marker plus the BATCH(3)/BATCH(20) and Qdrant stages. Then Retry BOTH documents (PoliciesEn001; SDAIA NDMO — its "[vector-store] getCollection failed" needs the QDRANT stage verdict from inside the worker). Expect a one-time `[gemini] … degrading to sequential single-text embeds` log line, then batches 1/15 → 15/15; with this host's ~1-5 s per embed, 295 chunks ≈ 5-25 minutes — do not interrupt the run.
- OPS-01 (not blockers for ingest): OpenAI key invalid (HTTP 401, sk-proj-…B6YA — replace or disable the OpenAI provider); first-hop DNS resolution ~4 s on this host.

---

## GEMINI LIVE MODEL CATALOGUE — FILTERING + STALE DEFAULT REGRESSIONS — 2026-10-16

- Runtime source now explicitly filters vendor-live rows by expected provider, capability, enabled state, catalogue source, and kind before model selection. This guards against malformed/mis-scoped rows even if a registry adapter returns a mixed result set.
- Regression source now covers bootstrap-only discovery with a stale configured embedding default, discovery returning no rows, degraded-incident reporting, a valid live embedding row among wrong-provider/wrong-capability/wrong-kind/disabled/bootstrap rows, and successful live default selection.
- Commits: `7edb8ef23bf56a2cb4708b6df038e6e3b29f94c8` (runtime filtering), `3e657cd364ba557e899d4455a1d778bcff2b1116` (regression source).
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No PASS claimed.
- **Next implementation:** finish static pricing/vector-dimension enrichment assertions against discovered rows, then review Gemini sync pagination/upsert/reconciliation failures and add targeted regressions for failed discovery preserving last-known rows and successful empty discovery disabling stale rows. Update project-control only when those audit items are addressed.

---

## GEMINI LIVE MODEL CATALOGUE — STALE EMBEDDING DEFAULT FAIL-CLOSED — 2026-10-16

- Source correction: `src/modules/ai-core/resolve.ts` no longer re-injects a configured Gemini/OpenAI embedding default from static metadata when it is absent from the enabled vendor-live governance rows. Static model metadata is for pricing/dimensions only; it cannot establish current availability.
- A stale or undiscoverable configured embedding default now emits a degraded runtime incident and is not selected. Effective embedding choices remain restricted to enabled `vendor_live` rows, avoiding silent model substitution and unadvertised-model use.
- Commit: `8b1d64d2bb06764342205040cf00918c864abebb`.
- No tests, type-check, build, live vendor API, CI, Vercel, or Gate was run or awaited. No PASS claimed.
- **Next implementation:** continue the Gemini catalogue audit by adding/finishing focused regression coverage for provider/capability/kind filtering, stale default + failed discovery behavior, and pricing/vector-dimension metadata remaining enrichment-only; review the live sync's failure/reconciliation boundaries before marking the audit complete.

---

## KB INGEST EMBEDDING — BATCH-CONTRACT DEGRADATION FIX — 2026-10-16

Production evidence round (owner curls + rebuilt 6cbece5a stack): the connect-timeout storm is FIXED (egress probe round-trips Gemini in ~600ms, single-connection), but ingest now fails deterministically with a NEW signature: "Embedding failed (gemini/gemini-embedding-2-preview @ generativelanguage.googleapis.com): Embedding provider returned 1 vectors for 20 inputs" — on BOTH the worker container and the backend in-process poller, every retry.

Root cause (verified by wire-level capture of both @google/genai 1.43.0 AND the package-lock-pinned 2.28.0 against a local relay): the SDK serialises `contents: string[]` into a fully documented, well-formed `POST {model}:batchEmbedContents` carrying one EmbedContentRequest per text (per-request model/taskType/outputDimensionality), and parses the response `embeddings[]` verbatim — so neither the transport, nor the request shape, nor SDK version drift (sandbox node_modules 1.43.0 vs Docker 2.28.0) explains the failure. The live Google endpoint itself answers HTTP 200 with ONE embedding for a 20-request batch while a 1-request batch (platform embedding-default test, 1536-dim) and the singular `:embedContent` probe round-trip fine — a model-side multi-request batch-contract quirk of gemini-embedding-2-preview. The platform's embedBatch hard-failed on the count mismatch and aborted the whole document.

Fix (gemini.ts embedBatch): a count mismatch is no longer fatal — the partial response is DISCARDED (which texts the returned vectors map to is unknowable), the model is recorded in a module-level broken-batch-contract set, and every text is re-embedded as a SEQUENTIAL single request — the exact shape every verified-working path already uses. Degradation is remembered per model for the process lifetime (a restart re-probes batching); the documented size-cap halving split is unchanged; usage metering aggregates per call; singles now fail loudly on empty vectors.

Probe parity (scripts/probe-embedding-egress.mjs): new BATCH stage live-tests the one-embedding-per-request contract (3-text and 20-text batches) against the real key inside the container, and a new Qdrant stage checks QDRANT_URL (/readyz + /collections, kb_* listing) — the second production document failed with "[vector-store] getCollection failed: fetch failed", which the Qdrant stage now pinpoints in one command.

Verification: targeted suites 10/10 pass in sandbox (gemini.relay.integration 6 incl. the new count-mismatch degradation regression with order/alignment + remembered-degradation + maxInFlight=1 assertions; vector-store-kb.embed 2; ingest-pipeline.local 2); ai-core sweep 91/91. Smoke-tested the extended probe end to end against a local mock reproducing the exact production quirk (BATCH stages report "CONTRACT BROKEN — 1 embedding(s) for 20 requests"; Qdrant stages list kb_* collections). NOT yet deployed: owner must pull + rebuild + retry both failed documents; run `docker compose exec clara-worker node scripts/probe-embedding-egress.mjs` to confirm the BATCH stage verdict on the live key.

---

## SONNER + ORGANISATION NOTIFICATIONS — 2026-10-16

- Updated `src/components/ui/sonner.tsx`: each hovered toast smoothly grows within viewport bounds; non-hovered titles/descriptions remain one-line clamped. Long content wraps safely in the expanded toast.
- Added `src/components/admin/OrganizationNotificationCenter.tsx`, wired into the org topbar. It surfaces org onboarding/payment/email-verification status and active platform announcements in a bell dropdown with active-count badge, links, and dismiss controls where allowed.
- Updated `src/components/admin/OrganizationStatusBanner.tsx`: onboarding/status and announcements are surfaced through Sonner; announcements respect their `dismissible` setting and can be dismissed persistently per organization; status banner can be closed for the current session.
- Commits: `8476e1003f6727ef5d7294642f5553c8206a146a` (Sonner hover sizing), `3957bdd84000b6c5cd86ff6f3715981c729ec7f1` (org status/announcement toasts and dismiss), `2f4d8bbc69c269b313cbb76527d07bff8cf0d34b` (org notification center), `3d5453afdc514479a6d1ac836381361ed03195b9` (topbar integration), `b37fd82a47c1c9f1daad2184b973dfe5a75e339d` (avoid duplicate toasts).
- No tests, browser checks, type-check, build, CI, Vercel, or Gate was run or awaited. Visual/runtime behavior is not verified; no PASS claimed.
- **Next implementation:** resume the previously authorized live Gemini model-catalogue audit: selectable defaults must come from live governance rows filtered by provider, capability, and kind; static price/dimension data stays metadata only; stale defaults fail closed when discovery fails; add focused regression coverage for filters, stale defaults, discovery failures, pricing, and dimensions.

---

## SONNER TOAST UX — RESPONSIVE BOTTOM STACK — 2026-10-16

- Global Sonner notifications now anchor at the bottom-center on desktop and mobile, show up to five stacked notifications, and expand the stack by default so active notifications remain visible.
- Toast cards use viewport-bounded widths (narrow phone-safe sizing, wider desktop cap), safe word breaking for long provider/API errors, and existing per-toast hover expansion.
- Commits: `35be473c9a744a36c13d3a88a24688765ac62c40` (global bottom placement/stack), `2aea322552891bb1313e39902dfecf2aba2ae52c` (responsive toast sizing).
- No browser test, build, CI, Vercel, or Gate was run or awaited. Responsive appearance remains unverified.
- **Next implementation:** continue the authorized live Gemini model-catalogue audit. Enabled live governance rows must be filtered by provider, capability, and kind for selectable defaults; static price/dimension data remains metadata only; stale defaults fail closed when discovery fails; add regression coverage for filters, stale defaults, discovery failures, pricing, and dimensions.

---

## SONNER TOAST UX — 2026-10-16

- Toast titles and descriptions now stay compact to one line by default, wrap safely for long provider/API errors, and expand when the user hovers the specific toast. Toast width is constrained to the viewport and the hovered toast is raised above adjacent notifications.
- Commits: `146bf14e09c3b64879908b72d1fcda2a8e2ce221` (compact toast layout and hover behavior), `f3fd7ad5c925c5075b6b03a9795f59dc31165660` (title clamping).
- No browser test, build, CI, Vercel, or Gate was run or awaited. Visual behavior is implementation-only, not verified.
- **Next implementation remains:** continue the authorized live Gemini model-catalogue audit. Enabled live governance rows must be filtered by provider, capability, and kind for selectable defaults; static price/dimension data remains metadata only; stale defaults fail closed when discovery fails; add regression coverage for filters, stale defaults, discovery failures, pricing, and dimensions.

---

# EMBEDDING ROOT CAUSE CLOSED — PARALLEL-CONNECT FAN-OUT — 2026-10-16

- Owner evidence that REFINED the diagnosis: on the SAME production host, `POST /api/platform/ai/embedding-default/test` succeeded (gemini / gemini-embedding-2-preview / 1536 dims / **907 ms**) while the retried document still died with `Connect Timeout Error (generativelanguage.googleapis.com:443, timeout: 20000ms)` 45 s later. The host CAN reach Google — "network-level block" was wrong. The retry timeline (19:51:48 processing → 19:52:33 failed ≈ 2 × 20 s) matched exactly two connect attempts (initial + EMBED_UNREACHABLE_RETRIES=1).
- ACTUAL root cause: `GeminiProvider.embedBatch` fired `texts.map(embedContent)` under `Promise.all` — **20 simultaneous TCP connections** to the vendor host per batch (EMBED_BATCH_SIZE=20). The deployment's network drops that connection burst (SYN-rate/DPI-style behaviour) while single connections sail through — which is precisely why the single-call platform test succeeded at ~900 ms and every ingest batch timed out, and why the unrestricted sandbox could never reproduce it. Both containers share the same .env and networks (compose topology verified), so the ONLY differentiator was the connection pattern. The OpenAI provider never had this bug (its embedBatch passes `input: texts` as ONE request).
- Fix (code, not config): `embedBatch` now passes `contents: texts` in a single `ai.models.embedContent` call — the @google/genai SDK serializes it to ONE `POST {model}:batchEmbedContents` request (per-request taskType + outputDimensionality, embeddings[] in input order; wire serialization verified in the SDK source and pinned by tests). A 315-chunk document went from ~320 vendor connections to 16 sequential single connections with 300 ms spacing — the connection profile of the call that already works. Defensive fallback: 4xx size-cap responses split the batch in HALF SEQUENTIALLY (never re-fanning-out).
- Local tests (all real code, zero mocks of the SDK): gemini relay integration suite extended to 5 — single-request batch contract, order preservation across requests, **socket-level assertion: 20-chunk batch = exactly ONE TCP connection**, sequential split on simulated size cap, dead-relay host attribution. NEW `vector-store-kb.embed.test.ts` — the production path (`embedBatches` → provider → HTTP): 45 chunks = 3 single-request batches over ONE connection, one EMBEDDING usage event per batch, fail-fast error names provider + actual host. NEW `ingest-pipeline.local.test.ts` — FULLY local end-to-end: generated multi-page PDF → real `parseDocumentFromBuffer` (19.8k chars) → real `chunkText` (26+ chunks) → `embedBatches` over the local relay; plus failure isolation: extraction+chunking complete and are asserted healthy even when the embedding endpoint is dead (mirrors production's chunkCount 295/315-on-failed-docs evidence).
- Verification: ai-core + admin-core + knowledge-bases suites green (133/133); full-suite failures are pre-existing on the branch (verified by stash-and-rerun: identical 4-file/8-test failure set without these changes); tsc 158 errors before AND after (zero new).
- **Owner action after pull + rebuild (`docker compose up -d --build`):** just press Retry on both documents — no relay/proxy/env change needed. If embedding still fails, run `docker compose exec clara-worker node scripts/probe-embedding-egress.mjs` (the error hint now points at it) — but with single connections the 907 ms test result says ingest will match it.

---

# EMBEDDING EGRESS ROOT-CAUSE TOOLING + DEV/PROD ISOLATION ON ONE STACK — 2026-10-15

- Owner-confirmed state after 941c6305: both PDFs now show `Failed` with the full actionable error — `Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443, timeout: 20000ms) — this server cannot reach generativelanguage.googleapis.com:443`. Extraction works (the worker parses 185k chars into ~295 chunks); ONLY the embedding outbound call fails. Root cause is network-level: the deployment host's route to Google's Gemini endpoint is blocked (verified from a clean network the same code path reaches the endpoint in ~60ms and gets HTTP 403 auth-gated, i.e. transport OK).
- Extraction evidence fix: failed documents now persist their extracted chunk count on the failure write, so the KB page shows "Total Chunks 295" (extraction proven) instead of a misleading 0 while embedding is down.
- Operator probe (NEW `scripts/probe-embedding-egress.mjs`, node builtins only, shipped in BOTH backend and worker images): staged DNS -> TCP -> TLS -> HTTP -> real embedding round-trip per configured endpoint (Gemini relay/direct, OpenAI, TEI), prints the exact remediation for the failing layer. Run: `docker compose exec clara-backend node scripts/probe-embedding-egress.mjs`.
- Verified remediation paths (all pre-existing platform mechanisms, now tested end-to-end): GEMINI_BASE_URL relay — NEW integration test runs the REAL @google/genai SDK against a local relay (proves the batchEmbedContents request contract: model path, x-goog-api-key, taskType, outputDimensionality; and that a dead relay is attributed to the RELAY host by the egress error classifier); HTTPS_PROXY egress routing (already installed in both processes); self-hosted TEI multilingual embeddings (fully offline).
- Error-message fix: `describeProvider` in vector-store-kb now reports the GEMINI_BASE_URL relay host when configured (previously always claimed generativelanguage.googleapis.com even when traffic was routed elsewhere); `describeNetworkError` now extracts hosts from `connect ECONNREFUSED/EHOSTUNREACH/ETIMEDOUT host:port` causes (local relays were attributed to no host).
- Environment scoping (owner-requested: same servers, dev + prod, driven by env vars): NEW `src/lib/env-scope.ts` — `CLARA_ENV=development` isolates every store with production defaults byte-identical: Postgres schema `clara_dev` via pool `search_path` options (migrations CREATE SCHEMA on first boot, per-schema advisory lock + schema_migrations); Qdrant new-collection prefix `dev_`; Redis logical db via `REDIS_URL` path (or `REDIS_DB`); BullMQ key prefix `dev_` (cluster-safe fallback, production never prefixed); RabbitMQ vhost via `RABBITMQ_VHOST` in the compose bridge URL. Eight older migrations were unqualified (`public.` -> search_path-resolved) so fresh env schemas build; already-applied deployments are unaffected. Full design doc: `docs/deployment/environments.md`; knobs documented in `.env.example`.
- Verification: +24 tests across 6 new/extended suites (env-scope 17, redis scoping 9, pg pool scope 3, gemini relay integration 3, ingest extraction evidence 2 + updated resilience expectations, egress host-classification); knowledge-bases + lib + queue + ai-core + admin-core suites all green (354/354); tsc net -2 vs baseline (zero new errors); probe script executed live from the sandbox (DNS/TCP/HTTP stages pass, correct verdict output).
- **Next implementation:** operator runs the probe inside their containers and picks one route (relay / proxy / TEI / fixed OpenAI key), then retries the two documents from the KB page — they should reach `ready`.

---

# INGEST PIPELINE RESILIENCE — DOCUMENTS STUCK PENDING / DISAPPEARING LIST — 2026-10-15

- Owner-reported symptoms (live Docker logs): uploaded PDFs show "Processing"; after closing and reopening the app the KB page lists NO documents; uploading a new file makes the old documents reappear, stuck in `pending` forever with the background worker never parsing/vectorizing them.
- Root cause 1 — orphaned queue state: when an ingest job fails (embedding provider unreachable) during a DB pool blip, the failure-status writes (`documents.status='failed'`, `ingest_jobs` terminal state) could be lost, leaving the job `running` or `pending` with `attempts >= max_attempts`. `claimNextPendingJob` can never claim such jobs, `resetStaleIngestJobs` blindly reset them to `pending` (still unclaimable), and `failOrphanedProcessingDocuments` counted ANY pending job as "alive" and only rescued `processing` docs — so documents sat in `pending` forever.
- Root cause 2 — the list fetch failure was invisible: `useDocuments` swallowed list-API errors (the 5s pool connect timeout failed the request under load); the poller only re-fetched while pending docs existed, so a failed initial load left an empty table with no error and no retry until the next manual action (upload) — exactly the "disappeared, reappear when I upload" report.
- Root cause 3 — the load storm itself: with an unreachable embedding host, each doomed document ground every batch through 4 × 20s connect timeouts (~20+ minutes per attempt), which is what exhausted the DB pool and timed out unrelated requests.
- Fixes: `resetStaleIngestJobs` is attempts-aware (exhausted stale running jobs → terminal `failed`); NEW `finalizeUnclaimableIngestJobs()` maintenance pass terminal-fails dead pending jobs and fails their still-pending documents (runs on every poller cycle — heals already-stuck documents with zero user action after pull+rebuild); `failOrphanedProcessingDocuments` now covers `pending` docs and only counts claimable jobs as alive; `processClaimedJob` retries its failure-status writes; the reprocess endpoint creates a fresh job when the pending one is attempts-exhausted (Retry button no-ops fixed); embedding fail-fast (`EMBED_UNREACHABLE_RETRIES`, default 1) aborts remaining batches on connect-level failures; `PG_CONNECT_TIMEOUT_MS` (default 10s) rides out load spikes; `useDocuments` keeps polling after a failed load and the KB page shows a "Couldn't load the document list — your documents are safe" banner with a Retry-now button.
- Verification: 12 new tests (ingest-recovery 5, ingest-worker-resilience 3, vector-store-kb fail-fast 4) plus the full knowledge-bases/lib suites pass (41/41); type-check shows zero errors in changed files; full-suite failing-file list matches the documented pre-existing baseline (18 files, all in unrelated modules).
- Operator env follow-ups unchanged: give the embedding provider a reachable route (fix the OpenAI key, or HTTPS_PROXY / GEMINI_BASE_URL for Gemini) — documents then Retry to `ready` from the UI.
- **Next implementation:** continue the authorized live model-catalogue audit in this branch: replace remaining selectable static Gemini model lists/defaults with live governance rows and capability filters, keeping static metadata only for pricing/vector compatibility.

---

# OWNER-REQUESTED UI CHANGE — LIVE NAVBAR NOTIFICATION CENTER — 2026-10-15

- Replaced the large inline platform-health alert banner with a notification bell in the global top-right navbar for platform admins, including an active-issue count badge and a dropdown listing each issue with its priority and direct action link.
- Health notifications now refresh automatically every 30 seconds and on window focus without reloading the page. New incidents and escalations trigger Sonner notifications; resolved incidents trigger a short informational toast.
- Sonner priority behavior: warnings auto-dismiss after 8 seconds; critical incidents are presented as **Risk** and use an infinite duration with a close button, so they remain until explicitly closed or the incident is resolved. The notification center itself continues listing active incidents until the server reports recovery.
- Removed the old “Remind tomorrow” / “Don’t show again” banner controls so a critical issue cannot be hidden persistently by local suppression.
- Source commits: `550449f4bde71d04977ffd26af5faad0659e2167` (notification center), `cfbf75807a6c386e2c17fc8edf5d6bb8a83f69e9` (navbar placement), `872e1fd137f8485e748050fba23f18fab89827f5` (remove inline banner), `a1f32c17ee31a268e7407ed23cd6f9d3f5e392d7` (surface current risks on initial load).
- No tests, type-check, build, CI, Vercel, Gate, or live-browser verification was run or awaited. No PASS is claimed.
- **Next implementation:** continue the authorized live model-catalogue audit in this branch: replace remaining selectable static Gemini model lists/defaults with live governance rows and capability filters, keeping static metadata only for pricing/vector compatibility.

---

## DEV-01 CONTINUATION — EMBEDDING PROVIDER POLICY REGRESSION SOURCE — 2026-10-14

- Extracted the embedding-only provider choice into `src/modules/ai-core/embedding-provider-selection.ts`; `resolve.ts` now delegates to this pure policy helper.
- Added focused regression source for explicit Gemini override with/without credentials, OpenAI-credential absence fallback, preservation of the configured Gemini default, unrelated override values, and no credential-driven switch from other providers.
- Commits: `204f2e588cab69e4d99206c85fd38c41e1f3d49f` (helper), `db3a0a303f83615266bc4224762cde7190ef89d2` (tests). Resolver integration is included in the branch update before these commits.
- No tests, type-check, build, live Gemini call, CI/Vercel, deployment, or re-index execution was run or awaited. No PASS claimed.
- The owner's logs show OpenAI 401 and Gemini fetch failures; source fallback cannot repair invalid provider credentials or runtime egress. Do not expose keys in logs. Durable provider selection should be made in Settings → AI Platform → Embeddings to queue the Qdrant fleet re-index; the environment override alone does not re-index.
- **Exact next implementation:** continue the live model-catalogue audit: replace remaining selectable static Gemini model lists/defaults with governance live rows and capability filters; keep static metadata only for pricing/vector compatibility. Add focused regressions and continue without waiting for CI/Vercel.

---

## DEV-01 CONTINUATION — TEMPORARY GEMINI EMBEDDING ROUTING — 2026-10-14

- Owner reports OpenAI is temporarily unavailable due to billing/key issues and wants to continue using Gemini embeddings.
- Added an embedding-only `AI_EMBEDDING_PROVIDER=openai|gemini` override. It changes only the embedding execution provider, not chat/realtime provider selection. The platform environment API validates the value, and production seeding carries the non-secret setting forward.
- If this override is set to `gemini` and `GEMINI_API_KEY` is configured, resolver chooses Gemini even if the stored platform embedding default still says OpenAI. If no override is set, absent OpenAI credentials plus a configured Gemini key also selects Gemini.
- Source commits: `4aaf0c5409eef0414542aeadae799ac52df96c27` (resolver), `a53ba5b97cbd36417ac498972d53a533cf0ee533` (environment API validation), `0621d8bed7726a2a68890a4dfe02246df3797210` (production seed), `9521837f00bebae3ec30ec5f7d1f04c6768aa51a` (.env example).
- **Important operational next step:** configure `AI_EMBEDDING_PROVIDER=gemini` and ensure `GEMINI_API_KEY` is valid in the runtime environment, or choose Gemini in Settings → AI Platform → Embeddings. The platform UI path persists the official default and queues fleet re-indexing; an environment override does not itself schedule re-indexing.
- Existing Qdrant vectors must remain dimension-compatible; after selecting the platform embedding default, follow the re-index job status. No tests/typecheck/build/live embedding call/CI/Vercel/deployment was run or claimed.
- **Exact next implementation:** continue the current live-model catalogue audit from this state, add focused regression coverage for the new provider override and model capability selection, then continue replacing remaining static Gemini model selectors with live governance rows. Do not wait for CI/Vercel.

---

## DEV-01 CONTINUATION — LIVE MODEL SELECTION FOR ELEVENLABS PREVIEW — 2026-10-12

- ElevenLabs voice preview now obtains TTS models from the vendor-refreshed governance catalogue, rejects an explicitly selected model that is no longer available, and defaults to the lowest known unit-cost live model (unknown costs sort after known costs; release date breaks ties).
- **Exact next action:** audit remaining consumers of `GEMINI_CHAT_MODELS` / `GEMINI_EMBEDDING_MODELS` and all model fields in PlatformEnvPanel, OrgAIConfigEditor, agent editor, embed and phone/realtime paths. Static price/dimension metadata may remain for metering and Qdrant compatibility, but must not be treated as current availability. Replace any remaining selectable static arrays/default IDs with live governance rows and capability filters. Add regressions, then run focused tests/typecheck if local execution is available. Do not wait for CI/Vercel; no PASS until evidence exists.

---
## DEV-01 CONTINUATION — REMOVE REMAINING ELEVENLABS REALTIME MODEL FALLBACKS — 2026-10-12

- Removed the static realtime TTS fallback from `getPlatformDefaultRealtimeTTSModel()`; it now returns only an explicitly configured supported model or empty, allowing the voice resolver to select from the live catalogue.
- The ElevenLabs realtime relay now rejects a missing resolved model instead of silently pinning `eleven_flash_v2_5`. Realtime usage metering requires the actual model ID and no longer fabricates static TTS/STT model IDs.
- **Exact next action:** inspect and remove the remaining static fallback in ElevenLabs voice-preview requests and the remaining legacy Gemini chat/embedding catalogue consumers. Keep static pricing/vector-dimension metadata only where technically required; it must not determine model availability. Confirm every AI settings surface gets vendor-discovered model rows and uses capability filtering plus cost/release ordering.
- Regression tests/typecheck/build/live vendor calls have not been run. No PASS. Do not wait for CI/Vercel.

---
## NEWEST DEV-01 PRODUCT ACTION — DYNAMIC GEMINI + ELEVENLABS REALTIME CATALOGUE — 2026-10-12

This is an independent DEV-01 product task and does not supersede the parallel FIX-01 type-check correction action below.

- Source changes are committed for live Gemini realtime selection, live ElevenLabs realtime TTS selection, shared live-model option adapters, live sync on catalogue reads, stale seeded model reconciliation, and guarded cost/release sorting.
- **Exact next action:** inspect `src/modules/ai-core/model-catalog.ts`, `src/modules/ai-core/resolve.ts`, `src/lib/db/seed/production.ts`, model settings UI consumers and any Gemini model defaults. Replace selectable static model arrays with live governance catalogue data; retain pricing/dimension metadata only where required for metering and Qdrant compatibility, clearly separated from availability. Ensure current selections are validated against live provider capability, and unknown price/release metadata is not fabricated.
- Add focused regression coverage for Gemini chat/embedding/realtime capability filtering, provider-discovery failure, stale seeded model exclusion, ElevenLabs realtime TTS availability, and cost/release sorting.
- **Verification boundary:** no tests/typecheck/build/migration/live API/CI/Vercel/deployment/browser verification has been run. No PASS. Do not poll CI/Vercel.
- **Role boundary:** route substantial independent bugs to FIX-01; CI/CD, deployment, database-operation or infrastructure failures to OPS-01. DEV-01 continues product implementation.

---

## NEWEST IMMEDIATE ACTION — FIX-01 FIVE-ERROR FOLLOW-UP — 2026-10-12

- Owner's latest compiler evidence: 5 errors in 4 files.
- Fixes committed: DayPicker navigation class names (9827502f158ac26b2241e7cc5fabe7c5be6c291e); context-builder test's parent-directory import and mock paths (4957ddc8c2ee00fb47d8e8785752b9569c340484); Redis literal option typing and restored REDIS_HOST URL handling (6b79a63482911019c4ebc333901200f555f3614a).
- Remaining known item: ws has no declarations; package-lock has no @types/ws entry. Add @types/ws through npm with generated lockfile when package-manager execution is available; don't handcraft lock entries or add an any-only ambient shim.
- Next: git pull origin feature/ai-core-from-doable-source then npm run type-check. Send fresh output. No post-correction compiler/tests/build run; no PASS. Do not wait for CI/Vercel.


## NEWEST IMMEDIATE ACTION — FIX-01 TYPE-CHECK RESIDUALS — 2026-10-12

- Owner's fresh type-check after Stripe declaration correction dropped from 44 errors / 19 files to 33 errors / 15 files.
- FIX-01 has since committed targeted compatibility corrections for Stripe API version, DayPicker v10, react-resizable-panels v4, Recharts v3, ioredis/BullMQ option typing, pdf-parse v2 metadata, ReactMarkdown v10, test import resolution, and BullMQ queue generic typing.
- Exact next action: git pull origin feature/ai-core-from-doable-source then npm run type-check. Send fresh compiler output; do not reuse the old 33-error list as current evidence.
- src/modules/phone/core/call-handler.ts still needs official @types/ws with a package-manager-generated lockfile update. Do not paper over it with an incomplete ambient declaration.
- No post-edit type-check/tests/build/CI/Vercel/deployment has run. No PASS is claimed. Do not wait for CI/Vercel; route infrastructure/deployment faults to OPS-01.


## NEWEST IMMEDIATE ACTION — FIX-01 TYPE-CHECK ROOT CAUSE — 2026-10-12

- Owner-provided `npm run type-check` reported 44 errors in 19 files. FIX-01 traced the Stripe missing-member cluster to an incomplete ambient `declare module "stripe"` in `src/types/payments.d.ts`, which shadowed official `stripe@23.0.0` types.
- Removed only that Stripe declaration; the independent Razorpay declaration remains. Correction commit: `34aca73cd5ad2fc5c67396d1d35f24dcf38d7964`.
- Control evidence is recorded in I-097, EVT-FIX-20261012-01, SESSION-FIX-20261012-01, shared AGENT_MEMORY, and FIX-01 role-local MEMORY/WORKLOG.
- **Exact next action:** `git pull origin feature/ai-core-from-doable-source`, then `npm run type-check`. Report the new compiler output. Do not assume the other original diagnostics are fixed; triage only the residual set.
- No post-correction type-check/tests/build/CI/Vercel/deployment were run. No PASS is claimed. Do not wait for CI/Vercel; route genuine infrastructure/deployment defects to OPS-01.

## NEWEST IMMEDIATE ACTION — FIXED DUPLICATE EXPORT; REBUILD REQUIRED — 2026-10-11

- Owner-provided Docker build failed because `src/modules/ai-platform-core/index.ts` exported `buildClaraToolRuntime` twice.
- Removed the duplicate export in commit `d755aea0de75509cabfe2ed4c76e7cae2468db2e`.
- **Next action:** `git pull origin feature/ai-core-from-doable-source`, then rebuild `clara-backend`. Do not infer success from the old container remaining healthy. If build passes, recreate backend and retry Gmail OAuth save with a fresh platform session and the rotated Google OAuth secret. If the build reports a new compiler error, fix that next exact error without waiting for CI/Vercel.
- Runtime OAuth verification remains pending; do not share tokens or secrets in logs/chat.

---

# URGENT CURRENT ACTION — GMAIL OAUTH APP SAVE FAILURE — 2026-10-11

1. Revoke the exposed Clara platform session and rotate the exposed Google OAuth client secret; update the server-side configuration with the replacement secret. Do not put credentials in logs or project-control docs.
2. Deploy/rebuild the branch containing commit `bfc5fc00de27309598b4bcfe4813f8626de9b8b0` so the corrected named export is present in the runtime bundle.
3. Retry the Gmail OAuth app save with a fresh session and rotated secret. If it still fails, collect the server-side exception and stack only; redact cookies, client secrets, tokens and request bodies.
4. Verification remains pending until the save is observed to succeed. Do not poll CI/Vercel continuously.

# CURRENT NEXT ACTION UPDATE — MCP RESOLVER + CHAT/REALTIME SOURCE WIRING — 2026-10-11

DEV-01 has now added the first Streamable HTTP resolver behind `McpToolResolver` and source-level Chat / OpenAI realtime tool advertisement and dispatch through the Unified Tool Runtime. This supersedes the prior exact action to begin the resolver, but does not establish a verified runtime.

## Implemented in source
- `src/modules/ai-platform-core/mcp-streamable-http-resolver.ts`: HTTPS-only, DNS answer checks and pinned outbound lookup, TLS verification, redirects refused, timeout/cancellation, request/response bounds, JSON-RPC initialization, paginated discovery, supported schema conversion/validation, stale-schema rejection, and execution-time permission checks.
- Chat advertises eligible MCP tools and uses a fresh request-scoped Clara runtime with MCP capabilities.
- OpenAI realtime advertises eligible MCP tools and the authenticated realtime tool route dispatches the exact granted pair through a Unified Tool Runtime.
- Focused endpoint/IP safety test source added.
- Migration 070 distinguishes saved credentials (`configured`) from a successful discovery handshake (`connected`); the UI shows the last handshake and permits bearer credential rotation. This migration is source-authored but not applied or tested.

## Verification boundary
No Vitest, type-check, lint, build, migration, DNS-rebinding integration test, live MCP handshake, Chat E2E, realtime E2E, CI, Vercel, or deployment was run. No PASS is claimed. Keep platform servers disabled and `ENABLE_MCP=false` until source is executable-tested and a controlled live handshake succeeds.

## Exact next action
1. Add mocked transport/runtime regression tests for DNS rebinding/IP pinning, redirects, timeout/cancellation, size limits, stale schema, and revocation/platform/plan/tenant denial.
2. Run focused MCP bridge/resolver and Chat/realtime tests plus `npm run type-check` locally when execution is available; fix source issues directly without waiting or polling CI/Vercel.
3. Validate the real MCP initialize/list/call flow against a controlled server before enabling any production registry entry.
4. Validate the bounded per-execution-context discovery singleflight cache under parallel calls. It caches only remote metadata for 3 seconds, rechecks current DB authorization on every resolve, and is bypassed during invocation. Do not introduce cross-request caching unless grant/schema invalidation is reliable.
5. Route substantial correctness/security issues to FIX-01 and infrastructure/deployment-only work to OPS-01.

Detailed record: `docs/project-control/sessions/SESSION-DEV-20261011-01.md`.

---

# CURRENT NEXT ACTION UPDATE — MCP CONTROL PLANE SLICE IMPLEMENTED — 2026-10-10

DEV-01 / Forge has implemented the first source-level MCP registry and configuration/grant slice. This supersedes the earlier wording that the registry/UI was only planned; the runtime transport and chat/realtime registration remain pending.

## Implemented in source
- Migration `069_mcp_server_control_plane.sql`: platform server registry, approved tool allowlist/surfaces, encrypted org-owned credentials, org tool grants, agent tool grants, indexes, RLS and Data API revocations.
- `/api/platform/mcp-servers`: super-admin-only list/create/update and exact tool approval; HTTPS DNS-host endpoint validation, supported transport/auth validation, server disabled by default.
- `/api/orgs/[orgId]/mcp-servers`: org-authorized listing/configuration, encrypted write-only bearer token, plan entitlement checks, explicit org/agent grants, cross-org agent ownership check, revoke/disconnect flow.
- Existing platform Integrations screen now contains MCP Servers management; existing organisation Integrations screen now contains organisation MCP configuration; existing Agent Integrations screen now contains per-agent MCP tool grants.
- Source regression tests added for endpoint safety validation, org scope, cross-org agent grant denial and credential redaction.
- Saved credentials are explicitly marked `configured`, not `connected`; no successful live MCP handshake is claimed.

## Exact next action
1. Implement the supported Streamable HTTP MCP client/resolver behind the existing `McpToolResolver` interface, with DNS resolution validation on every connection, private/link-local/metadata IP blocking, TLS verification, no redirects by default, timeout/cancellation and response-size limits.
2. Add safe tool discovery, schema conversion/validation, redacted operational errors, tenant-scoped cache invalidation and exact server/tool policy snapshots.
3. Register MCP tools in the real Chat runtime and realtime voice tool advertisement/dispatch through the existing Unified Tool Runtime. Recheck platform enabled, plan, org connection/grant, agent grant, caller/user, session and surface at invocation; default-deny embed and platform-admin sessions.
4. Add runtime parity/revocation/stale-discovery/timeout tests and focused execution tests. Do not claim tests passed unless run and observed.
5. Continue without polling CI/Vercel. Route substantial correctness/security defects to FIX-01 and deployment/infrastructure-only work to OPS-01.

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-10 — MCP CONFIGURATION, TENANT ISOLATION, CHAT + REALTIME VOICE

[owner-authorized] DEV-01 / Forge is authorized to continue MCP product development from the current branch state. Source audit/roadmap: `docs/superpowers/plans/2026-10-10-mcp-configuration-ui-chat-voice-roadmap.md`.

## Source audit disposition
- I-6 MCP Tool Bridge is complete at source level; it adapts a host-supplied resolver into the existing Unified Tool Runtime and has regression source.
- The bridge is not an MCP transport/client or persistent server configuration UI.
- Existing platform/org/agent integration screens and realtime integration dispatch exist, but do not establish a working configured MCP server end-to-end.
- No executable tests/typecheck/build/live MCP connection were run or claimed.

## Exact next implementation slice
1. Inspect active migrations, existing platform integration CRUD, org/agent grant APIs, credential vault and runtime context contracts.
2. Implement a narrow persisted MCP server/configuration contract and migration with platform approval, encrypted write-only auth, org connection ownership, exact server/tool-pair policy and agent grants. Never persist or return plaintext secrets.
3. Add platform-admin MCP server management to the existing integrations UI and organisation connection/tool-grant controls to the existing organisation integrations UI; do not add another sidebar.
4. Connect the first supported transport to a host-owned `McpToolResolver`; fail closed for unsupported transport and enforce SSRF/TLS/timeout/size/redirect safety.
5. Wire authorized MCP tools into provider chat and realtime voice through the same Unified Tool Runtime, with server-derived identity and authorization rechecks at invocation. Do not expose to platform-admin sessions or public embeds by default.
6. Add regression source for cross-organisation isolation, revoked grants, platform/plan denial, secret redaction, transport abuse, chat/realtime parity, and stale tool discovery.
7. Update project-control, DEV-01 memory/worklog, and session records. Do not wait for CI/Vercel; route substantial security/correctness defects to FIX-01 and infrastructure/deployment-only work to OPS-01.

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — WHATSAPP CONNECTION + DAILY BRIEFING SOURCE

[owner-authorized] DEV-01 has implemented the main source path from Meta authorization through signed webhook persistence and a gated daily briefing sender. The live Meta app and runtime behavior remain unverified.

## Implemented source
- Migration `067_whatsapp_business_lifecycle.sql` adds one-time OAuth state, encrypted pending token sessions, active WABA/phone connection identity, one-active-phone uniqueness constraints, durable webhook events/messages, recipient opt-in, and unique daily briefing runs.
- Authenticated agent-scoped Meta OAuth start/callback rechecks the initiating user's current agent permission, consumes state once, exchanges the code and attempts long-lived token exchange, discovers owned/client WABA phone candidates, encrypts tokens, and lets the user select a phone.
- Selected WABA is subscribed to Meta. `/api/webhooks/whatsapp` implements challenge verification, raw-body HMAC signature validation, transactional idempotency, inbound message persistence, and delivery-status updates.
- Messaging reads server-side connection/webhook state, collects an E.164 briefing recipient and explicit opt-in, and prevents enabling briefing eligibility until an active connection has received a valid signed webhook event.
- `/api/cron/whatsapp-daily-briefings` is registered every 15 minutes (UTC), with up to three eligible connections per invocation and one successful run per connection/UTC date. It requires `CRON_SECRET`, an approved template configured by `WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME`, and selects only active, webhook-verified, briefing-enabled connections with a recorded recipient opt-in. It persists per-connection/date runs and outbound provider message IDs/status.
- The current briefing body is a deterministic digest of recent inbound message excerpts, not an LLM-generated summary. Setup instructions and required environment variables are documented in `docs/deployment/whatsapp-business.md`.
- Regression source exists for webhook signature/idempotency and briefing recipient/digest helpers.

## Verification / limits
- Tests were authored but not executed. No typecheck, build, Docker, CI, Vercel, deployment, live Meta OAuth, Graph token exchange, WABA subscription, webhook challenge, scheduled run, or actual message delivery was run or awaited. No runtime PASS is claimed.
- The branch contains source implementation only. Do not claim the channel is live until server configuration and Meta app setup are complete and normal runtime evidence exists.

## Exact next implementation
- **Completed follow-up:** Added `last_health_check_at` migration, a `CRON_SECRET`-protected scheduled WABA health probe, expiry/revocation fail-closed updates, and helper/route regression coverage for expired, revoked, and transient-failure states. The cron is registered every 15 minutes. Unhealthy saved connections now have explicit reconnect guidance in the Messaging UI. Source commits: `996080bfcf93cd039291cd78f96d3936dc6c8ac6`, `9497f19585ad386ea721536bb20092e0634c84c5`, `c3aa12fa670a15316d8e8c80acf6d2c646182fc2`, `ab4436eb6f21114f67706ef227336679ec36af9c`, `bf753134206cb69d1dfcd52352c5c68694ca92a6`. These are source changes only; no runtime PASS is claimed.
1. Token `expires_in` is persisted when Meta returns it; status reads and both scheduled jobs mark expired connections unhealthy and disable briefing eligibility. The scheduled health probe detects rejected access and keeps transient API failures from falsely revoking a connection. Messaging now offers explicit reconnect guidance when a saved connection is unhealthy, and route tests cover expiry/revocation transitions. If Meta returns no expiry value, that unknown-expiry case remains a limitation.
2. Continue route-level regression source for phone uniqueness conflicts, duplicate webhook retry, and monotonic delivery updates. Expiry/revocation and ambiguous-send quarantine tests have now been authored alongside existing OAuth state replay/permission recheck, cross-organisation authorization, briefing readiness/recipient consent, HMAC/idempotency helpers, E.164/digest behavior, and monotonic message-status tests. All remain unexecuted.
3. Stale `sending` records without a provider message ID are now quarantined after 30 minutes as terminal `SEND_OUTCOME_UNKNOWN` runs with attempt_count set to the retry limit; they are not automatically resent, avoiding duplicate delivery. Continue reconciling provider status races and review recovery options that do not risk duplicate sends. Keep template/opt-in/customer-service-window requirements enforced.
4. Evaluate replacing the deterministic excerpt digest with a grounded AI summary using the existing Clara message/RAG policy; do not expose provider tokens or bypass tenant isolation.
5. Continue source implementation without CI/Vercel polling. Route substantial correctness/security defects to FIX-01 and deployment/infrastructure-only work to OPS-01.

---



# IMMEDIATE SELF-HOSTED RUNTIME FOLLOW-UP — 2026-10-09

The owner-provided `clara-backend` logs exposed a runtime/image mismatch and PDF.js startup issue. Source corrections are committed, but the running image is 14 hours old and is not verified against the branch.

- Migration set on the current branch has one `063` prefix and includes `065_platform_integration_oauth_apps.sql`; rebuild the current branch before diagnosing the older image's duplicate-063 error further. If the rebuilt image still reports duplicates, inspect the packaged `/app/src/lib/db/migrations` filenames.
- PostgreSQL logs also showed repeated missing-table queries after migration failure. `src/instrumentation.node.ts` now keeps local cron, ingest/reindex pollers, and subscription sweeps disabled unless migrations complete successfully (`039847f0c6cd8496dcdeec163eb087b366f52f9b`). Rebuild and inspect fresh logs; do not manually create tables or reset the database.
- Current production seed source upserts the demo organisation before its agent; the logged FK violation came from an image/runtime of unknown source commit. If it persists after rebuild, capture current seed stage logs before changing seed logic or data.
- PDF parser no longer eagerly loads `pdf-parse` during parser-registry startup (`cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`). Declared `@napi-rs/canvas` as a production dependency and synced the lockfile (`3f1b5db3fdf5b009e05ca5b03ae197cc26af9338`, `9fa3a134e4492de0ba8ab2f323a3df1e7984b85b)). Actual PDF extraction still requires normal runtime confirmation.
- If self-hosted cron routes are intended to run, configure a strong `CRON_SECRET` in the server's environment and restart/recreate the backend after updating the environment.
- Do not use `docker compose up` after a failed build as proof that the new source is running. No build, migration, PDF parse, deployment, or runtime PASS is currently claimed.

Continue the existing authorized integration-runtime roadmap below without waiting for CI/Vercel/Gates.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — SHARED INTEGRATION CAPABILITY POLICY

[owner-authorized] P1 common integration framework work now has one shared authorization policy for integration capability discovery and action invocation.

## Completed source work
- Added `src/modules/ai-platform-core/integrations/integration-policy.ts` as the common server-authoritative gate for platform enablement, plan entitlement, organisation grant, agent grant, caller identity, and caller-usable connection readiness.
- Both the I-4 `integration-tool-bridge.ts` and the AI `integration-action-tool.ts` now reuse that policy instead of maintaining separate grant/connection checks.
- Authorization database failures are normalized to `AUTHORIZATION_UNAVAILABLE` without exposing SQL/driver details.
- Runner error codes and retryability are preserved as structured tool failure details.
- AI availability advertises only actions that the runtime can actually resolve, and reports safe connection status/help.

- OAuth contract follow-up: `OAuth2TokenData` now declares the persisted optional `authorization_method` field used by the existing refresh path (commit `5d0d64c22c04c32f01a44cbb0ad95b3fee7b4921`). Source-only; no executable PASS claimed.
- Regression source added for missing identity, sanitized policy-query failure, error taxonomy, expired status, and unavailable action packages.
- Commits: `55306cc3f1fe62b0295c51089462018fb98eba7b`, `80642166654c16b6c533917783f80c50832d73ee`, `7d6954093c2f7f8bd557b12bf5e75ec6b241e098`, `af97578a8557b92064210748760def6be7b49425`, `fa5b81f6e60c453986d165b2425bbe0d299ef943`, `38dbb5b4707b4acb41f5b61d527fe2dae1f2e9c6`, `c50313256116ac7f59b34d83d2950e68df37695d`, `8fd1ab08ed89bcccc9d8f30a1bdb7e8b8e0a930a`, `e74e0de0b68f19f45b12a46629e2a035b5f3761f`, `481988f4b3febf1eefbe4aea6c86a80700d0e3fb`, `1df63308197e42351ba2ddb4efc90d20ed8bff71`, `ffd9c2f719535d0a231d4b73fcee8dd62487a523`, `9caa045853d9141f9139f4069e506b75cfe93f1a`, `0f51346861e4f2e61b2a8bd863dc70ce17ec37d6`, `5b2c476669b6cb9845cf20e20bdcc012b09293c9`, `641ddc114aa5d04e59e58be762019bb3b2d893c0`, `fa62216fd8c145d1d79c5a5e45e8df1876baf776`, `51ef9a3305904e1404d7920710cf8400e1d7a66d`, `9ca66371f263d65c6fb24b8b73ce0d3a89cbbc70`.

## Verification
Tests authored only. No test execution, typecheck, build, Docker, CI, Vercel, Gates, deployment, or live provider flow was run or awaited.

## Next implementation
Continue P1/P2 integration runtime hardening:
1. Review the new shared policy and OAuth token contract as a single end-to-end path; retain runner-side authorization as the final credential boundary.
2. Add typed idempotency and approval/policy hooks for consequential integration actions using existing runtime contracts—do not create a second executor.
3. Keep RAG knowledge grounded in Clara Qdrant, and preserve tenant/user provenance, secret redaction, and default-off rollout flags.

Do not wait for CI/Vercel/Gates.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — UNIFIED INTEGRATION READINESS CONSISTENCY

[owner-authorized] Continued P1 shared capability/readiness work while preserving the existing Unified Tool Runtime.

## Completed source corrections
- Integration availability now fails closed before any database/plan query if caller user or agent identity is missing; the placeholder agent UUID fallback was removed.
- Integration action execution now rejects missing user/agent identity before querying grants.
- AI availability reports safe connection status (`active`, `expired`, `error`, `revoked`, `disconnected`) and targeted guidance, instead of collapsing every non-active connection into “needs credentials”.
- The I-4 integration bridge also fails closed on missing caller identity before capability discovery.
- Added focused regression source for missing identity and expired connection guidance.
- Commits: `fa5b81f6e60c453986d165b2425bbe0d299ef943`, `38dbb5b4707b4acb41f5b61d527fe2dae1f2e9c6`, `c50313256116ac7f59b34d83d2950e68df37695d`, `55932b645d4e7bb54de4a59e54447f561972de88`, `1e5f3033fa13465e5fbbd5587468cabbe3acecea`, `732eae44fec8a7aa4401fb810bd91f0fcf3d49cf`, `8fd1ab08ed89bcccc9d8f30a1bdb7e8b8e0a930a`, `e74e0de0b68f19f45b12a46629e2a035b5f3761f`, `481988f4b3febf1eefbe4aea6c86a80700d0e3fb`.

## Verification disposition
Regression source authored only. Tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent were not run or awaited.

## Next implementation
1. Continue the source review of OAuth callback, token refresh and disconnect semantics.
2. Improve integration readiness and error taxonomy at the existing AI Tool Runtime boundary without exposing provider errors or secrets.
3. Continue roadmap P1/P2 with shared typed capability metadata and safe invocation; do not add a second executor.

Do not wait for CI/Vercel/Gates.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — P0 CONNECTION RECOVERY BASELINE

[owner-authorized] Continued OAuth and connection reliability work. In addition to the consent/token flow, the organisation connection API now rejects invalid credential shapes, reports safe health summaries, and offers scoped disconnect/reconnect controls.

## Latest recovery hardening
- Health summaries are scoped to the authenticated user's available connections plus organisation-shared connections; other users' private credentials are not counted as the current user's ready connection.
- Disconnect now matches the exact `agent_id` scope instead of treating a missing agent ID as permission to delete every agent-scoped connection.
- UI adds explicit disconnect confirmation and OAuth reconnect affordance.
- Regression source covers server-side credential validation, expired health status, and exact disconnect scope.
- Commits: `6472dae88f4b1a835839f22c1d2bf9aa5a27da4f`, `bf8f6c0706ca0df432e5ddf3c75a15152585846e`, `d9442aa0b0311a9623b8f21916b053174260e843`, `5e1cd4a9399d3ccf05c0726dc70bf36ff1bb02b1`, `e4f94669d9a1cf8a832cb15dc33b38430a442374`.

## Verification
Tests are authored but not run. No typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent was run or awaited. No runtime PASS or production recovery is claimed.

## Next implementation
Continue P1 integration capability/readiness consistency by inspecting `src/modules/ai-platform-core/integrations/integration-tool-bridge.ts` and the existing Unified Tool Runtime contracts. Reuse the existing runtime; do not add a second executor. Ensure availability reflects platform/org/agent grants, plan entitlement, and caller-usable connection scope, and ensure invocation repeats the checks.

Do not wait for CI/Vercel/Gates.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — CONNECTION HEALTH + CREDENTIAL VALIDATION

[owner-authorized] The OAuth lifecycle source slice now includes a server-side credential boundary and health summaries.

## Completed source work in this slice
- OAuth state schema, start route, callback route, UI consent initiation, encrypted connection persistence, PKCE support, one-time state consumption, entitlement rechecks, and safe aggregate health reporting are in source.
- Token storage now preserves OAuth HEADER/BODY client authentication mode, and the existing refresh path honors it.
- The organisation connection API now validates credentials independently of UI input. OAuth connections without an access token are rejected (preventing client ID/secret alone from becoming a falsely active connection); basic auth requires username/password; secret-text and custom-auth required fields are checked; authType `none` rejects credential writes.
- Added helper regression source for valid/invalid credential shapes and updated API health regression source.
- Commits: `1449d36377a14c96a34625618b39405eb9d26749`, `ff01cda2c64b0f1391321440c22ee99e0afdf351`, `675cd39bc4e831f5fdba7b4859daa4f3c921341f`.

## Verification disposition
- Tests are authored but not run. No typecheck/build/Docker/CI/Vercel/Gates/deployment/live OAuth provider test was run or awaited.
- The feature is source-implemented and still requires ordinary future verification/deployment before production use. No live OAuth issue is claimed fixed.

## Next bounded implementation
1. Continue P0 connection recovery: audit error/revoked/expired transitions and safe disconnect/reconnect behavior.
2. Continue P1 common capability framework by making health/readiness metadata consistent across the existing integration bridge and Unified Tool Runtime, without creating a parallel executor.
3. Preserve platform → organisation → agent grants, plan entitlement, user-specific credentials, encrypted token storage, and no secrets in model context.

Do not wait for CI/Vercel/Gates. Do not promote production or start broad provider rollout.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — OAUTH REFRESH CONTRACT + CONNECTION HEALTH

[owner-authorized] Continued the P0 OAuth lifecycle without waiting for CI, Vercel, Gates, or continuous verification.

## Additional source corrections
- OAuth token credentials now persist the registry's `authorizationMethod` as `authorization_method`.
- The existing runner refresh path honours HEADER vs BODY client authentication, so a connection established with HTTP Basic client auth will continue to refresh correctly rather than failing after access-token expiry.
- OAuth start now validates the registered authorization endpoint and persisted redirect URI at use time, prunes stale state records, and honors the registry PKCE method.
- Organisation integrations API now returns only safe aggregate connection health (`connected`, `expired`, `error`, `revoked`, `disconnected`, latest update timestamp); UI surfaces expired/error status and offers reconnect.
- Added regression source for OAuth HEADER refresh and callback mode, and expired connection health.
- Source commits: `78e28640520922db010023a0d0804fff3c9142f7`, `fbd95c6d43b6b9bee15787785f75409111540c44`, `67abff6bb38aca66df886971a6a8f0357727e803`, `0afb5258e9d721857095078ccb2598b2a43d6d88`, `87756d3cc235ab4a356c057319e7159c8733c104`, `fcfc27207bebf75dbc1300b57a227db592fd4c47`, `a4f46d8af88a55e869f292db5ffa9cf63ed496d5`, `d84a8c1523ebcd6b7b5af04f468a01f51159648a`, `2b82214135ff5fe164eaf2fb9feafedc424f6358`.

## Verification disposition
- Tests were authored but not executed. No typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent was run or awaited.
- The OAuth lifecycle is source-implemented, not production-verified. Runner webpack fix `b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd` remains newer than the user's pasted local build.

## Next bounded implementation
1. Continue source review of OAuth start/callback and the organisation connection API; keep token format compatible with `OAuth2TokenData` and `ensureTokenFresh`.
2. Add any missing failure-path regressions and improve reconnect status without exposing provider response bodies or secrets.
3. Continue P0 reliability then P1 common integration capability framework; preserve the Unified Tool Runtime and default-off rollout flags.

Do not wait for CI/Vercel/Gates and do not claim live recovery.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — OAUTH CONSENT LIFECYCLE SOURCE IMPLEMENTED

[owner-authorized] I-6 MCP policy snapshot hardening is complete at source level. Development has continued into the P0 OAuth connection lifecycle in the Integrations & AI Enhancement Roadmap.

## OAuth lifecycle source added
- Added migration `066_integration_oauth_states.sql` for short-lived, one-time state records bound to integration, organisation, user, optional agent, exact redirect URI, expiry, and encrypted PKCE verifier. RLS is enabled and browser roles are revoked.
- Added cryptographic helpers to generate 256-bit URL-safe state, SHA-256 state digests, PKCE verifier/challenge, and a 10-minute expiry.
- Added organisation-authorized OAuth start route. It checks platform enablement, organisation grant, plan entitlement, provider OAuth metadata, and platform OAuth app configuration; persists only the state digest and encrypts PKCE verifier; uses exact configured redirect URI and safe parameter precedence.
- Added OAuth callback route. It atomically consumes unexpired state once, binds callback origin/path and current redirect config, exchanges authorization code with redirects disabled and timeout, honours HEADER/BODY client authentication and configured PKCE method, rechecks current org/platform/plan entitlement, and stores token credentials encrypted in the existing tenant-scoped connection table.
- Organisation integrations UI now starts OAuth consent for OAuth2 integrations and reports callback outcome.
- Added focused regression source for state/PKCE helpers, OAuth start, callback one-time state handling, encrypted persistence path, and grant revocation during consent.
- Implementation commits include `bd7380f09ad4e56e30ab3c2a69ec416c9ef35652`, `28ecb76e96779ac0730b7c2ee1a8798b32b79777`, `23b99abe58cd82e9f6c9724787a066bb2304de99`, `da181a12e5e9d92798bd2d068a2f676eba62f2b4`, `df5217af0678b76eaa7983c66656ad8ad0b0a980`, plus subsequent PKCE, entitlement, test, and table-security corrections.

## Verification disposition
- Source and regression tests authored; tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent were not run or awaited.
- OAuth lifecycle must not be called production-verified. The user's pasted Docker build predates runner import fix `b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd`; rebuild result is unknown.

## Next bounded implementation
1. Inspect the OAuth start/callback routes against the current runner token-refresh contract and provider metadata. Correct source-level mismatches without waiting for external gates.
2. Add any missing regression source for provider client-auth modes, PKCE and cancellation/replay paths.
3. Continue roadmap P0 connection health/reconnect and OAuth configuration observability only after this bounded callback slice is coherent.
4. Keep project-control records current; no deployment or live recovery claims.

Do not wait for CI/Vercel/Gates. Do not promote production or begin broad provider rollout.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — I-6 FINAL MCP POLICY SNAPSHOT HARDENING

[owner-authorized] The owner explicitly requested completion of I-6 bounded hardening and continuous progression without waiting for CI, Vercel, Gates, or continuous verification.

## I-6 final source correction
- Found and corrected a remaining async trust-boundary gap: the MCP bridge previously validated the caller-owned policy, then awaited the untrusted resolver before taking its immutable policy snapshot. A mutation during that await could change the resulting capability's authorization policy (including `requireUserId`).
- The MCP bridge now snapshots the validated policy before any resolver await; runtime construction snapshots once before iterating requests; registration continues to bind immutable policy/descriptor/context.
- Added regression source that mutates `requireUserId` during resolver discovery and asserts the stricter initial requirement is retained.
- Commits: `826169686c91c5095ac5d717eb27a048c020a57a`, `6f824ce9f75e38645c6b33e06b37559977650d0a`.
- **I-6 implementation status: COMPLETE — source changes and regression source authored.** Tests/build/CI/Vercel/Gates/deployment were not run or awaited; no executable PASS is claimed.

## Next implementation — P0 OAuth connection lifecycle
Continue the authorized `INTEGRATIONS_AI_ENHANCEMENT_ROADMAP.md`:
1. Inspect current OAuth app configuration, integration connection schema, credential encryption, provider registry OAuth metadata, and existing callback/consent routes.
2. Implement the smallest safe server-side OAuth state lifecycle with cryptographically random state, short expiry, one-time consumption, strict redirect URI binding, and PKCE where supported. Do not fabricate provider callback contracts or store tokens unencrypted.
3. Persist consented connection credentials only against server-resolved organisation/user/agent provenance; never return secrets to the browser or expose tokens to model context.
4. Add focused regression source and update project-control records after each bounded slice.

The runner webpack import correction `b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd` is already committed on this branch, but the owner's pasted local build predates that correction. The source correction has not been validated by a rebuild. Do not claim the image or live OAuth endpoint is fixed.

Do not wait for CI/Vercel/Gates. Do not begin production promotion or broad provider rollout.

---

## 2026-10-09 — Self-hosted Next.js build blocker: runner module resolution

[architect-verified] The owner supplied a Docker build log showing Next.js webpack cannot resolve five explicit .js-suffixed relative imports in src/modules/integrations/runtime/runner-core.ts. The target TypeScript modules exist, but this webpack path is failing to resolve the NodeNext-style suffixes. Updated those five imports to extensionless relative specifiers so Next's webpack resolver can select the TypeScript source files.

- Source correction: b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd
- Scope: registry index, credential vault, context builder, XRay, and runner fetch imports in the integration runner.
- No Docker build, CI, Vercel build, Gate, or continuous verification was run or awaited after this correction.
- The user's current container remains healthy on the previously built image; this source commit is not evidence that the new image has built or been deployed.

Next implementation: continue the active integrations runtime work from the roadmap/project-control records, resolving any further concrete source blockers without waiting for external gates.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — INTEGRATIONS & AI ENHANCEMENT IMPLEMENTATION

[owner-authorized] The user authorized proceeding with the Integrations & AI Enhancement Roadmap. This supersedes earlier stop/await text for the bounded work below, but does not authorize production promotion or claims of live recovery.

## Completed in this continuation
- Added shared pure migration-number validation in `src/lib/db/migration-validation.ts`.
- Added focused regression source in `src/lib/db/migration-validation.test.ts`.
- Updated `src/lib/db/migrate.ts` to validate migration filenames before acquiring a database connection or issuing schema queries.
- Updated `scripts/db-reset.ts` to reuse the same validator.
- Source commits: `e0fc892e9b94b851cde247ebf36ed7dde5db8dfe`, `8bf3b378b9fadb39e5435a4e21e7489ef32b00b7`, `e28b6ee8b8536123069eee85bb64392b5eede592`, `690730bb95ce91f8f86a8e413fff09f7f69ef619`.

## Verification disposition
- Source-level change only. Tests, typecheck, build, CI, Vercel, live DB migration, deployment, and OAuth endpoint recovery were not run or awaited.
- The earlier OAuth migration numbering correction and production skip guard are source-level mitigations, not proof the live endpoint recovered.

## Next bounded implementation
1. Inspect existing connection/token persistence and provider OAuth contracts before adding a callback.
2. Implement the smallest safe OAuth lifecycle slice: state validation, expiry, one-time consumption, exact redirect matching, and PKCE where supported.
3. Keep platform OAuth app configuration separate from organisation/user consent and connection records.
4. Preserve server-side tenant/user provenance, encrypted token storage, secret redaction, and Unified Tool Runtime execution.
5. Add focused regression source as each slice lands and update project-control records.

Do not start a broad provider rollout, billing redesign, production promotion, or parallel tool executor. Do not wait for CI/Vercel/gates; report executable and live verification as deferred.

---

## 2026-10-09 — OAuth configuration incident: production migration skip guard

[architect-verified] Added a fail-closed guard to `scripts/migrate.ts`: `SKIP_DB_MIGRATIONS=1` remains available for non-production local workflows, but the migration command now exits unsuccessfully if that skip is requested in production or on Vercel. This prevents a deployment build from silently succeeding while request handlers depend on schema migrations that were never applied.

- Implementation commit: `176f9f26a13152f64aae505f1d04fee750f01411`.
- The earlier OAuth migration-number correction is already present on this branch: `src/lib/db/migrations/065_platform_integration_oauth_apps.sql`; migration `063` is no longer duplicated by the OAuth table migration.
- Source-level correction only. Tests, CI, Vercel build, live DB migration state, and production endpoint recovery were not verified or awaited.
- The live endpoint can still fail until the corrected source is deployed and the production migration succeeds. No session cookies, OAuth secrets, or credentials were copied into repository files.

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — REALTIME VOICE DISPATCH ARCHITECT REVIEW RECORDED

[architect-verified] DEV-01 / Forge's bounded source review of realtime voice integration dispatch found no substantial implementation defect requiring FIX-01 handoff. The implementation follows the intended security shape: both rollout flags gate tool exposure and invocation; only two fixed integration tool names are accepted; public embed sessions are blocked from the browser dispatch path; server-side auth and KB membership/read access are checked; tenant, agent, user, and session identity are derived server-side; and execution delegates to the existing Clara Unified Tool Runtime.

### Review outcome
- **PASS_WITH_FOLLOWUP — SOURCE REVIEW ONLY.** This does not close the broader organisation-integration task, approve deployment, or claim test/build/CI success.
- Focused regressions exist for tool exposure, auth, allowlisting, forged body identity, KB permission, and runtime delegation. Tests were not executed during this review.
- No source implementation changes were made during the review. No FIX-01 handoff was needed.
- No CI, Vercel build, Gate-C/Gate-D, or deployment was run or awaited.

### Follow-up / stop boundary
The remaining evidence gap is execution of the focused realtime regression tests and normal project verification when separately authorized. Do not interpret this review as OAuth consent/token exchange completion or production deployment. Do not start unrelated implementation or a new phase from this review.

**Exact next action:** stop after recording this review outcome and await the next owner-authorized bounded task.
# INCIDENT CORRECTION — 2026-10-09 — PLATFORM OAUTH APP CONFIGURATION 500

[architect-verified] The reported `GET /api/platform/integrations/gmail/oauth-app` response `Could not load OAuth application configuration` is consistent with a migration-bootstrap blocker in the active branch: two migration files used prefix `063`, while `runMigrations()` explicitly rejects duplicate migration numbers before applying schema changes.

### Source correction
- Renamed the OAuth app schema migration to `src/lib/db/migrations/065_platform_integration_oauth_apps.sql`, leaving `064_sarvam_realtime_streaming.sql` in sequence.
- Added the new migration file and removed the duplicate-numbered original.
- Commits: `a85d58837719a6c7ac8aef4a28c909a262289bec`, `800826364c4b23be625629ebf9922687de84f342`.
- No tests, CI, Vercel build, Gate, or live deployment verification was run or awaited.
- This is a source-level root-cause correction; the live endpoint will remain broken until the active source is deployed and migration startup runs successfully.

### Security note
The user-provided curl included a session bearer/cookie token. Treat it as exposed and revoke/logout that session or rotate the token using the platform's supported session controls. Do not copy it into issues, logs, or repository files.

### Next implementation
Resume the currently authorized integration runtime task: wire realtime voice integration tool invocation through the same authorised Unified Tool Runtime used by provider chat, preserve provenance-verified tenant/agent/user context, add focused regression source, and update project-control records. Do not wait for CI/Vercel/Gates.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — REALTIME VOICE DISPATCH

[architect-verified] Provider chat integration dispatch is implemented in the KB-aware chat route behind the existing default-off agent-loop and provider-tool-calling flags.

### Completed in this continuation
- Chat route exposes only `integration_availability` and `integration_action` tool descriptors when both flags are enabled and the provider implements `chatStreamWithTools`.
- Calls run through `runBoundedAgenticLoop` and the existing `getClaraToolRuntime()`; no parallel executor or direct provider API call was introduced.
- Execution context is minted through `createExecutionContext` from server-resolved org, KB, resolved agent, authenticated user, and optional session. Body-supplied tenant/user/agent values are not used.
- Providers without tool-calling support retain the existing chat streaming path.
- Implementation commit: `df124e837b49a17d1e218eca9a585a8313dbdec6`.
- No tests, CI, Vercel build, Gate-C, or Gate-D were run or awaited.

### Remaining bounded work
1. Wire realtime voice integration tool invocation to the same authorised Unified Tool Runtime without creating a parallel executor or exposing credentials to the model.
2. Add focused regressions for chat/voice dispatch and context propagation.
3. Update project-control records as each implementation slice lands.

### Security / rollout
- Both chat tool-calling flags remain default-off.
- Preserve platform → organisation → agent grants, connection readiness, plan entitlement, and user-specific credential selection.
- No CI/Vercel/Gate waits; external verification remains deferred.
- Do not claim OAuth consent/token exchange is implemented.

**Next implementation:** inspect the current realtime voice tool invocation seam and connect supported integration tool calls to the same runtime using provenance-verified identity.

**STOP:** no broad unrelated provider rollout, billing redesign, production promotion, or unrelated integrations.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — INTEGRATION RUNTIME DISPATCH

[architect-verified] The active owner-authorized task is organisation integration setup plus AI access. The platform OAuth app configuration route and super-admin UI already exist; this continuation hardens their input boundary and adds focused regression coverage. The next implementation is provider-chat dispatch through the Unified Tool Runtime, followed by realtime voice dispatch through that same runtime.

## Completed in this continuation
- Platform OAuth app settings now reject malformed/oversized client IDs, oversized client secrets, invalid redirect URIs, non-HTTPS redirect URIs outside local development, redirect URI credentials/fragments, malformed scope arrays, oversized scope lists, and duplicate scopes.
- OAuth validation is isolated in `src/modules/integrations/oauth-app-validation.ts` and has focused regressions in `src/modules/integrations/oauth-app-validation.test.ts`.
- Stored OAuth client secrets remain encrypted server-side and are never selected into GET responses or returned to the browser.
- Commits: `175803e3b30605baf8546e49878c4a5d4dcf9255`, `99aab21e6e31436073ed2ffe638c216f5f818a2a`, `7c0614d878c43ac50ec3e89d4c017a690c379d42`, `e8f1a1cf3b0bdcaea81a83a609a3be20bf5737d4`.

## Still required in this bounded task
1. Wire provider chat tool-call dispatch to `integration_availability` and `integration_action` through the Unified Tool Runtime, carrying a provenance-verified tenant/agent/user context.
2. Wire realtime voice tool invocation to the same authorised runtime without a parallel executor or model-visible credentials.
3. Add focused regressions for dispatch/context propagation and update project-control records.

## Security / rollout
- Never return stored secret values to the browser.
- Preserve platform → organisation → agent grants, connection readiness, plan entitlement, and user-specific credential selection.
- Provider and voice tool calls must execute only through the Unified Tool Runtime / existing integration runner.
- Do not claim a functional OAuth consent/token-exchange flow: only app configuration is implemented; server-side state validation, callback and token exchange remain separate.
- Do not wait for CI, Vercel, Gate-C/Gate-D, or continuous verification. External verification remains deferred.

**Next implementation:** inspect provider contracts and the existing bounded agentic-loop pilot, then wire provider chat dispatch with default-off rollout and exact context propagation.

**STOP:** no broad unrelated provider rollout, billing redesign, production promotion, or changes to unrelated integrations.

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

# Immediate operational hotfix — responsive login layout (2026-10-09)

The login surface at `src/features/admin/screens/login-screen.tsx` was using a viewport-height centered wrapper without vertical padding or a small-viewport-safe height, while its card used the mobile-density-sensitive `p-5` utility. The correction adds dynamic/small viewport height support, vertical breathing room so short screens can scroll, horizontal overflow protection, explicit min-width handling, and stable mobile/desktop card padding.

- Source commit: `4d6a9720383a77374d59a326a509a83940a3fa0c`.
- **Next action:** deploy by fetching the active branch and rebuilding/recreating `clara-backend` on the self-hosted Docker host. Then inspect /login at narrow mobile widths and short viewport heights, including when the mobile keyboard is open.
- No Docker host access, browser-device test, build, or post-deploy verification was performed in this session. Do not claim the live deployment is fixed until the host is rebuilt.

---

# Immediate operational hotfix — CSS restoration (2026-10-09)

The owner explicitly authorized a live self-hosted UI styling fix. The latest source branch uses Tailwind CSS 4.3 with `@tailwindcss/postcss`, but `src/app/globals.css` still used the removed v3 `@tailwind base/components/utilities` directives. Commit `449afb73ea2a111c633c91dcd34e03f9d6a7480c` switches the stylesheet entry to `@import "tailwindcss";` and explicitly loads the existing root Tailwind config with `@config "../../tailwind.config.js";`.

**Next action:** on the self-hosted Docker host, fetch this branch and rebuild/recreate `clara-backend`; then verify the page's `/_next/static/css/*` assets return HTTP 200 and contain generated utility CSS, and hard-refresh the browser. ChatGPT cannot access the user's SSH session from this chat, so no host rebuild or live-runtime verification is claimed yet. Do not treat source commit alone as a production deployment.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — I-6 IMPLEMENTATION COMPLETE

[architect-verified] I-6 is fully complete at the bounded source-implementation level. The final correction validates the injected resolver before enabled runtime creation, including the empty-request case, while the public builder already rejects malformed resolver objects.

### Final correction
- Implementation: `74e410e2e21cb641b33e660981877a555cabfc96`
- Existing regression: `bbdedae0497fc4b01ae0a4a4f4eb42e520add55c`
- The complete I-6 contract remains covered: exact server/tool allowlisting, default-off `ENABLE_MCP`, deterministic collision-resistant naming, runtime validation of resolver/policy/descriptor/surface/schema boundaries, frozen resolution requests, exact provenance-verified execution-context binding, isolated Unified Tool Runtime delegation, fail-closed discovery/registration, retry-safe registration bookkeeping, and public AI Platform Core export.
- No additional I-6 source item remains authorized.

### Verification disposition
No GitHub Actions, Vercel build, Gate-C, or Gate-D was awaited. No external verification PASS is claimed.

### Next implementation
There is currently no repository-authorized I-7 implementation plan. Do not invent one. The next implementation begins only when the control layer authorizes a new bounded plan; until then, the only remaining I-6 activity is the separately documented external verification/closure process, which is intentionally not being awaited.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE

[architect-verified] I-6 bounded MCP Tool Bridge implementation is complete. No additional source hardening remains authorized within the I-6 plan.

### Final I-6 corrections
- Resolver runtime shape validated before public builder binding and before enabled runtime creation.
- Rejected runtime registration no longer poisons normalized identity bookkeeping.
- Focused source regressions cover both boundaries.
- Final implementation commit: `63fe42e176e95732a46c3c16f20c586ab025ce99`.

### Verification disposition
No GitHub Actions, Vercel build, Gate-C, or Gate-D execution was awaited. These remain deferred evidence, not implementation blockers and not PASS claims.

### Next
I-6 is source-complete. The control layer does **not** currently authorize an I-7 implementation plan, so no unrelated implementation is being invented or silently expanded. The next authorized action is the documented external verification/closure step when explicitly performed; it is not awaited now.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE — FINAL REGISTRATION CORRECTION

[architect-verified] I-6 MCP Tool Bridge is implementation-complete within its bounded plan. The final registration correction ensures the capability identity map is committed only after `runtime.registerTool()` succeeds. A `ToolRegistrationError` therefore leaves the identity retryable, so a subsequent identical resolution can register successfully.

- Implementation: `a215bb81b1bf53f1c4c98d5205aa841bb2a0ee43`
- Regression: `e4cdc946a15b76a004e4123be5eaf060b4edcd9d`
- All I-6 implementation acceptance requirements remain covered: exact server/tool allowlist, default-off flag, deterministic collision-resistant names, resolver/policy/descriptor runtime validation, frozen resolution request, exact provenance-verified context binding, schema validation, isolated Unified Tool Runtime delegation, fail-closed discovery/registration, and public AI Platform Core export.
- No tests, GitHub Actions, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 is **IMPLEMENTATION COMPLETE — EXTERNAL VERIFICATION DEFERRED**.

**Next implementation:** no additional I-6 item remains authorized. The next implementation must come from a newly authorized project-control action; do not invent an I-7 scope.

**STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace/catalog, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE

[architect-verified] I-6 MCP Tool Bridge is implementation-complete within its bounded plan.

### Completion record
- Added runtime validation for the injected MCP resolver (`resolve` and `invoke` must be callable).
- Added runtime validation for malformed/null MCP policy objects at the public builder boundary.
- Added focused regressions for both trust-boundary failures.
- Removed an obsolete unused context snapshot from the resolver path.
- Existing I-6 controls remain intact: exact server/tool allowlist, explicit empty-surface fail-closed behavior, default-off `ENABLE_MCP`, deterministic 64-character collision-resistant names, frozen resolver request, exact provenance-verified execution-context identity binding, descriptor/schema validation, isolated Unified Tool Runtime delegation, and fail-closed registration/discovery.

Latest commits:
- `aa6951a499fd66c40a467c646332d8cacd019648`
- `17c925a11a478d910779c3ce77e946500252ed67`

### Verification disposition
No tests, GitHub Actions, Vercel build, Gate-C, or Gate-D execution was awaited. No external verification PASS is claimed.

### Next implementation
No additional I-6 implementation item remains authorized by the current plan. Do not invent or expand an I-7 scope. The next implementation must be taken from a newly authorized project-control action.

**STOP boundary:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace/catalog, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 MCP REGISTRATION BOUNDARY HARDENING

[architect-verified] Continued bounded I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The MCP runtime builder now validates the injected resolver before entering registration iteration. A malformed resolver therefore fails closed even when the request set is empty, instead of returning an apparently valid empty MCP runtime.

- Implementation: `a885eac30a6b6ce8056ecc57091f6319d8d032a2`
- Regression: `bbdedae0497fc4b01ae0a4a4f4eb42e520add55c`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.
- **STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 MCP RESOLVER SHAPE HARDENING

[architect-verified] Continued bounded I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The public MCP ToolDefinition builder now validates the injected resolver's runtime shape before binding `invoke`. Both `resolve` and `invoke` must be callable; malformed resolver input fails closed with a typed `TENANT_SCOPE_VIOLATION` error. Focused regression coverage confirms the public builder rejects a malformed resolver.

- Implementation: `d6ee7f8acd007ffe0b687f9acd7a1522e28efcab`
- Regression: `6fda566ecfe25361ee2bbf1901433ec46609fc53`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.
- **STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 EXACT EXECUTION-CONTEXT BINDING

[architect-verified] Continued bounded I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
MCP capabilities are now bound to the exact provenance-verified execution-context object used during discovery, rather than reconstructing an equivalent object from a fixed list of scalar fields. This prevents drift in correlation/metadata and future context fields and enforces the I-6 exact-context contract at invocation.

- Implementation: `52385a93baf34d855aeff400ccb37597ab661849`
- Regression: `ad429f5a1e50c37357763b31fd83ed999a9d29b8`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.
- **STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 RESOLVER REQUEST IMMUTABILITY CORRECTION

[architect-verified] Continued the owner-authorized I-6 bounded implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The MCP resolver discovery boundary now passes a frozen request snapshot instead of the caller-owned mutable request object. This makes the `readonly` resolver contract enforceable at runtime and prevents transient server/tool/context mutation during asynchronous discovery. The bridge retains the original request identity/context checks as defense in depth. The MCP policy validator also now rejects malformed non-boolean `requireUserId` values instead of coercing them into an authorization policy.

- Implementation: `9cfec56c90da88e367ac543e174716639802862b`
- Regression: `7ac7557abeb700f0a3a42ffd44ce58346c0b165a`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.
- **STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 DIRECT BUILDER SCHEMA BOUNDARY CORRECTION

[architect-verified] Continued owner-authorized I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The public MCP ToolDefinition builder now fails closed when a resolver-supplied descriptor carries a runtime-invalid input schema. The TypeScript Zod type is no longer the only guard at this boundary: the descriptor must expose a callable safeParse function before an executable capability is constructed. Unified Tool Runtime registration remains the final schema validation boundary.

- Implementation: a52ba9763bb0b35d1a5f4bb867fc41056a6f70c0
- Regression: c03302597c4bff83e3477f6d3b60f3b5da0ba663
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 resolver/registration and capability-authorization invariant review.
- **STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---
# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 IN-PLACE CONTEXT MUTATION CORRECTION

[architect-verified] Continued owner-authorized I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The MCP resolver request-integrity boundary now snapshots the scalar provenance values inside the resolution context (tenantId, kbId, agentId, userId, sessionId, and surface) before resolver invocation. The post-resolution guard rejects both replacement of the context object and in-place mutation of any authorized context field. This closes the remaining resolver-side context mutation path.

- Implementation: c0236b2e3ebff2bf3d711bfb95be746c7cd0873b
- Regression: 211e321ae427e6e6d4f5ac4ef24f8865efff2f90
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 source acceptance/reconciliation for remaining resolver, registration, allowlist, and capability-authorization invariants.
- **STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace, broad provider rollout, production promotion, billing redesign, or unrelated implementation.

---
# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 MCP RESOLVER REQUEST INTEGRITY CORRECTION

[architect-verified] Continued owner-authorized I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The MCP resolver request is now integrity-bound across the resolver call. The bridge snapshots the originally authorized `serverId`, `toolName`, and provenance-verified execution context before discovery, then rejects the capability if the resolver mutates any of those request fields. The resolved descriptor is compared against the original snapshot rather than resolver-mutated request values.

- Implementation: `8eb6bff89abd1867c3136f2dcfa32eed8b9a8751`
- Regression: `556d48320a44b546919b9da177ec74c50c89f27a`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-6 remains **IN PROGRESS — BOUNDED HARDENING**.
- **Next implementation:** continue bounded I-6 resolver/registration and capability-authorization invariant review.
- **STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, marketplace, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6 MCP RESOLVER FAIL-CLOSED CORRECTION

[architect-verified] Continued owner-authorized I-6 implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
Commits 282f80f72f1950c949a3658578d7e3b21745fd81, 689313f3e7b4ebc17f1dfbc2b4e5f89f9f86c847, and 6281348bef1fa2da08f9d795a2785aa493697610 correct the MCP bridge runtime imports, make resolver discovery fail closed when a resolved descriptor is malformed, and add focused regression coverage for invalid resolver-supplied surface policy.

**Next implementation:** continue bounded I-6 resolver/registration and capability-authorization invariant review.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, marketplace, production promotion, billing redesign, or unrelated implementation.
---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6

[architect-verified] Continue the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The MCP bridge now rejects malformed `allowedSurfaces` values fail-closed instead of silently filtering unknown surfaces. Direct MCP definitions also have their required resolution context bound in focused tests. Commits `030e905833097211adc0b69d202223c5e1f69de1` and `b307056aa67c54024bc18b010d95ca13eec9ce73`.

**Next implementation:** continue bounded I-6 source acceptance/reconciliation work, especially remaining resolver/registration edge cases and capability authorization invariants.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, production promotion, billing redesign, or unrelated implementation.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6

[architect-verified] Continue the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
`buildMcpToolDefinition()` now requires and validates a provenance-minted `PlatformExecutionContext`; an MCP capability can no longer be constructed through the direct builder without binding it to the resolution/execution context. Commits `8afb1ec8592d88108b137cd5d089ce90dd605b46` and `d7d19f397e4de2cedf56442e06245f15c83cc194`.

**Next implementation:** continue bounded I-6 source acceptance/reconciliation work, especially remaining resolver/registration edge cases and capability authorization invariants.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, production promotion, billing redesign, or unrelated implementation.

---

## CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6

[architect-verified] Continue the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest correction
The MCP bridge now requires an exact `serverId` + `toolName` allowlist pair in addition to the coarse server boundary. Independent server/tool membership can no longer authorize an unintended cross-product pairing. Implementation `37ae1f648df78cd651bd7eecec0bcce1fd3847c0`; regression `a0ac98adacadbd77d78e98cb88bd49fac49e7167`.

**Next implementation:** continue bounded I-6 source acceptance/reconciliation work, especially remaining resolver/registration edge cases and capability authorization invariants.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, production promotion, billing redesign, or unrelated implementation.

---

# NEXT_ACTION.md

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6

[architect-verified] Continue the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest implementation correction
The MCP bridge now snapshots the resolution context identity at registration time and binds the resolver invocation method, preventing post-registration mutation of the caller-owned context or resolver object from changing the executable capability. Focused regressions cover both mutation paths. Implementation `7df0e6f40d20627fffc42526269c255bb9afa8b6`; regressions `311ecc1711e2ed892d2e6a8ee93d6bba16291eca`.

**Next implementation:** continue bounded I-6 source acceptance/reconciliation work, especially remaining resolver/registration edge cases and capability authorization invariants.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, production promotion, billing redesign, or unrelated implementation.

---


## CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-08 — I-6

[architect-verified] Continue the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

### Latest correction
The MCP bridge now enforces the resolution-context identity already passed into buildMcpToolDefinition(); same-tenant/different-user execution is explicitly rejected. Implementation 2ddb3cf94cbdf0678e36276bf389b71e064a406d; regression 4093ac64c082bb6965edf0ba1479b1f8343d181c.

**Next implementation:** continue bounded I-6 source acceptance/reconciliation work.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, production promotion, billing redesign, or unrelated implementation.

---
# ACTIVE AUTHORITATIVE TRANSITION — 2026-10-08 — I-6 MCP TOOL BRIDGE ACTIVE

## 2026-10-08 — I-6 execution-context binding correction

## 2026-10-08 — I-6 malformed-capability registration hardening

[architect-verified] Source review found that a host resolver can return a structurally invalid descriptor despite the TypeScript contract. The MCP runtime builder now treats Unified Tool Runtime registration failure as capability unavailability, skipping only that malformed capability instead of creating a partially trusted path or aborting registration of unrelated allowlisted tools. A focused regression covers the malformed-schema case.

- Corrections: 9eb58ab63dc37f53642ed22dc155d93e4d0ac526, ddaa02bcf7f8aa1ea077f6cc55abcb3261604ced.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction.
- **Next bounded implementation review:** exact MCP server/tool authorization pairing and remaining resolver/registration edge cases.


[architect-verified] Source review found that a resolved MCP ToolDefinition could be invoked later with a different provenance-valid PlatformExecutionContext than the context used during resolver discovery. I-6 now binds the resolved capability to the exact resolution context identity and rejects substitution with TENANT_SCOPE_VIOLATION. Focused regressions also cover the default-off runtime builder and registration through the Unified Tool Runtime.

- Corrections: 635b5126d5b89f21076ed387a9f64f5d3248d4a0, 55e7f36c189c9e2369824f671727937389f680d1, 02bff62a4ba9f189fec63e065b4638a4f817dfb1.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction.
- **Next bounded implementation review:** exact MCP server/tool authorization pairing and remaining resolver/registration edge cases; do not add transport, persistence/OAuth, marketplace, production promotion, or unrelated scope.


[architect-verified] The owner explicitly instructed continuation of the next pending implementation and not to wait for GitHub Actions, Vercel, continuous verification, or phase gates. Repository review shows I-3 and I-4/I-5 implementation work is already present, so the active bounded capability is I-6.

## Current boundary
- I-2: implementation-complete; external verification deferred.
- I-3: implementation-complete; external verification deferred.
- I-4: implementation-complete.
- I-5: implementation-complete, Firecrawl search default-off.
- I-6: active — bounded MCP Tool Bridge.

## Next implementation
1. Continue the remaining bounded I-6 source-level acceptance review from the current implementation tip.
2. Preserve the new mutation-proof binding snapshot and collision fail-closed invariants.
3. Keep the bridge host-adapter-driven, exact-allowlisted, default-off, context-preserving, and Unified Tool Runtime-backed.
4. Keep resolver discovery failure, identity drift, invalid context, invalid input, and unauthorized server/tool paths fail-closed.
5. Do not add MCP transport/server hosting, persistence/OAuth, marketplace, billing changes, production promotion, or unrelated work.
6. External CI/Vercel/Gate-C/Gate-D remain deferred and are not development blockers.

## 2026-10-08 — I-6 binding-hardening checkpoint

[architect-verified] Source review found a P1 mutation-boundary defect in the MCP bridge: caller-owned policy arrays and descriptor objects remained live inside the executable closure. The bridge now snapshots/freeze-binds those values, and the runtime builder refuses distinct MCP identities that collide on one normalized tool name instead of silently skipping the later capability.

- Corrections: ff64b9b95e11e90f078646379a322d28e589e700; 12815df1d0caa27da3937fd7a9d7abba4411c434.
- Regression: d90cddbe1b90e2b00d1c3f6a49e844a670d5a548.
- I-089 is RESOLVED by architect source review.
- Executable tests, CI, Vercel, Gate-C, and Gate-D remain deferred by owner instruction.

---
---
# ACTIVE AUTHORITATIVE TRANSITION — 2026-10-08 — I-4/I-5 IMPLEMENTATION COMPLETE

[architect-verified] I-4/I-5 source implementation is complete under the explicit owner instruction to continue without waiting for external gates.

## Final implementation state

- I-4 Unified Tool Runtime bridge: COMPLETE.
- I-5 Firecrawl `search` first-provider pilot: COMPLETE.
- I-2/I-3 external verification: DEFERRED, not PASS.
- Z.AI: STOPPED; ChatGPT implementation owner.
- Latest corrections: `19edcda`, `3f9479c`, `ab9a262`, `ee4103a`, `2b7ea16`.

## Next action

No further I-4/I-5 implementation remains within the authorized scope. If development is to continue, a new bounded phase/authorization must define the next capability. MCP expansion and broad provider rollout remain outside the current authorization.

External CI/Vercel/Gate-C/Gate-D evidence remains deferred and must not be represented as PASS.

---

# ACTIVE AUTHORITATIVE TRANSITION — 2026-10-08 — I-4/I-5 AUTHORIZED

[architect-verified] Owner instruction explicitly authorizes ChatGPT to continue implementation through **I-4 Unified Tool Runtime bridge** and **I-5 First Provider Pilot**, without waiting for CI, Vercel, Gate-C, Gate-D, or continuous verification.

## Current implementation boundary

- I-2: implementation-complete; external verification deferred.
- I-3: prerequisite Action Runner implementation completed for continuation; external verification deferred.
- I-4: connected integration actions -> Clara `ToolDefinition` -> Unified Tool Runtime -> existing `runAction()`.
- I-5: Firecrawl `search` only, default-off, exact allowlist.
- No MCP, broad provider rollout, production promotion, billing changes, or unrelated work.

## Completed source increments
- `f44caf5` — initial I-4 bridge.
- `a86ffd5` — direct runtime-contract binding.
- `6be5dd5` — public platform-core export.
- `9d746ed` — canonical action-definition builder.
- `8927e2c` — focused I-4/I-5 boundary regressions.
- `829667e` / `b5f9640` / `92c611a` — default-off Firecrawl pilot and exports.

## Next implementation
1. Reconcile the active phase/control records to this owner-authorized I-4/I-5 boundary.
2. Finish source-level integration of the bridge/pilot into the Clara runtime surface without introducing a parallel executor.
3. Add/retain focused regressions for deterministic naming, schema enforcement, tenant/connection readiness, pilot allowlisting and flag-off behavior.
4. Update session/worklog evidence.
5. Do not wait for external CI/Vercel/gates; they remain deferred evidence.

# ACTIVE AUTHORITATIVE TRANSITION — 2026-10-08 — I-3 AUTHORIZED

[architect-verified] The owner has explicitly authorized advancing implementation to **Integrations Framework I-3 — Action Runner**, while I-2 external verification remains deliberately deferred. This is not an I-2 Gate-C/Gate-D PASS and not a production promotion.

- I-2 application implementation is treated as complete for implementation purposes; executable/current-head verification remains deferred by owner instruction.
- I-3 remains restricted to bounded action execution, strict input validation, host egress/SSRF enforcement, deterministic error normalization, redacted tracing, and tenant-isolation regression coverage.
- I-4 Tool Runtime bridge, I-5 provider rollout, MCP, production promotion, and unrelated work remain out of scope.
- Latest I-3 continuation commits: `57f5fd9e22904eee39759a8c06891e73fc8fd513`
- Latest I-3 continuation commits now include `d3c18c3669555f062dd0fae3613cdb9d39ef79ba` and `62ef2fea18c93225dbc2815cbde67f1da72af621`, which make action-lookup and strict-input failures explicit typed runner results and add regressions for deterministic propagation., `99a574e60efd217463628eaa26369c6d515cdfb7`, `9e921b24a53d00fb14287db9a7e274fdf376da8b`, `ef1044273b5fcc143585ddb5fb682dceb08be1b8`, `70ba919fede3c0652a9ced5d6feee88e5119fcbb`, `5b839525bd46de4cc9d07834970e351c2ac2e06e`.
- These corrections keep egress/DNS/redirect failures
- Latest I-3 continuation also includes `d0799b370801d1b1319910876f7053e41d92f66d` and `c764fa4bea306fee7f5447ca8e025ec4c2a330d2`, which scrub known secret values from arbitrary fetch errors before trace emission and add a focused regression. on the host-owned typed error contract, record redacted trace entries for blocked outbound attempts, and validate array item schemas recursively in strict action-input mode.
- External CI/Vercel execution is not awaited.

- Runner correction: `77b806f65d002b53bb6a7d04294ec0164dc392d5` now preserves the per-run redacted HTTP trace collection in failed `RunActionResult` responses, so failure results retain deterministic trace evidence instead of dropping it.

- I-3 strict-schema correction: `6db1b45e0213bba4b53a2675c328bad0f7bdcb7c` rejects null/empty/wrong-typed array elements instead of treating them as optional missing fields; regression `d12d43509463eedeba712b1b657c04cecb8475bb` covers primitive array items.
- I-3 trace correction: `f4c827749065f679d1f79bcdace581f1c5e15903` prevents redirect failures from being recorded twice; regression `8cd183ed2601ac4af43fdba84661fb05f87b5924` asserts one deterministic trace entry.
**Current next implementation:** continue bounded I-3 acceptance review, focusing on remaining deterministic result propagation, strict schema edge cases, redirect/egress boundary coverage, redacted trace invariants, and tenant-isolation regression coverage.

---

## 2026-10-08 — Agent-scoped integration disconnect authorization correction

[architect-verified] Continued bounded I-2 authorization review found that the prior agent-scoped permission correction ran only after the `disconnect` branch, so an `agentId` supplied to disconnect could reach the database under organisation-level permission alone. The route now imports and applies `requireAgentPermission(auth, agentId, "config:update")` before all agent-scoped enable/connect/disconnect mutations, retaining the organisation identity check. This also corrects the missing RBAC import introduced by the prior correction.

- Correction: `8512d960fc7a53beb60849f6823fe9ac7d0834f3`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, authorization, custom-action, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-08 — Agent-scoped integration mutation authorization correction

[architect-verified] Bounded I-2 authorization review found the organisation integration mutation route accepted an optional `agentId` while checking only organisation-level `config:update`. That allowed an organisation member with the org permission to target an agent without an explicit agent-level permission check. Agent-scoped enable/connect/disconnect mutations now require `requireAgentPermission(auth, agentId, "config:update")` and retain the organisation identity check before database mutation.

- Correction: `7b5bed88519884278fa8863d5878ece8d2fc3875`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, authorization, custom-action, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-08 — Integration disconnect tenant/user-scope correction

[architect-verified] Bounded I-2 source review found the organisation integration disconnect mutation could delete every connection for an integration across the organisation when no agentId was supplied. Because connection rows carry user ownership, an org-level configuration request must not implicitly delete another user's credential-bearing connection. The delete is now constrained to the requesting user (while retaining explicitly shared org connections with NULL user_id) and the optional agent scope.

- Correction: `ef9978245c09c980e37f9208e708695508d13ee6`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, authorization, custom-action, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — Credential-vault contract coverage alignment

[architect-verified] Bounded source review found the credential-vault focused test contract had remained on the older unscoped `updateStatus()` SQL shape after the I-2 credential lifecycle hardening. The test fixture is now aligned with the current scoped status-transition contract and the newly introduced optimistic `claimed_at` refresh-write guard. This is verification-support maintenance only; no test execution was performed.

- Correction: `eec6767268c6d2b78f96daabb5180c094741aa61`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 implementation/support corrections if identified. Do not wait for CI/Vercel/gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — OAuth concurrent-refresh stale-write correction

[architect-verified] Continued the bounded I-2 credential/connection review. The OAuth refresh path already failed closed on disabled/disconnected connections, but concurrent refreshes could still both read the same pre-refresh credential state and a later stale refresh could overwrite a newer rotated token. The credential vault now supports an optional expectedClaimedAt compare-and-update predicate over the encrypted credential JSON; the refresh path supplies the timestamp it actually refreshed from. A stale concurrent writer therefore updates zero rows and the runner aborts rather than overwriting newer credentials.

- Credential-vault correction: `0ef4a40038c8fc8059b09980c2ffc830f45c1c72`
- Refresh-path correction: `03b4b46dbef176fd8acaa2cbe7061e8cdd313848`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified. Do not wait for CI/Vercel/gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — Optional multilingual embeddings resource containment correction

[architect-verified] Bounded self-hosted resource-hardening review found the opt-in multilingual embeddings service was the remaining Compose service without explicit CPU/RAM/PID ceilings. Although it is not started by the normal deployment script, enabling the profile could bypass the host resource-containment policy while loading the multi-GB embedding model.

- Correction: `18ce0d907ab32969ff3259a6c933a5ebc83134b4`.
- `docker-compose.yml` now caps embeddings at 2 CPU, 4096 MiB memory, and 512 PIDs, with a 2048 MiB memory reservation and matching swap ceiling.
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; this is deployment/resource hardening within the existing bounded scope.
- **Next planned work:** continue only concrete bounded I-2/deployment resource-control corrections if identified; otherwise remain at the I-2 boundary. Do not wait for CI, Vercel, or gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — Self-hosted resource containment + Vercel manual-only deployment

[architect-verified] Owner-directed deployment hardening was applied after Clara Docker deployments were observed making the Linux home server/VPS unreachable under resource pressure. The root cause was not one runaway runtime container alone: backend and worker builds could contend concurrently for CPU/RAM/disk, while the runtime stack had no explicit container CPU/RAM/PID ceilings. The stack now has explicit runtime limits, worker concurrency defaults are reduced to 1/1, and `scripts/vps-deploy.sh` builds backend, worker, and RabbitMQ bridge serially before starting services. This prevents Docker image creation from competing across heavyweight targets and prevents a runtime service from consuming the whole host.

- Runtime ceilings are intentionally conservative and can be raised per host only after observing stable resource usage.
- Multilingual embeddings remains opt-in via its existing Compose profile and is not started by the normal deployment script.
- `vercel.json` now sets `git.deploymentEnabled: false`; GitHub Actions already has only `workflow_dispatch`. Vercel automatic Git deployments are therefore disabled by repository configuration, while manual CLI/API deployment remains the intended path. Vercel's current Hobby plan does not expose the higher-level deployment-policy API, so no unsupported dashboard policy mutation is claimed.
- The Vercel config provenance check was updated to the new file blob SHA so the manual CI workflow remains internally consistent.
- This is deployment/resource hardening only. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; no Gate-C/D PASS is inferred.

**Self-hosted deployment:** use `bash scripts/vps-deploy.sh`, not `docker compose up -d --build`. The latter can reintroduce concurrent heavy builds on small hosts.

**Vercel deployment:** use an explicit manual deployment from the linked local checkout, for example `vercel --prod`, after linking the checkout to `clara-backend`. Do not rely on Git push to deploy.

**STOP:** no I-3, MCP expansion, production promotion through Git automation, or unrelated implementation.


## 2026-10-07 — Docker build dependency-stage performance correction

[architect-verified] Local Docker Compose build telemetry showed the backend and worker each executing a full `npm ci` concurrently from separate Dockerfiles. Both dependency stages consumed about 3408 seconds (~56m48s), while the RabbitMQ bridge image export/unpack consumed about 597 seconds (~10m) under the resulting host resource pressure. The root cause was duplicated installation of the large Activepieces dependency graph plus concurrent CPU/RAM/network contention.

- The bounded Docker correction moves backend and worker to one multi-stage `Dockerfile` with a shared `deps` stage and BuildKit npm cache.
- `docker-compose.yml` now builds `clara-worker` from the same Dockerfile using the `worker` target; the duplicate `Dockerfile.worker` is removed.
- This is build-system/resource hardening only; I-2 remains **IMPLEMENTED — VERIFICATION PENDING** and no Gate-C/D PASS is inferred from the source change.
- Required next evidence: rerun the local Compose build and capture elapsed time/resource behavior, then continue the existing Gate-C executable verification sequence.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 egress regression coverage: hexadecimal IPv4-mapped IPv6

[architect-verified] Continued the bounded I-2 security review without waiting for GitHub Actions or Vercel. The egress guard already decoded hexadecimal IPv4-mapped IPv6 destinations; the regression suite now explicitly covers ::ffff:7f00:1 so that loopback encoded in hexadecimal cannot regress into an SSRF bypass.

- Regression: e8403571572995d34053f2245b3c09c9cab28fa0
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; this is bounded verification-support work, not phase closure.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-073 OAuth refresh endpoint integrity correction

[architect-verified] Bounded I-2 source review found that OAuth refresh used the connection-stored `token_url` as the credential-bearing destination even though the registry already defines the authoritative OAuth token endpoint. The runner now receives `def.oauth2Config?.tokenUrl`, rejects mismatched stored metadata, and constructs the refresh URL from the registry value.

- Implementation: `59957d4ea03dfb89f8a90c9976322aae86821e73`, `6b781ed042003bd62f056d35b9f5952176b5cb73`
- Regression: `db0284111f94955c038e60bbb62fc59068d208a4`
- I-073: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-072 connection auth-type authority correction

[architect-verified] Bounded I-2 source review found organisation connection creation persisted caller-supplied `authType`, allowing stored connection metadata to diverge from the registry contract. The correction always persists the authoritative registry `def.authType`, with focused conflicting-input regression coverage.

- Implementation: `879e3cbcc98392a48fe8e461255460f8d0e06c4b`
- Regression: `be01ab6ac2d97cf36c6400ef43d121c9c8699902`
- I-072: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-071 custom integration error-body hardening

[architect-verified] Bounded I-2 source review found raw provider response bodies being appended to credential-bearing custom ElevenLabs TTS/STT and Supabase PostgREST errors. The correction removes provider response-body propagation and adds focused regression coverage.

- Implementation: `9c1a838c54cf036f67ac05810b3b6bea0b1f9799`
- Regression: `0d1494ea8686c3186589cf657a8dc361d3443af4`
- I-071: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-067 IPv4-mapped IPv6 egress correction

[architect-verified] Bounded I-2 source review identified an SSRF bypass in the host egress policy: IPv4-mapped IPv6 literals encoded with the final IPv4 address as hexadecimal (for example `::ffff:7f00:1`) were treated as IPv6 and could bypass the private IPv4 ranges. The egress guard now decodes both dotted-decimal and hexadecimal IPv4-mapped forms before applying the IPv4 deny ranges.

- Implementation: `8d176739784d2d510f20d242b533a7383ac5de98`.
- Regression coverage: `ee76381b577f5ffdeb658f4ccdc9b7dd27653cc0`.
- I-067: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-064 AI integration-tool plan-resolution fail-closed correction

[architect-verified] Source review found that the AI-visible integration_action and integration_availability tools still used the UI-oriented plan helper, which can fall back to free-plan limits when authoritative plan resolution fails. The bounded correction switches both capability boundaries to resolveOrgPlanLimits: execution denies with PLAN_NOT_ENTITLED on resolution failure, while availability returns no capabilities without querying integration state. Corrections: 0f5c2ad1372be0c60ed72b11863b9aad8e48fda6, f394054afa6aa92e8c33ef5dbf7bb0554bf18730, c857a8777f0a9f6ea7f535734966b1d2546d1ca8, 305f59663e83ab8deea910b350c746c2af1420b6. I-064: RESOLVED by architect source review. Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection, custom-action, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-074 execution-authorization source newline correction

[architect-verified] Bounded I-2 source review found literal \\n escape text embedded inside the fail-closed execution authorization block. The intended plan-resolution handling and tenant/agent checks were present, but the literal escapes could collapse statements into a single comment line and corrupt TypeScript source structure.

- Correction: `c6240da3ea64869ce4f49dafa4583cd9b626af88`
- Scope: `src/modules/integrations/runtime/execution-authorization.ts` only.
- I-074: RESOLVED by source correction.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-075 Activepieces package action allowlist enforcement

[architect-verified] Bounded I-2 source review found that runAction could execute an action exposed by the installed Activepieces package even when that action was absent from Clara's reviewed registry def.actions allowlist. This created capability expansion on upstream package updates. The runner now rejects non-registry piece actions before piece loading; Clara-owned custom actions remain explicitly allowed.

- Implementation: c1705ac81c4e77239feca6d518d3ef2afcd0403c
- Regression: 3d41bdc09e125b3143bfb58ddf162b00bd335c8b
- I-075: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

# NEXT_ACTION.md

## 2026-10-08 — I-3 typed runner error boundary hardening

[architect-verified] Continued bounded I-3 Action Runner review found that deterministic classification still depended primarily on matching provider/error message text. The runner now has a host-owned `IntegrationRunnerError` with explicit `IntegrationErrorCode` and retryability, and the core runner plus egress policy use typed classifications for key boundary failures. Legacy/provider errors retain conservative compatibility heuristics. A focused regression verifies explicit classifications take precedence over misleading provider wording.

- Corrections: `6deba78a0ce6a167bb3004164cb0bea8a84c4153`, `3128347169fc107d444bb6b5d5004cdd26a6c9b9`, `2a867bff3b3a19a68d40ad16a9a90fa9f590eef3`, `3a93d4b371b12e966effc80c9a73fc73480fd8ee`.
- Scope: I-3 Action Runner error contract, egress failure classification, and focused regression only.
- No CI, Vercel, Gate-C, Gate-D, or continuous verification was awaited.
- I-2 remains implementation-complete with external verification deferred; I-3 remains the active implementation phase.

**Next implementation:** continue bounded I-3 acceptance review for remaining action-runner gaps, especially strict input-schema coverage, egress/redirect boundaries, redacted trace invariants, deterministic result propagation, and tenant-isolation regression coverage.

**STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

 — Fresh-Session Continuation Instruction

## 2026-10-06 — I-066 plan-resolution fail-closed mutation correction

[architect-verified] Source review found two remaining I-2 mutation authorization paths using fallback-capable `getOrgPlanLimits()`: organisation enable/connect and agent integration enable. The bounded correction switches both to authoritative `resolveOrgPlanLimits()`; a resolution failure now returns 503 instead of evaluating entitlement against synthetic free-plan limits.

- I-066: RESOLVED by architect source review.
- Implementation: `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98`.
- Regressions: `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.



## 2026-10-06 — I-065 OAuth expiry disable-race correction

[architect-verified] Source review found a remaining I-2 state-transition race: credential-vault `updateStatus()` could change a connection from an explicit `disabled` state to `expired` during concurrent OAuth expiry cleanup. Commit `c3ecd5d72940a2e8af4a53266e368c9d9e3dc8f7` now updates status only when the connection is still active; regression `ac162b6ce439861c0c2ac9a2650971cd79411ef7` covers the active-state predicate.

- I-065: RESOLVED by architect source review.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Do not wait for GitHub Actions or Vercel. After source review is exhausted, obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.



## 2026-10-06 — I-063 Supabase Management fallback authorization correction

[architect-verified] Source review found that supabase.execute_sql unconditionally required the separate supabase-mgmt integration authorization before even determining whether a Management connection existed. That contradicted the implemented action contract, which explicitly supports a service-role/PostgREST fallback when Management OAuth is unavailable. The bounded correction adds a tenant/user/agent-scoped active-connection existence check that does not decrypt credentials; only when a Management connection exists does the action re-check supabase-mgmt authorization and read its credential. A focused regression verifies the service-key fallback does not read the Management credential or invoke the Management authorization boundary.

- Implementation: 6719be8; aa99287
- Regression: 457b07d
- I-063: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection, custom-action, egress, secret, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

> Canonical continuation instruction. Snapshot: **2026-10-06 — Integrations I-2 implemented; verification pending.** GitHub repository state is authoritative. Current feature tip: **read from GitHub at recovery time; do not duplicate a mutable SHA here**.

## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] Source review found that Activepieces cross-integration credential lookup could bypass the I-054 execution authorization boundary. `DoableConnectionsManager.get()` now re-checks platform enablement, current plan entitlement, organisation grant, explicit agent scope, and tenant ownership before reading another integration's credentials.

- Implementation: `3a17c31cb16bfa54cb79a48a13a757ae16486971`
- Regression: `4f86976b505487906d18e526b6433be360e97a8b`
- I-055: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-056 execution authorization fail-closed correction

[architect-verified] Source review found that the I-2 execution authorization boundary called the UI-oriented `getOrgPlanLimits()` helper, which converts plan-resolution/database failures into free-plan limits. That fallback could allow an integration permitted to the free plan to execute without proving the organisation's actual entitlement. The bounded correction now calls `resolveOrgPlanLimits()` directly and denies execution when entitlement resolution fails.

- Implementation: `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`; type correction: `9ac86755c94132a86afbde804a7ca3b927e0e83b`
- Regression: `220d1a66fe7279bb55296d31d5f9d5c3133b78ef`
- I-056: RESOLVED by architect source review.
- Next bounded work: continue I-2 credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-061 custom Supabase Management credential authorization correction

[architect-verified] Source review found that the custom `supabase.execute_sql` action directly read the `supabase-mgmt` credential after the outer `supabase` execution authorization, bypassing the separate `supabase-mgmt` platform/plan/organisation/agent authorization boundary. The bounded correction now re-authorizes `supabase-mgmt` before reading its credential and adds a denial-before-read regression.

- Implementation: `5f6d044a2ec1d8ddacaf9bde553f17576c14732e`
- Regression: `3ebbbf7113e851a427d310aee2d3a057a6b8ba83`
- I-061: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-062 Supabase Management error-body boundary

[architect-verified] Source review found that the custom `supabase.execute_sql` action read a secondary `supabase-mgmt` bearer credential correctly scoped to the executing agent, but included the Management API provider response body in its thrown error. Because that secondary credential is resolved inside the custom action, the outer runner's known-secret collection did not necessarily contain it. The bounded correction now reports only the HTTP status and adds a focused regression proving a sentinel Management token cannot enter the thrown error.

- Implementation: `40c410f8ee4542f44156c5fdf20fc7d21ff73004`
- Regression: `eec44f0e478fc2eafe4302d7b857428369f1f43c`
- I-062: RESOLVED by architect source review.
- Next bounded work: continue I-2 credential/connection, custom-action, egress, secret, and tenant-boundary review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## CURRENT AUTHORITATIVE ACTION

## 2026-10-06 — I-050 AI availability tenant-binding correction

[architect-verified] Source review found that the AI-visible integration availability query filtered agent grants by agent identity but did not verify that the agent belongs to the execution tenant. The bounded correction now joins `agents` and requires `a.org_id = context.tenantId` before exposing integration capabilities.

- Implementation: `c9f71d7e776e0127d587d08e03132579c5ac9fad`
- Regression: `c122dfab4a1deee1d3b40614cc8cb993f7812d56`
- I-050: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-049 atomic integration mutation correction

[architect-verified] The next bounded I-2 source correction closed a concurrency/partial-mutation defect in organisation integration enable/connect. `withTransaction()` now covers the entitlement count and mutation, and a transaction-scoped advisory lock serializes per-organisation integration-slot changes. Direct connect no longer leaves an enabled organisation grant behind if connection persistence fails.

- Implementation commits: `0f55d11dfc612b293fcf9046cb6d99c25451cdf9`, `cd35659c8b286dd89d6ba325307ce734cfe0b2dc`
- Regression: `ccd1fb2d7ba0b06d1ebace779aea7854e9e034df`
- I-049: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-048 auth-type authority correction

[architect-verified] Source review found that runAction selected OAuth token-refresh behavior from the stored connection auth_type, while the connection API accepts authType input. Commit 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126 now uses the authoritative integration registry def.authType for ensureTokenFresh, preventing a mismatched connection field from suppressing OAuth refresh. I-048 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-047 owner continuation: direct-connection plan-limit correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review found that organisation-level connect could implicitly enable a previously-disabled integration without enforcing max_integrations. The bounded correction is committed at 846c8d39add3430a5014c5573b3cc4d5ad86ee37 with focused regression coverage 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is resolved by architect source review.

**Next bounded work:** continue source-level I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review without waiting for GitHub Actions or Vercel. Then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


**I-2 is the active bounded work.** The repository already contains the I-2 implementation. The immediate job is verification and security correction only.

1. Obtain executable dependency/lock synchronization plus current-head build/test/typecheck/lint evidence.
2. Re-run the focused runtime redaction/store-isolation tests and integration registry/control-plane suites in that executable environment.
3. Use the already-verified 060/061/062 database state as Gate-E evidence; do not re-run migrations merely to manufacture evidence unless a clean-install verification is explicitly required.
4. Perform a bounded real connector/OAuth smoke where valid provider credentials/configuration are available, then browser-verify platform → organisation → agent access and denial paths.
5. Re-run immutable-source, runtime-import, secret and governance gates.
6. Perform I-2 Gate-D review. Only an explicit ChatGPT PASS closes I-2.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

---

## 2026-10-06 — I-2 owner continuation: redirect egress hardening

I-2 remains the active bounded work. A second security correction was implemented without waiting for GitHub Actions or Vercel: the generic integration HTTP runner no longer follows redirects implicitly, preventing an unchecked 3xx Location from bypassing the host egress/SSRF boundary. I-036 is resolved by source review; focused regression coverage was added. Executable Gate-C evidence remains pending.

- Runner correction: `e2a9131d04d567a79c3f3531e1cff63b60d5a81d`
- Regression tests: `452a998076fef63e97f08c804b9ab6e216daa7f6`
- I-036: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/corrections only; do not expand to I-3/MCP/production.

## 2026-10-06 — I-2 owner continuation: trace-redaction hardening

I-2 remains the active bounded work. A concrete security correction was implemented without waiting for GitHub Actions or Vercel: trace payloads are now fully redacted before truncation, closing the late-field credential exposure found as I-035.

- Implementation: `f6b9f5f89a476743e48610b5dcc4d8d678ff6366`
- Regression test: `710565d1de3aa0a9bd96ea651f2c0be8ff7eaa1c`
- I-035: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/corrections; do not expand to I-3/MCP/production.
## 2026-10-06 — I-2 owner continuation: action-context scope hardening

I-2 remains the active bounded work. A source audit after the I-037 runner credential-scope correction found the same project/agent conflation inside the Activepieces action context: store and cross-integration connection-manager adapters were still receiving projectId. This was corrected without waiting for CI/Vercel.

- Context correction: a5680cd51c6d9ca961ab93effd20fb069d0e2bbe
- Runner propagation: f3bd397dbbc7c0ddb8674b8b3c97358be8fa8a11
- Regression test: 550b751b745d7a8a4a52854edc1cc328d7c891b2
- I-040: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/security review only; do not expand to I-3/MCP/production.

## Read this first

Read, in order:
1. `docs/project-control/PROJECT_STATE.md`
2. `docs/project-control/CURRENT_PHASE.md`
3. `docs/project-control/VERIFICATION_STATE.md` — **current I-2 verification record**
4. `docs/project-control/ISSUES.md`
5. `docs/project-control/DECISIONS.md` — **D-032 and current I-2 decisions**
6. `docs/superpowers/plans/2026-10-05-clara-integrations-framework.md`
7. `docs/project-control/sessions/SESSION-033.md` and later I-2 verification/correction records

**Important:** the I-1 material below is historical checkpoint prose. It is **not** the active authorization. The active work is I-2 verification/correction under D-032.

## Historical I-1 record — non-authoritative

## Active work

**Integrations Framework — I-1: host-neutral contract/test foundation.**

D-031 authorizes only:
- `src/modules/ai-platform-core/integrations/**` contract/type definitions, pure validation helpers, tests, and exports;
- threat-model/test-boundary work necessary to validate the contract.

Forbidden until separately authorized:
- database/schema/migrations;
- OAuth routes/token exchange;
- credential-vault implementation;
- Activepieces runtime/dependencies;
- outbound HTTP/egress execution;
- integration tool execution;
- deployment;
- changes to D-023 billing semantics.

## Current checkpoint

- Implementation foundation exists.
- A contract hardening correction was applied after architect review: generic connection metadata and generic error-details bags were removed from the reusable boundary; connection-store/credential-vault APIs now identify concrete connection IDs.
- Focused I-1 CI verification has been added for Vitest, strict TypeScript, and ESLint.
- **Verification is still PENDING** because no GitHub Actions run is currently exposed through the connected GitHub integration for the feature head.
- No PASS is claimed for I-1.
- I-2 and all later integration work remain unauthorized.

## Next bounded action

1. Obtain executable I-1 verification from the repository's CI/Actions surface.
2. Re-run the focused contract tests, strict typecheck, and lint.
3. Re-check immutable-source integrity, runtime import boundary, secret scan, and scope.
4. Perform the architect Gate-D review of the exact verified commit.
5. If all required gates pass, record I-1 closure and issue the next explicit authorization boundary. Otherwise record the blocking finding and correct only within D-031 scope.

**Stopping boundary:** do not implement I-2, OAuth, persistence, credential storage, egress execution, integration actions, or deployment until ChatGPT explicitly authorizes the next bounded sub-phase.

## 2026-10-05 — I-1 correction checkpoint

The I-1 contract/test correction is complete at `bfc40f671aea218def571c617f00789e15b45823`. I-018 is RESOLVED by architect review.

**Next bounded action:** obtain executable CI evidence for the exact current head, then re-run the final I-1 Gate-D closure review. Until that evidence exists, I-1 remains open.

No I-2, OAuth transport, persistence, credential storage, egress execution, integration action runtime, deployment, or billing changes are authorized.


## Current next action — post Phase 7-C closure (2026-10-05)

Phase 7-C is **PASS — CLOSED**. Do not reopen or extend the bounded provider tool-calling/agentic-loop pilot without a new authorization. The next work item is an explicit project-owner decision, not automatic implementation: triage I-014, resolve pending D-P2/D-P4 decisions if needed, or authorize a separately scoped future phase. I-015 is resolved for the dependency/lockfile/environment condition. D-023 remains binding; first-class billable tool metering, MCP, integrations, deployment, and Phase 8 remain unauthorized unless separately authorized.

**STOP boundary:** no additional application implementation is inferred from the Phase 7-C closure.

## 2026-10-05 — Docker build-boundary correction checkpoint

A user-provided Docker build exposed I-019: Next.js type-checking traversed the immutable Doable reference tree and failed on its reference-only `@e965/xlsx` import. ChatGPT corrected the TypeScript inclusion boundary in `tsconfig.json` and `tsconfig.typecheck.json`, excluding only `ai-platform-core/**` and `clara-core/**` reference snapshots.

**Next bounded action:** execute the production build from the current feature head (`docker compose up -d --build` or equivalent CI `npm run build`). If the build passes, close I-019 with evidence; if it fails, correct only the newly evidenced build blocker without modifying immutable/reference material.

No reference-only dependency should be added merely to make the application build traverse an immutable snapshot.


## Current next action — 2026-10-05 — executable verification and browser readiness

The user-directed RBAC/UI continuation is implemented. Do not add more feature scope until verification catches up.

1. Execute the current-head focused I-1 contract tests, strict TypeScript, and ESLint in CI or the project build environment.
2. Execute the production build (`docker compose up -d --build` or equivalent) to close or correct I-019 after the reference-tree TypeScript exclusion.
3. Re-run immutable-source, runtime-import, secret, and governance checks at the exact verified head.
4. Browser-verify `/ai-platform` as a platform-admin surface and verify tenant-role navigation/redirect behavior.
5. Complete I-1 Gate-D closure review only after Gate C evidence exists; then issue the next explicit authorization if required.

**Stopping boundary:** no I-2 integration runtime, OAuth, persistence, credential vault, egress, integration action execution, MCP runtime, or deployment/promotion is authorized merely because the UI exists.


## 2026-10-05 — Current executable verification / browser readiness checkpoint

The requested UI/RBAC/subscription continuation is implemented. Role-aware navigation, agent workspace UI, team role management, live usage meters, Billing & Plan, and explicit entitlement visibility are present. A UI correction prevents project managers from being offered elevated organisation-role grants. Server-side authorization remains authoritative.

A concrete build dependency drift was corrected: package.json already declared @e965/xlsx 0.20.3, while package-lock.json lacked the corresponding package entry. The lock entry was added without modifying immutable/reference material. I-021 records this as CORRECTED — executable build pending.

Vercel clara-backend ignored-build-step was cleared to allow the feature branch to produce a preview on the next pushed commit. No production promotion is performed.

Next bounded verification: execute the current-head production build, current-head focused I-1 tests/typecheck/lint, immutable/runtime-import/secret/governance checks, then browser-verify /ai-platform plus role/redirect and plan-limit behavior. Do not extend into I-2 runtime, OAuth, persistence, egress, MCP, or unrelated deployment work.


## 2026-10-05 — Current RBAC/UI/build checkpoint

The requested role/permission and subscription UI work is implemented on the current feature head. Final source review corrected the least-privilege boundary: organisation admins may assign any defined organisation role; project managers may only grant/manage Editor and Viewer access; self-role changes are rejected. Server-side RBAC remains authoritative.

`@e965/xlsx@0.20.3` is now declared in the application manifest and synchronized in the lockfile. The immutable/reference trees were not changed. The user-provided Docker failure is therefore corrected at the application dependency boundary, but executable build evidence is still required.

**Pending:** current-head production build, current-head CI evidence, browser verification of `/ai-platform` and role/redirect/plan-limit behavior, and final I-1 Gate-D review. No I-2 runtime, OAuth, persistence, egress, MCP runtime, or production promotion is authorized.

## 2026-10-05 — Owner execution checkpoint
Current bounded work is verification, not feature expansion. Completed: UI/RBAC/subscription implementation and production Docker-build CI instrumentation. Pending: (1) executable current-head Docker build, (2) executable I-1 focused Gate-C evidence, (3) browser verification through draft preview PR #266 or equivalent local environment, and (4) final I-1 Gate-D review. Do not start I-2 runtime/OAuth/persistence/egress/MCP work or merge the preview PR as part of this checkpoint.


## UI/RBAC/Subcription checkpoint — 2026-10-05
Completed in current continuation:
- role-aware organisation navigation and direct-route guard;
- role capability contract tests;
- current versioned subscription-plan API wired into admin Plans UI;
- TTS/STT/translation daily limits exposed and persisted in plan versions;
- plan-guard fallback fixed for those limits.

Still pending before Phase 7-C closure:
1. Fresh CI run for the new UI verification job and changed subscription surfaces.
2. Reproduce immutable-source/library-integrity/secret/runtime-boundary closure gates.
3. Fresh-context review of all governance documents and compare against the Phase 7 authorization boundary.
4. Decide and record the repository-wide typecheck/lint baseline disposition; do not modify immutable/reference material merely to make global gates green.
5. Only after all closure evidence passes, perform the governance-only Phase 7-C closure update.

- Latest UI/billing changes are implemented. Pending work is verification-only: fresh CI, immutable/library/secret/runtime gates, then final Phase 7-C closure review.


## 2026-10-05 — Current owner checkpoint

The requested UI/RBAC/subscription implementation is complete. The Members UI role-assignment correction is committed; org_admin can assign all defined roles, while project_manager remains least-privilege constrained. Billing & Plan is enabled with live usage/limits and entitlement visibility.

**Pending only:** executable current-head CI/production-build evidence and browser verification. Vercel preview evidence is temporarily blocked by the provider daily deployment quota; do not use the older cancelled preview as current-head evidence. No I-2 integration runtime, OAuth, persistence, egress, MCP runtime, production promotion, or Phase 8 work is authorized.


## 2026-10-05 — Integrations I-2 implementation checkpoint

I-2 is IMPLEMENTED — VERIFICATION PENDING under D-032.

Next bounded actions:
1. Run npm install --legacy-peer-deps in the executable build environment to synchronize the 529 Doable Activepieces package dependencies and lockfile.
2. Execute the 052 integration migration and verify platform/org/agent connection persistence plus pgcrypto encryption.
3. Run registry tests and strict typecheck/lint for the integration runtime, API, AI tools, and UI.
4. Configure/test at least one real connector action using an organization/agent connection.
5. Browser-verify platform admin → organisation → agent integration access and denial paths.
6. Re-run immutable-source, secret, runtime-import, and governance checks, then perform I-2 Gate-D review.

Stopping boundary: no production promotion or claim of complete integrations until the above evidence exists.


## 2026-10-05 — I-2 database verification checkpoint

Current HEAD: `1ed4490e6266a6c52a4a307007c5c468714f9619`.

Completed: migrations 052, corrected 061, and 062 executed and verified; pgcrypto operational; I-2 agent/org constraints verified; six I-2 integration tables RLS-enabled and anon/authenticated access revoked.

Still required: executable npm/build/test/typecheck/lint evidence; focused runtime/API tests; real connector and OAuth smoke; current-head browser verification; immutable/runtime/secret/governance scans; final ChatGPT Gate-D review.

GitHub Actions current-head run 37301575945 failed without usable step logs, so no CI PASS is inferred.

STOP: no I-3/MCP expansion, production promotion, or unrelated work.
\n\n## 2026-10-05 — I-2 migration sequencing correction\n\nCompleted a bounded build-blocker correction: the integration control-plane migration was moved from the colliding 052 sequence to 060, while the pre-existing Sarvam 060 migration was moved to 064 so the integration sequence remains 060 → 061 → 062. Repository enumeration now reports no duplicate migration numbers.\n\nNext verification remains executable only: run the exact CI/build/test/typecheck/lint commands in an execution-capable environment, then perform connector/OAuth/browser/security/governance verification. No I-2 PASS is claimed until those gates execute successfully.\n

## 2026-10-05 — I-2 execution-path reconciliation

Completed: current-head branch reconciliation; current-head Vercel build attempt; confirmation that Cloud CI is restricted to Vercel-Prod push/PR events; no current-head build PASS inferred from the stalled Vercel attempt.

Remaining bounded verification is unchanged: obtain a completed executable current-head build/test/typecheck/lint result through an approved execution environment, then complete connector/OAuth/browser/security/governance checks and Gate-D. Do not create a broad PR merely to manufacture CI evidence: the feature branch is 724 commits ahead and 27 behind Vercel-Prod, so such a PR would be an unsafe validation shortcut.

## 2026-10-05 — Current authoritative I-2 next action

The control documents have been reconciled against GitHub. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**, not BLOCKED and not PASS.

Completed since the earlier checkpoint: runtime redaction hardening, organisation-scoped integration-store isolation, agent/org ownership enforcement, migration sequence correction, and database/RLS hardening. Gate-E is evidenced.

**Next bounded execution:** obtain executable dependency/lock synchronization and current-head build/test/typecheck/lint evidence; then perform the required connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-06 — Current owner continuation

The plan-to-implementation audit found and corrected I-033: the agent integration grant mutation now re-checks the organisation's current plan entitlement before enabling an integration. The correction is committed and recorded in ISSUES.md / VERIFICATION_STATE.md.

**Next bounded work remains executable verification:** current-head build/test/typecheck/lint evidence, focused I-2 runtime/API tests, real connector/OAuth smoke where valid credentials/configuration exist, browser access/denial verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review. Do not wait for GitHub Actions or Vercel before performing bounded source-level corrections. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Current owner continuation after I-034

I-2 remains IMPLEMENTED — VERIFICATION PENDING. ChatGPT completed another bounded plan-to-implementation correction: agent integration grants now enforce current plan entitlement only when enabling; disabling remains available after downgrade, with focused regression coverage (I-034). This does not close Gate-C or Gate-D.

**Next bounded work:** continue source-level I-2 review for concrete plan/implementation gaps without waiting for GitHub Actions or Vercel; prioritize credential/connection authorization, AI-tool exposure, runtime action validation, and tenant isolation. Then obtain executable test/typecheck/lint/build evidence, connector/OAuth smoke, browser verification, and final Gate-D review.

**Stopping boundary:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Current owner continuation after I-037

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review identified and corrected I-037: the integration runner had been passing `projectId` into the credential vault's agent-scope parameter. The runner now carries an explicit `agentId` field and no longer conflates project and agent identity.

- Correction commits: `8cad5e6759e79dfe54729257b68bc719319e7161`, `54fa672ce7e1df29d97cc2fbc5589403c5682ab0`.
- I-037: RESOLVED by architect source review.
- Next bounded work: continue I-2 source review for concrete credential/connection authorization, AI-tool exposure, action-input validation, and tenant-isolation gaps; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: known-secret trace redaction

I-2 remains the active bounded work. Without waiting for GitHub Actions or Vercel, ChatGPT identified a remaining telemetry hardening gap: redaction was pattern/key based but did not scrub the exact credential values already resolved for an integration when a provider echoed them under a non-sensitive field name or plain text.

- Implementation: `d288975526e40a67e4c22cdc402760f1ca6649af`
- Runner call-site propagation: `1a19b95d10c03b9b4e8128628846827cf2b1676f`
- Focused regression tests: `750e5da08150c1f09be0fb8db232413df23df25b`
- I-038: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next: continue only bounded I-2 verification/security corrections; do not expand to I-3, MCP, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: OAuth refresh redirect hardening

I-2 remains the active bounded work. Without waiting for GitHub Actions or Vercel, ChatGPT found that the credential-bearing OAuth token refresh request used default fetch redirect behavior after checking only the initial token endpoint.

- Implementation: `fddf00ca3c5cea63daa5c4146ae212908deb205a`
- I-039: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next: continue only bounded I-2 verification/security corrections; do not expand to I-3, MCP, production promotion, or unrelated implementation.


## 2026-10-06 — I-041 post-refresh credential scope correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. The source audit found one remaining project/agent conflation after the I-037/I-040 corrections: the post-OAuth-refresh credential refetch still passed projectId into the agent-scoped credential-vault parameter.

- Correction: `1001819239fcba146061be84c35254a8a9fb30cb`
- I-041: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

**Next bounded work:** continue only I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation, and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-042 Unified Tool Runtime project-scope correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. The source audit found the Unified Tool Runtime integration_action bridge was fabricating a project scope by assigning agentId to RunActionParams.projectId. The host execution context defines agentId but no projectId.

- Correction: `3305c9027ddcef4fff0520d941dfebc73f9ef94a`
- I-042: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

**Next bounded work:** continue only I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation, and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-043 owner continuation

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review corrected the AI-visible integration tool boundary: agent integration grants are now bound to the execution tenant through the authoritative `agents.org_id` relationship, and focused regression coverage rejects a cross-tenant agent before `runAction`. The existing I-042 project/agent scope correction remains intact.

- I-043: RESOLVED by architect source review.
- Correction commits: `870ac568d050a8a6f54c347684a1b6e4fe9015ca`, `b5a744cc57135e2e8f1037f7396c56ed57bc3656`, `26f0f5fd00d47641598854e0cbb813ac049b7459`.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.
## 2026-10-06 — I-2 owner continuation: bounded runner correctness correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the current runner helper and found a bounded correctness defect in the ElevenLabs custom action: its 3xx failure path emitted an OAuth-refresh-specific error even though it was the ElevenLabs transport. The transport already fails closed on redirects; the correction only restores the correct action-specific error semantics.

- Correction commit: `499feacf01907f82da9578b74cb8789931d10752`
- Scope: `src/modules/integrations/runtime/runner-helpers.ts` ElevenLabs TTS redirect handling only.
- No OAuth callback/transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor.
- **Next:** continue bounded I-2 security/correctness review and implementation corrections; then obtain executable Gate-C evidence, connector/browser checks, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated feature work.

## 2026-10-06 — I-2 owner continuation: credential-value error-boundary hardening

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the runner's final error boundary and found that provider error text could bypass value-based credential redaction when a provider echoed a resolved secret under a non-sensitive field name or plain-text message.

- Correction commit: `a8a1997f958c37b524451618eb0d3bb4a3746b5f`
- Scope: `src/modules/integrations/runtime/runner-core.ts`; retain resolved credential values for the request lifetime and apply value-based redaction to the final runner error before XRay, usage logging, and the returned error.
- No new provider, OAuth callback/transport, MCP, billing, migration, production promotion, or unrelated feature work.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next:** continue only bounded I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-2 owner continuation: final error credential-value redaction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. A bounded source correction was applied without waiting for GitHub Actions or Vercel: the runner now preserves the resolved credential values for the active execution and applies value-based redaction at the final error boundary. This prevents provider-echoed credentials under non-sensitive field names from reaching returned errors, XRay, or usage logging.

- Correction commit: `ca2394e85e191a709f774a083137798e2cf90dc8`.
- Scope: I-2 runtime security/observability only.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next: continue bounded I-2 verification/security review; do not expand to I-3, MCP, production promotion, or unrelated work.


## 2026-10-06 — I-2 owner continuation: organisation downgrade-unwind correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT audited plan-entitlement symmetry and found I-045: the organisation integration POST route blocked `disable` after a plan downgrade because it evaluated current plan entitlement before branching on the requested action.

- Correction: `4c653b18c488661a9000f21f73344ce90d669b1a`.
- Regression test: `289bb2a9dc8d40532479c62980f0ab110a600849`.
- I-045: RESOLVED by architect source review.
- `enable`/`connect` remain entitlement-gated; `disable`/`disconnect` remain available for downgrade unwind.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next bounded work:** continue I-2 executable verification and only further concrete I-2 corrections; then connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: AI availability plan-entitlement correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT audited the AI-visible integration discovery boundary and found I-046: `integration_availability` exposed platform/org/agent-enabled integrations without applying the organisation's current plan allowlist.

- Correction: `48a55826f4c45fe71c891bd68f71075fc363f8fc`.
- Regression test: `b3d090a1644d1982e1709d095458db9c593a5d42`.
- I-046: RESOLVED by architect source review.
- `integration_availability` now filters by current plan; `integration_action` remains independently fail-closed.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next bounded work:** continue I-2 executable verification and only concrete I-2 corrections found by source review; then connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: project/tenant scope separation
I-2 source review found that buildActionContext() still defaulted project.id to workspaceId when no explicit project identity was supplied, despite the ratified I-037 separation of project and agent/tenant scope. ChatGPT corrected this bounded defect at 59e8d360180a6458d4b965406829185fc6224785; focused regression coverage is 327740e9aec6d0bf0b0260af717a344b03e3d8ed. I-051 is recorded RESOLVED by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
**Next bounded work:** continue I-2 source-level credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: telemetry schema + fail-closed entitlement corrections

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.

[architect-verified] Two concrete plan-to-implementation gaps were corrected without waiting for GitHub Actions or Vercel:
- I-052: integration usage telemetry now matches the existing `integration_usage_log(org_id, agent_id, ...)` schema instead of attempting the non-existent `workspace_id` column.
- I-053: malformed/null platform `allowed_plans` now fails closed on AI execution, organisation enable/connect, and agent enable rather than bypassing entitlement checks.

Focused regression source was added for both corrections.

**Next bounded work:** continue I-2 source-level authorization/connection, action-input, tenant-isolation, egress, and secret review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Vercel deployment blocker checkpoint

[architect-verified] Deployment `dpl_2zSX7vRmLwJUDYXRdnE1YpeD1noL` failed before application compilation because `npm ci --legacy-peer-deps --include=dev` rejected an unsynchronized `package.json` / `package-lock.json`, with the newly declared `@activepieces/*` family missing from the lockfile. Bounded correction `3d87c000b7f3bdee337d524eeb06718094ebeb84` changes Vercel's install command to `npm install --legacy-peer-deps --include=dev` so the declared dependency graph can be resolved while strict lock synchronization remains open. A clean `npm install --package-lock-only` attempt in a Vercel sandbox ran ~13.8 minutes and failed; no generated lockfile was accepted. Fresh Vercel deployment is currently blocked by the team's `api-deployments-free-per-day` quota. Do not claim build success until a fresh deployment is actually observed. See `SESSION-049.md`.


## 2026-10-06 — I-054 runner execution-authorization correction

[architect-verified] The I-2 runner now re-checks the authoritative integration execution boundary immediately before custom or Activepieces action execution. This closes the stale-authorization/direct-runner bypass identified in I-054.

- Runtime correction: `2d2383a196d83fba26dd93a4b4a1ec2ecec31207`
- Authorization module: `facb32c99b5fc9bcdd0d05900e0a92bdf9c60e6d`
- Regression coverage: `e4110290c8cfa57c1f5357eaf4f57c719785a4ee`
- I-054: RESOLVED by architect source review.
- Gate-C remains OPEN/MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then current-head executable verification, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-057 OAuth refresh disable-race correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, source review found I-057: an in-flight OAuth refresh could re-persist credentials with status='active' after a connection had been disabled, and the runner did not explicitly fail closed if the post-refresh active connection disappeared.

- Corrections: `a8e66489e57d84326e63b56b86914ba3b5ea3cf3`, `ac8d4bf5388c1cf993a9355c3032e8c8d090782f`.
- I-057: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection authorization and egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-058 custom integration egress/redirect correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review found native fetch paths in custom ElevenLabs and Supabase actions bypassing the generic egress/redirect boundary. The bounded correction adds explicit host egress checks and manual redirect handling for those credential-bearing requests.

- Corrections: `d4e3a44956da9f377be7afcd8b7a012b54a6c944`, `434316d642c26f7d088e216d0b91407049a16d57`.
- I-058: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level authorization, credential, egress and secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-059 Supabase Management API egress correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review found that the custom Supabase Management API action was the remaining credential-bearing native fetch path not covered by the I-058 egress/redirect correction.

- Correction: `c7a2b7f4edb33cc919ebfe528d0fd316b4698136`
- I-059: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review. Do not wait for GitHub Actions or Vercel. After source-level review is exhausted, obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-060 custom Management credential agent-scope correction

[architect-verified] Source review found that the custom Supabase Management API action's secondary `supabase-mgmt` credential lookup omitted the executing `agentId`, despite the surrounding runner authorization being explicitly agent-scoped. The lookup now passes `params.agentId`, and focused regression coverage asserts tenant/user/agent scoping.

- Implementation: `a90254ee5e4a7910fd92291810fe0cdff72c2ee0`
- Regression: `040cfafb0d4aad1b9b95de9aafa3d5dfa975bd35`
- I-060: RESOLVED by architect source review.
- **Next bounded implementation review:** continue I-2 credential/connection and custom-action authorization/egress review only; then obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-068 route-source correction

[architect-verified] Source review found and corrected literal \\n escape text embedded in two I-2 authorization route files. Correction commit: c07b87596ffdc7959a4b507621b3a57d900c6a82. No authorization semantics changed.

Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. After source review is exhausted, obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-069 focused-test alignment

[architect-verified] I-2 source review found a stale plan-guard mock in the agent integration route test after the production route had moved to resolveOrgPlanLimits. The test now configures the authoritative resolver and verifies downgrade-disable does not call it. Correction: 953bf1b698b52010bab1e00e4fcfac8b6603272f.

Next bounded work: continue concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and remaining bounded smoke/browser/security scans.

STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-070 agent-scoped FLOW store correction

[architect-verified] I-2 source review found that FLOW-scoped Activepieces store keys omitted agentId. The store now keys FLOW state by organisation + agent + user, with a focused regression. Implementation f0f476e74b1fbd66ed3e716bdc23e9e6b775b; regression efc652c8096488e3cf8d2ac2422d108c345924ca.

Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and remaining bounded smoke/browser/security scans.

STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-076 registry-authoritative action discovery

[architect-verified] Continued bounded I-2 review found getIntegrationActions could fall back to enumerating every action shipped by the installed Activepieces package when fewer than half of Clara's registry actions matched. That could advertise unreviewed upstream actions even though runAction now correctly rejects them. The discovery fallback has been removed: capability discovery now exposes only registry-approved actions plus Clara-owned custom actions.

- Implementation: 9435c6ce036634fe5f1126fa35c424db0e8582a2
- Regression: 55271624623ec65ec1ae892bf8585063d2dc5371
- I-076: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-077 Supabase credential URL error-boundary hardening

[architect-verified] Bounded I-2 review found the custom supabase.execute_sql action included the credential-derived projectUrl in an error when project-ref parsing failed. Because projectUrl is credential material, that error could expose stored connection data through the runner error boundary. The correction now returns a generic invalid-project-URL error and adds focused regression coverage.

- Implementation: 6ae5663938c2144f2f880afe0d7ebdcd97ebf54a
- Regression: 0f3347d8b679f0ea4110768fdf5f5c33de129d57
- I-077: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-078 runner early-rejection trace initialization correction

[architect-verified] Continued bounded I-2 review found the registry action-allowlist rejection path referenced the normal XRay handle before that handle was initialized. The intended fail-closed rejection therefore could raise a temporal-dead-zone ReferenceError. The early rejection now returns directly without touching the later trace handle.

- Correction: ddd38bbf84f274a7f2daa159007a080f964b3046
- I-078: RESOLVED by source correction.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-079 AI action readiness user-scope correction

[architect-verified] Bounded I-2 source review found that the AI `integration_action` readiness query could report another user's active connection as ready because it omitted `user_id`, even though the downstream runner correctly enforced tenant/user/agent credential scope. The readiness query now applies the same user scope and prioritizes the current user's connection.

- Implementation: `9e168851bc2e978f68c0576235e084eba63be4a2`
- Regression: `f2b3dc2ac263d5112dc8d6e7649acfdd76bc735a`
- I-079: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-080 AI availability regression alignment

[architect-verified] Continued bounded I-2 review found a stale test mock reference to the removed `getOrgPlanLimits` helper in the cross-tenant AI availability regression. The test now configures the authoritative `resolveOrgPlanLimits` resolver.

- Correction: `3ed83c8ddcde22e05ddfa415bce134e7773fca75`
- I-080: RESOLVED by test-source correction.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-081 AI availability user-scope correction

[architect-verified] Bounded I-2 review found `integration_availability` could report another user's active connection as connected. Availability now requires user context and applies organisation + agent + user connection scope, preserving organisation-scoped connections.

- Implementation: `f9dc068c0ca6b4067d0cda6d44743d4f91ac82a5`
- Regression: `0e53c6a42fa316ddb776b565b32dd5b03599a69a`
- I-081: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-082 OAuth refresh credential-scope correction

[architect-verified] Bounded I-2 source review found that OAuth refresh credential-vault mutations were scoped only by connectionId + organisation after the runner had selected a connection using user + agent scope. The vault decrypt/status/update operations now preserve user and agent scope, and runAction passes both into ensureTokenFresh().

- I-082: RESOLVED by source correction.
- Corrections: f74d3928ce875e40ebafba473e92da4c90305ca0; 4ea030a1d75e31983605e59026437de4336d5e16; bd238eaa379d51f11c9d867434cd0a77dc5ab1a0.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — Owner CI/CD pause control

[architect-verified] Per owner directive, automatic GitHub Actions execution is disabled: .github/workflows/ci.yml now retains only workflow_dispatch, with the original push/pull_request triggers preserved as commented re-enable guidance. Vercel clara-backend is paused because deployment-source controls are unavailable on the current Hobby plan; this prevents automatic deployments until the owner deliberately unpauses the project. No CI/Vercel result is being awaited.

**Next bounded work:** continue I-2 source implementation/review only, without waiting for CI, Vercel, Gate-C, or Gate-D. Gate-C remains MISSING and Gate-D remains IN PROGRESS. After bounded source work is exhausted, the existing plan still calls for executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review when the owner chooses to resume verification.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-084 OAuth refresh scope drift corrected

[architect-verified] Bounded source review found I-082's recorded OAuth refresh scope was not fully reflected in current runner-helpers.ts. ensureTokenFresh now accepts and propagates userId/agentId through credential decrypt, expiry status, and refreshed credential persistence. No tests, CI, Vercel build, Gate-C, or Gate-D result was awaited.

**Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Then executable Gate-C evidence and final Gate-D review when verification is deliberately resumed.


## 2026-10-07 — I-085 OAuth refresh lost-scope fail-closed correction

[architect-verified] The bounded I-2 OAuth refresh path now fails closed if the scoped credential persistence update affects zero rows, preventing an in-flight refresh from continuing after a concurrent connection disable/disconnect or scope change. Corrections: 45ab1758a30e2c1088f165452c2d550a72d669d1 and eb4a3bed89204d6b7b2670d4f4bc045873ed7be8.

**Next planned work:** continue the bounded I-2 credential/connection and authorization review, especially connection mutation and runner authorization race boundaries; then move to the remaining custom-action, AI-tool, egress/secret, and tenant-isolation gaps. Do not wait for CI, Vercel, Gate-C, or Gate-D.


## 2026-10-07 — I-086 organisation integration mutation serialization correction

[architect-verified] Bounded I-2 source review found that the organisation-level connect transaction locked only an existing integration-grant row. When the row was absent, concurrent first-time connects could both pass the `max_integrations` count check. The connect transaction now acquires the existing organisation advisory transaction lock before reading the grant/count; disable and disconnect use the same lock so the mutation domain is serialized consistently.

- I-086: RESOLVED by architect source correction.
- Correction: `51c14f65b7dac8812ccae353bc23e9cf07694d8c`.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN PROGRESS.
- No CI, Vercel build, Gate-C, or Gate-D result was awaited.
- **Next planned work:** continue the bounded I-2 credential/connection and authorization race review, then inspect remaining custom-action, AI-tool, egress/secret, action-input, and tenant-isolation gaps. Continue implementation directly without waiting for CI, Vercel, or gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — Gate-C execution readiness

[architect-verified] Gate-C is execution-ready but not verified at current head. The implementation checklist is complete and automatic CI/health automation is disabled. One manual workflow_dispatch execution against the current feature head is required to create authoritative executable evidence; after that, proceed immediately to final Gate-D architect review.


## 2026-10-07 — Gate-D final architect precondition result

[architect-verified] Final Gate-D closure cannot be issued yet. The feature branch currently exposes commit `895f4aa4d593cff999e2fe6c9a0bec2c981450be`, and GitHub reports zero workflow runs for that exact commit. Therefore the required current-head Gate-C executable evidence does not exist in the repository evidence surface.

**Current disposition:** Gate-C **NOT VERIFIED**; Gate-D **BLOCKED / NOT CLOSURE-ELIGIBLE**; I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.

**Next action:** obtain one manual current-head Gate-C execution, record its run ID/conclusion and required job evidence, then immediately perform the final Gate-D architect review. Do not treat older runs, source inspection, or partial build initiation as Gate-C PASS evidence.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — Gate-C execution contract completed; external execution intentionally deferred

[architect-verified] The Gate-C implementation-side gap is now closed. The manual CI workflow has been strengthened to use `npm ci --legacy-peer-deps` (lockfile-enforcing installation) and now contains a dedicated `integrations-i2-focused` job covering runtime redaction/egress, credential-vault/runner behavior, AI integration authorization/readiness, registry/control-plane tests, focused typecheck, and focused lint.

- Workflow correction: `4714e5f5f2d157a8c868e118df5b26149b98c9cd`.
- Automatic CI remains disabled by owner directive; `workflow_dispatch` remains available.
- Gate-C is therefore **IMPLEMENTATION-COMPLETE / EXECUTION-DEFERRED**, not falsely marked verified.
- GitHub/Vercel execution evidence is explicitly skipped under the current owner instruction not to wait on external gates.
- I-2 application implementation is complete; remaining items are verification/operational evidence only.
- Gate-D is likewise skipped/deferred because its closure depends on Gate-C evidence and the owner has instructed that external gates must not block development.
- No I-3, MCP expansion, production promotion, or unrelated feature implementation is authorized by the current project-control boundary.

### I-2 owner checklist — 2026-10-07

**DONE — implementation**
- [x] Registry-authoritative integration/action capability model
- [x] Organisation/agent/user authorization boundaries
- [x] Fail-closed plan entitlement resolution
- [x] Connection auth-type authority
- [x] OAuth token endpoint authority
- [x] OAuth refresh user/agent scope preservation
- [x] OAuth refresh disable/disconnect race protection
- [x] Fail-closed scoped credential persistence
- [x] Activepieces reviewed-action allowlist
- [x] Registry-authoritative action discovery
- [x] AI integration action user-scoped readiness
- [x] AI integration availability user/tenant-scoped readiness
- [x] Custom Supabase Management credential authorization/fallback boundary
- [x] Secret/error/trace redaction
- [x] SSRF/private-network egress protection and redirect hardening
- [x] FLOW/store tenant isolation
- [x] Agent/org ownership enforcement
- [x] Organisation integration mutation serialization
- [x] Integration slot entitlement concurrency protection
- [x] I-2 migration/control-plane source implementation
- [x] Gate-C manual workflow contract

**PENDING — external verification only**
- [ ] Current-head GitHub workflow execution evidence
- [ ] Current-head production Docker build evidence
- [ ] Database migration/runtime execution evidence where environment access is required
- [ ] Real connector/OAuth smoke with valid provider credentials
- [ ] Browser allow/deny-path verification
- [ ] Immutable-source/runtime-import/secret/governance execution evidence
- [ ] Final Gate-D closure review

**IN PROGRESS**
- [ ] None in application implementation. I-2 source implementation is complete; external verification is deliberately not allowed to block the plan.

**DEFERRED/SKIPPED BY OWNER CONTROL**
- [x] Do not wait for GitHub Actions
- [x] Do not wait for Vercel
- [x] Do not run continuous verification
- [x] Do not block feature development on Gate-C/Gate-D execution

**Next planned work:** remain at the I-2 boundary until the owner re-enables external verification or explicitly authorizes the next phase. Do not silently expand scope.

## 2026-10-08 — I-6 bounded hardening checkpoint

[architect-verified] Source-level acceptance review corrected two I-6 fail-closed boundary gaps: explicit empty MCP surface allowlists no longer widen to all surfaces, and normalized server/tool identifiers now receive an identity-derived suffix to prevent ordinary sanitization collisions.

- Corrections: `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6`, `d4bfbe112863696c99ad7abb81857a9399f079c2`.
- Session: `SESSION-061.md`.
- I-6 remains IN PROGRESS; external CI/Vercel/Gate-C/Gate-D are deferred by owner instruction.

**Next implementation:** continue the bounded I-6 source-level acceptance review for remaining resolver, registration, authorization, context, schema, and runtime-seam gaps. Do not add MCP transport/server hosting, persistence/OAuth, marketplace, billing, production promotion, or unrelated work.


## 2026-10-08 — I-6 authorization-helper hardening

[architect-verified] The public MCP helper now explicitly exposes only static allowlist inspection (`isMcpToolAllowlisted`). It no longer presents an authorization-shaped result that could be confused with the Unified Tool Runtime's complete authorization stage.

- Corrections: `6d37d607689a3379a253659ebd50046d6`, `f6454910c436d14b29c768180f344e02159dd908`, `8504c42a058fce9c8e38979c3d93899fd95345a2`.
- I-6 remains IN PROGRESS; external verification is deferred.

**Next implementation:** continue bounded I-6 source-level acceptance review for remaining runtime registration, default-off, resolver, context, schema, and tenant-boundary gaps.


## 2026-10-08 — I-3 malformed action-props boundary correction

[architect-verified] Continued I-3 source review found that runtime callers could bypass the compile-time Record<string, unknown> assumption by supplying null or an array as action props. The strict validator now rejects malformed top-level props deterministically before schema traversal.

- Implementation: 7aa1ebc8521c377684c711d97710e0614f66b4e3
- Regression: 8ac329d38af49a6c3acba22ac25935fb8b151c3c
- I-3 remains IN PROGRESS; external CI/Vercel/Gate-C/Gate-D evidence remains deferred under owner instruction.

Next implementation: continue bounded I-3 acceptance review for strict schema edge cases, deterministic result propagation, egress/redirect boundaries, redacted trace invariants, and tenant-isolation regression coverage.

STOP: no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-08 — I-3 redirect egress classification correction
[architect-verified] Continued bounded I-3 source acceptance found that the generic traced-fetch redirect branch caught every redirect-validation failure and relabeled private/loopback redirect destinations as REDIRECT_BLOCKED. This obscured the host-owned egress policy classification. The runner now only maps malformed redirect URLs to REDIRECT_BLOCKED and preserves typed EGRESS_BLOCKED errors from the redirect egress validator.
- Implementation: 42527f0a2c83e8b7d3d6baa5fd70c8d1c2dd7d78
- Focused regression: e74b9f6f1e82102474ccb53c56da3931fde3fdd6
- External CI/Vercel/Gate-C/Gate-D evidence remains deferred by owner instruction.
- Next bounded I-3 implementation: continue deterministic result propagation, strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression review.
- STOP: no I-4/I-5, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-08 — I-3 strict validation fail-closed correction
[architect-verified] Continued I-3 source acceptance found that strict action validation returned success when an action exposed no usable property definition, allowing arbitrary runtime props to reach execution without a schema boundary. Strict mode now rejects every supplied property when the action schema is absent, while an empty prop object remains valid and non-strict mode preserves compatibility.
- Implementation: d6bdaa4238b9694430a4a484af2eb480f28fa5eb
- Focused regression: d90a314df428bd13d18a6655a81bd498945d549e
- External CI/Vercel/Gate-C/Gate-D evidence remains deferred by owner instruction.
- Next bounded I-3 implementation: continue deterministic result propagation, remaining strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression review.


### I-6 Follow-up — 2026-10-08
- Removed an unused context-value snapshot from the MCP resolver path after exact execution-context object binding became the authoritative invariant.
- Commit: `9e3ab09931ea10584803f51feb6073c2eafce06f`.
- External CI/Vercel/Gates were not awaited.
- Next: continue bounded I-6 registration/capability-authorization invariant review.


## 2026-10-09 — Integration discovery hardening; chat/realtime dispatch remains active

[architect-verified] The connected-integration runtime now fails closed when execution context lacks either agent or user identity. Discovery candidates are scoped by active connection, platform enablement, organisation grant, agent grant/ownership, and organisation plan allowlist before tool registration. Action execution continues through Unified Tool Runtime and the existing runner.

- Source commits: `8aac1c8a5b0e4f61c3f36f2d416c0fc3da6102b5`, `e0a3001e6911fc896df0611e83756c78ecb22da4`, `d722ff3f547a00b90c027b45e479944aa3cf9827`.
- No tests or live provider integrations were run; CI/Vercel/Gate-C/Gate-D remain deferred.
- **Next implementation:** wire provider chat and realtime voice tool calls to this same authorized runtime/context while preserving existing Clara/Qdrant RAG, provider capability differences, cancellation, and metering; then add focused regressions. Also continue secure platform OAuth client configuration/callback work.
- Inspect Doable and reusable-library references for multi-provider capability/tool-loop patterns when useful, but keep Clara authorization and Unified Tool Runtime authoritative.
- Do not claim all providers support tool calling unless their adapter explicitly implements it. Never expose credentials to model-visible tool definitions.


---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-10 — FIX-01 OAUTH CONFIGURATION CLARITY

[owner-authorized] Continue bounded integration/OAuth configuration work without waiting for DEV-01, CI, Vercel, or external gates.

## Completed source correction
- Replaced the generic OAuth callback placeholder with a deployment-derived, read-only canonical callback URI: `/api/integrations/oauth/callback`.
- Replaced stale setup warning copy with actionable provider-console steps and clear save-vs-connect semantics.
- Server-side redirect validation now enforces the same callback path and rejects query strings/placeholders.
- Focused regression source updated for canonical callback validation.

Commits: `8c64ed818fdfb1185472ec62f74d3f9e1d79ae25`, `c12071271a9c79870b93093ce78375ddab96b4bd`, `3bb395bef2069d39dd4cf80b9261b73400a99c52`.

## Verification
Source only. Tests/typecheck/build/browser/live OAuth/deployment were not run. Do not infer a PASS.

## Next bounded work
1. Continue actual Doable source comparison for platform OAuth app setup and credential resolution, not docs alone.
2. Add registry-backed provider console setup links and scope/API enablement guidance only where grounded in provider metadata.
3. Consider a platform-admin OAuth test flow only if it can safely use a dedicated test identity/organisation and existing OAuth start/callback runtime; do not create a second OAuth executor.
4. Preserve encrypted client secrets/tokens, one-time state, exact callback validation, org/agent/plan authorization and the Unified Tool Runtime.
5. Route migration, deployment, proxy-origin and runtime-environment defects to OPS-01. Do not wait for CI/Vercel/Gates.


## FIX-01 Doable source comparison update — 2026-10-10
Actual Doable source has now been inspected: `services/api/src/integrations/oauth2.ts`, `services/api/src/routes/integrations-oauth.ts`, and `services/api/src/routes/integrations-admin.ts`. Follow-up may evaluate source badges and env credential fallback, but only after checking Clara's current OAuth app model and secrets policy. A platform-admin Connect Test should reuse the existing OAuth lifecycle and must not invent a parallel callback/executor. Current callback UI/server validation correction remains source-only; no tests or live OAuth were run.


## FIX-01 OAuth follow-up — 2026-10-10 (I-096 remains OPEN)

This is a bounded integration-setup follow-up and does not supersede the repository's other active implementation track.

1. Run focused tests from a working checkout: `npm test -- src/modules/integrations/oauth-app-validation.test.ts src/modules/integrations/oauth-setup-guides.test.ts`; fix any failures before claiming source-test evidence.
2. Review the provider setup-guide mapping against the current OAuth-enabled registry IDs. Unknown IDs intentionally get generic instructions rather than guessed links. Scopes displayed by Clara remain registry/database-driven; verify each provider's scopes against its current console before production use.
3. Keep credentials database-only for now. Do not add environment-variable fallback until precedence, secret rotation, auditability, and deployment-secret ownership are explicitly designed.
4. Ask OPS-01 to verify the deployed callback origin, reverse-proxy headers/base URL, required OAuth-app migration, and runtime config. Do not wait for CI/Vercel to continue source work.
5. Complete a real provider consent → one-time state consume → callback-origin/path check → token exchange → encrypted connection persistence test using a configured test app. Keep I-096 OPEN until evidence exists.

- Scope guidance follow-up: `427383ea8f0f4c13b1c38991da5e24b9ed28a1dd` now makes empty default scopes explicit. Confirm the provider's required permissions before a live connect test.


# MCP OWNERSHIP ARCHITECTURE CORRECTION — 2026-10-11

Architecture review found that the current MCP organization API accepts only a `serverId` from `platform_mcp_servers`, while the resolver requires platform registry/tool rows and `platform_enabled=true`. Therefore, the current source supports organization credentials for catalog entries but does not yet meet the self-service requirement that an organization can register its own external MCP endpoint without platform-admin pre-registration.

Decision and phased acceptance criteria: `docs/plans/mcp-organization-owned-endpoints.md`.

## Next implementation scope

1. Inspect the existing plan/subscription schema and `resolveOrgPlanLimits`; add MCP entitlements to the existing source of truth (no parallel plan system and no hardcoded Starter/Pro checks).
2. Add an additive migration for tenant-owned endpoint registrations and discovered tool/grant records. Keep optional platform catalog/hosted-service records separate.
3. Implement organization-scoped create/update/test/discovery/credential rotation/disconnect/delete endpoints with plan quota enforcement and secure endpoint validation.
4. Extend the resolver to resolve persisted tenant-owned connection IDs and re-check tenant, plan, user, agent, connection, organization grant and agent grant at discovery and invocation.
5. Update the organization Integrations and Agent Integrations UI; keep platform MCP UI for catalog/templates and explicitly hosted Clara services only.
6. Add focused regression coverage for cross-tenant access, quota/plan transitions, secrets, grants/revocation, SSRF/DNS rebinding, timeouts and Chat/realtime dispatch.
7. Keep `ENABLE_MCP=false` and platform servers disabled until executable tests and a controlled live MCP handshake pass. Do not claim runtime PASS from source-only review.

The architecture note is committed in `docs/plans/mcp-organization-owned-endpoints.md` (commit `a8e5ba9439a80290f8a8a4622c368ac25457a161`). This is documentation/plan progress only; tenant-owned endpoint implementation and verification remain pending.

---

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-12 — ORGANIZATION-OWNED MCP IMPLEMENTED AT SOURCE LEVEL

[owner-authorized] The complete organization-owned MCP product has been implemented at source level per the 2026-10-12 execution directive. See `docs/plans/mcp-organization-owned-endpoints.md` for the full record.

## Implemented at source
- Migration `069_mcp_organization_owned_endpoints.sql` (additive): plan MCP entitlements, global governance singleton, org-owned connections/tools/grants, usage metering, overrides, audit trails.
- Centralized entitlement module `src/modules/mcp/` (resolver, validation, client, metering, audit, service) — plan ∩ global policy ∩ subscription ∩ overrides, fail closed.
- Platform admin: `/settings/mcp` governance screen + `/api/platform/mcp-settings` (typed confirmations, emergency disablement); plan editor MCP configuration (validated, audited, `DISABLE-PLAN-MCP` confirmation); per-org override panel in the billing drawer + `/api/platform/orgs/[orgId]/mcp-override`.
- Org APIs: overview, connections CRUD + probe/create with live handshake + discovery, test, rediscover, tool approval, credential rotation, activity, agent grants.
- Org UI: Integrations hub (search/filter/sort cards, real counts, quota stats), 5-step Add-MCP-server wizard, connection detail (Overview/Tools/Agent access/Activity/Settings), billing MCP usage card. Catalog connect flow preserved inside the collapsed Platform-integrations section.
- Agent editor: `/orgs/:id/agents/:agentId/mcp` tools screen; runtime `mcp_availability`/`mcp_tool` on the Unified Tool Runtime, advertised to chat + realtime only while `ENABLE_MCP` is on; every invocation re-authorized and metered.
- 91 focused tests, all passing. Full suite 1334 passed / 50 failed — the 50 failures are the pre-change branch baseline (verified via stash diff). Typecheck clean for all new/changed files.

## Exact next implementation
1. Deploy the branch and apply migration `069` (the migration is purely additive; no destructive change).
2. Configure global MCP governance (`/settings/mcp`) and per-plan MCP entitlements (Subscriptions → Plans) — both are admin-UI driven, no code or manual DB edits required.
3. Enable `ENABLE_MCP` only after: migration applied, governance configured, a controlled live handshake against a known-good HTTPS MCP server, and the focused suites green on the deployed revision.
4. Live-verify one organization end to end: wizard → tool approval → agent grant → chat invocation → metering/usage counts → audit entries.
5. Continue without waiting for CI/Vercel; route defects to FIX-01 and infrastructure-only work to OPS-01 per the standing rules.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-12 — PR #291 RECONCILED WITH THE LATEST TARGET BRANCH

[owner-authorized] The organization-owned MCP implementation (PR #291, head `7b5274d0`) has been reconciled with the evolved target branch `feature/ai-core-from-doable-source` (`bb51d091`) onto the PR head branch so it can be reviewed conflict-free.

## Reconciliation decisions (supersede stale claims in the 2026-10-12 source-level entry above)
- Migration renumbered `069_mcp_organization_owned_endpoints.sql` → `073_mcp_organization_owned_endpoints.sql` (the target already ships 069–072 for the platform-catalog model; duplicate numbers hard-fail the migration runner). RLS + anon/authenticated revokes now match the 069 catalog conventions.
- The org-owned table family (`org_mcp_*`) is intentionally separate from the catalog family (`platform_mcp_*` / `organisation_mcp_*`) per `docs/plans/mcp-organization-owned-endpoints.md` on both branches: the optional platform catalog and tenant-owned endpoints are distinct concerns; both flows keep working.
- Runtime unified on the target's request-scoped architecture: the PR's global `mcp_availability`/`mcp_tool` meta-tool registration was removed; org-owned tools are advertised as REAL tools through `buildMcpToolRuntime` + the new `OrgMcpToolResolver` adapter (`src/modules/mcp/runtime-resolver.ts`) and a composite resolver, sharing one Unified Tool Runtime authorization/metering path with the platform catalog for chat and realtime.
- `/settings/mcp` keeps the target's MCP Servers (catalog registry) screen; the governance screen moved to `/settings/mcp/governance` (nav entry "MCP governance", group Platform).
- The organisation-level Integrations hub is restored at `/orgs/:id/integrations` (the target's redirect-to-agents placeholder is obsolete now that the screen carries the org-owned MCP surface); the agent-level consolidated integrations screen from the target is preserved unchanged; the agent MCP screen now renders both the platform-catalog section and the organisation-owned section.
- Agent integrations API route and screen keep the target's richer versions (per-status connection counts, revocation-preserving visibility) — a superset of the PR's changes.

## Verification status
- Focused MCP suites, type-check and lint re-run on the reconciled tree; see the session record for exact counts. Full-suite baseline comparison against the pre-reconciliation commit is recorded there too.
- Unchanged blockers: live DB migration application, deployment/CI/Vercel, live MCP handshake, live chat/voice execution. `ENABLE_MCP` stays OFF until the documented evidence list is satisfied on a deployed revision.

## Exact next implementation
1. Review and merge PR #291 (head branch `feat/mcp-org-owned-directive`).
2. Deploy and apply migration `073` (additive only).
3. Configure governance (`/settings/mcp/governance`) and per-plan MCP entitlements (Subscriptions → Plans).
4. Enable `ENABLE_MCP` only after the migration is applied, governance is configured, a controlled live handshake passes against a known-good HTTPS MCP server, and the focused suites are green on the deployed revision.
5. Live-verify one organisation end to end: wizard → tool approval → agent grant → chat invocation → metering → audit entries.

## FIX-01 next action — type-check residuals (2026-10-12)
1. Pull latest `feature/ai-core-from-doable-source`; calendar class-name correction `829ae96818a84a39110b65517917d9280c57684b` migrates the remaining legacy class keys to DayPicker v10 keys. It is not yet type-checked.
2. From the repository root run `npm install --save-dev @types/ws` and commit the resulting `package.json` and `package-lock.json` changes. Do not manually edit lock metadata or add an untyped ambient `ws` declaration.
3. Run `npm run type-check`; share the fresh output and continue fixing only new diagnostics. Do not wait for CI/Vercel; no PASS is recorded until the local type-check evidence supports it.

## LATEST FIX-01 RESULT — TYPE-CHECK PASSES; NODE ENGINE MISMATCH — 2026-10-12

- Owner pulled latest branch, installed official `@types/ws` with npm, and `npm run type-check` exited successfully with no diagnostics. This is a type-check PASS only.
- Immediate owner action: run `git status --short`; inspect and commit the intended `package.json` and `package-lock.json` changes from the install. Preserve any unrelated local files/changes.
- Runtime compatibility: install output shows Node v20.20.0 while dependencies require Node 22+, with `machina` requiring `>=22.22` and Vitest 5 requiring `^22.12.0 || ^24.0.0 || >=26.0.0`. Confirm project/runtime compatibility and align local, Docker and deployment runtimes to Node 22.22+ before relying on tests or runtime evidence.
- npm audit reported 37 vulnerabilities (5 low, 7 moderate, 23 high, 2 critical). Do a separate lockfile-aware audit; do not blindly run `npm audit fix --force`.
- Continue the existing organization-owned MCP endpoint plan and focused regression work without waiting for CI/Vercel. No tests, build, deployment or live MCP handshake PASS is implied by type-check PASS.

## 2026-10-12 — OpenAI realtime VAD diagnostic follow-up

- Latest benchmark script syntax check passes, but the live run still times out on input 1.
- Observed inbound sequence: `speech_started`, then nine `conversation.item.input_audio_transcription.delta` events spread across ~20 seconds; no `speech_stopped`, `input_audio_buffer.committed`, final transcription, or follow-up `response.create`.
- RAG has not been proven to run. Keep `create_response: false` unchanged until turn-finalization evidence is available.
- Diagnostic-only benchmark update records safe effective input turn-detection/transcription settings from `session.updated`, transcription delta lengths (not transcript text), additional VAD timeout/clear/failure event metadata, and WebRTC audio RTP counters before/after playback and on timeout.
- Next: pull `fix/openai-vad-audio-diagnostics-clean`, run `node --check scripts/voice-benchmark/conversation.mjs`, rerun the benchmark with a new output path, and inspect effective session settings plus RTP counter changes. Use that evidence to distinguish audio transport/silence generation from server-VAD/session behavior before touching production runtime.
- Status: diagnosis narrowed; root cause NOT FIXED; no syntax check or fresh benchmark run has been executed against this diagnostic branch yet.


## OpenAI realtime VAD diagnostic follow-up — 2026-10-12

- Fresh diagnostic report: browser audio track is live/enabled/unmuted, the peer connection and data channel are connected, and input playback increased outbound audio RTP from 0 to 54 packets / 4,546 bytes. Media-source audio energy is non-zero (RMS 0.0936; peak 0.7436).
- Effective session config confirms `server_vad`, threshold 0.5, 300 ms prefix padding, 700 ms silence duration, and `create_response: false`.
- The trace shows `speech_started` and transcription deltas, but no `speech_stopped`, `input_audio_buffer.committed`, or completed transcription. The RAG callback therefore has not been shown to run.
- Working hypothesis (benchmark harness, not production runtime): the synthetic `MediaStreamDestination` has no continuously-rendered source after the injected `AudioBufferSourceNode` ends. That can stop the synthetic track's audio clock/RTP and prevent the server from observing trailing silence. Evidence is suggestive, not yet confirmed.
- Diagnostic experiment: keep a zero-gain oscillator connected to the synthetic microphone destination so audio frames continue after the injected clip. This is benchmark-only; do not change production VAD or `create_response: false`.
- Next: run `node --check scripts/voice-benchmark/conversation.mjs`, rerun one benchmark into a NEW report path, then compare outbound RTP counters and VAD events. If `speech_stopped`/commit/transcription completion appears, investigate benchmark track continuity as the cause; only then evaluate RAG and response dispatch.
- Status: hypothesis under test; production root cause and fix are NOT confirmed.


## OpenAI realtime benchmark shutdown hang — 2026-10-12

- Latest run completed all five input turns and emitted latency results, but did not print the final report path / exit. This narrows the hang to post-turn finalization rather than VAD, STT, RAG, or response generation.
- Code inspection identified an unbounded `await Promise.all(pendingResponseFinishes)`. The benchmark tracks every browser response's `response.finished()`; a long-lived/streaming response may not finish until the browser is closed, while browser close is in the later `finally` block. This can deadlock successful runs after turn 5.
- Fix committed to bound the response-body flush wait to 2 seconds, then proceed with available timings and leave still-pending timing fields unset. This preserves the five-turn telemetry barrier and avoids requiring all browser responses to end.
- Next: pull latest branch, run `node --check scripts/voice-benchmark/conversation.mjs`, rerun five-turn benchmark to a new output path, and confirm it prints `wrote ...`, writes `runStatus: "completed"`, and exits. If it still hangs, capture the last log line and inspect other finalization/close waits.
- Commit: `76640c39a77e3c1f7600285eeb405260f7a5f5b8`. Source change is not locally syntax-checked or runtime-verified yet; do not mark PASS until the user run confirms it.


## Realtime voice latency optimization — benchmark baseline and next experiment — 2026-10-12

- Successful five-turn OpenAI benchmark baseline: TTFA 8,273 / 6,078 / 5,213 / 1,447 / 1,704 ms; median 5,213 ms. Turn wall times 16,227 / 13,396 / 13,039 / 8,287 / 9,370 ms. STT 1,374 / 1,539 / 1,642 / 1,141 / 1,597 ms. Client RAG 7,249 / 5,186 / 4,433 / 527 / 663 ms. LLM-first 592–806 ms; TTS-first 680–940 ms.
- Main observed delay is variable RAG request latency (especially turns 1–3); STT also exceeds 1 second. This benchmark does not yet prove whether RAG time is server retrieval/config/translation/graph work, network/serialization, or cold-start. Do not attribute all of it to Qdrant without server stage data.
- Added privacy-safe benchmark diagnostics to record RAG endpoint, HTTP status, browser fetch elapsed time, response Server-Timing header, and numeric server `payload.timings` only. No query text, snippets, context, or credentials are captured. Commit: `a78b4aebc9a2f71e5287698004b9e9e46e81164f`.
- Next: pull the branch, syntax-check, rerun the same five questions to a new report path, then compare browser elapsed vs server `metadataMs`, `admissionMs`, `configMs`, `translationMs`, `retrievalMs`, `graphMs`, and `totalMs`. Optimize the dominant stage only, preserving tenant authorization, quota admission, source grounding, and no-duplicate-response behavior.
- Performance target: first audible response <=500 ms is an aspiration, not currently met and not guaranteed by this baseline. Full grounded answer generation within 500 ms is not a credible promise under the current serial STT → RAG → model → TTS path. A fast acknowledgement is not equivalent to answering the question; metrics must distinguish acknowledgement TTFA from grounded-answer TTFA.
- GitHub Actions owner policy: only `workflow_dispatch` is allowed. `ci.yml` and `platform-health-scan.yml` already comply; `voice-benchmark-script-check.yml` was changed to manual-only in commit `08708e3aae6849012c011250c77b665962c4dfc7`.
- Do not claim production latency fixed until a fresh report confirms the effect after the required deployment. The owner handles deployment; source and benchmark work can continue without waiting for Actions/Vercel.



## VOICE LATENCY WORKSTREAM — DURABLE HANDOFF — 2026-10-12

Authoritative detailed session: `docs/project-control/sessions/SESSION-VOICE-LATENCY-20261012-01.md`.

- Active branch: `fix/openai-vad-audio-diagnostics-clean`; PR #295 is open and must not be merged without explicit owner authorization.
- Objective: reduce OpenAI realtime **grounded-answer** TTFA while preserving Clara/Qdrant grounding, tenant isolation, quota/authorization checks, and exactly-one-response behavior. Aspirational <=500 ms target is not met and is not guaranteed; do not count welcome audio or acknowledgements as answers.
- Latest owner-provided five-turn baseline: TTFA 8273, 6078, 5213, 1447, 1704 ms; median 5213 ms. RAG 7249, 5186, 4433, 527, 663 ms; STT 1374–1642 ms; LLM-first 592–806 ms; TTS-first 680–940 ms. Full table, command, and architecture notes are in the session record.
- Benchmark-only fixes: silent synthetic audio keepalive to avoid VAD/commit stalls; bounded 2-second response-body flush so report finalization does not hang. These do not alter production audio behavior.
- Privacy-safe timing instrumentation records RAG endpoint/status/browser elapsed, Server-Timing, and numeric server timing fields only. It does not store user query text, snippets, context, response bodies, or credentials.
- GitHub Actions policy: manual-only `workflow_dispatch`; do not re-enable push/PR/schedule triggers. Relevant commits: `08708e3aae6849012c011250c77b665962c4dfc7`, `a78b4aebc9a2f71e5287698004b9e9e46e81164f`.
- **Immediate next action:** pull this branch, run `node --check scripts/voice-benchmark/conversation.mjs`, run the documented five-turn command with output `tool-results/openai-rag-stage-timings.json`, and share the report. Use server `metadataMs/admissionMs/configMs/translationMs/retrievalMs/graphMs/totalMs` to select the measured bottleneck.
- Then make a narrow, measured optimization and focused regression coverage without waiting for CI/Vercel. If production code changes, deployment/rebuild is needed before a production comparison. No latency fix, production deployment, or <=500 ms PASS is claimed.


## 2026-10-12 — Voice benchmark welcome telemetry timeout

- Owner ran the updated five-turn benchmark after pulling through `1a6e5086`; the script syntax check produced no visible error, but benchmark timed out after 45 seconds waiting for `browser.first_audio` welcome telemetry before it played any question clips. It wrote partial diagnostics to `tool-results/openai-rag-stage-timings.json`.
- This failure does not establish a production outage or RAG latency; the run did not reach the question-turn measurements.
- Corrective harness change: welcome telemetry is now optional diagnostic metadata. If it is missing, the benchmark logs a warning and continues to the five question turns; the welcome mark is represented as null/unavailable, never zero. Per-turn telemetry barriers and provider checks remain required, and failure diagnostics remain available.
- Commits: `fb2a17b874a084e9294166ca6ad88f01830f21ee` (continue without welcome mark); `513a317b2063bb27035b581a3f3f1c4b300b2f27` (null-safe successful report serialization).
- **Pending verification:** owner must pull latest branch, run `node --check scripts/voice-benchmark/conversation.mjs`, then rerun the same five-turn benchmark to `tool-results/openai-rag-stage-timings.json`. Share the new report. If it fails again, share the full new failure summary including `dataChannelEvents`, `observedLatencyEvents`, `microphoneDiagnostics`, `requestCounts`, `failures`, and `consoleErrors`.
- Do not claim benchmark PASS, production latency improvement, or <=500 ms target attainment. Continue without waiting for Actions/Vercel; keep all workflows manual-only.


## Voice benchmark follow-up — 2026-10-12

- Owner-provided `node --check scripts/voice-benchmark/conversation.mjs` failed because regex escapes inside the browser-injected diagnostic callback were double-escaped, making the script syntactically invalid. Corrected the regex literals on branch `fix/voice-benchmark-regex-syntax`; error-message and response-reason diagnostics now redact bearer/token-like values and URLs.
- Latest owner trace: welcome `response.done` was seen, then input 1 emitted `input_audio_buffer.speech_started`, but no `input_audio_buffer.speech_stopped`, `input_audio_buffer.committed`, or `conversation.item.input_audio_transcription.completed` was recorded before the 90-second timeout. Therefore the manual RAG scheduler was not shown to have run; do not attribute this trace to RAG until the next run proves transcription completion.
- Next server action after merging/pulling the correction: run `node --check scripts/voice-benchmark/conversation.mjs`, then rerun the same five-input benchmark and inspect `dataChannelEvents` for provider `error`, speech-stop/commit, completed transcription, and response lifecycle. Preserve local `package.json`, `package-lock.json`, `tool-results/openai-conversation.json`, and `type-check-errors.log`; do not reset or discard them.
- If speech-stop/commit is still absent, investigate actual outbound microphone RTP/track delivery and the server VAD configuration from the observed session response before changing `create_response: false`. If transcription completes but no answer starts, then investigate `scheduleRag()`, `/api/rag/search`, and explicit `response.create` outcomes.
- Status: syntax correction committed to the fix branch; local Node check and fresh benchmark have not yet been run against that commit. Underlying realtime timeout remains OPEN / NOT FIXED until evidence identifies the failure point.


## NEWEST IMMEDIATE ACTION — SUBSCRIPTION AI ENTITLEMENT AUTHORITY — 2026-10-12

- GitHub issue: [#296](https://github.com/Rilan-Dev/Clara-AI-Platform/issues/296).
- Branch: `fix/subscription-ai-entitlements-authority`.
- Implemented source changes:
  1. Removed the stale `org_ai_settings.allowed_providers` list as a runtime authority; legacy organisation AI-settings PATCH is frozen and plan permissions must come from current server-side subscription entitlements.
  2. Platform-default provider fallback now considers only configured, platform-capable providers that pass the current organisation governance gate.
  3. Split subscription-plan capability/provider/model entitlement queries to avoid Cartesian join multiplication and the old `LIMIT 200` truncation.
  4. Missing provider rows now deny access when the provider entitlement matrix is populated; legacy all-provider fallback is limited to an entirely empty matrix.
  5. Expired/non-active subscriptions use the actual Free plan's capability flags, not the expired paid plan's `voice_enabled`.
- Added focused regression test source in `src/modules/ai-core/resolve-provider-entitlement.test.ts` and `src/modules/ai-governance/core/entitlements-db.test.ts`.
- **Next exact action:** pull this branch and run:
  `npx vitest run src/modules/ai-core/resolve-provider-entitlement.test.ts src/modules/ai-governance/core/entitlements-db.test.ts`
  then `npm run type-check`. Fix failures from current output only.
- **Verification boundary:** tests/type-check/build/database checks/production session have NOT run. No PASS. Do not wait for or poll CI/Vercel.
- Runtime acceptance: on a plan entitled to Sarvam, stale legacy org list must not block Sarvam; after plan downgrade/expiry, a previously published Sarvam agent must be denied by live entitlement checks.


### I-098 follow-up — missing provider registry row

- Additional fail-open found during adjacent-path audit: `validateAgentAISelection` returned early for known providers missing from `platform_ai_providers`, skipping subscription entitlement checks. This could affect chat and voice paths when the registry is partially seeded.
- Fixed on `fix/subscription-ai-entitlements-authority`: known-provider registry fallback now skips only the platform registry check; it still evaluates current plan capability/provider/model entitlements.
- Added regression in `src/modules/ai-governance/core/resolver.test.ts` for Sarvam missing from the registry but denied by Starter entitlement.
- This follow-up is also unverified; run the governance resolver test alongside the two focused tests listed above. Do not wait for CI/Vercel.


# CURRENT OWNER-AUTHORIZED NEXT ACTION — 2026-10-12 — GEMINI CATALOGUE CONSUMERS

The active bounded task is the owner-requested audit of remaining Gemini catalogue consumers and environment/seed defaults. Availability comes only from enabled governance rows marked vendor_live; environment IDs are preferences validated against those rows.

Completed source changes in this continuation:
- Corrected live model release-date parsing.
- Runtime embedding fallback now uses only live-discovered embedding rows and respects the organisation allow-list.
- Gemini embedding dimension resolution fails closed for unknown dimensions instead of assuming 768.
- Governance model counts, default summaries and provider workspace inventory exclude seed-only rows.
- Legacy env examples no longer pin Gemini chat/embedding/realtime IDs; production seed does not set static model IDs.
- Corrected malformed models/ prefix normalization in Gemini session and embed-session routes.

Next action: add/refine focused regressions for stale model IDs, unknown embedding dimensions, model-prefix normalization and vendor-live-only availability; then continue the branch-local search for remaining bypasses. Do not wait/poll CI or Vercel. Route substantial unrelated correctness/security defects to FIX-01 and deployment/infra-only work to OPS-01.

Verification: source-only. Tests, type-check, build, live vendor calls, UI, deployment and production runtime have not been run. No PASS is claimed.


## 2026-10-12 — Gemini dimension compatibility regression source
Added src/modules/ai-core/providers/gemini.test.ts covering known fixed dimensions, rejecting incompatible overrides, Matryoshka dimensions, unknown-model fail-closed behavior, explicit unknown-model dimensions, and invalid dimensions. Commit: 712eebf8e4295bc987c65db2d1acb371af987972. Test source is not executed; verification remains pending.


# CURRENT OWNER-AUTHORIZED NEXT ACTION — 2026-10-12 — I-098 REGISTRY INTEGRITY + GEMINI CATALOGUE

DEV-01 corrected the duplicated governance registry implementation blocks while continuing the live-catalogue audit. FIX-01 handoff is recorded as I-098.

1. FIX-01: inspect commit 8a79e296d24227f7e2caf97724c551d85b8eb4b8; confirm the retained registry exports and callers are complete, then run npm run type-check and focused governance tests when local execution is available.
2. DEV-01: continue the branch-local search for static Gemini availability bypasses and add focused regressions for live model selection / stale configuration.
3. Do not wait/poll CI or Vercel. Source commits are not PASS evidence. Current task remains IN PROGRESS with verification pending.


## 2026-10-12 — Gemini provider env fallback removed
The Gemini provider no longer reads GEMINI_CHAT_MODEL or GEMINI_EMBEDDING_MODEL directly when the resolved config is blank; both IDs must be supplied by the governance-resolved runtime config. Regression source verifies env variables cannot bypass catalogue validation. Commits: a02e92d47982a3977b82d1d3071e507eefe2feab and ffff0cf29be92740c8709fb4bc389b3522a6e350. Tests are authored only, not run. Continue the branch-local audit; I-098 remains verification pending with FIX-01.


## 2026-10-15 — Embedding reachability + re-index model alignment + chat degradation (batch 2)
Follow-up to 79130557 against the post-rebuild docker logs (Gemini embedding batches still failing with a bare "fetch failed"; the auto re-index still building with gemini-embedding-001 while the self-heal notice promised the platform default gemini-embedding-2-preview; /api/chat returning 502 on every turn while the backbone was down).

1. egress.ts — dual-stack (happy-eyeballs) connect explicitly enabled on both the direct Agent and EnvHttpProxyAgent: an IPv6 blackhole on runtimes without the Node 20+ autoSelectFamily default no longer turns into a 10-20s connect timeout against dual-stack vendors (observed: api.openai.com reachable, generativelanguage.googleapis.com timing out).
2. GeminiProvider — GEMINI_BASE_URL relay support (httpOptions.baseUrl) for servers that cannot reach generativelanguage.googleapis.com directly; invalid values warn-and-ignore instead of breaking every call.
3. vector-store-kb.ts — embedding retry logs and final errors unwrap the undici cause chain via describeNetworkError, so operators see "Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443)" plus the HTTPS_PROXY / GEMINI_BASE_URL remediation instead of a bare "fetch failed".
4. embedding-index.ts targetForIndex — NEW standard indexes build with the platform embedding default model: a stale tenant/org gemini-embedding-001 pin can no longer diverge the re-index target from the model the self-heal notice names.
5. chat.ts — retrieval failures degrade gracefully (ungrounded answer + model-facing system notice + retrieval_degraded stream event + admin incident; audit row kept alive) instead of a 502 dead end; CHAT_STRICT_RETRIEVAL=1 restores strict mode. The public widget's silent degradation now records an incident too.

Verification: npm run type-check GREEN; targeted suites all pass (egress 5+3, gemini-embedding-2 6, reindex 8 incl. 2 new realignment cases, embedding-selfheal 7, resolve-embedding-default 4, selection 7, retrieval-degradation 4, embed/chat route 3); full suite: 19 failing files, identical set to the pre-existing baseline before this batch.


## 2026-10-15 — Batch 3: Mode-B chat degradation + catalogue visibility + probe parity
Owner pull of 304e6fbb confirmed deployed (git "Already up to date"); the remaining log errors were triaged into four code-side gaps, all fixed in this batch.

1. chat.ts Mode B (legacy document-scoped chat) — embedQuery/searchSimilarDocuments failures now degrade exactly like KB-mode: ungrounded answer over the document overview, retrieval_degraded stream event, model-facing system notice, admin incident, audit row kept alive. Previously this path threw ChatRetrievalError → 502 on every turn while the embedding backbone healed. CHAT_STRICT_RETRIEVAL=1 restores the hard failure.
2. resolver.ts — the realtime_voice modelKinds list now includes 'sts': curated ElevenLabs speech-to-speech rows existed in the catalogue but never reached the agent model pickers (the realtime voice model selection showed TTS only).
3. live-catalog.ts — three catalogue-visibility fixes: (a) runSync() hydrates DB-backed runtime settings BEFORE reading provider keys (a cold instance skipped providers whose keys live only in Settings → "Models 0 / Voices 0" for the 5-minute sync TTL); (b) syncElevenLabs upserts the curated Scribe STT + conversational STS rows EVEN when the vendor /v1/models or /v2/voices call fails (an AbortError used to abort the whole sync, leaving only stale TTS rows), while still recording the vendor-outage incident; (c) fixed dead-code curated STS fallback — stsModelIds was pre-seeded with the fallback ids so the fallback loop never inserted eleven_v3_conversational when the vendor list omitted it.
4. ai-health cron — the Gemini embedding round-trip now honours GEMINI_BASE_URL (new shared embedding-probe module) so the 24/7 monitor probes the SAME endpoint the GeminiProvider uses; the probe timeout never aborts before a raised EGRESS_CONNECT_TIMEOUT_MS (+5s headroom), preventing false "backbone down" incidents on slow international routes.

Verification: npm run type-check GREEN; targeted suites 26/26 pass (embedding-probe 8, resolver 10 incl. new sts case, live-catalog.elevenlabs 2, retrieval-degradation 4); adjacent sweep src/modules/ai-governance + src/modules/assistant + egress + ai-settings-options: 171/172 with the single realtime-tool failure confirmed pre-existing on stashed HEAD (zero new failures).


## 2026-10-15 — Batch 4: Sarvam base-URL placeholder + keyless curated canvases + save-boundary guards
Owner-requested remaining items: Sarvam api.vendor.ai → api.sarvam.ai, the Models/Voices half-canvas resilience, and the ElevenLabs STT/STS listing (catalogue side landed in batch 3; this batch closes the base-URL root cause and the last zero-row paths).

1. Root cause of "api.vendor.ai" — it was never a Sarvam endpoint: it is the Base URL field's old PLACEHOLDER example ("https://api.vendor.ai"), a dead domain that does not resolve (verified NXDOMAIN while api.sarvam.ai resolves). Copied into SARVAM_BASE_URL it silently broke chat, TTS REST, the TTS WS relay, STT and catalogue discovery with connect timeouts that read as "Sarvam down".
2. voice-core/model-catalog.ts — new shared normalizeProviderBaseUrl(): unset/blank → official endpoint (blank-save regression stays fixed), bare hosts get an https:// scheme, and the exact placeholder host api.vendor.ai is rewritten to the OFFICIAL endpoint (api.sarvam.ai / api.elevenlabs.io) with a loud remediation warning. getSarvamBaseUrl + getElevenLabsBaseUrl now route through it; language-core getSarvamLanguageBaseUrl and live-catalog syncSarvam/syncElevenLabs reuse the same interpretation, so env vars, saved platform_env_settings rows, the relays (cfg.baseUrl flows from realtime-init) and catalogue discovery all agree. The user's live SARVAM_BASE_URL=https://api.vendor.ai env starts working against api.sarvam.ai with zero env changes after rebuild.
3. Save-boundary guards — both places a Base URL can be persisted now reject the placeholder with an actionable 400 (BASE_URL_PLACEHOLDER): PUT /api/platform/ai/providers/:id/credentials and POST /api/platform/env (SARVAM_BASE_URL, MULTILINGUAL_EMBEDDINGS_BASE_URL). The ProvidersWorkspace Base URL field now shows the provider's OFFICIAL endpoint as the placeholder (api.sarvam.ai / api.elevenlabs.io) with "leave empty for official endpoint" guidance; the env panel hint names api.vendor.ai as a dead placeholder.
4. Keyless curated canvases — syncSarvam and syncElevenLabs no longer return early when the API key is missing: the curated rows (Sarvam models/STT/TTS/voices on both speech capabilities; ElevenLabs Scribe STT + conversational STS) are vendor-independent and now land keylessly WITH defaults pinned, so a provider with no key (or before DB-key hydration) can never render "Models 0 / Voices 0" or a TTS-only realtime canvas. Keyless syncs make no vendor contact: no discovery fetch, no disableMissing reconciliation against unverifiable rows, and no healthy/unhealthy ai-catalog incident (the "Not configured" state is already surfaced by the connection test). OpenAI/Gemini keyless syncs likewise no longer record a false "catalogue sync succeeded" incident.

Verification: npm run type-check GREEN; targeted suites 46/46 (model-catalog 41 incl. 6 new normalisation cases, live-catalog.sarvam 2 new, live-catalog.elevenlabs 3 incl. keyless case); consumer sweep 21/21 (ai-settings-options, embed/session route, sarvam realtime-auth, elevenlabs embed-auth); full suite 1604 passed / 30 failed across 19 files — the failing-file LIST is byte-identical to the stashed-baseline run (zero new failures; the only list delta is this batch's own new test, which fails on stashed source by design).

## DEV-01 NEXT ACTION — Environment-local Feature 13/23 gating — 2026-10-22

**Authorization:** Owner-directed DEV-01 work to make Embeddable Widget & Demo (Feature 13) and Integrations/MCP/WhatsApp (Feature 23) switchable independently per application environment, production default OFF/development default ON, with all code preserved and neither environment mutating the other.

**Current source status:** Implemented on `feature/ai-core-from-doable-source` starting from `a1d2ae23`, through source HEAD `954a2261` before control-record updates. Central `src/lib/feature-availability.ts` derives strict per-process `CLARA_FEATURE_EMBEDDABLE_WIDGET` and `CLARA_FEATURE_INTEGRATIONS` values from `CLARA_ENV`; middleware rejects disabled feature routes (including preflights), no-store `GET /api/features` drives UI navigation, all relevant widget/admin/KB/publish/landing/AI console links and panels are hidden, integration runner/tools and MCP runtime guard already-registered direct invocation, and super-admin runtime flags display effective states. Full paths, commits and tests are in DEV-01 WORKLOG and SESSION-DEV-20261022-FEATURE-FLAGS-01.

**Open verification:** GitHub source writes accepted only. New and adjusted tests, TypeScript, lint/build, real provider/OAuth/WhatsApp/MCP, both live environments, Vercel/CI and end-to-end validation are **NOT RUN**. This is not production deployment or a PASS.

**Exact next DEV-01 step:** On a runnable checkout, execute once:
`npx vitest run src/lib/feature-availability.test.ts src/middleware.features.test.ts src/features/admin/settings-nav.features.test.ts src/modules/ai-platform-core/mcp-tool-bridge.test.ts src/modules/integrations/runtime/runner-core.test.ts src/modules/ai-platform-core/integration-ai-tools.test.ts src/modules/ai-platform-core/integration-action-tool.test.ts`
and `npm run type-check`. Fix only concrete failures; add discovered missed feature-owned endpoints to the policy without broadening any shared features. No repetitive CI/Vercel wait.

**OPS-01 handoff:** In separate deployment env files/configuration set `CLARA_ENV=production` with both optional flags OFF (defaults), and `CLARA_ENV=development` with both ON (defaults), preserving isolated PG schema, Qdrant collections and queue namespaces. Apply only through authorized deployment controls and verify both independently: optional URLs reject with `FEATURE_DISABLED` in production; development routes continue normal auth/consent/plan flow; native core app unaffected. Do not enable external OAuth or provider credentials without explicit authorization. CI/CD and infrastructure belong to OPS-01; substantial independent bugs to FIX-01.

**Stop boundary:** No production migration, live credential changes, shared DB flags, build-time `NEXT_PUBLIC_*` feature switches, broad endpoint gating or additional unrelated features.

### DEV-01 Feature flags — scheduled work and discovery follow-up (2026-10-22)
- After the initial source implementation, audited self-hosted scheduled WhatsApp tasks and direct third-party action discovery. `configuredCronJobs()` now filters disabled WhatsApp cron entries without suppressing platform health/onboarding (`df9d6e3b`, test `50b38171`), and `getIntegrationActions()` returns no provider actions without invoking `loadPiece()` when integration feature is off (`c116fe7b`, test `c633594e`).
- **Next bounded run also includes** `src/lib/local-cron.test.ts`, alongside the earlier seven suites and `npm run type-check`. Source-only until executed; no production scheduler restart or deployment.
