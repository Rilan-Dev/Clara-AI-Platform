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


---

# 19. ElevenLabs-aligned product/design philosophy

The implementation must be **aligned with the current ElevenLabs Agents product model**, while keeping Clara's own information architecture, branding and business rules. This is an architectural/UX reference, not a pixel-for-pixel clone.

Reference: https://elevenlabs.io/docs/eleven-agents/operate/versioning

## 19.1 Core UX principles

Adopt these product principles:

1. **Configuration is a workspace, not a settings form.**
2. **Draft state is explicit.**
3. **Versions are immutable.**
4. **Branches are isolated workspaces for experimentation.**
5. **Publishing/deployment is separate from editing.**
6. **Production always points to an exact version.**
7. **Changes are reviewable before they become production.**
8. **Users should always see what is currently live.**
9. **Restore creates a new version; history is never destroyed.**
10. **Use progressive disclosure instead of exposing every control at once.**

## 19.2 Agent header pattern

The Agent workspace should have a persistent context/header similar in philosophy to modern agent-building products:

~~~
← Agents

Clara Sales Assistant
Main · v12 · Published

[Preview] [Versions] [Publish]
~~~

The header should answer immediately:

- Which agent am I editing?
- Which branch am I on?
- Which version is current?
- Are there unsaved changes?
- What is currently published?
- What action can I take next?

Avoid forcing users to navigate to another page to discover production state.

## 19.3 Branch-first editing model

The default editing context is a branch.

~~~
Main
● v12 Published

experiment/new-voice
○ v4 Draft
~~~

Branch selection should be visible near the agent title.

Creating a branch should clearly state the source version.

Do not hide branch semantics inside an advanced settings menu.

## 19.4 Draft vs version vs deployment

These must be visually distinct:

**Draft**
- mutable;
- not production;
- user can continue editing.

**Version**
- immutable;
- reviewable;
- reproducible.

**Deployment**
- points to one exact version;
- represents what production is executing.

Use distinct status labels and icons.

Never call a draft "published" simply because it was saved.

## 19.5 Version timeline

Use a compact version timeline inspired by version-control workflows:

~~~
Versions

● v12   Published
  "Updated Tamil voice behaviour"
  Mohammed · 2 min ago

○ v11
  "Added Tamil language"
  Mohammed · yesterday

○ v10
  "Initial production"
  Admin · Sep 18

[Compare] [Restore]
~~~

Selecting a version opens a half-canvas detail/diff rather than navigating the user away from the agent workspace.

## 19.6 Diff experience

The diff must be semantic rather than raw JSON.

Prefer:

~~~
Behaviour
+ Added "Keep responses concise"

Voice
Alloy
→ Sarvam Tamil Female

Tools
No changes

Knowledge
No changes
~~~

Do not expose JSON unless an advanced/debug view is intentionally requested.

## 19.7 Branch creation

Branch creation should feel like an isolated experiment:

~~~
Create branch

From
Main · v12

Branch name
experiment/new-voice

Description
Test Tamil realtime voice

[Create branch]
~~~

After creation, immediately switch the user into the new branch and make that context obvious.

## 19.8 Merge/rebase review

Never merge silently.

The review surface should show:

~~~
Merge experiment/new-voice → Main

3 changes
2 compatible
1 conflict

[Review conflict]
[Cancel] [Merge]
~~~

For conflicts, provide field-level resolution.

Do not make the user compare raw configuration objects.

## 19.9 Publish flow

Publishing should use a dedicated review surface:

~~~
Publish

Main · v12

Production currently
v11

Changes
+ Behaviour
+ Language
+ Voice

Validation
✓ Provider available
✓ Model available
✓ Voice available
✓ Subscription allows capability
✓ Tools valid

[Publish v12]
~~~

After publishing:

~~~
Published
Production is now running Main · v12
~~~

This explicit feedback is important because the user should never have to infer whether Save means Publish.

---

# 20. ElevenLabs-aligned information architecture without copying the UI

Clara should follow the same conceptual separation used by mature agent platforms:

~~~
Agent
│
├── Build
│   ├── Assistant & AI
│   ├── Knowledge
│   └── Tools
│
├── Develop
│   └── Versions / Branches
│
└── Deploy
    └── Publish
~~~

Do not turn every concept into a top-level global settings page.

The user should spend most of their time inside the Agent workspace.

---

# 21. Provider workspace UX

The provider area should follow the same progressive-disclosure philosophy.

Top level:

~~~
AI Providers & Models

[Chat] [Voice Chat] [Realtime Voice]
~~~

Provider cards:

~~~
OpenAI
Healthy
3 Chat models
2 Voice models

[Open provider]
~~~

Opening a provider uses a dedicated workspace/half-canvas:

~~~
OpenAI

Healthy · Last checked 2 min ago

Connection
API key ••••••••••A91
[Update] [Test]

Capabilities
✓ Chat
✓ Voice Chat
✓ Realtime Voice

Models
3 available

Usage
68% monthly allocation
⚠ Recharge recommended

[Disable provider]
~~~

This avoids the current anti-pattern of mixing credentials, health, model defaults, organization settings and provider configuration into one large panel.

---

# 22. Default Assistant should behave like a reusable baseline

The Default Assistant is the platform equivalent of a reusable starting configuration.

Show:

~~~
Default Assistant

