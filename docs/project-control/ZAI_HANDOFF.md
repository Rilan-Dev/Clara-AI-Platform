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

> **CH-002 — Phase 7-A correction-handoff instance** — materialized from `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` per Part I §I.5/§I.12 on 2026-10-02, replacing the fully executed Phase 7-A implementation-authorization handoff instance (superseded; recoverable in Git history at `688070a5fcda04dfce6c971b79322aed34adb4a0` and identified in the canonical `worklog.md` Phase 7-A implementation entry). This instance authorizes **only the corrective scope** (§11): the two Phase 7-A boundary corrections (ExecutionContext provenance; adapter-registry immutability) plus the focused tests proving them and the governance evidence recording the correction. It does **not** authorize 7-B, 7-C, MCP, integrations, agent runtime, memory, skills, attachments, image generation, marketplace, templates, automation, collaboration, database/schema changes, deployment work, `vercel.json`, immutable Doable source, I-014 resolution, I-015 resolution, `package-lock.json` repair, dependency-graph changes, unrelated refactoring, `ai-core` redesign, or Phase 8 (the architect's correction boundary).

## 1. Correction identity

| Field | Value |
|---|---|
| Correction ID | `CH-002` (sequential after CH-001 — the Phase 6 correction; never reused) |
| Correction title | Phase 7-A boundary corrections: ExecutionContext provenance validation and adapter-registry immutability |
| Current status | `REVIEW_PENDING` (lifecycle: `CORRECTION_REQUIRED` (issued 2026-10-02) → `CORRECTION_IN_PROGRESS` → `CORRECTION_SUBMITTED` → `REVIEW_PENDING` — the correction commit, push, and evidence report delivered by the developer 2026-10-02; the architect's re-review has NOT occurred) |
| Issued by | ChatGPT (architect / technical lead / reviewer / controller) |
| Issue date | 2026-10-02 |
| Repository | `Rilan-Dev/Clara-AI-Platform` |
| Branch | `feature/ai-core-from-doable-source` |

## 2. Related issue ID

| Field | Value |
|---|---|
| Issue ID | **I-016** — the `ISSUES.md` record this correction resolves (`ISSUES.md` §"Issue records (canonical schema)") |
| Issue severity | not assigned in the corrective handoff — awaiting architect triage at re-review (developer observation, not a self-assigned label: the defects violate 7-A acceptance criteria 2 and 3 and are closure-blocking while unresolved under the R6 severity model regardless of the eventual P-label) |
| Issue status at issuance | `CORRECTION_REQUIRED` (the architect's review outcome of the Phase 7-A implementation — the register-side record of the determination that this corrective handoff is required) |
| Related prior corrections | none (first correction cycle on I-016 / on the Phase 7-A implementation) |

## 3. Related phase

| Field | Value |
|---|---|
| Phase number / name | Phase 7 — AI Platform Core Foundation; sub-phase 7-A — Host Contracts / Adapter Foundation |
| Phase status | `IN_PROGRESS` (canonical D-011 vocabulary; the phase cannot become `CLOSED` while the closure-blocking correction is unresolved — R6) |
| Review outcome that produced this correction | Architect review of the Phase 7-A implementation — outcome **`CORRECTION_REQUIRED`** (2026-10-02; reviewed commit `688070a5fcda04dfce6c971b79322aed34adb4a0`) |
| Phase contract | `docs/project-control/CURRENT_PHASE.md` (the implementation-stage contract + the correction-stage record appended by this correction) |

## 4. Baseline commit

| Field | Value |
|---|---|
| Correction baseline | `688070a5fcda04dfce6c971b79322aed34adb4a0` — "feat: establish phase 7-a host contracts and adapter foundation" (the reviewed Phase 7-A implementation commit; the developer verified per `ZAI_HANDOFF.md` §I.6 before executing: branch `feature/ai-core-from-doable-source`; HEAD = the baseline = origin tip after fresh fetch; clean tree; no unexpected movement) |

## 5. Architect

**ChatGPT** — architect / technical lead / reviewer / controller. Only the architect may issue this corrective handoff, re-review the correction, and resolve the related issue.

## 6. Developer

**Z.AI** — developer / implementer. Executes only the corrective scope; self-verifies; records evidence; commits; pushes; reports; and STOPs at the correction boundary.

## 7. Finding

The architect's review of the Phase 7-A implementation (`688070a5`) found the architecture and overall scope substantially aligned with the authorized 7-A design, but identified **two fail-closed boundary defects** that must be corrected before 7-A can receive an architect `PASS`:

1. **ExecutionContext provenance (Correction A).** The implementation claimed that only contexts produced by `createExecutionContext()` are accepted, but the validator (`isValidPlatformExecutionContext`) checked only structural validity plus `Object.isFrozen()`. A malicious or accidental caller could construct and freeze an equivalent object independently (the handoff's example: `const forged = Object.freeze({ tenantId: "tenant-b", kbId: "kb-b", surface: "chat" })`) and it would be accepted — the platform-context trust boundary was therefore not actually established.
2. **Adapter registry immutability (Correction B).** The registry committed with `committed = Object.freeze({ ...adapters })` — freezing only the adapter-slot container. The registered adapter objects remained mutable through the original references supplied to `register()` (the handoff's example: after registration, `adapters.provider.resolveModel = hostileImplementation` still altered the registry's provider slot) — violating the intended immutable/fail-closed registration boundary.

## 8. Evidence

- [architect-verified] The architect's corrective handoff on the Phase 7-A implementation (2026-10-02; review outcome `CORRECTION_REQUIRED`; reviewed commit `688070a5fcda04dfce6c971b79322aed34adb4a0`) — §2 (Correction A: the forged-frozen-object example), §4 (Correction B: the post-registration mutation example), and the required tests §3/§5.
- [developer-reported, Git-verifiable] The delivered code at `688070a5`: `src/modules/ai-platform-core/execution-context.ts` — `isValidPlatformExecutionContext` performed structural checks + `Object.isFrozen` only (no provenance mechanism); `src/modules/ai-platform-core/adapter-registry.ts` — `register()` committed via `Object.freeze({ ...adapters })` (shallow container freeze; the slot values kept the caller's original mutable object references).

## 9. Why the finding blocks acceptance

The defects violate Phase 7-A acceptance criteria 2 and 3 (the implementation-stage contract / the superseded 7-A instance in Git history at `688070a5`): criterion 2 requires the ExecutionContext factory to be "the only sanctioned production path" — a validator that accepts frozen lookalikes contradicts exactly that; criterion 3 requires the fail-closed adapter registry with a frozen committed set — a committed set whose adapter objects remain mutable through external references contradicts the intended immutable registration boundary. The 7-A security constraint ("the 7-A boundary fails closed") is implicated for both. The architect's review outcome `CORRECTION_REQUIRED` (2026-10-02) is already recorded; 7-A cannot receive `PASS` until the corrections are delivered and re-reviewed.

## 10. Exact correction required

**Correction A — ExecutionContext provenance.** A valid platform execution context must be demonstrably produced through the sanctioned factory, using an appropriate private provenance mechanism (a module-private `WeakSet` of factory-created contexts, or an equivalently robust mechanism). The mechanism must NOT be exposed publicly; must NOT use a mutable public marker property; must NOT rely solely on `Object.isFrozen`, a symbol exposed to callers, a magic metadata field, or structural equality. The existing tenant/kb/surface validation must remain. The returned context must remain immutable. Required tests: A1 (genuine factory context accepted), A2 (ordinary mutable structural lookalike rejected — preserved), A3 (frozen structural lookalike rejected: `isValidPlatformExecutionContext(forged) === false` AND `assertExecutionContext(forged)` throws), A4 (serialized/reconstructed context rejected — preserved), A5 (factory context remains accepted after validation; the provenance mechanism does not depend on mutable metadata or other externally visible state).

**Correction B — Adapter registry immutability.** Once an adapter set has been successfully registered: the registered slot bindings cannot be replaced; the registered adapter objects cannot be mutated through external references; the registry must continue using the exact validated implementation that was committed; failed registration must still leave the registry unchanged; duplicate registration must still fail deterministically. Minimal implementation consistent with the existing architecture — no large abstraction. Required tests: B1 (original adapter object mutation cannot alter committed behavior), B2 (returned adapter cannot be mutated through `registry.get("provider")` / `requireRegistered()`), B3 (failed registration remains atomic — preserved), B4 (duplicate registration remains atomic — preserved), B5 (all four adapter slots — identity, provider, secrets, transport — retain their committed behavior).

**Architecture unchanged.** The seam (`src/modules/ai-platform-core/**` → Clara host adapters → existing Clara infrastructure → existing `ai-core` provider stack) is not redesigned; the provider adapter architecture, `ai-core`, and the existing Clara runtime behavior are unchanged except where directly necessary to correct the two defects.

## 11. Approved correction scope

| Path | Action | Bounded change |
|---|---|---|
| `src/modules/ai-platform-core/execution-context.ts` | modify | the module-private provenance mechanism (WeakSet) + the corrected `isValidPlatformExecutionContext` (provenance + preserved structural/frozen checks); factory registers sanctioned contexts; doc comments updated |
| `src/modules/ai-platform-core/adapter-registry.ts` | modify | in-place deep freeze of each committed adapter object at commit time (minimal helper; identity-preserving; validate-then-commit atomicity preserved); doc comments updated |
| `src/modules/ai-platform-core/execution-context.test.ts` | modify | the focused tests proving A1/A3/A5 (A2/A4 preserved from the existing suite) |
| `src/modules/ai-platform-core/adapter-registry.test.ts` | modify | the focused tests proving B1/B2/B5 (B3/B4 preserved from the existing suite) |
| `src/modules/ai-platform-core/README.md` | modify | the module boundary documentation updated to the corrected semantics (provenance-based context validation; deep committed-adapter immutability) |
| `docs/project-control/ISSUES.md` | modify | **I-016** appended (the architect's finding, per the canonical schema); the intro next-ID note updated (→ I-017); I-014/I-015 untouched (OPEN) |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II replaced with this CH-002 instance (Part I untouched) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | the Phase 7-A correction evidence section + the architect review-trail entries + the outstanding-state and consistency-table reconciliation (append; the 7-A implementation record preserved unrewritten) |
| `docs/project-control/CURRENT_PHASE.md` | modify | the correction-stage record appended (the implementation-stage record preserved); the current-state header/identity rows reconciled |
| `docs/project-control/PROJECT_STATE.md` / `NEXT_ACTION.md` | modify | reconciled to Phase 7 `IN_PROGRESS` / 7-A correction applied — awaiting architect re-review |
| `worklog.md` | modify | append-only Phase 7-A correction entry |
| `docs/project-control/sessions/SESSION-013.md` + `sessions/README.md` | create / modify | the correction session record + its index row |
| `src/modules/ai-core/**`, `src/app/api/**`, `packages/**`, migrations, Supabase, `vercel.json`, dependency files, the immutable Doable-source trees, `RISKS.md`, `PHASE-7-PLAN.md`, templates, verification scripts | **inspect only** | no changes |

## 12. Explicit non-scope

- No 7-B (Unified Tool Runtime; tool definitions/schemas/registry/invocation lifecycle; `rag_search` migration); no 7-C (provider tool calling; agentic loop); no MCP; no integrations.
- No database/schema/migrations; no Supabase; no deployment; no `vercel.json`.
- No immutable Doable source (`docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**`, `doable-source-extensions/**`).
- No I-014 resolution (remains `OPEN`; no re-vendoring of `mcp-servers/`); no I-015 resolution (remains `OPEN`; no dependency-changing install, no `package-lock.json` rewrite, no dependency add/upgrade/remove, no workspace repair).
- No repair of the 19 remaining pre-existing application typecheck errors (they are NOT claimed fixed).
- No unrelated refactoring; no `ai-core` redesign; no architecture change beyond the two corrected boundaries; no Phase 8.
- No production-branch work (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); no force-push; no history rewrite; no modification/rewrite of `b65725e5` or any historical commit.
- No silently altered acceptance criteria; no unrelated project-control state changes; no unrelated issues fixed.
- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads introduced anywhere.

## 13. Required reading

The architect's corrective handoff (this instance's source — transcribed into §7/§10/§11/§12/§17/§18/§19/§21/§22); `ISSUES.md` I-016 (+ the issue-control system); `VERIFICATION_STATE.md` §"Correction and issue-control workflow" + §Phase 7 (the 7-A implementation record and validation) + the review trail; `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` (the canonical form + correction integrity rules); the affected implementation files at the correction baseline (`src/modules/ai-platform-core/execution-context.ts`, `adapter-registry.ts`, and their test files); `CURRENT_PHASE.md` (the 7-A implementation-stage contract + acceptance criteria 2/3); `NEXT_ACTION.md`; the latest `worklog.md` entry (Phase 7-A implementation).

## 14. Implementation tasks (numbered, deterministic — as executed)

1. Baseline verification per `ZAI_HANDOFF.md` §I.6: branch `feature/ai-core-from-doable-source`; HEAD = `688070a5` = origin tip; clean tree; no unexpected movement; I-014/I-015 OPEN; the pre-correction validation baseline recorded (focused 43/43; typecheck 19 pre-existing application-code errors + 3419 immutable-tree errors).
2. **Correction A** — `execution-context.ts`: the module-private `SANCTIONED_PLATFORM_CONTEXTS: WeakSet<object>`; the factory freezes then registers each sanctioned context; `isValidPlatformExecutionContext` requires provenance membership in addition to the preserved structural + frozen checks; nothing provenance-related exported; no marker property/symbol/metadata written onto contexts.
3. **Correction B** — `adapter-registry.ts`: the minimal `freezeAdapterObject` helper (in-place freeze of the adapter object + defensively its own plain-object/array values; cycle-safe; functions untouched; identity-preserving); `register()` commits the exact validated objects frozen in place inside the frozen container; freezing occurs only after validation and only on the winning registration (failed/duplicate attempts never touch the caller's objects); `committed` assigned only after every freeze succeeds.
4. **Tests** — `execution-context.test.ts`: A1, A3 (incl. the handoff's exact forged example + a hardened fully-populated frozen lookalike + a re-frozen spread-copy of a real context), A5 (no marker property/symbol; repeatable identity-based validation; interleaved validations; mutation does not strip provenance); `adapter-registry.test.ts`: B1 (the handoff's exact post-registration mutation attack), B2 (mutation through `get()`/`requireRegistered()` references), B5 (all four slots: frozen, identity-preserved, committed behavior retained); B3/B4 preserved with the freeze-order property added.
5. **Module documentation** — `README.md` boundary statements updated to the corrected semantics.
6. **Validation** — the §17 suite, executed and recorded with the exact before/after typecheck count.
7. **Governance evidence** — the §11 documentation changes (I-016; this instance; the VERIFICATION_STATE correction section + review trail + consistency; CURRENT_PHASE correction-stage record; PROJECT_STATE/NEXT_ACTION reconciliation; the worklog entry; SESSION-013 + index).
8. **Commit + push + report + STOP** — one focused correction commit (§19), the correction report (§20), then the mandatory HARD STOP (§22).

## 15. Interfaces / contracts

- The Final State Contract: `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (Part II) = `VERIFICATION_STATE.phase` = the latest `worklog.md` entry — all at **Phase 7, `IN_PROGRESS`** (7-A implemented — correction applied `[developer-reported]` — awaiting architect re-review; 7-B/7-C NOT authorized) after this commit.
- The 7-A host contracts are unchanged in shape: `PlatformExecutionContext` (frozen, tenant-scoped) produced only by `createExecutionContext`; the four-slot `PlatformAdapters` registered only through the fail-closed registry; the public module surface (`index.ts` exports) is unchanged — the provenance mechanism adds NO public export; the registry interface (`register`/`get`/`requireRegistered`/`isRegistered`/`listRegistered`) is unchanged in signature.
- The architecture is unchanged: `src/modules/ai-platform-core/**` → Clara host adapters → existing Clara infrastructure → existing `ai-core` provider stack; the provider adapter delegates to the incumbent seam exactly as before (the corrected code changes only the two boundary mechanisms).
- The canonical status vocabularies (D-011 phase statuses; the issue lifecycle; the correction statuses) and the evidence classes (D-012) apply throughout; the issue lifecycle of I-016 follows the canonical transitions (developer effects only CORRECTION_IN_PROGRESS/CORRECTION_SUBMITTED/REVIEW_PENDING registration; RESOLVED is architect-only).

## 16. Security constraints

- No secrets, credentials, or access tokens may be written (the R-5 Vercel token is referenced but never reproduced).
- No private chain-of-thought — observable evidence only; no fabricated timestamps or unsupported claims.
- Tenancy boundaries: the correction STRENGTHENS them — the platform-context trust boundary is now provenance-based (forged frozen lookalikes rejected); the committed adapter set is now immutable through every reference (post-registration behavior substitution prevented). No other application security surface is touched.
- Immutable-source boundaries and production-branch restrictions remain in force (D-007, D-008).

## 17. Testing requirements (validation before commit — this correction)

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | Focused 7-A tests | `npx vitest run src/modules/ai-platform-core/` | the complete 7-A suite passes — 4 files / 53 tests (43 preserved + 10 correction proofs: A1/A3×3/A5 + B1/B2/B3/B4/B5) |
| 2 | Full regression | `npx vitest run` | all pass (108 files / 970 tests — zero regressions) |
| 3 | Lint | `npx eslint src/modules/ai-platform-core/` | 0 errors, 0 warnings |
| 4 | Typecheck | `npm run type-check` (tsconfig.typecheck.json) | the exact before/after count reported: application-code errors **19 → 19** (the 19 pre-existing unrelated errors unchanged and NOT claimed fixed; the module clean; zero new); the 3419 immutable-tree errors unchanged |
| 5 | Governance | `bash docs/project-control/verification/phase-closure-eligibility-test.sh`; `bash docs/project-control/verification/correction-cycle-test.sh`; `npm run validate:model-config` | 8/8 exit 0; 24/24 exit 0; PASS |
| 6 | Immutable source | `git diff 03482584 --stat -- <four immutable trees>` (empty); tree-hash identity vs the baseline (`a42aee79`/`ee07c362`/`b76b8f34`/`54606204`); the worktree blob verifier (`/home/z/my-project/scripts/verify-immutable-blobs-in-worktree.sh`) | 802 pinned · 771 present · 771/771 byte-verified · 0 mismatches; the 31 absent files confined to `mcp-servers/` (I-014 OPEN) |
| 7 | Scope | `git status` / `git diff` / `git diff --stat` / `git show --name-only` (pre-commit inspection) | the correction diff contains only `src/modules/ai-platform-core/**` + `docs/project-control/**` + `worklog.md`, and only the files genuinely required by the correction |

*(A passing test is one Gate C input for the re-review — never, by itself, resolution of the issue or the phase.)*

## 18. Acceptance criteria (pass/fail — evaluated by the architect at re-review of the actual correction diff)

1. A genuine `createExecutionContext` context validates; the exact handoff forgery (`Object.freeze({ tenantId, kbId, surface })`) is rejected by `isValidPlatformExecutionContext` and throws in `assertExecutionContext` — proven by A1/A3.
2. The provenance mechanism is module-private (not exported), uses no mutable public marker property, no exposed symbol, no magic metadata field, no structural equality; the existing tenant/kb/surface validation and context immutability are preserved; genuine contexts remain valid after validation with no externally visible provenance state — proven by A5.
3. Post-registration mutation through the original adapter references cannot alter committed behavior (the handoff's `adapters.provider.resolveModel = hostile` attack fails); the adapters returned by `get()`/`requireRegistered()` cannot be mutated; the registry keeps the exact validated implementation; failed and duplicate registrations remain atomic; all four slots retain committed behavior — proven by B1/B2/B3/B4/B5.
4. The architecture is unchanged (no seam redesign; no provider-adapter architecture change; no `ai-core` modification; no Clara runtime behavior change beyond the two corrections) — verified by diff inspection.
5. I-015 remains `OPEN` (no dependency-changing install; no lockfile rewrite); I-014 remains `OPEN` (immutable source byte-unchanged; the 31 absent files still confined to `mcp-servers/`).
6. The validation evidence (§17) is real and recorded with the exact typecheck before/after count; the 19 pre-existing errors are not claimed fixed.
7. The governance records append the correction event (the historical 7-A implementation record unrewritten); `[developer-reported]` is distinguished from `[architect-verified]`; the correction records the architect outcome `CORRECTION_REQUIRED`, the reviewed commit `688070a5`, both defect reasons, I-015 OPEN, I-014 OPEN, 7-B NOT AUTHORIZED — and records NO architect `PASS`.
8. One focused correction commit, the immediate child of `688070a5`, changed paths within the approved scope, pushed normally (no force-push, no history rewrite).
9. Final state: `Phase 7-A: IMPLEMENTED — CORRECTION APPLIED — AWAITING ARCHITECT REVIEW`; Phase 7 `IN_PROGRESS`; 7-B/7-C `NOT AUTHORIZED`; no `PASS`/`CLOSED` claim for 7-A or Phase 7.

## 19. Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`; no force-push.
- One focused correction commit: `fix: harden phase 7-a execution context and adapter boundaries` — the immediate child of `688070a5fcda04dfce6c971b79322aed34adb4a0`; changed paths limited to the approved correction scope (`src/modules/ai-platform-core/**` + `docs/project-control/**` + `worklog.md`); no unrelated changes ride along; no squashing of unrelated history.
- Pre-commit inspection: `git status`, `git diff`, `git diff --stat`, `git show --name-only` — verifying no unauthorized files changed.
- Push normally to `origin/feature/ai-core-from-doable-source`; do not amend the baseline or any prior commit.

## 20. Evidence requirements

Per `ZAI_HANDOFF.md` §I.7 plus the correction traceability chain: the issue ID (I-016); the architect finding (§7 — both defects, with the handoff's attack examples); the corrective handoff (this CH-002 instance); the correction baseline SHA (`688070a5`); the developer correction commit SHA + message; the verification evidence (commands + results, `[developer-reported]` — the §17 suite with the exact typecheck before/after count); the architect re-review status (**PENDING** — never claimed as completed); the issue resolution state (only architect verification may set `RESOLVED` — I-016 is NOT resolved by this correction). All reported as developer-reported evidence until the architect re-reviews.

## 21. Review boundary

**Developer correction submission does not equal issue resolution, and neither equals phase completion.**

**Only ChatGPT/project-owner architect review can resolve the issue (`RESOLVED`) and close the phase.**

After the correction commit, push, and evidence report: I-016 stands `REVIEW_PENDING` and the phase remains open awaiting the architect's re-review of the actual correction diff. The re-review is Gate D under the verification and phase-gate contract (`VERIFICATION_STATE.md` §contract) — architect-only. Only an actual ChatGPT re-review may produce `architect-verified` resolution evidence. Possible re-review outcomes: `PASS` (I-016 may become `RESOLVED`; 7-A may be accepted; the architect then decides on 7-B authorization), `PASS_WITH_FOLLOWUP` (accepted with recorded follow-ups), `CORRECTION_REQUIRED` (a further corrective handoff — I-016 returns to issue-status `CORRECTION_REQUIRED`; repeat cycle). Z.AI must not choose the outcome.

## 22. STOP boundary (hard stop)

After the correction commit, validation, and push: **Z.AI STOPs.** Do NOT continue into 7-B; do NOT make any additional architectural changes; do NOT start Phase 8; do NOT deploy; do NOT modify `src/modules/ai-core/**`, migrations, Supabase, `vercel.json`, dependency files, or the immutable Doable source; do NOT resolve I-014/I-015/I-001/I-007, R-3/R-4/R-5, D-P2, or D-P4; do NOT mark 7-A or Phase 7 `PASS`/`CLOSED`; do NOT absorb any newly discovered out-of-scope issue into this correction (record it as a new `OPEN` issue and await architect direction). **The architect will independently review the correction diff.** This handoff repairs only the two identified Phase 7-A boundary defects — nothing beyond those corrections is authorized.

---

## Correction integrity rules (binding — from the durable workflow contract)

The developer executes **only** the corrective scope (§10/§11). The developer must NOT: fix unrelated issues; refactor unrelated code; change architecture outside the handoff; silently alter acceptance criteria; modify unrelated project-control state; begin the next phase; or continue past the correction commit and evidence report. The correction is delivered as one focused commit whose message and evidence reference the finding and the issue ID (traceability: architect finding → issue record I-016 → corrective handoff CH-002 → baseline SHA `688070a5` → developer correction commit → verification evidence → architect re-review → issue resolution / phase closure). An unrelated change found in the correction commit is a scope violation — it is not accepted as part of the correction. Issue resolution requires architect verification: **a correction is not resolved merely because Z.AI says it is fixed — only architect verification can establish `architect-verified` resolution.** A developer correction commit never independently closes the issue or the phase.
