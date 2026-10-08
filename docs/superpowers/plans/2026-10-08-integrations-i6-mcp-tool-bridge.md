# Integrations Framework I-6 — MCP Tool Bridge

Date: 2026-10-08
Owner: ChatGPT
Authorization: Explicit owner instruction to continue the next pending implementation
Baseline: `1e4495ebcc737074e958b15e6dcf2228d36d1d75`
Status: IMPLEMENTATION COMPLETE — EXTERNAL VERIFICATION DEFERRED

## Objective

Add the next bounded integrations capability after I-5: a Clara-owned MCP tool bridge that represents already-resolved MCP tools as Unified Tool Runtime `ToolDefinition` capabilities.

This phase is deliberately a bridge/contract phase. It does not introduce an MCP network transport, server process, persistence, OAuth callback flow, marketplace, or second tool executor.

## Scope

1. Define a host-neutral MCP tool descriptor and resolver adapter.
2. Convert an allowlisted MCP tool into an existing Clara `ToolDefinition`.
3. Require a provenance-verified `PlatformExecutionContext`.
4. Keep tenant/server/tool authorization explicit and fail closed.
5. Delegate invocation through the existing Unified Tool Runtime.
6. Keep MCP default-off through the existing runtime flag.
7. Add focused source regressions for deterministic naming, allowlisting, flag-off behavior, context binding, and delegation.
8. Export the bridge from the existing AI Platform Core public seam.
9. Treat resolver discovery failures as unavailable capabilities and fail closed.
10. Prove runtime-level schema validation and exact execution-context preservation through the Unified Tool Runtime.

## Security contract

- No MCP credential is stored in a tool definition.
- No server token is exposed to model-visible metadata.
- Server/tool identifiers are allowlisted before registration.
- Tool input is validated by the MCP adapter's supplied Zod schema.
- Tenant context is passed unchanged to the injected MCP resolver/invoker.
- The bridge never performs arbitrary outbound HTTP itself.
- MCP invocation ultimately uses the Unified Tool Runtime; no parallel executor is created.
- An unavailable resolver, missing tool, disabled flag, invalid context, or authorization failure fails closed.

## Explicit non-goals

- MCP transport implementation (stdio, SSE, Streamable HTTP).
- MCP server hosting.
- OAuth/client registration/callback implementation.
- Persistent MCP server/connection tables.
- Marketplace/catalog rollout.
- Autonomous-agent redesign.
- Production promotion or deployment changes.
- Billing/usage-event schema changes.
- Broad provider rollout.

## Acceptance contract

I-6 implementation is complete when an already-resolved MCP tool can be represented as a Clara `ToolDefinition`, is allowlisted and default-off, preserves the caller's tenant context, invokes only through the existing Unified Tool Runtime, fails closed on resolver/identity drift, and is exported from the AI Platform Core seam.

External CI/Vercel/Gate-C/Gate-D evidence remains deferred under owner instruction.


## 2026-10-08 — I-6 bounded hardening checkpoint

- `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6` makes MCP tool names deterministic at the full 64-character boundary with an identity-derived suffix, preventing collisions caused by sanitizing distinct server/tool identifiers to the same string.
- `d4bfbe112863696c99ad7abb81857a9399f079c2` adds regressions for name-collision resistance and explicit empty surface allowlists.
- An explicitly supplied empty `allowedSurfaces` list is now treated as no permitted surface and fails closed; only an omitted list receives the default Clara surface set.
- External CI/Vercel/Gate-C/Gate-D evidence remains deferred under owner instruction.

## 2026-10-08 — I-6 bounded hardening checkpoint

- `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6` makes MCP tool names deterministic at the full 64-character boundary with an identity-derived suffix, preventing collisions caused by sanitizing distinct server/tool identifiers to the same string.
- `d4bfbe112863696c99ad7abb81857a9399f079c2` adds regressions for name-collision resistance and explicit empty surface allowlists.
- An explicitly supplied empty `allowedSurfaces` list is now treated as no permitted surface and fails closed; only an omitted list receives the default Clara surface set.
- External CI/Vercel/Gate-C/Gate-D evidence remains deferred under owner instruction.

## 2026-10-08 — I-6 helper contract hardening

- The public static helper is now named `isMcpToolAllowlisted`; it returns only whether the exact server/tool pair is statically allowlisted.
- Full authorization remains exclusively in the Unified Tool Runtime (surface, required identity, host RBAC, plan entitlement, and tenant checks).
- This prevents a convenience helper from being mistaken for the authoritative authorization boundary.


## 2026-10-08 — I-6 implementation completion checkpoint

The bounded implementation contract is complete. Final implementation coverage includes:
- exact server/tool pair allowlisting with coarse server boundary;
- default-off `ENABLE_MCP` registration;
- deterministic 64-character collision-resistant MCP tool names;
- runtime validation of resolver, policy, descriptor, surface, and input-schema boundaries;
- frozen resolver discovery requests;
- exact provenance-verified execution-context identity binding;
- isolated Unified Tool Runtime delegation;
- fail-closed discovery and registration;
- retry-safe registration identity bookkeeping;
- public AI Platform Core export;
- focused source regressions for the above invariants.

Implementation commits include the final registration correction `a215bb81b1bf53f1c4c98d5205aa841bb2a0ee43` and regression `e4cdc946a15b76a004e4123be5eaf060b4edcd9d`.

No MCP transport/server hosting, OAuth/persistence, marketplace/catalog, broad provider rollout, production promotion, billing redesign, or unrelated implementation was introduced.

External CI/Vercel/Gate-C/Gate-D execution remains intentionally deferred and is not claimed as verification evidence.
