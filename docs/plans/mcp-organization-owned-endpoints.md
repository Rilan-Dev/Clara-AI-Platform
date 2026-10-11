# MCP Organization-Owned Endpoints — Architecture & Implementation Record

**Status:** Reconciled 2026-10-12 — PR #291 implementation merged onto the evolved `feature/ai-core-from-doable-source` target (catalog + OAuth + hardened runtime + org-owned model coexisting).
**Runtime execution:** Gated behind the existing `ENABLE_MCP` feature flag — OFF by default until controlled live verification.

---

# Part I — Architecture requirements (target branch, 2026-10-11)

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

---

# Part II — Implementation record (PR #291, 2026-10-12; reconciliation corrections inline)

# MCP Organization-Owned Endpoints — Implementation Plan & Record

**Status:** Implemented at source level (2026-10-12). Branch `feature/ai-core-from-doable-source`.
**Runtime execution:** Gated behind the existing `ENABLE_MCP` feature flag — OFF by default until controlled live verification.

## 1. Ownership model

| Concern | Owner | Storage |
|---|---|---|
| Custom MCP connections, endpoints, encrypted credentials, discovered tools, approvals, agent grants | Organization | `org_mcp_connections`, `org_mcp_tools`, `org_mcp_agent_grants` |
| Plan MCP entitlements, subscription rules | Platform admin | `subscription_plans.mcp_entitlements`, `subscription_plan_versions.mcp_entitlements` |
| Global security policy, enablement, emergency switch, catalog/hosted switches | Platform admin | `mcp_platform_settings` (singleton) |
| Organization-specific limit overrides | Platform admin | `org_mcp_overrides` |
| Usage metering | System | `mcp_tool_usage_log` |
| Audit | System | `org_mcp_audit_log`, `mcp_platform_audit_log` |

Organization-owned connections never require a platform catalog record. The
optional platform catalog and Clara-hosted services are independent switches
in `mcp_platform_settings` and do not gate org-owned connections.

## 2. Authoritative entitlement resolution

`src/modules/mcp/entitlements.ts` — one server-side resolver:

```
effective = global policy ∩ plan entitlements ∩ valid subscription state ∩ permitted org overrides
```

- Global: `mcp_enabled` false → `GLOBAL_DISABLED`; `emergency_disabled` true → `EMERGENCY_DISABLED` (overrides everything).
- Subscription: mirrors `plan-guard` semantics — `active`/`trialing` with unexpired period keep plan entitlements; anything else (past_due, cancelled, expired period, no row) resolves the **free plan's** entitlements (fail closed when free excludes MCP).
- Plan: validated JSONB; invalid stored data fails closed to disabled.
- Overrides: numeric limits + `platformCatalog` only, require a reason, optionally expire, clamped to system safety maxima; capability switches (`enabled`, `customEndpoints`) are not overridable (schema strips them).

Numeric semantics (centralized): `-1` = unlimited, `0` = disabled/denied, other negatives invalid, hard system maxima apply above any plan/override value. `usagePolicy: meter` requires a finite per-period quota.

## 3. Backend enforcement points

| Operation | Enforcement |
|---|---|
| Overview / listing | Entitlement resolution (denial reported, never faked as empty) |
| Create connection | available + customEndpoints + auth method + transport + connection limit + **live handshake + discovery** + tool limit (all in one transaction under `pg_advisory_xact_lock('mcp:<orgId>')`) |
| Probe (wizard step 3) | Same checks, nothing persisted |
| Update / enable | available + customEndpoints + endpoint re-validated against SSRF policy |
| Disable / delete / revoke | Always allowed for unwinding (no entitlement dependency) |
| Test connection | available + org scope; persists health (`last_checked_at`, `last_error`, status) |
| Rediscover tools | available + per-connection tool limit; new tools never auto-approved; missing tools → `stale` |
| Approve / revoke tool | available + approved-count limit; revocation cascades to agent grants |
| Agent grants | available + tool approved + connection active + org assignment limit (under org lock) |
| Advertisement (chat/realtime) | active connection ∧ approved tool ∧ enabled grant (SQL-enforced) |
| **Invocation** | Re-resolves entitlement, re-checks connection/tool/grant, quota + rate-limit admission under the org lock, then the real MCP call; both outcomes metered |
| Emergency disablement | Read at every resolution → blocks all of the above immediately |

