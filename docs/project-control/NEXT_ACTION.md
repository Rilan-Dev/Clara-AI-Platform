# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-04 (Phase 7-C CLOSED — architect PASS under D-028; I-014 RESOLVED under D-029; Phase 7 remains IN_PROGRESS)**.
> This file is intentionally short. History lives in Git, in `VERIFICATION_STATE.md`, and in the canonical `worklog.md`; current truth lives in `PROJECT_STATE.md`. A fresh ChatGPT session follows the full procedure in `docs/project-control/CHAT_CONTINUITY.md` (§5).

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` (the Phase 7-B closure record — the appended final stage record; the prior implementation/correction/analysis/decision stage records preserved unrewritten) → then `docs/project-control/VERIFICATION_STATE.md` §Phase 7 (the full Phase 7 evidence — planning, 7-A implementation/correction/closure, 7-B implementation/integration/synchronization/correction/analysis/decision, **and the §Phase 7-B closure record — incl. the architect review trail with the 2026-10-04 closure `PASS` row**) → then `docs/project-control/ISSUES.md` (note I-014 and I-015 are `RESOLVED`; issues I-016/I-017 are `RESOLVED`) → then `docs/project-control/ZAI_HANDOFF.md` (Part I protocol + Part II — the Phase 7-B closure/STOP record). Fresh-ChatGPT initialization procedure: `docs/project-control/CHAT_CONTINUITY.md`. Historical audit trail: repository-root `worklog.md` and `docs/project-control/sessions/`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`; Phase 7 design: `docs/project-control/PHASE-7-PLAN.md`.

## 1. Active phase

**Phase 7 — AI Platform Core Foundation — IN_PROGRESS; 7-A/7-B/7-C CLOSED; next action is the next separately bounded Phase 7 governance/architecture item.** Phase 7-B remains PASS — CLOSED under D-023 / Option A and is historical closed work. ChatGPT is the active implementation owner under D-024. The current work is the bounded provider tool-calling + hard-bounded agentic-loop pilot only.

Current implementation boundary:
- Provider tool calling is additive and default-off via ENABLE_AI_PLATFORM_TOOL_CALLING.
- Agentic loop is additive and default-off via ENABLE_AI_PLATFORM_AGENT_LOOP.
- The Unified Tool Runtime is the only permitted tool execution boundary.
- The loop has a hard maximum of 8 provider iterations and supports cancellation.
- OpenAI is the only provider extended in this pilot.
- No incumbent route is enabled by default.
- D-023 audit-only telemetry remains binding.
- No schema/migration, billable tool metering, MCP, integrations, memory, skills, deployment, or Phase 8 work is authorized.

Verification state: Tasks 3–5 are implemented but verification-pending because the current execution sandbox does not contain the repository checkout and outbound cloning is blocked. No test/typecheck/lint PASS is claimed.

## 2. Project state (2026-10-04)

