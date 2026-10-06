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

### I-048 — Runner token-refresh decision trusted mutable connection auth_type

| Field | Value |
|---|---|
| Issue ID | I-048 |
| Title | OAuth refresh behavior was selected from connection auth_type instead of the registry definition |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED |
| Date identified | 2026-10-06 |
| Reporter / role | Architect review / ChatGPT |
| Finding | runAction selected ensureTokenFresh based on connection.auth_type. The organisation connection API accepts an authType value from the caller, while the registry definition is the authoritative integration contract. A mismatched stored auth_type could suppress OAuth refresh for an OAuth integration and alter credential lifecycle behavior. |
| Evidence | [architect-verified] Source review of src/modules/integrations/runtime/runner-core.ts and the organisation connection API confirmed that connection.auth_type was caller-populable and was used to decide whether OAuth refresh ran. |
| Affected commit | 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126 |
| Affected files/areas | Integration runner OAuth lifecycle decision |
| Acceptance criterion affected | I-2 credential/OAuth safety and authoritative integration contract |
| Security / tenancy impact | Bounded credential-lifecycle correctness risk; could execute with a stale OAuth access token |
| Correction required | Use the registry integration definition's authType as the authoritative input to token-refresh behavior; do not let stored/caller-provided connection auth_type suppress the OAuth lifecycle. |
| Correction scope | src/modules/integrations/runtime/runner-core.ts |
| Explicit non-scope | No new OAuth callback transport, no provider rollout, no MCP work, no production promotion |
| Expected verification | Focused runner/OAuth tests plus current-head executable test/typecheck/lint/build evidence |
| Developer correction commit | 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126 |
| Architect review status | RESOLVED — source correction reviewed by ChatGPT |
| Resolution evidence | [architect-verified] runAction now passes def.authType, sourced from the authoritative integration registry, to ensureTokenFresh. The connection's auth_type can no longer disable OAuth refresh for a registry-declared OAuth integration. |
| Resolution date | 2026-10-06 |
| Related decision | D-032 |
| Related worklog/session | 2026-10-06 I-048 owner continuation |


### I-047 — Direct organisation connection could bypass integration-count limit

| Field | Value |
|---|---|
| Issue ID | I-047 |
| Title | Direct connect could implicitly enable an organisation integration without enforcing max_integrations |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED |
| Date identified | 2026-10-06 |
| Reporter / role | Architect review / ChatGPT |
| Finding | The organisation integration POST handler enforced max_integrations for the explicit enable action but the connect path also implicitly enabled the organisation grant without performing the same count check. A tenant at its plan limit could therefore bypass the configured integration-count entitlement by connecting a previously disabled integration directly. |
| Evidence | [architect-verified] Source review of src/app/api/orgs/[orgId]/integrations/route.ts showed plan entitlement was checked for connect, but the integration-count check existed only in the enable/disable branch. |
| Affected commit | 60a7a47d6238b541588bc814cdc9c6df3f6c9dc7 |
| Affected files/areas | Organisation integration POST control plane |
| Acceptance criterion affected | I-2 plan-based integration access control |
| Security / tenancy impact | Plan-entitlement bypass; bounded tenant control-plane correctness issue |
| Correction required | Enforce the same organisation integration-count limit when connect would implicitly enable a currently-disabled organisation integration; preserve connection creation when the organisation grant is already enabled. |
| Correction scope | src/app/api/orgs/[orgId]/integrations/route.ts and its focused route test |
| Explicit non-scope | No new OAuth transport, no provider rollout, no MCP work, no production promotion, no unrelated billing changes |
| Expected verification | Focused route test plus current-head executable test/typecheck/lint/build evidence |
| Developer correction commit | 846c8d39add3430a5014c5573b3cc4d5ad86ee37 + test 354e57f9fb658267f1667c1eec8b5dfbd63023ad |
| Architect review status | RESOLVED — source correction reviewed by ChatGPT |
| Resolution evidence | [architect-verified] The connect path now checks whether the organisation grant is already enabled; when it would consume a new slot it enforces max_integrations, while preserving direct connection for an already-enabled grant. A focused regression test covers the limit-bypass case. Executable Gate-C evidence remains pending separately. |
| Resolution date | 2026-10-06 |
| Related decision | D-032 |
| Related worklog/session | 2026-10-06 I-047 owner continuation |


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

> New issues from Phase 6 onward (next sequential ID: **I-017**) are appended here, each using the full canonical schema (§"Issue-control system" §3 above), one `### I-NNN — title` heading per record, with lifecycle status updated **only** through valid architect/developer transitions (§2) and every status change carrying dated evidence. The first record below is **I-013** — opened 2026-10-01 by the architect's review of the Phase 6 implementation (corrective handoff CH-001) and **resolved 2026-10-01 by the architect's re-review `PASS`** (disposition `RESOLVED`, recorded per the Phase 6 closure handoff — the first completed correction cycle under this system); the Phase 6 implementation itself surfaced no defects, and the pre-existing entries I-001…I-012 are unchanged as recorded above. **I-014** was opened 2026-10-02 by the developer during the Phase 7 planning investigation (a discovered out-of-scope finding, reported per the out-of-scope-discovery rule — not corrected, not resolved). **I-015** was opened 2026-10-02 by the developer during the Phase 7-A implementation validation (a discovered out-of-scope environmental/dependency-lockfile finding, reported per the same rule — not corrected, not resolved; explicitly kept OPEN by the CH-002 corrective handoff). **I-016** was opened 2026-10-02 by the architect's review of the Phase 7-A implementation (corrective handoff CH-002 — the two fail-closed boundary defects) and **resolved 2026-10-02 by the architect's re-review `PASS`** (disposition `RESOLVED`, recorded per the Phase 7-A closure handoff — the second completed correction cycle under this system; sub-phase 7-A closed by that `PASS` while Phase 7 remains `IN_PROGRESS`). **I-017 was closed-confirmed 2026-10-04: the architect's independent closure review of the acceptance-redefined Phase 7-B state returned `PASS` — Phase 7-B `PASS — CLOSED` under D-023 (the issue stands `RESOLVED` exactly as dispositioned; the F-7B-02/F-7B-01 resolution distinction preserved; I-014/I-015 remain OPEN).** Records appear below only when an actual finding exists — no defects are invented.

### I-013 — Phase 6 P2/P3 closure policy contained a P2/P3 exception path contradicting the Phase 5 closure-eligibility contract (R6)

