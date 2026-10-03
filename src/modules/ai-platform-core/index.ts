export {
  AGENT_LOOP_FLAG,
  HARD_MAX_AGENT_ITERATIONS,
  isAgentLoopEnabled,
  runBoundedAgenticLoop,
  type AgenticLoopResult,
  type AgenticLoopStatus,
} from "./agentic-loop";
export * from "./clara-runtime";

// Phase 7-A — host contracts / adapter foundation (server-side only).
export type {
  AgentId,
  CorrelationId,
  ExecutionContextInput,
  IdentityTenantAdapter,
  KnowledgeBaseId,
  PlatformAdapterName,
  PlatformAdapters,
  PlatformExecutionContext,
  ProviderAdapter,
  ProviderResolution,
  SecretsAdapter,
  SessionId,
  SurfaceKind,
  TenantId,
  TransportAdapter,
  TransportDescriptor,
  UserId,
} from "./contracts";
export {
  ExecutionContextError,
  assertExecutionContext,
  assertTenantScope,
  createExecutionContext,
  isValidPlatformExecutionContext,
} from "./execution-context";
export {
  AdapterRegistrationError,
  AdaptersNotRegisteredError,
  UnknownAdapterError,
  createPlatformAdapterRegistry,
  type PlatformAdapterRegistry,
} from "./adapter-registry";
export {
  PlatformSecretAccessError,
  buildClaraPlatformAdapters,
  getClaraPlatformAdapter,
  getClaraPlatformRegistry,
} from "./clara-adapters";

// Phase 7-B — Unified Tool Runtime (server-side only).
export type {
  ToolAuthorizationAdapter,
  ToolAuthorizationDecision,
  ToolAuthorizationPolicy,
  ToolAuthorizationRequest,
  ToolDefinition,
} from "./tool-contracts";
export type {
  ToolError,
  ToolErrorCode,
  ToolEventSink,
  ToolFailure,
  ToolInvocationOutcome,
  ToolMeteringHook,
  ToolMeteringRecord,
  ToolName,
  ToolPlanCapability,
  ToolResult,
  ToolStreamingEvent,
  ToolSummary,
} from "./tool-contracts";
export { TOOL_NAME_PATTERN, ToolExecutionError } from "./tool-contracts";
export {
  ToolRegistrationError,
  UnknownToolError,
  createToolRuntime,
  type ToolInvokeOptions,
  type ToolRuntime,
  type ToolRuntimeOptions,
} from "./tool-registry";
export {
  RAG_SEARCH_TOOL_NAME,
  buildClaraToolAuthorizationAdapter,
  buildClaraToolMeteringHook,
  buildClaraToolRuntime,
  buildRagSearchTool,
  getClaraToolRuntime,
  invokeClaraTool,
  planCapabilityForSurface,
} from "./clara-tools";

export {
  PROVIDER_TOOL_CALLING_FLAG,
  consumeProviderToolCall,
  isProviderToolCallingEnabled,
  type ProviderToolCall,
  type ProviderToolCallPilotResult,
} from "./provider-tool-calling-pilot";