Branch `feature/ai-core-from-doable-source`; the stack at the closure-record baseline: `4aa73384e537a3cb2bf08ea187aa13a2c0b5ed81` (the final-synchronization merge) → `74200bec` (the CH-003-baseline governance record) → `4413bc83d76588f42e2cd0b669dd882566824238` (the CH-003 corrective commit; the architect's re-review 2026-10-04: F-7B-02 `RESOLVED`; F-7B-01 `OPEN / BLOCKING` → RESOLVED by the Option A decision) → the AH-004 governance-only analysis commit `f7327d7b2fe76dbf1bfbcae3dbfc687e69653660` (`docs: record phase 7-b metering representation decision analysis`) → the architect decision-record governance commit **`8d124263fd4405bfaec0060bbabfd580a49e8821`** (`docs: record phase 7-b f-7b-01 architect decision option a` — D-023 — **the exact state the architect closure-reviewed `PASS`**) → **the Phase 7-B closure-record commit** (`docs: close phase 7-b after architect pass` — the immediate child of `8d124263`, this commit). Clean tree; **local HEAD == origin** (normal push; no force-push at any point). Open issues: **I-014** (vendored-library `mcp-servers/` absence — OPEN, awaiting architect triage), **I-015** (dependency-lockfile desync / incomplete workspace `node_modules` — OPEN, not fixed; the 19 pre-existing application typecheck errors remain, not claimed fixed), I-001, I-007 (**I-013, I-016, and I-017 `RESOLVED` — I-017 by ARCHITECT ACCEPTANCE DISPOSITION per D-023; closure-confirmed by the architect's closure `PASS`**). Pending decisions: D-P2, D-P4 (Vercel semantics — Gate F; observed external deployment statuses are NOT Gate F completion and NOT deployment authorizations). D-P3 RESOLVED (D-021); the phase-ladder reconciliation ratified (D-022); the F-7B-01 metering representation decision RESOLVED (D-023 — OPTION A — KEEP AUDIT-ONLY TELEMETRY; first-class billable tool-usage metering deferred to a future authorized design phase). R-1 mitigation-in-progress; R-2/R-3/R-4/R-5 open. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -5 origin/feature/ai-core-from-doable-source
git show --stat 8d124263                                  # the D-023 decision record (the architect closure-reviewed state — PASS)
git show --stat 4413bc83                                  # the CH-003 corrective commit (F-7B-02 RESOLVED by re-review)
git show --stat a2c74204                                  # the 7-B baseline (the architect-accepted 7-A closure record)
git show --stat 577189d4                                  # the reviewed Phase 7-A correction (architect PASS)
```

## 3. What must happen next

**The next architect-controlled boundary — the architect's next explicit decision (the developer selects nothing on the architect's behalf).** The Phase 7-B closure review is COMPLETE (`PASS`, 2026-10-04 — 7-B `PASS — CLOSED` under D-023; no further 7-B action is pending). The architect may next direct, among other options: **the Phase 7-C decision** (authorize or decline the optional provider tool-calling / agentic-loop sub-phase — per `ZAI_HANDOFF.md` §I.5); **the I-014 triage** (the vendored-library `mcp-servers/` absence); **the I-015 triage** (the dependency-lockfile desync / incomplete workspace `node_modules`); **the D-P2 / D-P4 dispositions** (Vercel semantics — Gate F; observed external deployment statuses are NOT Gate F completion and NOT deployment authorizations); **the `clara-core` stale-extraction disposition**; or other direction. No selection among those is made by the developer, and none is to be inferred from the control documents. **Z.AI performs no work until the next explicit architect authorization arrives.** First-class billable tool-usage metering remains deferred to a future explicitly authorized design phase (not begun — a separate design covering schema representation, tenant/org scope, invocation identity, provider/tool attribution, billable vs non-billable semantics, measured usage facts, quota, billing, analytics readers, provider rollups, `rag_search` ownership and duplicate prevention, migration/Gate-E requirements, and compatibility with `usage_events`/`query_events`). The architect may optionally review this closure-record commit (the immediate child of `8d124263fd4405bfaec0060bbabfd580a49e8821`; changes confined to `worklog.md` + `docs/project-control/**`) and verify: the closure record faithfully records the architect's `PASS` (the architect closure classified `[architect-verified]` — ChatGPT performed the independent closure review; the developer's recording classified `[developer-reported]` — never falsely classified as developer-reported or architect-verified respectively); the semantic distinction preserved (original requirement NOT technically satisfied; AH-004 finding unrewritten; D-023 the governing acceptance; `audit_logs` = operational observability, NOT the usage-metering spine); F-7B-01 `RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION`; F-7B-02 `RESOLVED`; I-017 `RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION` (F-7B-02 = implementation correction; F-7B-01 = architect acceptance redefinition); the deferred capability recorded with its minimum future-design scope; zero application/schema/migration/dependency/immutable-source changes; the validators re-run (governance 8/8 + 24/24; model-config PASS; the immutable-source invariants unchanged); the Final State Contract consistent across all five members + the worklog layer (Phase 7 `IN_PROGRESS` / 7-A `PASS — CORRECTION VERIFIED — CLOSED` / 7-B `PASS — CLOSED` / 7-C `NOT AUTHORIZED`); Phase 7-C remains unauthorized; I-014 and I-015 remain OPEN.

## 4. Z.AI active handoff status

**Phase 7-B closure recording — EXECUTED (governance-only: the architect's closure `PASS` faithfully recorded; ONE governance-only commit + the normal push; the closure report). Phase 7-B is CLOSED — architect `PASS`. Phase 7-C: NOT AUTHORIZED. STOP: await the next explicit architect authorization.** **Z.AI is STOPped at the post-closure boundary inside Phase 7.** It must not begin any 7-C work (no provider tool calling, no agentic loop, no bounded iteration logic, no tool-calling provider APIs), must not begin the future first-class tool-usage metering design (deferred — a separate explicit authorization is required), must not modify application code, must not create a migration or schema change, must not invent a usage_events kind or change query_events semantics, must not modify rag_search behavior, must not implement MCP or integrations, must not start Phase 8, must not deploy, must not modify `src/modules/ai-core/**`, `src/app/api/**`, migrations, Supabase, `vercel.json`, dependency files, or the immutable Doable source, must not repair `package-lock.json` or install dependencies (I-015 stays OPEN), and must not resolve I-014/I-015/I-001/I-007, R-3/R-4/R-5, D-P2, or D-P4 — until the next explicit architect authorization arrives. Only ChatGPT may authorize 7-C or direct the next project action. **Prior executed instances (all superseded; recoverable in Git history at their respective commits): the Phase 7-B F-7B-01 architect decision-recording handoff (D-023 — at `8d124263`); the AH-004 decision-analysis handoff (at `f7327d7b`); the CH-003 corrective handoff (at `4413bc83`); the Phase 7-B implementation/integration/final-synchronization authorizations (executed 2026-10-03).**

## 5. What ChatGPT must verify before advancing

1. The closure-record commit is a focused, bounded governance deliverable: the immediate child of `8d124263fd4405bfaec0060bbabfd580a49e8821`; changes confined to the repository-root `worklog.md` and `docs/project-control/**` (CURRENT_PHASE/PROJECT_STATE/NEXT_ACTION/VERIFICATION_STATE/ISSUES/ZAI_HANDOFF + `SESSION-021.md` + its README index row); zero `src/**` changes; zero migration changes; zero dependency/lockfile changes; zero immutable-source changes; zero `vercel.json` changes; no amend/rebase/squash/cherry-pick/force-push; `8d124263` unchanged and the immediate parent.
2. The closure is recorded with the correct provenance: the architect closure review `PASS` is classified **[architect-verified]** (ChatGPT performed the independent closure review and returned `PASS`); the developer's recording/validation/commit/push are classified **[developer-reported]**; the closure decision is never presented as developer-reported, and the developer's recording is never presented as architect verification.
3. The semantic distinction is preserved everywhere: the ORIGINAL REQUIREMENT (per-invocation usage metering through the existing usage/analytics spine) was NOT technically satisfied; the AH-004 FINDING stands unrewritten; the ARCHITECT DECISION (D-023 — OPTION A — KEEP AUDIT-ONLY TELEMETRY) is the governing acceptance; the CURRENT 7-B DELIVERABLE is org-scoped tool invocation observability through `audit_logs` (operational observability, NOT the usage-metering spine); the closure is an acceptance disposition, NOT a claim of technical satisfaction.
4. F-7B-01 stands `RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION`; F-7B-02 stands `RESOLVED` (implementation correction); I-017 stands `RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION` (F-7B-02 = implementation correction; F-7B-01 = architect acceptance redefinition — the historical finding unrewritten in `ISSUES.md`); the deferred capability (first-class billable tool-usage metering) is recorded with its minimum future-design scope and is NOT begun.
5. State-machine consistency: phase = Phase 7 and status = `IN_PROGRESS` (7-A `PASS — CORRECTION VERIFIED — CLOSED`; **7-B `PASS — CLOSED` under D-023**; 7-C `NOT AUTHORIZED`) agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II — the closure/STOP record), `VERIFICATION_STATE.md`, and the latest `worklog.md` entry.
6. I-015 remains `OPEN` (no dependency-changing install; no lockfile rewrite; the 19 pre-existing application typecheck errors not claimed fixed); I-014 remains `OPEN` (immutable source byte-unchanged; 771/771 present pinned blobs verified; the 31 absent files confined to `mcp-servers/`); I-001/I-007 remain open, unmodified; I-013/I-016/I-017 remain `RESOLVED`; no existing issue/risk was silently resolved; `RISKS.md`/`PHASE-7-PLAN.md`/`DECISIONS.md` untouched (D-023 unrewritten; no cross-reference strictly necessary).
7. Historical records are unrewritten: SESSION-001…020, the worklog's historical entries, the Phase 1–6 closure/correction records, the Phase 7 planning package, the 7-A implementation/correction/closure records, the 7-B implementation/integration/synchronization/correction/analysis/decision records all stand as recorded; the worklog Phase 7-B closure entry is a subsequent append-only event; no fabricated timestamps; the only architect events recorded are the communicated ones (the 7-A `PASS`; the 7-A closure-record acceptance; the 7-B authorization; the 7-B review chain; the Option A decision; **the 7-B closure review `PASS`**).
8. The deterministic tests still compute 8/8 (phase-closure-eligibility) and 24/24 (correction-cycle); `npm run validate:model-config` still PASSes; the immutable-source invariants hold (802 pinned / 771 present / 771/771 byte-verified / 0 mismatches / 31 absent confined to `mcp-servers/`; the four tree OIDs `a42aee79`/`ee07c362`/`b76b8f34`/`54606204`; the `vercel.json` blob `3f26d343`).

## ChatGPT implementation takeover — current authorization (2026-10-04)

ChatGPT is actively implementing the project from this point forward under D-024. The repository remains the source of truth and all existing project-control documents remain binding. Historical Z.AI execution records are preserved and are not rewritten.

Current execution sequence: D-025 canonical reusable-core role separation -> D-026 bounded I-015 infrastructure remediation -> D-027 bounded Phase 7-C provider tool-calling plus hard-bounded agentic-loop pilot.

Hard boundaries: immutable Doable trees remain untouched; no database/schema/migration changes; D-023 audit-only tool telemetry remains binding; no MCP, integrations, first-class billable tool metering, deployment or Phase 8 work. Every implementation task is TDD-first, verified and committed.

## ChatGPT implementation takeover — Phase 7-C execution checkpoint (2026-10-04)

D-024/D-027 govern the active continuation. ChatGPT is implementing Tasks 3–5: the bounded Unified Tool Runtime consumer pilot, additive OpenAI tool calling, and the hard-bounded agentic loop. The implementation is default-off, uses the Unified Tool Runtime as the only tool execution boundary, and does not change schema, migrations, immutable/reference trees, MCP, integrations, billable tool metering, deployment, or Phase 8.

Verification is pending: the current sandbox does not contain the repository checkout and outbound GitHub cloning is blocked. No Vitest, repository typecheck, lint, or full verification PASS is claimed. I-015 remains OPEN. Historical Z.AI records remain unchanged.


## ChatGPT implementation checkpoint (2026-10-04)

Tasks 3–5 are implemented under D-027 but remain verification-pending. The next required action is executable verification: run the focused RED→GREEN tests, provider/platform regressions, typecheck, lint, immutable-source, secret, model-config, and governance validators in an isolated repository workspace, then perform the whole-branch review. Do not close Phase 7-C from source inspection alone.

## Verification checkpoint — 2026-10-04

The implementation test scope is green (113 files / 1075 tests), model configuration is green, and I-015 is resolved. Repository-wide TypeScript and ESLint remain blocked by pre-existing baseline/reference-tree errors. Next action is to complete the fresh-context whole-branch review, run the immutable-source/library/secret/governance validators against the current head, and classify the remaining global typecheck/lint failures without modifying immutable/reference material merely to make CI green.


## Task 6 current boundary — 2026-10-04

Green evidence: full tests 113/113 and 1075/1075; Phase 7 focused lint/typecheck; governance validators; model-config; npm install. I-015 resolved. Remaining closure work: reproduce immutable-source/library-integrity/secret/runtime-import checks at current head and perform final fresh-context review. Global typecheck/lint failures remain baseline/reference-tree gates and must not be “fixed” by altering immutable/reference material. Phase 7-C stays IN_PROGRESS until the final closure decision is made.

## Current-state reconciliation — 2026-10-04

The current next action supersedes earlier “verification pending / I-015 open” wording above; those paragraphs are retained as historical checkpoints.

1. Keep Phase 7-C IN_PROGRESS; do not claim closure yet.
2. Preserve the architect-verified Gate A/B/D results and the changed-code Gate C PASS from CI run 37192496888.
3. The only remaining closure decision is whether the repository-wide typecheck/lint baseline can be formally accepted as an explicit project follow-up under the phase-gate contract, or whether a separately authorized infrastructure/baseline-cleanup phase is required. Do not alter immutable/reference trees to make these global gates green.
4. I-015 is RESOLVED; I-014 remains OPEN and outside 7-C scope.
5. Any final closure commit must update all five current-state members consistently and must be an explicit ChatGPT architect decision.

## Current-state reconciliation — 2026-10-04 — after Phase 7-C closure

D-028 is established and Phase 7-C is CLOSED with architect PASS. Do not reopen 7-C merely because the repository-wide Type Check/ESLint baseline remains non-green; those failures are explicitly recorded as a non-regressive follow-up and must not be “fixed” by mutating immutable/reference material.

Phase 7 remains IN_PROGRESS. The next project-level work must be separately bounded and authorized. Current open/pending items include I-014 (mcp-servers immutable vendored-family absence), D-P2, D-P4, and the remaining project risks. I-015 is RESOLVED.

## Current-state reconciliation — 2026-10-04 — I-014 resolved

I-014 is RESOLVED after 31/31 immutable SHA checks. The next project-level action is the next separately bounded Phase 7 governance/architecture item; do not reopen I-014 unless a future verifier demonstrates a mismatch. I-015 remains RESOLVED. Phase 7 remains IN_PROGRESS.


## Current-state reconciliation — 2026-10-05 — Phase 7 CLOSED

The previous Phase 7-B / Phase 7-C pending text above is historical. The current authoritative next action is:

1. Treat `ae3b6ec45788acd9b767fbc59f041daa90a2da7d` as the Phase 7 closed baseline.
2. Preserve D-023, D-028, and D-029 as binding decisions.
3. Do **not** modify immutable/reference source merely to clear the known global Type Check/Lint baseline.
4. Do **not** start MCP runtime, integrations, memory, skills, autonomous agent runtime, schema/migration, deployment, or first-class billable tool metering without a separately scoped authorization.
5. Prepare the next bounded architecture/planning package from the completed Phase 7 capability set. The package must determine the next capability from the repository objective and dependency graph, define scope/non-scope, risks, adapter/security boundaries, verification gates, acceptance criteria, rollback, and an explicit stopping boundary before implementation.
6. ChatGPT remains the implementation owner under D-024; historical Z.AI STOP records remain historical.

**No Phase 8 product implementation is implicitly authorized by this entry.** [architect-verified]

## Next bounded capability — Integrations Framework planning (D-030)

D-030 authorizes **planning/review only** for the next capability: the host-neutral Integrations Framework. The canonical plan is `docs/superpowers/plans/2026-10-05-clara-integrations-framework.md`.

The plan is intentionally implementation-blocking until a separate implementation authorization is recorded. It must resolve the credential-vault, OAuth state, connection-scope, egress/SSRF, Activepieces action-runner, Unified Tool Runtime bridge, and Gate-E persistence boundaries before code is started.

**Current status:** Phase 7 remains CLOSED. The next implementation boundary is not yet authorized. [architect-verified]
