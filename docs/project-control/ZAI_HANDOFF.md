# ZAI_HANDOFF.md — Z.AI Developer Handoff System

> Canonical developer-handoff protocol and active handoff instance for the Clara project-control system.
> **Part I** is the durable, reusable handoff protocol — it applies to every implementation phase and changes only by architect direction.
> **Part II** holds the **active handoff instance**: the current phase's assignment materialized in the authoritative format. When the architect issues a new phase handoff, the developer replaces Part II with the new instance; superseded instances remain recoverable in Git history (and, from Phase 4 onward, in the canonical worklog).
> Snapshot date: **2026-10-01**. Repository state is authoritative — refresh it before acting (§I.6).
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

> **Phase 7 planning/baseline handoff instance** — materialized from `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` per Part I §I.12 on 2026-10-02, replacing the fully executed CH-001 corrective-handoff instance (superseded; recoverable in Git history at `3657035ac878da98decd98929fb0deb45aed1fbe` and identified in the canonical `worklog.md` Phase 6 closure entry). This instance authorizes **only the Phase 7 planning, scope-definition, and pre-implementation-baseline scope (§3)** — it does **not** authorize Phase 7 implementation, any product/DB/deployment change, or any later phase (the architect's HARD RULE).

### Phase identity

| Field | Value |
|---|---|
| Phase number | 7 |
| Phase name | AI Platform Core Foundation (Planning, Scope Definition & Pre-Implementation Baseline stage) |
| Full designation | Phase 7 — AI Platform Core Foundation (planning stage) |
| Current status | `PLANNED` — planning assignment received 2026-10-02 and executed by the developer (planning package delivered `[developer-reported]`, architect review **PENDING**); implementation NOT started and NOT authorized (in the implementation sense Phase 7 remains NOT STARTED) |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `3657035ac878da98decd98929fb0deb45aed1fbe` (the Phase 6 closure-record commit — "docs: record architect approval of phase 6"; the repository tip at issuance; the immediate child of the reviewed Phase 6 correction `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe` preserved) |
| Architect | ChatGPT |
| Developer | Z.AI |
| Handoff date | 2026-10-02 |

### Objective

Establish the Phase 7 baseline and produce a complete implementation plan: perform the mandatory repository pre-flight; read and reconcile the complete project-control state; establish the Phase 7 starting point (explicit state table); determine the actual Phase 7 objective from the existing project-control records and the original project objective (continuing the broader objective of extracting and integrating reusable AI-platform capabilities from the Doable source into Clara AI Platform — without assuming every previously discussed capability belongs in Phase 7); investigate — without implementing — the existing Clara architecture across the full AI-platform scope; classify candidate capabilities (A Phase 7 candidate scope / B later-phase scope / C existing Clara capability / D Doable-source reference only / E blocked or dependency-gated) with repository evidence; produce the Phase 7 planning package (objective; scope/non-scope; capability inventory; existing-vs-missing matrix; Doable-source reuse matrix; architecture diagram/description; adapter boundaries; dependency graph; risk analysis; issue dependencies; database/security/multi-tenant/provider implications; testing strategy; verification gates A–F; acceptance criteria; rollback strategy; ordered implementation phases/sub-phases; explicit stopping boundary); persist it under the project-control conventions; validate; report; and STOP — **do not implement**.

### Scope (approved)

1. Repository pre-flight verification (branch; clean tree; HEAD = origin; the Phase 6 closure commit `3657035a`; its parent `4dc8a573`; the correction baseline `c0cca964`; mainlines; immutable Doable-source ancestry/provenance; `vercel.json`; no product/DB/deployment changes after the Phase 6 closure) — read-only.
2. Reading and reconciling the complete project-control state (`PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `VERIFICATION_STATE.md`, `ISSUES.md`, `RISKS.md`, `DECISIONS.md`, `ZAI_HANDOFF.md`, `VERIFICATION_CHECKLIST.md`, `sessions/README.md`, latest session records, root `worklog.md`, the Phase 1–6 closure/correction records, the 13-phase plan, and the Doable-source library governance) — read-only, preserving append-only rules.
3. The Phase 7 starting-point state table; the objective determination; the read-only AI-platform architecture investigation (multi-provider, provider abstraction, model configuration, chat providers, realtime/voice providers, embeddings, AI generation, usage tracking, credits/quotas, tracing/observability, AI request lifecycle, provider failover, integrations, tools, MCP, agent runtime, agent work mode, memory, skills, attachments, image generation, persistence, analytics, audit, notifications, collaboration, templates, marketplace, automation — compared against the reusable Doable-source inventory).
4. The capability classification A–E with repository evidence for every classification.
5. The Phase 7 planning package documentation — created **only inside the existing project-control structure**, following its append-only/history rules: `docs/project-control/PHASE-7-PLAN.md`; this Part II instance replacement; the `CURRENT_PHASE.md` Phase 7 planning contract; the `VERIFICATION_STATE.md` planning evidence section; the consequential `PROJECT_STATE.md`/`NEXT_ACTION.md` reconciliation; the next valid `SESSION-*` record (`SESSION-011.md`) + index updates; the append-only `worklog.md` entry; a new `ISSUES.md` issue record for any newly discovered out-of-scope finding (I-014 — the vendored-library completeness/verifier finding).
6. Validation runs of the existing read-only scripts (§ Testing requirements) and — where a validation script is required for the planning package — its creation following the existing repository convention (persisted outside the repository in the agent workspace, per the Phase 3/4/5 convention).

### Non-scope (explicit)

- **No implementation**: do not modify `src/`, `packages/`, database migrations, Supabase, `vercel.json`; do not deploy anything; do not modify the immutable Doable source; do not introduce new product capabilities; do not begin provider integrations, agent runtime, MCP, or UI implementation. The planning handoff supplies no implementation authorization.
- No modification of production branches (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); no force-push; no `b65725e5` modification; no secrets; no resolution of R-3/R-4/R-5, I-001, or I-007; no resolution of the newly recorded I-014 (architect triage); no modification of `DECISIONS.md`/`RISKS.md`; no rewriting of historical closure/correction records or session records; no fake approval records; no Phase 7 `PASS`/`CLOSED` claims; no Phase 8.

### Prerequisites

1. Phase 6 `CLOSED` with the closure baseline present exactly as expected (`3657035a` / parent `4dc8a573` / correction baseline `c0cca964`) — verified 2026-10-02 per §I.6.
2. The architect's Phase 7 planning handoff (this instance's source), issued 2026-10-02.
3. The existing project-control governance model (Phases 0–6) and the Doable-source immutable-source policy (`docs/doable-source/AGENTS.md`; D-007) — read and followed.

### Required reading

`PROJECT_STATE.md` · `CURRENT_PHASE.md` (the preserved Phase 6 contract, in Git history at `3657035a`) · `NEXT_ACTION.md` · `VERIFICATION_STATE.md` (the durable verification/phase-gate contract and correction workflow) · `ISSUES.md` · `RISKS.md` · `DECISIONS.md` · `ZAI_HANDOFF.md` Part I · `VERIFICATION_CHECKLIST.md` · `sessions/README.md` + latest session records · root `worklog.md` · `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (the 13-phase plan) · `docs/doable-source/README.md`, `AGENTS.md`, `EXTRACTION_MANIFEST.md`, `ADAPTER_ARCHITECTURE.md`, `IMPLEMENTATION_PLAYBOOK.md`, `SOURCE_COVERAGE_MATRIX.md`, `COMPLETE_AI_PLATFORM_COVERAGE.md`, `capabilities/CATALOG.json`, `capabilities/DEPENDENCY_GRAPH.json`, `contracts/`, `adapters/`, `external-dependencies/external-dependencies.json`, `verification/` · the Clara source tree (read-only survey: `src/modules/**`, `src/app/api/**`, `src/components/admin/**`, `packages/**`, `src/lib/**`).

### Implementation tasks (numbered, deterministic — as executed)

1. Pre-flight verification (§ Scope 1) — completed 2026-10-02; discrepancy handling: the expected closure baseline WAS present (no STOP); the observed external `Vercel-Prod` movement (`e0ead990` → `bae53a07`, PR #262) was recorded, not acted on.
2. Read and reconcile the complete project-control state (§ Scope 2).
3. Produce the Phase 7 starting-point state table (`PHASE-7-PLAN.md` §2).
4. Determine the Phase 7 objective from records + original objective, with the explicit plan-ladder reconciliation proposal (`PHASE-7-PLAN.md` §3).
5. Investigate the Clara AI-platform architecture and the Doable-source inventory read-only; build the capability inventory, existing-vs-missing matrix, and reuse map (`PHASE-7-PLAN.md` §5–§7).
6. Classify candidate capabilities A–E with repository evidence (`PHASE-7-PLAN.md` §7.2).
7. Produce the architecture proposal, adapter boundaries, and dependency graph (`PHASE-7-PLAN.md` §8–§10).
8. Reconcile risks and issues (cross-check R-1…R-5, I-001/I-007/I-013, D-P2/D-P3/D-P4); record the newly discovered I-014 finding as a new OPEN issue (`PHASE-7-PLAN.md` §11–§12; `ISSUES.md`).
9. Draft the acceptance criteria, Gates A–F verification design, testing strategy, rollback strategy, ordered sub-phases, and stopping boundary (`PHASE-7-PLAN.md` §17–§22).
10. Persist the package (§ Scope 5) and validate (§ Testing requirements).
11. Commit (§ Git requirements), push, deliver the completion report, and STOP (§ STOP boundary).

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `docs/project-control/PHASE-7-PLAN.md` | create | the Phase 7 planning package (documentation only) |
| `docs/project-control/CURRENT_PHASE.md` | modify | the Phase 7 planning-stage contract (the Phase 6 contract is preserved in Git history at `3657035a`) |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II replaced with this instance (Part I untouched) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | the Phase 7 planning evidence section + consistency-table reconciliation + appendix command block |
| `docs/project-control/PROJECT_STATE.md` | modify | reconciled to Phase 7 `PLANNED` (current phase; commit-state rows; last-architect-verification entry; active issues + I-014; next action; session-records row) |
| `docs/project-control/NEXT_ACTION.md` | modify | the authorization-boundary continuation instruction |
| `docs/project-control/ISSUES.md` | modify | I-014 appended under §"Issue records (canonical schema)" (OPEN, `[developer-reported]`, awaiting architect triage); preamble next-ID note updated; legacy entries untouched |
| `worklog.md` | modify | append-only Phase 7 planning entry |
| `docs/project-control/sessions/SESSION-011.md` | create | this session's audit record |
| `docs/project-control/sessions/README.md` | modify | SESSION-011 index row |
| `/home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh` (agent workspace, outside the repository) | create | the persisted read-only scratch-harness for running the library's extraction verifier against the Clara layout (gate-evidence tooling, per the Phase 3/4/5 out-of-repository convention) |
| `src/**`, `packages/**`, `src/lib/db/migrations/**`, `supabase/**`, `vercel.json`, `docs/doable-source/**` (immutable trees), `DECISIONS.md`, `RISKS.md`, templates, verification scripts | **inspect only** | no changes |

### Interfaces / contracts

- The Final State Contract: `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (Part II) = `VERIFICATION_STATE.phase` = the latest `worklog.md` entry — all at **Phase 7, `PLANNED`** (planning delivered; implementation not authorized; architect review PENDING) after this commit.
- The canonical status vocabulary (D-011) and the evidence classes (D-012) are used unchanged; no competing verification/source-of-truth is created (one planning package, one handoff instance, one issue register).
- The Phase 5 verification/phase-gate contract (D-020) and the Phase 6 correction/issue-control workflow remain binding; the Phase 7 gates design in `PHASE-7-PLAN.md` §18 maps onto them without duplicating them.
- The immutable-source policy (D-007) and the Doable-source library's own governance (`docs/doable-source/AGENTS.md`) remain in force; the planning package treats `doable-source-extensions/**` as immutable-by-provenance in addition to the three D-007 roots.

### Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads may be written (the R-5 Vercel token is referenced but never reproduced).
- No fabricated timestamps; no unsupported claims; observable evidence only; a future/intended architect review is never written as already completed.
- Documentation-only assignment — no application security/tenancy surface is touched.
- Immutable-source boundaries (D-007) and production-branch restrictions (D-008) remain in force; no deployment operations; no force-push.

### Testing requirements (validation before commit — this stage)

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | Model config | `npm run validate:model-config` | PASS (lightweight — never sufficient alone) |
| 2 | Phase 5 deterministic regression | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` | 8/8 determinations correct, exit 0; P0 present → closure eligibility FAIL |
| 3 | Phase 6 deterministic regression | `bash docs/project-control/verification/correction-cycle-test.sh` | 24/24 determinations correct, exit 0 |
| 4 | Library metadata validation | `node verification/validate-library.mjs` (from `docs/doable-source/`) | PASS (21 capabilities · 21 manifests · 30 edges · 0 errors) |
| 5 | Extraction integrity (scratch harness) | `bash /home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh` | 771/771 present pinned blobs byte-identical to the Doable baseline; all failures confined to the absent `mcp-servers/` family (I-014); `requiredFiles`/`packageHardening`/`externalDependencyInventory`/`uiReferenceFiles` PASS |
| 6 | Immutable-source / production-branch check | `git diff 03482584 HEAD --stat -- <immutable trees>` (empty); refs check; `vercel.json` diff vs `b65725e5` (empty) | untouched; mainlines recorded (with the external `Vercel-Prod` movement recorded, not acted on); no force-push |
| 7 | Changed-path scope check | `git show --name-only --format=HEAD` | every changed path within `worklog.md` + `docs/project-control/**` |
| 8 | Secret-pattern scan | credential/token patterns across all changed paths | no matches |
| 9 | Final State Contract consistency | cross-member phase/status check | Phase 7 `PLANNED` agree across the five members + the latest worklog entry |
| 10 | Git hygiene | `git status --porcelain`; `git rev-parse HEAD origin/feature/ai-core-from-doable-source` | clean tree after commit; local = origin after push; the commit is the immediate child of `3657035a` |

### Acceptance criteria (pass/fail — evaluated by the architect at review of the planning package)

1. The verified baseline table is complete and evidence-backed — PASS/FAIL.
2. The objective determination presents both repository records and the reconciliation proposal without enacting it — PASS/FAIL.
3. Every A–E classification carries repository evidence — PASS/FAIL.
4. The capability inventory covers the handoff's full AI-platform scope and distinguishes exists/missing/partial/reuse/adapter-required/outside-boundary/not-in-Phase-7 — PASS/FAIL.
5. The architecture distinguishes immutable reusable core / Clara host integration+adapters / existing Clara infrastructure / future work — PASS/FAIL.
6. The dependency graph identifies prerequisites, ordering constraints, and shared infrastructure — PASS/FAIL.
7. The risk/issue reconciliation cross-checks open issues/risks/decisions and marks dependency-gated capabilities — PASS/FAIL.
8. Acceptance criteria are measurable and categorized (functional/architectural/security/multi-tenant/provider/persistence/observability/testing/regression/immutable-source/deployment) — PASS/FAIL.
9. Gates A–F preserve the established governance rules (P0 always blocks; P1-only exception; no P2/P3 exception; developer claims/tree/build/deployment never substitute for review) — PASS/FAIL.
10. The stopping boundary is explicit — PASS/FAIL.
11. The package is persisted under the project-control append-only conventions (session record; index updates; no historical rewrites) — PASS/FAIL.
12. The I-014 finding is recorded as an OPEN issue for architect triage — PASS/FAIL.
13. No product/DB/deployment/immutable-source changes occur — PASS/FAIL.
14. No secrets/private reasoning are introduced — PASS/FAIL.
15. Phase 7 is not marked `PASS`/`CLOSED`; no architect approval is claimed — PASS/FAIL.
16. Final State Contract is consistent — PASS/FAIL.
17. Validation passes/results are recorded — PASS/FAIL.
18. Git tree clean; branch synchronized — PASS/FAIL.
19. No Phase 7 implementation and no Phase 8 work is started — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`; no force-push.
- One focused documentation-only planning commit: `docs: establish phase 7 planning package` — the immediate child of `3657035ac878da98decd98929fb0deb45aed1fbe`; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`; no unrelated changes; no squashing of unrelated history. If the baseline has moved unexpectedly: STOP — no rebase or force-push without a refreshed architect handoff.
- Push normally to `origin/feature/ai-core-from-doable-source`; do not amend the baseline or any historical commit.

### Evidence requirements

The developer completion report (per Part I §I.7) must provide: the verified baseline (exact SHA/branch; Phase 6 closure ancestry; mainline state incl. the observed external `Vercel-Prod` movement); confirmation Phase 6 remains `CLOSED`; confirmation Phase 7 implementation was NOT started (no implementation authorization was present in this handoff); the proposed Phase 7 scope (capability list) and non-scope; the reuse map (Doable source → Clara adapters/integration boundaries); the ordered dependency list; the acceptance criteria; the Gates A–F applicability; the exact files changed; the exact validation commands and results; the new I-014 finding summary; the commit SHA; working tree CLEAN; remote SYNCED; architect review of the planning package PENDING — all `[developer-reported]`; no `PASS`, no approval, no closure claimed.

### Review boundary

**Developer planning completion does not equal phase completion, and a planning package is not an approval.**

**Only ChatGPT/project-owner architect review can ratify the Phase 7 plan and authorize implementation; only an actual `PASS` review can later close the phase.**

The planning package is submitted as `[developer-reported]` proposals (objective, scope, classification, architecture, gates, acceptance criteria). Review outcomes: `PASS` (the plan is ratified — the architect then issues the Phase 7 implementation authorization, which initializes implementation and sets the phase `IN_PROGRESS`); `PASS_WITH_FOLLOWUP` (ratified with recorded follow-ups); `CORRECTION_REQUIRED` (a corrective handoff is issued per §I.5 / the Phase 6 workflow; the phase remains `PLANNED`). Z.AI must not choose the outcome, must not self-approve, and must not treat the work-order text of any assignment as approval.

### STOP boundary (hard stop — the architect's FINAL STOP CONDITION)

After the planning package is committed, pushed, and reported: **Z.AI STOPs.** Do not proceed into product implementation; do not start a Phase 8; do not declare Phase 7 `PASS`; do not close Phase 7; do not modify `src/`, `packages/`, migrations, Supabase, `vercel.json`, or the immutable Doable source; do not deploy; do not begin provider integrations, agent runtime, MCP, or UI implementation; do not resolve R-3/R-4/R-5, I-001/I-007/I-014, or any pending decision. **Wait for the next explicit architect implementation authorization.** Only ChatGPT may authorize Phase 7 implementation. If a newly discovered issue is outside any authorized scope: record it in `ISSUES.md` as a new `OPEN` issue (`[developer-reported]`) and await architect direction — as done for I-014.

