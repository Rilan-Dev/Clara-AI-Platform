# Clara AI Platform — AI Configuration, Provider Governance & Agent Versioning Implementation Plan

> **For agentic workers:** Use the Superpowers workflow: superpowers:writing-plans → superpowers:executing-plans or superpowers:subagent-driven-development → superpowers:verification-before-completion → superpowers:requesting-code-review → superpowers:finishing-a-development-branch.
>
> **Status:** Proposed implementation plan. Do not begin destructive migration until migration checkpoints and compatibility tests pass.

**Goal:** Restructure Clara's AI configuration so platform administrators govern provider infrastructure, capabilities, subscription entitlements and platform defaults, while organizations configure their own agents. Remove organization-level provider infrastructure settings, introduce clear Chat / Voice Chat / Realtime Voice provider configuration, standardize Default Assistant on the existing Identity / Behaviour / Language / Voice / Preview editor, and replace agent snapshots with Git-like database versioning, branches, diffs, restore and publishing.

**Repository:** Rilan-Dev/Clara-AI-Platform

**Primary rule:** Platform capability → Subscription entitlement → Agent selection.

The UI must never require an organization user to mentally calculate whether a provider/model is usable. The backend resolver returns only currently usable capabilities.

---

## 1. Target ownership

### Platform Admin owns

- Provider credentials/API keys.
- Provider enable/disable state.
- Provider health checks.
- Provider capabilities.
- Provider model catalogue and availability.
- Provider usage/quota/recharge warnings.
- Platform default Chat provider/model.
- Platform default Voice Chat provider/model.
- Platform default Realtime Voice provider/model.
- Default Assistant Identity / Behaviour / Language / Voice.
- Subscription plan AI entitlements and limits.
- Platform-level Default Assistant version history, diff and restore.
- Platform audit records.

### Organization owns the workspace

- Members.
- Billing/subscription within platform rules.
- Agents.

### Agent owns

- Identity.
- Behaviour.
- Language.
- Voice.
- Agent AI model selections from the allowed capability set.
- Knowledge.
- Tools.
- Agent-scoped runtime settings.
- Drafts.
- Branches.
- Versions.
- Publishing/public access.

### Organization must not own

- Provider API keys.
- Provider health.
- Provider catalogue.
- Global provider enable/disable.
- Global model availability.
- Platform provider defaults.
- Another organization's AI configuration.

---

## 2. Target navigation

~~~
Platform Admin
├── Dashboard
├── Organisations
├── Platform Settings
│   ├── AI Platform
│   │   ├── Providers & Models
│   │   │   ├── Chat
│   │   │   ├── Voice Chat
│   │   │   └── Realtime Voice
│   │   └── Default Assistant
│   │       ├── Identity
│   │       ├── Behaviour
│   │       ├── Language
│   │       ├── Voice
│   │       ├── Preview
│   │       └── Versions
│   ├── Plans
│   └── Usage
└── ...

Organization
├── Overview
├── Agents
│   └── Agent
│       ├── Overview
│       ├── Assistant & AI
│       │   ├── Identity
│       │   ├── Behaviour
│       │   ├── Language
│       │   ├── Voice
│       │   └── Preview
│       ├── Knowledge
│       ├── Tools
│       ├── Versions
│       └── Publish
├── Members
├── Billing
└── Settings
~~~

Remove:

Organization → Settings → AI Providers & Models

Remove:

Platform Settings → Organization AI Configuration

Do not provide a platform-admin shortcut into an individual organization's AI settings.

---

## 3. AI Providers & Models

### 3.1 Capability tabs

Use exactly three top-level tabs:

- Chat
- Voice Chat
- Realtime Voice

Do not put all provider configuration into one giant card.

Each tab shows only providers configured and enabled for that capability.

### 3.2 Provider cards

Each provider gets its own card:

~~~
OpenAI
● Healthy

Chat models
3 available

Capabilities
Chat · Voice · Realtime

[Configure]
~~~

Provider credentials, models, health and usage are not expanded into one giant settings card.

### 3.3 Provider detail workspace

~~~
Provider
├── Connection
├── Capabilities
├── Models
├── Health
└── Usage
~~~

Connection contains:

- configured/not configured state;
- masked credential;
- update credential;
- test connection.

Never return provider secrets to the browser.

### 3.4 Provider lifecycle

~~~
Not configured
    ↓
Configured
    ↓
Health checked
    ↓
Enabled
    ↓
Capability available
    ↓
Subscription entitlement
    ↓
Agent option
~~~

