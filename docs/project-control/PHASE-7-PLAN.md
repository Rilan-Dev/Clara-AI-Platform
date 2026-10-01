# PHASE-7-PLAN.md — Phase 7 Planning Package (Pre-Implementation Baseline)

> **Phase 7 planning artifact — established by the Phase 7 planning/baseline handoff issued by ChatGPT (architect) and executed by Z.AI (developer) on 2026-10-02.** This package establishes the Phase 7 baseline, the capability inventory, the existing-vs-missing matrix, the Doable-source reuse map, the proposed architecture, adapter boundaries, the dependency graph, risk/issue reconciliation, acceptance criteria, verification gates, rollback strategy, ordered sub-phases, and the explicit stopping boundary. It is a **planning and authorization-boundary artifact only**: it contains proposals and evidence, **no implementation authorization** — Phase 7 implementation has NOT started and may begin only after the architect reviews this package and issues an explicit implementation authorization handoff. Nothing in this package claims architect approval; every classification and scope proposal herein is `[developer-reported]` and awaits architect review.
> Snapshot date: **2026-10-02**. Repository state is authoritative — refresh it before acting (`ZAI_HANDOFF.md` §I.6). Evidence classes per `VERIFICATION_STATE.md` §"Evidence classes" (D-012).
> Deliverable-coverage map (handoff §13 items → sections): 1 objective → §3 · 2 scope/non-scope → §4 · 3 capability inventory → §5 · 4 existing-vs-missing matrix → §6 · 5 reuse matrix → §7 · 6 architecture → §8 · 7 adapter boundaries → §9 · 8 dependency graph → §10 · 9 risk analysis → §11 · 10 issue dependencies → §12 · 11 database → §13 · 12 security → §14 · 13 multi-tenant → §15 · 14 provider → §16 · 15 testing strategy → §17 · 16 verification gates → §18 · 17 acceptance criteria → §19 · 18 rollback → §20 · 19 ordered sub-phases → §21 · 20 stopping boundary → §22.

---

## 1. Purpose and authority boundary

This package was produced under the architect's **Phase 7 — Planning, Scope Definition & Pre-Implementation Baseline** handoff (received 2026-10-02). That handoff authorizes exactly: repository pre-flight verification; reading and reconciling the complete project-control state; establishing the Phase 7 starting point; determining the Phase 7 objective from repository records; investigating (without implementing) the Clara AI-platform architecture; producing the capability classification (A–E); the architecture proposal; the dependency graph; risk/issue reconciliation; acceptance criteria; the Gates A–F design; and persisting this package under the existing project-control conventions.

It does **not** authorize: any change to `src/**`, `packages/**`, database migrations, Supabase, `vercel.json`, deployments, the immutable Doable-source trees, new product capabilities, provider integrations, agent-runtime/MCP/UI implementation, or Phase 7 implementation of any kind. No such change was performed. Phase 7 is **not** marked `PASS` or `CLOSED` anywhere by this package; only ChatGPT/project-owner review can close a phase (D-009), and no architect review of this package has occurred at the time of writing.

## 2. Verified starting baseline (pre-flight, executed 2026-10-02 — all `[developer-reported]`, Git-verifiable)

