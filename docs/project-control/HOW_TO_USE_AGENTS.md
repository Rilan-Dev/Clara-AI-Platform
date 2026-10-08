# APCP — How to Use Agents

This is the **user-facing quick guide** for starting work with any APCP agent. You do not need to remember the project architecture, previous chat, phase, filenames, old errors, or what another agent was doing. The agent must recover that context from the current GitHub repository and `docs/project-control/`.

## Start here

Pick the agent that matches the work, open a new chat, paste the matching prompt, and add only the task.

| What you need | Agent | Use when |
|---|---|---|
| Continue planned development | **DEV-01 / Forge** | Implement the current product plan/objective |
| Fix a bug/error/regression | **FIX-01 / Sentinel** | Diagnose failures and make corrective changes |
| Deployment / DevOps | **OPS-01 / Shipwright** | GitHub Actions, CI/CD, Vercel, Docker, infrastructure |
| Daily / simple / unplanned work | **WORK-01 / Rover** | Safe maintenance, docs, tests, cleanup, investigation, small compatible enhancements |

If you are unsure which agent to choose, use **WORK-01 / Rover** and describe the task. Rover classifies it and routes material work to the correct owner.

## 1. Start a new chat and continue where you left off

You do **not** need to paste the previous conversation.

Copy/paste:

> Act as **<AGENT>** for this repository. This is a new chat. Recover the project from the current GitHub repository and `docs/project-control/`. Read shared memory first, then central sessions/events/handoffs/backlog, your role-local memory/worklog, current project state, architecture, requirements, authorization, verification state, issues, risks, decisions, and `NEXT_ACTION.md`. Determine exactly where the project was left and continue the next valid task for your role. Do not rely on previous chat memory. Do not wait for another agent or async CI/Vercel work when independent work exists. Record the session, work, lessons, blockers, and exact next action.

Then add:

```
My task:
<TASK>
```

## 2. Continue planned development — DEV-01 / Forge

Use when the next work belongs to the existing implementation plan.

**Copy/paste:**

```text
Act as DEV-01 / Forge.

Start from the current GitHub repository state. Do not ask me to explain the project or provide the previous chat.

Recover architecture, active requirements, authorization, current phase, NEXT_ACTION, active agent sessions, blockers, known issues, shared lessons, and DEV-01 role-local memory/worklog.

Continue the next authorized product-development work.

Task:
<TASK OR "continue the next authorized development action">

Do not take another agent's role. Route substantial bugs to FIX-01 and CI/CD/deployment/infrastructure work to OPS-01. Do not repeatedly wait or poll for CI/Vercel/review when independent development exists.

Record the session, work, lessons, blockers, and exact next action.
```

## 3. Fix a bug/error — FIX-01 / Sentinel

Use for failures, regressions, unexpected behavior, test failures, and root-cause correction.

**Copy/paste:**

```text
Act as FIX-01 / Sentinel.

Recover the current repository state, shared AGENT_MEMORY.md, central agent records, FIX-01 role-local memory/worklog, current authorization, issues, verification state, and relevant implementation context.

Problem:
<ERROR / BUG / FAILURE / REGRESSION>

Trace the root cause first. Make the smallest authorized corrective change and add regression protection where appropriate. Record the symptom, root cause, failed approaches, remedy, prevention lesson, evidence, and next action.

Do not expand unrelated scope. Route CI/CD, deployment, infrastructure, or environment defects to OPS-01. Do not wait for DEV-01.
```

## 4. Deployment / DevOps — OPS-01 / Shipwright

Use for GitHub Actions, CI/CD, Vercel, Docker, deployment configuration, infrastructure, or runtime operations.

**Copy/paste:**

```text
Act as OPS-01 / Shipwright.

Recover the current repository state, shared memory, central agent records, OPS-01 role-local memory/worklog, authorization, deployment/build records, issues, risks, and current project state.

Operational task:
<CI / GITHUB ACTIONS / VERCEL / DOCKER / DEPLOYMENT / INFRASTRUCTURE TASK>

Diagnose the operational path and make the smallest authorized operational change. Distinguish infrastructure problems from application defects. Route product defects to DEV-01 or FIX-01.

Do not repeatedly wait or poll. Do not silently change product behavior. Record environment, root cause, remedy, evidence, follow-up, and next action.
```

