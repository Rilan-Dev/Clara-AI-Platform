# 29 — AI Platform Runtime & Console (Unified Tool Runtime, Agentic Loop, Adapters)

> Clara AI Platform feature documentation · Domain: `src/modules/ai-platform-core/` + `src/components/admin/ai-platform/` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The extracted, host-neutral AI runtime that binds Clara's tenant identity, providers, RAG, conversation context, chat streaming, tools and realtime voice behind ONE seam — the module this branch (`feature/ai-core-from-doable-source`) exists to build. It provides: a fail-closed execution context (provenance-based tenant scope), a frozen adapter registry (identity/provider/secrets/transport ports), the unified tool registry + runtime (registration, authorisation adapters, metering hooks), built-in Clara tools (`rag_search`), the bounded agentic loop (multi-step tool-calling turns), the provider tool-calling pilot (OpenAI-style function calls), MCP tool bridging/OAuth/HTTP transports, and the integration AI tools (availability + action execution). Its purpose is a governed, tenant-scoped, metered, fail-closed foundation for ANY future AI capability — nothing runs without an authorised context, and everything is measurable.

The admin console (`/ai-platform` workspace) exposes provider defaults, tool-calling and agent-loop toggles to platform admins behind env flags.

## 2. Business Logic

- **Host contracts** — `contracts.ts` defines the seam vocabulary: `TenantId:23`, `KnowledgeBaseId:26`, `UserId:28`, `AgentId:29`, `SessionId:30`, `CorrelationId:32` and the adapter ports (`IdentityTenantAdapter`, `ProviderAdapter`, `SecretsAdapter`, `TransportAdapter`).
- **Execution context** — `execution-context.ts:135` `createExecutionContext` derives a frozen, tenant-scoped `PlatformExecutionContext` from Clara's runtime identity; `assertTenantScope:231` and `assertExecutionContext:219` guard every sensitive path. Provenance-based validation: only contexts minted by the factory (tracked in a module-private WeakSet) are accepted — a structurally identical lookalike is rejected (`isValidPlatformExecutionContext:205`). `ExecutionContextError:20` is the controlled failure.
- **Adapter registry** — `adapter-registry.ts:130` `createPlatformAdapterRegistry`: explicit registration with up-front slot validation, deterministic exact-slot lookup, no implicit fallback, re-registration rejected, committed set AND each adapter object frozen at commit (`AdapterRegistrationError:33`, `UnknownAdapterError:52`, `AdaptersNotRegisteredError:65`).
- **Clara bindings** — `clara-adapters.ts:80` `buildClaraPlatformAdapters` binds the real identity/provider/secrets/transport ports; `getClaraPlatformRegistry:141` and `getClaraPlatformAdapter:151` are the app singletons. Secrets stay server-side (`PlatformSecretAccessError:42`).
- **Clara runtime seam** — `clara-runtime.ts:37` `claraRuntime`: the thin host binding connecting the bound path Identity/Tenant → Provider Resolver → Tool Registry seam → Clara RAG → Context/Conversation → Chat Provider → Realtime Voice Transport (module README `:8`).
- **Unified tool runtime** — `tool-registry.ts:349` `createToolRuntime` implements `ToolRuntime:304` with registration validation (`ToolRegistrationError:71`, `UnknownToolError:88`), invoke options (`ToolInvokeOptions:120`) carrying authorisation + metering hooks.
- **Clara tools** — `clara-tools.ts`: `buildRagSearchTool:126` (`RAG_SEARCH_TOOL_NAME:103`) grounds tool calls in Clara Qdrant; `buildClaraToolAuthorizationAdapter:180` enforces per-tool authorisation; `buildClaraToolMeteringHook:288` meters every invocation into the usage-event spine; `buildClaraToolRuntime:335` + `getClaraToolRuntime:362` + `invokeClaraTool:379` are the wired runtime; `planCapabilityForSurface:89` gates tool planning per surface.
- **Bounded agentic loop** — `agentic-loop.ts:60` `runBoundedAgenticLoop` executes multi-step tool-calling turns with `HARD_MAX_AGENT_ITERATIONS:21` = 8 (runaway protection); gated by `AGENT_LOOP_FLAG:20` = `ENABLE_AI_PLATFORM_AGENT_LOOP` (`isAgentLoopEnabled:39`); typed status/result (`AgenticLoopStatus:24`, `AgenticLoopResult:31`).
- **Provider tool-calling pilot** — `provider-tool-calling-pilot.ts`: `PROVIDER_TOOL_CALLING_FLAG:15` = `ENABLE_AI_PLATFORM_TOOL_CALLING`; `isProviderToolCallingEnabled:63`; `consumeProviderToolCall:71` adapts OpenAI-style tool calls into the unified runtime.
- **MCP bridge** — `mcp-tool-bridge.ts`: `MCP_TOOL_FLAG:24` (`ENABLE_MCP`), `isMcpEnabled:105`, `mcpToolName:113`, `buildMcpToolDefinition:236`, `resolveMcpToolDefinition:320`, `buildMcpToolRuntime:398`, `isMcpToolAllowlisted:484` (org allowlist admission).
- **MCP OAuth** — `mcp-oauth.ts`: full RFC-8414-style discovery + PKCE client (`probeMcpAuthRequirements:189`, `registerMcpOAuthClient:215`, `buildMcpAuthorizationUrl:268`, `exchangeMcpAuthorizationCode:348`, `refreshMcpTokenSet:372`, `credentialNeedsRefresh:460`); streamable HTTP resolver + transport in `mcp-streamable-http-resolver.ts` / `mcp-http-transport.ts`.
- **Integration AI tools** — `integration-ai-tools.ts:11` `buildIntegrationAvailabilityTool` (AI can list available integrations/actions safely); `integration-action-tool.ts:14` `buildIntegrationActionTool` (AI can execute authorised integration actions); both reuse the shared fail-closed policy in `integrations/integration-policy.ts` (Feature 23).
- **Admin console** — `src/app/(admin)/ai-platform/page.tsx` renders `AiPlatformWorkspace` (`src/components/admin/ai-platform/AiPlatformWorkspace.tsx`, 2,311 lines total incl. the 992-line `ProvidersWorkspace.tsx` provider-defaults console, `DefaultAssistantWorkspace.tsx`, `AIPlatformSection.tsx`), flag-gated on `ENABLE_AI_PLATFORM_TOOL_CALLING` / `ENABLE_AI_PLATFORM_AGENT_LOOP` (`flagEnabled` helper in the page).

