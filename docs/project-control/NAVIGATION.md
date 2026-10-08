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