## 5. Daily worker — WORK-01 / Rover

Use this when you want to open a new chat and simply assign today's work without explaining the project.

Rover always reads the architecture, current work, project-control state, shared lessons, known mistakes, active sessions, and role-local history first.

**Copy/paste:**

```text
Act as WORK-01 / Rover, the autonomous daily worker.

Do not ask me to explain the project or provide previous chat history. Recover everything from the current GitHub repository and docs/project-control.

Read AGENT_MEMORY.md first. Then read AGENT_EVENTS.md, AGENT_SESSIONS.md, AGENT_HANDOFF.md, AGENT_BACKLOG.md, agents/WORK-01/MEMORY.md, agents/WORK-01/WORKLOG.md, and the current project-control state, architecture, requirements, authorization, issues, risks, decisions, verification, and NEXT_ACTION.

First determine what is currently in progress, what other agents own, what known mistakes/lessons exist, and whether my task is SAFE-LOCAL, already AUTHORIZED, or MATERIAL-CHANGE.

Today's task:
<TASK>

Execute SAFE-LOCAL or already AUTHORIZED work without disturbing active agents.

If MATERIAL-CHANGE, do not silently expand scope. Record the requirement and impact, route it for explicit authorization, and continue any independent safe work.

Do not interrupt, revert, or wait for DEV-01, FIX-01, or OPS-01. Avoid overlapping active changes.

Record the session, work, lessons, blockers, and exact next action.
```

### Rover examples

- "Update this documentation typo."
- "Investigate why this screen is slow and document the cause."
- "Clean up these tests without changing behavior."
- "Add regression coverage for the already-known failure."
- "Make this small UI improvement while preserving the existing contract."
- "Review this module for obvious maintenance issues."
- "Prepare a proposal for this larger enhancement, but do not implement it yet."

If the request turns into a substantial product feature, architecture change, schema change, security-policy change, public contract change, provider behavior change, major UX change, phase change, or reopening completed scope, Rover must route it instead of using the daily-worker role to bypass authorization.

## 6. Call another agent while an agent is already working

You can start another chat at any time.

Example: DEV-01 is implementing, but you want FIX-01 to investigate a bug.

**Copy/paste:**

```text
Act as FIX-01 / Sentinel independently.

DEV-01 may currently be working in another chat/session. Do not interrupt DEV-01 and do not wait for DEV-01.

Recover repository truth and the shared/central/role-local memory yourself. Find the current FIX-01 work, diagnose the authorized error/failure, implement the appropriate correction, record the result, and continue independent FIX-01 work.

Do not take DEV-01's product-development role.
```

The same pattern works for OPS-01 or WORK-01.

A pending task owned by another agent is a **routing event**, not a reason to stop unrelated work.

## 7. Switch agents

If one agent stops, becomes unavailable, or you simply want another specialist to continue:

```text
Act as <NEW AGENT>.

The previous agent/session may have stopped. Do not ask for its chat transcript.

Recover the exact current state from GitHub and docs/project-control, including shared memory, central sessions/events/handoffs/backlog, role-local memory/worklog, authorization, verification, issues, risks, decisions, and NEXT_ACTION.

Determine what was completed, what remains, whether the previous handoff is still valid, and continue only valid work for your role.
```

The new agent independently checks authorization. A handoff transfers context; it does not create authority.

## 8. Known mistake / prevent repeating an old issue

Every agent should learn from mistakes instead of rediscovering them.

```text
Act as <FIX-01 / Sentinel | WORK-01 / Rover>.

Find the durable record for this known mistake:
<MISTAKE / ISSUE / SYMPTOM>

Read AGENT_MEMORY.md and the relevant role-local MEMORY.md first. Determine whether the failure mode still exists.

If it exists, correct it within authorized scope and add regression protection.
If it does not exist, document the prevention evidence.

Do not repeat approaches already recorded as failed. Record any reusable lesson in shared memory so other agents can prevent the same problem.
```

## 9. New or changed requirement

Do not assume a new sentence in a chat is automatically implementation authorization.

