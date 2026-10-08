undefined
## Independent agent + daily worker layer

For any new chat, the user may invoke any role without explaining the project again. Use AGENT_OPERATIONS.md for the situation-based copy/paste prompt.

Startup memory order:
1. AGENT_MEMORY.md
2. AGENT_EVENTS.md / AGENT_SESSIONS.md / AGENT_HANDOFF.md / AGENT_BACKLOG.md
3. agents/<ROLE>/MEMORY.md and WORKLOG.md
4. normal project-control state and applicable architecture/plan

WORK-01 / Rover is the safe daily-worker role. It can perform SAFE-LOCAL or already AUTHORIZED maintenance/unplanned work while planned agents continue. MATERIAL-CHANGE work is routed for explicit authorization.

Shared memory is for reusable lessons; role-local memory/worklogs preserve independent agent history; central sessions/events/handoffs/backlog provide coordination. None of these replaces authorization or project state.
