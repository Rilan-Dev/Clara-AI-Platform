# SESSION-033 — Integrations I-1 implementation checkpoint

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Baseline: 41eb115b849d52c547733bc5f0a6f97e09ed6de0
Decision: D-031

## Scope

D-031 authorizes only the host-neutral Integrations Framework contract/test foundation.

## Implementation

Added:
- `src/modules/ai-platform-core/integrations/integration-contracts.ts`;
- `src/modules/ai-platform-core/integrations/integration-contracts.test.ts`;
- platform-core export from `src/modules/ai-platform-core/index.ts`.

The contract surface covers:
- integration catalog descriptors;
- tenant/project/user connection references;
- opaque credential handles;
- OAuth protocol data;
- action definitions with zod schemas;
- execution requests/results;
- catalog/connection/credential/OAuth/egress/action-runner ports;
- a bridge typed to the Phase 7 Unified Tool Runtime `ToolDefinition`.

## Boundary verification

No persistence, schema, migration, OAuth route/token exchange, credential-vault implementation, Activepieces dependency/runtime, outbound HTTP, egress execution, deployment, MCP runtime, or billing/metering changes were introduced.

Focused tests statically review the credential/tenant boundary and adapter completeness. Executable verification is still pending because the GitHub connector exposes no Actions run for the current feature head.

## Outcome

**I-1 IMPLEMENTED — VERIFICATION PENDING.**

No I-2 or later integration implementation is authorized until executable verification and architect review of I-1 complete.


## Architect review checkpoint

The initial contract review found two trust-boundary weaknesses before closure:
1. generic connection metadata could become a credential-bearing bag;
2. generic error details could become a secret-bearing telemetry/result bag;
3. connection-store and credential-vault operations were ambiguous when multiple connections exist.

The implementation was corrected within D-031 scope:
- generic metadata/details were removed;
- concrete connection IDs are required for connection lookup/disconnect/credential-handle resolution;
- compile-time negative tests were added for the forbidden generic secret-bearing fields.

Focused I-1 CI verification was added for Vitest, strict TypeScript, and ESLint. The connected GitHub integration currently exposes no Actions run for the feature head, so executable Gate-C evidence remains unavailable.

**Gate D:** architect review = PASS_WITH_FOLLOWUP on the corrected contract.
**I-1 status:** IMPLEMENTED — VERIFICATION PENDING.
**Stopping boundary:** no I-2 or later integration implementation.

## Final I-1 artifact checkpoint

Added `src/modules/ai-platform-core/integrations/integration-threat-model.md` within D-031 scope. It records assets, trust boundaries, threat/control mappings, and explicit I-1 stopping boundaries. No runtime implementation was added.

Current branch tip is governed by this checkpoint. I-1 remains IMPLEMENTED — VERIFICATION PENDING because executable Actions evidence is still unavailable through the connected GitHub integration.
