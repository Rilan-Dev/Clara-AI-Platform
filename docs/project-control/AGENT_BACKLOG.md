# APCP Central Agent Backlog

Cross-agent coordination backlog. This records ownership and dependencies; it does not authorize implementation.

## Entry format

### <BACKLOG-ID> — <YYYY-MM-DD>
- **Work:** <task>
- **Owner:** <DEV-01 | FIX-01 | OPS-01 | WORK-01>
- **State:** <READY | ACTIVE | BLOCKED | ROUTED | DONE | SUPERSEDED>
- **Dependency:** <none or exact dependency>
- **Authorization:** <authorization reference>
- **Suggested next action:** <concrete action>
- **Related session/event/handoff:** <ids>

## Routing rule

If a task belongs to another agent, create or update a backlog entry and continue independent work. Do not poll repeatedly for the dependency.