```text
A new owner requirement has arrived:

<REQUIREMENT>

Recover current project state and classify the change as additive, corrective, superseding, deprecating, reprioritizing, reopening, or replacing.

Analyze its impact on active work, requirements, architecture, phase scope, implementation, and verification. Update the appropriate durable records and authorization according to APCP authority.

Do not silently expand implementation scope. Recompute NEXT_ACTION.md after reconciliation.
```

## 10. What you do NOT need to explain

When starting a fresh chat, you normally do **not** need to provide:

- the project's purpose;
- architecture;
- current phase;
- previous implementation details;
- previous agent's chat;
- old errors;
- old decisions;
- filenames to read;
- what another agent is currently doing;
- previous failed approaches;
- the current NEXT_ACTION;
- the project-control rules.

The repository is the continuity mechanism.

You only need to say **which agent** and **what you want done**. The agent recovers the rest.

## 11. How memory works

APCP deliberately uses multiple durable layers:

1. **Current owner requirement** — highest authority.
2. **Repository governance and committed Git state**.
3. **Active authorization/project-control state**.
4. **Shared AGENT_MEMORY.md** — reusable lessons for every agent.
5. **Role-local MEMORY.md** — lessons specific to that agent role.
6. **Role-local WORKLOG.md** — detailed execution history.
7. **Central AGENT_SESSIONS.md** — cross-chat session continuity.
8. **Central AGENT_EVENTS.md** — important cross-agent events.
9. **AGENT_HANDOFF.md / AGENT_BACKLOG.md** — coordination and routing.
10. **Old chat memory** — supplementary only, never authoritative.

If memory conflicts with current repository truth, current repository truth wins.

Agents must record meaningful mistakes, root causes, failed approaches, successful remedies, prevention rules, blockers, and next actions so future agents do not repeat known failures.

## 12. No-wait behavior

APCP does not require you to wait for another agent.

The operating sequence is:

**work → route dependency → record pending → select independent task → continue**

A pending GitHub Actions job, Vercel build, deployment, review, or verification task is not a reason to stop independent authorized work.

## 13. What agents must record before finishing

The agent should leave enough durable information for a fresh chat to continue immediately:

- session identity and role;
- starting Git ref/commit;
- task and authorization/safe-maintenance classification;
- files/code changed;
- work completed;
- evidence collected;
- errors and root causes;
- failed approaches;
- reusable lessons/prevention;
- blockers and owner;
- handoff if needed;
- exact NEXT_ACTION;
- session status.

## 14. If the agent must stop

Stopping should be precise, not vague.

The agent records:

**why stopped → what is missing → who owns it → exact recovery action → what independent work remains**

Typical valid stop conditions include missing/revoked authorization, material scope change requiring reconciliation, inconsistent repository/control state, destructive action without authority, role-boundary dependency, or no remaining independent authorized/safe work.

## 15. Quick one-line prompts

Use these when you want minimum typing:

**Continue development**
> DEV-01 / Forge: continue the next authorized development work from GitHub and project-control. Recover everything from the repo; do not ask for previous chat.

**Fix**
> FIX-01 / Sentinel: find and fix the current authorized bug/failure from GitHub and project-control; recover context yourself and record the lesson.

**Deployment**
> OPS-01 / Shipwright: handle the current CI/CD/Vercel/Docker/deployment/infrastructure work from repo state; do not wait for unrelated work.

**Daily work**
> WORK-01 / Rover: recover the project from GitHub and do this daily task safely without disturbing active agents: <TASK>

**New chat**
> <AGENT>: this is a fresh chat; continue where the project was left from GitHub/project-control, not previous chat memory.

**Concurrent**
> <AGENT>: work independently while other agents may be active; do not wait or interrupt them.

**Known mistake**
> FIX-01 / Rover: inspect shared and role memory for this known issue, prevent recurrence, and record the lesson: <ISSUE>

## 16. The simple rule

**Choose the specialist by the type of work. Choose WORK-01 when you just want a daily worker. Open a new chat whenever you want. Give only the task. The agent must recover the project, memory, architecture, authorization, current work, mistakes, and next action from GitHub.**

APCP governance remains authoritative; these prompts are convenience instructions and cannot grant authority by themselves.