If a provider is not configured or is disabled, it must not appear as a selectable runtime provider for organizations/agents.

It may remain visible to the platform admin as Not configured or Disabled because the admin needs to manage infrastructure.

---

## 4. Capability resolver

Introduce one server-side resolver instead of repeating provider filtering in individual UIs.

Conceptual API:

~~~
resolveAvailableAIOptions({
  organizationId,
  agentId,
  capability: "chat" | "voice_chat" | "realtime_voice"
})
~~~

Resolution:

~~~
Platform provider
  + configured
  + enabled
  + healthy
  + supports capability
          ↓
Subscription entitlement
          ↓
Agent capability
          ↓
Available provider/model list
~~~

The resolver returns only usable choices.

It must not return:

- disabled providers;
- providers without credentials;
- unavailable models;
- capabilities not included in the subscription;
- cross-tenant resources.

This resolver becomes the source of truth for both UI and runtime validation.

---

## 5. Chat / Voice Chat / Realtime Voice

### Chat

Text-oriented assistant execution.

### Voice Chat

Turn-based or standard speech interaction:

STT → Clara turn → LLM/RAG/tools → TTS

### Realtime Voice

Continuous low-latency realtime interaction.

Provider support is capability-specific. Do not assume every provider supports every mode.

For example, Sarvam must only appear in Realtime Voice if the deployed Sarvam adapter reports realtime capability.

---

## 6. Platform Default Assistant

Reuse the existing ConfigEditor design.

Canonical editor:

~~~
Default Assistant

[Identity] [Behaviour] [Language] [Voice] [Preview]
~~~

This should be visually and behaviorally the same editor used inside agents, while permissions/context differ.

The platform default is a template/baseline, not a live parent that silently modifies existing agents.

When an agent is created:

~~~
Platform Default v12
       ↓
Agent Main v1
~~~

Record the source default version.

If the platform default later becomes v13, existing agents remain unchanged until an explicit review/apply operation.

---

## 7. Platform Default versioning

Create immutable versions.

Example:

~~~
Default Assistant
v12 Current
v11
v10
~~~

Every saved version contains:

- immutable configuration JSON;
- parent version;
- author;
- timestamp;
- change summary;
- source/default metadata where known.

Never update an immutable version.

### Diff

Provide field-aware diff:

~~~
Version 11 → Version 12

Identity
Assistant name
  Clara
→ Clara AI

Behaviour
+ Always cite sources

Language
English
→ English + Tamil

Voice
Alloy
→ Nova
~~~

### Restore

Restore must create a new version:

~~~
Restore v10?

This will create v13 using v10's configuration.
No history will be deleted.

[Cancel] [Restore as new version]
~~~

---

## 8. Agent version control

Do not create a physical Git repository/branch per agent.

Implement Git-like semantics in PostgreSQL:

- drafts;
- immutable versions;
- branches;
- parent relationships;
- merge;
- rebase where needed;
- deployment records.

### Proposed tables

~~~
agent_branches
----------------
id
agent_id
name
description
is_main
is_archived
created_by
created_at
updated_at
~~~

~~~
agent_versions
----------------
id
agent_id
branch_id
version_number
parent_version_id
configuration_json
change_summary
created_by
created_at
published_at
~~~

~~~
agent_drafts
----------------
id
agent_id
branch_id
user_id
configuration_json
updated_at
~~~

~~~
agent_deployments
----------------
id
agent_id
branch_id
version_id
environment
status
public_access
published_by
published_at
~~~

Use JSONB for the versioned agent configuration initially, while keeping high-value searchable/runtime fields normalized where the current architecture requires them.

---

## 9. Agent lifecycle

~~~
Draft
  ↓
Preview
  ↓
Save Version
  ↓
Test
  ↓
Publish
  ↓
Production
~~~

Editing must not mutate the currently published immutable version.

---

## 10. Branching

Every agent gets a permanent Main branch.

~~~
Main
├── v1
├── v2
└── v3

experiment/new-voice
├── v1
└── v2
~~~

Creating a branch:

~~~
Create branch

Name: experiment/new-voice
From: Main v3

[Create branch]
~~~

Branch creation copies the source version into the branch as its starting point.

---

## 11. Merge and diff

Before merge:

~~~
experiment/new-voice → Main

Changes
Identity       No changes
Behaviour      + 2 rules
Language       + Tamil
Voice          Alloy → Sarvam voice
Knowledge      No changes
Tools          No changes

[Merge into Main]
~~~

Merge creates a new immutable Main version.

