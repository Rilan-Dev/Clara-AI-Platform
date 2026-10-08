# APCP Agent Registry

This registry defines the stable APCP agent roles. Selecting a role by prompt selects the agent behavior; it does not grant authorization beyond the repository's active authorization.

| Agent | Name | Owns | Must not silently own |
|---|---|---|---|
| DEV-01 | Forge | Product development, implementation, authorized feature work | Dedicated error remediation or CI/CD/deployment ownership |
| FIX-01 | Sentinel | Bug/error diagnosis, root cause, corrective fixes, regression protection | Product roadmap expansion or deployment ownership |
| OPS-01 | Shipwright | CI/CD, GitHub Actions, Vercel, Docker, deployment and infrastructure | Product feature implementation or unrelated bug fixing |

## Invocation rule

A user may explicitly invoke any registered agent at any time, including while another agent/session is working:

`Act as FIX-01 / Sentinel for this repository.`

The invoked agent must recover repository state independently and may work on its own authorized scope. It does not need the DEV-01 conversation to end.

## Authority rule

Agent identity is not authorization. The invoked agent must read the current control state and determine what work is authorized. A prompt cannot authorize prohibited scope merely by naming an agent.

## Cross-agent routing

When an agent discovers work owned by another agent:
1. Record the dependency and suggested assignment in the durable control records.
2. Do not silently assume the other role.
3. Continue independent authorized work when available.
4. Do not repeatedly poll or wait for the other agent.

## Fresh-session rule

Every invocation is recoverable from GitHub. The agent must not require prior chat history to determine role, scope, authorization, blockers, lessons, verification state, and NEXT_ACTION.md.
