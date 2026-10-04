# Next Capability Planning — Clara Integrations Framework

Date: 2026-10-05
Owner: ChatGPT
Baseline: 149e77bcef4122ce8d95fe043a7d8dc4757ec335
Status: PLANNING ONLY — implementation not authorized

## 1. Objective

Design the next reusable Clara platform capability after the closed Phase 7 foundation: a host-neutral Integrations Framework that can expose third-party integrations as tenant-scoped actions/tools without leaking host identity, secrets, storage, OAuth, or deployment assumptions into the reusable core.

The existing project-control capability order places Integrations Framework immediately after the Unified Tool Runtime and before MCP framework / full agent runtime. This planning package preserves that order.

## 2. Evidence baseline

Phase 7 is closed:
- 7-A host contracts/adapter foundation — PASS/CLOSED.
- 7-B Unified Tool Runtime — PASS/CLOSED under D-023.
- 7-C bounded provider tool-calling + agentic-loop pilot — PASS/CLOSED under D-028.
- I-014 immutable mcp-server extraction gap — RESOLVED under D-029.
- I-015 dependency/lockfile condition — RESOLVED.

The Doable reference contains an integration contract at `docs/doable-source/contracts/integrations.ts` and the immutable integration implementation family under `docs/doable-source/doable-source/services/api/src/integrations/**`.

The reference contract establishes these reusable concepts:
- IntegrationDescriptor
- IntegrationConnection
- IntegrationAdapter
- list/getConnection/connect/disconnect/listTools/invoke

The reference implementation additionally contains:
- integration definitions and category/auth metadata;
- OAuth2 configuration and callback/state handling;
- encrypted credential vault and OAuth-app storage;
- workspace/project/user connection precedence;
- Activepieces-backed action registry and runner;
- action-name normalization;
- tool bridging from integration actions into an AI tool surface;
- usage/xray/HTTP tracing;
- custom integration actions.

## 3. Proposed architecture

The active Clara implementation must NOT copy the Doable integration runtime wholesale.

Create a host-neutral seam under a new bounded module (proposed: `src/modules/ai-platform-core/integrations/**` or a separately ratified `src/modules/integrations-core/**`) with explicit ports:

1. Integration catalog adapter
   - lists immutable/provider-neutral descriptors;
   - no direct DB access.

2. Connection-store adapter
   - resolves tenant/workspace/project/user scoped connections;
   - owns persistence and transaction semantics.

3. Credential-vault adapter
   - encrypt/decrypt or envelope-decrypts credentials;
   - raw credential values never enter model prompts, tool schemas, logs, or generic runtime events.

4. OAuth adapter
   - creates authorization URLs;
   - validates callback state;
   - exchanges/refreshes tokens;
   - provider client secrets remain host-owned.

5. Action-runner adapter
   - resolves an integration action;
   - executes it under the caller's ExecutionContext;
   - enforces egress/SSRF policy at the host boundary.

6. Tool-bridge adapter
   - converts allowed connected integration actions into Unified Tool Runtime ToolDefinitions;
   - tool invocation must flow through the Phase 7 runtime, never a parallel executor.

7. Observability adapter
   - emits structured operational telemetry without inventing a new billable-metering spine;
   - D-023 remains binding until a separately authorized billing design exists.

## 4. Security and tenancy boundaries

Mandatory:
- reuse the Phase 7 provenance-verified PlatformExecutionContext;
- workspace/org/user/project scope must be explicit and fail closed;
- credentials are capability inputs to the host adapter, never ambient globals;
- OAuth state must be authenticated/integrity-protected and tenant-bound;
- connection lookup must enforce scope precedence and tenant isolation;
- tool exposure must be allowlisted per integration/action/surface;
- action arguments require schema validation before execution;
- no raw access tokens/client secrets in logs, traces, tool results, prompts, or model-visible metadata;
- outbound HTTP requires an explicit host-owned egress/SSRF policy;
- integration tool calls must use Unified Tool Runtime `invoke()`;
- no `query_events`/new `TOOL` usage kind changes under this phase;
- no provider-native KB or secret-store bypass.

