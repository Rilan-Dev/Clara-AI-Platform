# VERIFICATION_CHECKLIST.md — Canonical Verification Checklist and Phase-Gate Record Template

> Established by Phase 5 — Verification and Phase-Gate System (2026-10-01; plan Phase 5; DECISIONS.md D-020). This file is the canonical **reusable form**: the per-phase gate-record templates (Gates A–F), the gate-applicability worksheet, the phase-close checklist, the closure-eligibility rules, and the deterministic worked examples. The **binding rules** live in `VERIFICATION_STATE.md` §"Verification and phase-gate contract (durable)"; where this file and that contract appear to disagree, the contract governs and the discrepancy is handled per `CHAT_CONTINUITY.md` §8 (the project is `BLOCKED` until reconciled — never silently resolved in favor of this file). This file is **NOT current-state authority**: current phase/status lives only in `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), and `VERIFICATION_STATE.md`.
> Snapshot date: **2026-10-01**. Repository state is authoritative (D-001).

## 1. Purpose and authority

The checklist exists to make false completion impossible under the documented project-control process. A filled checklist is **evidence for** the architect's review — it is never a substitute for that review, and it never closes a phase by itself. Only ChatGPT/project-owner review closes a phase (D-009). The completed system makes it impossible, under the documented process, to treat tests alone, a developer claim, a successful build, a clean Git tree, or a successful deployment as sufficient evidence for phase closure when additional verification gates are required. The contract explicitly distinguishes the seven determinations every verification state carries: developer-reported evidence; architect-verified evidence; required gates; optional/non-applicable gates; blockers; review outcomes; closure eligibility.

Per-phase gate records are written into `VERIFICATION_STATE.md`'s phase section (following the templates in §3 below) or cite exactly where the equivalent evidence lives. Every material statement carries its evidence class — `[developer-reported]` or `[architect-verified]` (D-012). Gate status values (this schema only; phase status vocabulary remains D-011): `PASS` · `FAIL` · `MISSING` (not yet evaluated) · `NOT_APPLICABLE` (applicability assessed and recorded — never a silent skip).

## 2. What is never sufficient alone (the five insufficient evidences)

| Evidence | Why it is insufficient alone | What it IS legitimate evidence for |
|---|---|---|
| Tests alone (Gate C `PASS`) | executed checks verify their own assertions, not scope conformity, architecture conformity, security, tenancy, database/deployment reality, or blocker state | the specific checks that ran, their commands, and their observed results in the environment they ran in |
| A developer claim ("implementation complete") | a claim is `[developer-reported]` evidence — trustworthy as a claim, never as verification (D-012) | that the developer believes the work complete and is submitting it for review |
| A successful build | build success says nothing about review gates, database/deployment evidence, or open blockers | the code compiled/bundled in that environment |
| A clean Git tree | cleanliness says nothing about whether the required gates were ever evaluated | the working tree matches the recorded commit |
| A successful deployment | deployment success does not review scope/architecture/security/tenancy and does not clear blockers | the deployed build came up in that environment |

## 3. Per-phase gate-record templates (Gates A–F)

### Gate A — Scope verification [required for every phase]

| Record | Content |
|---|---|
| Planned scope | the approved handoff's in-scope list (citation) |
| Actual changed paths | the implementation commit's changed-path list, inspected (e.g. `git show --name-only <implementation-commit>`) |
| Unexpected paths | any path outside the approved scope — every unexpected path must be explained and corrected, or the gate fails |
| Explicit non-scope confirmation | statement that the handoff's non-scope list was respected |
| Immutable-source check | `docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**` untouched |
| Production-branch check | `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main` untouched; no force-push |
| Result | `PASS` only when the actual scope is within the approved scope and the non-scope is respected. **A scope mismatch prevents `PASS`.** |

### Gate B — Implementation verification [required for every phase]

| Record | Content |
|---|---|
| Implementation commit | exact SHA + commit message |
| Parent commit | exact SHA; the parent–child relationship verified |
| Expected files | the handoff's Files/components list |
| Actual files | the implementation commit's changed-path list |
| Implementation requirements | the handoff's requirement list |
| Requirement-by-requirement status | each requirement → satisfied / not satisfied, with an evidence pointer |
| Result | `PASS` only when every requirement is satisfied (or explicitly deferred by architect direction). Developer assertions are labeled `[developer-reported]` |

### Gate C — Test verification [required for every phase]

| Record | Content |
|---|---|
| Test/check name | e.g. `validate-phase5-control-docs.sh (staged mode)` |
| Command | the exact command executed |
| Expected result | e.g. `N PASS / 0 FAIL`, exit status 0 |
| Actual result | the observed output |
| Pass/fail | per check |
| Environment/context | where it ran (worktree, mode, date) |
| Evidence class | `[developer-reported]` — or `[architect-verified]` only if the architect actually executed/observed it |

**"Tests passed" must not automatically imply phase completion.** Gate C `PASS` is one required input among the applicable gates, never closure.

### Gate D — Code-review verification [required for every phase; architect-only]

| Record | Content |
|---|---|
| Architect review status | pending, or occurred (date) — **only an actual ChatGPT review may set this gate to `PASS`** |
| Reviewed commit | the exact SHA the architect inspected |
| Reviewed diff | what the architect inspected (the actual GitHub diff / full diff) |
| Architecture conformity | conforms / diverges (finding) |
| Security concerns | none found / findings |
| Tenancy concerns | none found / findings (where applicable) |
| Regression concerns | none found / findings |
| Unresolved findings | list, or none |
| Result | `PASS` **only** from an actual ChatGPT review of the work producing `PASS`. A developer self-review may be recorded but **never** satisfies Gate D. **Only actual ChatGPT review may produce `architect-verified` review evidence** — a future or intended review is never written as already completed |

### Gate E — Database verification [applicability-conditional]

**Applicability:** required when the phase changes database surfaces (schema, migrations, RLS/security policies, seeds) or executes any Supabase/database mutation. Otherwise `NOT_APPLICABLE`, recorded with the assessment rationale.

When required, record:

| Record | Content |
|---|---|
| Migration evidence | migration files/SHAs applied; up/down status |
| Schema evidence | resulting schema state vs expected (migrations + migration-command output) |
| RLS/security evidence | row-level-security / tenant-boundary policy verification |
| Runtime query evidence | the queries/paths exercised against the database |
| Rollback/recovery evidence | rollback or recovery plan and its verified result |
| Result | `PASS` only with all five recorded. **Do not claim database verification when no database verification occurred.** |

**Phase 5 applicability: `NOT_APPLICABLE`** — documentation-only phase; no database surfaces changed; no mutations executed (assessed and recorded here, not silently skipped).

### Gate F — Deployment verification [applicability-conditional]

**Applicability:** required when the phase performs, requires, or depends on a deployment (any Vercel preview/production deployment of the phase's commit, or deployment-configuration changes). Otherwise `NOT_APPLICABLE`, recorded with the assessment rationale.

When required, record:

| Record | Content |
|---|---|
| Target | environment/deployment target |
| Deployment URL | the actual deployed URL |
| Commit SHA | the exact SHA deployed |
| Build result | build outcome (logs/duration) |
| Runtime result | runtime outcome |
| Smoke verification | post-deploy smoke checks and results |
| Rollback/escalation result | rollback or escalation outcome, if invoked |
| Result | `PASS` only with all seven recorded. **A local build must never be described as deployment verification.** |

**Phase 5 applicability: `NOT_APPLICABLE`** — no deployment performed or required; `vercel.json` and Vercel configuration untouched (assessed and recorded here).

## 4. Gate-applicability worksheet

1. Determine the phase's **changed surfaces** from the actual implementation diff (documentation-only / application / database / deployment / …).
2. Gates A, B, C, D — **always required** for every implementation phase.
3. Gate E — required **iff** database surfaces changed or database mutations were executed.
4. Gate F — required **iff** a deployment was performed or required, or deployment surfaces changed.
5. Every gate gets an explicit recorded status: `NOT_APPLICABLE` **with rationale** is a recorded determination; `MISSING` is an unevaluated gate and blocks closure eligibility.
6. An **applicability mismatch** — a surface changed while its gate is marked `NOT_APPLICABLE` — blocks `PASS` (it is a false applicability claim, i.e. an evidence problem).

## 5. Review-outcome contract (summary — canonical rules in VERIFICATION_STATE.md §contract)

| Outcome | Meaning | Effect on the phase |
|---|---|---|
| `PASS` | all required gates passed; no blocking P0/P1 issue remains | the architect **may** close the phase (closure remains an architect action, never automatic) |
| `PASS_WITH_FOLLOWUP` | the implementation is accepted, but explicitly recorded follow-up work remains | the phase remains open unless the project-control rules explicitly permit closure under the documented follow-up policy; **never silently converted into `PASS`** |
| `CORRECTION_REQUIRED` | the architect identified a defect, divergence, incomplete requirement, security concern, evidence problem, or other blocking issue | the phase remains open; a corrective handoff must identify: finding; evidence; exact corrective scope; non-scope; expected verification; stopping boundary |

## 6. P0/P1 blocker policy (summary — canonical rules in VERIFICATION_STATE.md §contract)

| Class | Definition | Closure effect |
|---|---|---|
| **P0** | critical issue preventing safe continuation or invalidating the phase result — e.g. a security-critical defect; a tenant-isolation failure; destructive uncontrolled behavior; corrupted authoritative state; false verification/closure evidence | **P0 prevents phase closure — always; there is no P0 exception path.** An architect decision may document acknowledgement, remediation, escalation, or other operational handling of a recorded P0, but it must **not** authorize phase closure while the P0 remains recorded |
| **P1** | high-severity issue that materially affects correctness, security, reliability, or an acceptance criterion | **P1 prevents `PASS`** unless the project-control policy explicitly records and approves a valid exception (an actual `DECISIONS.md` reference is required). Exceptions are never invented by the developer; any P1 exception requires an explicit architect decision |

## 7. Phase-close checklist (reusable — filled per phase by the developer before reporting completion; evaluated by the architect at review)

- [ ] Correct phase
- [ ] Correct baseline
- [ ] Correct implementation commit
- [ ] Scope matches handoff
- [ ] Non-scope respected
- [ ] Required implementation gates complete
- [ ] Required test gates complete
- [ ] Code-review gate complete
- [ ] Database gate assessed
- [ ] Deployment gate assessed
- [ ] Security reviewed
- [ ] Tenant isolation reviewed where applicable
- [ ] P0 count = 0
- [ ] P1 count = 0 or explicitly handled by architect policy
- [ ] No unresolved blocking correction
- [ ] Final State Contract consistent
- [ ] Worklog updated
- [ ] Evidence classification correct
- [ ] Commit SHA recorded
- [ ] Working tree clean
- [ ] Remote synchronization verified
- [ ] No later phase started

**The checklist itself does not close a phase. Only ChatGPT's review does.**

## 8. Closure-eligibility evaluation rules (deterministic)

A verification state is **closure-eligible** only when **all** of the following hold:

- **R1** — every required gate (per applicability) has status `PASS`;
- **R2** — every conditional gate is either `PASS` or `NOT_APPLICABLE` with a recorded applicability assessment, and there is no applicability mismatch;
- **R3** — Gate D's `PASS` is `[architect-verified]` (an actual ChatGPT review);
- **R4** — P0 count = 0;
- **R5** — P1 count = 0, or every P1 carries an explicitly recorded architect-approved exception;
- **R6** — no unresolved blocking correction is open;
- **R7** — the Final State Contract values agree.

Otherwise **closure eligibility = FAIL**, and representing the phase as `CLOSED` in that state is a false-closure defect — under the blocker policy a false verification/closure evidence problem is P0-class and itself prevents closure.

## 9. Deterministic worked examples

### Example 1 — deliberately incomplete verification state → closure eligibility **FAIL**

| Determination | Value |
|---|---|
| Changed surfaces | documentation-only |
| Gate A — Scope | `PASS` [developer-reported] |
| Gate B — Implementation | `PASS` [developer-reported] |
| Gate C — Test | `PASS` [developer-reported] — "validation suite: all checks pass, exit 0" |
| Gate D — Code review | **`MISSING`** — no architect review has occurred |
| Gate E — Database | `NOT_APPLICABLE` (assessed: no database surface changed) |
| Gate F — Deployment | `NOT_APPLICABLE` (assessed: no deployment performed or required) |
| P0 / P1 | 0 / 0 |
| Tests passed | **yes** |
| Developer completion claim | **yes** — "implementation complete" |
| **Closure eligibility** | **FAIL** — R1 violated: the required Gate D is `MISSING`. "Tests passed" + "developer says complete" is insufficient by design |

### Example 2 — complete applicable-gate verification state → closure eligibility **PASS**

| Determination | Value |
|---|---|
| Changed surfaces | documentation-only |
| Gate A — Scope | `PASS` [developer-reported; independently re-verified by the architect at review] |
| Gate B — Implementation | `PASS` [developer-reported; independently re-verified by the architect at review] |
| Gate C — Test | `PASS` [developer-reported] |
| Gate D — Code review | `PASS` **[architect-verified]** — an actual ChatGPT review of the exact commit, outcome `PASS` |
| Gate E — Database | `NOT_APPLICABLE` (assessed + recorded with rationale) |
| Gate F — Deployment | `NOT_APPLICABLE` (assessed + recorded with rationale) |
| P0 / P1 | 0 / 0 |
| **Closure eligibility** | **PASS** — the architect **may** close. Eligibility is permission to close, never an automatic transition: closure still requires the architect's recorded `PASS` review outcome |

Both examples are evaluated deterministically — together with six more cases (a P0 blocker; an unhandled P1; a P1 with an architect-approved exception; a Gate D `PASS` that is only developer-reported; a database-applicability mismatch; an open blocking correction) — by the executable test in §10.

## 10. Running the deterministic test

```bash
bash docs/project-control/verification/phase-closure-eligibility-test.sh
```

- Read-only: no repository writes, no network, no application dependency, no production runtime gate.
- Evaluates eight embedded fixture verification states (Example 1 = case-1; Example 2 = case-2) and prints each case's computed vs expected eligibility.
- Exit status `0` iff every case computes its expected eligibility; non-zero otherwise.
- The test is a governance artifact of Phase 5: running it — or any test — is never itself evidence of phase completion (it exercises the closure rule on fixtures, not a real phase's evidence).

## 11. Relationship to the control-document set

| Concern | Authoritative location |
|---|---|
| Binding gate / outcome / blocker / closure rules (the durable contract) | `VERIFICATION_STATE.md` §"Verification and phase-gate contract (durable)" |
| Per-phase evidence (the register — where a phase's gate records live) | `VERIFICATION_STATE.md` per-phase sections |
| The reusable form (this file) | gate-record templates, applicability worksheet, phase-close checklist, worked examples |
| The active phase's gate requirements and closure conditions | `CURRENT_PHASE.md` |
| Current phase / status / next action | the five Final State Contract members only |
| Deterministic closure-rule demonstration | `docs/project-control/verification/phase-closure-eligibility-test.sh` |

No duplicate source of truth is introduced: this file adds no current-state values and no new phase/status authority; `git ls-files` shows exactly one verification checklist/template and one deterministic closure-eligibility test under `docs/project-control/`.
