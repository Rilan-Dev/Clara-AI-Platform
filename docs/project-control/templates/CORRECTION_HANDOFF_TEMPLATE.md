# CORRECTION_HANDOFF_TEMPLATE.md — Canonical Blank Correction-Handoff Form

> **The single authoritative template for corrective handoffs** (established by Phase 6 — Correction and Issue-Control Workflow, 2026-10-01; plan Phase 6; the durable workflow contract is `VERIFICATION_STATE.md` §"Correction and issue-control workflow"; the issue schema/lifecycle/severity model is `ISSUES.md` §"Issue-control system"). No other correction-handoff template or format may be created (no competing sources of truth).
>
> **A correction handoff authorizes only the corrective scope. It does not authorize unrelated improvements or the next phase.**
>
> **Usage (developer):** when the architect (ChatGPT) review returns `CORRECTION_REQUIRED` and issues a corrective handoff, materialize this form into **Part II of `docs/project-control/ZAI_HANDOFF.md`** (annotating or replacing the active instance per `ZAI_HANDOFF.md` §I.12 — superseded instances remain recoverable in Git history), fill every section faithfully from the architect's issued corrective handoff, and never invent scope, tasks, criteria, or dates. Sections you cannot fill from the architect's handoff are a defect: stop and ask the architect. The related issue record is created/updated in `ISSUES.md` per the canonical issue schema; the correction evidence is recorded in `VERIFICATION_STATE.md` under the related phase's section.
>
> Every instance must satisfy: the 22 numbered sections below; `ZAI_HANDOFF.md` §I.5 (correction protocol), §I.6 (handoff integrity — repository/branch/baseline/status verification before execution), §I.8 (review boundary), §I.9 (STOP boundary); the evidence-class obligations (D-012 — `[developer-reported]` vs `[architect-verified]`; a future or intended architect review is never written as already completed); and the security constraints (no secrets, no private chain-of-thought, observable evidence only).

---

## 1. Correction identity

| Field | Value |
|---|---|
| Correction ID | `CH-NNN` (sequential from `CH-001`; never reused) |
| Correction title | *(one precise line)* |
| Current status | `CORRECTION_REQUIRED` (issued) / `CORRECTION_IN_PROGRESS` / `CORRECTION_SUBMITTED` / `REVIEW_PENDING` / `RESOLVED` |
| Issued by | ChatGPT (architect / technical lead / reviewer / controller) |
| Issue date | *(YYYY-MM-DD)* |
| Repository | `Rilan-Dev/Clara-AI-Platform` |
| Branch | *(permitted branch, e.g. `feature/ai-core-from-doable-source`)* |

## 2. Related issue ID

| Field | Value |
|---|---|
| Issue ID | `I-NNN` — the `ISSUES.md` record this correction resolves (the issue's lifecycle state and this correction's status must stay consistent per the issue/phase status relationship) |
| Issue severity | *(P0 / P1 / P2 / P3 — as assigned by the architect at triage)* |
| Issue status at issuance | *(canonical lifecycle state, e.g. `CORRECTION_REQUIRED`)* |
| Related prior corrections | *(prior `CH-NNN` on the same issue, or "none")* |

## 3. Related phase

| Field | Value |
|---|---|
| Phase number / name | *(the phase whose review or work produced the finding)* |
| Phase status | *(canonical phase status while the correction is open — the phase cannot become `CLOSED` while a closure-blocking issue is unresolved)* |
| Review outcome that produced this correction | *(if applicable: `CORRECTION_REQUIRED` from the architect review — date and reviewed commit)* |
| Phase contract | `docs/project-control/CURRENT_PHASE.md` |

## 4. Baseline commit

| Field | Value |
|---|---|
| Correction baseline | *(full SHA of the state the corrective handoff is issued against — the developer MUST verify per `ZAI_HANDOFF.md` §I.6 that the branch/HEAD/tree match before executing; if the repository has moved unexpectedly, STOP)* |

## 5. Architect

**ChatGPT** — architect / technical lead / reviewer / controller. Only the architect may issue this corrective handoff, re-review the correction, and resolve the related issue.

## 6. Developer

**Z.AI** — developer / implementer. Executes only the corrective scope; self-verifies; records evidence; commits; pushes; reports; and STOPs at the correction boundary.

## 7. Finding

*(The exact defect, divergence, incomplete requirement, regression, security concern, or evidence problem the architect identified — transcribed faithfully from the corrective handoff. One precise statement of what is wrong, not how to fix it.)*

## 8. Evidence

