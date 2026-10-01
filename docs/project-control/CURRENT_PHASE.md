# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-01**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence register + the durable verification and phase-gate contract + the durable correction and issue-control workflow), `VERIFICATION_CHECKLIST.md` (canonical checklist/template), `ISSUES.md` (the durable issue register + the canonical issue-control system), repository-root `worklog.md` (canonical historical audit trail), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan).

> **Phase state (2026-10-01):** Phase 5 — Verification and Phase-Gate System is **`CLOSED`** (architect re-review `PASS`, 2026-10-01; reviewed implementation `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`; closure record `f62326dbe1940a2a518567d66e720a4b407dbf26` — the Phase 6 baseline; the Phase 5 contract is preserved as reviewed in Git history at `f62326db`). **Phase 6 — Correction and Issue-Control Workflow is `IN_PROGRESS`**: the developer implementation is complete (implementation commit `c0cca964064286c25dcf22c8f86038baaacd7ebe`, developer-reported); the architect's first review of it (2026-10-01) returned **`CORRECTION_REQUIRED`** — issue **I-013** (P1: the P2/P3 closure-exception contradiction) with corrective handoff **CH-001** (correction baseline `c0cca964`); the correction is delivered and submitted (developer-reported, this correction commit); **the architect's re-review is PENDING** — no architect approval of the corrected Phase 6 is claimed. Phase 7 has NOT started; only ChatGPT may authorize Phase 7.

## Phase identity

| Field | Value |
|---|---|
| Phase number | **6** |
| Phase name | **Correction and Issue-Control Workflow** |
| Full designation | **Phase 6 — Correction and Issue-Control Workflow** |
| Status | **IN_PROGRESS** — implementation complete; the architect's first review returned `CORRECTION_REQUIRED` (2026-10-01; issue I-013; corrective handoff CH-001 received and executed); the correction is submitted (developer-reported); **the architect re-review is PENDING** (Gate D; no architect approval of the corrected Phase 6 is claimed) |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 6 implementation handoff received from ChatGPT on 2026-10-01 (baseline `f62326db` = the Phase 5 closure-record commit; the latest architect-verified implementation remains `fb4ad5f5`); materialized as `ZAI_HANDOFF.md` Part II (the instance now superseded — recoverable in Git history at `c0cca964`). **Corrective handoff CH-001 (issue I-013, severity P1) received 2026-10-01** — correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe` (the Phase 6 implementation commit) — and executed; its instance is now the active `ZAI_HANDOFF.md` Part II; the issue stands at `REVIEW_PENDING` |
| Baseline commit | `f62326dbe1940a2a518567d66e720a4b407dbf26` (implementation) · `c0cca964064286c25dcf22c8f86038baaacd7ebe` (correction — the Phase 6 implementation commit; the correction commit is its immediate child) |

**Only ChatGPT/project-owner review can close this phase.** A developer completion claim never closes a phase; only a `PASS` review outcome does (D-009, binding under the Phase 5 verification and phase-gate contract — D-020 — and consistent with the correction workflow this phase establishes).

## Objective

Establish a durable, repeatable **Correction and Issue-Control Workflow** so that whenever ChatGPT identifies a defect, divergence, incomplete requirement, regression, security concern, evidence problem, or other blocking issue in Z.AI work, the issue can be traced end-to-end — **architect finding → issue record → corrective handoff → bounded Z.AI correction → developer verification → correction commit → architect re-review → issue resolution / phase closure** — without relying on previous chat history, and so that corrective work can never silently expand into unrelated implementation (plan Phase 6 acceptance: "Every correction is traceable end-to-end").

## Scope (approved)

