# ZAI_HANDOFF.md — Z.AI Developer Handoff System

> Canonical developer-handoff protocol and active handoff instance for the Clara project-control system.
> **Part I** is the durable, reusable handoff protocol — it applies to every implementation phase and changes only by architect direction.
> **Part II** holds the **active handoff instance**: the current phase's assignment materialized in the authoritative format. When the architect issues a new phase handoff, the developer replaces Part II with the new instance; superseded instances remain recoverable in Git history (and, from Phase 4 onward, in the canonical worklog).
> Snapshot date: **2026-10-02**. Repository state is authoritative — refresh it before acting (§I.6).
> Canonical blank form: `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — the only handoff template; no duplicate handoff formats may be created.

---

## Part I — Handoff Protocol (durable; applies to every phase)

### I.1 Purpose

Establish one authoritative, reusable format for Z.AI implementation handoffs so that every implementation phase is **explicit, bounded, reproducible, reviewable, and stoppable**, and so that a completely fresh Z.AI session can implement any approved phase **from repository state alone** — without access to any previous conversation. The handoff system is durable repository state (DECISIONS.md D-006), not chat-carried instruction.

### I.2 Roles and authority boundaries

| Role | Holder | Boundaries |
|---|---|---|
| Developer / implementer | **Z.AI** | Executes the active handoff only. Implements, self-verifies, records evidence, commits, pushes, reports, and **STOPs at the phase boundary**. Must never claim architect approval, never close a phase, never assume architect authority, and never start a later phase without a new architect-issued handoff |
| Architect / technical lead / reviewer / controller | **ChatGPT** | Issues handoffs, reviews evidence, records review outcomes, closes phases, controls Vercel/Supabase operations where applicable. Only ChatGPT/project-owner review closes a phase (D-009) |
| Deployment authority | Vercel (controlled by ChatGPT) | Z.AI never deploys unless explicitly authorized in a handoff (D-004) |
| Database authority | Supabase (controlled by ChatGPT) | Z.AI never changes remote database state unless explicitly authorized in a handoff (D-005) |

### I.3 Required handoff structure (mandatory sections)

Every handoff instance — Part II of this file, created from `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — MUST contain all of the following sections. A handoff missing any section is incomplete and must not be executed.

| # | Section | Must contain |
|---|---|---|
| 1 | Phase identity | Phase number; phase name; current status; repository; branch; baseline commit; architect; developer; handoff date |
| 2 | Objective | Exactly what the developer is being asked to accomplish — one precise statement, no implied extras |
| 3 | Scope | Explicit list of what may be changed (files, areas, documents) |
| 4 | Non-scope | Explicit list of what must NOT be changed — including later phases, product code, database, deployment, and immutable sources as applicable |
| 5 | Prerequisites | Documents, commits, decisions, dependencies, or environmental requirements that must already exist before implementation |
| 6 | Required reading | Exact repository documents the developer must read before implementation |
| 7 | Implementation tasks | Numbered, deterministic tasks in execution order |
| 8 | Files / components | Expected files or bounded areas that may be changed. Where implementation legitimately needs discovery, the permitted architectural area is defined instead of exact files |
| 9 | Interfaces / contracts | API, module, data, tool, adapter, or document contracts that must remain compatible |
| 10 | Security constraints | No secrets; no credentials; no tokens; tenancy boundaries; authorization requirements; immutable-source boundaries; production-branch restrictions — as applicable |
| 11 | Testing requirements | Required tests; validation commands; expected evidence; what must be tested before completion |
| 12 | Acceptance criteria | Concrete pass/fail conditions |
| 13 | Git requirements | Permitted branch; commit requirements; push requirements; no unrelated changes; no production-branch work |
| 14 | Evidence requirements | The developer completion report fields (§I.7) |
| 15 | Review boundary | The statements in §I.8 |
| 16 | STOP boundary | The hard stop defined in §I.9 |

### I.4 Phase lifecycle and status vocabulary

Canonical statuses (D-011; identical vocabulary across all control documents):

```
PLANNED → IN_PROGRESS → developer completion → VERIFIED (architect review) → CLOSED
                        ↘ CORRECTION_REQUIRED (architect review found a defect) → corrective handoff → correction → re-review
                        ↘ BLOCKED (state values disagree, or the phase cannot safely proceed) → reconcile → resume
```

Rules:

