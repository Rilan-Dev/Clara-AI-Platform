# AI Configuration Migration Report

Generated: 2026-09-20T00:40:28.280Z · Mode: **apply**

## Stage B/C — Provider registry

| Provider | Configured | Kill-switch | Enabled |
|---|---|---|---|
| openai | yes | on | yes |
| gemini | yes | on | yes |
| sarvam | yes | on | yes |
| elevenlabs | no | off | yes |

## Stage D — Entitlement audit

```json
{
  "orgsAudited": 2,
  "orgsWithVoiceChatNotEntitled": []
}
```

## Stage E/F/G — Agent migration

```json
{
  "activeAgents": 3,
  "migrated": 0,
  "skippedAlreadyVersioned": 3,
  "importedSnapshotVersions": 0,
  "deploymentsCreated": 0,
  "details": []
}
```

## §18 Verification checklist

| Check | Result | Detail |
|---|---|---|
| Every active agent has a Main branch | PASS | 3/3 |
| Every active agent has at least one immutable version | PASS | 3/3 |
| Every published agent has a deployment | PASS | 1/1 |
| Every deployment points to an immutable version | PASS | 0 orphans |
| No deployment points to a draft | PASS | enforced by FK agent_deployments.version_id → agent_versions.id |
| No unknown provider IDs remain | PASS | none |
| No cross-tenant branch/version relationships | PASS | 0 violations |
| No disabled provider can be selected by runtime | PASS | none |
| Legacy fallback count is zero or explicitly understood | WARN | 2 agents without deployments still resolve via the legacy chain (dual-read) |
| Every active organisation has a subscription record (entitlement resolution) | PASS | 0 without |

## Warnings

- 1 organisation allow-list(s) lacked the platform default provider "sarvam" — repaired additively.
- Verification: Legacy fallback count is zero or explicitly understood — 2 agents without deployments still resolve via the legacy chain (dual-read)
