# Clara AI Platform Project-Control Architecture

## Goal

Establish a durable project-control system in Clara so ChatGPT acts as architect, technical lead, reviewer, issue/risk identifier, workflow monitor, corrective controller, worklog manager, and deployment/database operator, while Z.AI acts as the implementation developer.

## Operating Roles

- **ChatGPT:** architecture, discovery, planning, approval gates, code review, issue/risk detection, corrective work assignment, workflow monitoring, durable state management, Vercel operations, Supabase operations when required.
- **Z.AI Agent:** developer/implementer. Reads approved handoffs, implements code, runs tests, commits changes, records implementation evidence, and stops at the phase boundary.
- **GitHub:** authoritative source of code and durable project state.
- **Vercel:** deployment, runtime/build verification, and production/preview operations controlled by ChatGPT.
- **Supabase:** database/schema/security/runtime operations controlled by ChatGPT when required.

## Non-Negotiable Principles

1. No implementation begins before the architecture/spec and phase plan are approved.
2. Z.AI implements; ChatGPT does not silently substitute itself as developer.
3. Every phase has explicit scope, acceptance criteria, verification evidence, and a stopping boundary.
4. ChatGPT reviews Z.AI output before a phase is considered complete.
5. Failed review creates a corrective handoff to Z.AI rather than silently accepting drift.
6. Repository state is authoritative; ChatGPT conversational memory is supplementary.
7. A new ChatGPT session must be able to reconstruct the project state from repository documents without relying on the previous chat.
8. Worklog entries record what was planned, implemented, verified, reviewed, committed, blocked, and what happens next.
9. Deployment/database changes are independently verified and recorded.
10. Existing Clara architecture and immutable Doable-source boundaries must be respected.

## Durable Project-Control Documents

Use a focused project-control area, reconciled with existing Clara documentation before creation:

- PROJECT_STATE.md: current phase, status, commit, blockers, risks, next action.
- CURRENT_PHASE.md: active phase contract and stopping boundary.
- NEXT_ACTION.md: exact next action for a fresh ChatGPT/Z.AI session.
- ZAI_HANDOFF.md: developer-facing implementation packet.
- VERIFICATION_STATE.md: evidence and verification status.
- DECISIONS.md: durable architectural decisions.
- ISSUES.md: known defects/blockers.
- RISKS.md: active architectural/operational risks.
- CHAT_CONTINUITY.md: fresh-session initialization procedure.
- sessions/SESSION-*.md: optional session-level audit records.
- Existing worklog.md: chronological project audit trail.
- Superpowers specs/plans: durable design and implementation artifacts.

The implementation must first inspect existing documentation and avoid creating competing sources of truth.

## Phase Lifecycle

DISCOVERY -> ARCHITECTURE -> DESIGN APPROVAL -> PLAN -> PLAN APPROVAL -> Z.AI HANDOFF -> IMPLEMENTATION -> Z.AI SELF-VERIFICATION -> CHATGPT REVIEW -> CORRECTION (if required) -> INTEGRATION VERIFICATION -> DEPLOYMENT VERIFICATION (if applicable) -> PHASE CLOSED -> STATE/WORKLOG UPDATE -> NEXT PHASE.

Only ChatGPT/project-owner approval advances a phase.

## Phase Completion Contract

A phase is complete only when:
- implementation scope matches the approved plan;
- tests and required checks pass;
- security and tenancy implications are reviewed;
- no unresolved P0/P1 issue remains;
- deployment/database verification is complete when applicable;
- commit SHA is recorded;
- worklog and project state are updated;
- next action is recorded.

## Cross-Chat Recovery

A fresh ChatGPT session must read, in order:
1. docs/AGENTS.md and repository README/agent instructions.
2. Project-control rules.
3. PROJECT_STATE.md.
4. CURRENT_PHASE.md.
5. NEXT_ACTION.md.
6. DECISIONS.md, ISSUES.md, RISKS.md.
7. VERIFICATION_STATE.md.
8. ZAI_HANDOFF.md.
9. worklog.md.
10. Latest Git history and branch status.

It then reports the recovered state before taking action.

## Developer Handoff Contract

Every Z.AI handoff must include:
- phase and objective;
- approved scope and explicit non-scope;
- prerequisite documents;
- architecture constraints;
- exact implementation tasks;
- files/modules to inspect/change;
- interfaces/contracts;
- tests and commands;
- acceptance criteria;
- security/tenancy requirements;
- commit expectations;
- required evidence;
- exact stopping point;
- instruction not to start later phases.

## Review Contract

ChatGPT reviews:
- requirement coverage;
- architectural consistency;
- source-boundary compliance;
- correctness and error handling;
- security/tenant isolation;
- concurrency/idempotency;
- performance/cost;
- tests;
- documentation/state updates;
- deployment/runtime evidence.

A review result is one of: PASS, PASS_WITH_FOLLOWUP, or CORRECTION_REQUIRED. Only PASS closes a phase.

## Scope

This project-control system is the enabling foundation for the later Clara multi-provider, integrations, MCP, and AI Agent Work Mode implementation. It does not itself implement those product capabilities.