Never rewrite the source branch history.

If conflicting fields are introduced, require explicit resolution rather than silently choosing one side.

---

## 12. Publishing

Publishing is a separate workspace.

~~~
Publish Agent

Clara Sales Assistant

Branch
Main

Version
v12

Status
● Ready

Changes since last publish
✓ Behaviour
✓ Language
✓ Voice

Public access
○ Private
● Public

[Publish v12]
~~~

Separate these concepts:

- save version;
- publish version;
- public access;
- embed access.

Do not overload enablePublicEmbed into a generic publish operation.

---

## 13. Public deployment

Publishing creates/updates a deployment record.

Runtime resolves:

~~~
agent
 → production deployment
 → branch
 → immutable version
 → runtime configuration
~~~

A public request must never resolve to arbitrary mutable draft state.

---

## 14. Organization agent AI configuration

Inside the agent:

~~~
Assistant & AI

Identity
Behaviour
Language
Voice
AI
Preview
~~~

AI model controls use the capability resolver.

No API key fields.

No provider health settings.

No platform model catalogue.

No organization-wide provider infrastructure settings.

Only currently usable provider/model choices are presented.

---

## 15. Permission matrix

| Setting | Platform Admin | Organization | Agent |
|---|---:|---:|---:|
| Provider API key | ✓ | — | — |
| Provider enabled | ✓ | — | — |
| Provider health | ✓ | — | — |
| Provider models | ✓ | — | — |
| Provider usage | ✓ | — | — |
| Provider capability | ✓ | — | — |
| Subscription entitlement | ✓ | — | — |
| Platform defaults | ✓ | — | inherited |
| Default Assistant versioning | ✓ | — | — |
| Agent identity | — | — | ✓ |
| Agent behaviour | — | — | ✓ |
| Agent language | — | — | ✓ |
| Agent voice | — | — | ✓ |
| Agent model selection | policy | — | ✓ |
| Agent knowledge | — | — | ✓ |
| Agent tools | policy | — | ✓ |
| Agent branches | — | — | ✓ |
| Agent versions | — | — | ✓ |
| Agent publish | — | — | ✓ |
| Public access | policy | policy | ✓ |

---

## 16. Implementation phases

### Phase 0 — Baseline and compatibility

- [ ] Inventory all current AI provider/model settings.
- [ ] Inventory OrgAIConfigEditor.
- [ ] Inventory PlatformAIProvidersPanel.
- [ ] Inventory ConfigEditor.
- [ ] Inventory SnapshotHistory.
- [ ] Inventory all AI settings API routes.
- [ ] Inventory runtime provider resolution.
- [ ] Inventory migrations touching organization AI configuration.
- [ ] Inventory subscription plan capability storage.
- [ ] Write characterization tests before behavior changes.
- [ ] Establish database backup/export procedure.

**Verification:** current tests and type-check pass before migration.

### Phase 1 — Provider governance backend

- [ ] Create/normalize platform provider registry.
- [ ] Add configured/enabled state.
- [ ] Add capability matrix.
- [ ] Separate provider credentials from provider configuration.
- [ ] Add provider health records.
- [ ] Add provider usage/quota status.
- [ ] Normalize OpenAI, Gemini and Sarvam identifiers.
- [ ] Remove hard-coded provider lists from runtime filtering.
- [ ] Add capability resolver.
- [ ] Add authorization tests.

**Verification:** a disabled/unconfigured provider cannot be returned by the resolver.

### Phase 2 — Subscription entitlement resolver

- [ ] Model provider/capability/model entitlements at plan level.
- [ ] Keep plan entitlement separate from provider credentials.
- [ ] Resolve platform availability + plan availability together.
- [ ] Add tests for every provider/capability combination.
- [ ] Ensure unavailable providers never appear to an organization.

### Phase 3 — Platform Providers & Models UI

- [ ] Replace the monolithic provider card.
- [ ] Add Chat / Voice Chat / Realtime Voice tabs.
- [ ] Add provider cards.
- [ ] Add provider detail page/drawer.
- [ ] Add credentials screen.
- [ ] Add health status.
- [ ] Add model catalogue.
- [ ] Add usage/recharge warnings.
- [ ] Hide non-runtime providers from organization-facing selectors.
- [ ] Use half-canvas for provider details where appropriate.

### Phase 4 — Default Assistant UI/versioning

