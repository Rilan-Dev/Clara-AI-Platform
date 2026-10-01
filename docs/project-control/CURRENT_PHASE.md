# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-01**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence register + the durable verification and phase-gate contract), `VERIFICATION_CHECKLIST.md` (canonical checklist/template), repository-root `worklog.md` (canonical historical audit trail), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan).

> **Closure state (2026-10-01):** Phase 5 is **`CLOSED`** — architect review outcome **`PASS`** (architect ChatGPT; developer Z.AI; reviewed implementation commit `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef` — the corrected Phase 5 implementation, the immediate child of the Phase 5 implementation commit `f9ce6a833bc67205384e17bb92433c78967f4363`; verified relationship `f9ce6a83 → fb4ad5f5`; the architect's first review of the implementation as first delivered had returned `CORRECTION_REQUIRED` — the P0-policy contradiction — corrected by that commit and then re-reviewed `PASS`). This document now preserves the Phase 5 contract as reviewed, plus the closure record below. **Phase 6 is the next phase and the next authorized phase; it has NOT started**; it receives its own contract when the architect issues the Phase 6 handoff. No phase is currently active.

## Phase identity

| Field | Value |
|---|---|
| Phase number | **5** |
| Phase name | **Verification and Phase-Gate System** |
| Full designation | **Phase 5 — Verification and Phase-Gate System** |
| Status | **CLOSED** — architect re-review `PASS` (2026-10-01): first review `CORRECTION_REQUIRED` → P0-policy correction `fb4ad5f5` → re-review `PASS` → closed. Phase 6 is the next phase and the next authorized phase; it has NOT started (no Phase 6 handoff issued; only ChatGPT may authorize Phase 6) |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 5 implementation handoff received from ChatGPT on 2026-10-01 (baseline `8d8595d0`; the Phase 4 closure-evidence correction accepted — Phase 4 stands `CLOSED`; latest verified commit then `5febaacd`). Fully executed by Z.AI — implementation, then the architect-directed P0-policy correction — and closed by the architect's `PASS` re-review (2026-10-01). The handoff remains materialized in `ZAI_HANDOFF.md` Part II (status `CLOSED`). **No handoff is active; Z.AI must not begin Phase 6 (or any product work) without a new architect-issued handoff** |

**Only ChatGPT/project-owner review can close the phase — and it has.** This phase was closed by the architect's `PASS` re-review on 2026-10-01 (a developer completion claim never closes a phase; only a `PASS` review outcome does — D-009, binding under the contract this phase establishes, D-020). The contract below is preserved as the reviewed record of what Phase 5 was; the phase is not reopened except by architect direction, and a `CORRECTION_REQUIRED` outcome on the closure record itself would trigger a corrective handoff per `ZAI_HANDOFF.md` §I.5.

## Objective

Implement the **Verification and Phase-Gate System** defined by the project-control plan: a durable verification contract, a canonical checklist/template, a deterministic closure-rule demonstration, and the phase-gate requirements and closure conditions recorded here — so that, under the documented project-control process, it becomes impossible to treat tests alone, a developer claim, a successful build, a clean Git tree, or a successful deployment as sufficient evidence for phase closure when additional verification gates are required (plan Phase 5 acceptance: **"Tests passed" alone cannot falsely close a phase when review/deployment/database evidence is required**).

## Scope (approved)

1. Extend `VERIFICATION_STATE.md` with a durable verification contract (binding on closure evidence from Phase 5 onward).
2. Extend `CURRENT_PHASE.md` (this file) with the Phase-Gate requirements and closure conditions.
3. Create one canonical verification checklist/template under `docs/project-control/` (`VERIFICATION_CHECKLIST.md`).
4. Update the root `worklog.md` with the Phase 5 implementation entry.
5. Reconcile the current-state documents to Phase 5 `IN_PROGRESS`: `PROJECT_STATE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II instance replacement per §I.12 / D-016), `VERIFICATION_STATE.md`, `CURRENT_PHASE.md`.
6. Define the review-outcome contract: `PASS`, `PASS_WITH_FOLLOWUP`, `CORRECTION_REQUIRED` (binding semantics).
7. Define the P0/P1 blocker rule.
8. Define the phase-close checklist.
9. Define gate applicability so database/deployment gates are required only when the phase actually changes those surfaces.
10. Add a deterministic test demonstrating that an incomplete verification state cannot legitimately be represented as `CLOSED` (`docs/project-control/verification/phase-closure-eligibility-test.sh`).

Consequential (entailed by the deliverables, per the established pattern): `DECISIONS.md` D-020 (the system's establishment as a binding decision); session record `SESSION-006.md` + its `sessions/README.md` index row (per D-019).

## Required verification model (the Gates A–F — full contract in VERIFICATION_STATE.md; templates in VERIFICATION_CHECKLIST.md)

- **Gate A — Scope verification** (required every phase): record planned scope; actual changed paths; unexpected paths; explicit non-scope confirmation; immutable-source check; production-branch check. **A scope mismatch prevents `PASS`.**
- **Gate B — Implementation verification** (required every phase): record implementation commit; parent commit; expected files; actual files; implementation requirements; requirement-by-requirement status. Developer assertions are labeled `[developer-reported]`.
- **Gate C — Test verification** (required every phase): record per test/check — name; command; expected result; actual result; pass/fail; environment/context; developer-reported vs architect-verified status. **"Tests passed" must not automatically imply phase completion.**
- **Gate D — Code-review verification** (required every phase; architect-only): record architect review status; reviewed commit; reviewed diff; architecture conformity; security concerns; tenancy concerns; regression concerns; unresolved findings. **Only actual ChatGPT review may produce `architect-verified` review evidence; a developer self-review never satisfies Gate D.**
- **Gate E — Database verification** (applicability-conditional): applicability recorded; when required — migration evidence; schema evidence; RLS/security evidence; runtime query evidence; rollback/recovery evidence. **Never claim database verification when none occurred.** For this documentation-only phase: **Gate E = `NOT_APPLICABLE`** (assessed and recorded).
- **Gate F — Deployment verification** (applicability-conditional): applicability recorded; when required — target; deployment URL; commit SHA; build result; runtime result; smoke verification; rollback/escalation result. **A local build is never deployment verification.** For this phase: **Gate F = `NOT_APPLICABLE`** (assessed and recorded).

## Review outcomes and closure conditions

- **`PASS`** — all required gates passed; no blocking P0/P1 issue remains. The architect **may** close the phase (closure is never automatic).
- **`PASS_WITH_FOLLOWUP`** — accepted with explicitly recorded follow-up work; the phase remains open unless the project-control rules explicitly permit closure under the documented follow-up policy; **never silently converted into `PASS`**.
- **`CORRECTION_REQUIRED`** — a blocking defect, divergence, incomplete requirement, security concern, or evidence problem was identified; the phase remains open; the corrective handoff must identify finding, evidence, exact corrective scope, non-scope, expected verification, and stopping boundary.

**P0/P1 blocker rule:** P0 (critical issue preventing safe continuation or invalidating the phase result — e.g. security-critical defect, tenant-isolation failure, destructive uncontrolled behavior, corrupted authoritative state, false verification/closure evidence) **prevents phase closure — always; there is no P0 exception path.** An architect decision may document acknowledgement, remediation, escalation, or other operational handling of a recorded P0, but it must **not** authorize phase closure while the P0 remains recorded. P1 (high-severity issue materially affecting correctness, security, reliability, or an acceptance criterion) **prevents `PASS`** unless an explicitly recorded architect-approved exception exists. Exceptions are never invented by the developer.

**Closure eligibility (deterministic):** all required gates `PASS` per applicability; conditional gates `PASS` or recorded `NOT_APPLICABLE` with no applicability mismatch; Gate D `PASS` is `[architect-verified]`; P0 = 0; P1 = 0 or architect-approved exceptions recorded; no unresolved blocking correction; Final State Contract consistent (rules R1–R7, `VERIFICATION_CHECKLIST.md` §8). Representing a phase as `CLOSED` outside these conditions is a false-closure defect (P0-class).

**Phase-close checklist:** the reusable 22-item checklist is `VERIFICATION_CHECKLIST.md` §7 (correct phase / baseline / implementation commit; scope and non-scope; required gates; database and deployment gates assessed; security and tenancy review; P0/P1 counts; no unresolved blocking correction; Final State Contract; worklog; evidence classification; commit SHA; clean tree; remote sync; no later phase started). **The checklist itself does not close a phase; only ChatGPT's review does.**

## Deliberately incomplete-phase test (required deliverable)

`docs/project-control/verification/phase-closure-eligibility-test.sh` — deterministic, read-only, self-contained, no application dependency. It evaluates a deliberately incomplete verification state (required Gate D missing, while `TESTS_PASSED=yes` and `DEVELOPER_COMPLETION_CLAIM=yes`) → **closure eligibility = FAIL**; then a complete applicable-gate state (Gate D architect-verified; E/F recorded `NOT_APPLICABLE`) → **closure eligibility = PASS**; plus six further cases (P0 blocker; unhandled P1; P1 with architect-approved exception; developer-reported Gate D; database-applicability mismatch; open blocking correction). Expected result at commit time: **8/8 determinations correct, exit status 0**. The worked examples (1 and 2) are documented in `VERIFICATION_CHECKLIST.md` §9.

## Non-scope (explicit)

- **Do NOT** modify `src/` or `packages/`; do not implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, or any application provider behavior.
- **Do NOT** modify database schema, create migrations, execute Supabase mutations, or execute Vercel deployments; do not modify `vercel.json`.
- **Do NOT** modify production branches (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); do not rewrite, revert, or amend `b65725e5`.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`); do not place Phase 5 material into the library-scoped `docs/doable-source/WORKLOG.md`.
- **Do NOT** resolve R-3, R-4, or R-5, or rotate credentials/tokens (the R-5 exposed Vercel token is referenced but never reproduced).
- **Do NOT** change existing architecture decisions; do not silently resolve I-001 or I-007.
- **Do NOT** create Phase 6 artifacts, product-feature specifications, or product-feature implementation plans; do not implement any Clara product capability.
- **Do NOT** introduce secrets, API keys, access tokens, credentials, private chain-of-thought, or sensitive runtime payloads into any control document.

