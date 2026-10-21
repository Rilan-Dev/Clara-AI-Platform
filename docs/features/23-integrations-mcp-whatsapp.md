# 23 — Integrations, MCP & WhatsApp

> Clara AI Platform feature documentation · Domain: `integrations` (36 files) + `mcp` (7 files) + WhatsApp routes · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The integrations plane connects Clara agents to the outside world: org-owned and platform-owned MCP (Model Context Protocol) servers whose tools agents can call mid-conversation, OAuth-based integrations (per-provider apps, callback flow, credential vault), WhatsApp Business messaging (webhooks, connection health, daily briefings), and agent-level integration/messaging bindings. Its purpose is bounded tool-use: agents act on external systems only through governed, credentialled, metered connections — every tool call admitted, audited, and quota-checked.

## 2. Business Logic

- **MCP client** — `src/modules/mcp/client.ts`: protocol constant `MCP_PROTOCOL_VERSION:28` ("2025-06-18"), `McpClientError:37`, handshake `mcpHandshake:340`, tool discovery `mcpDiscoverTools:435`, invocation `mcpInvokeTool:480`, credential parsing `parseCredentials:523` + `MCP_AUTH_METHOD_FIELDS:566`; result/tool/handshake interfaces `:174-195`.
- **MCP service (org plane)** — `src/modules/mcp/service.ts`: `McpServiceError:36`, connection listing `listOrgMcpConnections:159`, detail `getOrgMcpConnectionDetail:172`, endpoint probing `probeOrgMcpEndpoint:302` (`McpValidationProbeResult:279`), create-connection input `:397` — behind `/api/orgs/[orgId]/mcp/**` (connections + activity/agents/credentials/test/tools subroutes) and `/api/orgs/[orgId]/mcp-servers`, `/api/orgs/[orgId]/mcp/overview`.
- **Runtime resolution** — `src/modules/mcp/runtime-resolver.ts`: `OrgMcpToolResolver:59` implements the tool resolver consumed by chat tool-calling; composite resolver `createCompositeMcpResolver:194`; org-owned capabilities `resolveOrgOwnedMcpCapabilities:232` (`OrgOwnedMcpCapabilityTool:212`, `OrgOwnedMcpCapabilities:218`); the I-4 bridge + integration-action-tool reuse the shared fail-closed policy (`src/modules/ai-platform-core/integrations/integration-policy.ts` — platform/org/agent/plan/connection checks extracted).
- **Metering & admission** — `src/modules/mcp/metering.ts`: `MeteredSurface:27` (chat/realtime/embed/api), `QuotaCheck:29`, `checkMcpQuotaAdmission:69`, `recordMcpUsage:119`, `getMcpUsageSummary:156`, org lock `acquireOrgMcpLock:207`, admission wrapper `withMcpAdmission:217`.
- **Audit** — `src/modules/mcp/audit.ts`: `recordOrgMcpAudit:50`, `recordPlatformMcpAudit:73`, listing `listOrgMcpAudit:105`, action types `:11/:25`.
- **OAuth flows** — `/api/orgs/[orgId]/integrations` (+ `[integrationId]/oauth/start`), `/api/integrations/oauth/callback`, platform apps `/api/platform/integrations/[integrationId]/oauth-app`, MCP server OAuth `/api/platform/mcp-servers/oauth/{start,callback,disconnect}` — state-table flows (`066_integration_oauth_states.sql`, `065_platform_integration_oauth_apps.sql`).
- **Agent bindings** — `/api/orgs/[orgId]/agents/[agentId]/integrations` + `/mcp-tools` + `/messaging/connection`; UI tabs `integrations/page.tsx`, `mcp/page.tsx`, `messaging/page.tsx`.
- **WhatsApp** — webhook `/api/webhooks/whatsapp`, OAuth callback `/api/whatsapp/oauth/callback`, health cron `/api/cron/whatsapp-connection-health:42`, briefings `/api/cron/whatsapp-daily-briefings`; lifecycle migrations `067_whatsapp_business_lifecycle.sql`, `068_whatsapp_connection_health.sql`.

## 3. Business Rules

