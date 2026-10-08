# Adaptive APCP Rules

This document is governance-only. Existing project-specific rules, plans, decisions and handoffs remain in force; this layer does not change their implementation scope.

1. Current explicit owner requirements may add, modify, correct, supersede, deprecate, reprioritize, reopen, or replace earlier requirements.
2. Material changes require impact analysis and updated/superseding authorization before affected implementation.
3. Plans, prompts, suggestions, commits and agent claims do not grant authorization by themselves.
4. Completed implementation may be changed/reopened under a current authorized requirement; history stays traceable.
5. Phase/task/checklist completion is a boundary, not automatic authorization for the next item.
6. NEXT_ACTION.md is the current execution pointer and must be recomputed after meaningful work or scope changes.
7. Fresh sessions recover from GitHub/repository state, never assumed chat memory.
8. DEV-01/Forge owns development; FIX-01/Sentinel owns errors; OPS-01/Shipwright owns CI/CD/deployment/infrastructure.
9. Other-agent blockers are routed and recorded; independent authorized work continues.
10. Repeated waiting/polling for async CI/CD, Vercel, deployment, review, or verification is prohibited when independent work exists.
11. Implementation, verification and closure are distinct; worker claims cannot create VERIFIED/CLOSED.
12. Significant incidents require durable error/root-cause/remedy/lesson records.
13. Rules-only updates must not mutate product scope or implementation plans unless explicitly requested.

14. Agent invocation is explicit: DEV-01/Forge, FIX-01/Sentinel, and OPS-01/Shipwright are independently invokable roles.
15. Invoking a role selects its behavior; it does not grant authorization or expand project scope.
16. An agent invoked in a separate chat may work while another agent is active; it must recover state from GitHub and must not require interruption of the other session.
17. Each agent must follow its role skill, route work owned by another role, record dependencies/lessons, and continue independent authorized work.
18. Agent-specific work must not silently mutate another role's responsibilities, product scope, phase authorization, or closure state.
19. `AGENT_INVOCATION.md` is the copy/paste assignment entry point; `AGENT_SKILLS.md` is the behavioral contract; `AGENT_REGISTRY.md` is the ownership map; `FILES.md` is the governance audit index.