Phase 5 is a **project-control/governance phase only**.

## Prerequisites (all satisfied 2026-10-01)

1. Phase 4 `CLOSED` — architect review `PASS` (2026-10-01) on implementation commit `5febaacd5dcc55268904d1371038bbe8ff372040`; closure record `16b89a946d0848884ff74ffb435693402fc31a52` ("docs: record architect approval of phase 4"); the closure record's evidence-classification correction `8d8595d0a994510da217af6d12225e3f1d00b2fd` ("docs: correct phase 4 closure evidence classification") **accepted by the architect — Phase 4 stands `CLOSED`**.
2. The Phase 5 implementation handoff issued 2026-10-01: baseline `8d8595d0` (current repository tip at issuance); the latest architect-verified implementation remains `5febaacd` — later documentation commits (closure record, correction, and this implementation) are not to be confused with it.
3. Mandatory initialization completed by the developer on 2026-10-01: all required documents read; repository state refreshed and verified per `ZAI_HANDOFF.md` §I.6 (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; HEAD `8d8595d0` = origin tip, clean tree; 18 ahead / 0 behind `Vite-Converted`; mainlines unchanged; `b65725e5` ancestry intact; `vercel.json` unchanged) — confirmed from repository evidence, not chat memory.

## Required deliverables

- The durable verification and phase-gate contract in `VERIFICATION_STATE.md` (gates A–F with required records and satisfaction rules; gate applicability; binding review-outcome semantics; the P0/P1 blocker rule; closure eligibility R1–R7; evidence-class obligations).
- `docs/project-control/VERIFICATION_CHECKLIST.md` — the canonical verification checklist/template (five never-sufficient-alone evidences; per-gate record templates; applicability worksheet; outcome/P0/P1 summaries; the 22-item phase-close checklist; closure-eligibility rules; worked Examples 1 and 2).
- `docs/project-control/verification/phase-closure-eligibility-test.sh` — the deterministic closure-rule demonstration (incomplete → FAIL; complete → PASS; six further blocker/evidence-class/applicability cases).
- This file — the Phase 5 contract with the Phase-Gate requirements and closure conditions.
- Reconciled Final State Contract: all five members + the latest `worklog.md` entry at Phase 5 — Verification and Phase-Gate System, `IN_PROGRESS`; baseline `8d8595d0`; latest verified commit `5febaacd`.
- The `worklog.md` Phase 5 implementation entry; consequential `DECISIONS.md` D-020 and `SESSION-006` session record.