- [ ] Reuse ConfigEditor.
- [ ] Rename platform section to Default Assistant.
- [ ] Preserve Identity / Behaviour / Language / Voice / Preview.
- [ ] Add draft state.
- [ ] Add immutable versions.
- [ ] Add history.
- [ ] Add field-level diff.
- [ ] Add restore-as-new-version.
- [ ] Add audit metadata.

### Phase 5 — Agent version-control backend

- [ ] Add branches.
- [ ] Add immutable versions.
- [ ] Add drafts.
- [ ] Add parent-version relationships.
- [ ] Add branch creation.
- [ ] Add diff service.
- [ ] Add restore-as-new-version.
- [ ] Add merge.
- [ ] Add rebase if required by the final conflict model.
- [ ] Add deployment records.
- [ ] Add authorization around branch/version mutation.

### Phase 6 — Agent workspace UI

- [ ] Add Assistant & AI workspace.
- [ ] Reuse ConfigEditor.
- [ ] Add branch selector.
- [ ] Add draft indicator.
- [ ] Add save-version flow.
- [ ] Add version history.
- [ ] Add diff drawer/half-canvas.
- [ ] Add branch creation.
- [ ] Add merge review.
- [ ] Add restore.

### Phase 7 — Publishing

- [ ] Create separate Publish screen.
- [ ] Show exact branch/version being published.
- [ ] Show changes since previous production version.
- [ ] Validate configuration before publish.
- [ ] Publish immutable version only.
- [ ] Add public/private access state.
- [ ] Add deployment status.
- [ ] Add rollback to a previous immutable version.
- [ ] Ensure runtime resolves deployment, not draft.

### Phase 8 — Remove legacy ownership

Only after all migration tests pass:

- [ ] Remove Organization Settings → AI Providers & Models UI.
- [ ] Remove Platform Settings → Organization AI Configuration.
- [ ] Remove organization provider API key handling.
- [ ] Remove obsolete organization provider/model fields.
- [ ] Remove stale UI types.
- [ ] Remove obsolete routes.
- [ ] Remove stale runtime assumptions.
- [ ] Keep compatibility views only where migration requires them.

### Phase 9 — Final verification

- [ ] Full unit tests.
- [ ] API tests.
- [ ] Authorization tests.
- [ ] Migration tests.
- [ ] Runtime provider resolution tests.
- [ ] UI smoke tests.
- [ ] TypeScript check.
- [ ] ESLint.
- [ ] Production build.
- [ ] Migration dry-run.
- [ ] Rollback test.
- [ ] Public deployment test.
- [ ] Cross-organization isolation test.

---

## 17. Acceptance criteria

### Platform Admin

- Can configure OpenAI, Gemini and Sarvam independently.
- Can enable/disable each provider.
- Can test provider connection.
- Can see health.
- Can see usage/recharge warnings.
- Can configure model availability.
- Can configure Chat defaults.
- Can configure Voice Chat defaults.
- Can configure Realtime Voice defaults.
- Can configure Default Assistant using Identity / Behaviour / Language / Voice / Preview.
- Can view versions.
- Can inspect diffs.
- Can restore previous default configuration as a new version.

### Organization

- Cannot configure provider API keys.
- Cannot configure provider infrastructure.
- Cannot configure global provider availability.
- Cannot see irrelevant unavailable providers in agent selectors.
- Can access its agents.

### Agent

- Can configure allowed AI settings.
- Can edit Identity / Behaviour / Language / Voice.
- Can create drafts.
- Can create versions.
- Can create branches.
- Can compare versions.
- Can restore versions.
- Can merge branches.
- Can publish a specific immutable version.
- Can control public access according to platform policy.

### Integrity

- Provider switching cannot change tenant/agent knowledge binding.
- Disabled providers cannot be selected at runtime.
- Unavailable subscription capabilities cannot be selected at runtime.
- Drafts cannot accidentally become production.
- Published versions are immutable.
- Restore never destroys history.
- Public runtime never loads arbitrary draft state.
- Cross-organization configuration access is rejected server-side.

---

## 18. Superpowers execution sequence

1. Use superpowers:writing-plans to review/refine this plan.
2. Implement Phase 0 characterization tests first.
3. Implement backend ownership and resolver before deleting UI.
4. Implement migration in additive steps.
5. Implement new platform UI.
6. Implement agent versioning.
7. Implement publishing.
8. Remove legacy organization/platform configuration only after compatibility verification.
9. Run superpowers:verification-before-completion.
10. Request code review.
11. Finish the development branch only after migration and rollback checks pass.

**Do not start with a UI-only migration. Backend ownership and resolver behavior must be authoritative first.**
