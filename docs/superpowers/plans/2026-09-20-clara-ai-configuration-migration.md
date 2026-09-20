# Clara AI Platform — AI Configuration Data Migration & Rollback Plan

> **For agentic workers:** Execute only after characterization tests and the provider-capability resolver are complete. Use Superpowers execution and verification workflows.

**Goal:** Safely move Clara from mixed organization AI settings to platform provider governance + subscription entitlements + agent-owned configuration, while preserving existing agents and avoiding an outage.

---

## 1. Migration principles

1. Migration is additive before destructive.
2. Existing runtime behavior remains available until new configuration is proven.
3. Never delete org_ai_settings during the first migration.
4. Never overwrite existing agent configuration.
5. Every migrated agent gets an immutable initial version.
6. Every migrated agent records the platform-default version from which it originated where known.
7. API keys remain server-side.
8. All new runtime resolution goes through the capability resolver.
9. Every migration has a dry-run mode.
10. Every destructive cleanup has a rollback checkpoint.

---

## 2. Final data domains

### Platform provider

~~~
platform_ai_providers
platform_ai_provider_credentials
platform_ai_provider_capabilities
platform_ai_provider_models
platform_ai_provider_health
platform_ai_provider_usage
~~~

### Subscription entitlement

~~~
plan_ai_capabilities
plan_ai_provider_entitlements
plan_ai_model_entitlements
~~~

Reuse existing plan tables where practical instead of duplicating subscription infrastructure.

### Platform default assistant

~~~
platform_assistant_defaults
platform_assistant_default_versions
~~~

Reuse existing platform-default storage where compatible.

### Agent versioning

~~~
agent_branches
agent_versions
agent_drafts
agent_deployments
~~~

---

## 3. Legacy source audit

Primary legacy source:

org_ai_settings

Before migration:

- [ ] Export row counts.
- [ ] Export provider values.
- [ ] Export model values.
- [ ] Identify invalid/unknown providers.
- [ ] Identify organizations with no AI settings.
- [ ] Identify duplicate/inconsistent provider names.
- [ ] Identify organizations with provider credentials in organization-level configuration.
- [ ] Identify agents whose effective configuration is stored outside the agent record.
- [ ] Identify legacy snapshots that contain meaningful configuration.

Produce a migration report and retain it as an artifact.

---

## 4. Stage A — Add new schema

Create additive migrations in the repository's normal migration numbering.

Recommended logical sequence:

~~~
001 platform provider registry
002 provider credentials
003 provider capabilities/models
004 provider health/usage
005 subscription AI entitlements
006 agent branches
007 agent versions
008 agent drafts
009 agent deployments
010 platform-default version history
~~~

Use actual repository migration numbers, not these placeholder numbers.

Every new table needs:

- primary key;
- timestamps;
- ownership/tenant keys where appropriate;
- foreign keys;
- runtime lookup indexes;
- unique constraints;
- authorization-compatible relationships.

Do not drop old columns in this release.

---

## 5. Stage B — Normalize providers

Canonical provider IDs:

~~~
openai
gemini
sarvam
~~~

Build an explicit legacy mapping table/function.

Reject unknown values during migration instead of silently guessing.

Important existing inconsistency: legacy organization constraints historically represent OpenAI/Gemini while newer provider code recognizes Sarvam. Replace this with a provider registry rather than adding another hard-coded constraint.

---

## 6. Stage C — Platform provider registry

For each currently configured provider:

1. Determine whether platform credentials exist.
2. Create/update platform provider record.
3. Store credentials through the existing secure secret mechanism.
4. Create capability records.
5. Discover configured models where supported.
6. Run health test.
7. Record health result.
8. Enable only after configured + successful health validation.

Do not infer that a provider should be globally enabled merely because an organization previously selected it.

---

## 7. Stage D — Subscription entitlements

Do not blindly copy organization provider selections into plan entitlements.

Instead:

1. Inspect existing plans.
2. Define explicit provider/capability/model entitlements.
3. Map existing customer behavior to plan capabilities.
4. Generate a report for organizations whose current configuration is not entitled.
5. Define a compatibility/fallback policy before runtime enforcement.

The runtime resolver must distinguish:

~~~
platform unavailable
plan not entitled
agent not configured
~~~

---

## 8. Stage E — Migrate every active agent

For each active agent:

1. Create Main branch.
2. Read its current effective configuration.
3. Create immutable v1.
4. Store configuration in agent_versions.configuration_json.
5. Preserve author/timestamp where available.
6. Record current published/public state.
7. If production/public, create a deployment pointing to the exact migrated version.
8. Preserve existing public identifiers/URLs.

Target:

~~~
Existing agent
     ↓
Main
     ↓
v1
     ↓
deployment → v1 when currently published
~~~

No user-visible behavior should change.

---

## 9. Stage F — Platform default provenance

When an agent was created from a known platform default, record that default version.

If historical provenance is unknown, store NULL and mark provenance as unknown.

Do not fabricate historical lineage.

---

## 10. Stage G — Legacy snapshot migration

For each meaningful SnapshotHistory record:

1. Preserve original metadata.
2. Convert compatible snapshots into immutable agent versions.
3. Preserve ordering.
4. Preserve timestamps where available.
5. Preserve author where available.
6. Mark imported history explicitly.
7. Do not invent parent relationships when historical parentage is unknown.

Imported history may be represented as source = legacy_snapshot.

---

## 11. Stage H — Dual read

During a controlled compatibility period:

~~~
new resolver
   ↓
if new configuration exists → new configuration
else
   ↓
legacy resolver
~~~

Log every legacy fallback.

Target:

legacy fallback count → 0

