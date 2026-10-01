# CHAT_CONTINUITY.md — Cross-Chat ChatGPT Continuity Procedure

> Canonical procedure that allows a completely new ChatGPT conversation — with **no access to any previous conversation** — to recover the exact Clara project state and continue architectural leadership safely from **GitHub repository state alone**.
> **Procedure, not state.** This document never records current phase/commit values as truth; durable state lives in the control layer (`PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md`, `VERIFICATION_STATE.md`, `DECISIONS.md`, `ISSUES.md`, `RISKS.md`). This document tells a fresh ChatGPT session **how to read that layer and the repository**, and how to act on what it finds (§1.3 — no second source of truth).
> Established in Phase 3 — Cross-Chat ChatGPT Continuity. Architect: **ChatGPT**. Developer: **Z.AI**. Snapshot date: **2026-10-01**. Repository state is authoritative — this procedure exists to prevent stale conversational memory from overriding repository truth (§2).

---

## 1. Purpose, authority, and applicability

### 1.1 Purpose

The Clara project-control program is phase-gated and spans many conversations. Conversational memory drifts; repositories do not. This procedure makes ChatGPT-side leadership recoverable the same way `ZAI_HANDOFF.md` makes Z.AI-side implementation recoverable: from durable repository state alone. It defines the exact initialization a fresh ChatGPT session must perform, the evidence classes it must respect, the determinations it must be able to make, and the deterministic handling of every broken/stale/inconsistent situation it may find. Its single organizing rule is §2: repository truth over conversational memory.

### 1.2 Applicability and authority

- **Applies to:** any fresh ChatGPT session resuming or assuming architectural leadership of the Clara AI Platform, at any phase boundary, with or without access to prior conversations.
- **Authority basis:** DECISIONS.md D-001 (GitHub repository state is authoritative), D-002/D-003 (role separation), D-009 (only ChatGPT/project-owner review closes a phase), D-011 (status vocabulary), D-012 (evidence classes), D-017 (handoff integrity), and the architecture spec §Operating Roles.
- **Developer-side counterpart:** `ZAI_HANDOFF.md` Part I (developer handoff protocol) governs fresh Z.AI sessions. Both sides meet at the same control layer and the same repository; neither protocol creates state of its own.

### 1.3 No second source of truth

- This document is a **procedure**. Every current value (phase, status, commits, issues, risks, decisions, next action) must be read at runtime from the control layer and Git — never from this document.
- Where this document names identifiers (repository, branch, file paths, registers), they are durable references, not state. Any value that could drift carries a recovery command or names the document that holds it.
- If this document ever appears to disagree with the control layer or repository evidence, **the control layer and repository win**; the disagreement itself is handled per §8 (`BLOCKED`) and recorded.

### 1.4 What this procedure does NOT authorize

- No product implementation. Phase 3 is governance/continuity only; the future product program (the architectural north star) is defined in the spec and plan (§15) and is deliberately not restated here.
- No phase advancement. Architect authority is *recovered* by this procedure (§9), but advancing any phase still requires the review contract: `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`, only `PASS` closes (D-009).
- No weakening of the Z.AI STOP boundary (ZAI_HANDOFF.md §I.9). A fresh ChatGPT session may not reinterpret developer completion as phase completion.

---

## 2. Prime rule — repository truth over conversational memory

> **«ChatGPT must never treat previous conversational memory as authoritative when repository evidence disagrees with it.»**
>
> **Repository state is authoritative. Chat memory is supplementary only.**

Rules:

1. **Repository state wins. Always.** No age, confidence, or detail level of a memory claim overrides repository evidence.
2. **Memory may be used only as a hint** — where to look, what to ask, which command to run. It is never evidence, and never a substitute for reading the repository.
3. **A memory↔repository conflict is itself a finding.** Record it (issue or review note) rather than silently resolving it in either direction — the conflict is drift materializing (RISKS.md R-1).
4. **Absence of repository evidence for a memory claim** means the claim is unverified — developer-reported at best (D-012) — and must not drive architect action on its own.

Stale-memory examples (each row: memory loses, repository wins):