- Tool execution is fail-closed: any missing identity/authorization/expired-connection precondition returns an unavailable action — never a partial or unauthorised call.
- Every MCP tool call passes quota admission (`withMcpAdmission`) and is metered + audited (org + platform audit rows).
- Credentials are encrypted at rest (`src/lib/secrets.ts` `ENCRYPTION_KEY:20`) and never echoed to clients; auth-method field maps are explicit (`MCP_AUTH_METHOD_FIELDS`).
- OAuth state rows are single-use and expiry-bound; callbacks without valid state are rejected.
- Org-owned MCP endpoints are validated by probe before activation (handshake + tool discovery).
- WhatsApp connection state machine (lifecycle migration) drives health cron alerts; message sends only from connected state.

## 4. Data Model

- `060_integrations_control_plane.sql`, `061_integrations_tenant_hardening.sql`, `062_integrations_data_api_hardening.sql`, `065_platform_integration_oauth_apps.sql`, `066_integration_oauth_states.sql`, `067_whatsapp_business_lifecycle.sql`, `068_whatsapp_connection_health.sql`, `069_mcp_server_control_plane.sql`, `070_mcp_connection_handshake_status.sql`, `071_platform_integration_credentials.sql`, `072_mcp_platform_credentials_oauth.sql`, `073_mcp_organization_owned_endpoints.sql`.

## 5. API Surface

- 25+ routes: `/api/orgs/[orgId]/mcp/**`, `/api/orgs/[orgId]/{integrations,mcp-servers}`, `/api/orgs/[orgId]/agents/[agentId]/{integrations,mcp-tools,messaging/connection}`, `/api/platform/{integrations,mcp-servers,mcp-settings}/**`, `/api/integrations/oauth/callback`, `/api/webhooks/whatsapp`, `/api/whatsapp/oauth/callback`, `/api/cron/whatsapp-*`.

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/mcp/client.ts` | handshake/discovery/invocation `:340-523` |
| `src/modules/mcp/service.ts` | org connection service `:36-397` |
| `src/modules/mcp/runtime-resolver.ts` | `OrgMcpToolResolver:59`, composite `:194`, org-owned capabilities `:232` |
| `src/modules/mcp/metering.ts` | admission + metering `:27-217` |
| `src/modules/mcp/audit.ts` | audit recording `:50-105` |
| `src/modules/ai-platform-core/integrations/integration-policy.ts` | shared fail-closed capability policy |

## 7. UI Reference

- `src/app/(admin)/orgs/[id]/integrations/page.tsx` (+ `mcp/new`, `mcp/[connectionId]`) — org integrations console.
- `src/app/(admin)/settings/mcp/page.tsx` + `settings/mcp/governance/page.tsx` — platform MCP administration.
- Agent tabs: `agents/[agentId]/{integrations,mcp,messaging}/page.tsx`.

## 8. Environment Variables

- Integration encryption key (`INTEGRATION_ENCRYPTION_KEY` → `lib/secrets.ts`), WhatsApp credentials, MCP platform settings DB rows.

## 9. Tests

- integration-policy regression sources (identity requirements, sanitization, expired status, error taxonomy), MCP client/service/metering suites (locate current test files in the module directories; the old generated inventory is not committed).

## 10. Cross-links

- Tool-calling execution — **08 chat** + **10 OpenAI tools**; metering spine — **20**; entitlements — **11/17**; credential hygiene — **24**; health cron — **21**.

## Environment-controlled availability (development and production)

Feature 23 is retained in source but **disabled by default in production**
and **enabled by default in development** via the server-side
`CLARA_FEATURE_INTEGRATIONS` switch (or explicit per-deployment `true`/
`false`). It never writes shared feature-state rows or changes another
deployment's DB schema, credentials or integration connections.

When off, the request boundary rejects integrations/MCP configuration APIs,
organisation/agent management pages, credential callbacks, WhatsApp
webhooks/OAuth and scheduled WhatsApp routes before handlers run. Sidebar
entries, agent tabs and platform settings cards are hidden. The unified
tool runtime does not advertise integration tools, direct integration actions
return a structured unavailable result, and already-built MCP/integration
invocations re-check the environment at execution time. Native chat/voice,
billing, core RAG and unrelated provider capabilities stay enabled.

This flag is **not** a substitute for MCP security rollout: development MCP
requires `ENABLE_MCP=true`, server connection readiness, per-plan policy
and runtime user/tenant authorisation. Re-enabling Feature 23 restores the
original feature code/configuration subject to those existing checks.
Operators should keep separate .env values, isolated queues and credentials
for production and development; see
[environment-scoping guidance](../deployment/environments.md).