Client-supplied plan/entitlement/quota values are never trusted. A revoked
grant/approval/connection fails the next invocation (no stale advertisement
remains executable).

## 4. MCP client (Streamable HTTP)

`src/modules/mcp/client.ts` — JSON-RPC 2.0 over HTTPS Streamable HTTP:

- `initialize` handshake (protocol `2025-06-18` + accepted fallbacks), `notifications/initialized`, session id capture.
- `tools/list` with bounded pagination (≤50 pages, ≤500 tools).
- `tools/call` returning content + structuredContent, honoring `isError`.
- Auth methods actually implemented: `none`, `bearer_token`, `basic_auth`, `api_key_header` (custom header, sanitized name).
- Security: HTTPS enforcement per policy, SSRF egress validation on every target **including each redirect hop**, bounded redirects (default 0), bounded timeouts, TLS verification always on. 401/403 → typed `AUTH_REJECTED`; 5xx → retryable `TRANSPORT_ERROR`.
- Credentials encrypted with pgcrypto (`ENCRYPTION_KEY`), decrypted only in-process for outbound calls, never returned in API responses, logs, or audit details.

## 5. Screens

| Screen | Route | Contents |
|---|---|---|
| Org → Integrations | `/orgs/:id/integrations` | Entitlement overview (real counters vs limits), connection cards with search/status-filter/sort, health + last-checked, test/open/enable/disable/delete actions, loading/empty/error/denied states; collapsed "Platform integrations" section preserves the catalog connect flow (enable/connect/disconnect + OAuth callback banner) without exposing platform-admin state |
| Add MCP server | `/orgs/:id/integrations/mcp/new` | 5-step wizard: basics → authentication → live validation (handshake+discovery) → tool approval (bounded by plan limit) → review & save → navigate to detail |
| Connection detail | `/orgs/:id/integrations/mcp/:connectionId` | Tabs: Overview (server info/health/usage) · Tools (approve/revoke/rediscover, stale handling) · Agent access (per-agent grant switches) · Activity (scoped audit) · Settings (edit config, credential rotation with live verification, danger-zone delete) |
| Agent → MCP tools | `/orgs/:id/agents/:agentId/mcp` | Org-approved tools grouped by connection with grant/revoke switches and unavailability reasons |
| Org → Billing | `/orgs/:id/billing` | MCP usage & entitlement card: availability, connection/assignment/call quotas with real usage, rate limit, usage policy, period anchor, denial reason + upgrade CTA |
| Platform → Subscriptions → Plans | `/subscriptions` (Plans tab) | MCP configuration section in the plan editor: feature switch, capability switches, numeric limits with helper text + validation errors surfaced from the central schema, auth-method matrix (implemented only), transports (Streamable HTTP only), usage policy, notes, capability summary; `DISABLE-PLAN-MCP` typed confirmation for disabling |
| Platform → Subscriptions → drawer | (Billing history → MCP tab) | Per-org effective entitlements with sources (plan vs override), real usage, override apply/remove (reason + expiry) |
| Platform → Settings → MCP governance | `/settings/mcp` | Global enablement, emergency disablement (typed confirmations), security policy (HTTPS, private-network blocking, redirects, timeout; TLS locked on), platform catalog + Clara-hosted switches |

## 6. Runtime integration

- `mcp_availability` / `mcp_tool` registered on the Unified Tool Runtime (`buildClaraToolRuntime`) — same authorization adapter, metering and typed error taxonomy as `integration_*` tools.
- Chat (`assistant/api/chat.ts`) advertises them to the provider only when `ENABLE_MCP` is on.
- Realtime voice (`assistant/api/realtime.ts` + `realtime-tool.ts`) uses the same allowlist and execution path — chat and voice share one authorization policy.
- Advertisement is discovery-only; every invocation re-authorizes inside `invokeAdvertisedTool` (entitlement ∨ connection ∨ approval ∨ grant ∨ quota ∨ rate limit) and meters both success and failure.

## 7. Entitlement change behavior

- Disabling MCP (plan or global) blocks new operations and execution immediately; data is preserved.
- Lowering limits never deletes connections/tools/grants — additions and affected execution are blocked until compliance is restored.
- Revoking a tool approval cascades to agent grants; revoked grants fail the next invocation.
- Re-enabling does not re-grant revoked permissions.
- Overrides expire and revert to plan defaults automatically.
- Usage counters derive from committed meter rows only — correct under concurrency because admission runs under the org advisory lock.

