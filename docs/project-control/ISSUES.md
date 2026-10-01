# ISSUES.md — Durable Issue Register

> Known defects, blockers, and discrepancies. Derived from Phase 0 reconnaissance findings (PHASE-0-RECONNAISSANCE.md §8) and observed project events — no defects are invented.
> **Issue-control system (durable, established by Phase 6 — Correction and Issue-Control Workflow, 2026-10-01):** the canonical issue lifecycle, severity model (P0–P3), issue-record schema, and issue/phase status relationship are defined in §"Issue-control system" below; the durable relationship to the verification contract is `VERIFICATION_STATE.md` §"Correction and issue-control workflow"; the canonical correction-handoff form is `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md`. This register is the **single** issue database — no competing issue trackers may be created.
> Pre-Phase-6 issue statuses: `open` · `resolved` (with dated evidence) · `deferred` (awaiting a later phase/decision) · `informational` (recorded fact, no action required). These legacy values map onto the canonical lifecycle (see §"Legacy entries" below); the historical records I-001…I-012 are preserved unrewritten.
> Risk-type findings (branch protection, Vercel semantics, migration auto-apply, exposed token) are tracked in RISKS.md, not duplicated here.
> Phase 0 issues are NOT silently marked resolved — every status change below carries explicit dated evidence.

---

## Issue-control system (durable — established by Phase 6, 2026-10-01)

> Binding on all issue records from Phase 6 onward (plan Phase 6; the durable mapping to the verification and phase-gate contract — `VERIFICATION_STATE.md` §"Verification and phase-gate contract" — is `VERIFICATION_STATE.md` §"Correction and issue-control workflow"). Established so that whenever the architect identifies a defect, divergence, incomplete requirement, regression, security concern, evidence problem, or other blocking issue in developer work, the issue can be traced end-to-end: **architect finding → issue record → corrective handoff → bounded developer correction → developer verification → correction commit → architect re-review → issue resolution / phase closure** — and so that corrective work can never silently expand into unrelated implementation. A completely fresh session must be able to determine, from this register alone: what the issue was; which phase it belongs to; what evidence caused the finding; its severity; its current lifecycle status; the exact corrective scope; the explicit non-scope; which developer commit attempted the correction; what verification was performed; whether the architect has re-reviewed it; and whether the issue is actually resolved.

### 1. Issue severity model (canonical)

P0/P1 semantics are **authoritative in the Phase 5 verification contract** (`VERIFICATION_STATE.md` §"P0/P1 blocker rule") and are **not weakened, reinterpreted, or duplicated here** — this table restates them for issue-triage use only:

| Severity | Definition | Closure effect |
|---|---|---|
| **P0** | Critical issue preventing safe continuation or invalidating the phase result — e.g. security-critical defect; tenant-isolation failure; destructive uncontrolled behavior; corrupted authoritative state; false verification/closure evidence | **P0 prevents phase closure — always; there is no P0 exception path.** A P0 issue blocks closure while it remains unresolved (any lifecycle state other than `RESOLVED` — including `WONT_FIX`, `DEFERRED`, `BLOCKED`, or a submitted-but-unre-reviewed correction). An architect decision may document acknowledgement, remediation, escalation, or other operational handling of a recorded P0, but it must not authorize phase closure while the P0 remains unresolved |
| **P1** | High-severity issue materially affecting correctness, security, reliability, or an acceptance criterion | **P1 prevents `PASS`** unless the project-control policy explicitly records an architect-approved exception (an actual `DECISIONS.md` reference). Exceptions are never invented by the developer; the P1 exception is the only exception mechanism (P0 and P2/P3 have none). A pending/accepted P1 **correction** is not an exception — the issue blocks until `RESOLVED` |
| **P2** | Moderate-severity issue with real but bounded impact (a defect or documentation gap that does not materially invalidate the phase result) | Does **not** automatically block phase closure. If the issue violates an acceptance criterion of the active phase or another explicit blocking condition (so recorded in the issue record), it becomes a **blocking issue** and remains closure-blocking while unresolved — it must be resolved (`RESOLVED`) before the phase can close (R6: no unresolved blocking correction may remain open at closure). **Phase 6 introduces no P2/P3 exception mechanism**: no architect-approved exception, deferral, acknowledgement, or other architect decision clears an acceptance-violating P2/P3 short of `RESOLVED` — an acceptance-violating P2/P3 cannot become closure-compatible merely because an exception is recorded |
| **P3** | Low-severity/cosmetic issue (polish, clarity, convenience) | Same rule as P2: not automatically closure-blocking. If it violates an acceptance criterion or another explicit blocking condition (recorded in the issue), it is closure-blocking while unresolved and must be resolved before the phase can close — no P2/P3 exception mechanism exists (resolution is the only path) |