1. `PLANNED` — phase defined but not started. Assignment received but not yet begun keeps the phase `PLANNED` until implementation starts.
2. `IN_PROGRESS` — active work underway. **Developer implementation complete, awaiting architect review, is still `IN_PROGRESS`.**
3. Developer completion NEVER transitions a phase to `VERIFIED` or `CLOSED`. Only architect review records `VERIFIED`, and only a `PASS` review outcome closes a phase (`CLOSED`). `PASS_WITH_FOLLOWUP` keeps the phase open with recorded follow-ups.
4. `CORRECTION_REQUIRED` — architect review found a defect; §I.5 applies.
5. `BLOCKED` — the Final State Contract values disagree across control documents, or a blocker prevents safe progress. The phase stays `BLOCKED` until reconciled; reconciliation is recorded in `VERIFICATION_STATE.md`.
6. Phase status is recorded in `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II Phase identity), and `VERIFICATION_STATE.md` — these must always agree (Final State Contract).

### I.5 Correction protocol (`CORRECTION_REQUIRED`)

When architect review returns `CORRECTION_REQUIRED`, the architect issues a **corrective handoff** to the developer. The corrective handoff contains, at minimum:

1. **Finding** — the exact defect or divergence found in review;
2. **Affected scope** — the files/documents/areas touched by the defect;
3. **Required correction** — precisely what must change;
4. **Acceptance criteria** — concrete pass/fail conditions for the correction;
5. **Verification requirements** — commands/evidence required to demonstrate the correction;
6. **Explicit non-scope** — what the correction must NOT touch;
7. **Stop condition** — where the developer stops after delivering the correction.

Rules:

- The developer executes **only** the corrective scope. The developer must NOT independently broaden the correction, fix unrelated issues, refactor, or ride along any extra change.
- The correction is delivered as a focused commit whose message and evidence reference the finding (traceability: finding → corrective handoff → developer commit → re-review, per plan §Review Focus #5).
- Re-review follows the normal review boundary (§I.8). Only `PASS` closes the phase.
- Observed exemplar: the Phase 0 correction cycle (architect finding → corrective directive → developer commit `bcc1769d` → architect advancement; ISSUES.md I-002).
- **From Phase 6 onward** the canonical correction-handoff form is `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` (established by Phase 6 — Correction and Issue-Control Workflow, 2026-10-01; the durable workflow contract is `VERIFICATION_STATE.md` §"Correction and issue-control workflow"; the issue schema/lifecycle/severity model is `ISSUES.md` §"Issue-control system"). A corrective handoff instance is materialized from that template into Part II of this file (annotating or replacing the active instance per §I.12), referencing the related `ISSUES.md` issue ID; the issue's lifecycle status and the correction's status are kept consistent per the issue/phase status relationship (`ISSUES.md` §4). The pre-Phase-6 corrective cycles (Phases 0, 4, and 5) stand as recorded under the convention then in force.

### I.6 Handoff integrity (staleness protection)

Every handoff instance must identify: **repository, branch, baseline commit, phase, date, current status** (Part II Phase identity). GitHub is authoritative (D-001); chat history is supplementary.

Before implementing any handoff, Z.AI MUST refresh repository state and verify the handoff is current:

```bash
git fetch --prune origin
git status --porcelain=v1                 # must be clean
git branch --show-current                  # must equal the handoff's branch
git rev-parse HEAD                         # must equal the handoff's baseline commit, or a documented descendant of it
git rev-parse origin/<branch>              # local HEAD must not be behind origin
```

If the baseline has changed materially — unexpected commits on the branch, divergence from origin, phase-state disagreement among the control documents, or a control-document record of a different active phase — Z.AI MUST STOP and request/await a refreshed handoff rather than blindly applying stale instructions. A stale handoff executed against a moved baseline is exactly the drift failure the control system exists to prevent (RISKS.md R-1; ISSUES.md I-002, I-004).

### I.7 Developer evidence and completion report

At completion of the assigned scope, Z.AI reports ALL of the following (mirrors plan §Required Z.AI Evidence Format):

- exact changed files;
- implementation summary (what was created/changed);
- tests run;
- validation commands and their outputs/results;
- Git status (clean/in-sync) and the implementation commit SHA;
- remaining issues;
- remaining risks;
- deviations from scope (if any);
- unresolved questions (if any);
- security/tenancy considerations (if applicable);
- migration/deployment details (only if applicable);
- explicit confirmation that no later phase was started.

The report is developer-reported evidence, submitted for architect review. Z.AI must not claim architect approval.

### I.8 Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

Review outcomes are `PASS` (closes the phase), `PASS_WITH_FOLLOWUP` (phase stays open with recorded follow-ups), and `CORRECTION_REQUIRED` (corrective handoff issued; §I.5). Review outcomes and their evidence are recorded by the architect workflow in `VERIFICATION_STATE.md`, which strictly separates developer-reported from architect-verified evidence (D-012).

### I.9 STOP boundary (hard stop)

After completing the assigned scope, validation, commit/push, and the evidence report, Z.AI MUST STOP and wait for architect review. Until a new architect-issued handoff arrives, Z.AI must NOT:

1. start the next phase (or any later phase);
2. implement unrelated improvements;
3. make architectural decisions outside the handoff;
4. deploy unless explicitly authorized;
5. modify production (branches, database, deployment configuration);
6. silently expand scope.

This STOP boundary is mandatory for every handoff instance.

### I.10 Fresh-session usability requirements

A completely new Z.AI session with no previous conversation must be able to, from repository files alone:

1. identify its role (developer/implementer — §I.2);
2. identify the active phase (Part II Phase identity; `PROJECT_STATE.md`);
3. identify the exact scope (Part II Scope);
4. identify the non-scope (Part II Non-scope);
5. know what to read (Part II Required reading);
6. know what to implement (Part II Implementation tasks);
7. know what to test (Part II Testing requirements);
8. know what evidence to produce (Part II Evidence requirements; §I.7);
9. know when to stop (Part II STOP boundary; §I.9);
10. know that ChatGPT must review the result (Part II Review boundary; §I.8).

A handoff instance that fails any of these ten checks is defective and must be corrected before execution.

### I.11 Relationship to other control documents

Fresh-session read order for a Z.AI developer session:

1. `docs/project-control/PROJECT_STATE.md` (authoritative current state);
2. `docs/project-control/CURRENT_PHASE.md` (active-phase contract);
3. **this file** — `docs/project-control/ZAI_HANDOFF.md` (active handoff instance);
4. `docs/project-control/VERIFICATION_STATE.md` (evidence and verification state);
5. `docs/project-control/NEXT_ACTION.md` (smallest continuation instruction);
6. registers as needed: `DECISIONS.md`, `ISSUES.md`, `RISKS.md`;
7. codebase agent instructions: `Doc/18-09-2026/AGENTS.md`; immutable-source rules: `docs/doable-source/AGENTS.md`.

`ZAI_HANDOFF.phase` (Part II Phase identity) participates in the Final State Contract and must agree with `PROJECT_STATE.current_phase`, `CURRENT_PHASE.phase`, `NEXT_ACTION.phase`, `VERIFICATION_STATE.phase`, and the latest verified commit.

### I.12 Template and instance management

- `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` is the single canonical blank phase-handoff form (Phase 0 report §10; plan Phase 2). No other handoff template may be created; no duplicate handoff source may exist (`git ls-files` must show exactly one handoff protocol file and one phase-handoff template file under `docs/project-control/`).
- `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` is the single canonical correction-handoff form (established by Phase 6, 2026-10-01; the appendix variant in the phase template is superseded from Phase 6 onward and remains only as the historical record of the Phase 0–5 convention). Corrective-handoff instances are materialized from it into Part II of this file per §I.5.
- New instances are created by filling the template from the architect's issued handoff and replacing Part II of this file as the first implementation task of the new phase.
- Superseded instances are NOT kept as separate files (that would create competing sources of truth); they remain recoverable in Git history, and from Phase 4 onward in the canonical worklog.

---

## Part II — Active Handoff Instance

> **Phase 7-A implementation authorization handoff instance** — materialized from `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` per Part I §I.12 on 2026-10-02, replacing the fully executed Phase 7 planning/baseline handoff instance (superseded; recoverable in Git history at `ac06ca72516282bd78f8d0f37afaa46062322b53` — the authorization-boundary restoration tip — and identified in the canonical `worklog.md` Phase 7 planning entry). This instance authorizes **exactly Phase 7-A — Host Contracts / Adapter Foundation (§3)**. It does **not** authorize Phase 7-B, Phase 7-C, MCP, integrations, agent runtime, memory, skills, attachments, image generation, marketplace, templates, automation, collaboration, database/schema changes, deployment work, or Phase 8 (the architect's authorization boundary).

### Phase identity

| Field | Value |
|---|---|
| Phase number | 7 |
| Phase name | AI Platform Core Foundation (Phase 7-A — Host Contracts / Adapter Foundation stage) |
| Full designation | Phase 7-A — Host Contracts / Adapter Foundation (the first authorized implementation sub-phase of Phase 7) |
| Current status | `IN_PROGRESS` — 7-A authorization received 2026-10-02 and executed by the developer (implementation delivered `[developer-reported]`, architect review of the actual 7-A diff/evidence **PENDING**); 7-B/7-C remain unauthorized; Phase 7 is not `PASS`, not `CLOSED` |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `ac06ca72516282bd78f8d0f37afaa46062322b53` ("docs: restore phase 7 planning authorization boundary" — the authoritative remote feature-branch tip at issuance; the local feature worktree was stale at `31ffd6f4` and was synchronized to this tip by fast-forward before implementation, per the handoff's §3 worktree-synchronization directive) |
| Architect | ChatGPT |
| Developer | Z.AI |
| Handoff date | 2026-10-02 |

### Objective

Implement exactly the reviewed Phase 7-A design (`PHASE-7-PLAN.md` §21 sub-phase 7-A): after the mandated feature-worktree synchronization and baseline re-verification, establish the Clara-owned platform seam foundation under `src/modules/ai-platform-core/**` — the fail-closed ExecutionContext factory derived from Clara's existing runtime identity (tenant/org isolation, user identity, request/correlation context, authorization boundaries, future usage/metering information; no second authentication system; no bypass of Clara's tenancy model); the fail-closed host adapter registry (explicit registration, deterministic lookup, no implicit fallback, unknown adapter → controlled failure, tenant context preserved, no cross-tenant leakage); and the Clara host seam (identity/provider/secrets/transport adapter declarations bound to existing services — the incumbent `ai-core` provider/resolver stack consumed through the existing `claraRuntime` seam, never duplicated; secrets never crossing the seam; transport declaring only existing routes) — with focused unit tests, zero new runtime dependencies, no database/persistence changes, no new public routes, no immutable-source changes; then update the control documentation, create one focused commit, deliver the structured implementation report, and STOP for architect review of the actual diff.

### Scope (approved)

1. Feature-worktree synchronization to the authoritative remote tip `ac06ca72516282bd78f8d0f37afaa46062322b53` (clean-tree verification; remote-tip verification; history-preserving fast-forward only; no destructive reset; no force-push; no history rewrite; `main`/`Vercel-Prod` untouched; no unrelated merges) — per the handoff §3.
2. Baseline re-verification after synchronization (branch; expected HEAD; clean tree; Phase 7 active; authorization recorded; I-014 OPEN; immutable Doable source unchanged; no unexpected source changes) — per the handoff §4.
3. Implementation of the reviewed 7-A design under `src/modules/ai-platform-core/**` only: new host-contract files (execution context; adapter registry; Clara adapter bindings), additive module exports, module documentation, focused colocated unit tests, and minimal behavior-preserving type-correctness fixes to the module's own incumbent binding file (`clara-runtime.ts` — pre-existing broken import paths and nullability mismatches discovered by the baseline typecheck) — per the handoff §5/§6.
4. Control-documentation updates recording the 7-A authorization, execution, validation, and stopping boundary (append-only conventions; `[developer-reported]` vs `[architect-verified]` distinguished; no fabricated architect verification) — per the handoff §13.
5. One focused implementation commit + push + the structured implementation report (handoff §14/§16), then HARD STOP.

### Non-scope (explicit)

- **No 7-B / 7-C**: no Unified Tool Runtime, no tool definitions/registry/invocation lifecycle, no `rag_search` migration, no provider tool calling, no agentic loop, no streaming tool events.
- No MCP, no integrations, no agent runtime, no work mode, no memory, no skills, no attachments, no image generation, no marketplace, no templates, no automation, no collaboration, no UI work.
- No database migrations, schema changes, Supabase operations, new persistence layer, tables, or indexes (Gate E `NOT_APPLICABLE` for 7-A unless implementation unexpectedly introduces persistence — if so: STOP and report).
- No deployment work; Gate F not executed; D-P4 remains pending.
- No new public routes; no modification of unrelated API behavior, authentication, billing, embed, or deployment endpoints.
- No new runtime dependencies (prefer zero; any proven-necessary addition requires a STOP-and-report before adding).
- No modification of the immutable trees (`docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**`, `doable-source-extensions/**`), no `b65725e5` modification, no `vercel.json` change, no production-branch work (D-008), no force-push.
- No resolution of I-014 (remains `OPEN` — no re-vendoring of `mcp-servers/`, no copying of MCP server files, no closure, no priority/disposition change), I-001, I-007, R-3/R-4/R-5, D-P2, D-P4; no Phase 8.

### Prerequisites

1. The architect's Phase 7 planning-package review returned **`PASS`** (communicated in this handoff: "Planning package: PASS; Phase 7: PLANNED; Implementation: NOT AUTHORIZED until this handoff; Doable source: immutable; I-014: OPEN and NOT RESOLVED; no application implementation performed during review") [architect-verified — as communicated in the Phase 7-A implementation authorization handoff].
2. This Phase 7-A implementation authorization handoff (the instance's source), issued 2026-10-02 — the explicit architect authorization for 7-A ONLY.
3. The reviewed planning package `docs/project-control/PHASE-7-PLAN.md` (the design source for 7-A: §4 scope, §8 architecture, §9 adapter boundaries, §21 sub-phase 7-A, §23 ratified items) and the ratified decisions D-021/D-022 (`DECISIONS.md`).
4. The existing project-control governance model (Phases 0–6) and the Doable-source immutable-source policy (D-007) — read and followed.

### Required reading

`PROJECT_STATE.md` · `CURRENT_PHASE.md` (the Phase 7-A implementation-stage contract) · `NEXT_ACTION.md` · `PHASE-7-PLAN.md` (the reviewed planning package — the 7-A design source) · `VERIFICATION_STATE.md` (the durable verification/phase-gate contract and correction workflow) · `ISSUES.md` (I-014 OPEN; the issue-control system) · `DECISIONS.md` (D-021/D-022; the ratified items) · `ZAI_HANDOFF.md` Part I · `VERIFICATION_CHECKLIST.md` · `sessions/README.md` + latest session records · root `worklog.md` · `src/modules/ai-platform-core/**` (the incumbent seam: `clara-runtime.ts`, `README.md`) · `src/modules/ai-core/**` (the incumbent provider/resolver stack — consumed, never duplicated) · `docs/doable-source/contracts/` + `docs/doable-source/adapters/` (the architectural PATTERN — read as design reference only, never imported).

### Implementation tasks (numbered, deterministic — as executed)

1. Worktree synchronization (§ Scope 1) — completed 2026-10-02: feature worktree verified clean; remote tip verified (`ac06ca72` after fresh fetch); fast-forward safety verified (`31ffd6f4` is a strict ancestor — 35 commits, no divergence); fast-forward merge executed; history preserved; no reset/force-push/rewrite; `main`/`Vercel-Prod` untouched.
2. Baseline re-verification (§ Scope 2) — completed 2026-10-02: branch `feature/ai-core-from-doable-source`; HEAD = `ac06ca72` = origin tip; clean tree; the 35 incoming commits verified documentation/governance-only (the phase records, the architect-review/authorization records, and the authorization-boundary restoration commits; the only non-docs change is the pre-existing `vercel.json` preview-deployment enablement from the historical `b65725e5` lineage); Phase 7 active (`PLANNED`, planning package delivered, awaiting the authorization this handoff provides); I-014 OPEN; immutable tree hashes recorded and verified unchanged; pre-implementation typecheck baseline recorded (24 pre-existing application-code errors, 5 of them within `src/modules/ai-platform-core/clara-runtime.ts`).
3. Implement the 7-A foundation under `src/modules/ai-platform-core/**` (§ Scope 3): `contracts.ts` (host-neutral seam vocabulary) + `execution-context.ts` (fail-closed factory, frozen contexts, tenant-scope guard) + `adapter-registry.ts` (fail-closed registry: validate-then-commit registration, deterministic exact-slot lookup, unknown-adapter controlled failure, re-registration rejection, frozen committed set) + `clara-adapters.ts` (Clara bindings: identity → factory; provider → delegation to the incumbent `claraRuntime.resolveProvider` seam; secrets → always-fail-closed non-transfer declaration; transport → existing-routes-only declaration; the lazily-initialized application registry singleton) + additive `index.ts` exports + the module `README.md` 7-A foundation documentation + minimal behavior-preserving type fixes in `clara-runtime.ts` (import-path correction for `resolveAIConfigCached`/`ResolvedAIConfig`; `?? undefined` nullability coercions; the grounding surface mapping corrected to the valid `QuerySurface` vocabulary) + the three colocated test files.
4. Validate (§ Testing requirements) and record results.
5. Update the control documentation (§ Scope 4).
6. Commit (§ Git requirements), push, deliver the completion report, and STOP (§ STOP boundary).

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `src/modules/ai-platform-core/contracts.ts` | create | host-neutral seam vocabulary: `PlatformExecutionContext`, `ExecutionContextInput`, `SurfaceKind`, the 7-A adapter ports (`IdentityTenantAdapter`, `ProviderAdapter`, `SecretsAdapter`, `TransportAdapter`), `PlatformAdapters`, `PlatformAdapterName` — types only, zero runtime dependencies |
| `src/modules/ai-platform-core/execution-context.ts` | create | fail-closed `createExecutionContext` factory (mandatory tenant/KB binding; no ambient fallback; unknown-key typo guard; frozen context + frozen metadata copy), `ExecutionContextError`, `isValidPlatformExecutionContext` / `assertExecutionContext` (factory-produced-only validation), `assertTenantScope` (cross-tenant guard) |
| `src/modules/ai-platform-core/adapter-registry.ts` | create | `createPlatformAdapterRegistry()` + `AdapterRegistrationError` / `UnknownAdapterError` / `AdaptersNotRegisteredError`: per-slot method-shape validation at registration (validate-then-commit; a rejected registration leaves the registry untouched), duplicate-registration rejection preserving the live binding, deterministic exact-slot lookup with no fallback, frozen committed adapter set |
| `src/modules/ai-platform-core/clara-adapters.ts` | create | `buildClaraPlatformAdapters()` (the Clara bindings) + `getClaraPlatformRegistry()` / `getClaraPlatformAdapter()` (lazily-initialized singleton, registers exactly once) + `PlatformSecretAccessError` (secrets never cross the seam) |
| `src/modules/ai-platform-core/execution-context.test.ts` | create | factory mapping/normalization; fail-closed on missing tenant/KB/non-object/unknown keys/malformed fields; structural compatibility with `ClaraRuntimeContext`; freeze/immutability proofs; hand-rolled-lookalike rejection; tenant-scope guard tests |
| `src/modules/ai-platform-core/adapter-registry.test.ts` | create | registration acceptance; per-slot missing/mis-shaped rejection (deterministic naming; registry stays unregistered); duplicate-registration rejection preserving the live binding; frozen committed set; unknown-adapter controlled failures; pre-registration failures; registry isolation |
| `src/modules/ai-platform-core/clara-adapters.test.ts` | create | identity delegation + fail-closed; provider delegation with tenant-preservation proofs against a mocked incumbent seam (tenant A's invocation can never resolve tenant B's context; malformed invocation fails before reaching the resolver; surface pass-through; neutral resolution descriptor); secrets always-fail-closed; transport existing-routes-only + frozen declarations; singleton registration-once behavior |
| `src/modules/ai-platform-core/index.ts` | modify | additive re-exports of the 7-A foundation (the incumbent `clara-runtime` export unchanged) |
| `src/modules/ai-platform-core/README.md` | modify | the 7-A foundation documentation (file map; adapter-slot bindings; provenance/immutability rules; stopping boundary) — the incumbent boundary statements preserved |
| `src/modules/ai-platform-core/clara-runtime.ts` | modify | minimal behavior-preserving type-correctness fixes for the module's own pre-existing defects (see § Interfaces): corrected import paths; `?? undefined` nullability coercions on resolver inputs; the grounding `surface` value corrected to the valid `QuerySurface` vocabulary ("chat" → "workspace"). No behavioral redesign; no incumbent-stack changes |
| `docs/project-control/CURRENT_PHASE.md` | modify | the Phase 7-A implementation-stage contract (the planning-stage contract is preserved in Git history at `ac06ca72`) |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II replaced with this instance (Part I untouched) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | the Phase 7-A implementation evidence section + review-trail entries + consistency-table reconciliation |
| `docs/project-control/PROJECT_STATE.md` / `NEXT_ACTION.md` | modify | reconciled to Phase 7 `IN_PROGRESS` (7-A implemented, awaiting architect review) |
| `docs/project-control/DECISIONS.md` | modify | D-021/D-022 appended (the architect-ratified D-P3 resolution and phase-ladder reconciliation, per the handoff §2); the D-P3 pending row status updated to RESOLVED → D-021 (the D-P1 → D-018 precedent) |
| `docs/project-control/ISSUES.md` | modify | **I-015** appended (the dependency-lockfile desync / incomplete-workspace-node_modules finding — discovered during 7-A validation, reported per the out-of-scope-discovery rule); I-014 untouched (OPEN) |
| `worklog.md` | modify | append-only Phase 7-A implementation entry |
| `docs/project-control/sessions/SESSION-012.md` | create | this session's audit record |
| `docs/project-control/sessions/README.md` | modify | SESSION-012 index row |
| `src/modules/ai-core/**`, `src/app/api/**`, `packages/**`, migrations, Supabase, `vercel.json`, `docs/doable-source/**` (immutable trees), `RISKS.md`, templates, verification scripts | **inspect only** | no changes |

### Interfaces / contracts

- The Final State Contract: `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (Part II) = `VERIFICATION_STATE.phase` = the latest `worklog.md` entry — all at **Phase 7, `IN_PROGRESS`** (7-A implemented `[developer-reported]`, awaiting architect review; 7-B/7-C NOT authorized) after this commit.
- The 7-A host contracts (this instance's product): `PlatformExecutionContext` (frozen, tenant-scoped: `tenantId`/`kbId` mandatory; `userId`/`agentId`/`sessionId`/`correlationId` optional; `surface` explicit) produced ONLY by `createExecutionContext`; the four-slot `PlatformAdapters` (identity/provider/secrets/transport) registered ONLY through the fail-closed registry; the provider adapter delegates to the incumbent seam (`claraRuntime.resolveProvider` → `ai-core` resolver ladder) carrying the caller's tenant context unchanged (D-021: the incumbent stack stays authoritative).
- The incumbent `ai-core` provider/resolver interfaces, the resolver precedence ladder, the entitlement gating, and the `claraRuntime` seam methods are consumed unchanged — no provider is replaced, rewritten, removed, or duplicated; no second LLM stack; `ChatOptions` untouched (7-C only, unauthorized).
- Zero new runtime dependencies (`zod`/`ws` remain unused-by-7-A existing declarations); no database/persistence surface; no API/route surface; no UI surface.
- The immutable-source policy (D-007 + `doable-source-extensions/` immutable-by-provenance) remains in force; the Doable `contracts/`/`adapters/` pattern is referenced for design only — never imported at runtime (static import scan: zero matches in `src/**`).

### Security constraints

- Fail-closed everywhere: missing tenant identity, missing KB binding, malformed contexts, unknown adapter names, unregistered lookups, duplicate registrations, and secret requests all produce controlled failures — never implicit fallbacks, ambient scopes, or silent overwrites.
- No implicit global tenant context; no unscoped adapter lookup; no arbitrary dynamic imports; no arbitrary code execution; no secret or provider-credential leakage (the secrets adapter always fails closed — `PlatformSecretAccessError`); no cross-organization access (frozen contexts + tenant-scope guard + tenant-preservation delegation proofs).
- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads in any changed file (secret-pattern scan: no matches).
- No fabricated timestamps; no unsupported claims; a future/intended architect review is never written as completed (D-012).

### Testing requirements (validation before commit — this stage)

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | Targeted 7-A unit tests | `npx vitest run src/modules/ai-platform-core/` | all pass (43 tests across 4 files incl. the incumbent seam's 2) |
| 2 | Full relevant test suite | `npx vitest run` | all pass (108 files / 960 tests — no regression anywhere) |
| 3 | Typecheck | `npm run type-check` (tsconfig.typecheck.json) | the 5 pre-existing errors within `src/modules/ai-platform-core/` eliminated; **zero new application-code errors** (19 pre-existing errors in unrelated files — all environmental missing-optional-dependency / unrelated-route defects — remain untouched, recorded); the immutable `docs/doable-source/**` reference trees' pre-existing errors (3419) unchanged and out of scope |
| 4 | Lint | `npx eslint src/modules/ai-platform-core/` | 0 errors, 0 warnings |
| 5 | Model config | `npm run validate:model-config` | PASS |
| 6 | Governance regressions | `bash docs/project-control/verification/phase-closure-eligibility-test.sh`; `bash docs/project-control/verification/correction-cycle-test.sh` | 8/8 exit 0; 24/24 exit 0 |
| 7 | Library integrity | `node verification/validate-library.mjs` (from `docs/doable-source/`) | PASS |
| 8 | Immutable-source verification | `git diff 03482584 HEAD --stat -- <four immutable trees>` (empty); tree-hash comparison vs the pre-implementation baseline; the reconstructed worktree blob verifier (`/home/z/my-project/scripts/verify-immutable-blobs-in-worktree.sh`, agent workspace) | 771/771 present pinned blobs byte-identical; the 31 absent files confined to the `mcp-servers/` family (I-014); 0 mismatches |
| 9 | Runtime import scan | static search of `src/**` for imports of `doable-source` | zero matches |
| 10 | Secret-pattern scan | credential/token patterns across all changed paths | no matches |
| 11 | Production build | `next build` | **not runnable in this workspace** — pre-existing environmental condition: `node_modules` is incomplete relative to `package.json` (106 packages absent incl. `@vercel/queue`/`@vercel/functions`/`@elevenlabs/*`) and `package-lock.json` is out of sync with `package.json` (`@vercel/functions` declared-but-unlocked — recorded as **I-015**); completing the install would rewrite the lockfile (a dependency-graph change outside 7-A authorization). The 7-A change introduces zero dependencies and is fully covered by checks 1–10. Not caused by 7-A; not fixed by 7-A (report, do not absorb) |
| 12 | Changed-path scope check | `git status` / `git show --name-only` post-commit | application changes confined to `src/modules/ai-platform-core/**`; documentation changes confined to `worklog.md` + `docs/project-control/**`; nothing else |
| 13 | Final State Contract consistency | cross-member phase/status check | Phase 7 `IN_PROGRESS` (7-A implemented, awaiting review) agreeing across the five members + the latest worklog entry |
| 14 | Git hygiene | `git status --porcelain`; `git rev-parse HEAD origin/feature/ai-core-from-doable-source` | clean tree after commit; local = origin after push |

### Acceptance criteria (pass/fail — evaluated by the architect at review of the actual 7-A diff and evidence)

1. The worktree synchronization was performed safely (fast-forward only; history preserved; no reset/force-push/rewrite; production branches untouched) and the baseline re-verified — PASS/FAIL.
2. A tenant-scoped, frozen `PlatformExecutionContext` exists, produced only by a fail-closed factory requiring tenant and KB identity, with no ambient fallback — PASS/FAIL.
3. A fail-closed adapter registry exists: explicit registration with up-front validation; deterministic exact-slot lookup; no implicit fallback; unknown adapter → controlled failure; duplicate registration rejected deterministically — PASS/FAIL.
4. The four 7-A adapter declarations are bound to existing services: identity (factory), provider (delegation to the incumbent seam), secrets (always-fail-closed non-transfer), transport (existing-routes-only declaration) — PASS/FAIL.
5. The incumbent `ai-core` provider/resolver architecture is unmodified and unduplicated (delegation only; `ChatOptions` untouched) — PASS/FAIL.
6. Focused tests prove: registration acceptance/rejection; execution-context preservation and fail-closed behavior; tenant isolation (no cross-tenant resolution; frozen contexts; malformed invocation fails safely); secrets never crossing the seam — PASS/FAIL.
7. Zero new runtime dependencies; no database/persistence changes; no new routes; no deployment; immutable source byte-unchanged; no runtime import of the Doable reference — PASS/FAIL.
8. The only pre-existing-file modification is the minimal, behavior-preserving type-correctness fix set within `clara-runtime.ts`, fully disclosed — PASS/FAIL.
9. Validation evidence exists and is recorded (tests/typecheck/lint/governance/immutable checks with actual commands and results); the build-attempt limitation is honestly recorded with its pre-existing cause (I-015) — PASS/FAIL.
10. I-014 remains `OPEN`; no issue is closed; the new I-015 finding is recorded `[developer-reported]` for architect triage — PASS/FAIL.
11. The control documentation records the 7-A authorization, execution, validation, and the exact stopping boundary; `[developer-reported]` is distinguished from `[architect-verified]`; no fabricated architect verification — PASS/FAIL.
12. Phase 7 is not marked `PASS`/`CLOSED`; 7-B is not marked authorized or in progress; the Final State Contract is consistent — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`; no force-push.
- One focused implementation commit: `feat: establish phase 7-a host contracts and adapter foundation` — the immediate child of `ac06ca72516282bd78f8d0f37afaa46062322b53`; application changes confined to `src/modules/ai-platform-core/**`; documentation changes confined to the repository-root `worklog.md` and `docs/project-control/**`; no unrelated changes; no bundling of 7-B/7-C/MCP/integrations/unrelated cleanup. If the baseline has moved unexpectedly: STOP — no rebase or force-push without a refreshed architect handoff.
- Push normally to `origin/feature/ai-core-from-doable-source`; do not amend the baseline or any historical commit.

### Evidence requirements

The developer completion report (per Part I §I.7 and the handoff §16) must provide: **A. Baseline** (branch; starting commit `31ffd6f4` → synchronized remote commit `ac06ca72`; worktree state); **B. 7-A Implementation** (files created/modified; architecture; contracts; adapters; integration points); **C. Scope Verification** (7-B/7-C/MCP/integrations not implemented; no DB changes; no deployment; immutable source unchanged; no unauthorized dependencies); **D. Validation** (actual commands/results: targeted tests; full suite; typecheck with the baseline comparison; lint; governance validators; immutable-source verification); **E. Issues/Risks** (I-014 OPEN; the new I-015 finding; pre-existing defects fixed within module scope — disclosed); **F. Commit** (SHA; message; changed files; diff summary); **G. Phase State** (`Phase 7-A: IMPLEMENTED — AWAITING ARCHITECT REVIEW`; Phase 7 not complete; 7-B not authorized). All `[developer-reported]`; no `PASS`, no approval, no closure claimed.

### Review boundary

**Developer implementation completion does not equal phase completion, and this implementation report is developer evidence until reviewed.**

**Only ChatGPT/project-owner architect review can accept the 7-A implementation; the architect will independently inspect the actual diff before deciding whether 7-B can be authorized; only an actual `PASS` review can later close the phase.**

Review outcomes: `PASS` (the 7-A implementation is accepted — the architect then decides on 7-B authorization); `PASS_WITH_FOLLOWUP` (accepted with recorded follow-ups); `CORRECTION_REQUIRED` (a corrective handoff is issued per §I.5 / the Phase 6 workflow; the sub-phase returns to correction). Z.AI must not choose the outcome, must not self-approve, and must not treat the work-order text of any assignment as approval.

### STOP boundary (hard stop — the architect's FINAL STOP CONDITION)

After the 7-A commit, push, and implementation report: **Z.AI STOPs.** Do NOT proceed to 7-B (no Unified Tool Runtime, no `rag_search` migration, no tool registry); do NOT implement 7-C (no provider tool calling, no agentic loop); do NOT implement MCP or integrations; do NOT start Phase 8; do NOT deploy; do NOT resolve I-014/I-015/I-001/I-007, R-3/R-4/R-5, D-P2, or D-P4; do NOT modify `src/modules/ai-core/**`, migrations, Supabase, `vercel.json`, or the immutable Doable source beyond this instance's authorized 7-A scope. **Wait for the architect's review of the actual 7-A diff and evidence.** No further implementation is authorized by the handoff this instance materializes. If a newly discovered issue is outside the authorized scope: record it in `ISSUES.md` as a new `OPEN` issue (`[developer-reported]`) and await architect direction — as done for I-015.
