/**
 * src/modules/ai-platform-core/contracts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-A — Host contracts for the Clara-owned AI platform seam.
 *
 * This file defines the host-neutral seam vocabulary implemented by Clara for
 * the reviewed Phase 7-A architecture (PHASE-7-PLAN.md §8/§9): a mandatory
 * tenant-scoped execution context plus the minimal set of adapter ports the
 * 7-A foundation declares (identity/tenant, provider, secrets, transport).
 *
 * Provenance rule (D-007 / D-P3): the architectural PATTERN follows the
 * immutable Doable reference library (docs/doable-source/contracts/ and
 * docs/doable-source/adapters/) which is read as design reference ONLY —
 * it is never imported at runtime, never copied verbatim, and never
 * modified. Every declaration here is Clara-owned host code.
 *
 * Server-side only. No runtime dependencies.
 */

// ─── Execution context vocabulary ────────────────────────────────────────────

/** Clara organization id — the tenant boundary. Never ambient or global. */
export type TenantId = string;

/** Clara knowledge-base id — Clara's retrieval workspace binding. */
export type KnowledgeBaseId = string;

export type UserId = string;
export type AgentId = string;
export type SessionId = string;
/** Request/correlation identifier for tracing a single platform operation. */
export type CorrelationId = string;

/**
 * The surface a platform operation is initiated from. Deliberately the same
 * vocabulary the incumbent seam (`claraRuntime`) already uses, so adapters
 * can map it onto the incumbent resolvers without translation loss.
 */
export type SurfaceKind = "chat" | "realtime" | "embed";

/**
 * Host-neutral execution context — the mandatory tenant-scoped context every
 * platform-seam operation carries (PHASE-7-PLAN.md §8: "ExecutionContext
 * factory: ClaraRuntimeContext (orgId/agentId/kbId/userId/sessionId) →
 * host-neutral tenant context").
 *
 * Fail-closed properties (enforced by the factory in execution-context.ts):
 * - `tenantId` and `kbId` are REQUIRED and non-blank — there is no ambient,
 *   global, or environment-derived tenant fallback.
 * - instances are frozen — tenant identity cannot be swapped after creation.
 */
export interface PlatformExecutionContext {
  readonly tenantId: TenantId;
  readonly kbId: KnowledgeBaseId;
  readonly userId?: UserId;
  readonly agentId?: AgentId;
  readonly sessionId?: SessionId;
  readonly correlationId?: CorrelationId;
  readonly surface: SurfaceKind;
  /**
   * Read-only extension point (e.g. future usage/metering annotations in
   * 7-B). Never identity-bearing: tenant identity lives in the fields above.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Factory input. Structurally compatible with the existing
 * `ClaraRuntimeContext` (clara-runtime.ts) so incumbent call sites can adopt
 * the platform seam without adapters reshaping their identity objects.
 * Optional/nullable fields are validated and normalized fail-closed by
 * `createExecutionContext`.
 */
export interface ExecutionContextInput {
  orgId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  surface?: SurfaceKind;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Adapter ports declared by the 7-A foundation ────────────────────────────

/**
 * Identity/tenant adapter — derives the host-neutral execution context from
 * Clara's existing runtime identity. This is the ONLY sanctioned way to
 * produce a `PlatformExecutionContext`; it must fail closed on missing
 * tenant identity rather than defaulting to any ambient scope.
 */
export interface IdentityTenantAdapter {
  resolve(input: ExecutionContextInput): PlatformExecutionContext;
}

/** Neutral provider resolution descriptor (the incumbent resolver stays authoritative). */
export interface ProviderResolution {
  readonly providerId: string;
  readonly chatModel: string | null;
  readonly embeddingProviderId: string;
}

/**
 * Provider adapter — brain-axis provider resolution, delegated to the
 * incumbent `ai-core` resolver stack via the existing `claraRuntime` seam.
 * The provider stack is consumed, never duplicated (PHASE-7-PLAN.md §16).
 */
export interface ProviderAdapter {
  resolveModel(context: PlatformExecutionContext): Promise<ProviderResolution>;
}

/**
 * Secrets adapter — declaration only. Clara's binding enforces the reviewed
 * boundary (PHASE-7-PLAN.md §9/§14): NO secret material crosses the platform
 * seam; provider credentials remain server-side in the ai-governance
 * registry. `get` always fails closed.
 */
export interface SecretsAdapter {
  readonly transferPolicy: "never";
  get(context: PlatformExecutionContext, key: string): Promise<string>;
}

/** A transport surface that ALREADY exists in Clara. Declaration only — 7-A adds no routes. */
export interface TransportDescriptor {
  readonly kind: "chat-ndjson" | "realtime-session" | "embed-widget";
  readonly route: string;
  readonly surface: SurfaceKind;
}

/**
 * Transport adapter — declares the existing Clara transport surfaces. It is
 * an inventory of incumbent routes, not an executable re-implementation;
 * production routes remain intentionally unchanged (module README).
 */
export interface TransportAdapter {
  describe(): readonly TransportDescriptor[];
}

/** The complete 7-A adapter set. Every slot is required — registration fails closed otherwise. */
export interface PlatformAdapters {
  identity: IdentityTenantAdapter;
  provider: ProviderAdapter;
  secrets: SecretsAdapter;
  transport: TransportAdapter;
}

/** Names of the adapter slots the 7-A foundation registers. */
export type PlatformAdapterName = keyof PlatformAdapters;
