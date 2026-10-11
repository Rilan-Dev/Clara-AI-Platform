# Organization-Owned External MCP Connections

Status: ARCHITECTURE CORRECTION REQUIRED — source implementation not yet complete
Date: 2026-10-11
Owner: Clara platform architecture

## Decision

Organization-owned external MCP endpoints are a first-class product capability. Platform administration must not be a prerequisite for an organization to register its own n8n, Graphify, Camofox, or other compatible external MCP server.

The platform MCP catalog remains optional and separate. Platform administrators may publish approved templates or operate explicitly shared Clara services, but these are not the same thing as customer-owned endpoint registrations or credentials.

## Evidence from current source

The existing organization API at `src/app/api/orgs/[orgId]/mcp-servers/route.ts` requires a `serverId` and loads it from `platform_mcp_servers`. Tool discovery/grants are tied to `platform_mcp_tools`, and the runtime resolver in `src/modules/ai-platform-core/mcp-streamable-http-resolver.ts` joins the same platform registry and requires `platform_enabled=true`. This supports organization credentials for a platform-registered server; it does not currently establish a complete self-service arbitrary organization-owned MCP endpoint lifecycle.

Additional ownership coupling in the organization API:
- Server availability and plan eligibility are controlled by the platform registry's `platform_enabled` and `allowed_plans` fields.
- OAuth connections are platform-managed.
- Bearer-token fallback can use a platform credential.
- Tool grants require platform-approved tool records.

These behaviors may be valid for an optional catalog, but must not be required for customer-owned MCP endpoints.

## Target ownership boundaries

### Platform control plane
- Publish/retire optional MCP catalog entries and templates.
- Define plan entitlements and hard security policy.
- Optionally operate separately metered Clara-hosted MCP services.
- No routine ownership of customer endpoint URLs, credentials, or private tool grants.

### Organization control plane
- Create, edit, test, disable, reconnect, and delete its own endpoint registrations.
- Own endpoint URL, transport/auth configuration, credential/OAuth grants, discovered tool metadata, tool allowlist, and agent grants.
- See only its own records and sanitized execution/connection health.
- Select whether an organization connection can be assigned to its agents.

### Shared execution enforcement
Every discovery and invocation must re-check authenticated user/agent, tenant ownership, plan entitlement, connection state, organization grant, agent grant, tool-level policy, and execution quota. UI hiding is not authorization.

## Subscription policy

Starter and Pro both support compatible bring-your-own MCP endpoints when MCP is entitled by the plan. Plan differentiation is via entitlement and metered limits, not via platform-admin pre-registration.

Suggested entitlement dimensions (names are design placeholders; map to Clara's existing plan schema rather than creating duplicate truth):
- `mcp_enabled`
- `mcp_max_connections`
- `mcp_max_tools_per_connection`
- `mcp_max_agent_assignments`
- `mcp_tool_calls_per_period`
- `mcp_rate_limit_per_minute`
- `mcp_custom_endpoints_enabled`
- optional `mcp_private_network_enabled` / hosted-service entitlements for plans that actually offer these capabilities

The numeric Starter/Pro limits must be chosen from cost and usage measurements and stored in the authoritative plan system. Do not hardcode plan names in runtime routes or use the catalog's `allowed_plans` as the sole subscription entitlement source for customer-owned endpoints.

Fundamental security (tenant isolation, secret encryption, authorization, endpoint validation, bounded timeouts/responses, safe DNS/IP handling, and audit logging) applies to every plan.

## External MCP connection flow

1. Organization admin selects Add MCP Server.
2. Enter a display name, HTTPS Streamable HTTP endpoint, and supported auth method; where supported, use per-organization OAuth rather than platform OAuth.
3. Server validates URL syntax and safe egress policy; credentials are stored encrypted and never returned to clients/logs.
4. Run a real initialize + tools/list handshake; status is `configured`, `connected`, or `error` based on actual outcomes.
5. Organization reviews discovered tools and explicitly enables allowed tools.
6. Organization assigns individual tools to agents and execution surfaces.
7. Runtime performs fresh tenant, entitlement, grant, and connection checks before invocation.

MCP products that expose only stdio or are reachable only on a customer LAN need an explicitly supported customer-side gateway/private networking design; never treat customer `localhost` as reachable from Clara's cloud runtime.

## Security requirements

- SSRF-resistant endpoint validation on creation and every outbound connection: reject private, loopback, link-local, multicast, reserved and cloud metadata IPs; re-resolve and pin the checked address; verify TLS; refuse redirects by default.
- DNS rebinding protection and IPv4/IPv6 validation.
- Strict connection timeout, cancellation, response-size, tool-count, page-count, schema-depth and output-size limits.
- Per-organization encrypted credentials and OAuth state/token isolation; no cross-tenant or platform credential fallback for customer-owned connections.
- Tool names are scoped to a stable connection ID; grants cannot collide across tenants.
- Disable/revoke must block execution immediately and revoke agent grants.
- Rate-limit and meter invocations server-side. Define whether failed calls count before billing.
- Treat remote tool descriptions and outputs as untrusted data, never as policy/instructions.
- Audit connection changes, credential rotations, grants, denied calls, and invocation outcomes without logging secrets or sensitive payloads.

## Implementation sequence

1. Extend plan entitlements through the existing plan/subscription source of truth; define default behavior for legacy plans and expired/downgraded subscriptions.
2. Add an additive migration for organization-owned MCP connections, discovered tool metadata, organization grants, and agent grants. Keep the platform catalog tables separate; do not overload `platform_mcp_servers`.
3. Add organization-scoped CRUD/test/discovery/credential-rotation endpoints with tenant RBAC and quota enforcement.
4. Extend the resolver to authorize and resolve both organization-owned endpoints and optional catalog endpoints through explicit ownership-specific paths. Do not use a caller-supplied URL at invocation time; only resolve a persisted organization-owned connection ID.
5. Update organization Integrations and Agent Integrations UI for create/edit/test/discover/enable/assign/disconnect/delete. Keep the platform screen for catalog and hosted services only.
6. Add regression tests for tenant isolation, quotas, subscription transitions, credential redaction/rotation, revoked grants, SSRF/DNS rebinding, redirects, timeouts, malformed schemas, and Chat/realtime execution.
7. Keep `ENABLE_MCP=false` and production catalog entries disabled until executable tests and a controlled live handshake pass. Source review alone is not runtime PASS.

## Acceptance criteria

- Organization admin can register a compatible external endpoint without a platform admin first creating a registry row.
- Organization A cannot read, update, discover, grant, or invoke Organization B's connections or tools.
- Platform admin can manage catalog metadata without receiving routine access to organization credentials.
- Starter/Pro differences are enforced server-side by entitlement values, quotas and policy—not by whether a server was added to a platform allowlist.
- Credentials are encrypted, write-only, rotatable and absent from responses/logs.
- Disabling or revoking a connection immediately denies new discovery/invocation.
- Chat and realtime use the same runtime authorization policy.
- Each route, migration, resolver and UI change has focused regression coverage; verification status is recorded accurately.
