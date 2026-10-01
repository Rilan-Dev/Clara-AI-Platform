# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-02**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance — the Phase 7-A implementation-authorization instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence register + the durable verification and phase-gate contract + the durable correction and issue-control workflow), `VERIFICATION_CHECKLIST.md` (canonical checklist/template), `ISSUES.md` (the durable issue register + the canonical issue-control system), repository-root `worklog.md` (canonical historical audit trail), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan), **`docs/project-control/PHASE-7-PLAN.md` (the architect-reviewed Phase 7 planning package — the 7-A design source)**.

> **Phase state (2026-10-02):** Phase 6 — Correction and Issue-Control Workflow is **`CLOSED`** (architect re-review `PASS`, 2026-10-01). The architect **reviewed the Phase 7 planning package — outcome `PASS`** (as communicated in the Phase 7-A implementation authorization handoff, 2026-10-02) [architect-verified — as communicated in the handoff] and **issued the explicit Phase 7-A implementation authorization** (Phase 7-A — Host Contracts / Adapter Foundation ONLY; 7-B/7-C/MCP/integrations/agent runtime/memory/skills/attachments/image generation/marketplace/templates/automation/collaboration/DB/deployment/Phase 8 all remain unauthorized) [architect-verified workflow action]. **Phase 7's canonical status is `IN_PROGRESS`**: sub-phase **7-A is IMPLEMENTED `[developer-reported]` — AWAITING ARCHITECT REVIEW** of the actual diff and evidence; implementation sub-phases 7-B and 7-C are **NOT authorized and NOT started**. Phase 7 is not `PASS` and not `CLOSED`. The ratified architectural decisions are recorded as D-021 (the D-P3 seam resolution) and D-022 (the phase-ladder reconciliation) in `DECISIONS.md`.

## Phase identity

| Field | Value |
|---|---|
| Phase number | **7** |
| Phase name | **AI Platform Core Foundation** — the first AI-platform capability-integration phase (D-022), currently in sub-phase **7-A — Host Contracts / Adapter Foundation** |
| Full designation | **Phase 7-A — Host Contracts / Adapter Foundation** (implementation stage) |
| Status | **`IN_PROGRESS`** — 7-A authorization received and executed 2026-10-02 (implementation delivered `[developer-reported]`, architect review of the 7-A diff **PENDING**); includes "developer implementation complete, awaiting architect review" per the D-011 vocabulary; 7-B/7-C NOT authorized |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 7-A implementation authorization handoff received from ChatGPT on 2026-10-02 (baseline after synchronization `ac06ca72516282bd78f8d0f37afaa46062322b53`). Scope: feature-worktree synchronization; baseline re-verification; implementation of the reviewed 7-A design under `src/modules/ai-platform-core/**` (execution-context factory; fail-closed adapter registry; identity/provider/secrets/transport adapter declarations bound to existing services); focused tests; control-documentation updates; one focused commit; the structured implementation report; HARD STOP. Executed by Z.AI 2026-10-02 (this commit) |
| Baseline commit | `ac06ca72516282bd78f8d0f37afaa46062322b53` ("docs: restore phase 7 planning authorization boundary" — the authoritative remote feature-branch tip at issuance; the local feature worktree was stale at `31ffd6f4` and was synchronized to this tip by fast-forward before implementation, per the handoff §3; the 35 incoming commits are documentation/governance-only) |

**Only ChatGPT/project-owner review can accept the 7-A implementation and later close the phase.** The implementation report is developer evidence until reviewed. A `CORRECTION_REQUIRED` outcome follows `ZAI_HANDOFF.md` §I.5 / the Phase 6 correction workflow.

## Objective (this stage)

Implement exactly the reviewed Phase 7-A design (`PHASE-7-PLAN.md` §21 sub-phase 7-A): synchronize the feature worktree to the authoritative remote tip; re-verify the baseline; establish the Clara-owned platform seam foundation under `src/modules/ai-platform-core/**` — the fail-closed ExecutionContext factory from Clara's existing runtime identity (tenant/org isolation; user identity; request/correlation context; authorization boundaries; future usage/metering information), the fail-closed host adapter registry (explicit registration; deterministic lookup; no implicit fallback; unknown adapter → controlled failure; no cross-tenant leakage), and the Clara host seam (identity/provider/secrets/transport declarations bound to existing services; the incumbent `ai-core` stack consumed, never duplicated; secrets never crossing the seam; no runtime import of the immutable Doable reference); validate with focused tests plus the regression/governance/immutable-source suites; update the control documentation; commit; report; STOP — no 7-B, no 7-C, no Phase 8.