Severity is assigned at triage by the **architect** (a developer may propose a severity in its finding report; the assignment of record is the architect's). Severity may be re-assigned only by architect direction, with dated evidence in the issue record.

### 2. Issue lifecycle (canonical states, valid transitions, authority)

```text
OPEN
  ↓ (architect triage: severity + disposition assigned)
TRIAGED
  ↓ (architect issues corrective handoff — templates/CORRECTION_HANDOFF_TEMPLATE.md)
CORRECTION_REQUIRED
  ↓ (developer begins the bounded correction)
CORRECTION_IN_PROGRESS
  ↓ (developer delivers correction commit + evidence report)
CORRECTION_SUBMITTED
  ↓ (submission registered in the durable state — VERIFICATION_STATE.md review trail)
REVIEW_PENDING
  ↓ (architect re-review of the correction)
RESOLVED  [terminal success — architect-verified resolution evidence only]

Non-progress / terminal states (architect-directed only):
TRIAGED → WONT_FIX (architect explicitly declines the fix — DECISIONS.md reference required)
TRIAGED → DEFERRED (awaiting a later phase/decision)
TRIAGED → BLOCKED (external dependency prevents progress; reactivated by architect direction)
REVIEW_PENDING → CORRECTION_REQUIRED (re-review found the correction insufficient — repeat cycle)
```

Valid transitions, who may effect them, and the evidence required:

| From | To | Effected by | Required evidence |
|---|---|---|---|
| — (new finding) | `OPEN` | architect **or** developer (reporting a discovered defect — `[developer-reported]` finding) | finding + observable evidence; phase/context identified |
| `OPEN` | `TRIAGED` | architect | severity assigned (P0–P3) + disposition determined |
| `OPEN` | `RESOLVED` | architect | `[architect-verified]` resolution evidence (e.g. the finding is demonstrated already-addressed or mistaken) — never a developer claim |
| `OPEN` | `WONT_FIX` / `DEFERRED` / `BLOCKED` | architect | architect decision recorded (a `DECISIONS.md` reference for `WONT_FIX`; architect direction for `DEFERRED`/`BLOCKED`) |
| `TRIAGED` | `CORRECTION_REQUIRED` | architect | corrective handoff issued (materialized from `templates/CORRECTION_HANDOFF_TEMPLATE.md` into `ZAI_HANDOFF.md` Part II), referencing this issue ID |
| `TRIAGED` | `RESOLVED` / `WONT_FIX` / `DEFERRED` / `BLOCKED` | architect | as above |
| `CORRECTION_REQUIRED` | `CORRECTION_IN_PROGRESS` | developer | corrective handoff received and verified per `ZAI_HANDOFF.md` §I.6; corrective work begun |
| `CORRECTION_IN_PROGRESS` | `CORRECTION_SUBMITTED` | developer | the focused correction commit exists (referencing the issue ID) and the correction evidence report is delivered — `[developer-reported]` |
| `CORRECTION_SUBMITTED` | `REVIEW_PENDING` | developer (registration) | the submission recorded in the durable state (`VERIFICATION_STATE.md` under the related phase; issue record updated) — awaiting architect re-review |
| `REVIEW_PENDING` | `RESOLVED` | **architect only** | an actual ChatGPT re-review of the correction — `[architect-verified]` resolution evidence |
| `REVIEW_PENDING` | `CORRECTION_REQUIRED` | architect | re-review outcome `CORRECTION_REQUIRED` (repeat cycle; a further corrective handoff) |
| `REVIEW_PENDING` | `WONT_FIX` / `DEFERRED` | architect | architect decision recorded |
| `DEFERRED` / `BLOCKED` | `TRIAGED` (or `CORRECTION_REQUIRED`) | architect | dated architect re-activation direction in the issue record |
| `RESOLVED` | `OPEN` | architect | dated reopen note (regression/recurrence); the record keeps its ID and gains a dated reopen annotation |

Rules (binding):

1. Consecutive architect transitions may be effected within one architect action — e.g. a `CORRECTION_REQUIRED` review outcome records `OPEN → TRIAGED → CORRECTION_REQUIRED` on the issue at once; the states record the determination sequence, not separate clock events.
2. `CORRECTION_SUBMITTED` **never** auto-transitions to `RESOLVED`. An issue is not resolved merely because Z.AI says it is fixed — **only architect verification can establish `architect-verified` resolution**.
3. `RESOLVED` always requires `[architect-verified]` resolution evidence, from whichever state it is reached.
4. The developer may effect only: `OPEN` (reporting a discovered finding), `CORRECTION_IN_PROGRESS`, `CORRECTION_SUBMITTED`, and the `REVIEW_PENDING` registration. Every other transition is architect-only.
5. A newly discovered issue during a correction, outside the corrective scope, is **not** absorbed into the correction: STOP → record it here as a new `OPEN` issue (`[developer-reported]`) → await architect direction.
6. Statuses use the canonical uppercase vocabulary above; the pre-Phase-6 lowercase values in the legacy entries below are the same states (see §"Legacy entries").

### 3. Canonical issue-record schema (from Phase 6 onward)

Every new issue is recorded under §"Issue records (canonical schema)" below with **all** of the following fields (a fresh session must be able to reconstruct the complete lifecycle from the record alone):

| Field | Content |
|---|---|
| Issue ID | `I-NNN` (sequential; never reused) |
| Title | one precise line |
| Phase | the phase the issue belongs to / was discovered in |
| Severity | `P0` / `P1` / `P2` / `P3` (architect-assigned at triage) |
| Status | canonical lifecycle state (this register is the status of record) |
| Date identified | YYYY-MM-DD |
| Reporter / role | who found it and in what role (architect review / developer self-discovery) |
| Finding | the exact defect/divergence/incomplete requirement/regression/security concern/evidence problem |
| Evidence | observable evidence grounding the finding — classified `[developer-reported]` / `[architect-verified]`; observable facts only, **never secrets or private reasoning** |
| Affected commit | the commit carrying the defect (or "n/a — document/process finding") |
| Affected files/areas | the files/documents/areas touched by the defect |
| Acceptance criterion affected | the phase acceptance criterion / gate / contract rule violated (or "none — not acceptance-blocking") |
| Security / tenancy impact | assessment (for documentation-only findings: "none — no application security surface") |
| Correction required | what the architect required (verbatim from the corrective handoff) |
| Correction scope | the approved corrective scope (paths + bounded changes) |
| Explicit non-scope | what the correction must NOT touch |
| Expected verification | the verification the correction must supply |
| Developer correction commit | SHA + message (filled when `CORRECTION_SUBMITTED`+) — `[developer-reported]` |
| Architect review status | `pending` until an actual re-review occurs; then the outcome — **a future review is never recorded as completed** |
| Resolution evidence | `[architect-verified]` evidence (filled only at `RESOLVED`) |
| Resolution date | YYYY-MM-DD (filled only at `RESOLVED`) |
| Related decision | `DECISIONS.md` reference (P1 exception, `WONT_FIX`, handling decision) where applicable |
| Related worklog/session | `worklog.md` entry + `sessions/SESSION-NNN.md` record covering the correction |

### 4. Issue status ↔ phase status relationship (deterministic)

The phase-status vocabulary (D-011) and the issue lifecycle are **distinct systems**; `CORRECTION_REQUIRED` appears in both with distinct meanings (phase status: the architect review outcome; issue status: the architect's determination that this issue needs a corrective handoff). The relationship:

| Issue state | Phase state | Rule |
|---|---|---|
| Blocking correction open (`CORRECTION_REQUIRED` — issue status) | `IN_PROGRESS` / `CORRECTION_REQUIRED` (phase status, D-011) | The phase **cannot become `CLOSED`** (closure eligibility FAIL via R4/R5/R6) |
| `CORRECTION_IN_PROGRESS` | as above | The phase remains open; the developer executes only the corrective scope |
| `CORRECTION_SUBMITTED` / `REVIEW_PENDING` | `IN_PROGRESS` (awaiting architect review — "developer implementation complete, awaiting architect review" is `IN_PROGRESS` per D-011) | Awaiting ChatGPT re-review; the phase cannot close |
| `RESOLVED` | phase **may** become `CLOSED` | Only if **all other Phase-Gate conditions are satisfied** (R1–R7) **and** ChatGPT returns `PASS`. Issue resolution is necessary-but-not-sufficient for closure |
| `WONT_FIX` / `DEFERRED` / `BLOCKED` | per severity model | P0 in any such state still blocks closure (no exception path); P1 blocks unless an architect-approved exception is recorded; P2/P3 block only if acceptance-violating — and then they must be resolved before closure (no P2/P3 exception mechanism; resolution is the only path) |

**A developer correction commit never independently closes the issue or the phase.** Corrective work does not itself create `PASS`; Gate D remains architect-only (`VERIFICATION_STATE.md` §contract).

### 5. Traceability requirements (binding)

Every correction cycle must preserve the deterministic chain:

```text
Issue ID → architect finding → corrective handoff (CH-NNN → ZAI_HANDOFF.md Part II instance)
→ baseline SHA → developer correction commit → verification evidence ([developer-reported])
→ architect re-review ([architect-verified]) → issue resolution → phase closure eligibility
```

The issue record carries every link (corrective-handoff ID, baseline SHA, correction commit SHA, verification evidence, architect review status, resolution evidence). The correction commit's message references the finding/issue ID. Only architect verification can establish `architect-verified` resolution.

### 6. Legacy entries (I-001 … I-012 — preserved unrewritten)

The pre-Phase-6 entries below predate this system and are **preserved exactly as recorded** (append-only convention). Mapping of their legacy statuses onto the canonical vocabulary (same states, historical spelling): `open` ≡ `OPEN` (untriaged under the severity model — triage of I-001/I-007 remains an architect call and is deliberately not performed here); `resolved` ≡ `RESOLVED`; `deferred` ≡ `DEFERRED`; `informational` is a non-lifecycle class (recorded fact, no action required — never enters the lifecycle). New issues from Phase 6 onward are recorded under §"Issue records (canonical schema)" with the full schema above.

---

## Open

### I-001 — `docs/AGENTS.md` referenced by the spec but does not exist

| Field | Value |
|---|---|
| Status | open |
| Description | The control-system spec's cross-chat recovery order begins with `docs/AGENTS.md`, but no such file exists; the real codebase agent instructions live at `Doc/18-09-2026/AGENTS.md` |
| Impact | A fresh ChatGPT session following the spec read-order literally hits a missing file at step 1 and must self-recover |
| Phase discovered | Phase 0 (report §8.1, conflict C-1) |
| Evidence / reference | `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md` §Cross-Chat Recovery; `git ls-files docs/AGENTS.md` → empty |
| Owner / next action | ChatGPT — decide D-P2 (thin pointer file vs. amend the spec read order); deliberately NOT created in Phase 1 (outside the required file set) |

### I-007 — Stale Copilot instructions reference non-existent `graphify-out/`

| Field | Value |
|---|---|
| Status | open |
| Description | `.github/copilot-instructions.md` instructs agents to use `graphify` when `graphify-out/graph.json` exists, but that path does not exist in the repository |
| Impact | Low — misleading guidance for tools that read the file; harmless otherwise |
| Phase discovered | Phase 0 (report §1/§8.9, conflict C-9; recommendation at the time: keep as-is) |
| Evidence / reference | Phase 0 report §8.9 |
| Owner / next action | ChatGPT — trivial doc fix whenever convenient; not blocking any phase |

## Resolved

### I-003 — No durable in-repo project worklog (RESOLVED 2026-10-01)

| Field | Value |
|---|---|
| Status | resolved (2026-10-01) |
| Description | The only in-repo worklog was `docs/doable-source/WORKLOG.md`, scoped to the vendored library's own development phases; no durable project-wide worklog existed, and the Z.AI agent-side worklog lived outside the repository (not durable, not in Git) |
| Impact | Until Phase 4, historical audit relied on Git history + the Phase 0 report + the control-document set; chat-carried history was not authoritative |
| Phase discovered | Phase 0 (report §2/§8.2, conflict C-2) |
| Resolution evidence | Canonical project worklog established at the repository root (`worklog.md`) by the Phase 4 implementation commit `5febaacd5dcc55268904d1371038bbe8ff372040` ("docs: establish phase 4 worklog and session audit"; the immediate child of `d12b0582` on `feature/ai-core-from-doable-source`), together with the session-audit layer `docs/project-control/sessions/` (README + SESSION-001…005); historical coverage of Phases 0–3 + the `b65725e5` mid-handoff event, evidence-classified and append-only; explicitly an audit/history artifact, not current-state authority. D-P1 confirmed as D-018 (DECISIONS.md). The out-of-repo agent-side worklog remains a local session convenience only and is never cited as authority |
| Closed by | Phase 4 — Worklog and Session Audit implementation (2026-10-01), per plan Phase 4 and the refreshed Phase 4 handoff; resolution **confirmed by the architect review of Phase 4 — outcome `PASS` (2026-10-01)**, which closed the phase |
| Traceability | Phase 0 finding C-2 → plan Phase 4 → D-P1 recommendation → refreshed Phase 4 handoff authorization → Phase 4 implementation commit `5febaacd` → architect review `PASS` (2026-10-01) → Phase 4 closure record |

### I-002 — Phase 0 report recorded stale repository-state evidence (RESOLVED 2026-10-01)

| Field | Value |
|---|---|
| Status | resolved (2026-10-01) |
| Description | The Phase 0 reconnaissance report recorded HEAD `cdcf23ce` and "6 commits ahead of Vite-Converted" because its snapshot was taken before the report's own commit (`adbc9e16`) existed |
| Impact | Repository-state evidence in the report was inaccurate until corrected; discovered by architect review (drift risk R-1 materializing) |
| Phase discovered | Phase 0 review (architect correction directive, 2026-10-01 — review outcome `CORRECTION_REQUIRED`) |
| Resolution evidence | Correction commit `bcc1769d` ("docs: correct phase 0 repository evidence") — HEAD row, ahead/behind count (7/0 at `adbc9e16`, 8/0 after correction), superset wording, and mainline SHAs all reconciled against fresh Git evidence; correction documented inside the report itself |
| Closed by | Architect issuance of the Phase 1 implementation handoff (2026-10-01), advancing the workflow past the corrected evidence |
| Traceability | finding → corrective directive → developer commit `bcc1769d` → architect advancement (the correction path the plan §Review Focus #5 requires) |

### I-004 — Stale chat-carried PR state (RESOLVED 2026-10-01)

| Field | Value |
|---|---|
| Status | resolved (2026-10-01) |
| Description | Standing chat instructions still referenced PR #191 as "open for owner review", while repository truth showed #191 merged and promotion PR #262 (`Vercel-Prod ← Vite-Converted`) open |
| Impact | Demonstrated that chat memory had already diverged from repository truth — the core problem the control system exists to fix |
| Phase discovered | Phase 0 (report §3/§8.4, conflict C-4) |
| Resolution evidence | Phase 0 report §3 records true PR state with dates; D-001 (repository state authoritative) adopted; durable control documents now carry the PR state (PROJECT_STATE.md, VERIFICATION_STATE.md — dated 2026-10-01: PR #191 merged, PR #262 open, head `5ca8ec58`) |
| Closed by | Adoption of repository-state-authoritative principle + Phase 1 durable state layer |
| Residual risk | The general drift phenomenon remains R-1 (RISKS.md) — mitigation continues through Phases 2–4 |

## Deferred

### I-005 — Dual AI stacks; future features must declare their target seam

| Field | Value |
|---|---|
| Status | deferred |
| Description | Incumbent `src/modules/ai-core` (multi-LLM abstraction) and new `src/modules/ai-platform-core` (Doable-derived host seam; production routes intentionally unchanged so far) coexist |
| Impact | Future feature specs that do not declare which seam they target risk divergent provider behavior |
| Phase discovered | Phase 0 (report §4/§8.5, conflict C-5) |
| Evidence / reference | Phase 0 report §8.5 |
| Owner / next action | ChatGPT — decision D-P3, recorded in the first feature-phase spec (plan Phase 10) |

### I-006 — Promotion PR #262 open, awaiting owner merge

| Field | Value |
|---|---|
| Status | deferred (operational, informational weight) |
| Description | PR #262 (`Vercel-Prod ← Vite-Converted`, "feat: wire AI Platform Core adapter seam into Clara", head `5ca8ec58`) is open and owner-controlled |
| Impact | None on the project-control phases; production promotion timing is an owner decision |
| Phase discovered | Phase 0 (report §3) |
| Evidence / reference | GitHub PR #262 state observed 2026-10-01 (open, not merged) |
| Owner / next action | Project owner — merge or manage via normal PR flow |

## Informational (recorded facts; no action required)

| ID | Status | Description | Evidence |
|---|---|---|---|
| I-008 | informational | `docs/doable-source/WORKLOG.md` is scoped to the library's own phases; project-wide entries must never be folded into it (scope boundary, not a defect) | Phase 0 report §8.3 |
| I-009 | informational | Two documentation roots coexist by design: `Doc/` (capitalized, dated, historical archive) and `docs/` (lowercase, active). All new control documents go under `docs/` | Phase 0 report §8.6 |
| I-010 | informational | `docs/doable-source/.github/workflows/source-closure.yml` is inert in Clara — GitHub discovers workflows only at the repository root; its CI-evidence claims apply to the source library, not Clara | Phase 0 report §8.8 |
| I-011 | informational | `docs/superpowers/agent-workspace-routing-kb-context.md` sits outside the `specs|plans|reports` naming convention; historical, left as-is | Phase 0 report §8.10 |
| I-012 | informational | Branch protection is not enforced (GitHub Free private repo) — production-branch safety is PR-discipline only; tracked as risk R-2 rather than an issue | Phase 0 report §8.7; RISKS.md R-2 |

---

## Issue records (canonical schema — Phase 6 onward)

> New issues from Phase 6 onward (next sequential ID: **I-014**) are appended here, each using the full canonical schema (§"Issue-control system" §3 above), one `### I-NNN — title` heading per record, with lifecycle status updated **only** through valid architect/developer transitions (§2) and every status change carrying dated evidence. The first record below is **I-013** — opened 2026-10-01 by the architect's review of the Phase 6 implementation (corrective handoff CH-001); the Phase 6 implementation itself surfaced no defects, and the pre-existing entries I-001…I-012 are unchanged as recorded above. Records appear below only when an actual finding exists — no defects are invented.

### I-013 — Phase 6 P2/P3 closure policy contained a P2/P3 exception path contradicting the Phase 5 closure-eligibility contract (R6)

| Field | Value |
|---|---|
| Issue ID | I-013 |
| Title | Phase 6 P2/P3 closure policy contained a P2/P3 exception path contradicting the Phase 5 closure-eligibility contract (R6) |
| Phase | Phase 6 — Correction and Issue-Control Workflow (the issue-control system this phase established) |
| Severity | P1 (architect-assigned at triage, 2026-10-01 — a governance-contract correctness problem affecting phase-closure semantics; deliberately not classified P0 merely because it blocks Phase 6) |
| Status | `REVIEW_PENDING` (lifecycle: `OPEN` → `TRIAGED` → `CORRECTION_REQUIRED` [architect, 2026-10-01, per the corrective handoff CH-001] → `CORRECTION_IN_PROGRESS` → `CORRECTION_SUBMITTED` → `REVIEW_PENDING` [developer registration, 2026-10-01, this correction commit]) |
| Date identified | 2026-10-01 |
| Reporter / role | ChatGPT — architect review of the Phase 6 implementation (first review) |
| Finding | The Phase 6 issue-control system introduced a P2/P3 exception path inconsistent with the already-established Phase 5 closure-eligibility contract: the severity model described an acceptance-violating P2/P3 as closure-blocking while unresolved, but then permitted such an issue to remain unresolved if covered by a recorded architect-approved exception — creating a new closure exception mechanism for unresolved blocking P2/P3 issues that Phase 5 does not define. Phase 5 R6 requires "no unresolved blocking correction is open"; an acceptance-violating P2/P3 that remains unresolved is still a blocking correction and cannot become closure-compatible merely because an exception is recorded |
| Evidence | [architect-verified] The architect's corrective handoff on the Phase 6 implementation (2026-10-01; review outcome `CORRECTION_REQUIRED`; correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe`) — finding §1 and the required canonical rule §2. [developer-reported, Git-verifiable] The contradictory wording as delivered at `c0cca964`: `ISSUES.md` §1 P2 row ("it may be cleared only by resolution (`RESOLVED`) or by an explicitly recorded architect-approved exception (the same `DECISIONS.md` mechanism …)") and P3 row ("unless resolved or covered by a recorded architect-approved exception"); `VERIFICATION_STATE.md` §"Correction and issue-control workflow" R6 mapping ("P2/P3 iff the issue violates an acceptance criterion … without a recorded architect-approved exception"); `CURRENT_PHASE.md` correction-workflow model summary ("then they block while unresolved unless resolved or covered by a recorded architect-approved exception"); `verification/correction-cycle-test.sh` computing P2/P3 blocking only when not exceptioned |
| Affected commit | `c0cca964064286c25dcf22c8f86038baaacd7ebe` — "docs: establish phase 6 correction and issue control" (the Phase 6 implementation commit) |
| Affected files/areas | `docs/project-control/ISSUES.md` (§1 severity model, P2/P3 rows; §4 status-relationship row); `docs/project-control/VERIFICATION_STATE.md` (§"Correction and issue-control workflow", R6 mapping); `docs/project-control/CURRENT_PHASE.md` (correction-workflow model summary); `docs/project-control/verification/correction-cycle-test.sh` (the P2/P3 blocking determination) |
| Acceptance criterion affected | Phase 6 acceptance criteria 4/17/18 (P0/P1 behavior consistent with Phase 5; P0 unconditionally closure-blocking; P1 exception intact) as the contract-consistency conditions the contradiction violated — the P2/P3 closure semantics contradicted Phase 5 R6 ("no unresolved blocking correction is open"), which the Phase 6 workflow is contractually forbidden to bypass (`VERIFICATION_STATE.md` §"Correction and issue-control workflow": no second verification system; closure eligibility continues to follow R1–R7) |
| Security / tenancy impact | none — no application security surface (documentation-only governance defect) |
| Correction required | (verbatim from the corrective handoff CH-001 §2) "**P2/P3 do not automatically block phase closure. If a P2/P3 violates an active phase acceptance criterion or another explicit blocking condition, it becomes a blocking issue and remains closure-blocking while unresolved. Phase 6 introduces no P2/P3 exception mechanism.**" — with: they must be resolved before closure; the P0 rule (P0 always prevents closure; no exception path) and the P1 rule (P1 prevents `PASS` unless the existing Phase 5 architect-approved exception applies) unchanged and not weakened; the issue lifecycle unchanged; the deterministic test corrected to prove the semantics |
| Correction scope | `ISSUES.md` severity-model wording (P2/P3 rows; the P1 row's only-exception clarifier; the §4 status-relationship row) + this I-013 record; `VERIFICATION_STATE.md` R6-mapping wording + the Phase 6 corrective-cycle records (evidence rows, review trail, outstanding state, consistency table, appendix); `CURRENT_PHASE.md` severity-model summary + current-state wording; `verification/correction-cycle-test.sh` P2/P3 blocking determination + severity-edge fixtures; `ZAI_HANDOFF.md` Part II (the CH-001 corrective-handoff instance); `worklog.md` + `sessions/SESSION-009.md` + `sessions/README.md` (append-only audit records); consequential current-state reconciliation of `PROJECT_STATE.md` and `NEXT_ACTION.md` (entailed by the state-consistency requirement — the durable state must distinguish the Phase 6 implementation commit from the Phase 6 correction commit with the architect re-review PENDING — per the established Phase 4/5/6 reconciliation convention) |
| Explicit non-scope | No `src/**`, `packages/**`, `supabase/**`, `migrations/**`, `vercel.json`; no immutable Doable-source trees; no `b65725e5` modification; no database/Vercel/deployment operations; no product/AI-provider/Multi-Provider/Unified Tool Runtime/Integrations/MCP/Agent Runtime/Agent Work Mode/Memory/Skills/analytics/voice/RAG work; no R-3/R-4/R-5 resolution; no Phase 7; no issue-lifecycle redesign; no weakening of the P0 or P1 rules; no rewriting of historical records (SESSION-008, the worklog Phase 6 implementation entry, the Phase 6 validation history) |
| Expected verification | `bash docs/project-control/verification/correction-cycle-test.sh` → **24/24 determinations correct, exit 0** — including: non-acceptance-violating P2/P3 do not automatically block closure; acceptance-violating P2 and P3 block while unresolved; an unresolved acceptance-violating P2/P3 with an alleged architect exception remains closure-ineligible (FAIL); Phase 5 regression `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → 8/8, exit 0, P0 present → FAIL; `npm run validate:model-config` → PASS; repository-wide search confirming the P2/P3-exception semantics absent; complete Git diff inspection; changed-path scope check; secret-pattern scan; Final State Contract consistency |
| Developer correction commit | `docs: correct phase 6 p2 p3 closure policy` — the immediate child of `c0cca964064286c25dcf22c8f86038baaacd7ebe` on `feature/ai-core-from-doable-source` (documentation-only; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`) [developer-reported; exact SHA resolvable via `git rev-parse origin/feature/ai-core-from-doable-source` after push] |
| Architect review status | `pending` — the architect's re-review of the correction has NOT occurred; no architect verification of the correction is claimed (a future review is never recorded as completed) |
| Resolution evidence | — (filled only at `RESOLVED`, by `[architect-verified]` resolution evidence) |
| Resolution date | — (filled only at `RESOLVED`) |
| Related decision | none — no `DECISIONS.md` reference applies: the P1 exception mechanism is not invoked, Phase 6 introduces no P2/P3 exception mechanism, and no exception is recorded for this issue |
| Related worklog/session | `worklog.md` Phase 6 entry (the appended corrective-cycle note, 2026-10-01); `docs/project-control/sessions/SESSION-009.md` (the Phase 6 correction session record); `VERIFICATION_STATE.md` §Phase 6 (the corrective-cycle records and the architect review trail) |

