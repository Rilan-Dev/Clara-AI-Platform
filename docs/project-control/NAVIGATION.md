# APCP Navigation

This index adds navigation only. It does not change product scope, implementation plans, phase objectives, acceptance criteria, or existing architectural decisions.

## Fresh-session order
1. CHAT_CONTINUITY.md
2. PROJECT_STATE.md
3. CURRENT_PHASE.md
4. NEXT_ACTION.md
5. active handoff/authorization
6. VERIFICATION_STATE.md
7. DECISIONS.md, ISSUES.md, RISKS.md
8. active phase/plan documents
9. ADAPTIVE_PROJECT_CONTROL.md and this index

## Prompt routing
- Continue/resume → ADAPTIVE_PROJECT_CONTROL.md
- Execute next authorized action → ADAPTIVE_PROJECT_CONTROL.md
- New requirement → adaptive New Requirement command
- Edit requirement → adaptive Change Requirement command
- Edit implementation → adaptive Modify Implementation command
- New feature/plan → adaptive New Plan command; planning is not authorization
- Phase/task/checklist stopped → adaptive Resume/Recover command
- Cross-agent blocker → adaptive Route command

## Boundary
Current explicit owner requirements may add, modify, correct, supersede, deprecate, reprioritize, reopen, or replace earlier scope. Material changes require impact analysis and updated authorization before affected implementation. Rules-only changes must not alter product scope or implementation plans.

Pending CI/CD, deployment, review, or verification does not stop unrelated authorized implementation; do not repeatedly poll when independent work exists.

## Agent invocation and role routing

For role-specific autonomous work, use `docs/project-control/AGENT_REGISTRY.md`, `AGENT_SKILLS.md`, and `AGENT_INVOCATION.md`.

- DEV-01 / Forge → product development and implementation.
- FIX-01 / Sentinel → errors, failures, root-cause remediation, regression protection.
- OPS-01 / Shipwright → CI/CD, GitHub Actions, Vercel, Docker, deployment, infrastructure.
- A role can be explicitly invoked in a new chat while another role is working elsewhere.
- Agent invocation does not interrupt or require completion of another agent's session.
- Agent identity selects behavior; repository authorization selects permitted work.