Used when creating new agents

Current
v12

[Edit draft] [View versions]
~~~

When an agent is created:

~~~
Created from Default Assistant v12
~~~

When the default changes:

~~~
New platform default available

Your agent was created from v12.
Current platform default is v13.

[Review changes] [Keep current]
~~~

Do not automatically mutate the agent.

---

# 23. Platform Default version UI

Use the same conceptual version workflow as the Agent workspace:

~~~
Default Assistant
v12 Current

[Edit] [Versions] [Preview]

Version history
v12 Current
v11
v10
...
~~~

The user can:

- open a version;
- compare versions;
- restore as a new version;
- preview the configuration.

The version screen should not expose organization/agent data.

---

# 24. UI state model

Every relevant configuration screen should explicitly represent:

~~~
Loading
Ready
Draft changes
Saving
Saved
Validation error
Unavailable dependency
Published
Deployment failed
~~~

For example:

~~~
3 unsaved changes
[Save version]
~~~

After save:

~~~
Version 13 created
[View version]
~~~

After publish:

~~~
Production running v13
~~~

This eliminates ambiguous "Save" behavior.

---

# 25. No mental cross-checking rule

The final UX must obey this rule:

> **A user should never need to open three different screens to determine whether an AI provider/model/voice can be used.**

The UI receives resolved availability from the backend.

Example:

~~~
Realtime Voice

Provider
[ Sarvam ✓ ]

Model
[ Available realtime models ]

Voice
[ Available voices ]

Plan
✓ Included

Status
✓ Ready for this agent
~~~

If unavailable:

~~~
OpenAI Realtime

Unavailable

Reason
Not enabled by platform
~~~

or, in organization-facing agent UI, simply omit the unusable option when showing only selectable choices.

---

# 26. Visual design direction

The UI should be inspired by ElevenLabs' **product philosophy**, not copied literally.

Required characteristics:

- dark-first professional AI workspace;
- restrained visual hierarchy;
- compact but readable controls;
- persistent workspace context;
- strong typography hierarchy;
- subtle borders/dividers;
- status indicators;
- dense information where useful;
- large content canvas for actual configuration;
- right-side contextual drawers/half-canvas;
- sticky action areas;
- minimal modal usage;
- clear primary action;
- explicit production state;
- no dashboard-card overload.

Avoid:

- giant dashboard cards for every setting;
- nested accordion overload;
- duplicated provider information;
- unnecessary full-screen navigation for simple inspection;
- settings pages where the user cannot see current state;
- ambiguous Save/Publish buttons;
- hiding version context.

---

# 27. Responsive interaction pattern

Desktop:

~~~
Sidebar | Main workspace | Context drawer
~~~

Example:

~~~
Agent sidebar
    |
    | Assistant & AI
    |
    +-------------------------+----------------+
    | Configuration workspace | Version detail |
    |                         | / Diff drawer  |
    +-------------------------+----------------+
~~~

Tablet:

- collapse secondary navigation;
- retain primary workspace;
- convert drawer to overlay.

Mobile:

- stack workspace;
- version/diff becomes full-screen;
- preserve branch/version/publish status at the top.

---

# 28. Design-system reuse

Do not create separate visual systems for:

- Platform Default Assistant;
- Agent Assistant & AI;
- Version history;
- Provider detail.

Create reusable primitives:

~~~
AssistantEditor
ProviderCard
ProviderStatus
CapabilityTabs
VersionTimeline
VersionBadge
DiffViewer
BranchSelector
PublishReview
DeploymentStatus
ContextDrawer
~~~

Context/permissions should change the behavior, not the visual language.

---

# 29. ElevenLabs-inspired acceptance tests

### Agent workspace

- [ ] Current branch is always visible.
- [ ] Current version is always visible.
- [ ] Published version is always discoverable.
- [ ] Draft state is explicit.
- [ ] Preview does not publish.
- [ ] Save creates a version.
- [ ] Publish names the exact version.

### Versioning

- [ ] Versions are immutable.
- [ ] Branches start from an explicit version.
- [ ] Diff is semantic.
- [ ] Restore creates a new version.
- [ ] Merge requires review.
- [ ] Production points to an exact version.

### Provider UX

- [ ] Capability tabs are obvious.
- [ ] Provider health is visible without opening multiple settings.
- [ ] Configuration status is visible.
- [ ] Usage warnings are visible.
- [ ] Credentials are isolated from model selection.
- [ ] Unsupported capabilities do not appear as usable options.

### Platform defaults

- [ ] Default Assistant clearly says it is a baseline.
- [ ] Existing agents are not silently changed.
- [ ] New default availability is communicated explicitly.
- [ ] Version history is available from the same workspace.

---

# 30. Reference boundary

ElevenLabs is the reference for the **workflow model**:

- agent workspace;
- drafts;
- immutable versions;
- branches;
- version comparison;
- merge/rebase concepts;
- explicit deployment;
- production pointing to an exact version.

Clara-specific behavior remains authoritative for:

- platform/organization/agent ownership;
- OpenAI/Gemini/Sarvam integrations;
- subscription entitlements;
- provider health/usage policy;
- Clara branding;
- Clara-specific tools, knowledge and runtime architecture.

Do not copy ElevenLabs proprietary UI assets, text, branding or implementation. Adopt the interaction model and engineering principles.