Do not keep dual-read indefinitely.

---

## 12. Stage I — Optional compatibility projection

If rollback requires legacy reads, maintain a limited compatibility projection.

Rules:

- New configuration is authoritative.
- New versions are immutable.
- Never mirror provider secrets into organization settings.
- Never create new provider infrastructure records in organization storage.
- Compatibility writes have a removal deadline.

---

## 13. Stage J — Freeze organization AI settings

After new platform/agent configuration is proven:

Disable mutation of legacy organization AI provider configuration.

The old API should return an explicit migration response instead of silently accepting ignored writes.

The organization should be directed to:

- Platform AI Providers & Models for platform-admin-controlled infrastructure.
- Agent Assistant & AI for agent-owned configuration.

---

## 14. Stage K — Remove legacy UI

After compatibility verification remove:

~~~
Organization Settings
└── AI Providers & Models
~~~

and:

~~~
Platform Settings
└── Organization AI Configuration
~~~

The platform admin must not have an organization-specific AI configuration screen.

---

## 15. Stage L — Runtime migration

Replace:

~~~
organization AI settings
      ↓
provider/model resolution
~~~

with:

~~~
platform provider registry
      ↓
health/capability
      ↓
subscription entitlement
      ↓
agent configuration
      ↓
runtime resolver
~~~

Runtime must reject stale agent selections that reference a provider/model that is no longer usable.

If a fallback is required, define it explicitly before enabling it. Never silently change a production provider when the change can materially affect behavior or cost.

---

## 16. Stage M — Legacy cleanup

Only after all of these are true:

- all active organizations are migrated;
- all active agents have Main/v1;
- production/public agents have deployments;
- resolver fallback is zero or explicitly understood;
- migration tests pass;
- rollback has been tested.

Then:

1. Stop application writes to obsolete fields.
2. Mark obsolete fields deprecated.
3. Archive data if required.
4. Drop obsolete constraints in a later release.
5. Drop obsolete columns in a later release.
6. Drop obsolete tables only after retention requirements are satisfied.

Never combine all destructive cleanup into the first migration.

---

## 17. Rollback

### Schema failure

Rollback application release. Keep additive tables.

### Data migration failure

Stop migration workers. Keep legacy data intact.

### Runtime failure

Switch feature flag to legacy resolution for unmigrated organizations.

### Resolver failure

Return to the last known-good provider resolution path while preserving new data.

### Publishing failure

Continue serving the last known deployment/version.

Never roll back by deleting immutable versions.

---

## 18. Verification

Before cleanup verify:

- [ ] Every active organization has a valid subscription.
- [ ] Every active agent has Main.
- [ ] Every active agent has at least one immutable version.
- [ ] Every production/public agent has a deployment.
- [ ] Every deployment points to an immutable version.
- [ ] No deployment points to a draft.
- [ ] No provider credentials remain in legacy organization settings.
- [ ] No unknown provider IDs remain.
- [ ] No cross-tenant branch/version relationships exist.
- [ ] No disabled provider can be selected by runtime.
- [ ] No non-entitled provider/model can be selected by runtime.
- [ ] Legacy fallback count is zero or explicitly approved.

---

## 19. UI verification

### Organization Settings

Must not contain AI Providers & Models.

### Platform Settings

Must contain:

~~~
AI Platform
├── Providers & Models
│   ├── Chat
│   ├── Voice Chat
│   └── Realtime Voice
└── Default Assistant
    ├── Identity
    ├── Behaviour
    ├── Language
    ├── Voice
    ├── Preview
    └── Versions
~~~

### Agent

Must contain:

~~~
Assistant & AI
Versions
Publish
~~~

---

## 20. Data integrity invariants

### Tenant isolation

~~~
version.agent.organization_id
==
request.organization_id
~~~

### Branch isolation

~~~
branch.agent_id
==
version.agent_id
~~~

### Deployment immutability

A deployment points to one immutable version.

### Provider capability

~~~
provider.enabled
AND provider.configured
AND provider.healthy
AND provider.supports(capability)
~~~

### Subscription

~~~
plan.allows(provider, capability, model)
~~~

### Agent

The selected provider/model must pass the resolver at runtime.

---

## 21. Rollout releases

### Release 1

- Add schema.
- Add resolver.
- Add characterization tests.
- No legacy UI removal.

### Release 2

- Migrate provider infrastructure.
- Migrate platform defaults.
- Create agent Main/v1.
- Enable dual-read.

### Release 3

- Enable provider workspace.
- Enable Default Assistant versioning.
- Enable agent versions/branches behind feature flags.

### Release 4

- Enable publishing workspace.
- Migrate public deployments.
- Monitor runtime.

### Release 5

- Freeze legacy organization AI writes.
- Remove legacy UI.

### Release 6

- Remove compatibility reads.
- Archive/drop obsolete storage after retention requirements.

---

## 22. Migration completion definition

The migration is complete when:

~~~
Legacy organization AI configuration
           ↓
0 active writes
0 unexpected reads
0 unresolved production agents
~~~

and:

~~~
Platform Provider Governance
        +
Subscription Entitlements
        +
Agent Configuration
        +
Immutable Versions
        +
Deployments
~~~

are the only authoritative runtime paths.

---

## 23. Required implementation artifacts

Maintain:

~~~
docs/superpowers/specs/
  YYYY-MM-DD-clara-ai-configuration-governance.md

docs/superpowers/plans/
  YYYY-MM-DD-clara-ai-configuration-platform-agent.md
  YYYY-MM-DD-clara-ai-configuration-migration.md
~~~

The implementation plan is the execution contract. The migration plan is the safety contract.
