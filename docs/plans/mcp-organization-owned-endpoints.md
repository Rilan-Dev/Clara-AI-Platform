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
