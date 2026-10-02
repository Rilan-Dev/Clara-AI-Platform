# Clara host binding for AI Platform Core

This is the first concrete host integration for the extracted AI Platform Core.

The binding connects Clara's existing tenant/configuration, provider, RAG, conversation context, chat streaming, tool and realtime voice services behind one host-facing runtime seam.

Bound path:
Identity/Tenant → Provider Resolver → Tool Registry seam → Clara RAG → Context/Conversation → Chat Provider → Realtime Voice Transport

Boundaries:
- Clara remains authoritative for tenant/agent/KB identity.
- Clara Qdrant remains the knowledge source.
- Brain provider and realtime voice provider remain separate axes.
- Vendor credentials remain server-side.
- No vendor knowledge base replaces Clara Qdrant.
- Unsupported Doable infrastructure is not silently emulated.
- The immutable Doable extraction is not modified or imported.

Existing production routes are intentionally unchanged in this first wiring step. New routes/features can migrate to this seam incrementally with behavior-preserving tests.

## Phase 7-A — Host contracts / adapter foundation

Phase 7-A (`docs/project-control/PHASE-7-PLAN.md` §21) extends this module with
the Clara-owned platform seam foundation. **Server-side only.** Zero new
runtime dependencies. No behavior change to any existing route.

| File | Role |
|---|---|
| `contracts.ts` | Host-neutral seam vocabulary: `PlatformExecutionContext`, `ExecutionContextInput`, and the 7-A adapter ports (`IdentityTenantAdapter`, `ProviderAdapter`, `SecretsAdapter`, `TransportAdapter`). Types only. |
| `execution-context.ts` | Fail-closed `ExecutionContext` factory derived from Clara's existing runtime identity (`ClaraRuntimeContext`-shaped input → frozen, tenant-scoped context) plus `assertTenantScope` / `assertExecutionContext` guards. Validation is provenance-based (CORRECTION A): only contexts minted by `createExecutionContext` (tracked in a module-private WeakSet) are accepted — a merely frozen structural lookalike is rejected. |
| `adapter-registry.ts` | Fail-closed host adapter registry: explicit registration with up-front slot validation, deterministic exact-slot lookup, no implicit fallback, unknown adapter → controlled failure, re-registration rejected, committed set frozen AND each committed adapter object frozen in place at commit time (CORRECTION B — immutable through the original caller references too). |
| `clara-adapters.ts` | The Clara host adapter bindings + the lazily-initialized application registry singleton (`getClaraPlatformRegistry`). |
| `clara-runtime.ts` | The incumbent thin host binding (unchanged behavior; see below). |

### Adapter slots bound in 7-A

- **identity** — `ClaraRuntimeContext`-shaped input → frozen
  `PlatformExecutionContext`. `tenantId` (orgId) and `kbId` are mandatory;
  missing tenant identity fails closed with no ambient/global fallback.
  This derives from Clara's existing tenancy model — it is not a second
  authentication system. Factory-produced contexts are the only valid ones:
  `isValidPlatformExecutionContext` requires module-private provenance
  (WeakSet membership), so hand-built frozen lookalikes never cross the
  trust boundary.
- **provider** — delegates to the incumbent `ai-core` resolver stack through
  the existing `claraRuntime.resolveProvider` seam. The provider stack is
  consumed, never duplicated or replaced; the caller's tenant context is
  carried through unchanged.
- **secrets** — declaration only. `get` always fails closed
  (`PlatformSecretAccessError`): no secret material crosses the platform
  seam; provider credentials remain server-side in the `ai-governance`
  registry.
- **transport** — declaration only. An inventory of ALREADY-EXISTING routes
  (`/api/chat`, `/api/realtime/session`, `/api/embed/chat`). 7-A adds no
  routes and modifies none.

### Provenance and immutability

The architectural pattern (execution context + fail-closed adapter registry)
follows the immutable Doable reference library
(`docs/doable-source/contracts/`, `docs/doable-source/adapters/`), which is
read as design reference ONLY — never imported at runtime, never copied
verbatim, never modified (D-007). All code in this module is Clara-owned
host code above the incumbent `src/modules/ai-core/**` layer (D-P3:
`ai-platform-core` is the integration seam; `ai-core` remains the incumbent
provider layer beneath it, unchanged).

### Stopping boundary

7-A delivers the seam base only. The Unified Tool Runtime (7-B) — tool
definitions, schemas, registry, invocation lifecycle, authorization and
metering hooks — and provider tool-calling / the agentic loop (7-C) are NOT
part of this foundation and remain unauthorized until the architect issues
the corresponding explicit authorization handoffs.
