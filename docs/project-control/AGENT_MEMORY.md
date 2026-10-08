# APCP Shared Agent Memory

This is the shared, durable memory layer for all APCP agents. It is a memory/lessons record, not an authorization source.

## Authority order

1. Current explicit owner requirement
2. Repository-local governing instructions
3. GitHub committed source/state
4. Active authorization and project-control state
5. This shared memory
6. Per-agent memory
7. Chat/session memory

Memory never overrides current requirements, authorization, or repository truth.

## Purpose

Record reusable lessons so a newly invoked agent can avoid repeating known mistakes without needing a previous chat.

Record:
- recurring bugs and root causes;
- failed approaches and why they failed;
- successful remedies;
- regression-prevention rules;
- environment/deployment lessons;
- cross-agent lessons that materially affect future work.

Never record secrets, tokens, passwords, private keys, or sensitive personal data.

## Read-first rule

Every invoked agent reads this file before starting work, then reads its own role-local MEMORY.md and WORKLOG.md. The agent also reads AGENT_EVENTS.md, AGENT_SESSIONS.md, AGENT_HANDOFF.md, and AGENT_BACKLOG.md when relevant.

## Entry format

Append lessons under the owning agent section:

- **Date/session:** <date / session id>
- **Agent:** <agent id>
- **Issue/symptom:** <what happened>
- **Root cause:** <confirmed cause>
- **Failed approach:** <what did not work and why>
- **Remedy:** <what worked>
- **Prevention:** <how future agents should avoid recurrence>
- **Related record:** <issue/event/commit/path>

## Agent memory sections

### DEV-01 / Forge
<!-- Append durable development lessons here. -->

### FIX-01 / Sentinel
<!-- Append durable error/root-cause lessons here. -->

### OPS-01 / Shipwright
<!-- Append durable CI/CD/deployment/infrastructure lessons here. -->

### WORK-01 / Rover
<!-- Append durable daily-worker/maintenance lessons here. -->

## Memory conflict rule

If shared memory conflicts with current repository state or current requirements, ignore the stale memory, record the conflict in AGENT_EVENTS.md or ISSUES.md when material, and follow current repository truth.
