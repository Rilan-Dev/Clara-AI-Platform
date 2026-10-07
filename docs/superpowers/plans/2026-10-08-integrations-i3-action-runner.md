# Integrations Framework I-3 — Action Runner Implementation Plan

Date: 2026-10-08
Owner: ChatGPT
Authorization: Explicit owner instruction on 2026-10-08
Baseline: current feature branch at authorization time
Status: IN_PROGRESS

## Objective

Complete the bounded I-3 Action Runner capability defined by the Integrations Framework plan: execute one approved integration action through the existing Clara runner while enforcing input validation, tenant authorization, host egress/SSRF policy, deterministic error normalization, redacted tracing, and tenant-isolation behavior.

## In scope

- Existing `src/modules/integrations/runtime/**` runner path.
- Pre-execution action schema validation.
- Existing execution authorization and connection/credential scope.
- Existing host-owned egress and redirect policy.
- Stable runner error codes and retryability metadata.
- Redacted HTTP/XRay/usage error surfaces.
- Focused regression tests.

## Out of scope

- I-4 Unified Tool Runtime bridge.
- I-5 first-provider rollout.
- MCP framework/runtime.
- Broad OAuth transport/callback implementation.
- New billing/usage-event semantics.
- New database migrations unless a separately authorized I-3 defect proves one unavoidable.
- Production promotion/deployment.
- Immutable Doable/reference changes.

## Acceptance criteria

1. Only registry-approved or explicitly Clara-owned actions can execute.
2. Action inputs are validated before execution.
3. Execution authorization is tenant/user/agent scoped and fail closed.
4. Outbound integration HTTP is protected by the host egress/SSRF boundary and does not follow redirects implicitly.
5. Provider/runtime failures return stable `errorCode` and `retryable` metadata without exposing credentials.
6. Traces, logs, and returned errors remain redacted.
7. Focused regression coverage protects the above contracts.
8. No I-4/I-5/MCP/production scope is introduced.

## Current implementation

- Deterministic `IntegrationErrorCode` normalization: `77e7c31`, corrected by `e1477cb`.
- Focused normalization regression: `48c364d`, extended by `bf58cdd`.
- `RunActionResult` exposes optional `errorCode` and `retryable`: `ab31558`.
- Runner catch boundary propagates normalized metadata: `e01a6f4`.

External CI/Vercel/Gate-C/Gate-D execution is deliberately deferred under owner control and is not acceptance evidence for this implementation track.