Pre-flight was executed per the handoff §1 and `ZAI_HANDOFF.md` §I.6 before any work: `git fetch --prune origin`; branch, HEAD, tree, ancestry, mainline, immutable-source, and `vercel.json` checks; re-run of the established deterministic validation scripts; and a scratch-harness run of the Doable-source extraction verifier (the library's own verifier cannot run in-place in the Clara layout — see §11/I-014).

| Item | Current state (2026-10-02) |
|---|---|
| Phase 6 | `CLOSED` — architect re-review `PASS` (2026-10-01) of the reviewed correction `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; issue I-013 `RESOLVED`; closure record `3657035ac878da98decd98929fb0deb45aed1fbe` |
| Phase 7 | **`NOT STARTED` (implementation)** — the architect issued the Phase 7 **planning** handoff on 2026-10-02 [architect-verified workflow action]; this package is its execution. Canonical phase status after this package: `PLANNED` (defined, implementation not authorized; D-011 vocabulary — "phase defined but not started") |
| Latest architect-verified implementation | `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884` ("docs: correct phase 6 p2 p3 closure policy" — the reviewed Phase 6 correction) |
| Latest closure-record commit | `3657035ac878da98decd98929fb0deb45aed1fbe` ("docs: record architect approval of phase 6" — the immediate child of `4dc8a573`; verified) |
| Correction baseline (Phase 6) | `c0cca964064286c25dcf22c8f86038baaacd7ebe` — preserved; verified chain `c0cca964 → 4dc8a573 → 3657035a` |
| Current branch | `feature/ai-core-from-doable-source` (checked out in the linked worktree `/home/z/my-project/.worktrees/vc` of repository `Rilan-Dev/Clara-AI-Platform`) |
| Origin synchronization | local HEAD = `origin/feature/ai-core-from-doable-source` = `3657035a` after `git fetch --prune origin` (2026-10-02); 24 commits ahead / 0 behind `Vite-Converted` (merge-base `5ca8ec58` = its tip) |
| Working tree | clean (`git status --porcelain` empty) before this package's documentation work |
| Mainlines | `main` `550630f5` unchanged · `Vite-Converted` `5ca8ec58` unchanged · `Vercel-Preview` `db6cdb48` unchanged · **`Vercel-Prod` moved `e0ead990` → `bae53a07`** (merge of PR #262 from `Vite-Converted`, fast-forward — an external production event observed at the 2026-10-02 fetch; production-branch movement is outside developer scope and is recorded here for architect awareness, not acted upon) |
| Open issues | I-001 `open` (missing `docs/AGENTS.md` reference) · I-007 `open` (stale `.github/copilot-instructions.md` reference) · **I-014 `OPEN` (new — opened by this planning session: vendored Doable-source library incomplete relative to its own immutable manifest; see §12)** · I-013 `RESOLVED` |
| Open risks | R-1 mitigation-in-progress · R-2 open · R-3 open (D-P4 pending) · R-4 open · R-5 open (`RISKS.md`; R-3/R-4/R-5 are architect-controlled and not resolved by this package) |
| Outstanding decisions | D-P2 `PENDING` (I-001 disposition) · D-P3 `PENDING` (which AI seam feature phases target — directly relevant, §23) · D-P4 `PENDING` (Vercel `ignoreCommand` × `deploymentEnabled` semantics — Gate F relevance, §18) |
| Immutable-source status | No changes since the vendoring commits (`git diff 03482584..3657035a` empty on `docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**`, `doable-source-extensions/**`); `b65725e5` ancestry intact. Extraction-verifier (scratch harness @ `3657035a`): **771/771 present pinned files byte-identical to the Doable baseline `a6036d1f`**; 31 pinned files (the `mcp-servers/` family) **absent** — I-014; 10/93 captured root trees failing, all confined to the absent family; `requiredFiles`/`packageHardening`/`externalDependencyInventory`/`uiReferenceFiles` PASS; `validate-library.mjs` PASS (21 capabilities, 21 manifests, 30 graph edges, 0 errors) |
| Product-code status | Unchanged by the entire project-control program: the 24-commit feature-branch delta over `Vite-Converted` is documentation + the external `b65725e5` `vercel.json` change only; `src/modules/ai-platform-core/` exists from the pre-program wiring commits (`e7587bdb`/`5c71203b`/`65842584`/`5ca8ec58`) and is untouched since |
| DB status | No migrations executed or written by the program; Clara migrations live in `src/lib/db/migrations/` (54 numbered SQL files); R-4 (auto-apply on deploy) unchanged |
| Deployment status | No deployments performed by the program; `vercel.json` unchanged since `b65725e5` (last commit touching it, verified); the observed `Vercel-Prod` movement (above) was not caused by this branch |
| Deterministic baselines re-run | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → **8/8, exit 0** (P0 → closure eligibility FAIL verified) · `bash docs/project-control/verification/correction-cycle-test.sh` → **exit 0 (24/24 determinations)** · `npm run validate:model-config` → **PASS** · `node docs/doable-source/verification/validate-library.mjs` (from the library root) → **PASS** |

## 3. Phase 7 objective determination (handoff §4)

### 3.1 What the repository records say

Two repository records define phase sequencing, and they must be reconciled explicitly rather than silently:

1. **The 13-phase plan** (`docs/superpowers/plans/2026-10-01-clara-project-control-system.md`) defines: Phase 7 — **Vercel Operations Gate** ("make deployment an independently verified lifecycle stage"); Phase 8 — Supabase Operations Gate; Phase 9 — Phase-Orchestration Protocol; Phase 10 — **Clara Feature Program Initialization** ("launch the actual Clara AI platform expansion: multi-provider, integrations, MCP, and Agent Work Mode"), with the feature-program order: 1. Multi-provider foundation · 2. Unified Tool Runtime · 3. Integrations framework · 4. MCP framework · 5. Single-agent runtime · 6. Agent Work Mode · 7. Memory and Skills · 8. Runs/observability/usage · 9. Agent UI · 10. Templates/marketplace/automation expansion. `RISKS.md` R-2/R-3 likewise state that deployment gates arrive "Phase 7" (per that ladder).
2. **The architect's issued Phase 7 planning handoff** (2026-10-02 — the assignment this package executes) states: "Phase 7 must continue the broader objective of extracting and integrating reusable AI-platform capabilities from the Doable source into Clara AI Platform", and requires the capability classification, the AI-platform scope investigation, Gates A–F design (including Gate F — deployment), and the planning package — while withholding implementation authorization.

The original project objective is consistent across records: branch `feature/ai-core-from-doable-source`; the vendored library `docs/doable-source/` ("reusable AI-platform source library extracted from Doable", `README.md`); the pre-program wiring commits ("wire AI Platform Core into Clara host adapters", `5ca8ec58` ancestry); `PROJECT_STATE.md` Identity. The project-control program (Phases 0–6) was the governance foundation laid around that objective; the capability-integration work itself has not begun under the control system.

### 3.2 Proposed reconciliation (architect ratification required — §23 item 1)

The architect's issued Phase 7 handoff is the controlling architect action (only ChatGPT authorizes phase content and advancement — D-009; the handoff explicitly redirects Phase 7 to the AI-platform capability program). The planning package therefore proposes recording this reconciliation when the architect ratifies the scope:

- **Phase 7 becomes the first AI-platform capability-integration phase** (the plan's Phase 10 feature program, accelerated into Phase 7 by the architect's handoff), executed under the already-established governance: the Phase 5 Gates A–F contract (D-020), the Phase 6 correction/issue-control workflow, the Phase 4 worklog/session audit, and the Phase 2/3 handoff/continuity systems.
- **The plan's Phase 7 (Vercel Operations Gate) and Phase 8 (Supabase Operations Gate) materialize as conditional Gates F/E evidence protocols inside feature phases** (they are already defined as conditional gates in the Phase 5 contract: Gate E required iff database surfaces change; Gate F required iff a deployment is performed/required — `VERIFICATION_STATE.md` §"Gate applicability"). Phase 9 (phase-orchestration) is already operating in practice (the handoff→implement→review→correct→close loop has run six times).
- This re-sequencing is **proposed, not enacted**: the plan document itself is not modified by this package (out of scope); the architect should record the sequencing decision in `DECISIONS.md` when ratifying the Phase 7 implementation authorization (§23).

### 3.3 Proposed Phase 7 objective (implementation — awaiting authorization)

> **Phase 7 — AI Platform Core Foundation: establish the host-neutral contracts/adapter seam and the Unified Tool Runtime in Clara host code** — the keystone layer that later capabilities (MCP, integrations, agent runtime, work mode, memory, skills) build on — by (a) implementing the library's host-neutral contract/adapter pattern as Clara host code (execution context from Clara identity/tenant; fail-closed adapter registry), (b) implementing the Unified Tool Runtime (tool definitions/schemas, registry, invocation, execution context, result normalization, errors, streaming tool events; metering hooks onto the existing usage spine) and migrating the existing `rag_search` tool onto it with behavior-preserving tests, and (c) optionally (sub-phase 7-C, only if explicitly included in the implementation authorization) extending the provider abstraction with a tool-calling surface and piloting a flagged agentic tool loop on one surface — **without** modifying the immutable Doable-source trees, **without** database migrations, and **without** changing existing production route behavior (except a single explicitly-approved, flag-gated migration pilot).

Rationale (evidence): the Doable dependency graph (`docs/doable-source/capabilities/DEPENDENCY_GRAPH.json`, 30 edges) makes `tools` the keystone — `chat -[required]-> tools`, `agents -[required]-> tools`, and `tools -[bridge]-> mcp` / `tools -[bridge]-> integrations`; Clara already has `chat` and `multi-provider` (§6), so the tool runtime is the missing foundation of the required closure; the plan's feature order agrees ("1. Multi-provider foundation → 2. Unified Tool Runtime → …", with Clara's multi-provider already existing per §6 and therefore classified C); and Clara's only tool today is a single hardcoded `rag_search` (`src/modules/ai-platform-core/clara-runtime.ts` `tools` seam; `src/modules/assistant/api/realtime.ts` registers exactly one function tool; no registry, no tool-calling loop in `src/modules/assistant/api/chat.ts`).

## 4. Proposed scope / non-scope (implementation — awaiting authorization)

**Scope (proposed, ratified only by the architect's implementation authorization):**

1. `src/modules/ai-platform-core/**` — extension of the existing host seam module (D-003 role: new host code): execution-context factory; host adapter registry + fail-closed validation; the Unified Tool Runtime; (7-C only if authorized) the provider tool-calling surface and flagged tool loop.
2. `src/modules/ai-core/types.ts` + `src/modules/ai-core/providers/openai.ts` — **7-C only**: an optional, additive `tools` surface on `ChatOptions`/stream events (feature-flagged; all other providers unchanged and unaffected).
3. Tests: new unit/integration tests colocated per Clara convention (`*.test.ts` beside sources); no production route changes (except a single explicitly-approved flag-gated pilot route usage, 7-C only).
4. Zero new runtime npm dependencies anticipated (`zod ^3.25.76` already in `package.json` for tool schemas; `ws ^8.18.0` present) — any dependency addition would require explicit architect approval and must come from the library's inventory (`docs/doable-source/external-dependencies/external-dependencies.json`).

**Non-scope (explicit):** no modification of `docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**`, or `doable-source-extensions/**` (D-007 — treat `doable-source-extensions/` as immutable-by-provenance: it is pinned in `verification/immutable-source-manifest.json` even though `verification/IMMUTABLE_PATHS.json` lists only the first three roots); no `b65725e5` modification; no `vercel.json` change; no database migrations or Supabase operations (Gate E `NOT_APPLICABLE` unless the architect later authorizes persistence changes); no deployments (D-004); no production-branch work (D-008); no MCP, integrations, agent runtime, work mode, memory, skills, attachments, image generation, marketplace, templates, automation, collaboration, or UI implementation (all classified B/E in §7); no rewrite of the incumbent `src/modules/ai-core` provider/resolver behavior (alignment only via the seam); no R-3/R-4/R-5 resolution; no resolution of I-001/I-007/I-014 (architect triage); no Phase 8+ work.

## 5. Capability inventory (investigated 2026-10-02 — read-only; handoff §5)

The full ~30-area investigation combined a complete read of the project-control set, the Doable-source library governance/manifests, and a systematic source-level survey of Clara's `src/modules/**`, `src/app/api/**`, `src/components/admin/**`, `packages/**`, `src/lib/**`, and the persistence stack. The inventory distinguishes **what exists in Clara today** (with file evidence), **what the immutable Doable library provides** (with source-boundary evidence), and the resulting classification (§7). Clara module map (one line each, as surveyed): `admin` (legacy ingest/vector-store/hybrid-search), `admin-ui` (typed admin API clients), `agent-versioning` (git-like agent-config version control), `ai-core` (brain-axis provider abstraction/resolution/catalog), `ai-governance` (provider registry/credentials/health/entitlements/usage), `ai-platform-core` (the host seam — thin binding), `assistant` (chat/voice assistant API+UI), `auth` (auth+RBAC), `billing`, `cloud-jobs`, `docs`, `embed` (public widget core), `events` (outbox), `graph` (graph RAG), `ingest` (parsers/chunkers/crawler), `knowledge-bases` (KB domain+workers+analytics/audit DB), `language-core` (Sarvam translation pipeline), `organisations` (orgs/agents/AI settings), `phone` (Twilio/Vonage), `platform-health`, `queue`, `rag` (grounding service), `shared`, `voice-core` (voice-axis providers/realtime infra). The Doable library provides 21 catalogued capabilities (§6/§7) with 12 contract files, 7 adapter files, a 30-edge dependency graph, and a 573-package external-dependency inventory (526 Activepieces pieces).

## 6. Existing-vs-missing matrix (Clara ↔ reusable Doable inventory)

| # | Capability area | Clara today (evidence) | Doable library (evidence) | Verdict |
|---|---|---|---|---|
| 1 | Multi-provider AI / provider abstraction | **EXISTS** — `src/modules/ai-core/`: `LLMProvider` (`types.ts`: chatStream/embedText/embedBatch/getModelName/getEmbeddingDimension), `ProviderFactory` (cached), providers `openai`/`gemini`/`sarvam` + embeddings-only `tei`; per-tenant resolution `resolve.ts` (KB-override → agent version → `agent_ai_settings` → `org_ai_settings` → platform registry → env, gated by ai-governance entitlements; embedding-backbone split) | `capabilities/multi-provider/MANIFEST.md` (catalog→credentials→validation→discovery→resolver→runtime→UI; broader vendor catalog incl. Anthropic/OpenAI-compatible/BYOK) | **C** for the foundation Clara has; broader catalog expansion = **B** |
| 2 | Model configuration / catalog | **EXISTS** — `ai-core/model-catalog.ts` (models/pricing/dimensions/validation), `ai-governance/core/registry-db.ts` (`platform_ai_provider_models` + live-catalog sync), org/agent settings DBs, `api/platform/ai/**` routes, admin UI (`components/admin/ai-platform/ProvidersWorkspace.tsx` 977 lines) | provider catalog/data tables in `doable-source/packages/shared/src/ai/` | **C** |
| 3 | Chat providers / AI request lifecycle | **EXISTS** — `assistant/api/chat.ts` (Mode A: validate → parallel resolve → rate gate → atomic quota admission → optional translation → grounding → system prompt → chatStream → NDJSON events → finalize+hash-chain; legacy Mode B); sessions persistence `api/chat/sessions/**` | `capabilities/chat/MANIFEST.md` (adds tool calls, user-input pauses, recovery) | **C** for the lifecycle; tool-calling loop + stream recovery = **A3/B** |
| 4 | Realtime/voice providers | **EXISTS** — `voice-core/**` (providers ElevenLabs/Sarvam + OpenAI Realtime/Gemini Live client sessions; 3 modes; metering/pricing/credit-alerts; latency tracker), `modules/phone/**`, relays | library has **no** native realtime voice (`adapters/capability-map.ts`: `voice-realtime` `hostSpecific:true`, empty Doable sources) | **C** — Doable provides nothing to duplicate; voice stays host-specific |
| 5 | Embeddings | **EXISTS** — same `LLMProvider` interface; OpenAI/Gemini/TEI multilingual; Qdrant vector store (`admin/core/vector-store*.ts`); per-collection embedding registry + reindex (`knowledge-bases/core/embedding-index.ts`) | embeddings ride the provider capability | **C** |
| 6 | AI generation (image/media) | **ABSENT** — no image-generation code anywhere in `src/` (searched) | `mcp-servers/image-generator` + `capabilities/ai-media-builders` — **source absent in the vendored copy (I-014)** | **E** (MCP-gated + I-014) |
| 7 | Usage tracking / credits / quotas | **EXISTS** — `usage_events`/`query_events` spine, `lib/quota-admission.ts` (advisory-lock rolling-24h), `lib/plan-guard.ts`, provider usage reports/budgets, credit alerts, subscriptions (Stripe/Razorpay) | `doable-source-extensions/usage/` + platform-foundation billing/credits | **C** |
| 8 | Tracing / observability | **PARTIAL** — per-turn latency instrumentation (`voice-core/realtime/latency-tracker.ts`), RAG `Server-Timing`, provider health history, analytics aggregation; **no** distributed tracing/trace store (a `chat_traces` table exists only in the vendored reference) | AI trace collector/infra + `doable-source-extensions/observability/` | **B** (Runs/observability per plan feature order #8) |
| 9 | AI request lifecycle hardening / provider failover | **PARTIAL** — resolution-time fallback only (`ai-core/resolve.ts` platform-default self-heal), transport retries, bounded socket reconnects; **no** runtime brain-provider failover | multi-provider manifest completion test ("recover from provider failure") | **B** |
| 10 | Integrations framework | **ABSENT** — no catalog/connections/OAuth/credential vault for third-party apps (searched; `oauth` zero matches in `src/`) | `capabilities/integrations/MANIFEST.md` (catalog→OAuth→vault→tool bridge; Activepieces) | **E** (gated on tools + secrets policy) |
| 11 | Tools / tool calling | **PARTIAL** — one hardcoded `rag_search` tool (`ai-platform-core/clara-runtime.ts` tools seam; `assistant/api/realtime.ts:149-174`; ElevenLabs server-tool webhook `api/internal/elevenlabs/tools/rag-search`); **no registry, no schemas, no loop**; `LLMProvider.chatStream` is a string-only stream (`ai-core/types.ts:49`; no `tools` in `ChatOptions`) | `capabilities/tools/MANIFEST.md` (definitions/schemas/registry/invocation/execution context/normalization/errors/streaming events/human-input pause-resume) + `doable-source/services/api/src/ai/tools/` | **A2** (the keystone) |
| 12 | MCP | **ABSENT** — dormant flag only (`rag/config.ts` `enableMcp` default false, unconsumed; `lib/runtime-flags.ts` UI badge) | `capabilities/mcp/MANIFEST.md` + `doable-source/services/api/src/mcp/` (present & byte-verified) | **E** (gated on A2 + sdk/secrets decisions) |
| 13 | Agent runtime | **PARTIAL** — agents are versioned config objects (`agent-versioning/core/service.ts` 866 lines: draft/version/branch/merge/publish/deploy-pointer/rollback; resolution serves the active deployment); **no execution runtime, no autonomous loop** | `capabilities/agents/MANIFEST.md` (engine/modes/tool loop/user-input blocking) | **B/E** (gated on tools; plan order #5) |
| 14 | Agent work mode | **ABSENT** (no agent execution modes; `ragMode: "agentic"` anticipated as a config value in `clara-runtime.ts`) | `doable-source/services/api/src/ai/modes/*` (agent/plan/chat) | **B/E** (plan order #6) |
| 15 | Memory | **PARTIAL** — session persistence + bounded in-prompt context (`assistant/api/conversation-context.ts`); **no** long-term/episodic memory | `capabilities/context-memory/MANIFEST.md` + `doable-source/services/api/src/context/` | **B/E** (plan order #7; host RAG stays the retrieval spine) |
| 16 | Skills | **ABSENT** — zero `skill` matches in `src/` | `capabilities/skills/MANIFEST.md` + skills source (present & byte-verified) | **B/E** (plan order #7) |
| 17 | Attachments (chat) | **ABSENT** — text-only chat input (`assistant/ui/chat/MessageInput.tsx`); file upload exists only for KB ingestion | `doable-source/services/api/src/ai/attachments.ts` + UI | **B** |
| 18 | Persistence | **EXISTS** — PostgreSQL via `pg` raw SQL (`lib/db.ts`, `lib/db/migrations/` 54 files, runtime `ensureMigrated()`), Qdrant, Redis/BullMQ, RabbitMQ bridge + outbox | `dependency-closure/packages/db/` (Doable schema — reference for reconciliation, not to be applied) | **C** (Clara's stack authoritative; Doable schema = **D**) |
| 19 | Analytics | **EXISTS** — `api/analytics/**` (queries/revenue/usage), per-KB analytics, org usage-vs-plan | `doable-source-extensions/analytics/` | **C** |
| 20 | Audit | **EXISTS** — tamper-evident per-org hash chain (`knowledge-bases/core/analytics-db.ts`), PII redaction, verify/reveal/export routes | `doable-source-extensions/audit/` | **C** |
| 21 | Notifications | **EXISTS** — email templates + delivery + queued notifications with admin retry | `doable-source-extensions/notifications/` | **C** |
| 22 | Collaboration (realtime/Yjs) | **ABSENT** — no Yjs/presence/CRDT in `src/` (searched) | `capabilities/realtime-collaboration` + `doable-source/services/ws/` (present) | **D/B** — no Clara product surface for it today |
| 23 | Templates | **EXISTS** — admin **email** templates (not agent templates); platform Default Assistant as creation seed | Doable app templates/scaffolding (`dependency-closure/services/api/src/templates/`) | **C** (email) / **D** (app templates — not applicable to Clara's product) |
| 24 | Marketplace | **ABSENT** — zero matches in `src/` | `capabilities/marketplace` + extensions (bundle codecs present) | **E** (gated on skills+MCP; plan order #10) |
| 25 | Automation / workflows | **ABSENT** — internal schedulers/workers only (ingest poller, expiry sweep, outbox) | no direct Doable equivalent (Activepieces ecosystem adjacent) | **B/E** (plan order #10) |
| 26 | Workspace/sandbox/process execution | **ABSENT by design** — Clara has no user project-filesystem/sandbox concept; its "workspace" is the KB | `capabilities/workspace-sandbox` (present) | **D** — Doable's model is a code-editor product; no Clara adapter target |
| 27 | AI security scanning | **ABSENT** | `capabilities/ai-security` (present & byte-verified) | **B** (later; useful for generated-code workflows) |
| 28 | Visual editing / AI visual editing | **ABSENT** (not Clara's product) | `visual-editing`/`visual-ai-editing` (present) | **D** |
| 29 | Document builders / NotebookLM / MCP tool servers | **ABSENT** | `mcp-servers/*` — **source absent in the vendored copy (I-014)**; only 2 package-manifest stubs vendored | **E** (I-014 + MCP-gated) |
| 30 | Host seam (`ai-platform-core`) | **EXISTS (thin)** — `clara-runtime.ts` (145 lines) binds resolver+RAG+chat+voice+one tool; **not used by production routes** ("Existing production routes are intentionally unchanged in this first wiring step" — module README); no loop/metering hooks/memory | `contracts/` + `adapters/` define the seam pattern to implement | **A1** — the integration point to build out |

## 7. Doable-source reuse map + A–E classification (handoff §4)

### 7.1 Reuse map — Doable source → Clara adapter/integration boundary

| Doable capability (immutable source boundary) | Reuse mode proposed for Clara | Clara adapter boundary |
|---|---|---|
| `multi-provider` (`doable-source/services/api/src/ai/`, `packages/shared/src/ai/`, `packages/doable-ai/`) | **Behavioral reference only** for Phase 7 — Clara's own provider stack (C) stays authoritative; later phases may mine the broader vendor catalog (B) | Clara `ai-core` resolver/factory already bind identity→provider; no adapter needed now |
| `tools` (`services/api/src/ai/tools/`, tool bridges) | **Behavioral model to re-implement in host code** (A2): registry/definition/schema/invocation/normalization/error/streaming-event semantics — read as reference, never imported | New Unified Tool Runtime in `src/modules/ai-platform-core/`; execution context from Clara identity; invocation authorized via existing RBAC/entitlements; metered via existing usage spine |
| `agents` / `chat` (`services/api/src/ai/` engine+modes, `routes/chat/`) | Reference for the later agent-runtime phase (B/E) — the tool loop, user-input blocking, stream recovery semantics | Future agent runtime sits behind the seam; Clara chat route remains the transport |
| `context-memory` (`services/api/src/context/`) | Reference for the later memory phase (B/E) | Host RAG (Qdrant grounding) remains the retrieval spine; memory adapters later |
| `integrations` (`services/api/src/integrations/` + routes) | Reference for the later integrations phase (E) | Future: OAuth/credential vault on Clara's secret boundaries; Activepieces piece install list required by the manifest |
| `mcp` (`services/api/src/mcp/`) | Reference for the later MCP phase (E) | Future: tool-registry bridge (tools -[bridge]-> mcp); `@modelcontextprotocol/sdk` dependency decision; egress/SSRF policy |
| `skills` (`services/api/src/ai/skills*`) | Reference for the later skills phase (E) | Future: agent-scoped skill loading |
| `contracts/` (12 host-neutral port files) + `adapters/` (registry/bridge/validation/capability-map/ui-inventory) | **Design pattern to follow in host code** (A1) — the ports (ExecutionContext, ToolRegistryAdapter, ProviderRegistry/Resolver, ChatTransport, IdentityTenant, SecretCredential, RAGAdapter, platform-foundation adapters) are the seam vocabulary | Host-side implementation in `src/modules/ai-platform-core/` (new code), binding Clara's existing services; **the immutable library is never imported at runtime** |
| `platform-foundation` / `platform-extensions` (auth/RBAC, billing, usage, audit, analytics, notifications, email, GitHub, version-control, deployment/domains, marketplace infra, editor UI) | **Reference only (D)** — Clara already has its own equivalents (C) for every foundation area it needs | None — Clara's `auth`, `ai-governance`, billing, analytics, audit, notifications are authoritative |
| `workspace-sandbox`, `visual-editing`, `visual-ai-editing`, `realtime-collaboration`, `mcp-servers/*` (incl. document builders, NotebookLM, image generator) | **Reference only (D) / blocked (E)** — no Clara product surface (workspace/visual/collab) or source absent (`mcp-servers/*` — I-014) | None for Phase 7 |

### 7.2 Classification A–E (every entry carries repository evidence)

**A — Phase 7 candidate scope (proposed; architect ratification required):**
- **A1 — Host contracts/adapter foundation.** Evidence: `docs/doable-source/contracts/` (12 files defining `ExecutionContext`, `ToolRegistryAdapter`, `ProviderRegistryAdapter`, `ChatTransportAdapter`, `IdentityTenantAdapter`, `SecretCredentialAdapter`, `RAGAdapter`, platform-foundation adapters); `docs/doable-source/adapters/adapter-registry.ts` + `adapter-validation.ts` (fail-closed registration, 14 required slots); `src/modules/ai-platform-core/clara-runtime.ts` + its README ("the first concrete host integration… existing production routes intentionally unchanged"); pending decision D-P3 / deferred issue I-005 (dual AI stacks — seam must be declared).
- **A2 — Unified Tool Runtime.** Evidence: `docs/doable-source/capabilities/tools/MANIFEST.md` ("Implement definitions, schemas, registry, invocation, execution context, result normalization, errors, streaming events and human-input pauses/resume"); Clara's single-tool state (`clara-runtime.ts` tools seam with only `rag_search`; `assistant/api/realtime.ts:149-174`; `api/internal/elevenlabs/tools/rag-search/route.ts`); dependency graph edges `chat -[required]-> tools`, `agents -[required]-> tools`, `tools -[bridge]-> mcp|integrations`; plan feature order #2.
- **A3 — (optional) Provider tool-calling surface + flagged tool-loop pilot.** Evidence: `src/modules/ai-core/types.ts:49-56` (`chatStream` returns `AsyncGenerator<string>`; `ChatOptions` has no tools field — confirmed by source inspection); `ragMode: "agentic"` already anticipated in `clara-runtime.ts`; OpenAI Realtime already registers a function tool client-side (`assistant/api/realtime.ts`). Included **only** if the architect explicitly authorizes sub-phase 7-C.

**B — Later-phase scope (outside Phase 7):** MCP framework (plan #4) · integrations framework (#3) · single-agent runtime (#5) · agent work mode (#6) · memory + skills (#7) · runs/observability/tracing + runtime provider failover (#8) · agent UI (#9) · templates/marketplace/automation expansion (#10) · chat attachments · provider-catalog expansion (Anthropic/OpenAI-compatible/BYOK) · AI security scanning · realtime collaboration (also D). Evidence: each is absent or partial in Clara (§6) and gated behind the tool foundation (§10); none is required to deliver A1–A3.

**C — Existing Clara capability (must not be duplicated):** brain-axis multi-provider + resolution ladder + embedding backbone; model catalog + governance registry + credentials + health + connection tests + live-catalog sync; chat lifecycle (Mode A/B) with quota admission, metering, NDJSON streaming, PII redaction, hash-chain audit; realtime/voice stack (4 providers, 3 modes, telephony, relays, latency instrumentation); embeddings incl. TEI multilingual + per-collection registry; usage/credits/quotas/budgets/alerts; analytics; audit; notifications/email templates; admin AI-platform UI; persistence stack; agent-config versioning; embed widget + public tokens; language pipeline. Evidence: §6 rows 1–5, 7, 18–21, 30 and the surveyed file set (`src/modules/**`).

**D — Doable-source reference only (study/reuse later; not integrated):** `workspace-sandbox` (no Clara project-filesystem concept); `visual-editing`/`visual-ai-editing` (code-editor surfaces); Doable app templates/scaffolding; `realtime-collaboration` (no Clara surface today); `doable-source-extensions/` platform families (auth/MFA/OAuth/RLS, billing, GitHub, version-control, deployment/domains, email infra, marketplace infra, analytics/observability/audit/notifications extensions) — Clara's own equivalents (C) are authoritative; Doable's DB schema (`dependency-closure/packages/db/`, 121 migrations across two closure trees) is schema-reconciliation reference only. Evidence: §6 rows 18, 22–23, 26, 28; `EXTRACTION_MANIFEST.md` "reusable code vs host bindings".

**E — Blocked / dependency-gated (cannot safely begin until a prerequisite exists):** MCP framework (gated on A2 + `@modelcontextprotocol/sdk` dependency decision + secrets/egress policy + disposition of the dormant `enableMcp` flag); integrations (gated on A2 + OAuth/credential-vault design + the Activepieces piece install list the manifest mandates + R-5-aware secret handling); agent runtime + work mode (gated on A2/A3); skills + long-term memory (gated on agent runtime); image generation, document builders, NotebookLM, `mcp-tool-servers` (gated on the MCP framework **and** on I-014 — their source is absent from the vendored copy); marketplace (gated on skills + MCP per `marketplace -[packages]-> skills|mcp`); any DB-migration-requiring work (gated on the Gate E evidence protocol and R-4); any deployment-requiring work (gated on the Gate F protocol and D-P4/R-3 confirmation). Evidence: `DEPENDENCY_GRAPH.json` edges; §6; `RISKS.md` R-3/R-4/R-5; I-014.

## 8. Proposed Phase 7 architecture (description + diagram)

Layering (explicit distinction of the four required categories — **immutable reusable core** / **Clara host integration+adapters** / **existing Clara infrastructure** / **future work**):

```text
┌─ EXISTING Clara infrastructure (authoritative; reused as-is; classification C) ──────────────┐
│  src/app/api/** (chat · voice · embed · agents · platform/ai · analytics · audit …)          │
│  src/modules/{ai-core, ai-governance, assistant, voice-core, knowledge-bases, organisations, │
│               agent-versioning, rag, auth, embed, language-core, phone, …}                   │
│  persistence: PostgreSQL (raw SQL · 54 migrations) · Qdrant · Redis/BullMQ · RabbitMQ outbox  │
│  governance spine: quota admission · usage_events/query_events metering · hash-chain audit    │
└───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                │ consumed through adapters (unchanged behavior)
┌───────────────────────────────▼──────────────────────────────────────────────────────────────┐
│  PROPOSED Phase 7 host code — src/modules/ai-platform-core/** (Clara adapters; A1/A2[/A3])   │
│   · ExecutionContext factory: ClaraRuntimeContext (orgId/agentId/kbId/userId/sessionId)      │
│     → host-neutral tenant context (identity/tenant adapter — fail-closed)                    │
│   · Host adapter registry + validation (pattern: contracts/ + adapters/ — never imported)    │
│   · Unified Tool Runtime: ToolDefinition (zod schema) · ToolRegistry · invoke() with          │
│     ExecutionContext · result normalization · typed errors · streaming tool events ·          │
│     per-tool authorization (RBAC + entitlements) · usage-metering hooks                       │
│   · Tool inventory (Phase 7): rag_search (migrated) — the registry is the extension point    │
│   · [7-C only, flag-gated] provider tool-calling surface + agentic tool loop variant of      │
│     createChatTurn (ragMode "agentic")                                                       │
└───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                │ read as REFERENCE ONLY (design/behavior model; never imported, never modified)
┌───────────────────────────────▼──────────────────────────────────────────────────────────────┐
│  IMMUTABLE reusable core — docs/doable-source/** (D-007; 802 pinned files; 771 present &     │
│  byte-verified vs Doable a6036d1f; mcp-servers family absent — I-014)                        │
│  doable-source/ · dependency-closure/ · ui-reference/ · doable-source-extensions/            │
│  capabilities/ (21 manifests) · contracts/ (12) · adapters/ (7) · verification/ (+ tooling)  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
FUTURE WORK (B/E; not in Phase 7): MCP framework · integrations · agent runtime · work mode ·
memory · skills · agent UI · marketplace/templates/automation · tracing/runs · attachments …
```

Key architectural rules carried from the library's governance into the proposal: host-specific concerns stay adapter concerns (`ADAPTER_ARCHITECTURE.md`); adapters must fail closed at registration/validation rather than at UI action time; no copied source is edited to make integration easier; external dependencies are inventoried, not silently rewritten (`external-dependencies/external-dependencies.json`, 573 npm packages incl. 526 Activepieces — Phase 7 anticipates **zero** new runtime dependencies); Clara's tenant/agent/KB identity, Qdrant RAG, provider credentials, and brain-vs-voice provider axes remain authoritative (`src/modules/ai-platform-core/README.md` boundaries).

## 9. Adapter boundaries (per proposed capability — handoff §7 fields)

| Boundary | A1 contracts/adapters | A2 Unified Tool Runtime | A3 (optional) tool-calling + loop |
|---|---|---|---|
| Clara entry point | `src/modules/ai-platform-core/` (module init; server-side only) | `claraRuntime.tools` seam (replacing the hardcoded object) | `claraRuntime.createChatTurn` (flagged variant) |
| Reusable Doable source (reference) | `contracts/`, `adapters/adapter-registry.ts`, `adapter-validation.ts` | `capabilities/tools/MANIFEST.md`, `doable-source/services/api/src/ai/tools/` | `doable-source/services/api/src/ai/modes/agent.ts` (loop semantics), `capabilities/agents` |
| Adapter boundary | identity/tenant (ClaraRuntimeContext→ExecutionContext); provider (existing resolver); secrets (declaration only — no secret objects cross the seam); transport (existing routes) | tool registry port; invocation context; result/error normalization; authorization hook; metering hook | provider tool-surface port (OpenAI first); loop controller; abort/timeout policy |
| Persistence | none (stateless) | none (code-defined tools; **no migrations**; runtime inserts into existing `usage_events`/`query_events` only) | none |
| Auth/authz | existing `auth/core/rbac.ts` platform/org roles | per-tool allowlist × surface (chat/embed/realtime) × plan entitlements (`ai-governance/core/resolver.ts`) | same + tool-call budget caps |
| Tenant boundary | orgId/agentId/kbId/userId carried fail-closed | every invocation scoped to ctx (KB-bound retrieve; org-scoped metering) | same; loop iterations metered |
| Secrets | none cross the seam (D-007 spirit; provider credentials stay in `ai-governance` registry) | tools receive capability abstractions, never raw secrets | same |
| Provider boundary | `ai-core` resolver/factory unchanged | provider-agnostic (invocation is host-side) | additive `tools` option on `ChatOptions` (OpenAI implementation first; others unaffected) |
| API boundary | none (no new routes) | none (existing routes unchanged) | optional single flag-gated pilot route usage |
| UI boundary | none | none (realtime/embed tool wiring unchanged in 7-B) | none (NDJSON event vocabulary extended only if pilot approved) |
| Telemetry | none | per-invocation usage event + error classification via existing spine | per-turn tool-call accounting |
| Tests required | registry/validation unit tests | registry unit + integration (schema validation; authorization denials; error normalization; streaming event shape; rag_search parity vs current behavior) | loop unit tests (mock provider); regression on existing chat paths; flag-off default |
| Migration requirements | none | none | none |
| Deployment implications | none beyond ordinary preview on push (R-3) | same | same — Gate F records any deployment event |
| Rollback strategy | revert commit; flag off | revert commit; registry fallback to hardcoded seam | runtime flag off (default) then revert |

## 10. Dependency graph (ordered — handoff §8)

```text
EXISTING (C, consumed not replaced):  ai-core resolver/providers · ai-governance entitlements/registry
                                      · RAG grounding · quota/metering/audit · voice stack · persistence

7-A  contracts/adapter foundation ──► 7-B Unified Tool Runtime ──► 7-C (optional) provider tool surface
                                            │                              + flagged agentic loop
                                            │
                                            ├─[bridge]► (later) MCP framework ──► mcp-tool-servers /
                                            │            │                     document-builders /
                                            │            │                     NotebookLM / image-gen
                                            │            │                     (all also gated by I-014)
                                            │            └─[related]► mcp-tool-servers family
                                            │
                                            └─[bridge]► (later) integrations framework ──► Activepieces pieces
                                                            (needs OAuth/credential vault + install list)

(later) agent runtime (requires 7-B [+7-C]) ──► agent work mode ──► memory + skills ──► marketplace
                                                    │
                                                    └─► agent UI (tool-call cards / user-input cards —
                                                        ui-reference interaction model, Clara design system)

Cross-cutting prerequisites (architect-controlled): D-P3 seam decision · D-P4/R-3 (before Gate F reliance) ·
Gate E protocol (before any migration work; R-4) · I-014 triage (before any mcp-servers-dependent work) ·
secrets/egress policy (before MCP/integrations)
```

Ordering constraints: 7-A → 7-B strictly (the registry needs the execution-context/adapter base); 7-C only after 7-B and only with explicit authorization; every later capability (MCP, integrations, agent runtime…) requires 7-B as its `required`/`bridge` prerequisite per the Doable graph, and none may begin merely because a dependency is technically available (handoff §8). Shared infrastructure (identity, quota, metering, audit) is consumed, never duplicated.

## 11. Risk analysis (handoff §9 — cross-checked against the open register; no existing risk is silently resolved)

| Risk | Status / cross-check | Phase 7 relevance and proposed handling |
|---|---|---|
| R-1 state drift | mitigation-in-progress | All baseline claims herein are dated + Git-verifiable + paired with recovery commands (D-014); the plan document is a dated snapshot, not current-state authority |
| R-2 no branch protection | open | Unchanged; feature work stays on `feature/ai-core-from-doable-source` via normal flow (D-008); deployment-gate enforcement folds into Gate F |
| R-3 Vercel `ignoreCommand` × `deploymentEnabled` unproven | open — D-P4 pending | Directly gates Gate F evidence design: pushes to this branch may trigger preview deployments (observed 2026-09-30); the implementation handoff must record D-P4's confirmation status before any Gate F `PASS` relies on deployment semantics |
| R-4 migrations auto-apply on deploy | open | Phase 7 (as proposed) ships **zero migrations**, eliminating the migration-on-preview risk for this phase; any later persistence need re-opens Gate E |
| R-5 exposed Vercel token | open (never reproduced here) | No secrets in any artifact (verified by scan); token rotation remains the deployment controller's task |
| **I-014 vendored-library incompleteness** | new issue, OPEN, awaiting architect triage | Blocks all `mcp-servers`-dependent capabilities (image-gen, document builders, NotebookLM); does **not** affect A1–A3 (their reference source — tools/contracts/adapters/agents/multi-provider — is present and byte-verified); disposition options: re-vendor from the source library / permanently de-scope to reference-only / accept documented gap |
| Verification-harness incompatibility | new finding (recorded in I-014) | The library verifier cannot run in-place in the Clara layout (it resolves `<cwd>/ai-platform-core` and queries `HEAD:ai-platform-core/<rel>`; an in-place run yields systematic false negatives, and copying from the worktree picks up environment mode 755 vs committed 100644 breaking tree checks). Gate B/C evidence must use the persisted scratch harness `/home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh` (agent workspace, outside the repository, per the Phase 3/4/5 convention) |
| Dual-seam divergence (I-005 / D-P3) | deferred / PENDING | The proposal targets `src/modules/ai-platform-core` as the integration seam while `src/modules/ai-core` remains the incumbent provider layer beneath it — requires architect ratification (§23 item 2) |
| Scope creep into the chat route | planning-level risk | Mitigated in the proposal by: no route changes in 7-A/7-B; 7-C only with explicit authorization; flag-off default; behavior-preserving parity tests |
| Dependency weight | planning-level risk | Phase 7 anticipates zero new runtime npm dependencies; the 573-package inventory (526 Activepieces) is only consulted when the integrations phase is planned |

## 12. Issue dependencies (handoff §9 — existing issues are not silently resolved)

| Issue | Status | Phase 7 dependency |
|---|---|---|
| I-001 (missing `docs/AGENTS.md` reference) | open (D-P2 pending) | Non-blocking for planning; the required-reading path used by this package is `Doc/18-09-2026/AGENTS.md` (the real instructions); disposition remains the architect's |
| I-007 (stale `.github/copilot-instructions.md` reference) | open | Non-blocking; harmless |
| I-013 (Phase 6 P2/P3 policy) | `RESOLVED` (architect-verified) | Governs closure semantics for Phase 7's own gates; no dependency |
| **I-014 (vendored-library completeness/verifier incompatibility)** | **OPEN — opened by this planning session** [developer-reported] | Blocks classification-E capabilities depending on `mcp-servers/*` source; requires architect triage before any such phase is authorized; A1–A3 unaffected |
| I-005 / D-P3 (dual AI seams) | deferred / PENDING | **Must be resolved by the architect when ratifying Phase 7 scope** (§23 item 2) |
| D-P4 (Vercel semantics) | PENDING | Must be confirmed before Gate F evidence reliance (R-3) |
| R-3/R-4/R-5 | open (architect-controlled) | Not resolved by this package; they bound Gates E/F design |

## 13. Database implications

None for the proposed Phase 7 scope: no migrations, no schema changes, no Supabase operations; tool definitions are code-defined; metering writes go to the **existing** `usage_events`/`query_events` tables through the existing helpers (runtime data, not schema). Gate E is therefore proposed `NOT_APPLICABLE` for 7-A/7-B (assessed and recorded, not silently skipped). The Doable DB schema (`dependency-closure/packages/db/`, `dependency-closure/services/api/src/db/` — incl. `022_mcp_connectors.sql`, `039_usage_tracking.sql`, `043_chat_traces.sql`, `058_skill_files.sql`) is **reference material for later phases only**: any future adoption must reconcile names, tenant keys, and existing tables and pass the Gate E evidence protocol under R-4 (D-005: Supabase operations are architect-controlled).

## 14. Security implications

- **Immutable source**: `docs/doable-source/{doable-source,dependency-closure,ui-reference}/**` untouched (D-007); `doable-source-extensions/**` additionally treated as immutable-by-provenance (pinned in `verification/immutable-source-manifest.json`); verified by diff (empty since `03482584`) and by the scratch-harness blob verification (771/771 present files byte-identical to the Doable baseline).
- **Secrets**: no secret, token, or credential is written into any artifact (secret-pattern scan in §24; the R-5 token is never reproduced); the seam passes capability abstractions to tools, never raw credentials; provider credentials remain server-side in the `ai-governance` registry.
- **Fail-closed adapters**: missing tenant identity or required bindings must fail at registration/validation, not at action time (`docs/doable-source/ADAPTER_ARCHITECTURE.md` "Fail-closed boundary").
- **Authorization**: every tool invocation passes per-tool allowlist × surface × plan-entitlement checks (`ai-governance/core/resolver.ts`); embed/public surfaces keep their existing restricted tool exposure.
- **Egress/network**: not extended in Phase 7 (no MCP/integrations); any future extension requires an explicit egress/SSRF policy (the library's MCP runtime documents those boundaries as host-owned).

## 15. Multi-tenant implications

Org/agent/KB/user isolation is carried structurally: the `ExecutionContext` is built from `ClaraRuntimeContext` (orgId/agentId/kbId/userId/sessionId) and is mandatory for invocation; tools execute only against the caller's scoped context (the existing `rag_search` retrieve path is KB-bound); metering and audit remain org-scoped via the existing spine; entitlement gating is per plan and org. No tenant-scoped data crosses the immutable reference boundary (the library is never imported at runtime). Existing tenant guarantees (RLS-equivalent query scoping in Clara's data layer, org-scoped rate/quota gates) are consumed unchanged — the acceptance criteria (§19) require zero regression on them.

## 16. Provider implications

The brain-axis provider abstraction (`LLMProvider`), the resolver precedence ladder, and the governance registry remain authoritative and unchanged in 7-A/7-B. 7-C (optional) adds an **additive, flag-gated** `tools` surface to `ChatOptions` and normalized tool-call stream events, implemented for the OpenAI provider first with other providers unaffected (their `chatStream` continues to return plain string chunks — the loop degrades to no-tools behavior when the provider lacks the surface). Voice providers are untouched. The provider abstraction guarantees to preserve: cached factory singletons, per-tenant resolution precedence, entitlement gating, metering callbacks, and the brain/voice axis separation.

## 17. Testing strategy

| Layer | Required checks (7-A/7-B; 7-C if authorized) |
|---|---|
| Unit | execution-context factory (fail-closed on missing tenant); adapter-registry validation (missing-slot rejection); tool-registry CRUD; zod schema validation (valid/invalid inputs); result/error normalization; streaming tool-event shape |
| Integration | `rag_search` via the registry produces byte-equivalent grounding results to the current direct call (parity harness); authorization denials (wrong surface/role/plan) fail closed; metering hooks emit correctly scoped usage events |
| Regression | existing chat/realtime/embed paths unchanged (route-level regression suite `scripts/e2e-*.js` where runnable locally; typecheck `tsconfig.typecheck.json`; lint; `npm run validate:model-config`; production build if required by the authorized handoff) |
| Governance (deterministic) | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → 8/8; `bash docs/project-control/verification/correction-cycle-test.sh` → 24/24 |
| Library integrity (gate evidence) | `bash /home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh` → expected: 771/771 present pinned blobs verified; failures confined to the I-014 `mcp-servers` family; `node docs/doable-source/verification/validate-library.mjs` (from the library root) → PASS |
| 7-C only | loop unit tests with a mock provider (tool-call → invoke → feed result → final answer); flag-off default verified; loop budget caps enforced; abort/timeout paths |

"Tests passed" is never sufficient closure evidence by itself (D-020); Gate D architect review is mandatory.

## 18. Verification gates (Phase 7 — designed per the established A–F model; handoff §11)

Governance rules preserved verbatim in application: **P0 always blocks closure (no exception path); the P1 architect-approved exception remains the only exception mechanism; acceptance-violating P2/P3 remain blocking while unresolved (no P2/P3 exception mechanism — Phase 6 corrected rule); developer claims, a clean Git tree, a successful build, and a deployment never substitute for architect review.**

| Gate | Required? | Evidence required | Evidence provider | PASS means | FAIL means | N/A allowed? | Blocks closure? |
|---|---|---|---|---|---|---|---|
| **A — Scope** | required | planned vs actual changed paths; non-scope confirmation; immutable-source diff check (empty on the four trees); production-branch refs unchanged; no `vercel.json`/`b65725e5` change | developer submits; architect verifies | actual scope ⊆ authorized scope; non-scope respected | any out-of-scope path, immutable/production/vercel touch | no | yes (R1) |
| **B — Implementation** | required | sub-phase commits with parents; requirement-by-requirement status incl. the harness verifier results (771/771 blobs; I-014-only failures) and `validate-library.mjs` PASS | developer submits ([developer-reported]) | every requirement satisfied or explicitly deferred by the architect | missing/failed requirement | no | yes (R1) |
| **C — Test** | required | per-test name/command/expected/actual/pass-fail + environment; the §17 layers | developer submits; architect verifies | all required tests ran with recorded results | missing or failing required test | no | yes (R1) |
| **D — Code review** | required | actual ChatGPT review of the diff; architecture conformity (seam/adapter/immutable boundaries); security/tenancy/regression concerns | **architect only** | actual review recorded `PASS` | `CORRECTION_REQUIRED` (corrective handoff per the Phase 6 workflow) | no — never developer-satisfied | yes (R3) |
| **E — Database** | conditional — proposed `NOT_APPLICABLE` for 7-A/7-B | applicability assessment recorded (no schema change/mutation); becomes REQUIRED if persistence surfaces change | developer records applicability; architect verifies | `NOT_APPLICABLE` with recorded rationale, or full migration/schema/RLS/runtime/rollback evidence | schema change without the gate (false applicability) | yes — only as a recorded determination | yes if applicable (R2) |
| **F — Deployment** | conditional | any deployment event observed for the branch (preview auto-deploy risk R-3/D-P4); target/URL/commit/build/runtime/smoke/rollback supplied by the deployment controller (D-004 — Vercel operations are architect-controlled) | architect/deployment controller; developer supplies commit/build evidence only | deployment evidence consistent and verified, or `NOT_APPLICABLE` with recorded rationale when no deployment occurred and none was required | deployment performed but unverified/unrecorded | yes — recorded determination only | yes if applicable (R2) |

Closure eligibility continues to follow **R1–R7** (`VERIFICATION_STATE.md` §"Closure eligibility"); the reusable per-phase record form is `VERIFICATION_CHECKLIST.md` §3/§4/§7. The plan's Phase 7 (Vercel gate) and Phase 8 (Supabase gate) materialize as the Gate F / Gate E protocols above (§3.2 reconciliation — architect ratification required).

## 19. Acceptance criteria (draft — measurable; evaluated only by the architect at review; handoff §10)

**Functional** — (1) a tool registry exists in `src/modules/ai-platform-core/` supporting definition, schema validation, listing, and invocation with a mandatory tenant execution context; (2) `rag_search` is registered and invocable through the registry; (3) tool invocations emit normalized results or typed errors and (7-C only) normalized streaming tool events; (4) per-invocation usage metering lands on the existing org-scoped spine. **Architectural** — (5) production routes' behavior is unchanged in 7-A/7-B (or only the single approved flag-gated pilot differs in 7-C); (6) the immutable trees are byte-unchanged (diff empty; harness verifier 771/771 present blobs, failures confined to I-014); (7) no runtime import of `docs/doable-source/**` from `src/**` (static import scan); (8) the incumbent `ai-core` resolver semantics are unmodified; (9) adapters fail closed at registration/validation. **Security** — (10) no secrets/tokens in any changed file (pattern scan); (11) tools receive no raw credentials; (12) embed/public surface tool exposure is not broadened beyond the current `rag_search` behavior. **Multi-tenant** — (13) invocation without complete tenant context fails closed (unit-proven); (14) KB/org scoping of `rag_search` results is unchanged (parity tests); (15) metering/audit rows remain org-scoped. **Provider** — (16) resolution precedence, entitlement gating, and the brain/voice axis separation are preserved; (17) providers without the 7-C tools surface behave exactly as today. **Persistence** — (18) zero new migrations; no schema mutation (Gate E `NOT_APPLICABLE` assessment recorded). **Observability** — (19) tool invocations are observable via existing usage/analytics surfaces. **Testing** — (20) the §17 layers all run with recorded results; governance regressions 8/8 and 24/24. **Regression** — (21) existing chat/realtime/embed e2e suites and typecheck/lint/model-config pass unchanged. **Immutable-source** — (22) D-007 verified; provenance wording unchanged (never "confirmed owner authorship"); `b65725e5` untouched. **Deployment** — (23) no developer-initiated deployment; any observed deployment event recorded with controller-supplied evidence (Gate F). Every criterion is pass/fail; "build succeeds"/"tests pass" substitute for none of them.

## 20. Rollback strategy

Additive src-only changes with a runtime flag (7-C) default-off: (1) immediate — flag off restores prior behavior; (2) code — `git revert` of the specific sub-phase commits on the feature branch (no history rewrite, no force-push); (3) no DB rollback needed (zero migrations); (4) deployment rollback, if any preview deployment occurred, is the Vercel controller's operation (D-004) with the architect directing; (5) governance rollback — none required: planning/implementation records are append-only and stand as history.

## 21. Ordered implementation sub-phases (proposed — each requires the architect's authorization before starting)

- **7-A — Host contracts/adapter foundation** (new files under `src/modules/ai-platform-core/`): ExecutionContext factory from `ClaraRuntimeContext`; host adapter registry + fail-closed validation; secrets/transport/provider adapter declarations bound to existing services; unit tests. Deliverable: the seam base, no behavior change anywhere.
- **7-B — Unified Tool Runtime** (extends `src/modules/ai-platform-core/`): `ToolDefinition` (zod), registry, `invoke()` with authorization + metering hooks, result/error normalization, streaming event types; migrate `rag_search` onto the registry; parity + fail-closed tests. Deliverable: the keystone runtime, production behavior unchanged.
- **7-C — (optional; only if explicitly authorized) Provider tool-calling surface + flagged agentic loop**: additive `tools` option + normalized tool-call events on the OpenAI provider; flagged `createChatTurn` agentic variant (bounded iterations, budget caps, abort policy); optional single flag-gated route pilot. Deliverable: the loop, proven behind a default-off flag.
- Each sub-phase: own focused commit(s), validation evidence per §17, completion report per `ZAI_HANDOFF.md` §I.7, then STOP for architect review; a `CORRECTION_REQUIRED` at any point follows the Phase 6 correction workflow (`ISSUES.md` §"Issue-control system").

## 22. Explicit stopping boundary (handoff §12/§16 — FINAL STOP CONDITION)

This planning package contains **no implementation**: `src/**`, `packages/**`, migrations, Supabase, `vercel.json`, deployments, immutable Doable source, provider integrations, agent runtime, MCP, and UI were all left untouched (verified in §24). After this package is committed, pushed, and reported, **Z.AI STOPs**: no Phase 7 implementation, no Phase 8, no `PASS`/`CLOSED` claim for Phase 7, no product work of any kind — until the architect reviews this package and issues the explicit Phase 7 implementation authorization handoff. Only ChatGPT may authorize implementation (D-003/D-009).

## 23. Architect decisions required (ratification list — recorded here; `DECISIONS.md` untouched by this package)

1. **Ratify or amend the Phase 7 objective/scope** (§3.3, §4, §21) and the plan-ladder reconciliation (§3.2 — plan Phases 7–9 folding into Gates E/F + the operating loop).
2. **Resolve D-P3 / I-005** — proposed: `src/modules/ai-platform-core` is the integration seam; `src/modules/ai-core` remains the incumbent provider/brain layer beneath it.
3. **Triage I-014** — re-vendor the `mcp-servers` family from the source library / de-scope its capabilities to permanent reference-only / accept the documented gap.
4. **Confirm D-P4 / R-3** before any Gate F evidence relies on deployment semantics.
5. **Confirm the Gate E/F applicability determinations** (§18) when issuing the implementation authorization.
6. (Standing, unrelated to Phase 7) D-P2 / I-001 disposition.

## 24. Validation performed for this planning package (all `[developer-reported]`, re-runnable)

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Branch / HEAD / origin / tree | `git branch --show-current`; `git rev-parse HEAD origin/feature/ai-core-from-doable-source`; `git status --porcelain` | `feature/ai-core-from-doable-source`; `3657035a` = origin tip; clean |
| 2 | Closure ancestry | `git log --format="%H %P %s" -3` | `3657035a` → parent `4dc8a573` → parent `c0cca964` (verified) |
| 3 | Mainlines | `git fetch --prune origin`; `git rev-parse origin/{main,Vite-Converted,Vercel-Preview,Vercel-Prod}` | main `550630f5` / Vite-Converted `5ca8ec58` / Vercel-Preview `db6cdb48` unchanged; **Vercel-Prod `e0ead990` → `bae53a07`** (external PR #262 merge; recorded, not acted on) |
| 4 | Immutable-source integrity | `git diff 03482584 HEAD --stat -- <four immutable trees>` | empty (no drift since vendoring) |
| 5 | `vercel.json` | `git log --oneline -1 -- vercel.json`; `git diff b65725e5 HEAD --stat -- vercel.json` | last touched by `b65725e5`; unchanged |
| 6 | Phase 5 regression | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` | **8/8, exit 0** (P0 → FAIL verified) |
| 7 | Phase 6 regression | `bash docs/project-control/verification/correction-cycle-test.sh` | **exit 0 (24/24)** |
| 8 | Model config | `npm run validate:model-config` | **PASS** |
| 9 | Library metadata | `node verification/validate-library.mjs` (from `docs/doable-source/`) | **PASS** (21 capabilities · 21 manifests · 30 edges · 0 errors · 0 warnings) |
| 10 | Extraction verifier (scratch harness @ `3657035a`) | `bash /home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh` | exit 1 — overall `fail`: **771/771 present pinned blobs byte-identical** to Doable `a6036d1f`; all 31 file failures + 10 failing root trees confined to the absent `mcp-servers/` family; `requiredFiles`/`packageHardening`/`externalDependencyInventory`/`uiReferenceFiles` PASS → **I-014** |
| 11 | No product/DB/deployment drift | `git show --stat 3657035a 4dc8a573` | both documentation-only (docs/project-control/** + worklog.md; the correction also the authorized test script) |
| 12 | Secret-pattern scan across this package's changed paths | `rg` credential/token patterns | no matches (R-5 token never reproduced) |

A validation script for the planning package follows the existing repository convention where required (aggregate scripts persist outside the repository in the agent workspace); the package's own checks above are all read-only and re-runnable. Running any check is never itself evidence of phase completion (D-020).