## 3. Business Rules

- **Fail-closed everywhere**: missing tenant identity, unknown adapter/tool, unregistered slots, invalid contexts — all controlled failures, never ambient/global fallback (module README boundaries `:11-18`).
- **Provenance over structure**: execution contexts are accepted only from the factory's WeakSet — lookalikes rejected (anti-spoofing).
- **Immutability**: committed adapter sets and adapter objects are frozen at commit time — callers cannot mutate through original references.
- **Boundaries**: Clara stays authoritative for tenant/agent/KB identity; Qdrant stays the knowledge source; vendor credentials stay server-side; no vendor KB replaces Clara Qdrant; unsupported Doable infrastructure is never silently emulated (README `:11-18`).
- **Bounded autonomy**: the agentic loop is hard-capped at 8 iterations and flag-gated — no unbounded agent loops in production.
- **Metered everything**: every tool invocation passes the metering hook into the usage-event spine (Feature 20/24).
- **Flag-gated rollout**: tool-calling, agent-loop and MCP are opt-in via env flags — existing routes unchanged until explicitly enabled.
- **Policy reuse**: integration tools and the MCP bridge share one fail-closed capability policy (platform/org/agent/plan/connection checks — Feature 23).

## 4. Data Model

- MCP server/credential tables (migrations `069-073`, Feature 23); usage events for metering (Feature 20); no own tables otherwise — the runtime is a seam, not a store.

