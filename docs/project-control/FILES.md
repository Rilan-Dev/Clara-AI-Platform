# APCP Governance File Index

This file is the audit index for the governance-only APCP update. It is not project implementation state and never replaces the authoritative control documents.

## Governance files in the adaptive/agent-control layer

| File | Purpose |
|---|---|
| docs/project-control/NAVIGATION.md | Fresh-session navigation and prompt routing |
| docs/project-control/ADAPTIVE_PROJECT_CONTROL.md | Adaptive requirements, continuation, boundaries, and autonomous behavior |
| docs/project-control/RULES.md | Concise enforceable governance rules |
| docs/project-control/AGENT_REGISTRY.md | DEV-01 / FIX-01 / OPS-01 / WORK-01 ownership and routing |
| docs/project-control/AGENT_SKILLS.md | Shared autonomous skill plus role-specific skills |
| docs/project-control/AGENT_INVOCATION.md | Copy/paste role invocation |
| docs/project-control/AGENT_OPERATIONS.md | Situation-based copy/paste prompt library and WORK-01 contract |
| docs/project-control/AGENT_MEMORY.md | Shared reusable lessons and memory |
| docs/project-control/AGENT_EVENTS.md | Central append-only material event log |
| docs/project-control/AGENT_SESSIONS.md | Central cross-chat/session register |
| docs/project-control/AGENT_HANDOFF.md | Cross-agent handoff register |
| docs/project-control/AGENT_BACKLOG.md | Cross-agent ownership/dependency backlog |
| docs/project-control/agents/<ROLE>/MEMORY.md | Role-local durable memory |
| docs/project-control/agents/<ROLE>/WORKLOG.md | Role-local append-only worklog |
| docs/project-control/CHAT_CONTINUITY.md | Fresh-session and cross-chat recovery |
| README.md | Repository entry-point navigation to the APCP agent layer |

## Agent behavior now covered

- DEV-01 / Forge: authorized product development.
- FIX-01 / Sentinel: errors, root-cause diagnosis, corrective remediation, regression protection.
- OPS-01 / Shipwright: CI/CD, GitHub Actions, Vercel, Docker, deployment, infrastructure.
- WORK-01 / Rover: daily worker for safe/unplanned local work.
- Role invocation is independent of other agent conversations.
- Invocation selects behavior but never creates authorization.
- Other-agent blockers are routed rather than silently taken over.
- Independent authorized/safe work continues without repeated polling/waiting.
- Fresh sessions recover from GitHub and durable project-control records.
- Shared memory prevents repeat mistakes across agents.
- Role-local memory/worklogs preserve each agent's independent history.
- Central sessions/events/handoffs/backlog provide cross-agent continuity.

## Product-scope protection

This update is governance-only. It does not modify product implementation plans, phase objectives, acceptance criteria, architecture decisions, product code, deployment targets, or verification results.

When governance changes again, update this index in the same governance change.


## User-facing agent usage

| File | Purpose |
|---|---|
| docs/project-control/HOW_TO_USE_AGENTS.md | Primary human guide: agent selection, fresh-chat continuation, daily work, concurrent agents, memory, stop conditions, and copy/paste prompts |

The user-facing guide is convenience documentation only. It does not create authorization or override APCP governance.
