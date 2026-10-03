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

> **CH-003 — Phase 7-B corrective-handoff instance (findings F-7B-01 / F-7B-02)** — materialized from `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` per Part I §I.5/§I.12 on 2026-10-03, replacing the fully executed Phase 7-B implementation-authorization instance (superseded; recoverable in Git history at `74200beca21fb2b15817fe2471dc86929316cd48` and identified in the canonical `worklog.md` entries; its execution-record addenda below stand unmodified as history). This correction authorizes ONLY the correction of the two architect findings below. It does **not** authorize Phase 7-C (provider tool calling, agentic loops, bounded iteration logic, tool-calling provider APIs), MCP, integrations, deployment, dependency remediation, I-014 remediation, I-015 remediation, database migrations, schema modification, new billing systems, `rag_search` retrieval-behavior changes, or unrelated refactoring. Phase 7 remains `IN_PROGRESS`; Phase 7-B is `CORRECTION_SUBMITTED — AWAITING ARCHITECT RE-REVIEW`; 7-C remains **NOT AUTHORIZED**.

## 1. Correction identity

| Field | Value |
|---|---|
| Correction ID | `CH-003` (sequential from `CH-001`/`CH-002`; never reused) |
| Correction title | Phase 7-B Corrective Handoff: Metering Spine Binding and Invocation Boundary |
| Current status | `CORRECTION_SUBMITTED` (the developer executed the corrective handoff 2026-10-03; the architect's re-review is PENDING) |
| Issued by | ChatGPT (architect / technical lead / reviewer / controller) |
| Issue date | 2026-10-03 |
| Repository | `Rilan-Dev/Clara-AI-Platform` |
| Branch | `feature/ai-core-from-doable-source` |
| Worktree | `/home/z/my-project/.worktrees/vc` |
| Current synchronized remote state at issuance | `74200beca21fb2b15817fe2471dc86929316cd48` |

## 2. Related issue ID

| Field | Value |
|---|---|
| Issue ID | `I-017` — the `ISSUES.md` record this correction resolves (both findings F-7B-01 and F-7B-02, per the one-review/one-issue convention established by I-016) |
| Issue severity | not assigned in the corrective handoff — awaiting architect triage at re-review (acceptance-violating and therefore closure-blocking while unresolved under the R6 severity model regardless of the eventual P-label) |
| Issue status at issuance | `CORRECTION_REQUIRED` (the architect review outcome; registered `OPEN` → `TRIAGED` → `CORRECTION_REQUIRED` on receipt) |
| Related prior corrections | none on this issue (CH-001 — Phase 6 P2/P3 closure policy; CH-002 — Phase 7-A boundary defects / I-016 — both RESOLVED) |

## 3. Related phase

| Field | Value |
|---|---|
| Phase number / name | Phase 7 — AI Platform Core Foundation; sub-phase 7-B — Unified Tool Runtime |
| Phase status | `IN_PROGRESS` (cannot become `CLOSED` while the closure-blocking issue is unresolved) |
| Review outcome that produced this correction | `CORRECTION_REQUIRED` — the architect's review of the actual GitHub implementation at `63bccded2c61d29ba1a2218cf654bd3901ba6940`, 2026-10-03 |
| Phase contract | `docs/project-control/CURRENT_PHASE.md` |

## 4. Baseline commit

| Field | Value |
|---|---|
| Correction baseline | `74200beca21fb2b15817fe2471dc86929316cd48` — the developer verified per Part I §I.6 before executing: branch `feature/ai-core-from-doable-source`; HEAD = `74200bec` = origin tip after fresh fetch; clean tree; the Phase 7-B implementation commit `63bccded2c61d29ba1a2218cf654bd3901ba6940` present, unmodified (not rewritten/amended), and an ancestor of HEAD |

## 5. Architect

**ChatGPT** — architect / technical lead / reviewer / controller. Only the architect may issue this corrective handoff, re-review the correction, and resolve the related issue.

## 6. Developer

**Z.AI** — developer / implementer. Executes only the corrective scope; self-verifies; records evidence; commits; pushes; reports; and STOPs at the correction boundary.

## 7. Finding

**F-7B-01 — Production Clara metering binding does not satisfy the reviewed metering acceptance criterion.** The reviewed Phase 7 plan requires: Unified Tool Runtime metering hooks; existing org-scoped usage/analytics spine integration; per-invocation usage metering; no duplicated billing architecture; preservation of the incumbent `rag_search` `admission: "external"` semantics. The generic runtime abstraction (`ToolMeteringHook`) is acceptable and the runtime correctly invokes an injected hook — but the production Clara implementation (`buildClaraToolMeteringHook()`) only performs structured `console.info(...)`; the implementation's own test confirms "the default Clara metering hook completes without writing". This does not satisfy the reviewed Phase 7-B acceptance requirement that tool invocation metering lands on the existing org-scoped spine / remains observable through existing usage/analytics infrastructure.

**F-7B-02 — Invalid-context metering contract is stronger than the implementation.** The tool-registry documentation says the metering hook is invoked for success, typed failure, and boundary refusal — but `invoke()` returns immediately for an invalid/untrusted `PlatformExecutionContext` (`INVALID_CONTEXT`) before a tenant-scoped `ToolMeteringRecord` can safely be constructed. This is a legitimate security boundary and MUST NOT be weakened; the contract must be made internally consistent.

## 8. Evidence

[architect-verified] The architect's corrective handoff (2026-10-03; review outcome `CORRECTION_REQUIRED`; reviewed commit `63bccded2c61d29ba1a2218cf654bd3901ba6940`) — §2 F-7B-01 and §3 F-7B-02, including the quoted code identifiers (`buildClaraToolMeteringHook()`, `ToolMeteringHook`, `INVALID_CONTEXT`) and the quoted implementation test. [developer-reported, Git-verifiable] The delivered code at `63bccded`: `src/modules/ai-platform-core/clara-tools.ts` (console.info-only hook), `src/modules/ai-platform-core/tool-contracts.ts` (the ToolMeteringHook documentation), `src/modules/ai-platform-core/tool-registry.ts` (the INVALID_CONTEXT early return).

## 9. Why the finding blocks acceptance

F-7B-01 violates the reviewed Phase 7 plan §19 acceptance criterion (4) "per-invocation usage metering lands on the existing org-scoped spine" and (19) "tool invocations are observable via existing usage/analytics surfaces", and the 7-B handoff's metering acceptance rows — a functional acceptance criterion of the authorized 7-B scope. F-7B-02 leaves the runtime's documented metering contract internally inconsistent with its (correct) fail-closed behavior — a contract-integrity defect in the delivered runtime. Both are acceptance-violating and closure-blocking while unresolved (R6).

## 10. Exact correction required

**F-7B-01**: inspect the existing Clara metering infrastructure and determine the correct existing helper/path for recording a tool invocation without creating a new billing architecture or schema. The correction must: (1) reuse the existing Clara usage/metering infrastructure; (2) preserve its existing org/tenant scoping; (3) preserve existing `usage_events`/`query_events` vocabulary and constraints; (4) make the Unified Tool Runtime's metering hook actually bind to the existing spine where Phase 7-B requires it; (5) avoid double-billing `rag_search` — the incumbent `rag_search` path already uses `admission: "external"` and its owning turn owns the existing retrieval/query accounting, so do NOT blindly insert a second identical billing/query event; make the tool-runtime metering integration represent the tool invocation according to the existing spine's established event semantics. If the existing schema/helpers cannot represent a distinct tool invocation without a migration, STOP and report that exact blocker rather than creating a new schema or inventing a new event kind. No database migration, no schema modification, no new billing system is authorized.

**F-7B-02**: make the contract internally consistent — explicitly document that a provenance-invalid context is rejected before tenant-scoped metering; do not invoke the tenant-scoped metering hook using an untrusted context; ensure the documentation no longer claims that every invalid-context boundary refusal produces a normal scoped metering record; add a regression test proving invalid context is rejected and no untrusted tenant data is passed into the metering hook. Do NOT create an ambient/default tenant; do NOT infer tenant identity; do NOT weaken `assertExecutionContext()`; do NOT accept forged contexts.

## 11. Approved correction scope

`src/modules/ai-platform-core/tool-contracts.ts`; `src/modules/ai-platform-core/tool-registry.ts`; `src/modules/ai-platform-core/clara-tools.ts`; `src/modules/ai-platform-core/*7-B tests*`; plus the required governance records (`worklog.md`; `docs/project-control/VERIFICATION_STATE.md`; `docs/project-control/ISSUES.md`; `docs/project-control/NEXT_ACTION.md`; `docs/project-control/PROJECT_STATE.md`; `docs/project-control/CURRENT_PHASE.md`; `docs/project-control/ZAI_HANDOFF.md`; `docs/project-control/sessions/*`). Do not modify unrelated application code unless the existing metering helper can only be consumed through an already-authorized Clara seam and the change is strictly necessary for this correction. If a change outside the listed correction scope is necessary, STOP and report before modifying it.

## 12. Explicit non-scope

`package.json`; `package-lock.json`; `vercel.json`; database migrations; Supabase state; `docs/doable-source/**`; the ai-platform-core immutable/reference trees; the `clara-core` extraction snapshots (the stale `clara-runtime.ts` snapshot is NOT refreshed); provider implementations; voice providers; chat routes; realtime routes; embed routes; MCP; integrations; agent runtime; provider tool calling; agentic loops; I-014 remediation; I-015 remediation; D-P2; D-P4; the immutable Doable source.

## 13. Required reading

The governance layer (`CHAT_CONTINUITY.md` §5 procedure; `PROJECT_STATE.md`; `CURRENT_PHASE.md`; `NEXT_ACTION.md`; `ZAI_HANDOFF.md`; `VERIFICATION_STATE.md` incl. the correction and issue-control workflow; `ISSUES.md` incl. the issue-control system; `DECISIONS.md`; `RISKS.md`; `worklog.md`; the Phase 7 planning/specification documents; the prior Phase 7-B session records) — read BEFORE any edit, with the repository state treated as authoritative.

## 14. Implementation tasks (numbered, deterministic)

1. Verify the correction baseline per §I.6 (branch; HEAD = `74200bec` = origin tip; clean tree; `63bccded` present/unmodified/reachable).
2. Perform the required investigation of the existing metering infrastructure BEFORE editing: `usage_events`, `query_events`, `recordUsage`/`recordUsageEvent`/`meter`/`metering`/`admission`/`external`/`usage event`/`analytics`/`query event`; trace the incumbent `rag_search` path from its owning route through retrieval and usage accounting; determine the eight required facts (the recording helper; the event kind; the org/tenant scope fields; the duplicate-billing prevention mechanism; whether the runtime hook can safely call the existing helper; whether the helper is appropriate for tool-level telemetry; whether a tool-specific event already exists; whether the schema permits the required representation). Do not guess.
3. Implement the F-7B-01 correction within the approved scope (the binding; the double-billing analysis recorded; the STOP boundary honored if the schema cannot represent the invocation).
4. Implement the F-7B-02 correction (the documentation consistency; the regression test).
5. Add/modify the focused tests per §17.
6. Run the full validation battery per §20.
7. Update the governance records (append-only; the issue-control state distinguishing `developer correction submitted` from `architect review`; no `PASS`; no resolution; no closure).
8. Create ONE focused corrective commit (no amend of `63bccded`/`4aa73384`/`74200bec`; no rebase; no squash; no cherry-pick; no force-push) and push normally; if the remote advances, inspect the divergence before acting.
9. Produce the required final report and STOP.

## 15. Interfaces / contracts

The generic `ToolMeteringHook` / `ToolMeteringRecord` remain host-neutral (M-1). The `rag_search` executor continues to call the incumbent `claraRuntime.retrieve(...)` with the same `orgId`/`agentId`/`kbId`/`userId`/`sessionId`/`query`/`ragMode`/`channel: "voice"` (no retrieval rewrite; no tenant/KB binding change; no surface-exposure broadening; no chat exposure; the `admission: "external"` behavior unchanged absent explicit architect authorization).

## 16. Security constraints

No raw credentials or secrets cross the tool boundary (M-4). No ambient/default tenant; no tenant-identity inference; `assertExecutionContext()` unweakened; forged contexts rejected (M-7). Invalid provenance contexts generate no tenant-scoped metering from untrusted data. The fail-closed boundaries all stand.

## 17. Testing requirements

Focused tests proving: (1) the production Clara metering binding uses the existing metering infrastructure correctly; (2) a successful `rag_search` invocation has the expected metering/telemetry effect; (3) tenant/org identity preserved; (4) KB identity preserved; (5) authorization denial correctly classified; (6) `rag_search` does not create a duplicate billing/query event; (7) invalid execution context fails closed; (8) invalid execution context passes no untrusted tenant data to the metering hook; (9) metering failures still do not break tool execution; (10) existing behavior-parity tests remain green; (11) existing streaming-event behavior unchanged; (12) existing authorization behavior unchanged. Do not weaken or delete existing tests merely to obtain green output.

## 18. Acceptance criteria (pass/fail — M-1…M-10)

M-1 the generic `ToolMeteringHook` remains host-neutral; M-2 the Clara production binding is connected to the existing Clara usage/metering spine where appropriate; M-3 metering remains org/tenant scoped; M-4 no raw credentials or secrets cross the tool boundary; M-5 a successful tool invocation produces the expected existing metering/telemetry representation; M-6 authorization-denied invocations are represented according to the existing metering discipline without creating duplicate billing; M-7 invalid provenance contexts do NOT generate tenant-scoped metering from untrusted data; M-8 `rag_search` does not become double-billed; M-9 no new database migration is introduced; M-10 no new event kind is invented if the existing schema does not permit it. If M-5/M-6 cannot be implemented safely using the existing schema/helpers, STOP and report the exact blocker instead of inventing a schema change.

## 19. Git requirements

One focused corrective implementation commit. Do not amend `63bccded`, `4aa73384`, `74200bec`. Do not rebase. Do not squash. Do not cherry-pick the original implementation. Do not force-push. Normal push only. If the remote advances, inspect the divergence before acting; do not blindly overwrite owner history.

## 20. Evidence requirements

Focused Phase 7-B suite (`npx vitest run src/modules/ai-platform-core/` — ALL PASS; the 131/131 baseline must not regress); full suite (`npx vitest run` — ALL PASS; the 110 files / 1048 tests baseline); the existing typecheck command (I-015 NOT repaired; `src/**` application errors reported separately from extraction/reference-tree errors; the pre-existing application baseline is 19); lint (`npx eslint src/modules/ai-platform-core/`); the governance validators (`phase-closure-eligibility-test.sh`; `correction-cycle-test.sh`; `npm run validate:model-config`); the established library integrity validation; the immutable-source reverification (802 pinned / 771 present / 771 byte-verified / 0 mismatches / 31 absent under mcp-servers only; the tree identities `a42aee79`/`ee07c362`/`b76b8f34`/`54606204`; `vercel.json` = `3f26d343`); the secret scan over all changed paths; the runtime import scan.

## 21. Review boundary

The issue-control state must distinguish `developer correction submitted` from `architect review`. Do NOT record `PASS`; do NOT mark Phase 7-B closed; do NOT mark F-7B-01 or F-7B-02 resolved — those dispositions belong to the architect's re-review. Only the architect may subsequently return `PASS`, `PASS_WITH_FOLLOWUP`, or `CORRECTION_REQUIRED`.

## 22. STOP boundary

After: (1) implementing only the correction; (2) running validation; (3) committing; (4) pushing normally; (5) updating the required evidence records; (6) producing the final report — STOP. Do not continue into Phase 7-C or any unrelated work.

## Correction integrity rules (binding — from the durable workflow contract)

The corrective work executed under this instance is recorded in `VERIFICATION_STATE.md` §Phase 7-B correction and `CURRENT_PHASE.md`'s correction-stage record; the issue lifecycle in `ISSUES.md` (I-017). A correction commit is `[developer-reported]` evidence; Gate D remains architect-only; a correction is not resolved merely because the developer says it is fixed. The canonical status at submission:

```text
Phase 7: IN_PROGRESS
Phase 7-B: CORRECTION_SUBMITTED / AWAITING ARCHITECT RE-REVIEW
Phase 7-C: NOT AUTHORIZED
```


## Part II execution-record addendum — Phase 7-B instance (2026-10-03, synchronization resolution)

> Dated addendum appended to this Phase 7-B implementation-authorization instance (per the appended-record convention; the architect's authorization text above stands unmodified). Fields such as the Git requirements describe the handoff's issuance-time instructions, not the delivery outcome; this addendum records the actual outcome.

The authorized 7-B implementation was delivered locally (the implementation commit, the immediate child of the baseline `a2c74204cd793758444a6f5e307c2921014e8c90`), and the normal push was **REJECTED**: `origin/feature/ai-core-from-doable-source` advanced from `a2c74204` to `9f55924e759e6240d11935dbb059b6e5a5fd05d8` in a parallel repository-owner-authored extraction stream (exactly 112 commits, all RiluRaafu, 2026-10-03 04:14–04:56 +0530) establishing the new top-level `ai-platform-core/` and `clara-core/` libraries. Per Part I §I.6 and the Git constraints, no rebase, merge, force-push, reset, pull, or push retry was performed.

**Canonical status after the synchronization-resolution correction (2026-10-03):**

```text
Phase 7-A: PASS — CORRECTION VERIFIED — CLOSED
Phase 7-B: IMPLEMENTED LOCALLY — AWAITING ARCHITECT REVIEW
Remote synchronization: BLOCKED by parallel owner history
Phase 7-C: NOT AUTHORIZED
Phase 7: IN_PROGRESS
```

The 7-B implementation commits exist LOCALLY only and are NOT synchronized with origin. `HEAD == origin` is NOT satisfied — recorded as the exact repository state, not claimed as synced. Integration is an architect/owner decision. The architect's review of the 7-B implementation remains PENDING (the implementation report is developer evidence only; only ChatGPT may accept 7-B, require correction, or authorize 7-C). [developer-reported]

---

## Part II execution-record addendum — Phase 7-B integration record (2026-10-03)

> Dated addendum appended per the appended-record convention (the authorization texts and prior addenda stand unmodified). This addendum records the execution of the architect's explicit **Phase 7-B integration authorization** (received 2026-10-03): integrate the already-developed Phase 7-B implementation with the current remote branch without rewriting either history — a merge (not rebase, not cherry-pick), preserving the 7-B implementation commit, the governance/rejection history, the synchronization-correction commit, and the parallel owner's commit history; full re-verification before and after; report and STOP.

**Executed** [developer-reported]:

1. **Topology recomputed** from Git (not from memory): merge-base `a2c74204`; local tip `d7b74a50` (the exact 7-B lineage); remote tip `5b92a4b6` (189 owner-authored parallel commits; the previously recorded `9f55924e`/112 state had advanced by 77 further commits of the same additive extraction class). Local changed-path set = 17 paths; remote changed-path set = 133 **added** paths under the two top-level extraction directories only; **zero path intersection**; no remote commit ever touched `src/**`, `docs/project-control/**`, `worklog.md`, `vercel.json`, `package.json`, `package-lock.json`, or `docs/doable-source/**`.
2. **Mechanical merge verification before any ref change**: `git merge-tree --write-tree` clean (exit 0; zero conflicts; tree `79144e68`); the computed tree verified to preserve all 17 local paths blob-identical to `d7b74a50` AND all 133 remote-added paths blob-identical to `5b92a4b6`; the merged changed-path set = exactly the union of the two sides.
3. **Immutable-source verification against all four trees** (merge base, local tip, remote tip, computed merged tree) with the persisted commit-mode verifier: **802 pinned · 771 present · 771/771 byte-verified · 0 mismatches · 31 absent, all confined to `mcp-servers/`** — identical on every tree; I-014 unchanged (OPEN); I-015 unchanged (OPEN).
4. **First merge**: `git merge --no-ff origin/feature/ai-core-from-doable-source` → merge commit **`a7bd7b53`** (parents `d7b74a50` + `5b92a4b6`; tree = the exact pre-computed `79144e68`; both histories preserved verbatim; clean worktree). Post-merge verification: diff vs the pre-merge local tip = 133 additions only; all key commits reachable; immutable trees and `vercel.json` byte-identical; `package.json`/`package-lock.json` unchanged; migrations unchanged.
5. **Validation at `a7bd7b53`**: targeted 7-B suite 131/131; full suite 110 files / 1048 tests; typecheck `src/**` **exactly 19** (the identical pre-existing I-015 set — NOT claimed fixed; the 7-B module zero errors); governance validators 8/8 + 24/24; model-config PASS; library integrity PASS; lint 0/0; import/secret scans clean. **Typecheck-profile observation recorded (not fixed)**: the merged tree additionally carries the owner's extraction-dir errors (`ai-platform-core/**` 40 + `clara-core/**` 13) plus the pre-existing `docs/doable-source/**` background (~3419 lines) — empirically verified identical at BOTH parents (the same typecheck was run at `d7b74a50` and at the remote tip `5b92a4b6`); the merged profile is exactly the union of the parents' pre-existing profiles; **zero new typecheck errors introduced by the integration**; any exclusion of the owner's extraction directories from the typecheck include is an architect/owner decision.
6. **First push REJECTED** — the owner stream advanced in real time during validation (6 further commits `89297e83`…`a776c6f1`, all confined to `clara-core/`). Those 6 commits were re-verified against every invariant (additive class; ONLY `clara-core/` paths; immutable trees byte-identical at the new tip; `vercel.json` unchanged; the `clara-runtime.ts` pin still `f7fa173c`; merge-tree clean → tree `39f38e66`) and the authorized merge command was re-executed once: **second merge** → merge commit **`9bf1363c`** (parents `a7bd7b53` + `a776c6f1`; tree = the exact pre-computed `39f38e66`; 4 files changed, all `clara-core/`).
7. **Second push REJECTED again** — the remote advanced once more (`d162967f`, a `clara-core/WORKLOG.md`-only docs commit) while the second merge was being made. A declared no-loop bound was honored: **no third merge, no force-push, no rebase, no reset, no blind retry**.
8. **Validation re-run at the final HEAD `9bf1363c`**: 131/131; 110 files / 1048 tests; typecheck `src/**` = 19 (identical set; 7-B module 0 errors); governance 8/8 + 24/24; immutable verifier 802/771/771/0/31-confined (exit 0); lint 0/0; scans clean; `vercel.json` unchanged.
9. **clara-core extraction-staleness recorded (action NONE)**: the manifest pins `src/modules/ai-platform-core/clara-runtime.ts` at blob `f7fa173ca24f96a2d1002a562181fd1bed01939a` (the extracted snapshot under `clara-core/source/` IS that blob) while the live 7-B source is blob `14b8879fc67266c72640103801251a1061661fc4` — a semantic staleness question deliberately left for the architect/owner (of the manifest's 106 entries: 103 well-formed and fresh; 2 malformed-but-content-matching pinned SHAs — `knowledge-topics.ts` 41-char, `language-core/config-types.ts` 39-char, pre-existing owner data-quality quirks; exactly 1 true staleness).
10. **No deployment** performed or authorized; no Vercel observation available from this workspace; any preview triggered by a future successful push is an external automatic event only — NOT Gate F completion, NOT architectural approval.

**Canonical status after the integration**:

```text
Phase 7-A: PASS — CORRECTION VERIFIED — CLOSED
Phase 7-B: IMPLEMENTED — INTEGRATED LOCALLY — AWAITING ARCHITECT REVIEW
Remote synchronization: PARTIALLY RESOLVED — integrated through a776c6f1 (merge commits a7bd7b53 + 9bf1363c); push BLOCKED by continued real-time owner advancement (final divergence: 1 owner docs-only commit d162967f)
Phase 7-C: NOT AUTHORIZED
Phase 7: IN_PROGRESS
```

The integration is an integration event only — it is NOT a `PASS`, NOT an architect review outcome, and NOT Gate D completion. The 7-B implementation diff awaiting architect review remains exactly `63bccded` (the immediate child of `a2c74204`). Z.AI STOPs at the 7-B review boundary. [developer-reported]

---

## Part II execution-record addendum — Phase 7-B final remote-synchronization record (2026-10-03)

> Dated addendum appended per the appended-record convention (the authorization texts and prior addenda stand unmodified). This addendum records the execution of the architect's explicit **Phase 7-B Final Remote Synchronization and Architect-Review Preparation** authorization (received 2026-10-03): reconcile the locally integrated Phase 7-B state with the current remote branch and prepare the repository for architect review — merge-only where required, never rewriting either history, with a maximum of two merge/revalidation cycles, full validation, a normal-only push, append-only governance records, and a HARD STOP at the review boundary.

**Executed** [developer-reported]:

1. **Required reading + state verification**: the governance layer read from the feature-branch tip; the four recorded SHAs (`63bccded` / `a7bd7b53` / `9bf1363c` / `d29225ad`) verified present, unchanged (exact parents), and reachable from HEAD; the designated linked worktree confirmed holding the feature branch; clean tree.
2. **Remote difference recomputed** against the CURRENT remote (`91551e4d`, fetched fresh): 7 remote-only RiluRaafu-authored docs-only commits (the previously recorded trailing `d162967f` + 6 further `docs(clara-core)` commits), net 5 files under `clara-core/` only, +343/−0; **zero protected paths; zero path intersection** with the 18-path local set — assessed as remaining within the previously accepted additive extraction pattern; no STOP condition triggered.
3. **Immutable-source verification on all relevant trees** (merge base, local tip, remote tip, pre-computed merged tree, final merge commit) with the persisted commit-mode verifier: **802 pinned · 771 present · 771/771 byte-verified · 0 mismatches · 31 absent confined to `mcp-servers/`** — identical on every tree; the four immutable tree OIDs and `vercel.json` (`3f26d343`) unchanged; I-014 OPEN; I-015 OPEN.
4. **Mechanical merge verification then the merge**: `git merge-tree --write-tree` clean (exit 0; zero conflicts; tree `e58a6865`; both sides verified blob-identical within the computed tree) → `git merge --no-ff origin/feature/ai-core-from-doable-source` → merge commit **`4aa73384e537a3cb2bf08ea187aa13a2c0b5ed81`** (parents `d29225ad` + `91551e4d`; tree = the exact pre-computed `e58a6865`; zero conflicts; both histories preserved verbatim; the diff vs the pre-merge local tip = the 5 `clara-core/` paths only).
5. **Validation at the final HEAD `4aa73384`**: targeted 7-B suite 131/131; full suite 110 files / 1048 tests; typecheck `src/**` exactly 19 (the identical pre-existing I-015 set — NOT claimed fixed; the 7-B module zero errors; the extraction-dir profile 40 + 13 and the docs background 3419 exactly the union of the parents' pre-existing profiles — zero new errors); governance validators 8/8 + 24/24; model-config PASS; library integrity PASS; lint 0/0; runtime import scan zero; secret scan zero.
6. **`clara-core` stale snapshot (action NONE)**: unchanged — live `clara-runtime.ts` blob `14b8879f` vs manifest pin / extracted snapshot `f7fa173c`; the remote stream did not touch the manifest (`348b72ef` at both tips) or any snapshot; architect/owner disposition remains required.
7. **Push — SUCCEEDED**: the remote re-checked first (origin still `91551e4d`; local 7 ahead / 0 behind — safely fast-forwardable; the two-cycle bound not consumed); the normal (non-force) push accepted as fast-forward `91551e4d..4aa73384`; post-push re-fetch verified **HEAD == origin == `4aa73384`**; clean worktree. No deployment performed or authorized; any automatic preview triggered by the push is an external event only — NOT Gate F completion, NOT architectural approval.

**Canonical status after the final synchronization**:

```text
Phase 7-A: PASS — CORRECTION VERIFIED — CLOSED
Phase 7-B: IMPLEMENTED — SYNCHRONIZED WITH REMOTE — AWAITING ARCHITECT REVIEW
Remote synchronization: RESOLVED — local HEAD == origin == 4aa73384
Phase 7-C: NOT AUTHORIZED
Phase 7: IN_PROGRESS
```

The synchronization is a synchronization event only — it is NOT a `PASS`, NOT an architect review outcome, and NOT Gate D completion. The 7-B implementation diff awaiting architect review remains exactly `63bccded` (the immediate child of `a2c74204`), now inspectable at the synchronized remote tip. Z.AI STOPs at the 7-B review boundary. [developer-reported]

## Part II execution-record addendum — CH-003 correction record (2026-10-03)

> Dated addendum appended per the appended-record convention (the authorization texts and prior addenda stand unmodified). This addendum records the execution of the **CH-003 corrective handoff (findings F-7B-01/F-7B-02, issue I-017)**.

**Executed** [developer-reported — awaiting the architect's re-review]:

1. **Required reading + baseline verification**: the governance layer read from the feature-branch tip; the correction baseline `74200beca21fb2b15817fe2471dc86929316cd48` verified (branch `feature/ai-core-from-doable-source`; HEAD = `74200bec` = origin tip after fresh fetch; clean tree); the reviewed implementation commit `63bccded2c61d29ba1a2218cf654bd3901ba6940` verified present, unmodified, and an ancestor of HEAD (NOT rewritten; the correction is a new focused commit).
2. **The required metering-infrastructure investigation (per §14 task 2 — before any edit)**: `query_events` (`admitQueryEvent` in `src/lib/quota-admission.ts` — the atomic quota admission whose rolling-24h COUNT counts EVERY row per org; `logQueryEvent`/`finalizeQueryEvent` in `src/modules/knowledge-bases/core/analytics-db.ts` — the audit insert and the finalise/hash-chain update); `usage_events` (`logUsageEvent` in analytics-db + the voice-core writers `logTtsUsage`/`logSttUsage`/`logConversationUsage` + the language-core writer; the kind vocabulary CHECK-constrained to `('EMBEDDING','TTS','OCR','TRANSCRIPTION','CONVERSATION','TRANSLATION')` by migrations 028→033→036 with `model` NOT NULL and cost from measured facts, never guessed); `audit_logs` (`writeAuditLog` in `src/modules/auth/core/db.ts` — org-scoped structured infrastructure events, open dotted action vocabulary, zero billing impact — the spine's own established path for metering-domain events that must not affect billing; precedent: the quota spine's `quota.denied` rows); the incumbent `rag_search` path traced (`claraRuntime.tools.invoke` → `claraRuntime.retrieve` → `groundClaraContext({admission: "external"})` — grounding writes NO query event; the owning turn admits and finalises the single row; "logging here would count the turn twice"). **Conclusions**: (1) `usage_events` cannot represent a distinct tool invocation without a migration (the closed kind vocabulary; the NOT NULL model; the billable-cost semantics); (2) `query_events` cannot without double-billing (every row consumes the rolling-24h quota; the incumbent retrieval is already represented by the owning turn's admitted+finalised row); (3) the existing spine's established discipline for org-scoped metering-domain events that must NOT affect billing is `writeAuditLog` — the binding point used by the correction (consumed on the already-authorized `@/modules/auth/core/db` seam; no out-of-scope code change required).
3. **F-7B-01 correction delivered** (`src/modules/ai-platform-core/clara-tools.ts`): `buildClaraToolMeteringHook()` now binds to the existing org-scoped observability spine via the existing `writeAuditLog` helper — one org-scoped, append-only audit row per metered invocation attempt: `action` `tool.invoked` (or the dedicated `tool.denied` for the authorization-denial family: MISSING_CONTEXT_IDENTITY / UNAUTHORIZED_SURFACE / UNAUTHORIZED_ROLE / PLAN_NOT_ENTITLED / TENANT_SCOPE_VIOLATION / AUTHORIZATION_UNAVAILABLE — mirroring the quota spine's `quota.denied` discipline for metering-domain denials), `resourceType` `tool_invocation`, `resourceId` = the tool name, and the full caller-scoped metering record (invocationId, toolName, kbId, agentId/userId/sessionId, surface, outcome, typed errorCode, durationMs, correlationId) in `newData`. The hook NEVER writes billing rows (no `query_events` insert — which would double-bill the org's rolling-24h quota (M-8); no `usage_events` insert — whose closed kind vocabulary + NOT NULL model + measured-cost semantics cannot represent a tool invocation without a migration (M-9/M-10)); metering failures are absorbed and logged inside the hook AND by the runtime's metering stage — never breaking the metered invocation. **The billable-spine representation blocker is recorded (in the code rationale, the issue record, and this addendum), NOT silently resolved — awaiting architect disposition.**
4. **F-7B-02 correction delivered** (`src/modules/ai-platform-core/tool-contracts.ts` + `src/modules/ai-platform-core/tool-registry.ts`): the `ToolMeteringHook` documentation, the streaming-event documentation, the registry header lifecycle, the `invoke()` docstring, and the INVALID_CONTEXT return-site comment now explicitly document that a provenance-invalid context is rejected BEFORE tenant-scoped metering — the hook is NOT invoked and NO metering record is produced for that attempt (no ambient/default tenant fabricated; no tenant identity inferred; `assertExecutionContext()` unchanged; forged contexts still rejected; the security boundary NOT weakened). NO runtime logic changed — the INVALID_CONTEXT early-return behavior was already correct; only the contract documentation was made internally consistent, and the regression test proves it (a forged frozen lookalike carrying hostile tenant data is rejected with INVALID_CONTEXT and the tenant-scoped metering hook is NEVER invoked).
5. **Correction tests** — 8 new focused proofs + 1 superseded (the superseded test is the implementation's own "the default Clara metering hook completes without writing" assertion — the exact F-7B-01 evidence the architect quoted; replaced by positive binding proofs, not deleted to obtain green output): the binding's write shape/scoping; org/KB identity preservation across callers; the denial classification (`tool.denied`, scoped to the denied caller, retrieval never reached); the no-billing-writers proof (`logQueryEvent`/`finalizeQueryEvent`/`admitQueryEvent`/`logUsageEvent` all zero calls; the incumbent retrieval exactly once); the invalid-context no-audit-row proof; the audit-write-failure tolerance; the direct-hook unit proof; the runtime-level INVALID_CONTEXT-before-metering regression.
6. **Validation** (all commands run at the corrected tree): targeted 7-B suite **6 files / 138 tests ALL PASS** (131 − 1 superseded + 8 new); full suite **110 files / 1055 tests ALL PASS** (zero regressions); typecheck `src/**` **19 → 19** (the identical pre-existing I-015 set — NOT claimed fixed; zero errors in the five changed files; the 3472 extraction/reference-tree errors separately reported); lint **0 errors 0 warnings**; model-config **PASS**; governance validators **8/8 + 24/24** (exit 0); library integrity **PASS** (21 capabilities · 30 edges · 0 errors · 0 warnings); immutable source **802 pinned · 771 present · 771/771 byte-verified · 0 mismatches · 31 absent confined to `mcp-servers/`**; the four immutable tree OIDs (`a42aee79`/`ee07c362`/`b76b8f34`/`54606204`) and `vercel.json` (`3f26d343`) unchanged; runtime import scan **zero matches**; secret scan **zero matches**.
7. **Governance records**: I-017 appended (`ISSUES.md`; lifecycle OPEN → TRIAGED → CORRECTION_REQUIRED [architect, per CH-003] → CORRECTION_IN_PROGRESS → CORRECTION_SUBMITTED [developer registration]; NOT resolved); the CH-003 Part II instance (this file; the superseded 7-B implementation-authorization instance recoverable in Git history at `74200bec`); `VERIFICATION_STATE.md` §Phase 7-B correction + validation + the review-trail rows + the outstanding-state/header updates + the correction-boundary consistency reconciliation; `CURRENT_PHASE.md` correction-stage record; `PROJECT_STATE.md`/`NEXT_ACTION.md` reconciliation; the append-only `worklog.md` entry; `SESSION-018.md` + its index row. **I-014 remains OPEN; I-015 remains OPEN** (no dependency-changing install; no lockfile rewrite). No migration, no schema change, no new billing system, no `rag_search` retrieval-behavior change, no route/provider/DB/dependency/`vercel.json`/immutable-source change, no 7-C/MCP/integrations work.
8. **Commit + push**: one focused corrective commit — `fix: bind phase 7-b tool metering to existing clara audit spine` (the immediate child of `74200bec`; application changes confined to the five approved files; documentation changes confined to `worklog.md` + `docs/project-control/**`); the normal (non-force) push; the remote SHA verified after the push. No amend of `63bccded`/`4aa73384`/`74200bec`; no rebase; no squash; no cherry-pick; no force-push.

**Canonical status after the correction submission**:

```text
Phase 7: IN_PROGRESS
Phase 7-B: CORRECTION_SUBMITTED / AWAITING ARCHITECT RE-REVIEW
Phase 7-C: NOT AUTHORIZED
```

The correction is `[developer-reported]` evidence only — it is NOT a `PASS`, NOT an architect review outcome, NOT Gate D completion, and does NOT resolve F-7B-01, F-7B-02, or I-017. Only the architect may subsequently return `PASS`, `PASS_WITH_FOLLOWUP`, or `CORRECTION_REQUIRED`. Z.AI STOPs at the re-review boundary. [developer-reported]