## 5. Persistence / Gate E

Unlike Phase 7, a production connection/OAuth implementation almost certainly requires persistence.

Therefore the implementation plan must split:
- **A — host-neutral contracts:** no schema or migration;
- **B — host binding design:** exact existing Clara tables/columns/tenant keys verified first;
- **C — persistence implementation:** only after an explicit Gate-E authorization, migration plan, RLS/tenant-scope evidence, rollback, and backup/restore considerations;
- **D — runtime integration pilot:** only after persistence/security gates pass.

Do not import or copy Doable migrations merely because the reference contains them.

## 6. Proposed ordered sub-phases

### I-1 — Contracts and threat model
Deliver:
- host-neutral integration contracts;
- connection/auth/action/tool-bridge types;
- explicit trust-boundary diagram;
- credential/egress policy;
- negative security tests;
- no DB changes.

### I-2 — Clara adapters and catalog
Deliver:
- Clara catalog adapter;
- connection-store port implementation against existing schema only if verified;
- credential-vault port;
- OAuth port;
- authorization/entitlement integration;
- no broad integration catalog rollout yet.

### I-3 — Action runner
Deliver:
- one bounded integration execution path;
- strict schema validation;
- host egress/SSRF controls;
- deterministic error normalization;
- tracing/redaction;
- tenant-isolation tests.

### I-4 — Unified Tool Runtime bridge
Deliver:
- connected integration actions represented as ToolDefinitions;
- invocation exclusively through the Phase 7 Unified Tool Runtime;
- default-off pilot;
- no duplicate executor.

### I-5 — First-provider pilot
Candidate should be selected only after adapter/security review. Prefer one low-risk integration with a stable OAuth or API-key contract rather than the entire Activepieces catalog.
Deliver:
- one end-to-end connect/list/invoke/disconnect flow;
- regression coverage;
- explicit rollback and disable flag.

## 7. Explicit non-goals

This planning package does not authorize:
- all Activepieces pieces/catalog import;
- MCP runtime;
- autonomous agent runtime;
- memory/skills;
- agent UI;
- marketplace;
- broad OAuth-provider rollout;
- new billing architecture;
- new `usage_events` kinds;
- database migrations;
- deployment/promotion;
- direct modification of immutable Doable/reference files.

## 8. Verification gates

Gate A — scope/authorization.
Gate B — implementation contracts and adapters.
Gate C — unit/integration/regression tests plus focused typecheck/lint.
Gate D — architect code/security review.
Gate E — REQUIRED if any persistence/schema/migration surface is changed.
Gate F — only if deployment is performed or required.
Additional mandatory evidence:
- immutable/reference integrity unchanged;
- no runtime imports from `docs/doable-source/**`;
- secret-pattern scan;
- credential redaction tests;
- tenant cross-scope denial tests;
- OAuth state tamper/replay/expiry tests;
- egress/SSRF deny tests;
- tool-bridge parity with Unified Tool Runtime;
- no D-023 billing semantics change.

## 9. Acceptance criteria

A future implementation may close only when:
1. the host-neutral integration contract is independently usable;
2. all credential access is behind explicit adapters;
3. tenant/workspace/project/user scope is fail-closed;
4. OAuth state is integrity-protected and scope-bound;
5. no raw secrets reach model-visible or telemetry surfaces;
6. action input is validated before execution;
7. outbound network policy is enforced;
8. integration actions invoke only through the Unified Tool Runtime;
9. one bounded provider is proven end-to-end;
10. existing chat/realtime/RAG/tool behavior remains regression-free;
11. Gate E evidence is complete if persistence changes;
12. global baseline failures are not hidden or “fixed” by mutating immutable reference material.

## 10. Stopping boundary

This document is a planning package only. The next action is architect review of this package and an explicit bounded implementation authorization. Until then, Phase 7 remains CLOSED and no integration runtime code is started.