| Field | Value |
|---|---|
| Issue ID | I-013 |
| Title | Phase 6 P2/P3 closure policy contained a P2/P3 exception path contradicting the Phase 5 closure-eligibility contract (R6) |
| Phase | Phase 6 — Correction and Issue-Control Workflow (the issue-control system this phase established) |
| Severity | P1 (architect-assigned at triage, 2026-10-01 — a governance-contract correctness problem affecting phase-closure semantics; deliberately not classified P0 merely because it blocks Phase 6) |
| Status | `RESOLVED` (lifecycle: `OPEN` → `TRIAGED` → `CORRECTION_REQUIRED` [architect, 2026-10-01, per the corrective handoff CH-001] → `CORRECTION_IN_PROGRESS` → `CORRECTION_SUBMITTED` → `REVIEW_PENDING` [developer registration, 2026-10-01] → `RESOLVED` [architect, 2026-10-01 — the architect's re-review of the correction returned `PASS`, as communicated in the Phase 6 closure handoff; terminal success state]) |
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
| Developer correction commit | `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884` — `docs: correct phase 6 p2 p3 closure policy`, the immediate child of `c0cca964064286c25dcf22c8f86038baaacd7ebe` on `feature/ai-core-from-doable-source` (documentation-only; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`). **This is the reviewed correction — architect-verified by the `PASS` re-review (2026-10-01)** [developer-reported commit; architect-verified by review as communicated in the Phase 6 closure handoff; Git-verifiable] |
| Architect review status | Re-review **occurred 2026-10-01 — outcome `PASS`**: the architect's independent re-review of the correction, as communicated in the Phase 6 closure handoff (reviewed correction commit `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; architect ChatGPT; issue I-013 disposition `RESOLVED`). The `PASS` outcome closed Phase 6 [architect-verified — as communicated by ChatGPT in the Phase 6 closure handoff; no repository commands are claimed on ChatGPT's behalf] |
| Resolution evidence | [architect-verified] The architect's re-review of the correction, as communicated in the Phase 6 closure handoff (2026-10-01): reviewed correction commit `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; architect outcome **`PASS`**; issue I-013 disposition **`RESOLVED`**; the P2/P3 contradiction is resolved; Phase 6 introduces no P2/P3 exception mechanism; the existing P0/P1 semantics are preserved; the correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe` is preserved; Phase 6 set `CLOSED` by the `PASS`; Phase 7 `NOT STARTED`. The corrected canonical rule stands in the repository: `ISSUES.md` §1 (P2/P3 rows), the `VERIFICATION_STATE.md` R6 mapping, the `CURRENT_PHASE.md` severity-model summary, and the corrected deterministic `verification/correction-cycle-test.sh` (24/24 determinations correct, exit 0 — including the rejection of an unresolved acceptance-violating P2/P3 with an alleged architect-approved exception; Phase 5 regression 8/8 with P0 present → FAIL) [architect-verified disposition as communicated in the Phase 6 closure handoff; the repository state is Git-verifiable; no repository commands are claimed on ChatGPT's behalf] |
| Resolution date | 2026-10-01 (the architect's re-review as communicated in the Phase 6 closure handoff; the handoff supplies no separate review timestamp, and none is fabricated) |
| Related decision | none — no `DECISIONS.md` reference applies: the P1 exception mechanism is not invoked, Phase 6 introduces no P2/P3 exception mechanism, and no exception is recorded for this issue |
| Related worklog/session | `worklog.md` Phase 6 entry (the appended corrective-cycle note, 2026-10-01) + the Phase 6 closure entry (appended by the closure-record commit); `docs/project-control/sessions/SESSION-009.md` (the Phase 6 correction session record) and `docs/project-control/sessions/SESSION-010.md` (the Phase 6 closure-record session); `VERIFICATION_STATE.md` §Phase 6 (the corrective-cycle records, the architect review trail, and the closure record) |

### I-014 — Vendored Doable-source library in Clara is incomplete relative to its own immutable manifest (mcp-servers family absent), and the library extraction verifier cannot run in-place in the Clara layout

| Field | Value |
|---|---|
| Issue ID | I-014 |
| Title | Vendored Doable-source library in Clara is incomplete relative to its own immutable manifest (the `mcp-servers/` second-pass family is absent while the capability catalog still describes it), and the library's extraction verifier cannot run in-place in the Clara repository layout |
| Phase | Phase 7 — AI Platform Core Foundation (planning stage — discovered during the pre-implementation baseline verification); the defect itself originates in the pre-program vendoring commits (`03482584` / `e7a5f15c`, 2026-09-30) |
| Severity | not yet assigned — awaiting architect triage (developer-proposed: **P2** — a real but bounded completeness/evidence gap: every present pinned file is byte-verified against the Doable baseline, so no silent source corruption is indicated; the gap blocks only the `mcp-servers`-dependent capabilities, none of which is proposed for Phase 7) |
| Status | `OPEN` (awaiting architect triage; no correction or resolution authorized) |
| Date identified | 2026-10-02 |
| Reporter / role | Z.AI — developer self-discovery during the Phase 7 planning investigation (extraction-verifier run mandated by the planning handoff's immutable-source verification) |
| Finding | (1) The vendored library at `docs/doable-source/` does not contain the `doable-source/mcp-servers/` second-pass source family (8 directories: `_shared`, `image-generator`, `markdown-builder`, `notebooklm` (+ `notebooklm/server`), `pdf-builder`, `presentation-builder`, `spreadsheet-builder`) — 31 files pinned in `verification/immutable-source-manifest.json` are absent — while the library's own catalog/manifests still describe the dependent capabilities (`mcp-tool-servers`, `document-builders`, `notebooklm`, `ai-media-builders`), and `external-dependencies/source-manifests/` contains only 2 of the mcp-servers package manifests. (2) The library's extraction verifier (`verification/verify-extraction.mjs`) resolves its root as `<cwd>/ai-platform-core` and queries `HEAD:ai-platform-core/<rel>` in the current git repo — in the Clara layout (library at `docs/doable-source/`) an in-place run produces systematic false negatives (`actual: null`), and copying from the worktree picks up environment file modes (755 vs committed 100644) that break tree-SHA checks; a scratch-checkout harness is required. (3) The committed `verification/completeness-report.json` describes the source library's state ("802/802 immutable files … 0 missing baseline files"; status `SECURITY_EXTENSION_ADDED_LOCAL_VERIFIER_REQUIRED`) and therefore does not describe the Clara vendored copy, where 771/802 pinned files are present |
| Evidence | [developer-reported, re-runnable] Scratch-harness verifier run at `3657035a` (`/home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh`, persisted agent-workspace script materializing a scratch git repo from the committed tree via `git archive`): **771/771 present pinned files byte-identical** to the Doable baseline `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`; all 31 file failures + 10 failing captured root trees + all `capabilityClosure` invalidRefs confined to the absent `mcp-servers/` paths (notebooklm/document-builders/mcp-tool-servers/ai-media-builders runtime refs); `requiredFiles`/`packageHardening`/`externalDependencyInventory`/`uiReferenceFiles` PASS; `node docs/doable-source/verification/validate-library.mjs` → PASS (catalog/manifests/graph internally consistent — the metadata does not flag the absence); `git ls-tree -r --name-only 3657035a docs/doable-source/ | rg mcp-servers` → only the 2 source-manifest stubs; `ls docs/doable-source/doable-source/mcp-servers` → No such file or directory; `git diff 03482584..3657035a` on the immutable trees → empty (no drift since vendoring; the absence is original to the vendoring, not a later deletion) |
| Affected commit | `03482584` + `e7a5f15c` ("vendor Doable source for AI platform core extraction", 2026-09-30 — the pre-program vendoring commits; ancestry of the current branch) |
| Affected files/areas | `docs/doable-source/doable-source/mcp-servers/**` (absent); `docs/doable-source/capabilities/{mcp-tool-servers,document-builders,notebooklm,ai-media-builders}/MANIFEST.md` (describe absent source); `docs/doable-source/verification/immutable-source-manifest.json` (pins the absent files); `docs/doable-source/verification/completeness-report.json` (describes the source-library state, not the vendored copy); `docs/doable-source/verification/verify-extraction.mjs` (layout assumption — in-place unusable in Clara) |
| Acceptance criterion affected | none for the Phase 7 planning stage — not acceptance-blocking for the planning package (the planning handoff's immutable-source verification was satisfied by the diff-empty check + the harness blob verification of every present file). It **blocks future phases** that would implement `mcp-servers`-dependent capabilities (image generation, document builders, NotebookLM, MCP tool servers) until triaged |
| Security / tenancy impact | none — no application security surface (documentation/reference-library completeness; every present file is byte-verified, so no silent tampering is indicated) |
| Correction required | none yet — awaiting architect triage (the developer does not self-assign corrections). Triage options recorded in `PHASE-7-PLAN.md` §23 item 3: (a) re-vendor the `mcp-servers/` family from the source library (`Rilan-Dev/doable-source`); (b) de-scope the affected capabilities to permanent reference-only; (c) accept the documented gap with the catalog annotated |
| Correction scope | none yet — awaiting architect triage |
| Explicit non-scope | the Phase 7 planning session performed no correction: no re-vendoring, no catalog/manifest edits, no verifier modification, no `completeness-report.json` regeneration (its write side-effect during validation was reverted to keep the tree clean); no change to any immutable tree |
| Expected verification | for whichever triage option the architect directs: (a) re-vendoring — the harness verifier must then report 802/802 present pinned blobs and 93/93 captured root trees; (b)/(c) — the catalog/manifest annotation must keep `validate-library.mjs` PASS; all immutable-source rules (D-007) continue to apply |
| Developer correction commit | none yet — awaiting architect triage |
| Architect review status | pending — no architect review or triage of this issue has occurred |
| Resolution evidence | — (filled only at `RESOLVED`) |
| Resolution date | — |
| Related decision | none yet (a triage decision may later be recorded in `DECISIONS.md` by the architect) |
| Related worklog/session | `worklog.md` Phase 7 planning entry (2026-10-02); `docs/project-control/sessions/SESSION-011.md` (the Phase 7 planning session); `docs/project-control/PHASE-7-PLAN.md` §2 (baseline), §11 (risks), §12 (issue dependencies), §23 (ratification list); `VERIFICATION_STATE.md` §Phase 7 planning (validation row 5) |

### I-015 — `package.json`/`package-lock.json` out of sync (`@vercel/functions` declared but unlocked) and the developer workspace `node_modules` incomplete — the production build cannot run in this workspace without an unauthorized dependency-graph change

> **2026-10-05 verification update:** GitHub Actions run 37192123977 completed npm install --legacy-peer-deps successfully, and the prior @vercel/functions dependency condition disappeared from Type Check. I-015 is resolved for the manifest/lockfile/environment condition; remaining repository-wide typecheck/lint failures are separate pre-existing baseline/reference-tree conditions.

| Field | Value |
|---|---|
| Issue ID | I-015 |
| Title | `package.json` declares `@vercel/functions ^3.9.9` but `package-lock.json` does not contain it (lockfile out of sync with the manifest), and the developer workspace's `node_modules` is incomplete relative to `package.json` (≈106 declared packages absent) — consequently the production `next build` cannot run in the developer workspace without an install that would rewrite the lockfile (a dependency-graph change outside developer authorization) |
| Phase | Phase 7 — AI Platform Core Foundation (sub-phase 7-A — discovered during the implementation validation, at the production-build attempt); the desync itself predates the program (present at the vendoring-era dependency state; not introduced by any project-control commit) |
| Severity | not yet assigned — awaiting architect triage (developer-proposed: **P3** — a real but bounded tooling/environment gap: it blocks only build-attempt evidence in developer workspaces, not the recorded test/typecheck/lint/governance evidence; the repository's declared dependency graph is untouched by Phase 7-A) |
| Status | `RESOLVED` (authorized lockfile reconciliation followed by executable CI verification on 2026-10-04) |
| Date identified | 2026-10-02 |
| Reporter / role | Z.AI — developer self-discovery during the Phase 7-A validation (the handoff §11 "build if applicable" requirement) |
| Finding | (1) `package.json` declares `@vercel/functions ^3.9.9` (used by `src/app/api/voice/sarvam/realtime/route.ts` and `src/app/api/voice/sarvam/tts-realtime/route.ts`) but `package-lock.json` contains no `node_modules/@vercel/functions` entry — the lockfile is out of sync with the manifest (an `npm install` in the workspace reports "added 106 packages, removed 8 packages, and changed 844 packages" — it would rewrite the lockfile). (2) The developer workspace's `node_modules` is incomplete relative to `package.json`: `@vercel/queue`, `@vercel/functions`, `@vercel/analytics`, `@vercel/speed-insights`, `@elevenlabs/client`, `@elevenlabs/elevenlabs-js` (all declared in `package.json`) are absent from the installed tree. (3) Consequences: the production `next build` cannot run in this workspace (webpack module resolution of the declared-but-uninstalled imports fails); 19 of the 24 pre-existing application-code typecheck errors at the 7-A baseline trace to the missing modules (TS2307 "Cannot find module"); `npm ci` cannot complete either (it requires manifest/lockfile sync). None of this affects the vitest suite (108 files / 960 tests pass), the module-scoped lint, the model-config validation, or the governance validators |
| Evidence | [developer-reported, re-runnable] `node -e "require('./package.json')"` → `@vercel/functions ^3.9.9` declared; `node -e "require('./package-lock.json')"` → no `node_modules/@vercel/functions` entry (lockfile v3); `ls node_modules/@vercel/ node_modules/@elevenlabs/` → absent; `npm install --dry-run` → "added 106 packages, removed 8 packages, and changed 844 packages" (lockfile-rewriting); `npm run type-check` at the pre-implementation baseline `ac06ca72` → 24 application-code errors (19 in files importing the missing modules; 5 in `src/modules/ai-platform-core/clara-runtime.ts` — fixed within the 7-A module scope); `npx vitest run` → 108 files / 960 tests all pass (the test suite does not exercise the missing modules) |
| Affected commit | the desync is present in the dependency state inherited at the program baseline (visible at `ac06ca72`; not introduced by any project-control commit — all program commits are documentation-only; the 7-A implementation commit changes no dependency file) |
| Affected files/areas | `package.json` / `package-lock.json` (manifest ↔ lockfile desync — the lockfile lacks `@vercel/functions`); the developer workspace `node_modules` (incomplete install); the build-attempt capability of any developer workspace without a complete install (`next build`); 19 pre-existing application-code typecheck errors in unrelated route/component files |
| Acceptance criterion affected | none of the 7-A acceptance criteria — the 7-A deliverable adds zero dependencies and requires no build to function; the finding blocks only the optional "build if applicable" evidence item (handoff §11 D), which is recorded as not-runnable with this pre-existing cause. It may affect future phases' build-evidence expectations (Gate F runtime/build verification would need a synchronized install — an architect-controlled dependency-graph decision) |
| Security / tenancy impact | none — a tooling/environmental finding; no application security surface; no secrets involved; the repository's declared dependency graph is unchanged by the finding's discovery |
| Correction required | none yet — awaiting architect triage (the developer does not self-assign corrections, and the correction itself — regenerating/synchronizing the lockfile or completing the workspace install — is a dependency-graph operation outside the 7-A authorization) |
| Correction scope | none yet — awaiting architect triage |
| Explicit non-scope | the Phase 7-A session performed no correction: no `npm install` (lockfile-neutral or otherwise), no `npm ci`, no `package.json`/`package-lock.json` modification, no dependency addition or removal; the 7-A implementation ships with zero dependency changes (verified by the changed-path scope check) |
| Expected verification | for whichever triage option the architect directs: (a) synchronize the lockfile to the manifest (`npm install` committed by an authorized operator) — then `node -e` confirms the `@vercel/functions` lockfile entry exists and `npm ci` completes; (b) accept the documented gap — build evidence remains unavailable in developer workspaces and Gate F build/runtime verification relies on the deployment controller (D-004); either way the 7-A validation record (tests/typecheck/lint/governance/immutable-source) stands as recorded |
| Developer correction commit | none yet — awaiting architect triage |
| Architect review status | pending — no architect review or triage of this issue has occurred |
| Resolution evidence | — (filled only at `RESOLVED`) |
| Resolution date | — |
| Related decision | none yet (a triage decision may later be recorded in `DECISIONS.md` by the architect; interacts with D-004/D-005 operations authority for build/deployment verification) |
| Related worklog/session | `worklog.md` Phase 7-A implementation entry (2026-10-02); `docs/project-control/sessions/SESSION-012.md` (the Phase 7-A implementation session); `VERIFICATION_STATE.md` §Phase 7-A implementation (validation row 11); `ZAI_HANDOFF.md` Part II (the 7-A instance — testing-requirements row 11) |



### I-016 — Phase 7-A ExecutionContext provenance boundary and adapter-registry immutability boundary were incomplete (a frozen structural lookalike could satisfy the context validator; the committed adapter set was frozen only shallowly)

| Field | Value |
|---|---|
| Issue ID | I-016 |
| Title | Phase 7-A ExecutionContext provenance boundary and adapter-registry immutability boundary were incomplete: `isValidPlatformExecutionContext` accepted any frozen structural lookalike (provenance not demonstrable), and the adapter registry froze only the slot container so the registered adapter objects remained mutable through the original references supplied to `register()` |
| Phase | Phase 7 — AI Platform Core Foundation (sub-phase 7-A — Host Contracts / Adapter Foundation; discovered by the architect's review of the 7-A implementation) |
| Severity | not assigned in the corrective handoff — awaiting architect triage at re-review (developer observation, not a self-assigned label: the defects violate 7-A acceptance criteria 2 and 3 and are therefore closure-blocking while unresolved under the R6 severity model regardless of the eventual P-label; they are fail-closed trust-boundary defects, not cosmetic) |
| Status | `RESOLVED` (lifecycle: `OPEN` → `TRIAGED` → `CORRECTION_REQUIRED` [architect, 2026-10-02, per the corrective handoff CH-002] → `CORRECTION_IN_PROGRESS` → `CORRECTION_SUBMITTED` → `REVIEW_PENDING` [developer registration, 2026-10-02] → `RESOLVED` [architect, 2026-10-02 — the architect's re-review of the correction returned `PASS`, as communicated in the Phase 7-A closure handoff; terminal success state]) |
| Date identified | 2026-10-02 |
| Reporter / role | ChatGPT — architect review of the Phase 7-A implementation (reviewed commit `688070a5fcda04dfce6c971b79322aed34adb4a0`; outcome `CORRECTION_REQUIRED`) |
| Finding | Two fail-closed boundary defects in the delivered 7-A foundation. (1) **ExecutionContext provenance**: the implementation claimed that only contexts produced by `createExecutionContext()` are accepted, but the validator (`isValidPlatformExecutionContext`) checked only structural validity plus `Object.isFrozen()` — a malicious or accidental caller could independently construct and freeze an equivalent object and it would be accepted (the corrective handoff's example: `Object.freeze({ tenantId, kbId, surface })`). A valid platform execution context must be demonstrably produced through the sanctioned factory. (2) **Adapter registry immutability**: the registry committed with `committed = Object.freeze({ ...adapters })` — freezing only the adapter-slot container while the registered adapter objects remained mutable through the original references supplied to `register()` (the handoff's example: after `registry.register(adapters)`, `adapters.provider.resolveModel = hostileImplementation` still altered the registry's provider slot behavior). Once registered, the slot bindings must not be replaceable, the adapter objects must not be mutable through external references, and the registry must continue using the exact validated implementation that was committed |
| Evidence | [architect-verified] The architect's corrective handoff on the Phase 7-A implementation (2026-10-02; review outcome `CORRECTION_REQUIRED`; reviewed commit `688070a5fcda04dfce6c971b79322aed34adb4a0`) — §2 Correction A and §4 Correction B. [developer-reported, Git-verifiable] The delivered code at `688070a5`: `src/modules/ai-platform-core/execution-context.ts` `isValidPlatformExecutionContext` (structural checks + `Object.isFrozen` only — no provenance mechanism); `src/modules/ai-platform-core/adapter-registry.ts` `register()` (`committed = Object.freeze({ ...adapters })` — shallow container freeze; the slot values keep the caller's original mutable object references) |
| Affected commit | `688070a5fcda04dfce6c971b79322aed34adb4a0` — "feat: establish phase 7-a host contracts and adapter foundation" (the Phase 7-A implementation commit) |
| Affected files/areas | `src/modules/ai-platform-core/execution-context.ts` (`isValidPlatformExecutionContext` / `assertExecutionContext` — the platform-context trust boundary); `src/modules/ai-platform-core/adapter-registry.ts` (`register()` — the committed-adapter immutability boundary); their colocated test files (the proofs of the corrected properties) |
| Acceptance criterion affected | Phase 7-A acceptance criteria 2 and 3 (CURRENT_PHASE.md / ZAI_HANDOFF.md Part II at the implementation instance): criterion 2 — "The ExecutionContext factory is fail-closed (…) and is the only sanctioned production path"; criterion 3 — "The adapter registry is fail-closed (… duplicate rejected; committed set frozen)". A frozen lookalike satisfying the validator contradicts "the only sanctioned production path"; a mutable committed adapter object contradicts the intended immutable/fail-closed registration boundary the criterion describes. The handoff's security constraint ("the 7-A boundary fails closed") is implicated for both |
| Security / tenancy impact | Real trust-boundary exposure in the delivered code, with no production exposure realized: the seam is new in 7-A, is not yet consumed by any production route (module README: existing routes intentionally unchanged), and no caller currently constructs lookalike contexts or mutates registered adapters. Defect (1) would have allowed any server-side code able to construct a frozen object to mint a "valid" tenant-scoped context without the factory's validation discipline (typo guard; blank checks); defect (2) would have allowed post-registration substitution of committed adapter behavior (e.g. swapping `provider.resolveModel` or co-opting `secrets.get`) through the original references |
| Correction required | (from the corrective handoff CH-002 §2/§4) **Correction A** — a valid platform execution context must be demonstrably produced through the sanctioned factory, using an appropriate private provenance mechanism (a module-private `WeakSet` of factory-created contexts or an equivalently robust mechanism); the mechanism must not be exposed publicly, must not use a mutable public marker property, and must not rely solely on `Object.isFrozen`, an exposed symbol, a magic metadata field, or structural equality; the existing tenant/kb/surface validation must remain; the returned context must remain immutable. **Correction B** — once registered: the slot bindings cannot be replaced; the adapter objects cannot be mutated through external references; the registry continues using the exact validated implementation committed; failed registration leaves the registry unchanged; duplicate registration still fails deterministically; minimal implementation, no large abstraction |
| Correction scope | `src/modules/ai-platform-core/execution-context.ts` (the module-private provenance WeakSet + the corrected validator); `src/modules/ai-platform-core/adapter-registry.ts` (in-place deep freeze of the committed adapter objects at commit time); `src/modules/ai-platform-core/execution-context.test.ts` and `src/modules/ai-platform-core/adapter-registry.test.ts` (the focused tests proving corrections A1–A5 and B1–B5); `src/modules/ai-platform-core/README.md` (the boundary documentation updated to the corrected semantics); the governance evidence recording the correction (`ISSUES.md` this record; `ZAI_HANDOFF.md` Part II → the CH-002 instance; `VERIFICATION_STATE.md` §Phase 7-A correction; `CURRENT_PHASE.md`/`PROJECT_STATE.md`/`NEXT_ACTION.md` current-state reconciliation; the append-only `worklog.md` entry; `SESSION-013.md` + its index row) |
| Explicit non-scope | No 7-B (Unified Tool Runtime; tool definitions/schemas/registry/invocation lifecycle; `rag_search` migration); no 7-C (provider tool calling; agentic loop); no MCP; no integrations; no database/schema/migrations; no Supabase; no deployment; no `vercel.json`; no immutable Doable source; no I-014 resolution; no I-015 resolution; no `package-lock.json` repair; no dependency install that rewrites the dependency graph; no unrelated refactoring; no `ai-core` redesign; no Phase 8; no architecture change beyond the two corrected boundaries (the seam/adapter/provider architecture is unchanged) |
| Expected verification | `npx vitest run src/modules/ai-platform-core/` → the complete 7-A suite passes (including the new A1–A5 and B1–B5 proofs); `npx vitest run` → full regression passes; the existing 7-A lint command clean; the existing typecheck with the exact before/after count reported (the 19 pre-existing application-code errors unchanged — NOT claimed fixed); `bash docs/project-control/verification/phase-closure-eligibility-test.sh` and `bash docs/project-control/verification/correction-cycle-test.sh` and `npm run validate:model-config` pass; the immutable-source verification re-run (four trees unchanged; 771/771 present pinned files byte-identical; the 31 absent files confined to `mcp-servers/`; I-014 OPEN); the correction diff scope-checked to only `src/modules/ai-platform-core/**` + `docs/project-control/**` + `worklog.md` |
| Developer correction commit | `577189d4963121a64a696c59bd3fb16dacb3b61d` — `fix: harden phase 7-a execution context and adapter boundaries`, the immediate child of `688070a5fcda04dfce6c971b79322aed34adb4a0` on `feature/ai-core-from-doable-source` (application changes confined to `src/modules/ai-platform-core/**`; documentation changes confined to the repository-root `worklog.md` and `docs/project-control/**`). **This is the reviewed correction — architect-verified by the `PASS` re-review (2026-10-02)** [developer-reported commit; architect-verified by review as communicated in the Phase 7-A closure handoff; Git-verifiable] |
| Architect review status | Re-review **occurred 2026-10-02 — outcome `PASS`**: the architect's independent re-review of the correction, as communicated in the Phase 7-A closure handoff (reviewed correction commit `577189d4963121a64a696c59bd3fb16dacb3b61d`; architect ChatGPT; issue I-016 disposition `RESOLVED`; sub-phase 7-A closed by that `PASS` while Phase 7 remains `IN_PROGRESS` and 7-B/7-C remain NOT AUTHORIZED). The architect explicitly reviewed and accepted: the ExecutionContext provenance hardening (private `WeakSet` identity provenance), the adapter-registry committed-adapter immutability, the correction regression coverage, the correction scope with the immutable Doable source preserved, and the preservation of I-014 and I-015 as open issues [architect-verified — as communicated by ChatGPT in the Phase 7-A closure handoff; no repository commands are claimed on ChatGPT's behalf] |
| Resolution evidence | [architect-verified] The architect's re-review of the correction, as communicated in the Phase 7-A closure handoff (2026-10-02): reviewed correction commit `577189d4963121a64a696c59bd3fb16dacb3b61d`; architect outcome **`PASS`** — for the Phase 7-A correction only (no further architect approval is claimed or fabricated); issue I-016 disposition **`RESOLVED`**. The two corrected defects are verified resolved: (1) the **ExecutionContext provenance boundary correction** — the private `WeakSet` identity provenance makes only demonstrably factory-produced contexts valid (the frozen structural lookalike is rejected; the module-private mechanism is not publicly exposed); (2) the **adapter-registry immutability correction** — the committed adapter set is deeply immutable (post-registration mutation through the original external references cannot alter committed behavior). **Regression evidence verified**: the correction regression coverage (the A1–A5 and B1–B5 focused proofs; the full module suite 53/53; the full regression suite 108 files / 970 tests) and the correction scope with the immutable Doable source preserved. The architect's review also observed a successful Vercel status associated with `577189d4` — an observed external deployment status only, NOT a Phase 7 deployment authorization and NOT Gate F completion (Gate F remains not-executed as a verification gate; D-P4 remains `PENDING`; deployment applicability remains governed by the Phase 7 plan). I-014 and I-015 explicitly remain OPEN per the architect's accepted review. The architect's first review of the 7-A implementation (2026-10-02; reviewed commit `688070a5`; outcome `CORRECTION_REQUIRED`; corrective handoff CH-002) and the correction delivery are preserved unrewritten above — the full auditable cycle: 7-A implementation → architect `CORRECTION_REQUIRED` → CH-002 correction → correction commit `577189d4` → architect `PASS` → 7-A closure [architect-verified disposition as communicated in the Phase 7-A closure handoff; the repository state is Git-verifiable; no repository commands are claimed on ChatGPT's behalf] |
| Resolution date | 2026-10-02 (the architect's re-review as communicated in the Phase 7-A closure handoff; the handoff supplies no separate review timestamp, and none is fabricated — the closure-record commit date is repository-derived) |
| Related decision | none — no `DECISIONS.md` reference applies (the correction implements the architect's already-communicated requirements; no new architectural decision was made by the developer; the resolution likewise enacts the architect's communicated re-review disposition — no new decision is invented) |
| Related worklog/session | `worklog.md` Phase 7-A correction entry (2026-10-02) + the Phase 7-A closure entry (appended by the closure-record commit); `docs/project-control/sessions/SESSION-013.md` (the correction session record) and `docs/project-control/sessions/SESSION-014.md` (the closure-record session); `VERIFICATION_STATE.md` §Phase 7-A correction + §Phase 7-A closure (the architect review trail and the closure record); `ZAI_HANDOFF.md` Part II (the CH-002 corrective-handoff instance with its closure record); `CURRENT_PHASE.md` closure-stage record |



### I-017 — Phase 7-B production Clara metering binding did not land on the existing org-scoped spine, and the invalid-context metering contract was stronger than the implementation (F-7B-01 / F-7B-02)

| Field | Value |
|---|---|
| Issue ID | I-017 |
| Title | The Phase 7-B Unified Tool Runtime's production Clara metering binding (`buildClaraToolMeteringHook()`) only performed structured `console.info` — it did not satisfy the reviewed requirement that per-invocation tool metering land on the existing org-scoped usage/analytics spine (F-7B-01); and the tool-registry metering contract documentation claimed the hook is invoked for every boundary refusal while `invoke()` returns INVALID_CONTEXT for a provenance-invalid context BEFORE a tenant-scoped `ToolMeteringRecord` can safely be constructed (F-7B-02) |
| Phase | Phase 7 — AI Platform Core Foundation (sub-phase 7-B — Unified Tool Runtime; discovered by the architect's review of the 7-B implementation) |
| Severity | not assigned in the corrective handoff — awaiting architect triage at re-review (developer observation, not a self-assigned label: F-7B-01 violates the reviewed Phase 7 plan's acceptance criterion §19(4) "per-invocation usage metering lands on the existing org-scoped spine" and §19(19) "tool invocations are observable via existing usage/analytics surfaces", and is therefore acceptance-violating and closure-blocking while unresolved under the R6 severity model regardless of the eventual P-label) |
| Status | `RESOLVED` (lifecycle: `OPEN` → `TRIAGED` → `CORRECTION_REQUIRED` [architect, 2026-10-03, per the corrective handoff CH-003] → `CORRECTION_IN_PROGRESS` → `CORRECTION_SUBMITTED` [developer registration, 2026-10-03] → `CORRECTION_REQUIRED` [architect re-review, 2026-10-04, per the decision-analysis handoff AH-004 — F-7B-02 `RESOLVED`; F-7B-01 `OPEN / BLOCKING`] → **`RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION`** [architect, 2026-10-04, per the Option A decision-recording handoff — D-023: F-7B-02 resolved by implementation correction; F-7B-01 resolved by architect-authorized acceptance redefinition — NOT by a claim that the original usage-spine requirement was technically satisfied]) |
| Date identified | 2026-10-03 |
| Reporter / role | ChatGPT — architect review of the Phase 7-B implementation (reviewed commit `63bccded2c61d29ba1a2218cf654bd3901ba6940`; outcome `CORRECTION_REQUIRED`) |
| Finding | Two metering defects in the delivered 7-B runtime. **(1) F-7B-01 — the production metering binding:** the generic `ToolMeteringHook` abstraction and the runtime's invocation of it were acceptable, but the Clara production binding only performed structured `console.info(...)` — its own test confirmed "the default Clara metering hook completes without writing" — which did not satisfy the reviewed requirement that tool invocation metering land on the existing org-scoped spine / remain observable through existing usage/analytics infrastructure. **(2) F-7B-02 — the contract/documentation inconsistency:** the tool-registry documentation said the metering hook is invoked for success, typed failure, and boundary refusal, but `invoke()` returns immediately with INVALID_CONTEXT for an invalid/untrusted `PlatformExecutionContext` before a tenant-scoped `ToolMeteringRecord` can safely be constructed — a legitimate security boundary that must NOT be weakened, but the contract as documented was internally inconsistent |
| Evidence | [architect-verified] The architect's corrective handoff on the Phase 7-B implementation (2026-10-03; review outcome `CORRECTION_REQUIRED`; reviewed commit `63bccded2c61d29ba1a2218cf654bd3901ba6940`) — §2 Finding F-7B-01 and §3 Finding F-7B-02, including the quoted implementation's own test ("the default Clara metering hook completes without writing") and the quoted `admission: "external"` incumbent contract. [developer-reported, Git-verifiable] The delivered code at `63bccded`: `src/modules/ai-platform-core/clara-tools.ts` `buildClaraToolMeteringHook()` (console.info only); `src/modules/ai-platform-core/tool-contracts.ts` `ToolMeteringHook` documentation ("invokes it exactly once per invocation attempt (success, typed failure, or boundary refusal)"); `src/modules/ai-platform-core/tool-registry.ts` `invoke()` (the INVALID_CONTEXT early return before any metering call) |
| Affected commit | `63bccded2c61d29ba1a2218cf654bd3901ba6940` — "feat: implement phase 7-b unified tool runtime" (the Phase 7-B implementation commit; NOT rewritten — the correction is delivered as a new focused commit) |
| Affected files/areas | `src/modules/ai-platform-core/clara-tools.ts` (the default Clara metering hook — the F-7B-01 binding); `src/modules/ai-platform-core/tool-contracts.ts` and `src/modules/ai-platform-core/tool-registry.ts` (the metering contract documentation — F-7B-02); `src/modules/ai-platform-core/clara-tools.test.ts` and `src/modules/ai-platform-core/tool-registry.test.ts` (the correction proofs) |
| Acceptance criterion affected | The reviewed Phase 7 plan §19 criterion (4) "per-invocation usage metering lands on the existing org-scoped spine"; §19 criterion (19) "tool invocations are observable via existing usage/analytics surfaces"; the 7-B handoff acceptance rows for metering ("the metering hook binding"; "metering hooks emit correctly scoped usage events"); and the internal contract consistency required of the runtime documentation (F-7B-02) |
| Security / tenancy impact | No production exposure realized: the delivered console-only hook wrote nothing (no billing impact, no tenant-data exposure), and the INVALID_CONTEXT early return is itself the correct fail-closed behavior (untrusted contexts never reached metering). The defects are acceptance-compliance defects (missing spine binding; overstated documentation), not realized security regressions. The correction preserves every fail-closed property: no ambient/default tenant, no inferred tenant identity, `assertExecutionContext()` unchanged, forged contexts still rejected, no raw credentials or secrets crossing the tool boundary |
| Correction required | (from the corrective handoff CH-003) **F-7B-01** — inspect the existing Clara metering infrastructure and determine the correct existing helper/path for recording a tool invocation without creating a new billing architecture or schema; reuse the existing infrastructure; preserve org/tenant scoping; preserve the `usage_events`/`query_events` vocabulary and constraints; make the metering hook actually bind to the existing spine; avoid double-billing `rag_search` (do NOT blindly insert a second billing/query event); if the existing schema/helpers cannot represent a distinct tool invocation without a migration, STOP and report that exact blocker rather than creating a new schema or inventing a new event kind; no database migration, no schema modification, no new billing system. **F-7B-02** — make the contract internally consistent: explicitly document that a provenance-invalid context is rejected before tenant-scoped metering; do not invoke the tenant-scoped metering hook using an untrusted context; ensure the documentation no longer claims every invalid-context boundary refusal produces a normal scoped metering record; add a regression test proving invalid context is rejected and no untrusted tenant data is passed into the metering hook; do NOT create an ambient/default tenant, do NOT infer tenant identity, do NOT weaken `assertExecutionContext()`, do NOT accept forged contexts |
| Correction scope | `src/modules/ai-platform-core/tool-contracts.ts`; `src/modules/ai-platform-core/tool-registry.ts`; `src/modules/ai-platform-core/clara-tools.ts`; `src/modules/ai-platform-core/clara-tools.test.ts`; `src/modules/ai-platform-core/tool-registry.test.ts`; plus the required governance records (`worklog.md`; `docs/project-control/VERIFICATION_STATE.md`; `docs/project-control/ISSUES.md` (this record); `docs/project-control/NEXT_ACTION.md`; `docs/project-control/PROJECT_STATE.md`; `docs/project-control/CURRENT_PHASE.md`; `docs/project-control/ZAI_HANDOFF.md`; `docs/project-control/sessions/*`) |
| Explicit non-scope | `package.json`; `package-lock.json`; `vercel.json`; database migrations; Supabase state; `docs/doable-source/**`; the immutable/reference trees; the `clara-core` extraction snapshots (including the stale `clara-runtime.ts` snapshot — NOT refreshed); provider implementations; voice providers; chat routes; realtime routes; embed routes; MCP; integrations; agent runtime; provider tool calling; agentic loops; I-014 remediation; I-015 remediation; D-P2; D-P4; the `rag_search` retrieval implementation (the executor continues to call the incumbent `claraRuntime.retrieve` with the same orgId/agentId/kbId/userId/sessionId/query/ragMode/channel: "voice"); the existing `admission: "external"` behavior |
| Expected verification | `npx vitest run src/modules/ai-platform-core/` → ALL PASS (138/138: the 131 baseline − 1 superseded default-hook test + 8 new correction proofs); `npx vitest run` → ALL PASS (110 files / 1055 tests); `npm run type-check` → the 19 pre-existing `src/**` application errors unchanged (I-015 NOT claimed fixed; zero errors in the changed files; the extraction/reference-tree errors separately reported); `npx eslint src/modules/ai-platform-core/` → 0 errors 0 warnings; the governance validators (phase-closure-eligibility 8/8; correction-cycle 24/24; model-config PASS); library integrity PASS; the immutable-source verification (802 pinned / 771 present / 771/771 byte-verified / 0 mismatches / 31 absent confined to `mcp-servers/` only; the four tree identities `a42aee79`/`ee07c362`/`b76b8f34`/`54606204`; `vercel.json` = `3f26d343`); the secret scan over all changed paths; the runtime import scan (no runtime imports from the immutable/reference tree) |
| Developer correction commit | `4413bc83d76588f42e2cd0b669dd882566824238` — `fix: bind phase 7-b tool metering to existing clara audit spine`, the immediate child of `74200beca21fb2b15817fe2471dc86929316cd48` on `feature/ai-core-from-doable-source`; application changes confined to `src/modules/ai-platform-core/**` (5 modified files); documentation changes confined to the repository-root `worklog.md` and `docs/project-control/**`; pushed (HEAD == origin == `4413bc83` verified) [developer-reported; re-reviewed by the architect 2026-10-04 — see Architect review status] |
| Decision-analysis evidence | [architect-verified, as communicated in AH-004] The re-review outcome: F-7B-02 `RESOLVED`; F-7B-01 `OPEN / BLOCKING`. [developer-reported, repository-grounded, read-only] The AH-004 exhaustive analysis (2026-10-04; `SESSION-019.md` / `VERIFICATION_STATE.md` §Phase 7-B F-7B-01 representation decision analysis): (1) `query_events` — every row participates in the org rolling-24h quota/accounting model (the `admitQueryEvent` COUNT is unfiltered by status/surface; `getOrgUsageSnapshot.requests_24h` likewise) → an additional row per tool invocation double-bills; (2) `usage_events` — the CHECK kind vocabulary (`EMBEDDING`/`TTS`/`OCR`/`TRANSCRIPTION`/`CONVERSATION`/`TRANSLATION`) contains no TOOL and `model` is NOT NULL with cost from measured facts → representing a tool invocation requires fabricating a model/tokens/cost (an invented usage fact) or a migration; (3) `audit_logs` — operational/security telemetry with **zero application readers** (no SELECT anywhere in `src/`; no API route; no UI; invisible to every usage/analytics surface) → observability, not usage metering; (4) the exhaustive tool-usage representation search → **NO EXISTING TOOL-USAGE REPRESENTATION FOUND** (candidates examined and excluded: `elevenlabs_webhook_nonces`, `api_key_usage`, `event_outbox`, `platform_events`, `platform_ai_provider_usage`, `elevenlabs_conversations`; the full 73-table migrations inventory swept; the Doable reference `ai_usage_log.tool_call_count`/`043_chat_traces` schemas are immutable reference material for later phases only); (5) the rag_search accounting trace confirmed the incumbent `admission: "external"` contract (the owning turn owns the single query event) and that the current audit binding changes no billing/accounting. **Determination (Outcome C): F-7B-01 cannot be satisfied under the current no-schema-change/no-new-billing-architecture constraint.** A neutral four-option decision table (A keep audit-only tool telemetry / B extend the usage spine to support tool events / C extend query analytics semantics / D redefine the Phase 7-B metering acceptance) is recorded in `VERIFICATION_STATE.md` — no winner selected; no acceptance criterion changed by the developer |
| Architect review status | **Re-review completed 2026-10-04 (as communicated in the decision-analysis handoff AH-004): `CORRECTION_REQUIRED`** — F-7B-02 **`RESOLVED`** (the invalid-context metering contract now internally consistent with the fail-closed behavior); F-7B-01 **`OPEN / BLOCKING`** (the audit-spine binding is valid org-scoped audit/observability but does not by itself satisfy the original acceptance criterion requiring per-invocation usage metering through the existing usage/analytics spine). The architect directed the read-only representation decision analysis (executed 2026-10-04 — the Outcome C evidence above), and the decision on F-7B-01's representation was pending with the architect/owner. **Final disposition (2026-10-04, as communicated in the Option A decision-recording handoff — D-023): the architect explicitly selected OPTION A — KEEP AUDIT-ONLY TELEMETRY and formally redefined the Phase 7-B acceptance boundary (tool-invocation observability through the existing org-scoped audit infrastructure; independent billable tool-usage metering explicitly deferred to a future authorized design). F-7B-01 is thereby RESOLVED as an ARCHITECT ACCEPTANCE DISPOSITION, and this issue I-017 is RESOLVED consistently with that disposition.** The resolution is NOT a claim that the original implementation technically satisfied the original usage-spine requirement, and `audit_logs` is NOT described as the usage-metering spine — it remains org-scoped operational/security telemetry (AH-004 stands unrewritten). **Closure confirmation (2026-10-04): the architect's independent closure review of the acceptance-redefined Phase 7-B state at `8d124263fd4405bfaec0060bbabfd580a49e8821` returned `PASS` — Phase 7-B `PASS — CLOSED` under the D-023 / Option A acceptance [architect-verified — ChatGPT performed the independent closure review and returned `PASS`]. This issue remains `RESOLVED` exactly as dispositioned — the resolution distinction preserved unchanged: F-7B-02 = implementation correction; F-7B-01 = architect acceptance redefinition; the historical finding above stands unrewritten; `audit_logs` remains operational observability, NOT the usage-metering spine; first-class billable tool-usage metering remains deferred. The closure resolves neither I-014 nor I-015 — both remain OPEN** |
| Resolution evidence | **[architect-verified — as communicated in the Option A decision-recording handoff, 2026-10-04; recorded as D-023]** The architect's explicit decision: OPTION A — KEEP AUDIT-ONLY TELEMETRY, with the twelve-point decision text (keep the `buildClaraToolMeteringHook()` → `writeAuditLog()` implementation; `tool.invoked`/`tool.denied` = org-scoped observability, not billable usage; no `query_events` inserts; no `TOOL` `usage_events` kind; no migration; no new billing architecture; no `rag_search` accounting change; first-class billable tool-usage metering deferred to a future explicitly authorized phase; the Phase 7-B acceptance formally redefined; F-7B-01 resolvable as an architect-authorized acceptance disposition; I-017 resolvable consistently; 7-B closure only after correct recording and independent validation; Phase 7-C remains NOT AUTHORIZED). **The resolution chain, explicitly distinguished**: F-7B-02 was resolved by implementation correction (the corrective commit `4413bc83` — the invalid-context metering contract made internally consistent; architect re-review confirmed RESOLVED 2026-10-04). F-7B-01 was NOT resolved by discovering a hidden implementation satisfying the original requirement — the AH-004 read-only analysis established (2026-10-04, repository-grounded) that **no compliant existing tool-usage representation exists under the original no-schema-change/no-new-billing-architecture constraints** (`query_events` participates in org quota/request accounting — an additional row per tool invocation would double-bill; `usage_events`' closed CHECK vocabulary + NOT NULL `model` + measured-usage semantics cannot represent a tool invocation; `audit_logs` has zero application readers and is observability, not usage metering). The architect therefore **intentionally redefined the Phase 7-B acceptance boundary** based on that finding: audit-only tool observability is accepted for this phase; first-class billable tool-usage metering is deferred to a future separately authorized design phase. The historical AH-004 analysis and the original finding stand unrewritten. Recorded by the developer as the governance decision record (D-023; the decision-record governance commit — the immediate child of `f7327d7b`); the developer selected nothing — the decision is the architect's |
| Resolution date | 2026-10-04 (the architect's Option A decision communicated in the decision-recording handoff; recorded 2026-10-04) |
| Related decision | **D-023** (`DECISIONS.md` — the F-7B-01 metering representation decision: OPTION A — KEEP AUDIT-ONLY TELEMETRY; the Phase 7-B acceptance boundary formally redefined; architect-authorized acceptance disposition; first-class billable tool-usage metering deferred to a future explicitly authorized design phase) |
| Related worklog/session | `worklog.md` Phase 7-B correction entry (2026-10-03) + the AH-004 decision-analysis entry (2026-10-04) + the architect-decision recording entry (2026-10-04); `docs/project-control/sessions/SESSION-018.md` (the correction session record) + `SESSION-019.md` (the analysis session record) + `SESSION-020.md` (the decision-recording session record); `VERIFICATION_STATE.md` §Phase 7-B correction + §Phase 7-B F-7B-01 representation decision analysis + §Phase 7-B F-7B-01 architect decision record; `DECISIONS.md` D-023; `ZAI_HANDOFF.md` Part II (the decision-record instance; the superseded AH-004 analysis instance recoverable in Git history at `f7327d7b`; the superseded CH-003 instance at `4413bc83`); `CURRENT_PHASE.md` correction-stage record + analysis-stage record + decision-stage record |


## ChatGPT implementation takeover — current authorization and I-015 status (2026-10-04)

D-024 is active: ChatGPT is the implementation owner for the current continuation. The historical Z.AI handoff/STOP records remain historical and are not rewritten. D-026 authorizes bounded I-015 dependency/lockfile remediation. The lockfile reconciliation commit b3ed15acac4de39e1eaff33d40bea9f045ff9c16 is implemented and structurally verified, but I-015 remains OPEN because npm typecheck/test/build execution is not available in the current execution environment. D-027 authorizes only the default-off Phase 7-C provider tool-calling and hard-bounded agentic-loop pilot; D-023 remains binding and no schema, migration, billable tool metering, MCP, integrations or deployment work is authorized.


## 2026-10-04 — I-015 lockfile reconciliation checkpoint

The current branch package metadata now contains the previously missing `@vercel/functions ^3.9.9` root dependency and a matching `node_modules/@vercel/functions` lock entry at 3.9.9 with integrity data and its `@vercel/oidc 3.8.9` dependency; the matching `@vercel/oidc` lock entry is also present. This is sufficient to classify the lockfile metadata itself as reconciled against `package.json`.

I-015 remains **OPEN** because the authoritative plan requires executable npm/typecheck verification after reconciliation, and the current ChatGPT sandbox does not contain the repository checkout and cannot clone GitHub. No typecheck/build PASS is inferred from static lockfile inspection.

> **I-015 resolution evidence — 2026-10-04:** The active `package-lock.json` now contains the declared `@vercel/functions ^3.9.9` root dependency and resolved `3.9.9` package metadata. GitHub Actions run `37192123977` successfully completed `npm install --legacy-peer-deps` and `npm run test -- --run`; the Type Check job no longer reports the previous `@vercel/functions`/missing-dependency application errors. Remaining Type Check failures are confined to the pre-existing extraction/reference trees and unrelated baseline application conditions. I-015 is therefore **RESOLVED** for the manifest/lockfile/environment dependency condition. This does not make the overall Phase 7 verification matrix PASS and does not close the global typecheck/build baseline.

## Current-state reconciliation — 2026-10-04

I-015 current status: RESOLVED for the dependency/lockfile/environment condition. GitHub Actions run 37192496888 successfully completed npm install --legacy-peer-deps, and the previous @vercel/functions missing-dependency cascade is absent from the current Type Check result. The remaining repository-wide TypeScript failures are pre-existing reference/extraction-tree and unrelated baseline findings; they do not reopen I-015.

I-014 remains OPEN because the 31 absent immutable vendored files remain confined to the mcp-servers family. This is outside the authorized Phase 7-C scope and does not block the bounded provider tool-calling/agentic-loop implementation review.

## Current-state reconciliation — 2026-10-04 — post Phase 7-C closure

I-015 remains RESOLVED for the dependency/lockfile condition.

I-014 remains OPEN and outside the closed Phase 7-C scope. Its 31 absent immutable vendored files remain confined to the mcp-servers family. No Phase 7-C acceptance depends on resolving I-014.

## I-014 resolution record — 2026-10-04 — architect PASS

Status: RESOLVED. The previously absent 31 immutable vendored files under docs/doable-source/doable-source/mcp-servers/** were restored directly from authoritative Doable source commit a6036d1fd6dca83c08ee5affa141e5c85e45f5af. The destination Git blob SHA for every one of the 31 manifest entries was independently fetched and matched the SHA pinned in docs/doable-source/verification/immutable-source-manifest.json — 31/31 PASS, 0 mismatches. No previously present immutable file was modified.

The affected family remains reference/immutable source only; no runtime import or product behavior was introduced. The original finding was extraction incompleteness, not missing upstream source. Architect disposition: RESOLVED.


## Current issue-state reconciliation — 2026-10-05

The issue records themselves remain append-only. This addendum reconciles the current summary/header language with the architect-reviewed terminal states:

- **I-014 — RESOLVED (D-029):** the 31 missing mcp-servers files were restored from pinned Doable commit `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`; destination blobs were independently verified 31/31 with 0 mismatches. The restored material remains immutable/reference-only.
- **I-015 — RESOLVED:** the declared `@vercel/functions ^3.9.9` dependency is represented in the lockfile and CI `npm install --legacy-peer-deps` succeeds. This resolves the dependency/lockfile condition; it does not make global Type Check/Lint green.
- **I-016 — RESOLVED:** architect PASS after the fail-closed provenance/adapter corrections.
- **I-017 — RESOLVED:** D-023 architect acceptance disposition plus correction; 7-B closed.
- No Phase 7 P0/P1 blocker remains. [architect-verified]

## I-018 — I-1 contract/test secret-boundary inconsistency

| Field | Value |
|---|---|
| Issue ID | I-018 |
| Title | I-1 contract/test boundary mismatch exposed forbidden generic secret-bearing fields |
| Phase | Integrations I-1 |
| Severity | P1 |
| Status | RESOLVED |
| Date identified | 2026-10-05 |
| Reporter / role | ChatGPT architect review |
| Finding | The I-1 test still constructed the previously removed generic connection `metadata` bag, the `IntegrationExecutionResult.error` contract still exposed a generic `details` bag despite the threat model forbidding arbitrary secret-bearing error details, and the test omitted the result type import. |
| Evidence | [architect-verified] Exact implementation reviewed at `6cd93599b0338105602a655f3bf2529aaba0c7c9`; the inconsistency was directly observable in the contract/test sources. |
| Affected commit | `6cd93599b0338105602a655f3bf2529aaba0c7c9` |
| Affected files/areas | `src/modules/ai-platform-core/integrations/integration-contracts.ts`; `integration-contracts.test.ts` |
| Acceptance criterion affected | I-1 credential/error redaction boundary and executable contract verification |
| Security / tenancy impact | Generic error-detail and metadata bags could have become secret-bearing boundary surfaces if consumed by a future runtime. No runtime integration execution is authorized or present. |
| Correction required | Remove the generic error-detail bag; align the test with explicit connection fields; retain compile-time negative coverage for forbidden metadata; import the result type used by the negative test. |
| Correction scope | The two I-1 contract/test files only |
| Explicit non-scope | No runtime integration execution, persistence, OAuth, credential vault, egress, deployment, billing, MCP, or I-2 work |
| Expected verification | Focused Vitest, strict TypeScript, and ESLint CI execution on the corrected commit |
| Developer correction commit | `b13e74487a5874b8b070da8ade97963e3f63f0d5`; `bfc40f671aea218def571c617f00789e15b45823` |
| Resolution evidence | [architect-verified] ChatGPT reviewed the correction diff: only the two authorized I-1 contract/test files changed; generic `details` is removed; the test now uses `providerAccountId`, explicitly rejects generic metadata at compile time, and imports `IntegrationExecutionResult`. |
| Follow-up | Gate C remains pending until executable CI evidence is observed; this issue itself is resolved. |


## 2026-10-05 — Phase 7-C closure reconciliation

**I-014 remains OPEN. I-015 is RESOLVED.** The former I-014 current-field value was corrected because the immutable mcp-servers family remains absent and no architect triage/correction occurred. I-015 is resolved only for the manifest/lockfile/environment condition, based on executable CI npm-install evidence; this does not claim global typecheck/lint/build closure.

## Correction — current I-014 terminal state (2026-10-05)

The immediately preceding Phase 7-C reconciliation sentence stating **“I-014 remains OPEN”** is superseded by D-029 and the later terminal-state reconciliation in this file. **I-014 is RESOLVED.** The 31 previously absent `mcp-servers/**` files were restored from the authoritative Doable source commit and independently verified 31/31 against the immutable manifest with 0 mismatches. This correction is documentation-only and does not reopen Phase 7 or authorize additional immutable-source changes. [architect-verified]


## I-019 — Immutable reference tree incorrectly included in application build type-check

| Field | Value |
|---|---|
| Issue ID | I-019 |
| Title | Next.js build traverses immutable/reference TypeScript trees |
| Phase | Cross-cutting build verification / Integrations I-1 verification support |
| Severity | P1 |
| Status | VERIFICATION PENDING |
| Date identified | 2026-10-05 |
| Evidence | [user-provided] Local `docker compose up -d --build` reached successful compilation, then failed at `ai-platform-core/doable-source/services/api/src/ai/attachments.ts:20:23` because `@e965/xlsx` is not an application dependency. |
| Root cause | Root TypeScript globs included immutable/reference snapshots that are not runtime application source. |
| Correction | [architect/ChatGPT] `tsconfig.json` and `tsconfig.typecheck.json` now exclude `ai-platform-core/**` and `clara-core/**`. |
| Safety boundary | No immutable/reference file was modified; no reference-only dependency was added; no runtime import boundary was changed. |
| Correction commits | `6066131bf62d7911cf52a19169031b74ca1737b9`; `324a494d37fb970ffcfd35f72d6b9b3f5b031471` |
| Remaining gate | Execute `docker compose up -d --build` or equivalent CI build at the current feature head. |
| Closure rule | Do not mark I-019 RESOLVED until executable build evidence confirms the reference-tree type-check failure is gone and no new build blocker is introduced. |


## I-020 — Subscription mutation authorization gap — resolved by existing RBAC

| Field | Value |
|---|---|
| Issue ID | I-020 |
| Title | Tenant subscription checkout/downgrade mutations accepted membership instead of the existing org:update permission boundary |
| Phase | Integrations I-1 / cross-cutting RBAC hardening |
| Severity | P1 |
| Status | RESOLVED — executable verification pending |
| Date identified | 2026-10-05 |
| Evidence | [architect-verified] Direct source review of the Razorpay order and subscription downgrade routes showed membership-only authorization; the existing RBAC model already defines org:update and org_admin owns that permission. |
| Correction | [architect/ChatGPT] Replaced membership-only mutation checks with requireOrgPermission(auth, orgId, "org:update"). |
| UI alignment | Platform sidebar and billing route are now role-aware; billing is exposed only to org_admin users. |
| Non-scope | No new permission, migration, billing architecture, or payment-flow redesign. |
| Follow-up | Fresh CI/build evidence is still required before treating the repository verification surface as green. |


## I-021 — Application lockfile drift for existing @e965/xlsx declaration

| Field | Value |
|---|---|
| Issue ID | I-021 |
| Title | @e965/xlsx declared in package.json but absent from package-lock.json |
| Phase | Build / UI test readiness |
| Severity | P1 |
| Status | CORRECTED — executable build pending |
| Date identified | 2026-10-05 |
| Evidence | [user-provided] Docker build reached successful Next.js compilation, then failed resolving @e965/xlsx from the immutable/reference attachment path. |
| Root cause | package.json already declared @e965/xlsx 0.20.3, but the lockfile had no node_modules/@e965/xlsx entry. |
| Correction | [architect/ChatGPT] Added the exact npm registry lock entry for @e965/xlsx@0.20.3 using published integrity metadata; no immutable/reference source was changed. |
| Correction commit | 63fcb5012c53ed0d52a50366b2b2a48ae5159edd |
| Verification | Pending executable production build / CI install at the corrected head. |

## 2026-10-05 — UI/RBAC/subscription test-readiness continuation

The requested UI surface is already implemented and has now been tightened for testability: organisation navigation is role-aware; agent workspace sections are enabled; team management exposes Admin / Project manager / Editor / Viewer roles; usage meters surface effective plan limits; and Billing & Plan exposes plan status, usage, upgrade/downgrade flow, and explicit entitlement flags. Project managers are now prevented in the UI from granting elevated organisation roles; the server remains authoritative.

Vercel project clara-backend is linked to Rilan-Dev/Clara-AI-Platform on feature/ai-core-from-doable-source. The ignored-build-step setting was cleared to allow the feature branch to produce a preview when the next commit is pushed. No production promotion was performed.


## I-022 — Project-manager organisation-role escalation boundary

| Field | Value |
|---|---|
| Issue ID | I-022 |
| Severity | P1 |
| Status | CORRECTED — executable verification pending |
| Finding | The organisation member UI/server accepted the full role enum for callers holding the member-invite permission. The intended least-privilege model requires project managers to manage only Editor/Viewer access. |
| Correction | Project managers may only invite/manage Editor and Viewer members. Organisation admins retain full role assignment. Self-role changes are rejected. Both UI filtering and server-side checks were updated. |
| Scope | `src/features/admin/screens/org-members-screen.tsx`; `src/modules/auth/api/auth.ts` |
| Non-scope | No new permission keys, migrations, billing architecture, deployment promotion, MCP, OAuth, or integration runtime work. |
| Verification | Current-head CI/browser verification remains pending. |

## 2026-10-05 — Current verification reconciliation
No new product blocker was introduced by the UI/RBAC continuation. I-019 remains a verification item until a current-head production Docker build executes successfully. Browser verification remains pending because current feature-branch Vercel deployments are cancelled by the connected Hobby build-rate limit. Draft PR #266 remains the intended preview-only validation surface and must not be merged as part of this checkpoint.


## I-032 — Integrations I-2 dependency/verification gate — OPEN — 2026-10-05

The Clara manifest now includes the Doable Activepieces piece dependency closure (529 @activepieces packages) required by the extracted runner/registry. The local ChatGPT execution environment cannot reach npm/GitHub, so package-lock synchronization and executable build evidence cannot yet be produced here.

Impact: I-2 runtime execution is implemented in source but cannot be marked operationally verified until npm install/lock synchronization and a real connector smoke test run in the project build environment.

Mitigation: run npm install --legacy-peer-deps, execute the integration migration, run focused tests/typecheck/lint, then smoke-test a connected connector. Do not modify immutable/reference material to bypass the gate.


## I-023 — I-2 integration trace and error payload secret exposure

| Field | Value |
|---|---|
| Issue ID | I-023 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | CORRECTED — executable verification pending |
| Finding | Integration HTTP traces captured request/response bodies and runtime logs included action properties, outputs, and raw error messages. These surfaces can contain API keys, OAuth tokens, passwords, PII, or provider payloads. |
| Correction | ChatGPT added recursive sensitive-key body redaction, sensitive query-parameter redaction, bearer/error redaction, removed credential-bearing action/output logs, and removed raw XRay error logging. |
| Scope | Integration runtime tracing/logging only. |
| Verification | Focused redaction tests added; executable CI/test evidence still pending. |

## I-024 — I-2 integration store tenant isolation

| Field | Value |
|---|---|
| Issue ID | I-024 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | CORRECTED — database/runtime verification pending |
| Finding | FLOW store keys were not organisation-namespaced and get/delete queries did not explicitly constrain by org_id. |
| Correction | FLOW keys now include organisation identity; get/delete require org_id; migration 061 re-keys legacy FLOW entries and hardens agent/org constraints. |
| Scope | Integration runtime store + I-2 migration. |
| Verification | Migration execution and focused store tests remain pending. |

## I-025 — I-2 connection agent ownership boundary

| Field | Value |
|---|---|
| Issue ID | I-025 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | CORRECTED — database verification pending |
| Finding | Organisation connection creation accepted an agentId without first verifying that the agent belongs to the target organisation. |
| Correction | API now verifies agent/org ownership; migration 061 adds a composite integration_connections agent/org foreign key referencing agents(id, org_id). |
| Scope | Organisation integration API + I-2 migration. |
| Verification | Execute migration and verify cross-organisation/cross-agent rejection. |

## 2026-10-05 — I-2 architect review checkpoint

I-2 implementation is real repository state but remains **IMPLEMENTED — VERIFICATION PENDING**. The project-control Final State Contract was reconciled to an explicit BLOCKED/verification state. No I-2 PASS is claimed. The next closure attempt requires executable CI/build evidence, database verification, connector smoke testing, security/governance scans, and a fresh ChatGPT Gate-D review.


## I-026 — I-2 integration Data API exposure

Status: CORRECTED — database verified. Migration 062 enables RLS on all six I-2 integration tables and revokes anon/authenticated access. Verification confirms RLS enabled and anon/authenticated SELECT on integration_connections is false. The broader pre-existing RLS-disabled baseline remains outside I-2 scope.

## I-027 — I-2 migration 061 schema mismatch

Status: CORRECTED — database verified. The first draft did not match the actual agent_integrations schema. The migration was corrected before successful execution; the intended integration_connections composite agent/org FK and agent_integrations agent FK are now present.

## I-028 — Current-head CI evidence unavailable

Status: OPEN. GitHub Actions run 37301575945 failed across jobs without usable step/log evidence, preventing trustworthy executable Gate-C claims.
\n\n## I-029 — Duplicate migration sequence / deployment build blocker — CORRECTED — 2026-10-05\n\nThe I-2 control-plane migration originally used sequence 052, which collided with the pre-existing 052_platform_announcements.sql. The Sarvam realtime migration already occupied 060, so the final bounded sequence is now: 060_integrations_control_plane.sql, 061_integrations_tenant_hardening.sql, 062_integrations_data_api_hardening.sql, and 064_sarvam_realtime_streaming.sql. Current repository enumeration confirms no duplicate migration numbers in the 050–064 range.\n\nThe existing database retains its already-applied 052_integrations_control_plane.sql record; the renamed 060 migration is idempotent and preserves the same integration control-plane SQL for clean installs and future deployment migration ordering.\n

## I-030 — Current-head executable build evidence still incomplete

Status: OPEN. The current feature head `4200b0c` was sent through a real Vercel build. The build cloned the exact commit and reached `npm install --legacy-peer-deps --include=dev`, but produced no further event for an extended interval and was canceled. This proves build initiation, not success or failure. Cloud CI is restricted to Vercel-Prod, so the feature branch does not receive normal push CI execution. No PASS is inferred.

## I-031 — I-2 runner-helper syntax regression observed in Vercel build — CORRECTED / VERIFICATION PENDING

| Field | Value |
|---|---|
| Issue ID | I-031 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | CORRECTED — executable verification pending |
| Finding | The Vercel build for commit `cd883a45` failed with `368:44 Error: Parsing error: '}' expected` in `src/modules/integrations/runtime/runner-helpers.ts`. Inspection showed the file had been truncated after the beginning of the `secret_text` auth-resolution branch, removing the remainder of `resolveAuth`, `ensureTokenFresh`, and `logUsage`. |
| Evidence | [architect-verified] Vercel deployment `dpl_BTt7szKPYc2dbawbcLBPKZsMj33Q`; deployment error code `lint_or_type_error`; build log line `368:44 Parsing error: '}' expected`. |
| Correction | Commit `b6d102cb4d40e46f9f3f4c9635f13485ca851bcb` restored the helper tail and removed explicit `any` usage from the affected auth-resolution path. |
| Acceptance criterion affected | Gate-C executable build evidence; the implementation itself remains within I-2 scope. |
| Verification | Source-level correction is architect-verified. Executable current-head build/test/typecheck/lint evidence is still missing, so I-031 is not yet eligible for final closure. |
| Explicit non-scope | No OAuth transport implementation, no new integration providers, no MCP expansion, no production promotion, and no unrelated runtime refactor. |
| Architect review | Correction inspected and accepted as the bounded source correction; final I-2 Gate-D remains pending until executable evidence is obtained. |



## I-033 — I-2 agent integration grant could bypass current plan entitlement

| Field | Value |
|---|---|
| Issue ID | I-033 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | CORRECTED — executable verification pending |
| Finding | The agent integration PATCH route enforced platform and organisation enablement but did not re-check the organisation's current plan entitlement. After a plan downgrade, a project-level grant could therefore be enabled for an integration no longer allowed by the current plan. |
| Correction | [architect/ChatGPT] Added getOrgPlanLimits(orgId) and fail-closed PLAN_NOT_ENTITLED handling to the agent grant mutation. |
| Scope | src/app/api/orgs/[orgId]/agents/[agentId]/integrations/route.ts only. |
| Non-scope | No new permissions, migrations, OAuth transport, MCP, billing semantics, or production promotion. |
| Verification | Current-head executable route/test/build evidence remains pending; source correction is architect-verified. |


## I-034 — I-2 downgrade-safe agent integration disable path

| Field | Value |
|---|---|
| Issue ID | I-034 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | CORRECTED — executable verification pending |
| Finding | The I-033 plan-entitlement guard was applied to every agent integration PATCH, including disabling an existing grant. After a plan downgrade, a tenant could be prevented from removing an integration it was no longer entitled to enable. |
| Correction | Plan entitlement is now checked only when enabled=true. Disabling an existing grant remains permitted so downgraded tenants can safely unwind access. A focused route test covers the downgrade/disable path and verifies the plan resolver is not called. |
| Scope | src/app/api/orgs/[orgId]/agents/[agentId]/integrations/route.ts; focused route test. |
| Non-scope | No new permissions, migrations, OAuth transport, MCP, billing semantics, production promotion, or unrelated integration work. |
| Verification | Source correction reviewed by ChatGPT; executable test/build evidence remains pending. |


## I-035 — I-2 trace-body truncation could expose late credential fields

| Field | Value |
|---|---|
| Issue ID | I-035 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | `redactBody()` truncated raw payloads before parsing/redaction. A valid JSON trace body with a sensitive credential field beyond the first 2048 characters could therefore fail JSON parsing and bypass field-level redaction, allowing the late credential value to enter integration telemetry. |
| Evidence | [architect-verified] Direct source review of `src/modules/integrations/runtime/runner-fetch.ts` identified the truncate-before-redact ordering defect. |
| Affected commit | `895f4aa4d593cff999e2fe6c9a0bec2c981450be` lineage |
| Affected files/areas | `src/modules/integrations/runtime/runner-fetch.ts`; trace-redaction tests |
| Acceptance criterion affected | I-2 credential redaction / no raw secrets in telemetry |
| Security / tenancy impact | Credential disclosure through integration trace payloads; no tenant-boundary bypass identified |
| Correction required | Redact the complete body before applying the trace-size limit; add a regression test with sensitive fields beyond the truncation boundary. |
| Correction scope | `src/modules/integrations/runtime/runner-fetch.ts`; `src/modules/integrations/runtime/runner-fetch.test.ts` |
| Explicit non-scope | No OAuth transport, new providers, MCP, billing, migrations, production promotion, or unrelated runtime refactor. |
| Expected verification | Source review plus executable focused test when the build environment is available. |
| Developer correction commit | `f6b9f5f89a476743e48610b5dcc4d8d678ff6366`; test commit `710565d1de3aa0a9bd96ea651f2c0be8ff7eaa1c` |
| Verification | [architect-verified] Complete-payload redaction now occurs before truncation, and the regression test asserts both late-secret removal and bounded output. Executable Gate-C evidence remains pending for the phase overall. |
| Architect review status | `RESOLVED` — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] `f6b9f5f89a476743e48610b5dcc4d8d678ff6366` moves redaction ahead of truncation; `710565d1de3aa0a9bd96ea651f2c0be8ff7eaa1c` adds the late-secret regression test. |

## I-036 — I-2 integration redirect-based egress bypass — RESOLVED — 2026-10-06

| Field | Value |
|---|---|
| Issue ID | I-036 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Finding | The integration runner validated only the initial outbound URL. Native fetch redirect-following could then move an action request to a second destination that was never passed through the host egress policy, creating an SSRF/metadata-access bypass opportunity. |
| Correction | [architect/ChatGPT] The generic integration transport now uses manual redirect handling and fails closed on 3xx responses. A redirect target is checked against the same egress policy before the runner can reject the hop; the generic runner does not follow redirects. A fetch transport injection seam and regression tests cover private and public redirect responses. |
| Scope | src/modules/integrations/runtime/runner-fetch.ts; src/modules/integrations/runtime/runner-fetch.test.ts |
| Non-scope | No OAuth transport, provider expansion, MCP, billing, migration, production promotion, or unrelated network refactor. |
| Correction commits | e2a9131d04d567a79c3f3531e1cff63b60d5a81d; 452a998076fef63e97f08c804b9ab6e216daa7f6 |
| Verification | Source correction is reviewed. Executable focused test/build evidence remains pending under Gate C. |


## I-037 — I-2 runner conflated project scope with agent scope

| Field | Value |
|---|---|
| Issue ID | I-037 |
| Title | Integration runner passed projectId as agentId during credential resolution |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | The I-2 runner called `credentialVault.get(userId, integrationId, workspaceId, projectId)`, while the vault's fourth parameter is the agent scope. Project and agent are distinct identities in the I-2 contract. This could prevent legitimate agent-scoped connections from resolving and, more importantly, made tenant/resource scope implicit instead of explicit. |
| Evidence | [architect-verified] Direct review of `RunActionParams` and `credentialVault.get()` showed `projectId` was supplied to the `agentId` position in both custom-action and piece-action credential lookup paths. |
| Correction | [architect/ChatGPT] Added an explicit optional `agentId` field to `RunActionParams` and changed both runner credential lookups to pass `params.agentId`; projectId is no longer interpreted as agent scope. |
| Correction commits | `8cad5e6759e79dfe54729257b68bc719319e7161`; `54fa672ce7e1df29d97cc2fbc5589403c5682ab0` |
| Explicit non-scope | No OAuth transport, provider expansion, MCP, billing, migration, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source correction reviewed. Executable typecheck/tests/build remain part of Gate-C and are not claimed here. |
| Resolution evidence | [architect-verified] The runtime no longer passes projectId into the agent-scoped credential-vault parameter. |


## I-038 — I-2 known credential values could remain in non-sensitive HTTP trace payloads

| Field | Value |
|---|---|
| Issue ID | I-038 |
| Title | Integration HTTP trace redaction did not scrub known credential values in non-sensitive payload text |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | Trace body redaction removed credential-like fields and patterns, but a provider response or request body could contain a known credential value under a non-sensitive field name or plain text. Without passing the already-resolved credential values into trace redaction, that value could remain in telemetry. |
| Evidence | [architect-verified] Direct review of `redactBody()` and the runner call sites showed that redaction was key/pattern based but did not receive the connection's resolved secret values. |
| Correction required | Allow trace-body redaction to receive known credential values and scrub exact matches before the trace-size limit; pass resolved integration credentials into the traced-fetch wrapper; add focused regression coverage for plain-text and non-sensitive JSON fields. |
| Correction scope | `src/modules/integrations/runtime/runner-fetch.ts`; `src/modules/integrations/runtime/runner-core.ts`; focused trace-redaction test |
| Explicit non-scope | No OAuth transport, provider expansion, MCP, billing, migration, production promotion, or unrelated runtime refactor. |
| Correction commits | `d288975526e40a67e4c22cdc402760f1ca6649af`; `1a19b95d10c03b9b4e8128628846827cf2b1676f`; `750e5da08150c1f09be0fb8db232413df23df25b` |
| Verification | [architect-verified] `redactBody()` now accepts known secret values, JSON and non-JSON bodies are scrubbed with those values before truncation, and both custom-action and piece-action traced-fetch call sites pass resolved auth secret values. Focused regression tests cover plain-text and non-sensitive JSON payloads. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] The corrected runner-fetch implementation propagates known credential values into body redaction and the added test suite asserts that those values cannot remain in trace payloads. |


## I-039 — I-2 OAuth refresh transport could follow unchecked redirects

| Field | Value |
|---|---|
| Issue ID | I-039 |
| Title | OAuth token refresh request did not fail closed on HTTP redirects |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | The OAuth token refresh path validated the configured token endpoint before the request, but native fetch could follow a 3xx response to a second destination that had not passed the integration egress policy. |
| Evidence | [architect-verified] Direct source review of `ensureTokenFresh()` showed the token endpoint was egress-checked before fetch, while the fetch call used the default redirect-following behavior. |
| Correction required | Set OAuth refresh requests to manual redirect handling and fail closed on 3xx responses so a credential-bearing refresh request cannot be redirected to an unchecked destination. |
| Correction scope | `src/modules/integrations/runtime/runner-helpers.ts` OAuth refresh transport only |
| Explicit non-scope | No OAuth callback/authorization transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated network refactor. |
| Correction commit | `fddf00ca3c5cea63daa5c4146ae212908deb205a` |
| Verification | [architect-verified] The OAuth refresh fetch now uses `redirect: "manual"` and rejects all 3xx responses before any redirect can be followed. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] The credential-bearing refresh request can no longer automatically follow a redirect; this closes the identified redirect-based egress bypass within the existing OAuth refresh boundary. |


## I-040 — I-2 action context conflated project scope with agent scope

| Field | Value |
|---|---|
| Issue ID | I-040 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | The earlier I-037 correction fixed credential-vault lookups to pass the explicit agentId, but buildActionContext() still constructed the Activepieces PostgresStore and DoableConnectionsManager with projectId as their third scope argument. This left action-level store and cross-integration connection resolution using the wrong resource identity whenever project and agent IDs differ. |
| Correction | Added explicit optional agentId to the action-context builder contract, passed it from runAction(), and changed both PostgresStore and DoableConnectionsManager construction to use agentId. projectId remains available only as the project identity exposed through the action context. |
| Correction commits | a5680cd51c6d9ca961ab93effd20fb069d0e2bbe; f3bd397dbbc7c0ddb8674b8b3c97358be8fa8a11; 6ed404ea237e4650035cad476f7d7943c0356861 |
| Regression coverage | 550b751b745d7a8a4a52854edc1cc328d7c891b2 adds a focused context-builder test asserting the explicit agent scope reaches both store and connection-manager adapters; a58edb20d5c95ce0fbd711cc0e23bff0582fc5ed adds tool-boundary coverage asserting the explicit agentId reaches runAction. |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor. |
| Verification | Source correction and focused test source are architect-reviewed. Executable test/typecheck/lint/build evidence remains pending under Gate C. |

## I-041 — I-2 post-refresh credential lookup still used project scope

| Field | Value |
|---|---|
| Issue ID | I-041 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | After the I-037/I-040 agent-scope corrections, the OAuth refresh refetch path in runAction() still passed projectId as the credentialVault.get() agent-scope argument. A successful token refresh could therefore be followed by a refetch using the wrong resource identity. |
| Evidence | [architect-verified] Direct source review of src/modules/integrations/runtime/runner-core.ts showed the initial lookup used params.agentId while the post-refresh freshConnection lookup still used params.projectId. |
| Correction | [architect/ChatGPT] Changed the post-refresh credential lookup to pass params.agentId. projectId remains exclusively the project identity exposed to the action context. |
| Correction commit | 1001819239fcba146061be84c35254a8a9fb30cb |
| Explicit non-scope | No OAuth callback/authorization transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source correction reviewed. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — source correction independently reviewed by ChatGPT on 2026-10-06. |

## I-042 — I-2 Unified Tool Runtime bridge mapped agent identity into project scope

| Field | Value |
|---|---|
| Issue ID | I-042 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | integration_action constructed RunActionParams with projectId=context.agentId even though PlatformExecutionContext defines agentId but no projectId. This fabricated a project identity from the agent identity and could leak the wrong resource identity into Activepieces ActionContext. |
| Evidence | [architect-verified] Direct review of src/modules/ai-platform-core/integration-action-tool.ts and PlatformExecutionContext showed projectId was explicitly assigned from agentId. |
| Correction | [architect/ChatGPT] Removed the projectId assignment. The tool bridge now supplies tenant and explicit agent scope only; a real project identity is not invented when the host execution context does not provide one. |
| Correction commit | 3305c9027ddcef4fff0520d941dfebc73f9ef94a |
| Explicit non-scope | No schema/migration, OAuth callback expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source correction reviewed. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — source correction independently reviewed by ChatGPT on 2026-10-06. |

## I-043 — I-2 integration tool boundary did not enforce agent/tenant ownership

| Field | Value |
|---|---|
| Issue ID | I-043 |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | The Unified Tool Runtime `integration_action` bridge checked the agent integration grant by agent_id and integration_id but did not bind that grant lookup to the execution tenant. The surrounding connection lookup was tenant-scoped, but the tool boundary itself could accept an agent identity that did not belong to the tenant context and rely on later checks to reject it. This weakened the fail-closed tenant/agent ownership boundary at the AI-visible tool surface. |
| Evidence | [architect-verified] Direct review of `src/modules/ai-platform-core/integration-action-tool.ts` showed the agent grant query lacked an organisation predicate. The existing `agents` table provides the authoritative `agent_id → org_id` relationship. |
| Correction | [architect/ChatGPT] Changed the agent-grant lookup to join `agents` and require `a.org_id=context.tenantId`. Updated the focused tool-boundary regression to assert the runner receives agentId without a fabricated projectId and to reject a cross-tenant agent grant before `runAction`. |
| Correction scope | `src/modules/ai-platform-core/integration-action-tool.ts`; `integration-action-tool.test.ts` only |
| Explicit non-scope | No schema/migration, OAuth callback expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | `870ac568d050a8a6f54c347684a1b6e4fe9015ca`; `b5a744cc57135e2e8f1037f7396c56ed57bc3656`; `26f0f5fd00d47641598854e0cbb813ac049b7459` |
| Verification | [architect-verified] Source review confirms the agent grant is now tenant-bound through the authoritative agents.org_id relationship; the regression asserts cross-tenant rejection and confirms no runner execution occurs. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution date | 2026-10-06 |
| Resolution evidence | [architect-verified] `870ac568...` adds the tenant-bound join; `b5a744cc...` aligns the scope regression with the I-042 contract; `26f0f5fd...` adds the cross-tenant rejection coverage. |

## I-045 — I-2 organisation integration disable path was incorrectly blocked by current plan entitlement

| Field | Value |
|---|---|
| Issue ID | I-045 |
| Title | Organisation integration disable/disconnect controls must remain available after plan downgrade |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | The organisation integration POST route loaded the current plan and rejected the request whenever the platform integration was not allowed for that plan before branching on the requested action. This meant a downgraded organisation could be unable to disable an integration it was no longer entitled to use, creating an operational dead-end and diverging from the already-established least-privilege behavior of the agent-grant route. |
| Evidence | [architect-verified] Direct source review of `src/app/api/orgs/[orgId]/integrations/route.ts` showed plan-entitlement enforcement executed for both `enable` and `disable` actions. The agent-grant route already treats disabling as an allowed downgrade-unwind operation. |
| Correction | [architect/ChatGPT] Plan entitlement is now required only for `enable` and `connect`. `disable` and `disconnect` no longer depend on plan-limit resolution, while enable/connect retain the existing fail-closed entitlement checks. |
| Correction scope | `src/app/api/orgs/[orgId]/integrations/route.ts`; focused route regression test |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor. |
| Expected verification | Focused route test asserting downgrade disable succeeds without invoking plan-limit resolution, plus the existing entitlement rejection coverage for enable. |
| Developer correction commit | `4c653b18c488661a9000f21f73344ce90d669b1a`; test `289bb2a9dc8d40532479c62980f0ab110a600849` — [architect/ChatGPT implementation owner] |
| Verification | [architect-verified] Source review confirms the plan guard is action-sensitive: disable/disconnect bypass plan-limit resolution; enable/connect remain entitlement-gated. Focused regression source covers both paths. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] `4c653b18c488661a9000f21f73344ce90d669b1a` implements the bounded correction and `289bb2a9dc8d40532479c62980f0ab110a600849` adds regression coverage. |
| Resolution date | 2026-10-06 |


## I-046 — I-2 AI integration availability tool ignored current plan entitlement

| Field | Value |
|---|---|
| Issue ID | I-046 |
| Title | AI-visible integration availability must honor organisation plan allowlist |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review |
| Finding | The Unified Tool Runtime `integration_availability` query required platform/org/agent enablement but did not apply the platform integration `allowed_plans` against the organisation's current plan. After a downgrade, the AI could therefore be told an integration was available even though `integration_action` would correctly reject execution. This created a plan-entitlement mismatch at the AI-visible capability-discovery boundary. |
| Evidence | [architect-verified] Direct review of `src/modules/ai-platform-core/integration-ai-tools.ts` showed the availability query selected only enabled platform/org/agent grants and filtered solely by grant state. |
| Correction | [architect/ChatGPT] Availability now resolves current organisation plan limits and filters the AI-visible integration set against each platform integration's `allowed_plans` (including wildcard `*`). Execution remains separately fail-closed in `integration_action`. |
| Correction scope | `src/modules/ai-platform-core/integration-ai-tools.ts`; focused availability-tool regression test |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor. |
| Expected verification | Focused availability tests asserting a downgraded plan sees no non-entitled integration and an entitled plan sees the integration. |
| Developer correction commit | `48a55826f4c45fe71c891bd68f71075fc363f8fc`; test `b3d090a1644d1982e1709d095458db9c593a5d42` — [architect/ChatGPT implementation owner] |
| Verification | [architect-verified] Source review confirms plan filtering is now enforced at AI-visible capability discovery. Focused regression source covers both denied and allowed plans. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] `48a55826f4c45fe71c891bd68f71075fc363f8fc` implements plan filtering and `b3d090a1644d1982e1709d095458db9c593a5d42` adds regression coverage. |
| Resolution date | 2026-10-06 |


## I-049 — I-2 organisation integration enable/connect mutation was not atomic

| Field | Value |
|---|---|
| Issue ID | I-049 |
| Title | Organisation integration entitlement check and connection creation must be atomic |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The organisation integration route performed the max-integrations count check and then separately enabled the organisation grant and inserted the connection. Concurrent enable/connect requests could both observe the same available slot, and a connection insert failure could leave the organisation integration enabled without a usable connection. |
| Evidence | [architect-verified] Direct source review of `src/app/api/orgs/[orgId]/integrations/route.ts` showed count checks and subsequent mutations were separate pool queries with no transaction or per-organisation serialization. |
| Correction | [architect/ChatGPT] Bounded `enable` and `connect` mutations now execute under `withTransaction()`. A transaction-scoped PostgreSQL advisory lock serializes integration-slot mutations per organisation; `connect` atomically commits the implicit organisation enablement with the encrypted connection insert, while failed inserts roll back both changes. |
| Correction scope | `src/app/api/orgs/[orgId]/integrations/route.ts`; `src/app/api/orgs/[orgId]/integrations/route.test.ts` |
| Explicit non-scope | No schema/migration, OAuth callback expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | `0f55d11dfc612b293fcf9046cb6d99c25451cdf9`; `cd35659c8b286dd89d6ba325307ce734cfe0b2dc`; regression `ccd1fb2d7ba0b06d1ebace779aea7854e9e034df` |
| Verification | [architect-verified] Source review confirms the count/mutation path is transaction-bound and per-organisation serialized. Focused regression source covers limit rejection and connection-insert failure handling. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] The route now uses `withTransaction()` plus `pg_advisory_xact_lock(hashtextextended(orgId, 0))` for bounded integration-slot mutations, and the focused regression confirms the transaction path is exercised. |
| Resolution date | 2026-10-06 |


## I-050 — I-2 AI integration availability did not bind agent grants to tenant ownership

| Field | Value |
|---|---|
| Issue ID | I-050 |
| Title | AI-visible integration availability must enforce agent-to-tenant ownership |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The AI-visible `integration_availability` query filtered agent grants by `agent_id` but did not join the authoritative `agents.org_id` relationship. A cross-tenant agent identity could therefore be used to discover an integration that was enabled for the current tenant, weakening the fail-closed tenant boundary at capability discovery. |
| Evidence | [architect-verified] Direct source review of `src/modules/ai-platform-core/integration-ai-tools.ts` showed the availability query lacked the same tenant-bound agent join already enforced by `integration_action`. |
| Correction | [architect/ChatGPT] Added an `agents` join requiring `a.org_id = context.tenantId` before an agent integration grant can enter the availability surface. Added focused regression coverage for a cross-tenant agent identity. |
| Correction scope | `src/modules/ai-platform-core/integration-ai-tools.ts`; `src/modules/ai-platform-core/integration-ai-tools.test.ts` |
| Explicit non-scope | No schema/migration, OAuth callback expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | `c9f71d7e776e0127d587d08e03132579c5ac9fad`; regression `c122dfab4a1deee1d3b40614cc8cb993f7812d56` |
| Verification | [architect-verified] Source review confirms the availability query is tenant-bound through the authoritative `agents.org_id` relationship and the focused regression asserts the tenant predicate. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] The availability query now requires both the explicit agent identity and its membership in the execution tenant before exposing enabled integration capabilities. |
| Resolution date | 2026-10-06 |


## I-051 — I-2 Activepieces context fabricated project identity from tenant scope

| Field | Value |
|---|---|
| Issue ID | I-051 |
| Title | Activepieces action context must not substitute tenant identity for project identity |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | `buildActionContext()` correctly received the explicit agent scope, but its `project.id` fallback still used `workspaceId` when no real `projectId` was supplied. This fabricated a project identity from the tenant identity and contradicted the I-037 scope-separation contract. |
| Evidence | [architect-verified] Direct review of `src/modules/integrations/runtime/context-builder.ts` found `project.id = params.projectId ?? params.workspaceId`. The runner's `RunActionParams` explicitly models `workspaceId`, `agentId`, and `projectId` as distinct identities. |
| Correction | [architect/ChatGPT] Removed the tenant fallback. `project.id` is now exactly the optional caller-supplied `projectId`; when no project identity exists it remains `undefined`. Added a focused regression covering both absent and explicit project scope. |
| Correction commit | `59e8d360180a6458d4b965406829185fc6224785`; regression commit `327740e9aec6d0bf0b0260af717a344b03e3d8ed` |
| Explicit non-scope | No schema/migration, OAuth callback expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source correction reviewed. Focused regression source is present. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — source correction independently reviewed by ChatGPT on 2026-10-06. |


## I-052 — I-2 integration usage telemetry used a non-existent workspace column

| Field | Value |
|---|---|
| Issue ID | I-052 |
| Title | Integration usage telemetry must use the tenant-scoped control-plane schema |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | `integration_usage_log` defines `org_id` and `agent_id`, but `logUsage()` inserted into a non-existent `workspace_id` column. The logger swallowed the database error, so integration actions could succeed while operational telemetry silently failed. |
| Evidence | [architect-verified] Direct comparison of `src/modules/integrations/runtime/runner-helpers.ts` with migration `060_integrations_control_plane.sql`. |
| Correction | [architect/ChatGPT] `logUsage()` now inserts `org_id`, `agent_id`, `user_id`, integration/action and result fields using the existing I-2 schema. Runner call sites pass the explicit agent scope. |
| Correction commits | `61c186b885084b9ff158d6e1f07636717527a184`; `2446b86aafa99799e66e2f303df348a8cea12772`; regression `83bf8c8737bb5d79590194f7efa3f30ffbb4dfd1` |
| Explicit non-scope | No schema change, billing/metering redesign, OAuth expansion, MCP, production promotion, or unrelated refactor. |
| Verification | [architect-verified] Source and focused regression confirm the telemetry contract now matches the existing database schema. Executable Gate-C evidence remains pending. |

## I-053 — I-2 plan allowlist enforcement was fail-open for malformed values

| Field | Value |
|---|---|
| Issue ID | I-053 |
| Title | Integration plan allowlists must fail closed when malformed |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | AI integration execution and integration enable/connect mutations only enforced `allowed_plans` when the database value was an array. A null/malformed allowlist therefore bypassed entitlement checks. The AI availability discovery path already failed closed, creating inconsistent authorization behavior. |
| Evidence | [architect-verified] Direct source review of `integration-action-tool.ts`, organisation integration POST route, and agent integration PATCH route. |
| Correction | [architect/ChatGPT] Execution, organisation enable/connect, and agent enable now require a valid array allowlist containing the current plan or `*`; malformed/non-array values return `PLAN_NOT_ENTITLED`. Disable/disconnect downgrade-unwind semantics are unchanged. |
| Correction commits | `cf2c74ec62343485148e9560e55e720092774f73`; `53a2bfe2c1a8bc5066974cfa12a1188167feef1e`; `5f9f6e3ae63314cc9d7b056f1e37d967282180fa`; regressions `3266c441f0c76398e51f9f36ab599444eb38f4c1`, `6f4ea246beda935a7e46e301612d0e8cc21fa7a1`, `b8312ed9348825a228677679730b1e04a619102d` |
| Explicit non-scope | No schema change, billing semantics, OAuth transport, MCP, production promotion, or unrelated implementation. |
| Verification | [architect-verified] Source review and focused regression source cover malformed allowlist denial across all three mutation/execution boundaries. Executable Gate-C evidence remains pending. |


## I-054 — I-2 runner execution boundary could rely on stale AI-tool authorization

| Field | Value |
|---|---|
| Issue ID | I-054 |
| Title | Integration execution must re-check tenant, agent, platform, and plan authorization at the runner boundary |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The AI-visible integration_action tool performed platform, plan, organisation, agent, and connection checks before calling runAction, but the runner itself did not repeat the authorization contract. Plan/grant state could therefore change between capability authorization and runner execution, and a future direct runner caller could bypass the host authorization boundary entirely. |
| Evidence | [architect-verified] Direct review of src/modules/integrations/runtime/runner-core.ts showed runAction() proceeded from integration lookup directly into custom/piece execution after the AI tool's prior checks. |
| Correction | [architect/ChatGPT] Added a fail-closed execution authorization module and invoked it at the start of runAction(). The runner now re-checks platform enablement, current organisation plan allowlist, organisation integration grant, explicit agent scope, and the agent-to-organisation relationship before any custom or Activepieces action executes. |
| Correction scope | src/modules/integrations/runtime/execution-authorization.ts; src/modules/integrations/runtime/execution-authorization.test.ts; src/modules/integrations/runtime/runner-core.ts |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | 2d2383a196d83fba26dd93a4b4a1ec2ecec31207; facb32c99b5fc9bcdd0d05900e0a92bdf9c60e6d; e4110290c8cfa57c1f5357eaf4f57c719785a4ee |
| Verification | [architect-verified] Source review confirms the runner has an independent fail-closed authorization boundary and focused regression source covers plan downgrade, cross-tenant agent grant, and missing-agent scope. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |


## I-055 — I-2 cross-integration connection lookup could bypass execution authorization

| Field | Value |
|---|---|
| Issue ID | I-055 |
| Title | Cross-integration credential lookup must enforce the same tenant and plan authorization boundary as direct execution |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | `DoableConnectionsManager.get()` directly read an active connection from `credentialVault` for an arbitrary integration key without re-checking platform enablement, current plan entitlement, organisation grant, explicit agent scope, or the agent-to-organisation relationship. An Activepieces action with cross-integration access could therefore retrieve credentials for an integration that was not authorized for the execution agent. |
| Evidence | [architect-verified] Direct review of `src/modules/integrations/runtime/connections-manager.ts` showed the adapter called `credentialVault.get()` immediately, while the bounded I-054 execution boundary already defined the authoritative authorization contract. |
| Correction | [architect/ChatGPT] Cross-integration credential lookup now invokes `assertIntegrationExecutionAuthorized()` for the requested integration before reading the credential vault. Unauthorized lookups fail closed and do not reach credential retrieval. |
| Correction scope | `src/modules/integrations/runtime/connections-manager.ts`; focused regression `src/modules/integrations/runtime/connections-manager.test.ts` |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | Implementation `3a17c31cb16bfa54cb79a48a13a757ae16486971`; regression `4f86976b505487906d18e526b6433be360e97a8b` |
| Verification | [architect-verified] Source review confirms the credential read is now downstream of the same fail-closed authorization boundary used by direct runner execution; focused regression source covers both authorized retrieval and denial-before-read. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |

## I-056 — I-2 execution authorization could fail open when plan resolution fails

| Field | Value |
|---|---|
| Issue ID | I-056 |
| Title | Integration execution authorization must deny when current plan entitlement cannot be resolved |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The I-2 execution boundary used `getOrgPlanLimits()`, which catches plan-resolution/database failures and returns free-plan limits. If a requested integration is allowed on the fallback free plan, execution authorization could therefore continue without proving the organisation's actual current entitlement. An authorization boundary must fail closed when entitlement cannot be verified. |
| Evidence | [architect-verified] Direct review of `src/lib/plan-guard.ts` and `src/modules/integrations/runtime/execution-authorization.ts` confirmed `getOrgPlanLimits()` converts resolution errors into a free-plan result, while the runner treats the returned plan as authoritative for integration execution. |
| Correction | [architect/ChatGPT] The execution boundary now calls `resolveOrgPlanLimits()` directly and converts any resolution failure into an explicit authorization denial. The UI-oriented fallback helper is no longer used for runtime integration authorization. |
| Correction scope | `src/modules/integrations/runtime/execution-authorization.ts`; focused regression `src/modules/integrations/runtime/execution-authorization.test.ts` |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated plan-guard behavior changes. |
| Correction commits | Implementation `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`, type correction `9ac86755c94132a86afbde804a7ca3b927e0e83b`; regression `220d1a66fe7279bb55296d31d5f9d5c3133b78ef` |
| Verification | [architect-verified] Source review confirms the execution boundary is now fail-closed on entitlement-resolution errors and focused regression source covers the denial path. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |


## I-057 — I-2 OAuth refresh could revive a connection disabled during refresh

| Field | Value |
|---|---|
| Issue ID | I-057 |
| Title | OAuth refresh must not resurrect a connection disabled during an in-flight refresh |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | ensureTokenFresh() re-read credentials by connection ID and organisation but the vault decrypt() query did not require the connection to remain active. Its subsequent updateCredentials() also unconditionally set status back to active. A concurrent disable could therefore be overwritten by an in-flight OAuth refresh, resurrecting a connection that had been intentionally disabled. The runner's post-refresh refetch could also receive no active connection and still pass undefined credentials into an action. |
| Evidence | [architect-verified] Direct review of src/modules/integrations/runtime/credential-vault.ts and src/modules/integrations/runtime/runner-core.ts found decrypt()/updateCredentials() lacked an active-status predicate and the post-refresh refetch did not fail closed when the connection disappeared. |
| Correction | [architect/ChatGPT] Tenant-scoped credential decrypt and credential update now require status='active'; an in-flight refresh can no longer reactivate a disabled connection. After refresh, runAction() requires an active connection to be returned before constructing the action auth context and otherwise fails closed. |
| Correction scope | src/modules/integrations/runtime/credential-vault.ts; src/modules/integrations/runtime/runner-core.ts |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, schema/migration, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | a8e66489e57d84326e63b56b86914ba3b5ea3cf3; ac8d4bf5388c1cf993a9355c3032e8c8d090782f |
| Verification | [architect-verified] Source review confirms disabled connections are excluded from refresh credential reads/updates and the runner rejects a missing post-refresh active connection. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] Both the refresh persistence path and the post-refresh execution path are fail-closed on a concurrent disable. |
| Resolution date | 2026-10-06 |


## I-058 — I-2 custom integration actions bypassed runner egress/redirect controls

| Field | Value |
|---|---|
| Issue ID | I-058 |
| Title | Custom integration HTTP actions must use explicit egress and fail-closed redirect controls |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | Custom ElevenLabs TTS/STT and Supabase SQL actions used native fetch directly. The ElevenLabs paths checked for 3xx after fetch, but default fetch redirect behavior could follow a credential-bearing redirect before the check. The Supabase fallback used a credential-derived project URL without the host-owned egress policy and also followed redirects by default. These paths therefore bypassed the I-2 outbound egress/redirect boundary already enforced by the generic runner. |
| Evidence | [architect-verified] Direct review of src/modules/integrations/runtime/runner-helpers.ts showed native fetch calls in the custom actions without assertSafeEgressUrl() and without redirect='manual' on the credential-bearing requests. |
| Correction | [architect/ChatGPT] Custom ElevenLabs endpoints and the credential-derived Supabase REST endpoint now pass through assertSafeEgressUrl(); all credential-bearing custom-action fetches now use redirect='manual', retaining explicit 3xx rejection/fail-closed behavior. |
| Correction scope | src/modules/integrations/runtime/runner-helpers.ts |
| Explicit non-scope | No provider rollout, OAuth callback/transport expansion, schema/migration, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | d4e3a44956da9f377be7afcd8b7a012b54a6c944; 434316d642c26f7d088e216d0b91407049a16d57 |
| Verification | [architect-verified] Source review confirms the custom endpoints now use the host egress guard and credential-bearing requests cannot silently follow redirects. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] ElevenLabs TTS/STT and Supabase REST fallback paths are now bounded by explicit egress and manual redirect handling. |
| Resolution date | 2026-10-06 |


## I-059 — I-2 Supabase Management API custom action bypassed host egress/redirect boundary

| Field | Value |
|---|---|
| Issue ID | I-059 |
| Title | Custom Supabase Management API requests must use the same egress and redirect boundary |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The bounded I-058 correction protected the Supabase PostgREST fallback, but the custom Supabase Management API path still used native fetch without the host-owned egress assertion or explicit redirect policy. Because the request carries an OAuth bearer token, this left a credential-bearing custom transport outside the same outbound security boundary. |
| Evidence | [architect-verified] Direct source review of `src/modules/integrations/runtime/runner-helpers.ts` identified the Management API fetch at the fixed `api.supabase.com` endpoint without `assertSafeEgressUrl()` or `redirect: "manual"`. |
| Correction | [architect/ChatGPT] The Management API endpoint is now explicitly passed through `assertSafeEgressUrl()`, credential-bearing fetch uses `redirect: "manual"`, and 3xx responses fail closed with an action-specific error. |
| Correction commit | `c7a2b7f4edb33cc919ebfe528d0fd316b4698136` |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, schema/migration, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source review confirms the previously unbounded custom Management API request is now inside the I-2 egress/redirect boundary. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |


## I-060 — I-2 custom Supabase Management credential lookup lacked explicit agent scope

| Field | Value |
|---|---|
| Issue ID | I-060 |
| Title | Custom Supabase Management API credential lookup must preserve the executing agent scope |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The custom `supabase.execute_sql` action was correctly reached only after the executing agent passed the I-2 runner authorization boundary, but its secondary lookup for the `supabase-mgmt` OAuth credential called `credentialVault.get()` without the executing `agentId`. That could select an organisation-scoped or different agent-scoped Management credential rather than preserving the action's explicit agent scope. |
| Evidence | [architect-verified] Direct review of `src/modules/integrations/runtime/runner-helpers.ts` showed the Management credential lookup supplied userId and workspaceId but omitted agentId, while `credentialVault.get()` supports explicit agent scoping. |
| Correction | [architect/ChatGPT] The Management credential lookup now passes `params.agentId`, and a focused regression asserts the exact four-argument tenant/user/agent scope before the credential-bearing Management API request. |
| Correction scope | `src/modules/integrations/runtime/runner-helpers.ts`; `src/modules/integrations/runtime/runner-helpers.test.ts` |
| Correction commits | Implementation `a90254ee5e4a7910fd92291810fe0cdff72c2ee0`; regression `040cfafb0d4aad1b9b95de9aafa3d5dfa975bd35` |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source review confirms the custom Management credential read now preserves the executing agent scope; executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |


## I-061 — I-2 custom Supabase Management credential lookup bypassed the management integration authorization boundary

| Field | Value |
|---|---|
| Issue ID | I-061 |
| Title | Custom Supabase Management API credential lookup must re-check the management integration authorization boundary |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The custom `supabase.execute_sql` action was reached through authorization for the `supabase` integration, then directly read the `supabase-mgmt` OAuth credential. Because `supabase-mgmt` is a separate integration capability, this direct vault read could bypass its platform enablement, plan entitlement, organisation grant, and explicit agent scope. |
| Evidence | [architect-verified] Direct review of `src/modules/integrations/runtime/runner-helpers.ts` showed the Management credential lookup occurred without calling the authoritative execution authorization boundary for `supabase-mgmt`. |
| Correction | [architect/ChatGPT] The custom action now calls `assertIntegrationExecutionAuthorized({ integrationId: "supabase-mgmt", workspaceId, agentId })` before reading the Management credential. Unauthorized Management access therefore fails before credential retrieval. |
| Correction scope | `src/modules/integrations/runtime/runner-helpers.ts`; focused regression `src/modules/integrations/runtime/runner-helpers.test.ts` |
| Correction commits | Implementation `5f6d044a2ec1d8ddacaf9bde553f17576c14732e`; regression `3ebbbf7113e851a427d310aee2d3a057a6b8ba83` |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source review confirms Management credential retrieval is now downstream of the same fail-closed authorization contract used by direct execution; focused regression covers authorization-before-read. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06. |

## I-062 — I-2 Supabase Management API error body could expose a secondary credential

| Field | Value |
|---|---|
| Issue ID | I-062 |
| Title | Credential-bearing Supabase Management failures must not surface provider response bodies |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The custom `supabase.execute_sql` action correctly re-authorized the separate `supabase-mgmt` integration and preserved the executing agent scope, but its Management API error path included up to 500 characters of the provider response body in the thrown error. The secondary Management bearer token is resolved inside the custom action and is not part of the runner's primary integration credential set, so a provider that echoes that token in its error body could expose it through the returned error, XRay, or usage logging. |
| Evidence | [architect-verified] Direct source review of `src/modules/integrations/runtime/runner-helpers.ts` showed the `supabase-mgmt` token was read locally and the non-2xx path appended `res.text()` to the thrown error. The outer runner's known-secret collection only covers the primary `supabase` action auth. |
| Correction | [architect/ChatGPT] The credential-bearing Management API error path now reports only the HTTP status and never includes the provider response body. |
| Correction scope | `src/modules/integrations/runtime/runner-helpers.ts`; focused regression `src/modules/integrations/runtime/runner-helpers.test.ts` |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Correction commits | `40c410f8ee4542f44156c5fdf20fc7d21ff73004`; regression `eec44f0e478fc2eafe4302d7b857428369f1f43c` |
| Verification | [architect-verified] Source review confirms the Management API error no longer incorporates provider response bodies, and the focused regression supplies a response containing a sentinel Management token and asserts that token cannot appear in the thrown error. Executable Gate-C evidence remains pending. |
| Architect review status | `RESOLVED` — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] `40c410f8...` removes response-body propagation from the credential-bearing Management failure path; `eec44f0e...` adds the regression. |
| Resolution date | 2026-10-06 |

## I-063 — I-2 Supabase Management fallback required unnecessary secondary authorization

| Field | Value |
|---|---|
| Issue ID | I-063 |
| Title | Supabase service-role fallback must not require an unrelated Management OAuth grant |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The custom supabase.execute_sql action unconditionally re-authorized the separate supabase-mgmt integration before checking whether a Management connection existed. The action contract explicitly supports a service-role/PostgREST fallback when Management OAuth is unavailable, so tenants using only the Supabase service-role connection could be denied by an unrelated secondary integration capability. |
| Evidence | [architect-verified] Direct review of src/modules/integrations/runtime/runner-helpers.ts showed the supabase-mgmt authorization and credential lookup occurred before the fallback decision. |
| Correction | [architect/ChatGPT] credentialVault now exposes a tenant/user/agent-scoped active-connection existence check that does not decrypt credentials. The custom action uses that check first; only when an active supabase-mgmt connection exists does it re-authorize supabase-mgmt and read its credential. |
| Correction scope | src/modules/integrations/runtime/credential-vault.ts; src/modules/integrations/runtime/runner-helpers.ts; src/modules/integrations/runtime/runner-helpers.test.ts |
| Correction commits | 6719be8bec7cf9f6deeae30fb1c3ff01b108a9ea; aa99287f844c7b99c381666df98071878050e5f5; 457b07d7db82736a1b7724e4da1476ff9477fbe7 |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, schema/migration, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source review confirms the optional Management credential is not read and its authorization boundary is not invoked when no active Management connection exists. Focused regression covers the service-key fallback. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — correction independently reviewed by ChatGPT on 2026-10-06 |


## I-064 — I-2 AI integration tools could fail open on plan-resolution errors

| Field | Value |
|---|---|
| Issue ID | I-064 |
| Title | AI-visible integration capability checks must fail closed when plan entitlement cannot be resolved |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED — source correction architect-reviewed; executable verification pending |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The AI-visible integration_action and integration_availability tools used the UI-oriented getOrgPlanLimits helper, whose failure fallback can return free-plan limits. This created inconsistent fail-open behavior at the AI capability boundary when authoritative plan resolution failed, even though the runner execution boundary had already been hardened to deny on plan-resolution failure. |
| Evidence | [architect-verified] Direct source review of src/modules/ai-platform-core/integration-action-tool.ts and integration-ai-tools.ts showed both tools calling getOrgPlanLimits before plan allowlist evaluation. |
| Correction | [architect/ChatGPT] Both AI integration tools now use resolveOrgPlanLimits directly. integration_action returns PLAN_NOT_ENTITLED when entitlement resolution fails; integration_availability returns no capabilities without querying integration state when entitlement resolution fails. |
| Correction scope | src/modules/ai-platform-core/integration-action-tool.ts; src/modules/ai-platform-core/integration-action-tool.test.ts; src/modules/ai-platform-core/integration-ai-tools.ts; src/modules/ai-platform-core/integration-ai-tools.test.ts |
| Correction commits | 0f5c2ad1372be0c60ed72b11863b9aad8e48fda6; f394054afa6aa92e8c33ef5dbf7bb0554bf18730; c857a8777f0a9f6ea7f535734966b1d2546d1ca8; 305f59663e83ab8deea910b350c746c2af1420b6 |
| Explicit non-scope | No schema/migration, OAuth callback/transport expansion, provider rollout, MCP, billing, production promotion, or unrelated runtime refactor. |
| Verification | [architect-verified] Source review confirms the capability tools no longer use the fallback-capable plan helper. Focused regressions cover action-tool denial and availability suppression when plan resolution throws. Executable Gate-C evidence remains pending. |
| Architect review status | RESOLVED — source correction independently reviewed by ChatGPT on 2026-10-06. |
| Resolution evidence | [architect-verified] Current feature source at the post-correction tip imports resolveOrgPlanLimits in both AI integration tools and handles entitlement-resolution failure without exposing executable integration capability. |
| Resolution date | 2026-10-06 |


## I-065 — OAuth expiry cleanup must not overwrite an explicit connection disable

| Field | Value |
|---|---|
| Issue ID | I-065 |
| Title | OAuth expiry cleanup must preserve an explicit disabled/disconnected state |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | The credential vault `updateStatus(connectionId, orgId, status)` updated by connection id and organisation only. During OAuth expiry or invalid-grant cleanup, a concurrent tenant/admin disable or disconnect could therefore be overwritten to `expired`, losing the explicit administrative state. |
| Evidence | [architect-verified] Current feature source at the I-2 review tip showed `UPDATE integration_connections SET status=$1,updated_at=now() WHERE id=$2 AND org_id=$3` in `credential-vault.ts`. |
| Affected commit | Current feature tip before correction |
| Affected files/areas | `src/modules/integrations/runtime/credential-vault.ts`; focused vault regression |
| Acceptance criterion affected | I-2 credential/connection state integrity and fail-closed tenant lifecycle behavior |
| Security / tenancy impact | P1 correctness/tenant-control-plane impact; an explicit disable could be replaced by an automatic expiry state during a concurrent OAuth failure path. |
| Correction required | Make runner-initiated status transitions conditional on the connection remaining active, so an explicit disable/disconnect wins the race. |
| Correction scope | `src/modules/integrations/runtime/credential-vault.ts`; add focused regression test |
| Explicit non-scope | No OAuth callback/transport expansion, provider rollout, schema/migration, MCP, billing, production promotion, or unrelated runtime refactor. |
| Expected verification | Source review confirms the SQL status update requires `status='active'`; focused regression asserts the exact active-state predicate. |
| Developer correction commit | `c3ecd5d72940a2e8af4a53266e368c9d9e3dc8f7` — `fix(integrations): preserve disabled state during oauth expiry` |
| Regression commit | `ac162b6ce439861c0c2ac9a2650971cd79411ef7` — `test(integrations): protect disabled connections from expiry overwrite` |
| Architect review | [architect-verified] Source correction and focused regression reviewed on 2026-10-06; I-065 RESOLVED. |
| Verification status | Executable Gate-C evidence remains pending; this issue itself is resolved by source review. |



## I-066 — Integration mutation authorization must fail closed on plan-resolution errors

| Field | Value |
|---|---|
| Issue ID | I-066 |
| Title | Organisation/agent integration mutation entitlement checks must not fall back to free plan on resolution failure |
| Phase | Integrations I-2 |
| Severity | P1 |
| Status | RESOLVED |
| Date identified | 2026-10-06 |
| Reporter / role | ChatGPT — architect review / implementation owner |
| Finding | Organisation enable/connect and agent integration enable mutation routes used `getOrgPlanLimits()`, whose documented failure fallback returns free-plan limits. A plan-resolution/database failure could therefore reach entitlement evaluation using synthetic free-plan state rather than failing closed. |
| Evidence | [architect-verified] Current feature source showed `getOrgPlanLimits()` in both mutation authorization paths while `resolveOrgPlanLimits()` is the authoritative fail-closed resolver used by the runtime execution boundary. |
| Affected commit | Current feature tip before correction |
| Affected files/areas | `src/app/api/orgs/[orgId]/integrations/route.ts`; `src/app/api/orgs/[orgId]/agents/[agentId]/integrations/route.ts`; focused route tests |
| Acceptance criterion affected | I-2 plan entitlement enforcement and fail-closed authorization |
| Security / tenancy impact | P1 authorization impact: entitlement could be evaluated from fallback state when authoritative plan resolution fails. |
| Correction required | Use `resolveOrgPlanLimits()` for enable/connect mutation authorization and return a non-success response when entitlement cannot be verified. |
| Correction scope | Two integration mutation routes and their focused tests only. |
| Explicit non-scope | No read-only UI plan helpers, OAuth callback/transport expansion, provider rollout, schema/migration, MCP, billing, production promotion, or unrelated refactor. |
| Expected verification | Source review confirms mutation paths use `resolveOrgPlanLimits()`; focused regressions prove plan-resolution failures return 503 and do not mutate integrations. |
| Developer correction commits | `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98` |
| Regression commits | `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750` |
| Architect review | [architect-verified] Source correction and focused regressions reviewed on 2026-10-06; I-066 RESOLVED. |
| Verification status | Executable Gate-C evidence remains pending; this issue itself is resolved by source review. |

