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
