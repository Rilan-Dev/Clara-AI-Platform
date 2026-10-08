# APCP Governance File Index

This file is the audit index for the governance-only APCP update. It is not project implementation state and never replaces the authoritative control documents.

## Governance files in the adaptive/agent-control layer

| File | Purpose |
|---|---|
| `docs/project-control/NAVIGATION.md` | Fresh-session navigation and prompt routing |
| `docs/project-control/ADAPTIVE_PROJECT_CONTROL.md` | Adaptive requirements, continuation, boundaries, and autonomous behavior |
| `docs/project-control/RULES.md` | Concise enforceable governance rules |
| `docs/project-control/AGENT_REGISTRY.md` | DEV-01 / FIX-01 / OPS-01 ownership and routing |
| `docs/project-control/AGENT_SKILLS.md` | Shared autonomous skill plus role-specific skills |
| `docs/project-control/AGENT_INVOCATION.md` | Copy/paste prompts for independently invoking each agent |
| `docs/project-control/CHAT_CONTINUITY.md` | Fresh-session and cross-chat recovery |
| `README.md` | Repository entry-point navigation to the APCP agent layer |
| `docs/project-control/FILES.md` | This audit index |

## Agent behavior now covered

- DEV-01 / Forge: authorized product development.
- FIX-01 / Sentinel: errors, root-cause diagnosis, corrective remediation, regression protection.
- OPS-01 / Shipwright: CI/CD, GitHub Actions, Vercel, Docker, deployment, infrastructure.
- Role invocation is independent of other agent conversations.
- Invocation selects behavior but never creates authorization.
- Other-agent blockers are routed rather than silently taken over.
- Independent authorized work continues without repeated polling/waiting.
- Fresh sessions recover from GitHub and durable project-control records.
- Lessons, blockers, and NEXT_ACTION.md remain durable.

## Product-scope protection

This update is governance-only. It does not modify product implementation plans, phase objectives, acceptance criteria, architecture decisions, product code, deployment targets, or verification results.

When governance changes again, update this index in the same governance change.
