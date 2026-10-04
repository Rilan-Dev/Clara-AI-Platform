# SESSION-032 — Next capability planning: Integrations Framework

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Baseline: 3f6ac729c5ad3a013f074d40cdc9d7d341f3c1a5
Decision: D-030

## Planning outcome

Phase 7 is closed. The repository's ordered capability graph places the Integrations Framework after the Unified Tool Runtime and before the MCP framework / full agent runtime.

The immutable Doable reference contains:
- `docs/doable-source/contracts/integrations.ts` — host-neutral integration descriptor/connection/adapter vocabulary;
- `docs/doable-source/doable-source/services/api/src/integrations/**` — registry, OAuth, credential vault, connection management, action runner, and tool-bridge reference implementations;
- integration capability manifests and UI/reference material.

## Architectural boundary

The next capability must be designed as a host-neutral adapter layer. The reusable core must not directly own Clara database tables, OAuth client secrets, encrypted credential storage, deployment/network policy, or Activepieces runtime state.

Integration actions must invoke through the Phase 7 Unified Tool Runtime. No parallel tool executor is permitted.

## Critical risks

1. Credential leakage into model/tool/telemetry surfaces.
2. Cross-tenant connection-scope confusion.
3. OAuth state tampering/replay or callback scope confusion.
4. Outbound SSRF/egress expansion.
5. Persistence/schema coupling to the Clara host.
6. Duplicate execution paths between integrations and the Unified Tool Runtime.
7. Accidental creation of a new billable usage spine contrary to D-023.

## Scope status

D-030 authorizes planning and architecture review only. No integration runtime code, migration, OAuth route, credential vault, Activepieces dependency, deployment change, or database mutation is authorized by this session.

## Outcome

**Planning package created:** `docs/superpowers/plans/2026-10-05-clara-integrations-framework.md`.

**Implementation:** NOT AUTHORIZED.

The next decision boundary is architect review of the planning package and explicit implementation authorization.
