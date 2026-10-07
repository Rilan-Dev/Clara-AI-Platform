# Integrations Framework I-4/I-5 — Unified Tool Runtime Bridge + First Provider Pilot

Date: 2026-10-08
Owner: ChatGPT
Authorization: Explicit owner instruction on 2026-10-08
Baseline: feature branch at current authorization
Status: IMPLEMENTATION ACTIVE

## Objective

Advance the already-implemented I-2 integration control plane and bounded I-3 Action Runner into:

- **I-4 — Unified Tool Runtime bridge:** connected integration actions are represented as Clara-owned `ToolDefinition` objects and execute only through the existing Phase 7 Unified Tool Runtime.
- **I-5 — First-provider pilot:** prove one low-risk, read-oriented provider action end-to-end using the existing I-2 connection lifecycle and the I-4 bridge.

External CI, Vercel, Gate-C and Gate-D execution is intentionally not awaited and is not acceptance evidence.

## I-4 implementation contract

1. No second integration executor is introduced.
2. Integration actions are converted to `ToolDefinition` instances.
3. Action input validation reuses the authoritative I-3 `validateActionProps` rules through a Zod refinement.
4. Tool names are deterministic and bounded to the Unified Tool Runtime's 64-character contract.
5. Runtime authorization remains fail-closed and requires a provenance-verified `PlatformExecutionContext`.
6. Organisation, agent, plan and active-connection readiness are checked before exposing connected actions.
7. Actual execution delegates to the existing `runAction()`, preserving I-2 credential, OAuth, egress, redaction and tenant boundaries.
8. Runtime registration is idempotent.
9. No credentials are placed in tool definitions, schemas, metadata or runtime context.
10. The bridge supports chat, realtime and embed surfaces.

## I-5 provider pilot

Provider: **Firecrawl**
Action: **search**
Reason: read-oriented web-search operation, avoiding an initial destructive/write-capability pilot.

Pilot controls:
- default-off feature flag: `ENABLE_INTEGRATION_PROVIDER_PILOT`;
- exact allowlist: Firecrawl + `search`;
- no provider SDK is added;
- connection lifecycle remains the existing I-2 organisation integration connect/list/disconnect path;
- invocation flows through I-4 and then I-3 `runAction()`;
- invalid/missing credentials fail closed;
- provider errors retain I-3 normalized error metadata and redacted traces;
- disabling the flag removes pilot registration without changing existing integrations.

## Files

- `src/modules/ai-platform-core/integrations/integration-tool-bridge.ts`
- `src/modules/ai-platform-core/integration-provider-pilot.ts`
- `src/modules/ai-platform-core/integration-tool-bridge.test.ts`
- `src/modules/ai-platform-core/index.ts`

## Explicit non-goals

- MCP framework/runtime
- broad Activepieces catalog rollout
- broad OAuth callback/transport expansion
- autonomous-agent redesign
- billing/usage-event schema changes
- production promotion
- immutable Doable/reference modification
- additional provider pilots before the first-provider review

## Completion contract

I-4 is implementation-complete when connected actions can be discovered as ToolDefinitions and every invocation reaches the existing Unified Tool Runtime and then `runAction()`.

I-5 is implementation-complete when the Firecrawl search pilot is default-off, exact-allowlisted, represented as a ToolDefinition, and composes the existing I-2 connect/disconnect lifecycle with the I-4 runtime path.

Runtime/external smoke evidence remains separately deferred under owner control.