## 5. API Surface

| Route | Role |
|---|---|
| `src/app/(admin)/ai-platform/page.tsx` | admin console (flag-gated) |
| `/api/platform/ai/providers/**`, `/api/platform/ai/defaults/**` | provider registry + defaults powering the console (Feature 22) |
| `/api/agents/[agentId]/ai-options` / `ai-settings` | agent-level capability settings surfaced through the runtime config |
| chat tool-calling paths in Feature 08 | consume the runtime/loop when flags enabled |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/ai-platform-core/contracts.ts` | seam types (`TenantId:23` …) |
| `src/modules/ai-platform-core/execution-context.ts` | `createExecutionContext:135`, `assertTenantScope:231`, `assertExecutionContext:219` |
| `src/modules/ai-platform-core/adapter-registry.ts` | `createPlatformAdapterRegistry:130` |
| `src/modules/ai-platform-core/clara-adapters.ts` | `buildClaraPlatformAdapters:80`, `getClaraPlatformRegistry:141` |
| `src/modules/ai-platform-core/clara-runtime.ts` | `claraRuntime:37` |
| `src/modules/ai-platform-core/tool-registry.ts` | `createToolRuntime:349`, `ToolRuntime:304` |
| `src/modules/ai-platform-core/clara-tools.ts` | `buildRagSearchTool:126`, `buildClaraToolAuthorizationAdapter:180`, `buildClaraToolMeteringHook:288`, `invokeClaraTool:379` |
| `src/modules/ai-platform-core/agentic-loop.ts` | `runBoundedAgenticLoop:60`, `HARD_MAX_AGENT_ITERATIONS:21` |
| `src/modules/ai-platform-core/provider-tool-calling-pilot.ts` | `consumeProviderToolCall:71`, `isProviderToolCallingEnabled:63` |
| `src/modules/ai-platform-core/mcp-tool-bridge.ts` | `buildMcpToolRuntime:398`, `isMcpToolAllowlisted:484` |
| `src/modules/ai-platform-core/mcp-oauth.ts` | `probeMcpAuthRequirements:189`, `exchangeMcpAuthorizationCode:348`, `refreshMcpTokenSet:372` |
| `src/modules/ai-platform-core/integration-ai-tools.ts` / `integration-action-tool.ts` | `buildIntegrationAvailabilityTool:11`, `buildIntegrationActionTool:14` |
| `src/components/admin/ai-platform/AiPlatformWorkspace.tsx` (+ `ProvidersWorkspace.tsx`, `DefaultAssistantWorkspace.tsx`, `AIPlatformSection.tsx`, `shared.tsx`) | admin console UI |

## 7. UI Reference

- `/ai-platform` admin console (see above); provider defaults editing in the 992-line `ProvidersWorkspace.tsx`; assistant defaults in `DefaultAssistantWorkspace.tsx` (ties to Feature 12 platform assistant defaults).

## 8. Environment Variables

- `ENABLE_AI_PLATFORM_TOOL_CALLING`, `ENABLE_AI_PLATFORM_AGENT_LOOP`, `ENABLE_MCP` (rollout flags — `.env.example` AI provider section); provider/env vars from Features 10/26.

## 9. Tests

- `adapter-registry.test.ts`, `agentic-loop.test.ts`, `clara-adapters.test.ts`, `clara-runtime.test.ts`, `clara-tools.test.ts`, `tool-registry.test.ts`, `execution-context.test.ts`, `provider-tool-calling-pilot.test.ts`, `integration-*.test.ts`, `mcp-tool-bridge.test.ts`, `mcp-oauth.test.ts` (+ `mcp-oauth.live.test.ts`), `mcp-streamable-http-resolver.test.ts`.

## 10. Cross-links

- Grounding tool consumes **08/09** (RAG + retrieval); metering flows to **20/24**.
- MCP + integration governance in **23**; provider layer from **10**; console auth/RBAC via **02/22**.
- Runtime context derives from **03** (org/tenant) and **04** (agent/deployment).