1. `docs/project-control/ISSUES.md` — the canonical issue-control system: severity model (P0–P3), issue lifecycle with valid transitions/authority/evidence, the canonical issue-record schema, the issue/phase status relationship, traceability requirements, and the legacy-entry mapping (I-001…I-012 preserved unrewritten).
2. `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — the single canonical correction-handoff form (all 22 required sections; the bounded-scope statement; correction integrity rules; STOP boundary).
3. `docs/project-control/VERIFICATION_STATE.md` — the durable correction-workflow section (mapping onto the Phase 5 verification contract — no second verification system) + the Phase 6 evidence section + the reconciled consistency table + appendix Phase 6 commands.
4. `docs/project-control/CURRENT_PHASE.md` (this file) — the Phase 6 contract.
5. `docs/project-control/ZAI_HANDOFF.md` — Part II instance replacement (Phase 6); Part I pointer updates strictly required by the template's creation (§I.5/§I.12).
6. `worklog.md` — the Phase 6 implementation entry (append-only).
7. Session documentation: `docs/project-control/sessions/SESSION-008.md` + its `README.md` index row (per the Phase 4 conventions).
8. Deterministic validation: `docs/project-control/verification/correction-cycle-test.sh` (Examples A–D + severity-model edge cases).
9. Consequential (entailed by the Final State Contract consistency requirement, acceptance criterion 22, per the Phase 4/5 reconciliation convention): `PROJECT_STATE.md` and `NEXT_ACTION.md` reconciled to Phase 6 `IN_PROGRESS`; `templates/PHASE_HANDOFF_TEMPLATE.md` appendix pointer updated (the corrective variant is superseded by the dedicated template — preventing two competing correction formats).

## Correction-workflow model (summary — canonical rules elsewhere; this file is the Phase 6 contract, not an issue database)

- **Issue lifecycle** (canonical in `ISSUES.md` §2): `OPEN → TRIAGED → CORRECTION_REQUIRED → CORRECTION_IN_PROGRESS → CORRECTION_SUBMITTED → REVIEW_PENDING → RESOLVED`, with `WONT_FIX` / `DEFERRED` / `BLOCKED` as architect-directed terminal/non-progress states and `REVIEW_PENDING → CORRECTION_REQUIRED` as the repeat-cycle path. Each transition has a defined authority (architect-only vs developer) and required evidence; `RESOLVED` always requires `[architect-verified]` resolution evidence.
- **Severity model** (canonical in `ISSUES.md` §1): P0/P1 semantics remain authoritative in the Phase 5 verification contract (`VERIFICATION_STATE.md` §"P0/P1 blocker rule") — **P0 prevents phase closure, always; there is no P0 exception path; P1 prevents `PASS` unless an explicitly recorded architect-approved exception exists**. P2/P3 do not automatically block phase closure; if a P2/P3 violates an active phase acceptance criterion or another explicit blocking condition, it becomes a blocking issue and remains closure-blocking while unresolved and must be resolved before the phase can close — **Phase 6 introduces no P2/P3 exception mechanism** (a recorded architect-approved exception exists for P1 only and has no clearing effect for P2/P3; corrected 2026-10-01 per issue I-013 / CH-001).
- **Correction handoff relationship**: a `CORRECTION_REQUIRED` architect review outcome opens/traces an issue; the corrective handoff is materialized from `templates/CORRECTION_HANDOFF_TEMPLATE.md` into `ZAI_HANDOFF.md` Part II (referencing the issue ID); **a correction handoff authorizes only the corrective scope — it does not authorize unrelated improvements or the next phase**.
- **Issue/phase status relationship** (canonical table in `ISSUES.md` §4): a blocking correction open → the phase cannot become `CLOSED`; `CORRECTION_SUBMITTED`/`REVIEW_PENDING` → the phase remains `IN_PROGRESS` awaiting re-review; issue `RESOLVED` → the phase **may** close only if all other Phase-Gate conditions (R1–R7) hold and ChatGPT returns `PASS`. **A developer correction commit never independently closes the issue or the phase.**
- **Traceability** (canonical in `ISSUES.md` §5 and `VERIFICATION_STATE.md` §"Correction and issue-control workflow"): issue ID → finding → handoff (CH-NNN) → baseline SHA → correction commit → verification evidence → architect re-review → resolution; only architect verification establishes `architect-verified` resolution.
- **Deterministic demonstration**: `docs/project-control/verification/correction-cycle-test.sh` — Example A (correction required; no automatic resolution), Example B (correction accepted via architect-verified evidence only), Example C (scope-expansion attempt rejected), Example D (P0 remains closure-blocking even with corrective work otherwise complete); severity-model edge cases (corrected 2026-10-01 per I-013/CH-001: a P1 DEFERRED with an architect-approved exception does not block; non-acceptance-violating P2/P3 do not automatically block closure; acceptance-violating P2 and P3 block while unresolved; an unresolved acceptance-violating P2/P3 with an alleged architect exception remains closure-ineligible — no P2/P3 exception path).

## Non-scope (explicit)

- **Do NOT** modify `src/**`, `packages/**`, `supabase/**`, `migrations/**`, or `vercel.json`; do not implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, analytics, usage monitoring, voice, RAG, provider functionality, or any UI/product feature.
- **Do NOT** modify database schema; execute Supabase mutations; deploy to Vercel; modify deployment configuration or production branches (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); modify the immutable Doable-source trees; modify or rewrite `b65725e5`.
- **Do NOT** resolve R-3/R-4/R-5; rotate credentials; introduce secrets; introduce private chain-of-thought; refactor unrelated control documents.
- **Do NOT** rewrite the historical Phase 4/Phase 5 correction records (`SESSION-005.md`, `SESSION-006.md`, the `VERIFICATION_STATE.md` Phase 5 corrective-cycle records, the `worklog.md` historical entries) — they stand as recorded.
- **Do NOT** begin Phase 7, Phase 10, or any Clara feature work.
- **Do NOT** create competing sources of truth (one issue register, one correction template, one correction-cycle test, one verification contract).

Phase 6 is a **project-control/governance phase only**.

## Prerequisites (all satisfied 2026-10-01)

1. Phase 5 `CLOSED` — architect re-review `PASS` (2026-10-01) on the corrected implementation `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`; closure record `f62326dbe1940a2a518567d66e720a4b407dbf26` (the Phase 6 baseline).
2. The Phase 6 implementation handoff issued by ChatGPT on 2026-10-01 with baseline `f62326db` (the repository tip at issuance).
3. Mandatory initialization completed by the developer on 2026-10-01: all required documents read; repository state refreshed and verified per `ZAI_HANDOFF.md` §I.6 (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; HEAD `f62326db` = origin tip, clean tree; mainlines unchanged; `b65725e5` ancestry intact; `vercel.json` unchanged) — confirmed from repository evidence, not chat memory.

## Required deliverables

- `ISSUES.md` §"Issue-control system" (severity model; lifecycle; schema; status relationship; traceability; legacy mapping) + the (currently empty) §"Issue records (canonical schema)" section.
- `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — the canonical correction-handoff template.
- `VERIFICATION_STATE.md` §"Correction and issue-control workflow (durable)" + the Phase 6 evidence section + the consistency table + appendix commands.
- `docs/project-control/verification/correction-cycle-test.sh` — the deterministic correction-cycle demonstration (Examples A–D).
- This file — the Phase 6 contract.
- `ZAI_HANDOFF.md` Part II — the Phase 6 handoff instance.
- Reconciled Final State Contract: all five members + the latest `worklog.md` entry at Phase 6 — Correction and Issue-Control Workflow, `IN_PROGRESS`; baseline `f62326db`; latest verified commit `fb4ad5f5`.
- `worklog.md` Phase 6 implementation entry; session record `SESSION-008.md` + its index row.

## Acceptance criteria (pass/fail — evaluated by the architect at review)

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

## Verification requirements (developer, before commit)

(1) `npm run validate:model-config` — run (explicitly **not** interpreted as sufficient phase verification); (2) the Phase 5 deterministic test as a regression check — `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → 8/8 determinations correct, exit 0, **P0 present → closure eligibility FAIL** verified; (3) the Phase 6 deterministic test — `bash docs/project-control/verification/correction-cycle-test.sh` → 24/24 determinations correct, exit 0 (as corrected by the Phase 6 correction CH-001 — the original 19-determination model was superseded; the corrected model proves the P2/P3 closure semantics incl. the rejection of an unresolved acceptance-violating P2/P3 with an alleged exception); (4) correction-template completeness check (all 22 sections; the bounded-scope statement; integrity rules); (5) issue-lifecycle consistency check (schema/lifecycle/severity present; legacy entries preserved unrewritten); (6) complete Git diff inspection; (7) changed-path scope check; (8) immutable-source check; (9) production-branch check; (10) secret-pattern scan; (11) Final State Contract consistency check. Commands and results: `VERIFICATION_STATE.md` §Phase 6 (+ §Phase 6 correction validation). The reusable aggregate validation scripts remain outside the repository (`/home/z/my-project/scripts/validate-phase6-control-docs.sh`; `/home/z/my-project/scripts/validate-phase6-p2p3-correction.sh`), per the Phase 3/4/5 convention.

## Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads in any control document (plan Global Constraints). The correction system must never store them: evidence describes observable facts; a defect involving credentials is described without reproducing them. The exposed Vercel token (R-5) is referenced but never reproduced, per the existing project-control rules.
- No fabricated timestamps; no unsupported claims; observable evidence only.
- Evidence classes per D-012: a future or intended ChatGPT review is never written as already completed; a command Z.AI executed is never claimed on ChatGPT's behalf.
- The `b65725e5` provenance remains **not independently established** — never described as confirmed owner authorship.
- This phase is documentation-only and touches no application security/tenancy surface.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused documentation-only implementation commit: `docs: establish phase 6 correction and issue control` — the immediate child of `f62326dbe1940a2a518567d66e720a4b407dbf26` — delivered 2026-10-01 (implementation commit `c0cca964064286c25dcf22c8f86038baaacd7ebe`). The corrective cycle (issue I-013 / CH-001) adds exactly one focused documentation-only correction commit: `docs: correct phase 6 p2 p3 closure policy` — the immediate child of `c0cca964` — with changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`. No unrelated changes ride along; no squashing of unrelated history.
- `b65725e5` is not modified, rewritten, reverted, or amended; `vercel.json` is not touched; the baseline commit is not amended.

## Stopping boundary

After the Phase 6 implementation, validation, commit, push, and completion report: **Z.AI STOPs at the phase boundary** — no Phase 7 (or any later phase), no Vercel operations, no Supabase operations, no product-feature specifications, no Multi-Provider / Unified Tool Runtime / Integrations / MCP / Agent Runtime / Agent Work Mode / Memory / Skills implementation, no modification of Clara application code, no R-3/R-4/R-5 resolution, no `b65725e5`/`vercel.json` changes — awaiting ChatGPT's independent review of the Phase 6 implementation. If the review returns `CORRECTION_REQUIRED`, the corrective handoff is executed per the correction workflow this phase establishes (`ZAI_HANDOFF.md` §I.5; the issue record per `ISSUES.md`; the template per `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md`) — and the correction itself is bounded by the same STOP discipline. **Only ChatGPT may close Phase 6 and authorize Phase 7.** A fresh ChatGPT session resuming leadership mid-boundary follows `CHAT_CONTINUITY.md` §5.
