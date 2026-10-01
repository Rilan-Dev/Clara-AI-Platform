/**
 * src/modules/ai-platform-core/adapter-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-A — fail-closed host adapter registry.
 *
 * Implements the reviewed adapter boundary (PHASE-7-PLAN.md §8/§9, following
 * the fail-closed pattern of the immutable Doable reference
 * `adapters/adapter-registry.ts` + `adapter-validation.ts` — read as design
 * reference only, never imported):
 *
 * - registration is EXPLICIT and validated up front (missing or mis-shaped
 *   slots are rejected at registration time, before the registry becomes
 *   active — "fail at registration, not at action time");
 * - duplicate registration is rejected deterministically and never
 *   overwrites a live binding;
 * - lookup is deterministic (exact slot), with NO implicit fallback to
 *   arbitrary or default adapters;
 * - unknown adapter names and pre-registration lookups fail closed;
 * - the committed adapter set is frozen, so slots cannot be swapped after
 *   registration.
 */

import type { PlatformAdapterName, PlatformAdapters } from "./contracts";

/** Registration failed validation (missing/mis-shaped slots) or duplicated a live registry. */
export class AdapterRegistrationError extends Error {
  readonly code: "SLOTS_INVALID" | "ALREADY_REGISTERED";
  readonly missingSlots: readonly string[];
  readonly invalidSlots: readonly string[];

  constructor(
    code: AdapterRegistrationError["code"],
    message: string,
    options?: { missingSlots?: readonly string[]; invalidSlots?: readonly string[] },
  ) {
    super(message);
    this.name = "AdapterRegistrationError";
    this.code = code;
    this.missingSlots = Object.freeze([...(options?.missingSlots ?? [])]);
    this.invalidSlots = Object.freeze([...(options?.invalidSlots ?? [])]);
  }
}

/** Lookup of an adapter name the registry does not know. Controlled failure — no fallback. */
export class UnknownAdapterError extends Error {
  readonly adapterName: string;
  readonly knownAdapters: readonly PlatformAdapterName[];

  constructor(adapterName: string, knownAdapters: readonly PlatformAdapterName[]) {
    super(`Unknown platform adapter: "${adapterName}". Known adapters: ${knownAdapters.join(", ")}.`);
    this.name = "UnknownAdapterError";
    this.adapterName = adapterName;
    this.knownAdapters = Object.freeze([...knownAdapters]);
  }
}

/** The registry has no committed adapter set yet. */
export class AdaptersNotRegisteredError extends Error {
  constructor() {
    super("Clara platform adapters have not been registered. Register a complete adapter set before use.");
    this.name = "AdaptersNotRegisteredError";
  }
}

/** Per-slot structural requirements — the registry validates these at registration time. */
const ADAPTER_SLOT_REQUIREMENTS: Readonly<Record<PlatformAdapterName, readonly string[]>> = Object.freeze({
  identity: Object.freeze(["resolve"]),
  provider: Object.freeze(["resolveModel"]),
  secrets: Object.freeze(["get"]),
  transport: Object.freeze(["describe"]),
});

const ADAPTER_NAMES: readonly PlatformAdapterName[] = Object.freeze([
  "identity",
  "provider",
  "secrets",
  "transport",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PlatformAdapterRegistry {
  /** Validates and commits a complete adapter set. Fails closed; never overwrites. */
  register(adapters: PlatformAdapters): void;
  /** Deterministic exact-slot lookup. Unknown names and unregistered state fail closed. */
  get<N extends PlatformAdapterName>(name: N): PlatformAdapters[N];
  /** Returns the committed adapter set (throws if unregistered). */
  requireRegistered(): PlatformAdapters;
  isRegistered(): boolean;
  listRegistered(): readonly PlatformAdapterName[];
}

/**
 * Creates an isolated registry instance. The application seam uses the
 * lazily-initialized singleton in clara-adapters.ts; tests and future
 * embeddings may create their own.
 */
export function createPlatformAdapterRegistry(): PlatformAdapterRegistry {
  let committed: PlatformAdapters | null = null;

  function validate(adapters: unknown): asserts adapters is PlatformAdapters {
    if (!isPlainObject(adapters)) {
      throw new AdapterRegistrationError("SLOTS_INVALID", "Adapter registration requires a complete adapter object.");
    }
    const missingSlots: string[] = [];
    const invalidSlots: string[] = [];
    for (const name of ADAPTER_NAMES) {
      const slot = (adapters as Record<string, unknown>)[name];
      if (slot === undefined || slot === null) {
        missingSlots.push(name);
        continue;
      }
      if (!isPlainObject(slot)) {
        invalidSlots.push(name);
        continue;
      }
      for (const method of ADAPTER_SLOT_REQUIREMENTS[name]) {
        if (typeof (slot as Record<string, unknown>)[method] !== "function") {
          invalidSlots.push(name);
          break;
        }
      }
    }
    if (missingSlots.length > 0 || invalidSlots.length > 0) {
      const parts: string[] = [];
      if (missingSlots.length > 0) parts.push(`missing: ${missingSlots.join(", ")}`);
      if (invalidSlots.length > 0) parts.push(`invalid (missing required methods): ${invalidSlots.join(", ")}`);
      throw new AdapterRegistrationError(
        "SLOTS_INVALID",
        `Adapter registration rejected — ${parts.join("; ")}. The registry fails closed and has not been modified.`,
        { missingSlots, invalidSlots },
      );
    }
  }

  return {
    register(adapters: PlatformAdapters): void {
      if (committed !== null) {
        throw new AdapterRegistrationError(
          "ALREADY_REGISTERED",
          "Adapter registration rejected — a complete adapter set is already registered. Re-registration is not permitted; the live binding is preserved.",
        );
      }
      // Validate-then-commit: a rejected registration leaves the registry untouched.
      validate(adapters);
      committed = Object.freeze({ ...adapters });
    },

    get<N extends PlatformAdapterName>(name: N): PlatformAdapters[N] {
      if (!ADAPTER_NAMES.includes(name)) {
        throw new UnknownAdapterError(String(name), ADAPTER_NAMES);
      }
      if (committed === null) {
        throw new AdaptersNotRegisteredError();
      }
      return committed[name];
    },

    requireRegistered(): PlatformAdapters {
      if (committed === null) {
        throw new AdaptersNotRegisteredError();
      }
      return committed;
    },

    isRegistered(): boolean {
      return committed !== null;
    },

    listRegistered(): readonly PlatformAdapterName[] {
      return committed === null ? [] : ADAPTER_NAMES;
    },
  };
}
