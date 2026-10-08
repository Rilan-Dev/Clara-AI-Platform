undefined
## APCP independent-agent continuity extension

The same repository-first continuity model applies to DEV-01 / Forge, FIX-01 / Sentinel, OPS-01 / Shipwright, and WORK-01 / Rover.

A fresh agent session must read AGENT_MEMORY.md before role-local memory, then central AGENT_EVENTS.md, AGENT_SESSIONS.md, AGENT_HANDOFF.md, and AGENT_BACKLOG.md, followed by its role-local agents/<ROLE>/MEMORY.md and WORKLOG.md. It then performs the normal project-control recovery.

This permits the user to invoke any agent at any time without providing a project briefing or previous chat transcript. The new agent independently determines current work, active agents, known mistakes, lessons, blockers, authorization, and NEXT_ACTION.md from GitHub.

WORK-01 is intentionally different from the planned implementation agents: it can execute SAFE-LOCAL or already AUTHORIZED daily work, but it cannot use that role to bypass authorization for a MATERIAL-CHANGE. Material requests are recorded and routed for authorization.

Central memory is a reusable lesson layer, not a competing source of truth. Role-local memory/worklogs preserve each agent's own history. Central sessions/events/handoffs/backlog records preserve cross-chat continuity and coordination. If any memory conflicts with current repository state, repository truth wins.

When a session ends, the agent records exact completion, pending work, blockers, lessons, and next action so another agent can resume without the old conversation.
