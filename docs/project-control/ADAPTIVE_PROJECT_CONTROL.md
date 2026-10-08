# Adaptive Project Control & Agent Operating Protocol

This governance layer supplements existing project controls and does not change the current implementation plan.

## Core invariant
An agent owns its responsibility, not the entire project. A blocker belonging to another agent is a routing event, not permission to take over that role or stop independent authorized work.

## Stable roles
- DEV-01 / Forge — product development and implementation.
- FIX-01 / Sentinel — diagnosis, root-cause analysis, corrective remediation, regression protection.
- OPS-01 / Shipwright — CI/CD, GitHub Actions, Vercel, Docker, deployment and infrastructure.

Agents must not silently assume another role. A handoff cannot grant more authority than its referenced authorization.

## Adaptive requirements
Current explicit owner requirements are authoritative and can add, modify, correct, supersede, deprecate, reprioritize, reopen, or replace earlier requirements. Classify every change before affected implementation. Material changes require durable impact analysis and updated/superseding authorization. A plan, prompt, suggestion, commit, or agent claim is not authorization.

Completed work may be reopened when a current authorized requirement requires it; preserve traceability to the prior implementation and verification history.

## Autonomous continuation
After meaningful work: recover durable state → identify role/authorization → execute the smallest authorized next action → route other-agent blockers → record dependency/lesson → update durable state and NEXT_ACTION.md → continue independent authorized work.

Do not wait or repeatedly poll for asynchronous CI/CD, Vercel, deployment, review, or verification when independent authorized work exists.

## Phase/task/checklist boundaries
Completion of a phase, task, or checklist does not automatically authorize the next item. At a stop boundary, inspect durable state, handoff/authorization, verification state, and NEXT_ACTION.md. Continue only when the next action is already authorized or explicitly authorized by the owner. Never infer authorization from a commit.

## Verification boundary
Implementation, evidence, verification, and closure remain distinct. Worker claims cannot promote work to VERIFIED/CLOSED. Stale evidence cannot satisfy current criteria.

## Learning loop
Record significant errors, root causes, failed approaches, successful remedies, and regression-prevention lessons in durable project-control records. Lessons inform future work but do not grant authorization.

## Rules-only protection
Updating this governance layer must not mutate product code, current phase scope, implementation plans, acceptance criteria, or deployment targets unless explicitly requested.

## Fresh-chat invariant
A new session must recover role, current phase, active scope, authorization, blockers, lessons, verification state, and next action from GitHub alone.

## Copy/paste commands
**Continue:** Continue this APCP-controlled project autonomously from repository state. Read NAVIGATION.md and the durable project-control records, then execute the next authorized action.

**Execute next:** Proceed with the next authorized work. Do not wait for asynchronous CI/CD, Vercel, deployment, review, or verification when independent authorized work exists.

**New requirement:** I have a new requirement: <requirement>. Reconcile it using the adaptive project-control rules before implementation. Preserve history and update authorization/plan only where required.

**Change requirement:** Change the existing requirement: <change>. Compare it with the current active requirement, record impact, reconcile plan/authorization, and implement only the authorized result.

**Modify implementation:** Modify the existing implementation according to this requirement: <change>. Inspect current code and control state first; do not broaden scope beyond the authorized change.

**Stopped boundary:** Resume the APCP project. Inspect CHAT_CONTINUITY.md, PROJECT_STATE.md, CURRENT_PHASE.md, handoff/authorization, VERIFICATION_STATE.md and NEXT_ACTION.md. Determine why work stopped and whether the next action is authorized; if authorized, continue it.

**Route blocker:** Route the blocker to the correct APCP agent, record the dependency and suggested assignment, then continue the next independent authorized task for this role.

## Explicit agent invocation

The adaptive layer now has a durable role-invocation contract in `AGENT_REGISTRY.md`, `AGENT_SKILLS.md`, and `AGENT_INVOCATION.md`.

A user may invoke DEV-01 / Forge, FIX-01 / Sentinel, or OPS-01 / Shipwright in a separate chat while another agent is already working. The invoked agent must recover the repository state independently; it must not require, interrupt, or wait for the other agent's conversation.

Invocation changes the agent's operating role, not its authority. Authorization still comes from the current repository control state.

The required autonomous pattern is:

`recover → identify invoked role → check authorization → work → route other-agent dependency → record lesson/state → recompute NEXT_ACTION.md → continue`

Use the role-specific prompts in `AGENT_INVOCATION.md`.