## Scope (approved for this stage)

1. `src/modules/ai-platform-core/**` — the 7-A foundation: `contracts.ts`, `execution-context.ts`, `adapter-registry.ts`, `clara-adapters.ts` (new); `index.ts` (additive exports), `README.md` (foundation documentation), `clara-runtime.ts` (minimal behavior-preserving type-correctness fixes to the module's own pre-existing defects — corrected import paths, nullability coercions, and the grounding-surface vocabulary fix, all disclosed in the handoff instance and the implementation report); the three colocated `*.test.ts` files.
2. `docs/project-control/DECISIONS.md` — D-021/D-022 appended (the architect-ratified items from the handoff §2); the D-P3 pending row updated to RESOLVED → D-021 (the D-P1 → D-018 precedent).
3. `docs/project-control/ISSUES.md` — **I-015** appended (the dependency-lockfile desync / incomplete-workspace-node_modules finding discovered during 7-A validation, reported per the out-of-scope-discovery rule — not corrected, not resolved); I-014 untouched (OPEN).
4. `docs/project-control/ZAI_HANDOFF.md` — Part II replaced with the Phase 7-A implementation-authorization instance (per Part I §I.12; the superseded planning instance remains recoverable in Git history at `ac06ca72`).
5. `docs/project-control/VERIFICATION_STATE.md` — the Phase 7-A implementation evidence section + the review-trail entries + the state-machine consistency reconciliation.
6. `docs/project-control/PROJECT_STATE.md` and `docs/project-control/NEXT_ACTION.md` — reconciled to Phase 7 `IN_PROGRESS` (7-A implemented, awaiting architect review).
7. `worklog.md` — the Phase 7-A implementation entry (append-only).
8. `docs/project-control/sessions/SESSION-012.md` + its `sessions/README.md` index row.
9. The agent-workspace verification harness reconstructed for this session (`/home/z/my-project/scripts/verify-immutable-blobs-in-worktree.sh`, outside the repository, per the Phase 3/4/5 convention — the planning session's harness was not carried over between workspace resets).

## Non-scope (explicit — the authorization boundary)

- **Do NOT** implement 7-B (Unified Tool Runtime; tool definitions/schemas/registry/invocation lifecycle; `rag_search` migration) or 7-C (provider tool calling; agentic loop); **do NOT** implement MCP, integrations, agent runtime, agent work mode, memory, skills, attachments, image generation, marketplace, templates, automation, collaboration, or UI work.
- **Do NOT** change database schema/migrations/Supabase (Gate E `NOT_APPLICABLE` for 7-A unless persistence unexpectedly surfaces — if so: STOP and report); **do NOT** deploy (Gate F not executed; D-P4 pending); **do NOT** add runtime dependencies; **do NOT** add or modify public routes; **do NOT** modify unrelated API behavior.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**` — D-007 — and `doable-source-extensions/**`, immutable-by-provenance); do not modify or rewrite `b65725e5`; do not touch `vercel.json`.
- **Do NOT** resolve I-014 (remains `OPEN` — no re-vendoring of `mcp-servers/`, no closure, no priority/disposition change), I-015, I-001, I-007; do not resolve R-3/R-4/R-5; do not resolve D-P2/D-P4.
- **Do NOT** mark Phase 7 `PASS` or `CLOSED`; do not self-approve; do not invent architect approval; do not start Phase 8.

## Prerequisites (all verified 2026-10-02)

1. The architect's Phase 7 planning-package review returned `PASS` (communicated in the 7-A authorization handoff) [architect-verified].
2. The Phase 7-A implementation authorization handoff issued by ChatGPT on 2026-10-02 [architect-verified workflow action].
3. Worktree synchronization executed per the handoff §3: feature worktree clean; remote tip verified after fresh fetch (`ac06ca72`); fast-forward safety verified (`31ffd6f4` strict ancestor; 35 commits; no divergence); fast-forward merge; history preserved; no reset/force-push/rewrite; `main`/`Vercel-Prod` untouched.
4. Baseline re-verification per the handoff §4: correct branch; HEAD = expected `ac06ca72`; clean tree; Phase 7 active; the authorization recorded (this handoff); I-014 OPEN; immutable tree hashes recorded (`a42aee79`/`ee07c362`/`b76b8f34`/`54606204`) and verified unchanged after implementation; no unexpected source changes (the 35 incoming commits verified documentation/governance-only).

## Required deliverables (this stage)

- The 7-A foundation under `src/modules/ai-platform-core/**` (contracts; fail-closed execution-context factory; fail-closed adapter registry; Clara adapter bindings; additive exports; module documentation; the disclosed minimal `clara-runtime.ts` type fixes) with the three focused test files.
- The validation evidence record (tests/typecheck/lint/governance/immutable-source/import-scan/secret-scan; the build-attempt limitation recorded with its pre-existing cause) in `VERIFICATION_STATE.md` + the implementation report.
- The governance updates: D-021/D-022; I-015; the ZAI_HANDOFF Part II instance; this contract; the `PROJECT_STATE.md`/`NEXT_ACTION.md` reconciliation; the append-only worklog entry; `SESSION-012.md` + its index row.
- The focused implementation commit + push + the structured implementation report (handoff §16 A–G) + HARD STOP.

## Acceptance criteria (this stage — pass/fail, evaluated by the architect at review of the actual 7-A diff and evidence)

1. The worktree synchronization was safe (fast-forward only; history preserved; production branches untouched) and the baseline re-verified — PASS/FAIL.
2. The ExecutionContext factory is fail-closed (mandatory tenant + KB; no ambient fallback; frozen outputs; typo guard) and is the only sanctioned production path — PASS/FAIL.
3. The adapter registry is fail-closed (up-front validation; deterministic exact-slot lookup; no fallback; unknown → controlled failure; duplicate rejected; committed set frozen) — PASS/FAIL.
4. The four adapter declarations are bound to existing services only (identity → factory; provider → incumbent-seam delegation; secrets → always-fail-closed; transport → existing routes only) — PASS/FAIL.
5. The incumbent `ai-core` stack is consumed, not duplicated or modified — PASS/FAIL.
6. The focused tests prove registration, execution-context, tenant-isolation, and fail-closed behavior — PASS/FAIL.
7. Zero new dependencies; no DB/persistence; no routes; no deployment; immutable source byte-unchanged; no runtime import of the Doable reference — PASS/FAIL.
8. The `clara-runtime.ts` modifications are exactly the disclosed minimal type-correctness fixes, behavior-preserving — PASS/FAIL.
9. Validation evidence is real and recorded; the build limitation is honestly recorded (I-015) — PASS/FAIL.
10. I-014 remains OPEN; I-015 recorded `[developer-reported]`; no issue closed — PASS/FAIL.
11. Governance records distinguish `[developer-reported]` from `[architect-verified]`; no fabricated verification — PASS/FAIL.
12. Phase 7 not `PASS`/`CLOSED`; 7-B not authorized; Final State Contract consistent — PASS/FAIL.

## Verification requirements (developer, before commit — this stage)

(1) targeted 7-A tests (`npx vitest run src/modules/ai-platform-core/` → 43/43); (2) full suite (`npx vitest run` → 108 files / 960 tests, all pass); (3) typecheck (`npm run type-check` → the 5 pre-existing in-module errors eliminated; zero new application-code errors; the 19 unrelated pre-existing errors and the immutable-trees' 3419 pre-existing errors unchanged and out of scope); (4) lint (`npx eslint src/modules/ai-platform-core/` → clean); (5) `npm run validate:model-config` → PASS; (6) governance regressions (8/8 exit 0; 24/24 exit 0); (7) library integrity (`node verification/validate-library.mjs` from the library root → PASS); (8) immutable-source verification (diff-empty since `03482584`; tree-hash identity vs the pre-implementation baseline; the reconstructed worktree blob verifier → 771/771 present pinned blobs byte-identical, the 31 absent files confined to the `mcp-servers/` family (I-014), 0 mismatches); (9) runtime import scan (zero `doable-source` imports in `src/**`); (10) secret-pattern scan (no matches); (11) production build — NOT RUNNABLE in this workspace (pre-existing incomplete `node_modules` + lockfile desync → I-015; completing the install would rewrite the lockfile — outside authorization; recorded, not absorbed); (12) complete diff inspection + changed-path scope check; (13) Final State Contract consistency. Commands and results: `VERIFICATION_STATE.md` §Phase 7-A implementation.

## Security constraints

- The 7-A boundary fails closed: missing tenant identity / KB binding, malformed contexts, unknown adapters, unregistered lookups, duplicate registrations, and secret requests all produce controlled failures — no implicit global tenant context, no unscoped lookup, no arbitrary dynamic imports, no arbitrary code execution, no secret/provider-credential transfer across the seam, no cross-organization access.
- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads in any changed file (secret-pattern scan: no matches).
- No fabricated timestamps; no unsupported claims; observable evidence only; evidence classes per D-012 (a future/intended architect review is never written as completed).
- The `b65725e5` provenance remains **not independently established** — never described as confirmed owner authorship.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused implementation commit: `feat: establish phase 7-a host contracts and adapter foundation` — the immediate child of `ac06ca72516282bd78f8d0f37afaa46062322b53` — with application changes confined to `src/modules/ai-platform-core/**` and documentation changes confined to the repository-root `worklog.md` and `docs/project-control/**`. Push normally; if the baseline has moved unexpectedly, STOP (no rebase, no force-push) and await a refreshed handoff.
- `b65725e5` is not modified, rewritten, reverted, or amended; `vercel.json` is not touched; the baseline commit is not amended; the immutable Doable-source trees are untouched (verified).

## Stopping boundary

The 7-A boundary is reached with this commit. After the implementation report: **Z.AI STOPs**: no 7-B (no Unified Tool Runtime, no `rag_search` migration, no tool registry), no 7-C (no provider tool calling, no agentic loop), no MCP, no integrations, no Phase 8, no deployment, no database operations, no dependency changes, no resolution of I-014/I-015/I-001/I-007, R-3/R-4/R-5, D-P2, or D-P4 — **until the architect reviews the actual 7-A diff and evidence and issues the next explicit authorization**. Only ChatGPT may authorize 7-B. If the review returns `CORRECTION_REQUIRED`, Z.AI acts only on the corrective handoff (`ZAI_HANDOFF.md` §I.5; `ISSUES.md` §"Issue-control system"). A fresh ChatGPT session resuming leadership at this boundary follows `CHAT_CONTINUITY.md` §5.

## Implementation-stage record (2026-10-02)

**Phase 7-A implemented — architect review of the diff PENDING.** The developer executed the architect's Phase 7-A implementation authorization handoff (issued 2026-10-02; baseline after synchronization `ac06ca72`): the feature worktree was synchronized from the stale local `31ffd6f4` to the authoritative remote tip `ac06ca72` by verified fast-forward (35 documentation/governance-only commits; history preserved; no destructive operations); the baseline was re-verified (branch/HEAD/clean tree/Phase 7 active/I-014 OPEN/immutable trees unchanged/no unexpected source changes — with the pre-implementation typecheck baseline recorded: 24 pre-existing application-code errors, 5 within the module's own `clara-runtime.ts`); the reviewed 7-A design was implemented under `src/modules/ai-platform-core/**` (the fail-closed ExecutionContext factory; the fail-closed host adapter registry; the identity/provider/secrets/transport adapter declarations bound to existing services; 43 focused unit tests; the disclosed minimal `clara-runtime.ts` type-correctness fixes) `[developer-reported]`; validation ran with recorded results (43/43 targeted; 960/960 full suite; typecheck module-clean with zero new errors; lint clean; model-config PASS; governance 8/8 + 24/24; library integrity PASS; immutable source 771/771 byte-verified with the absent files confined to the I-014 family; import/secret scans clean; the production build not runnable for the pre-existing environmental cause recorded as **I-015**); the governance state was reconciled (D-021/D-022; I-015; the Part II instance; this contract; `PROJECT_STATE.md`/`NEXT_ACTION.md`; the worklog entry; `SESSION-012`). **Phase 7 is `IN_PROGRESS` (7-A implemented, awaiting architect review); 7-B and 7-C are NOT authorized; Phase 7 is not `PASS` and not `CLOSED`.** Z.AI STOPs at the review boundary, awaiting the architect's inspection of the actual 7-A diff and evidence. [developer-reported]
