# Integrations Framework I-6 — MCP Tool Bridge

Date: 2026-10-08
Owner: ChatGPT
Authorization: Explicit owner instruction to continue the next pending implementation
Baseline: `1e4495ebcc737074e958b15e6dcf2228d36d1d75`
Status: IMPLEMENTATION ACTIVE — BOUNDED HARDENING

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
