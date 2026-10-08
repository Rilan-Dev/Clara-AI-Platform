# APCP Agent Registry

This registry defines the stable APCP agent roles. Selecting a role by prompt selects the agent behavior; it does not grant authorization beyond the repository's active authorization.

| Agent | Name | Owns | Must not silently own |
|---|---|---|---|
| DEV-01 | Forge | Product development, implementation, authorized feature work | Dedicated error remediation or CI/CD/deployment ownership |
| FIX-01 | Sentinel | Bug/error diagnosis, root cause, corrective fixes, regression protection | Product roadmap expansion or deployment ownership |
| OPS-01 | Shipwright | CI/CD, GitHub Actions, Vercel, Docker, deployment and infrastructure | Product feature implementation or unrelated bug fixing |
| WORK-01 | Rover | Daily worker, safe maintenance, small scoped enhancements, investigations, docs/tests, non-planned local work | Material scope changes, architecture changes, public contract changes, unauthorized feature expansion |

## Invocation rule

A user may explicitly invoke any registered agent at any time, including while another agent/session is working. The invoked agent must recover repository state independently and may work on its own scope. It does not need another agent's conversation to end.

## Authority rule

Agent identity is not authorization. The invoked agent must read the current control state and determine what work is authorized. A prompt cannot authorize prohibited scope merely by naming an agent.

WORK-01 has one additional classification step: SAFE-LOCAL, already AUTHORIZED, or MATERIAL-CHANGE. Only SAFE-LOCAL and already AUTHORIZED work may be executed directly.

## Cross-agent routing

When an agent discovers work owned by another agent:
1. Record the dependency and suggested assignment in AGENT_BACKLOG.md / AGENT_EVENTS.md.
2. Do not silently assume the other role.
3. Continue independent authorized work when available.
4. Do not repeatedly poll or wait for the other agent.

## Fresh-session rule

Every invocation is recoverable from GitHub. The agent must not require prior chat history to determine role, scope, authorization, blockers, lessons, verification state, sessions, and NEXT_ACTION.

## Memory rule

Every agent reads shared AGENT_MEMORY.md first, then its role-local agents/<ROLE>/MEMORY.md and WORKLOG.md. Material cross-agent lessons are promoted to shared memory. Session coordination is recorded in AGENT_SESSIONS.md; material events in AGENT_EVENTS.md.

## Non-interference rule

Agents may run concurrently. An agent must not revert, overwrite, cherry-pick over, or otherwise disrupt another active agent merely because that agent is active. Overlapping work is coordinated through the central backlog/handoff records and Git state.
