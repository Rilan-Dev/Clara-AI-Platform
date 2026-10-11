# MCP Capability Audit and Product Roadmap

Date: 2026-10-10
Owner/implementer: DEV-01 / Forge
Branch: `feature/ai-core-from-doable-source`
Status: source audit and plan; no runtime PASS claimed.

## Executive finding

Clara has a meaningful MCP *tool bridge* in `src/modules/ai-platform-core/mcp-tool-bridge.ts`, with regression source in `mcp-tool-bridge.test.ts`. It adapts host-resolved MCP descriptors into Clara `ToolDefinition` objects and routes execution through the existing Unified Tool Runtime. It is deliberately not an MCP transport/client or persistent server-configuration system. The Doable extraction is present under `docs/doable-source/**` as reference material, but it is not evidence that those MCP server/client/runtime capabilities are active in Clara's production code.

## Completed at source level

- I-6 MCP bridge: descriptor resolution, deterministic Clara tool names, input-schema validation, surface allowlists, exact (serverId, toolName) pair allowlists, default-off `ENABLE_MCP`, immutable policy/context/descriptor snapshots, fail-closed handling of malformed policy/resolver/schema, and invocation via the Unified Tool Runtime.
- Regression source covers naming collisions/length, malformed policy/resolver/schema/surface handling, default-off behavior, exact server/tool pair matching, identity mutation, frozen resolver request, policy mutation during async discovery, and unavailable resolver behavior.
- Existing integration action bridge and `integration-action-tool.ts` use the shared integration capability policy for platform enablement, plan entitlement, org grant, agent grant, caller identity and caller-usable connection readiness.
- Existing chat/runtime integration tool path exposes availability/action through the unified tool system; `src/modules/ai-platform-core/integration-tool-bridge.ts` discovers tenant-contextual connected integration actions and registers them into an isolated runtime.
- Realtime integration dispatch source exists at `src/modules/assistant/api/realtime-tool.ts` and `src/app/api/realtime/tool/route.ts`; it rejects platform-admin calls, requires authenticated KB membership and derives org/agent/user/session context server-side before invoking the shared runtime. Realtime integration descriptors are gated by existing flags.
- Admin surfaces already exist for platform integrations (`src/features/admin/screens/platform-integrations-screen.tsx`), organisation integrations (`org-integrations-screen.tsx`), and agent integrations/tools (`agent-integrations-screen.tsx`, `agent-workspace/tools-screen.tsx`). These are integration-action surfaces, not proof of MCP server configuration.
- The repo contains Doable MCP reference code and manifests under `docs/doable-source/**`; these must be treated as reference/dependency evidence only, not active Clara implementation.

## Not yet completed / not established

- No confirmed first-class persisted MCP server registry/configuration CRUD for transport endpoint/transport kind, server identity, encrypted auth, lifecycle status, health, or per-org ownership was found in the active `src/**` MCP bridge path.
- No proven UI workflow for platform admins to register/disable/allow MCP servers and approved tool pairs.
- No proven organisation workflow to connect an approved server, configure tenant credentials securely, inspect tool discovery/health, and grant/revoke access to agents.
- No proven end-to-end wiring from a configured MCP server registry/transport client to `McpToolResolver`; the bridge expects a host-provided resolver and policy.
- No proof that the MCP-specific bridge is registered into the actual chat and realtime runtimes; generic integration action availability is not equivalent to MCP server tools.
- No source-level evidence of per-server transport implementation (Streamable HTTP/SSE/stdio), connection lifecycle, timeout/cancellation, SSRF protections, tool-list refresh/cache invalidation, credential rotation, or safe audit trail for MCP calls.
- No executable test, typecheck, build, Docker, CI/Vercel, or live MCP server connection was run for this audit. No runtime/production PASS is claimed.

## Product and authorization design

### Platform admin
Place **MCP Servers** under the existing platform/admin integrations area, not a new sidebar. Admins register server metadata/transport, approve supported auth modes, enable/disable the server, review discovered tool names/schemas, maintain an exact server/tool allowlist, and set plan availability. Never show plaintext credentials after save. Health and error views must redact headers, tokens, URLs containing secrets, and provider bodies.

### Organisation admin
Within the existing organisation Integrations screen, show platform-approved MCP servers only. An org admin can connect using encrypted org-owned credentials or OAuth where supported, run a safe connection test, inspect tool descriptions/schemas, grant/revoke server and individual tool access to specific agents, and disconnect/rotate credentials. Org A must never see or invoke Org B's configuration, credentials, discovery cache, health or audit records.

### Agent builder and usage
In the existing agent workspace **Tools/Integrations** area, show eligible MCP tools and their source server. Require explicit agent-level enablement and clearly distinguish platform approval, org connection, and agent grant. Chat and realtime voice must discover only currently authorized tools for the authenticated org/agent/user/session. Every invocation must re-check server enabled state, plan, org grant, agent grant, connection readiness, exact tool pair, schema, surface policy and caller identity at execution time. Do not trust model/client-supplied tenant, agent, user, credential or authorization fields. Embed is excluded until separately approved and threat-modeled.

### Execution and safety
Keep the Unified Tool Runtime as the only executor. Implement transport/resolver as a host adapter behind a narrow interface; no second executor. Start with one explicitly supported transport and fail closed for unsupported modes. Add SSRF controls (block loopback/private/link-local/metadata addresses, re-resolve and validate redirects/DNS as appropriate), TLS verification, bounded response size/time, cancellation, no redirects by default, rate limits, and redacted audit records. Treat server tool descriptions and outputs as untrusted data, not instructions.

## Ordered implementation plan

1. **MCP configuration contract and migration:** inspect existing migrations/persistence conventions; define platform server registry, encrypted auth/connection records, org connection state, tool discovery snapshot, server/tool policy and agent grants. Add tenant-safe constraints/indexes and appropriate RLS/service-only access.
2. **Platform admin API/UI:** create/list/update/disable/test server; exact tool-pair approval and plan policy; secret write-only handling; safe health/errors.
3. **Organisation API/UI:** list approved servers; connect/disconnect/rotate/test; safe discovery view; org-owned credential isolation and agent grants.
4. **Resolver/transport adapter:** implement the first supported transport, secure URL validation, timeouts/limits, discovery schema validation and invalidation; adapt resolved tools into `mcp-tool-bridge.ts`.
5. **Chat runtime registration:** make MCP tools available only in authorized chat contexts and ensure discovery/invocation use current policy snapshots and current grant checks.
6. **Realtime voice registration:** advertise only the same caller-usable MCP tools; dispatch each call through authenticated same-origin server route and the same Unified Tool Runtime; maintain a clear tool-call/result correlation and timeout path.
7. **Regression source:** cross-org isolation; platform disable; plan denial; missing/revoked org and agent grants; private vs shared user connections; credential redaction; SSRF/redirect rejection; malformed schema; exact server/tool-pair; schema drift; timeout/cancellation; stale discovery; chat/realtime parity; voice session expiry; repeated invocation/idempotency for side effects.
8. **User guide and runbook:** document platform setup, org setup, agent enablement, chat/voice use, credential rotation, troubleshooting, audit visibility and rollout flags.

## Verification boundary

This document records repository source inspection only. The branch's project-control records previously state regression sources are authored but not executed. Continue implementation without polling CI/Vercel; route substantial correctness/security defects to FIX-01 and deployment/infrastructure-only work to OPS-01. Do not claim live MCP connectivity until ordinary runtime evidence exists.
