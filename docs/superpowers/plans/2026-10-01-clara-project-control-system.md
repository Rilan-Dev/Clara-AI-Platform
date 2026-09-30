# Clara Project Control System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a durable project-control layer in Clara that lets ChatGPT lead architecture, planning, review, correction, operations, and cross-chat continuity while Z.AI remains the implementation developer.

**Architecture:** Add a small, authoritative project-control documentation/state layer around the existing Clara repository rather than coupling project governance to application runtime. The repository remains the durable source of truth, while Z.AI receives phase-scoped handoff packets and ChatGPT verifies implementation, runtime, deployment, and database evidence before advancing the workflow.

**Tech Stack:** Markdown, JSON/YAML where machine-readable state is useful, Git/GitHub, existing Clara/Next.js tooling, existing CI, Vercel, Supabase when applicable.

**Spec:** docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md

## Global Constraints

- Z.AI is the developer/implementer; ChatGPT is the architect, reviewer, workflow controller, and operations owner.
- GitHub repository state is authoritative; chat memory is supplementary.
- Do not create competing sources of truth when existing Clara docs already provide the same information.
- Preserve the existing Clara architecture and immutable Doable-source boundaries.
- Do not work directly on production branches; use feature/approved development branches and normal PR flow.
- Every phase has explicit scope, acceptance criteria, verification evidence, and a stopping boundary.
- Only ChatGPT/project-owner review closes a phase.
- Never mark a phase complete from a developer claim alone.
- Never expose secrets, credentials, access tokens, or private chain-of-thought in logs/handoffs.
- Worklog/state documents must describe decisions and observable evidence, not hidden reasoning.
- Keep the control system useful for a fresh ChatGPT session with no access to the previous conversation.

## Review Focus

1. Fresh-session recovery must reconstruct the exact current phase, commit, blockers, and next action.
2. Z.AI must not accidentally start later phases because the handoff is ambiguous.
3. Project-control documents must not drift into multiple conflicting sources of truth.
4. Completion must require evidence from tests/review/deployment/database checks where applicable.
5. Corrections must be traceable from finding -> corrective handoff -> developer commit -> re-review.

---

## Phase 0 — Baseline and Control-System Reconnaissance

**Goal:** Map the existing Clara documentation, agent instructions, worklog, branches, CI, deployment configuration, and Doable-source governance before adding control files.

**Files:**
- Inspect: docs/AGENTS.md
- Inspect: README.md
- Inspect: docs/doable-source/README.md
- Inspect: docs/doable-source/AGENTS.md
- Inspect: existing worklog.md locations
- Inspect: existing planning/specification directories
- Inspect: CI/deployment configuration
- Inspect: current branch and recent commits

**Interfaces:**
- Produces a documented inventory of existing governance files and their authority.
- Establishes the canonical locations for the project-control documents.

- [ ] Inspect repository instructions and identify all files that already govern agents.
- [ ] Inspect existing worklogs and planning documents.
- [ ] Inspect branch policy and deployment workflow.
- [ ] Identify any existing state/continuity/handoff documents.
- [ ] Record conflicts or duplicate sources in ISSUES/RISKS planning notes.
- [ ] Commit reconnaissance documentation only if the existing project convention requires it.

**Acceptance:** No new control document is created where an existing authoritative document already serves the same purpose.

---

## Phase 1 — Durable Project-Control Foundation

**Goal:** Create the authoritative project-control document set and define the project state schema.

**Files:**
- Create/modify: canonical project-control directory selected in Phase 0
- Create: PROJECT_STATE.md
- Create: CURRENT_PHASE.md
- Create: NEXT_ACTION.md
- Create: DECISIONS.md
- Create: ISSUES.md
- Create: RISKS.md
- Create: VERIFICATION_STATE.md

**Interfaces:**
- PROJECT_STATE.md is the authoritative current-state summary.
- CURRENT_PHASE.md is the authoritative active-phase contract.
- NEXT_ACTION.md is the smallest fresh-session continuation instruction.
- DECISIONS.md stores durable architecture decisions.
- ISSUES.md stores known defects/blockers.
- RISKS.md stores active risks.
- VERIFICATION_STATE.md stores observable evidence and verification status.

- [ ] Write failing validation examples for required state sections.
- [ ] Implement the Markdown state templates with stable headings and required fields.
- [ ] Define allowed phase/status values consistently across documents.
- [ ] Add current branch, phase, status, last verified commit, blockers, risks, and next action fields.
- [ ] Ensure documents explicitly distinguish developer-reported evidence from architect-verified evidence.
- [ ] Run the repository's Markdown/document validation checks if available.
- [ ] Commit the foundation.

