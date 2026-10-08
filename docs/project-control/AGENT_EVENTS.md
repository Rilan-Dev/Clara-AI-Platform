# APCP Central Agent Events

Append-only central event log for material cross-agent events. This is not a replacement for WORKLOG.md or project-control state.

## Use when

Record:
- cross-agent blockers/routing;
- significant errors and corrections;
- requirement-impact discoveries;
- handoff creation/completion;
- agent-session takeover/switching;
- material lessons that affect multiple roles;
- governance/process incidents.

Routine implementation details belong in the owning agent's WORKLOG.md.

## Event format

### <EVENT-ID> — <YYYY-MM-DD>
- **Agent/session:** <agent id / session id>
- **Type:** <BLOCKER | ROUTE | ERROR | CORRECTION | HANDOFF | REQUIREMENT | SESSION | LESSON>
- **Summary:** <one paragraph>
- **Impact:** <none / local / cross-agent / scope>
- **Owner:** <agent id>
- **Suggested next action:** <concrete action>
- **Related records:** <paths / issue ids / commits>

<!-- Append new events above this marker. -->