## 8. Testing

91 focused tests, all passing (`npx vitest run src/modules/mcp src/app/api/orgs/[orgId]/mcp src/app/api/platform/mcp-settings src/modules/ai-platform-core/integrations/org-mcp-tools.test.ts`):

- **Plan configuration:** valid/invalid/negative/contradictory limits, safety maxima, unsupported auth/transports, seed data, fail-closed parsing, override schema strip-behaviour.
- **Subscription resolution:** active/trialing/past_due/cancelled/expired/missing, global + emergency denials, invalid stored data, override application/expiry/clamping.
- **Metering:** deny vs meter policies, unlimited sentinels, rate-limit precedence, transactional admission under the org lock.
- **MCP client:** handshake (JSON + SSE), protocol negotiation/rejection, discovery pagination + ceiling, invocation results/isError, auth headers, HTTPS + egress blocking, redirect refusal, 401/5xx typing.
- **APIs:** entitlement denial codes, connection/tool/limit enforcement, live handshake before persistence, audit writes, overview projection, 503 fail-closed resolution.
- **Runtime:** advertisement SQL boundary, revoked grant/connection/approval denials, feature-flag fail-closed, chat/realtime policy parity.
- **Governance:** typed confirmations, audit diff, TLS always on, schema rejection of invalid policy values.

Full suite: `npx vitest run` → 1334 passed / 50 failed; the 50 failures are the pre-existing branch baseline (verified identical before/after via stash diff). Typecheck: all new/changed files clean; remaining repo errors are pre-existing (missing optional deps).

## 9. Verification limits (honest record)

- No live external MCP endpoint was contacted from this environment; handshake/discovery/invocation paths are tested against mocked transports per the MCP Streamable HTTP spec shape.
- `ENABLE_MCP` remains **off**. Enabling requires: (1) deploy this branch + apply migration `069`; (2) configure `mcp_platform_settings` (global enablement) and plan entitlements in the admin UI; (3) a controlled live handshake against a known-good HTTPS MCP server; (4) the focused security/runtime suites green on the deployed revision.
- No CI/Vercel/deployment/live-database migration was run or awaited from this environment.

---

# Part III — Reconciliation record (2026-10-12)

The PR head branch was reconciled with the latest target; these corrections
supersede stale details in Part II:

1. **Migration number:** the org-owned migration is `073_mcp_organization_owned_endpoints.sql` (renumbered from the PR's 069 — the target already ships 069–072 for the platform-catalog model and the migration runner hard-fails duplicate numbers). RLS and anon/authenticated role revokes were added to match the target's catalog conventions.
2. **Two table families, one product:** the platform catalog keeps `platform_mcp_servers` / `platform_mcp_tools` / `organisation_mcp_connections` / `organisation_mcp_tool_grants` / `agent_mcp_tool_grants` (069/070/072); organization-owned connections use `org_mcp_connections` / `org_mcp_tools` / `org_mcp_agent_grants` (073). Both flows work; org-owned connections never require catalog rows.
3. **Runtime:** the PR's globally registered `mcp_availability`/`mcp_tool` meta-tools were REMOVED in favour of the target's request-scoped architecture. Org-owned tools are advertised as real provider tools through `buildMcpToolRuntime` with the `OrgMcpToolResolver` adapter (`src/modules/mcp/runtime-resolver.ts`) and a composite resolver that routes platform-catalog vs org-owned server ids. Chat, realtime and the realtime tool endpoint share the same authorization, quota and metering path.
4. **Routes:** `/settings/mcp` renders the target's MCP Servers (catalog registry) screen; governance lives at `/settings/mcp/governance`. The org-level Integrations hub is restored at `/orgs/:id/integrations`; the agent MCP screen shows both the platform-catalog section and the organisation-owned section.
5. **Entitlement gating boundary:** the catalog's `allowed_plans` continues to gate platform-catalog servers; the authoritative `resolveEffectiveMcpEntitlements` resolver gates everything org-owned. Both respect the global `mcp_platform_settings` emergency switch.
6. **Verification:** focused suites re-run on the reconciled tree (see the 2026-10-12 session record); live migration/deployment/handshake verification remains pending. `ENABLE_MCP` stays OFF.