**Acceptance:** A reviewer can determine project status without reading the chat.

---

## Phase 2 — Z.AI Developer Handoff System

**Goal:** Make every implementation phase independently executable by Z.AI from repository state.

**Files:**
- Create: ZAI_HANDOFF.md
- Create/update: handoff template under project-control/templates/ if appropriate
- Modify: AGENTS/README only if Phase 0 confirms the instructions belong there

**Interfaces:**
- Handoff contains phase, objective, scope, non-scope, prerequisites, exact tasks, files, contracts, tests, acceptance criteria, security constraints, commit rules, evidence requirements, and stopping boundary.

- [ ] Define a handoff template with mandatory sections.
- [ ] Add explicit instructions that Z.AI is the developer and must not assume architect authority.
- [ ] Add explicit STOP conditions.
- [ ] Add evidence requirements: changed files, tests, commands, output summary, commit SHA, remaining issues.
- [ ] Add a rule that later phases are out of scope unless a new handoff is issued.
- [ ] Add a first real Phase 3 handoff instance.
- [ ] Validate that a developer can execute the handoff without this ChatGPT conversation.
- [ ] Commit.

**Acceptance:** A fresh Z.AI session can implement the active phase from repository documents alone.

---

## Phase 3 — Cross-Chat ChatGPT Continuity

**Goal:** Make a new ChatGPT conversation capable of recovering project leadership without relying on prior chat history.

**Files:**
- Create: CHAT_CONTINUITY.md
- Modify: PROJECT_STATE.md
- Modify: NEXT_ACTION.md
- Modify: AGENTS/README only where appropriate

**Interfaces:**
- CHAT_CONTINUITY.md defines the initialization order and leadership rules.
- NEXT_ACTION.md points to the active phase and handoff.
- PROJECT_STATE.md provides authoritative state.

- [ ] Define the exact fresh-session read order.
- [ ] Define the fresh-session recovery report: branch, commit, phase, status, completed work, open issues, risks, next action.
- [ ] Define what ChatGPT must verify before changing state.
- [ ] Define what ChatGPT must never infer from stale conversation memory.
- [ ] Define how a broken/inaccessible prior chat is replaced by repository state.
- [ ] Add a short copy/paste initialization command/prompt for a new ChatGPT chat.
- [ ] Test the procedure against a simulated fresh session with no conversational context.
- [ ] Commit.

**Acceptance:** Ten independent ChatGPT conversations could continue the same project using the same repository state.

---

## Phase 4 — Worklog and Session Audit

**Goal:** Turn worklog.md into a durable audit trail without replacing project state.

**Files:**
- Modify: existing canonical worklog.md
- Create: sessions/SESSION-*.md only if useful under existing conventions
- Modify: PROJECT_STATE.md
- Modify: NEXT_ACTION.md

**Interfaces:**
- Worklog records historical events.
- PROJECT_STATE records current truth.
- Session records explain what a specific ChatGPT/Z.AI session did, if session records are enabled.

- [ ] Define standard worklog entry schema.
- [ ] Include phase, role, date, objective, implementation, verification, review, commit, issues, correction, and next action.
- [ ] Add explicit status values: PLANNED, IN_PROGRESS, BLOCKED, CORRECTION_REQUIRED, VERIFIED, CLOSED.
- [ ] Add the first project-control foundation entry.
- [ ] Verify chronological entries remain append-only except for explicit corrections.
- [ ] Commit.

**Acceptance:** Historical progress can be reconstructed without relying on chat transcripts.

---

## Phase 5 — Verification and Phase-Gate System

**Goal:** Make completion evidence explicit and prevent false completion.

**Files:**
- Modify: VERIFICATION_STATE.md
- Modify: CURRENT_PHASE.md
- Create: verification checklist/template
- Modify: worklog.md

**Interfaces:**
- Developer evidence is submitted by Z.AI.
- Architect verification is recorded by ChatGPT.
- Phase status cannot become CLOSED until all required gates pass.

- [ ] Define implementation verification fields.
- [ ] Define test verification fields.
- [ ] Define code-review verification fields.
- [ ] Define database verification fields for DB-changing phases.
- [ ] Define deployment verification fields for deployment phases.
- [ ] Define allowed review outcomes: PASS, PASS_WITH_FOLLOWUP, CORRECTION_REQUIRED.
- [ ] Add explicit P0/P1 blocker rule.
- [ ] Add a phase-close checklist.
- [ ] Test a deliberately incomplete phase and verify it cannot be recorded as closed.
- [ ] Commit.