## Acceptance criteria (pass/fail — evaluated by the architect at review)

1. Verification evidence has a durable schema (the contract's gates, fields, and status values) — PASS/FAIL.
2. Developer and architect evidence are explicitly separated everywhere — PASS/FAIL.
3. Implementation verification is defined (Gate B) — PASS/FAIL.
4. Test verification is defined (Gate C) — PASS/FAIL.
5. Code-review verification is defined (Gate D) — PASS/FAIL.
6. Database verification applicability is defined (Gate E, with this phase's `NOT_APPLICABLE` recorded) — PASS/FAIL.
7. Deployment verification applicability is defined (Gate F, with this phase's `NOT_APPLICABLE` recorded) — PASS/FAIL.
8. `PASS`, `PASS_WITH_FOLLOWUP`, and `CORRECTION_REQUIRED` are defined with binding semantics — PASS/FAIL.
9. P0/P1 closure blocking is defined — PASS/FAIL.
10. The phase-close checklist exists — PASS/FAIL.
11. The deliberately incomplete phase fails closure eligibility (deterministic test case-1 / Example 1) — PASS/FAIL.
12. The complete applicable-gate example passes closure eligibility (deterministic test case-2 / Example 2) — PASS/FAIL.
13. No duplicate source of truth is introduced — PASS/FAIL.
14. No secrets/private reasoning are introduced — PASS/FAIL.
15. No product/DB/deployment/immutable-source changes occur — PASS/FAIL.
16. The Final State Contract is consistent (Phase 5 `IN_PROGRESS` across all members + worklog) — PASS/FAIL.
17. The worklog records the Phase 5 implementation — PASS/FAIL.
18. The commit is pushed and local/remote synchronized — PASS/FAIL.
19. Z.AI stops at the Phase 5 review boundary — PASS/FAIL.

## Verification requirements (developer, before commit — the handoff's 25 checks)

(1) Phase 5 required documents exist; (2) the verification checklist/template exists; (3) required verification fields exist; (4) all three review outcomes exist; (5) the P0/P1 blocker policy exists; (6) the implementation gate exists; (7) the test gate exists; (8) the code-review gate exists; (9) database applicability/gate exists; (10) deployment applicability/gate exists; (11) the phase-close checklist exists; (12) the deliberately incomplete phase cannot be marked closure-eligible; (13) the complete example can be closure-eligible; (14) developer/architect evidence separation exists; (15) no competing current-state source is introduced; (16) no secrets introduced; (17) no product source changed; (18) no DB/migration files changed; (19) no `vercel.json` change; (20) immutable Doable-source trees unchanged; (21) the Final State Contract is consistent; (22) the worklog contains the Phase 5 implementation entry; (23) the full Git diff is inspected; (24) the working tree is clean after commit; (25) the branch is synchronized with origin. Plus `npm run validate:model-config` where appropriate — **explicitly not interpreted as sufficient phase verification** (it is itself only one Gate C input). Commands and results: `VERIFICATION_STATE.md` §Phase 5. The reusable aggregate validation script remains outside the repository (`/home/z/my-project/scripts/validate-phase5-control-docs.sh`), per the Phase 3/4 convention.

## Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads in any control document (plan Global Constraints). The exposed Vercel token (R-5) is referenced but never reproduced.
- No fabricated timestamps; no unsupported claims; observable evidence only.
- Evidence classes per D-012: a future or intended ChatGPT review is never written as already completed; a command Z.AI executed is never claimed on ChatGPT's behalf.
- The `b65725e5` provenance remains **not independently established** — never described as confirmed owner authorship.
- This phase is documentation-only and touches no application security/tenancy surface.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused documentation-only implementation commit: `docs: establish phase 5 verification and phase gates` — the immediate child of `8d8595d0`; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`. No unrelated changes ride along; no squashing of unrelated history.
- One focused documentation-only corrective commit, architect-authorized by the `CORRECTION_REQUIRED` corrective handoff (2026-10-01, correction baseline `f9ce6a833bc67205384e17bb92433c78967f4363`): `docs: correct phase 5 p0 closure policy` — the immediate child of the Phase 5 implementation commit, under the same path constraints; push normally, no force-push.
- One focused documentation-only closure commit, architect-directed by the Phase 5 closure handoff (2026-10-01, reviewed implementation `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`): `docs: record architect approval of phase 5` — the immediate child of the corrective commit `fb4ad5f5`, under the same path constraints (the repository-root `worklog.md` and `docs/project-control/**` only); push normally, no force-push.
- `b65725e5` is not modified, rewritten, reverted, or amended; `vercel.json` is not touched; the baseline commit is not amended.

## Stopping boundary

The implementation boundary, the corrective boundary, and the closure were all reached on 2026-10-01. The closure record (this commit — `docs: record architect approval of phase 5`, the immediate child of `fb4ad5f5`) is the final Phase 5 artifact; after its commit, push, and evidence report, **Z.AI STOPs at the inter-phase boundary**: no Phase 6, no Phase 6 implementation artifacts, product-feature specifications, or implementation plans, no product implementation (no Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode), no deployment or database operations, no `vercel.json`/Vercel changes, no R-3/R-4/R-5 resolution — until the architect reviews the closure record and issues the explicit Phase 6 handoff. **Only ChatGPT may authorize Phase 6.** If the closure-record review returns `CORRECTION_REQUIRED`, Z.AI acts only on the corrective handoff (`ZAI_HANDOFF.md` §I.5). A fresh ChatGPT session resuming leadership mid-boundary follows `CHAT_CONTINUITY.md` §5.

## Closure record (2026-10-01)

**Architect review of Phase 5 — outcome `PASS` → Phase 5 `CLOSED`.** Architect: **ChatGPT**. Developer: **Z.AI**. Reviewed implementation commit: `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef` ("docs: correct phase 5 p0 closure policy" — the corrected Phase 5 implementation; the immediate child of the Phase 5 implementation commit `f9ce6a833bc67205384e17bb92433c78967f4363`; verified relationship `f9ce6a83 → fb4ad5f5`). The architect's first review of the Phase 5 implementation (2026-10-01) returned `CORRECTION_REQUIRED` (the P0-policy contradiction); the corrective commit delivered the correction; the architect's re-review of the corrected state returned `PASS`. Scope verification: documentation-only; the corrected state satisfies the Phase 5 acceptance criteria — the canonical P0 policy is unambiguous (P0 prevents phase closure — always; there is no P0 exception path), the P1 exception mechanism is unchanged, and the deterministic P0 case still computes closure eligibility `FAIL`. The closure handoff supplies no separate review timestamp; none is fabricated. [architect-verified — as communicated by the architect in the Phase 5 closure handoff]

**Phase 6 is the next phase (per the plan) and the next authorized phase; it has NOT started.** No Phase 6 handoff has been issued; no Phase 6 implementation has been performed; no product implementation has been performed. [architect-verified]

The closure record is committed as `docs: record architect approval of phase 5` (this commit — the immediate child of `fb4ad5f5`), which reconciled this contract and the sibling Final State Contract members to Phase 5 `CLOSED`, appended the append-only worklog closure entry (the historical `IN_PROGRESS` entry preserved unrewritten, including its corrective-cycle note), and recorded the session audit record `SESSION-007`. The closure-record commit itself is **not** the reviewed implementation — the reviewed implementation is `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`, and it is not replaced by the closure-record SHA in any field identifying the reviewed implementation. The `b65725e5` classification is preserved exactly: provenance **not independently established** — never described as confirmed owner authorship; not modified, amended, reverted, or rewritten; `vercel.json` non-scope. Z.AI STOPs at the inter-phase boundary, awaiting the architect's review of the closure record and the explicit Phase 6 handoff. [developer-reported]
