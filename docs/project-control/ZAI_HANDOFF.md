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

### Phase identity

| Field | Value |
|---|---|
| Phase number | **6** |
| Phase name | **Correction and Issue-Control Workflow** |
| Full designation | **Phase 6 — Correction and Issue-Control Workflow** |
| Current status | **IN_PROGRESS** — implementation handoff accepted and executed by Z.AI (2026-10-01); the developer implementation is complete and submitted (developer-reported); **the Phase 6 architect review is PENDING** (no corrective handoff active — no issues are open; only ChatGPT may close Phase 6 or authorize Phase 7) |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `f62326dbe1940a2a518567d66e720a4b407dbf26` — the Phase 5 closure-record commit ("docs: record architect approval of phase 5"; the immediate child of `fb4ad5f5`). The latest architect-verified implementation remains `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef` (the corrected Phase 5 implementation, architect-verified by the `PASS` re-review, 2026-10-01) — later documentation commits are not to be confused with it. The `b65725e5` external commit remains accepted as an already-existing repository event (provenance not independently established) and must not be rewritten, reverted, amended, or otherwise modified |
| Architect | **ChatGPT** (architect / technical lead / reviewer / controller) |
| Developer | **Z.AI** (developer / implementer) |
| Handoff date | 2026-10-01 (Phase 6 implementation handoff, issued after the architect's Phase 5 closure and the Phase 5 closure record) |

### Objective

Establish a durable, repeatable **Correction and Issue-Control Workflow** so that whenever ChatGPT identifies a defect, divergence, incomplete requirement, regression, security concern, evidence problem, or other blocking issue in Z.AI work, the issue can be traced end-to-end — architect finding → issue record → corrective handoff → bounded Z.AI correction → developer verification → correction commit → architect re-review → issue resolution / phase closure — with the system preventing corrective work from silently expanding into unrelated implementation, and with every determination reconstructible by a fresh session without chat history.

### Scope (approved)

1. Modify `docs/project-control/ISSUES.md` — add the durable issue-control system: the severity model (P0–P3; P0/P1 authoritative in the Phase 5 contract, not weakened or reinterpreted); the canonical issue lifecycle with valid transitions, authority, and evidence; the canonical issue-record schema; the issue/phase status relationship; traceability requirements; the legacy-entry mapping; the (initially empty) canonical issue-records section.
2. Modify `docs/project-control/CURRENT_PHASE.md` — replace the Phase 5 contract with the Phase 6 contract (correction-workflow purpose; lifecycle and template relationships; review/STOP boundaries; acceptance criteria; non-scope; not an issue database).
3. Modify `docs/project-control/ZAI_HANDOFF.md` — this Part II instance replacement; Part I pointer updates strictly required by the template's creation (§I.5, §I.12).
4. Modify `docs/project-control/VERIFICATION_STATE.md` — the durable correction-workflow section (mapping onto the Phase 5 verification contract; no second verification system) + the Phase 6 evidence section + the consistency table + appendix commands.
5. Modify `worklog.md` — append the Phase 6 implementation entry (append-only).
6. Create `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — the canonical correction-handoff template (all 22 required sections; the bounded-scope statement; integrity rules).
7. Create `docs/project-control/sessions/SESSION-008.md` + update its README index (per the Phase 4 conventions).
8. Create `docs/project-control/verification/correction-cycle-test.sh` — the deterministic correction-cycle demonstration (Examples A–D).
9. Consequential (entailed by acceptance criterion 22 — Final State Contract consistency — per the Phase 4/5 reconciliation convention): reconcile `PROJECT_STATE.md` and `NEXT_ACTION.md` to Phase 6 `IN_PROGRESS`; update the superseded appendix pointer in `templates/PHASE_HANDOFF_TEMPLATE.md` (the corrective variant is superseded by the dedicated template — preventing two competing correction formats).

### Non-scope (explicit)

- **Do NOT** modify `src/**`, `packages/**`, `supabase/**`, `migrations/**`, `vercel.json`; do not implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, analytics, usage monitoring, voice functionality, RAG functionality, provider functionality, or UI/product features.
- **Do NOT** modify database schema; execute Supabase mutations; deploy to Vercel; modify deployment configuration; modify production branches (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); modify immutable Doable-source trees; modify `b65725e5`.
- **Do NOT** resolve R-3/R-4/R-5; rotate credentials; introduce secrets; introduce private chain-of-thought; refactor unrelated control documents.
- **Do NOT** rewrite the historical Phase 4/Phase 5 correction records (`SESSION-005.md`, `SESSION-006.md`, the `VERIFICATION_STATE.md` Phase 5 records, the historical `worklog.md` entries).
- **Do NOT** begin Phase 7, Phase 10, or any Clara feature work; do not create competing sources of truth.

### Prerequisites (all satisfied 2026-10-01)

1. Phase 5 `CLOSED` — architect re-review `PASS` (2026-10-01) on the corrected implementation `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`; closure record `f62326dbe1940a2a518567d66e720a4b407dbf26`.
2. The Phase 6 implementation handoff issued 2026-10-01 with baseline `f62326db` (the repository tip at issuance); the latest architect-verified implementation remains `fb4ad5f5`.
3. Mandatory initialization completed by the developer on 2026-10-01: all documents in Required reading read; repository state refreshed per §I.6 (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; HEAD `f62326db` = origin tip, clean tree; mainlines unchanged; `b65725e5` ancestry intact; `vercel.json` unchanged) — confirmed from repository evidence, not chat memory.

### Required reading (completed 2026-10-01)

1. `README.md` and the applicable agent-instruction documents: `.github/copilot-instructions.md`, `Doc/18-09-2026/AGENTS.md` (codebase agent instructions) and `docs/doable-source/AGENTS.md` (immutable-source boundary rules)
2. `docs/project-control/PROJECT_STATE.md`
3. `docs/project-control/CURRENT_PHASE.md`
4. `docs/project-control/NEXT_ACTION.md`
5. `docs/project-control/ZAI_HANDOFF.md` (Part I protocol + the Phase 5 instance then materialized)
6. `docs/project-control/VERIFICATION_STATE.md` (incl. the durable verification and phase-gate contract)
7. `docs/project-control/VERIFICATION_CHECKLIST.md`
8. `docs/project-control/ISSUES.md`
9. `docs/project-control/RISKS.md`
10. `docs/project-control/DECISIONS.md`
11. `docs/project-control/CHAT_CONTINUITY.md`
12. `docs/project-control/sessions/README.md` + the session records `SESSION-001`…`SESSION-007`
13. Repository-root `worklog.md` (canonical audit trail — incl. the historical Phase 5 correction sequence)
14. `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md`
15. `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (Phase 6 section)
16. `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`
17. `docs/project-control/verification/phase-closure-eligibility-test.sh`
18. `docs/AGENTS.md` — consulted; **does not exist** (ISSUES.md I-001, open; the real codebase agent instructions are `Doc/18-09-2026/AGENTS.md`, read above)

### Implementation tasks (numbered, deterministic)

1. Complete the mandatory initialization (Required reading; repository refresh per §I.6; confirm Phase 5 `CLOSED` and the baseline `f62326db` from repository evidence).
2. Create `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — the canonical correction-handoff form with all 22 required sections, the bounded-scope statement, and the correction integrity rules.
3. Extend `ISSUES.md` with the durable issue-control system (severity model; lifecycle with valid transitions/authority/evidence; the canonical issue-record schema; the issue/phase status relationship; traceability requirements; the legacy-entry mapping — I-001…I-012 preserved unrewritten) and the initially-empty canonical issue-records section.
4. Create `docs/project-control/verification/correction-cycle-test.sh` — the deterministic, read-only, self-contained correction-cycle demonstration (Example A — correction required, no automatic resolution; Example B — correction accepted via architect-verified evidence only; Example C — scope-expansion attempt rejected; Example D — P0 remains closure-blocking) and verify it exits 0 with all determinations correct.
5. Extend `VERIFICATION_STATE.md` with the durable correction-workflow section (the mapping onto the Phase 5 verification contract; no second verification system) + the Phase 6 evidence section + the reconciled consistency table + the appendix Phase 6 commands.
6. Replace Part II of this file with this Phase 6 handoff instance (per §I.12), with the strictly-required Part I pointer updates (§I.5/§I.12 — the correction template now exists); update the superseded corrective-variant appendix pointer in `templates/PHASE_HANDOFF_TEMPLATE.md`.
7. Rewrite `CURRENT_PHASE.md` as the Phase 6 contract; reconcile `PROJECT_STATE.md` and `NEXT_ACTION.md` to Phase 6 `IN_PROGRESS` (entailed by Final State Contract consistency — acceptance criterion 22).
8. Apply the session/worklog updates: create `SESSION-008.md`, add its index row to `sessions/README.md`, append the `worklog.md` Phase 6 implementation entry.
9. Execute the validation suite (Testing requirements below); record commands and results in `VERIFICATION_STATE.md` §Phase 6.
10. Commit as `docs: establish phase 6 correction and issue control`; push to `origin/feature/ai-core-from-doable-source`; verify clean status and sync.
11. Deliver the developer completion report (Evidence requirements below) and STOP.

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `docs/project-control/ISSUES.md` | modify | Add the durable §"Issue-control system" + the §"Issue records (canonical schema)" section; legacy entries I-001…I-012 preserved unrewritten |
| `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` | create | The canonical correction-handoff form (22 sections; bounded-scope statement; integrity rules; STOP boundary) |
| `docs/project-control/verification/correction-cycle-test.sh` | create | The deterministic correction-cycle demonstration (read-only governance artifact; not a CI gate; no application dependency; models state transitions only — no actual architect review performed or claimed) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | The durable correction-workflow section + the Phase 6 evidence section + the consistency table + the appendix Phase 6 commands |
| `docs/project-control/CURRENT_PHASE.md` | modify | Replace the Phase 5 contract with the Phase 6 contract (same contract structure; correction-workflow model summary referencing the canonical rules elsewhere) |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II instance replacement (Phase 5 → Phase 6); Part I pointer updates strictly required by the template's creation (§I.5/§I.12) |
| `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` | modify | The superseded corrective-variant appendix pointer updated to reference the dedicated correction template (prevents two competing correction formats) |
| `docs/project-control/PROJECT_STATE.md` | modify | Phase-state reconciliation to Phase 6 `IN_PROGRESS` (entailed by Final State Contract consistency); document contract preserved |
| `docs/project-control/NEXT_ACTION.md` | modify | Phase 6 continuation instruction (same 5-part structure) |
| `docs/project-control/sessions/SESSION-008.md` | create | Session audit record for this implementation session (twelve determinations) |
| `docs/project-control/sessions/README.md` | modify | SESSION-008 index row |
| `worklog.md` | modify | The Phase 6 implementation entry appended (append-only) |

Not modified (no change justified): `DECISIONS.md` and `RISKS.md` (not in the approved scope; no new architecture decisions or risk facts entailed — dispositions remain architect calls; the P1-exception mechanism continues to reference existing `DECISIONS.md` entries), `CHAT_CONTINUITY.md`, `VERIFICATION_CHECKLIST.md` (the canonical verification form — the correction workflow integrates into the existing contract rather than altering the checklist; its Phase 5 gate-record templates and worked examples remain authoritative), `PHASE-0-RECONNAISSANCE.md` (historical evidence), `README.md`/`AGENTS.md` documents (D-P2 pending), all application/product/database/deployment/immutable-source paths, `vercel.json`.

### Interfaces / contracts

- **Control-document contracts** (Phase 1): the documents' required fields and headings remain intact; only dated state values are reconciled.
- **Final State Contract** (plan): `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (this Part II Phase identity) = `VERIFICATION_STATE.phase` = latest worklog phase = **Phase 6 — Correction and Issue-Control Workflow, `IN_PROGRESS`**; baseline = `f62326db`; latest verified commit = `fb4ad5f5` (the latest architect-verified implementation; this phase's implementation commit is developer-reported until review).
- **Verification and phase-gate contract** (Phase 5; D-020): unchanged and binding — Gates A–F, applicability, review-outcome semantics, the P0/P1 blocker rule (P0 prevents closure — always, no exception path; P1 prevents `PASS` unless a recorded architect-approved exception), closure eligibility R1–R7. The Phase 6 correction workflow **references** this contract and maps onto it (`VERIFICATION_STATE.md` §"Correction and issue-control workflow") — no second verification system.
- **Issue-control system** (new, this phase; canonical in `ISSUES.md`): the issue lifecycle vocabulary (`OPEN`/`TRIAGED`/`CORRECTION_REQUIRED`/`CORRECTION_IN_PROGRESS`/`CORRECTION_SUBMITTED`/`REVIEW_PENDING`/`RESOLVED`/`WONT_FIX`/`DEFERRED`/`BLOCKED`) and the severity model (P0–P3) — distinct from, and deterministically related to, the phase-status vocabulary (D-011).
- **Correction-handoff template** (new, this phase): `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — the single canonical correction form; corrective instances materialize into Part II of this file.
- **Status vocabulary** (D-011) and **evidence classes** (D-012): unchanged and binding.
- **`b65725e5` handling rules** (standing): accepted as an already-existing repository event; not rewritten/reverted/amended; `vercel.json` non-scope; provenance reported as not independently established.
- **Handoff integrity** (D-017 / §I.6): unchanged and binding for this instance.

### Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads may be written into any control document — including issue records, correction handoffs, and correction evidence. The exposed Vercel token (R-5) is never reproduced — referenced only, per the existing project-control rules. A defect involving credentials is described without reproducing them.
- No fabricated timestamps; no unsupported claims; observable evidence only.
- A future or intended ChatGPT review is never written as already completed; a command Z.AI executed is never claimed on ChatGPT's behalf.
- The provenance of `b65725e5` must be reported as **not independently established** unless new repository evidence proves otherwise.
- Tenancy boundaries and authorization requirements: this phase is documentation-only and touches no application security/tenancy surface.
- Immutable-source boundaries (D-007) and production-branch restrictions (D-008) remain in force; no deployment operations; no force-push.

### Testing requirements (validation before commit)

| # | Check | Method |
|---|---|---|
| 1 | `npm run validate:model-config` | run (lightweight repository check — explicitly **not** interpreted as sufficient phase verification) |
| 2 | Phase 5 deterministic test — regression | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → 8/8 determinations correct, exit 0; **P0 present → closure eligibility FAIL** (case-3) verified |
| 3 | Phase 6 deterministic correction-cycle test | `bash docs/project-control/verification/correction-cycle-test.sh` → all determinations correct, exit 0 — Examples A (no automatic resolution; developer resolution rejected; state skip rejected; open blocking correction → closure FAIL), B (architect-verified resolution only; developer-evidence resolution rejected; repeat cycle valid), C (in-scope commit accepted; unrelated path rejected), D (P0 submitted → FAIL; P0 WONT_FIX → FAIL; P0 RESOLVED → PASS) |
| 4 | Correction-template completeness | all 22 required sections present; the bounded-scope statement present; integrity rules present |
| 5 | Issue-lifecycle consistency | severity/lifecycle/schema/status-relationship/traceability sections present; legacy entries preserved unrewritten (diff-checked vs baseline) |
| 6 | No competing verification system | the correction workflow references (does not duplicate) the Phase 5 contract; exactly one correction-handoff template and one correction-cycle test under `docs/project-control/` (`git ls-files`) |
| 7 | Complete Git diff inspection | full-diff review of every changed path |
| 8 | Changed-path scope check | every changed path within `worklog.md` + `docs/project-control/**`; no `src/**`, `packages/**`, `supabase/**`, `migrations/**`, `vercel.json`, `docs/doable-source/**` |
| 9 | Immutable-source check | the immutable Doable-source trees untouched (diff vs baseline) |
| 10 | Production-branch check | `Vercel-Prod`/`Vercel-Preview`/`Vite-Converted`/`main` refs unchanged; no force-push |
| 11 | Secret-pattern scan | credential/token patterns across all changed paths — no matches |
| 12 | Final State Contract consistency | phase/status agreement across the five members + the latest worklog entry |
| 13 | Git hygiene | working tree clean after commit; local HEAD = origin tip after push; the commit is the immediate child of `f62326db` |

The reusable aggregate validation script stays outside the repository (`/home/z/my-project/scripts/validate-phase6-control-docs.sh`), per the Phase 3/4/5 convention.

### Acceptance criteria (pass/fail — per the handoff §23; evaluated by the architect at review)

1. `ISSUES.md` has a canonical issue schema — PASS/FAIL.
2. Issue severity is explicitly defined — PASS/FAIL.
3. Issue lifecycle is explicitly defined — PASS/FAIL.
4. P0/P1 behavior remains consistent with Phase 5 — PASS/FAIL.
5. A reusable correction-handoff template exists — PASS/FAIL.
6. The correction template contains bounded scope and explicit non-scope — PASS/FAIL.
7. Correction traceability from finding → issue → handoff → commit → verification → review is defined — PASS/FAIL.
8. Correction scope cannot silently expand — PASS/FAIL.
9. Issue resolution requires architect verification — PASS/FAIL.
10. Phase closure cannot be triggered by developer correction alone — PASS/FAIL.
11. `VERIFICATION_STATE.md` integrates the correction workflow without creating a competing verification source — PASS/FAIL.
12. `CURRENT_PHASE.md` contains the Phase 6 contract — PASS/FAIL.
13. `ZAI_HANDOFF.md` contains the Phase 6 handoff instance — PASS/FAIL.
14. `worklog.md` records the Phase 6 implementation — PASS/FAIL.
15. Phase 6 session audit exists — PASS/FAIL.
16. A deterministic correction-cycle demonstration/test exists — PASS/FAIL.
17. P0 remains unconditionally closure-blocking — PASS/FAIL.
18. P1 exception behavior remains intact — PASS/FAIL.
19. No secrets/private reasoning are introduced — PASS/FAIL.
20. No product/DB/deployment/immutable-source changes occur — PASS/FAIL.
21. No unrelated control-document changes occur — PASS/FAIL.
22. Final State Contract is consistent — PASS/FAIL.
23. Validation passes — PASS/FAIL.
24. Git tree is clean — PASS/FAIL.
25. Branch is synchronized with origin — PASS/FAIL.
26. No Phase 7 or later work is started — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused documentation-only implementation commit: `docs: establish phase 6 correction and issue control` — the immediate child of `f62326dbe1940a2a518567d66e720a4b407dbf26`; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`; no unrelated changes ride along.
- Push normally to `origin/feature/ai-core-from-doable-source`.
- Do not modify or rewrite `b65725e5`; do not modify `vercel.json`; do not amend the baseline commit.

### Evidence requirements

The developer completion report must provide (per §I.7 and this handoff §26): Phase; Objective; Scope completed; Explicit non-scope; Files changed; Issue lifecycle implemented; Correction template implemented; Traceability model; Deterministic test; Tests/checks run; Validation results; Security/tenancy considerations; Git status; Implementation commit SHA; Known issues; Remaining risks; Deviations; Unresolved questions; and the explicit confirmation that no later phase was started. All reported as developer-reported evidence until the architect re-reviews — **no architect approval of Phase 6 is claimed; the result is developer-reported evidence until ChatGPT reviews it**.

### Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

The review is Gate D under the Phase 5 verification and phase-gate contract. ChatGPT must independently inspect: the actual Git diff; the issue schema; the correction template; the lifecycle semantics; the traceability; the Phase 5 contract compatibility (P0/P1 behavior); the security; the scope; the deterministic tests; and the Final State Contract — then record one of `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED` in `VERIFICATION_STATE.md` §Phase 6. **Z.AI must not choose the outcome.** If the outcome is `CORRECTION_REQUIRED`, the corrective handoff is executed per the correction workflow this phase establishes (the issue record per `ISSUES.md`; the template per `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md`).

### STOP boundary

After the Phase 6 implementation, validation, commit, push, and completion report: **Z.AI STOPs.** Do NOT: start Phase 7 (or any later phase); start Vercel operations; start Supabase operations; create product-feature specifications; implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills; or modify Clara application code. Wait for ChatGPT's independent review. **Only ChatGPT may close Phase 6 and authorize Phase 7.**