**Acceptance:** "Tests passed" alone cannot falsely close a phase when review/deployment/database evidence is required.

---

## Phase 6 — Correction and Issue-Control Workflow

**Goal:** Provide a repeatable path when ChatGPT finds that Z.AI's implementation diverged from the plan.

**Files:**
- Modify: ISSUES.md
- Modify: CURRENT_PHASE.md
- Modify: ZAI_HANDOFF.md
- Create: correction-handoff template
- Modify: VERIFICATION_STATE.md
- Modify: worklog.md

**Interfaces:**
- Issue record references the phase and evidence.
- Correction handoff references the issue and exact corrective scope.
- New developer commit references the correction.
- Review closes the issue only after verification.

- [ ] Define issue severity and lifecycle.
- [ ] Define the correction record format.
- [ ] Define rules for architecture drift, incomplete requirements, regression, security defects, and test failures.
- [ ] Create correction handoff template.
- [ ] Add a test/example correction cycle.
- [ ] Ensure correction cannot silently expand into unrelated scope.
- [ ] Commit.

**Acceptance:** Every correction is traceable end-to-end.

---

## Phase 7 — Vercel Operations Gate

**Goal:** Make deployment an independently verified lifecycle stage rather than a developer assertion.

**Files:**
- Modify: VERIFICATION_STATE.md
- Modify: CURRENT_PHASE.md
- Modify: worklog.md
- Inspect/modify: existing Vercel/CI configuration only when required

**Interfaces:**
- Z.AI supplies implementation commit and local/CI evidence.
- ChatGPT controls deployment operations and verifies deployment state.
- Deployment result records URL, target, status, commit, build duration, and post-deploy verification.

- [ ] Define preview deployment gate.
- [ ] Define production deployment gate.
- [ ] Define build/log verification requirements.
- [ ] Define rollback/escalation criteria.
- [ ] Define post-deploy smoke verification.
- [ ] Ensure production branches remain protected by existing branch policy.
- [ ] Run the gate against the first applicable deployment.
- [ ] Record evidence in project state/worklog.
- [ ] Commit documentation changes.

**Acceptance:** Deployment status is independently observable and tied to an exact commit.

---

## Phase 8 — Supabase Operations Gate

**Goal:** Make database changes independently reviewable and verifiable.

**Files:**
- Modify: VERIFICATION_STATE.md
- Modify: CURRENT_PHASE.md
- Modify: worklog.md
- Inspect: existing migrations/schema/RLS conventions

**Interfaces:**
- Z.AI proposes/implements application-side DB changes and migration files where appropriate.
- ChatGPT verifies schema, migration, RLS/security, and runtime behavior through the connected Supabase tooling when required.

- [ ] Define when a phase requires Supabase verification.
- [ ] Define migration evidence.
- [ ] Define RLS/security review evidence.
- [ ] Define post-migration test query evidence.
- [ ] Define rollback/recovery recording.
- [ ] Verify the first applicable database phase using the current Supabase project.
- [ ] Record results.
- [ ] Commit documentation changes.

**Acceptance:** Database work cannot be marked complete solely because a migration file exists.

---

## Phase 9 — Phase-Orchestration Protocol

**Goal:** Establish the repeatable phase-to-phase operating loop for future Clara feature development.

**Files:**
- Modify: CHAT_CONTINUITY.md
- Modify: ZAI_HANDOFF.md
- Modify: CURRENT_PHASE.md
- Modify: NEXT_ACTION.md
- Modify: worklog.md
- Create: phase lifecycle checklist if justified

**Interfaces:**
- ChatGPT starts/updates phases.
- Z.AI executes only the active handoff.
- ChatGPT reviews and either corrects or closes.
- Project state determines the next phase.

- [ ] Define phase start procedure.
- [ ] Define Z.AI handoff procedure.
- [ ] Define developer completion procedure.
- [ ] Define ChatGPT review procedure.
- [ ] Define correction procedure.
- [ ] Define phase-close procedure.
- [ ] Define next-phase initialization.
- [ ] Run one complete lifecycle using a small non-production test task.
- [ ] Commit.

**Acceptance:** The lifecycle can be followed repeatedly without ad-hoc process decisions.

---

## Phase 10 — Clara Feature Program Initialization

**Goal:** Use the control system to launch the actual Clara AI platform expansion: multi-provider, integrations, MCP, and Agent Work Mode.