| Stale conversational memory says… | Repository evidence that wins |
|---|---|
| an old commit SHA ("the last commit was …") | `git fetch --prune origin && git rev-parse origin/<branch>`; `PROJECT_STATE.md` commit state (dated) |
| an old phase ("we're in Phase 2") | `PROJECT_STATE.md` Current phase · `CURRENT_PHASE.md` Phase identity |
| an old Z.AI task ("Z.AI is implementing X") | `ZAI_HANDOFF.md` Part II (active instance) · `NEXT_ACTION.md` §4 |
| an old deployment state ("production is running Y") | actual Vercel state, inspected by the ChatGPT deployment authority; `docs/deployment/VERCEL-VPS-CLOUD.md` |
| an old database state ("migration NNN is applied") | actual Supabase state, inspected by the ChatGPT database authority; migrations directory |
| an old branch/PR state ("PR #191 is open") | `git fetch --prune` + GitHub (observed exemplar: issue I-004 — chat claimed #191 open while repository truth showed it merged) |
| an old issue status ("I-002 is open") | `ISSUES.md` (dated status rows) |
| an old architecture decision ("we decided Z") | `DECISIONS.md` (append-only; supersession trail) |

---

## 3. Fresh-session capability requirements

A fresh ChatGPT session that has completed the §5 recovery procedure must be able to determine, **from repository state alone**, all of the following. If any item cannot be determined from the repository, that is a control-layer gap: record it as an issue — never fill it from memory.

| # | Determination | Authoritative source |
|---|---|---|
| 1 | repository | `PROJECT_STATE.md` Identity · `git remote -v` |
| 2 | branch | `PROJECT_STATE.md` Identity · `git branch --show-current` |
| 3 | current commit | `git rev-parse HEAD` (compared against `PROJECT_STATE.md` commit state) |
| 4 | current phase | `PROJECT_STATE.md` Current phase · `CURRENT_PHASE.md` Phase identity |
| 5 | phase status | same two documents, canonical vocabulary (D-011) |
| 6 | completed phases | `PROJECT_STATE.md` Completed phases (+ closed-phase sections of `VERIFICATION_STATE.md`) |
| 7 | current objective | `PROJECT_STATE.md` Current objective · `CURRENT_PHASE.md` Objective |
| 8 | active Z.AI handoff | `ZAI_HANDOFF.md` Part II · `NEXT_ACTION.md` §4 |
| 9 | latest architect-verified commit | `VERIFICATION_STATE.md` review trail · `PROJECT_STATE.md` Commit state |
| 10 | open issues | `ISSUES.md` Open |
| 11 | active risks | `RISKS.md` |
| 12 | pending decisions | `DECISIONS.md` Pending decisions |
| 13 | current next action | `NEXT_ACTION.md` |
| 14 | whether Z.AI is allowed to work | `NEXT_ACTION.md` §4 · `ZAI_HANDOFF.md` Part II · §10 below |
| 15 | what ChatGPT must independently verify | `NEXT_ACTION.md` §5 · `VERIFICATION_STATE.md` outstanding state · §5 step 12 |
| 16 | whether the project is blocked | `PROJECT_STATE.md` Active blockers · §8 state-contract check |
| 17 | what the next architect action is | `NEXT_ACTION.md` §3 |

---

## 4. Fresh-session read order (deterministic)

### 4.1 Mandatory reads (in this exact order)

1. **Repository agent instructions:** `.github/copilot-instructions.md`, then `Doc/18-09-2026/AGENTS.md` (codebase agent instructions). *Note: `docs/AGENTS.md` does not exist — ISSUES.md I-001; pending decision D-P2.*
2. `README.md`
3. `docs/project-control/PROJECT_STATE.md`
4. `docs/project-control/CURRENT_PHASE.md`
5. `docs/project-control/NEXT_ACTION.md`
6. `docs/project-control/ZAI_HANDOFF.md`
7. `docs/project-control/VERIFICATION_STATE.md`
8. `docs/project-control/DECISIONS.md`
9. `docs/project-control/ISSUES.md`
10. `docs/project-control/RISKS.md`

### 4.2 Conditional reads (read when the condition holds)

- **Relevant superpowers specification/plan for the active phase.** For every project-control governance phase this means `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md` and `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`; for a product phase, the spec/plan named in the active handoff's Required reading.
- **Relevant Doable-source governance documents when the active phase touches Doable-derived material:** `docs/doable-source/AGENTS.md` (immutable-source boundary rules) plus the applicable manifests/indexes under `docs/doable-source/` (e.g. `SOURCE_COVERAGE_MATRIX.md`, `capabilities/`).
- **Any additional document named in the active handoff's Required reading** (`ZAI_HANDOFF.md` Part II).
- `docs/deployment/VERCEL-VPS-CLOUD.md` when the architect work concerns deployment (R-5: the token documented there is never reproduced).

### 4.3 Historical evidence (read as needed; never current state)

- `docs/project-control/PHASE-0-RECONNAISSANCE.md` (closed Phase 0 report)
- Closed-phase sections of `VERIFICATION_STATE.md` (architect review trails)
- Superseded decisions in `DECISIONS.md`; resolved issues in `ISSUES.md`; closed/mitigated risks in `RISKS.md`
- Superseded handoff instances — recoverable only via Git history (`git log --oneline -- docs/project-control/ZAI_HANDOFF.md`; they are deliberately not kept as files, ZAI_HANDOFF.md §I.12)
- `Doc/` (capitalized, dated historical archive — informational I-009)

Rule: historical evidence explains the trajectory; **only the active sections of the control layer plus Git describe the present.**

---

## 5. Fresh-session recovery procedure (exact)

```
READ repository instructions
        ↓
READ PROJECT_STATE
        ↓
READ CURRENT_PHASE
        ↓
READ NEXT_ACTION
        ↓
READ ZAI_HANDOFF
        ↓
READ VERIFICATION_STATE
        ↓
READ DECISIONS / ISSUES / RISKS
        ↓
REFRESH GitHub state
        ↓
COMPARE repository state against control documents
        ↓
CHECK Final State Contract
        ↓
CHECK active phase/handoff
        ↓
CHECK latest verified commit
        ↓
CHECK whether Z.AI is allowed to act
        ↓
RECOVER leadership state
        ↓
ONLY THEN perform architect work
```

| Step | Action | Concrete method |
|---|---|---|
| 1 | READ repository instructions | §4.1 items 1–2 |
| 2 | READ the control layer in order | §4.1 items 3–10, plus §4.2 conditional reads as applicable |
| 3 | REFRESH GitHub state | `git fetch --prune origin` · `git branch --show-current` · `git rev-parse HEAD` · `git rev-parse origin/<branch>` (branch as recorded in `PROJECT_STATE.md`) · `git status --porcelain=v1` · `git log --oneline -5` |
| 4 | COMPARE repository state against control documents | the control documents' dated commit state vs. actual HEAD/origin/branch; any mismatch → §8 |
| 5 | CHECK Final State Contract | the five documents of §8 agree on phase and status |
| 6 | CHECK active phase/handoff | `ZAI_HANDOFF.md` Part II phase identity matches the current phase; its baseline matches HEAD or a documented descendant |
| 7 | CHECK latest verified commit | `VERIFICATION_STATE.md` latest architect review record, compared with `PROJECT_STATE.md` commit state |
| 8 | CHECK whether Z.AI is allowed to act | §10 rules, applied to the evidence gathered in steps 2–7 |
| 9 | RECOVER leadership state | assemble and emit the §6 recovery report |
| 10 | ONLY THEN perform architect work | review, decisions, handoffs, phase advancement — per D-009 and `NEXT_ACTION.md` |

Explicit rules:

- **Repository state is authoritative. Chat memory is supplementary only.** (§2 applies to every step.)
- **Never assume completion from the existence of a commit alone.** Before drawing any conclusion about what a commit means, inspect: the commit, its diff, the control state, the verification state, the active handoff, and the stopping boundary.
- A fresh session performs this procedure **before** accepting any developer claim, delegating any work, or advancing any phase.

---

## 6. Fresh-session recovery report (required output)

After initialization and **before any architect work**, the fresh ChatGPT session produces this compact report. All fields are required; fields 1–4 must be verified against live Git, not copied from documents. Every field carries one evidence class.

| # | Report field | Read from |
|---|---|---|
| 1 | Repository | `PROJECT_STATE.md` Identity · `git remote -v` |
| 2 | Branch | `git branch --show-current` vs. `PROJECT_STATE.md` |
| 3 | HEAD | `git rev-parse HEAD` |
| 4 | Remote HEAD | `git rev-parse origin/<branch>` after `git fetch --prune` |
| 5 | Current phase | `PROJECT_STATE.md` / `CURRENT_PHASE.md` |
| 6 | Phase status | same (D-011 vocabulary) |
| 7 | Latest architect-verified commit | `VERIFICATION_STATE.md` review trail / `PROJECT_STATE.md` commit state |
| 8 | Last completed phase | `PROJECT_STATE.md` Completed phases |
| 9 | Active objective | `PROJECT_STATE.md` / `CURRENT_PHASE.md` |
| 10 | Active Z.AI handoff | `ZAI_HANDOFF.md` Part II · `NEXT_ACTION.md` §4 |
| 11 | Open issues | `ISSUES.md` Open |
| 12 | Active risks | `RISKS.md` |
| 13 | Pending decisions | `DECISIONS.md` Pending decisions |
| 14 | Next action | `NEXT_ACTION.md` |
| 15 | Blockers | `PROJECT_STATE.md` Active blockers + §8 check result |
| 16 | State-contract consistency | §8 check result: consistent / documented closure-transition pending / `BLOCKED` |
| 17 | Required architect action | `NEXT_ACTION.md` §3 |

Evidence classes (D-012, extended for recovery):

| Class | Use |
|---|---|
| **architect-verified** | value sourced from a recorded architect review or workflow action (`VERIFICATION_STATE.md` trail) |
| **developer-reported** | value sourced from developer-attested state (control-document fields labeled developer-reported) |
| **unresolved/stale** | mismatch between sources, or a control value that disagrees with repository reality → §8 (`BLOCKED`) |
| **inferred** | concluded by the session itself — permitted **only after repository verification**, must be labeled inferred, and must name the verification |

---

## 7. Broken-chat recovery

Deterministic handling for each broken situation. Global rule for **every** case: the procedure must never assume completion from the existence of a commit alone — always inspect the commit, the diff, the control state, the verification state, the active handoff, and the stopping boundary.

| Broken situation | Deterministic handling |
|---|---|
| **a. Previous ChatGPT conversation disappears** | Nothing is lost that was authoritative — chat was never the source of truth (D-001). Run the full §5 recovery from repository state. |
| **b. Previous conversation becomes inaccessible** (context lost, session unavailable) | Same as (a): full §5 recovery from repository truth; produce the §6 report; resume architect work. |
| **c. Previous ChatGPT session ended midway** | Determine what actually happened from repository evidence only: commits, diffs, control documents, verification state, active handoff, stopping boundary. Never assume mid-conversation intentions, promises, or partially-given instructions occurred. Whatever the session was doing, resume it from repository truth (§5), not from guesswork. |
| **d. Z.AI completed work but ChatGPT did not review it** | Treat every completion claim as **developer-reported** (D-012); the phase remains `IN_PROGRESS`. Run the architect review on the actual commit and diff (never on the claim alone), then record the outcome per D-009. Existence of a commit is not completion. |
| **e. Z.AI stopped midway** | Treat the implementation as **incomplete unless repository evidence proves otherwise**: verify which parts landed (commits, control-document "implementation state" rows) and which did not. Do not assume unstated intent. Remaining scope is completed only via a **refreshed handoff** issued under ZAI_HANDOFF.md §I.6 integrity rules — the developer does not resume on the stale one. |
| **f. Repository contains an unclean working tree** | Inspect `git status` + the diff. If the changes fall inside an active, baseline-matching handoff's scope: treat as in-flight developer work; require the developer to complete, validate, commit, push, and report per protocol. If no active handoff authorizes them, or provenance is unclear: treat as unauthorized state — the project is `BLOCKED` (§8) until the architect determines provenance and directs disposal (finish, revert, or discard); implementation does not continue meanwhile. |
| **g. Branch moved after the handoff** | Stale-baseline protection (ZAI_HANDOFF.md §I.6; D-017): Z.AI must STOP. The architect reviews the moved state and issues a **refreshed handoff** before any further implementation. |
| **h. Control documents disagree** | §8 applies: the project is `BLOCKED` until reconciled. |
| **i. A developer handoff is stale** (superseded by events, phase advanced, or predates the current baseline) | The handoff is not executed; Z.AI is STOPped. A refreshed handoff is required. Never infer permission from Git history alone (§10). |

---

## 8. State-inconsistency handling (BLOCKED rule)

The **Final State Contract** members — `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II Phase identity), `VERIFICATION_STATE.md` — must agree on the current phase and its status.

- If they disagree, the project status is **`BLOCKED`**.
- Do **not** silently choose one document. Do **not** guess. Do **not** continue implementation while the state contract is inconsistent.
- **Reconciliation procedure (architect-led):**
  1. Freeze implementation — a `BLOCKED` phase authorizes no Z.AI work (ZAI_HANDOFF.md §I.4 rule 5).
  2. Establish repository truth — actual commits, branch/origin state, and the architect review trail in `VERIFICATION_STATE.md` are the tie-breakers.
  3. Record the inconsistency and its resolution in `VERIFICATION_STATE.md`; correct the drifted control documents.
  4. Only then unblock — status returns to the true phase state.
- **One documented exception:** the expected two-commit phase-boundary transition — a closure-record commit deliberately touches only `VERIFICATION_STATE.md`, and the immediately following implementation commit reconciles the sibling documents. This transient is valid **only** when `VERIFICATION_STATE.md`'s state-machine consistency table explicitly records it as a pending reconciliation naming the completing commit. Any disagreement not covered by such a record is `BLOCKED`.
- Z.AI never resolves an inconsistency on its own authority; it reports and stops.

---

## 9. Architect authority recovery

A fresh ChatGPT session that completes §5 resumes the full architect authority (D-002; spec §Operating Roles):

| Authority | Holder after recovery |
|---|---|
| Architect / technical lead | **ChatGPT** |
| Reviewer (commit/diff/evidence review; review outcomes) | **ChatGPT** |
| Workflow controller (handoffs, phase advancement) | **ChatGPT** |
| Issue and correction controller (`ISSUES.md`; corrective handoffs) | **ChatGPT** |
| Vercel operations authority (where applicable) | **ChatGPT** |
| Supabase operations authority (where applicable) | **ChatGPT** |
| Phase advancement authority (only `PASS` closes a phase — D-009) | **ChatGPT** |

Z.AI remains: **developer / implementer / self-verifier / evidence producer** (D-003).

**Z.AI must not become the authority merely because a new ChatGPT session has not yet reviewed the repository.** A fresh session completes §5 initialization before accepting any developer claim, delegating anything, or recording any outcome. Until initialization completes, the session acts on nothing but the repository; after it completes, every standing separation (roles, evidence classes, review boundary, STOP boundary) applies unchanged.

---

## 10. Z.AI authorization rules (recovery determination)

How a fresh ChatGPT session determines Z.AI's standing — from the control layer and repository, never from conversation:

| Determination | Condition (all parts must hold) | Source |
|---|---|---|
| **May work** | an active handoff exists (`ZAI_HANDOFF.md` Part II matches the current phase, status `IN_PROGRESS` with implementation not yet complete); its baseline equals HEAD or a documented descendant; local = origin; clean tree; no `BLOCKED`/`CORRECTION_REQUIRED` in effect | `ZAI_HANDOFF.md` Part II · `PROJECT_STATE.md` · §8 check · Git |
| **Must stop** | developer completion reached (STOP boundary, ZAI_HANDOFF.md §I.9); or no active handoff; or the handoff is stale; or state documents disagree (`BLOCKED`); or a corrective handoff's stop condition was reached | same |
| **Needs a new handoff** | the phase advanced (a `PASS` review closed it); the scope changed; or the baseline moved materially | `NEXT_ACTION.md` · `VERIFICATION_STATE.md` |
| **Needs a corrective handoff** | architect review returned `CORRECTION_REQUIRED` (seven fields, ZAI_HANDOFF.md §I.5) | `VERIFICATION_STATE.md` |
| **Awaiting architect review** | developer-reported completion exists but no architect review record for the phase in `VERIFICATION_STATE.md` — Z.AI performs no further work in the phase | `VERIFICATION_STATE.md` · `NEXT_ACTION.md` §4 |

Rules:

- **Do not infer Z.AI's permission from Git history alone.** Commits existing is not authorization. The active handoff and phase state authorize the work.
- `NEXT_ACTION.md` §4 ("Z.AI active handoff status") is the designed single lookup for the current standing.

---

## 11. Copy/paste initialization prompt (reusable)

The following prompt bootstraps a brand-new ChatGPT session. It is self-contained — it depends on no prior conversation — and remains valid across phases. Paste verbatim:

```text
You are resuming the Clara AI Platform project as architect, technical lead, reviewer,
workflow controller, and project owner. Begin from repository truth, not from any prior
conversation.

Repository: Rilan-Dev/Clara-AI-Platform (GitHub). Branch: feature/ai-core-from-doable-source
(verify against PROJECT_STATE.md).

1. Read docs/project-control/CHAT_CONTINUITY.md and follow its fresh-session recovery
   procedure (§5) exactly, including the mandatory read order (§4).
2. Read the repository control state in order: PROJECT_STATE.md, CURRENT_PHASE.md,
   NEXT_ACTION.md, ZAI_HANDOFF.md, VERIFICATION_STATE.md, DECISIONS.md, ISSUES.md,
   RISKS.md — all under docs/project-control/ — plus the repository agent instructions
   and README.md.
3. Inspect the actual GitHub state: git fetch --prune origin; confirm branch, HEAD vs
   origin, and a clean tree; compare the repository against the control documents.
4. Recover the current phase, phase status, latest architect-verified commit, active
   Z.AI handoff, open issues, active risks, pending decisions, and the current next
   action — from the repository, never from memory.
5. Verify the Final State Contract: PROJECT_STATE, CURRENT_PHASE, NEXT_ACTION,
   ZAI_HANDOFF, and VERIFICATION_STATE must agree on phase and status. If they disagree
   — and the disagreement is not the documented closure-record transition — declare the
   project BLOCKED and reconcile before anything else.
6. Inspect the active Z.AI handoff (ZAI_HANDOFF.md Part II) and determine whether Z.AI
   may work, must stop, needs a new or corrective handoff, or is awaiting your review.
   Never infer Z.AI's permission from Git history alone.
7. Never treat previous conversational memory as authoritative when repository evidence
   disagrees with it. Repository state wins.
8. Do not start, approve, or direct any implementation until you have verified the phase
   state and the stopping boundary. Developer completion does not equal phase completion;
   only your review outcome (PASS / PASS_WITH_FOLLOWUP / CORRECTION_REQUIRED) advances
   the phase, and only PASS closes it.
9. Produce the fresh-session recovery report defined in CHAT_CONTINUITY.md §6, then
   continue architect work from repository truth.
```

The prompt references repository paths only — never conversation content. If a referenced file is missing, that is a control-layer defect: treat it per §8 / `ISSUES.md`, not per memory.

---

## 12. Recovery scenarios (deterministic handling)

| Scenario | Situation | Deterministic handling |
|---|---|---|
| **A — clean phase boundary** | repository and control documents agree | Continue normally: perform the architect work named in `NEXT_ACTION.md` (review / decision / next handoff). |
| **B — Z.AI completed implementation, awaiting review** | developer-reported completion; no review record | ChatGPT reviews the **actual commit and diff** (never the claim alone); records `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`; only `PASS` closes. |
| **C — Z.AI stopped midway** | implementation incomplete | Treat as incomplete unless repository evidence proves otherwise; verify the partial state; issue a **refreshed handoff** for the remaining scope; do not resume a stale handoff. |
| **D — stale handoff** | baseline moved / phase advanced / handoff superseded | **STOP Z.AI**; issue a refreshed handoff (ZAI_HANDOFF.md §I.6; D-017). |
| **E — state documents disagree** | Final State Contract violation | **`BLOCKED`** — reconcile per §8 before proceeding. |
| **F — previous ChatGPT conversation unavailable** | no access to prior sessions | Recover entirely from repository (§5); chat memory is supplementary only. |
| **G — developer claims completion but verification missing** | claim without architect review | Treat as **developer-reported only**; architect review remains required; no phase advance; existence of a commit is not completion. |
| **H — product implementation appears during a governance phase** | scope violation in the diff | **Stop and review scope before allowing continuation**: determine provenance (commit, diff, control state); record an issue; the governance phase does not absorb product code; corrective action per ZAI_HANDOFF.md §I.5 as the architect directs. |

---

## 13. Validation of the continuity system

Deterministic validation — executed for Phase 3 on 2026-10-01 and re-runnable at any boundary:

1. `CHAT_CONTINUITY.md` exists at `docs/project-control/CHAT_CONTINUITY.md`.
2. Required sections exist (§1–§15 of this document).
3. Read order is explicit (§4: ordered mandatory list; conditional reads; historical evidence).
4. Repository authority is explicit (§2).
5. Stale-memory rule exists (§2, verbatim rule + examples).
6. Recovery-report schema exists (§6).
7. Broken-chat procedure exists (§7).
8. State inconsistency → `BLOCKED` exists (§8).
9. Architect/developer role separation exists (§9).
10. Z.AI authorization rules exist (§10).
11. Copy/paste initialization prompt exists (§11).
12. Recovery scenarios exist (§12, A–H).
13. References resolve (§15 — path-existence test; declared non-existent paths are exactly the documented ones, e.g. `docs/AGENTS.md` per I-001).
14. No competing state source is created (`git ls-files` control-document check; this document is procedure, not state — §1.3).
15. No secrets are introduced (credential-pattern scan of `docs/project-control/`).
16. Final State Contract is consistent (the five control documents agree on phase/status; `VERIFICATION_STATE.md` §State-machine consistency).
17. `npm run validate:model-config` still passes (read-only product-state check).
18. Diff remains within the approved Phase 3 documentation scope (`git status` / `git diff --stat`: only `docs/project-control/` paths).

Checks 1–16 are durable properties of this procedure and re-runnable at any time; checks 17–18 are execution-time evidence, recorded with the Phase 3 validation results in `VERIFICATION_STATE.md` §Phase 3. Any reusable validation script is kept **outside the repository** (agent workspace) — this phase's scope adds no repository validator.

---

## 14. Review boundary

**Developer completion does NOT equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

For Phase 3 specifically: after implementation, validation, commit/push, and the evidence report, Z.AI MUST STOP. ChatGPT independently inspects the actual commits, the actual diff, `CHAT_CONTINUITY.md`, the state documents, the Final State Contract, the validation evidence, and the security/scope boundaries — then issues `PASS`, `PASS_WITH_FOLLOWUP`, or `CORRECTION_REQUIRED`, recorded in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 3 (D-009).

---

## 15. References

| Reference | Path | Class |
|---|---|---|
| Project state (authoritative current state) | `docs/project-control/PROJECT_STATE.md` | control layer |
| Active-phase contract | `docs/project-control/CURRENT_PHASE.md` | control layer |
| Fresh-session next action | `docs/project-control/NEXT_ACTION.md` | control layer |
| Developer handoff protocol + active instance | `docs/project-control/ZAI_HANDOFF.md` | control layer |
| Verification evidence register | `docs/project-control/VERIFICATION_STATE.md` | control layer |
| Decision register | `docs/project-control/DECISIONS.md` | control layer |
| Issue register | `docs/project-control/ISSUES.md` | control layer |
| Risk register | `docs/project-control/RISKS.md` | control layer |
| Handoff template (single canonical form) | `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` | control layer |
| Phase 0 reconnaissance report | `docs/project-control/PHASE-0-RECONNAISSANCE.md` | historical evidence |
| Repository agent instructions | `.github/copilot-instructions.md` · `Doc/18-09-2026/AGENTS.md` | repository instructions |
| Repository README | `README.md` | repository |
| Architecture spec | `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md` | conditional read |
| Implementation plan | `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` | conditional read |
| Doable-source governance | `docs/doable-source/AGENTS.md` (+ manifests under `docs/doable-source/`, e.g. `SOURCE_COVERAGE_MATRIX.md`) | conditional read |
| Deployment contract | `docs/deployment/VERCEL-VPS-CLOUD.md` | conditional read |
| Known gap | `docs/AGENTS.md` does **not** exist (ISSUES.md I-001; decision D-P2 pending) | documented non-existence |
