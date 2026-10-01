/**
 * src/modules/ai-platform-core/clara-adapters.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-A — Clara host adapter bindings for the platform seam.
 *
 * Binds the 7-A adapter declarations to Clara's EXISTING services
 * (PHASE-7-PLAN.md §21 7-A: "secrets/transport/provider adapter declarations
 * bound to existing services"):
 *
 * - identity  → the fail-closed ExecutionContext factory (Clara's existing
 *               runtime/identity model — orgId/kbId/userId/agentId/sessionId;
 *               no second authentication system, no bypass of the tenancy
 *               model);
 * - provider  → the incumbent `ai-core` resolver stack, consumed THROUGH the
 *               existing `claraRuntime` seam (never duplicated, never
 *               replaced);
 * - secrets   → declaration only: no secret material crosses the seam
 *               (credentials stay server-side in the ai-governance registry);
 * - transport → declaration only: an inventory of ALREADY-EXISTING Clara
 *               routes. 7-A introduces no routes and changes no route.
 *
 * Server-side only. Zero runtime dependencies.
 */

import type {
  ExecutionContextInput,
  PlatformAdapterName,
  PlatformAdapters,
  PlatformExecutionContext,
  ProviderResolution,
  SecretsAdapter,
  TransportDescriptor,
} from "./contracts";
import {
  assertExecutionContext,
  createExecutionContext,
} from "./execution-context";
import { createPlatformAdapterRegistry, type PlatformAdapterRegistry } from "./adapter-registry";
import { claraRuntime } from "./clara-runtime";

/** Controlled failure: secret material never crosses the Clara platform seam. */
export class PlatformSecretAccessError extends Error {
  constructor() {
    super(
      "Secret material never crosses the Clara platform seam. Provider credentials remain server-side in the ai-governance registry; tools receive capability abstractions, never raw secrets.",
    );
    this.name = "PlatformSecretAccessError";
  }
}

/**
 * Transport inventory — every descriptor names a route that ALREADY EXISTS in
 * Clara. Declaration only: this adapter adds no routes and modifies none
 * (existing production routes are intentionally unchanged per the module
 * README / PHASE-7-PLAN.md §9 API boundary: "none (no new routes)").
 */
const CLARA_TRANSPORT_DECLARATIONS: readonly TransportDescriptor[] = Object.freeze([
  Object.freeze({ kind: "chat-ndjson", route: "/api/chat", surface: "chat" } satisfies TransportDescriptor),
  Object.freeze({ kind: "realtime-session", route: "/api/realtime/session", surface: "realtime" } satisfies TransportDescriptor),
  Object.freeze({ kind: "embed-widget", route: "/api/embed/chat", surface: "embed" } satisfies TransportDescriptor),
]);

/**
 * The Clara-bound secrets adapter. `get` ALWAYS fails closed — this is the
 * reviewed boundary (PHASE-7-PLAN.md §9 secrets row: "declaration only — no
 * secret objects cross the seam"), not a latent capability.
 */
const claraSecretsAdapter: SecretsAdapter = {
  transferPolicy: "never",
  async get(): Promise<string> {
    throw new PlatformSecretAccessError();
  },
};

/**
 * Builds the complete Clara adapter set. Pure function — safe to inspect and
 * test in isolation; the application singleton is wired lazily by
 * `getClaraPlatformRegistry` below.
 */
export function buildClaraPlatformAdapters(): PlatformAdapters {
  return {
    identity: {
      /**
       * Derives the tenant-scoped execution context from Clara's existing
       * runtime identity. Fails closed on missing tenant/KB binding.
       */
      resolve(input: ExecutionContextInput): PlatformExecutionContext {
        return createExecutionContext(input);
      },
    },

    provider: {
      /**
       * Resolves the tenant's brain provider by DELEGATING to the incumbent
       * seam (claraRuntime → ai-core resolver ladder). The caller's tenant
       * context is carried through unchanged — per-tenant resolution,
       * entitlement gating, and caching all remain the incumbent stack's
       * responsibility (consumed, never duplicated).
       */
      async resolveModel(context: PlatformExecutionContext): Promise<ProviderResolution> {
        const validated = assertExecutionContext(context);
        const config = await claraRuntime.resolveProvider(
          {
            orgId: validated.tenantId,
            agentId: validated.agentId ?? null,
            kbId: validated.kbId,
            userId: validated.userId ?? null,
            sessionId: validated.sessionId ?? null,
          },
          validated.surface,
        );
        return Object.freeze({
          providerId: config.provider,
          chatModel: config.chatModel,
          embeddingProviderId: config.embeddingProvider,
        });
      },
    },

    secrets: claraSecretsAdapter,

    transport: {
      /** Inventory of existing transport surfaces. No executable transport is introduced. */
      describe(): readonly TransportDescriptor[] {
        return CLARA_TRANSPORT_DECLARATIONS;
      },
    },
  };
}

// ─── Application singleton ───────────────────────────────────────────────────

let platformRegistry: PlatformAdapterRegistry | null = null;

/**
 * The Clara application seam: a lazily-initialized registry holding the
 * Clara-bound adapters. Registration happens exactly once; the returned
 * registry fails closed on unknown adapters, unregistered lookups, and
 * re-registration attempts.
 */
export function getClaraPlatformRegistry(): PlatformAdapterRegistry {
  if (platformRegistry === null) {
    const registry = createPlatformAdapterRegistry();
    registry.register(buildClaraPlatformAdapters());
    platformRegistry = registry;
  }
  return platformRegistry;
}

/** Convenience accessor for a bound adapter by name (fail-closed). */
export function getClaraPlatformAdapter<N extends PlatformAdapterName>(name: N): PlatformAdapters[N] {
  return getClaraPlatformRegistry().get(name);
}