**Files:**
- Create/update future specs and plans under docs/superpowers/
- Modify: project-control state
- Do not implement product functionality in this phase unless separately approved

**Interfaces:**
- The project-control system becomes the governance layer.
- Product feature work receives separate specs/plans and separate Z.AI handoffs.

**Feature program order:**

1. Multi-provider foundation
2. Unified Tool Runtime
3. Integrations framework
4. MCP framework
5. Single-agent runtime
6. Agent Work Mode
7. Memory and Skills
8. Runs/observability/usage
9. Agent UI
10. Templates/marketplace/automation expansion

- [ ] Create the next feature spec from the approved Clara architecture.
- [ ] Create its implementation plan.
- [ ] Generate the first production-quality Z.AI handoff.
- [ ] Keep each product capability independently testable.
- [ ] Do not combine unrelated feature implementations into one phase.
- [ ] Record the transition in worklog and project state.

**Acceptance:** The first real Clara product phase can be executed entirely through the new control workflow.

---

## Phase 11 — Failure-Recovery and Multi-Chat Validation

**Goal:** Prove that the workflow survives broken conversations and incomplete sessions.

**Files:**
- Modify: CHAT_CONTINUITY.md
- Modify: PROJECT_STATE.md
- Modify: NEXT_ACTION.md
- Modify: worklog.md
- Create: recovery validation record

- [ ] Simulate ChatGPT Session A ending immediately after Z.AI implementation.
- [ ] Start Session B using repository state only.
- [ ] Recover exact branch, commit, phase, issues, verification status, and next action.
- [ ] Simulate Z.AI stopping halfway through a phase.
- [ ] Recover without assuming completion.
- [ ] Simulate ChatGPT finding a review defect.
- [ ] Create and execute a correction handoff.
- [ ] Verify the project returns to a clean phase boundary.
- [ ] Record recovery evidence.
- [ ] Commit.

**Acceptance:** A broken or inaccessible chat cannot strand the project or cause a future session to continue from an incorrect phase.

---

## Phase 12 — Final Governance Review

**Goal:** Confirm the control system itself is production-ready for ongoing Clara development.

**Files:**
- All project-control documents
- worklog.md
- final review record

- [ ] Verify every spec requirement maps to an implemented control.
- [ ] Verify every phase has a clear stopping boundary.
- [ ] Verify Z.AI handoffs contain enough information for independent execution.
- [ ] Verify ChatGPT recovery can reconstruct state from GitHub.
- [ ] Verify Vercel/Supabase gates are documented.
- [ ] Verify no secret/private reasoning is written to durable logs.
- [ ] Verify no duplicate source of truth exists.
- [ ] Run repository tests/document checks.
- [ ] Record final governance review.
- [ ] Commit.

**Acceptance:** The repository can be handed to a new ChatGPT session and a new Z.AI session without requiring this conversation.

---

## Required Z.AI Evidence Format

Every developer completion report must provide:

- Phase
- Objective
- Scope completed
- Explicitly unimplemented/non-scope items
- Files changed
- Tests/checks run
- Relevant command results
- Security/tenancy considerations
- Migration/deployment details if applicable
- Commit SHA
- Known issues
- Follow-up items
- Confirmation that no later phase was started

Z.AI must not claim architect approval.

## Required ChatGPT Review Format

After each Z.AI completion:

1. Compare implementation against the active plan.
2. Inspect the actual diff/commit.
3. Inspect tests and evidence.
4. Check architecture and source boundaries.
5. Check security and tenant isolation.
6. Check runtime/deployment/database evidence where applicable.
7. Record PASS, PASS_WITH_FOLLOWUP, or CORRECTION_REQUIRED.
8. If correction is required, create a precise corrective handoff.
9. If PASS, close the phase and initialize the next phase.

## Final State Contract

At every phase boundary, these values must agree:

PROJECT_STATE.current_phase
CURRENT_PHASE.phase
NEXT_ACTION.phase
ZAI_HANDOFF.phase
VERIFICATION_STATE.phase
latest worklog phase entry
latest verified commit

If they disagree, the phase is considered **BLOCKED until reconciled**.

## Plan Self-Review

- Spec coverage: all requirements in the project-control architecture map to Phases 0-12.
- Step granularity: each phase is independently reviewable and has explicit acceptance.
- Type/field consistency: the same state concepts are reused across project-control documents.
- Review focus: fresh-session recovery, handoff ambiguity, duplicate truth, false completion, and correction traceability are explicitly tested.
- Scope: product capabilities remain separate from the governance foundation.