*(The observable evidence that grounds the finding — commands and their outputs, diffs, document passages, register rows. Every evidence statement carries its class: `[architect-verified]` for the architect's review observation; `[developer-reported]` for developer-observed facts. Evidence describes observable facts only — **never secrets, credentials, tokens, private chain-of-thought, or sensitive runtime payloads**; a defect that involves credentials is described without reproducing them.)*

## 9. Why the finding blocks acceptance

*(Which acceptance criterion, gate requirement, contract rule, security constraint, or evidence obligation the finding violates, and why the phase therefore cannot receive `PASS` / cannot close until corrected. For a P0: P0 unconditionally prevents phase closure — there is no P0 exception path. For a P1: P1 prevents `PASS` unless an explicitly recorded architect-approved exception exists — and a correction is not an exception.)*

## 10. Exact correction required

*(Precisely what must change — the bounded change the architect requires. No implied extras; anything not listed here is non-scope.)*

## 11. Approved correction scope

| Path | Action | Bounded change |
|---|---|---|
| *(exact file/document/area the correction may touch)* | modify/create | *(what may change there)* |

## 12. Explicit non-scope

*(What the correction must NOT touch — at minimum, unless the architect explicitly says otherwise:)*

- No product code (`src/**`, `packages/**`), no dependencies, no database schema/migrations, no Supabase mutations, no Vercel operations, no `vercel.json` changes.
- No production-branch work (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); no force-push; no rewriting/amending/reverting of `b65725e5` or any historical commit.
- No immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`).
- No unrelated control-document changes; no unrelated issues fixed; no unrelated refactoring; no architecture changes outside this handoff; no silently altered acceptance criteria.
- No next-phase work or artifacts; no product-feature specifications or implementation plans.
- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads introduced anywhere.
- No R-3/R-4/R-5 resolution and no credential rotation unless this correction is explicitly about them (and even then only as scoped by the architect).

## 13. Required reading

*(Exact repository documents the developer must read before executing the correction — typically: the related issue record in `ISSUES.md`; the related phase's section in `VERIFICATION_STATE.md`; the durable verification and phase-gate contract; this template's rules; plus the finding's affected documents.)*

## 14. Implementation tasks (numbered, deterministic)

1. *(deterministic corrective task in execution order — bounded by §10/§11 only)*
2. *(…)*

## 15. Interfaces / contracts

*(API, module, data, tool, adapter, or document contracts that must remain compatible through the correction — including the control-document contracts, the Final State Contract (the five members must agree throughout), the canonical status vocabulary (D-011), the issue lifecycle vocabulary, and the evidence classes (D-012).)*

## 16. Security constraints

- No secrets, credentials, or access tokens may be written (the R-5 Vercel token is referenced but never reproduced).
- No private chain-of-thought — observable evidence only; no fabricated timestamps or unsupported claims.
- Tenancy boundaries and authorization requirements: *(state where the corrective scope touches application code; "documentation-only — no application security surface" where it does not)*.
- Immutable-source boundaries and production-branch restrictions remain in force (D-007, D-008).

## 17. Testing requirements

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | *(required validation for the correction — e.g. re-run the phase's deterministic test; re-run `npm run validate:model-config` where appropriate; correction-specific checks)* | *(command)* | *(expected result)* |

*(A passing test is one Gate C input for the re-review — never, by itself, resolution of the issue or the phase.)*

## 18. Acceptance criteria (pass/fail)

1. *(concrete pass/fail condition for the correction — evaluated by the architect at re-review; the developer reports, the architect decides)*

## 19. Git requirements

- Permitted branch: *(branch)* only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`; no force-push.
- One focused correction commit: *(message — referencing the finding / issue ID for traceability)*; the immediate child of the correction baseline; changed paths limited to the approved correction scope; no unrelated changes ride along; no squashing of unrelated history.
- Push normally to `origin/<branch>`; do not amend the baseline or the corrected phase's prior commits.

## 20. Evidence requirements

*(Per `ZAI_HANDOFF.md` §I.7 plus the correction traceability chain: the issue ID; the architect finding; the corrective handoff (this instance); the correction baseline SHA; the developer correction commit SHA; the verification evidence (commands + results, `[developer-reported]`); the architect re-review status (`pending` until an actual ChatGPT re-review occurs — never claimed as already completed); the issue resolution state (only architect verification may set `RESOLVED`). All reported as developer-reported evidence until the architect re-reviews.)*

## 21. Review boundary

**Developer correction submission does not equal issue resolution, and neither equals phase completion.**

**Only ChatGPT/project-owner architect review can resolve the issue (`RESOLVED`) and close the phase.**

After the correction commit, push, and evidence report: the issue moves `CORRECTION_SUBMITTED` → `REVIEW_PENDING`, and the phase remains open awaiting the architect's re-review. The re-review is Gate D under the verification and phase-gate contract (`VERIFICATION_STATE.md` §contract) — architect-only. Only an actual ChatGPT re-review may produce `architect-verified` resolution evidence. Possible re-review outcomes: `PASS` (the issue may become `RESOLVED` and the phase may close if all Phase-Gate conditions hold), `PASS_WITH_FOLLOWUP` (phase stays open with recorded follow-ups), `CORRECTION_REQUIRED` (a further corrective handoff — the issue returns to issue-status `CORRECTION_REQUIRED`; repeat cycle). Z.AI must not choose the outcome.

## 22. STOP boundary

After delivering the correction — implementation, validation, commit, push, and evidence report — **Z.AI STOPs at the correction boundary**. Until the architect's re-review (or further architect direction), Z.AI must NOT:

1. start the next phase (or any later phase) or create next-phase artifacts;
2. implement unrelated improvements or fix unrelated issues discovered during the correction;
3. make architectural decisions outside the corrective scope;
4. deploy unless explicitly authorized; modify production (branches, database, deployment configuration);
5. silently expand the corrective scope or absorb newly discovered out-of-scope issues into this correction.

**If a newly discovered issue is outside the correction scope: STOP → record/report it (a new `ISSUES.md` record, `[developer-reported]`, awaiting architect triage) → await architect direction.** Do not automatically absorb it into the correction.

---

## Correction integrity rules (binding — from the durable workflow contract)

The developer executes **only** the corrective scope (§10/§11). The developer must NOT: fix unrelated issues; refactor unrelated code; change architecture outside the handoff; silently alter acceptance criteria; modify unrelated project-control state; begin the next phase; or continue past the correction commit and evidence report. The correction is delivered as one focused commit whose message and evidence reference the finding and the issue ID (traceability: architect finding → issue record → corrective handoff → baseline SHA → developer correction commit → verification evidence → architect re-review → issue resolution / phase closure). An unrelated change found in the correction commit is a scope violation — it is not accepted as part of the correction, and it is handled per the STOP boundary above. Issue resolution requires architect verification: **a correction is not resolved merely because Z.AI says it is fixed — only architect verification can establish `architect-verified` resolution.** A developer correction commit never independently closes the issue or the phase.
