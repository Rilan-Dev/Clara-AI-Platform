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

## Phase 7-B — Unified Tool Runtime

Phase 7-B (`docs/project-control/PHASE-7-PLAN.md` §21) extends the seam with
the keystone runtime. **Server-side only.** Zero new runtime dependencies
(zod was already a project dependency). No routes added or changed; no
database/migration/Supabase changes; no provider tool-calling.

| File | Role |
|---|---|
| `tool-contracts.ts` | Host-neutral 7-B vocabulary: `ToolDefinition` (zod-backed input schema + declarative authorization policy + executor), the per-tool authorization hook port, the usage-metering hook, normalized result envelopes, the typed-error vocabulary, and the normalized streaming tool-event contract (types only — no provider tool-calling). |
| `tool-registry.ts` | The Unified Tool Runtime: fail-closed registration (up-front definition validation; duplicates rejected; committed definitions frozen), deterministic listing/lookup (unknown → controlled failure), and the full invocation lifecycle — mandatory provenance-verified execution context → tool allowlist → authorization (surface allowlist + declared identity requirements + the host adapter) → zod input validation → execute() → result/error normalization → metering hook → streaming events. Every tool-level failure is a normalized typed `ToolFailure`; the runtime never throws out of `invoke()` and never falls back permissively. |
| `clara-tools.ts` | The Clara binding: the migrated `rag_search` `ToolDefinition` (wraps the existing `claraRuntime.retrieve` — behavior-preserving), the Clara authorization adapter (plan entitlements via the existing `ai-governance` resolver; RBAC via the existing `auth` org-access context when a tool declares `requiredPermission`), the default Clara metering hook (existing-spine discipline; see below), and the `getClaraToolRuntime()` application singleton. |
| `clara-runtime.ts` | The incumbent thin host binding — its formerly hardcoded `tools` object is REPLACED by delegation to the Unified Tool Runtime (the external `list()`/`invoke()` contract is preserved, including the legacy throw messages). |

### The invocation lifecycle

```text
mandatory PlatformExecutionContext (7-A provenance boundary — forged frozen lookalikes rejected)
  → tool allowlist (registry membership)
  → authorization: surface allowlist × declared identity requirements × host adapter
      (plan entitlement × RBAC × host tenant checks — fail-closed; adapter errors are denials)
  → zod input validation
  → execute(validatedInput, context)          ← the tool receives ONLY the frozen tenant context
  → normalized ToolResult | typed ToolFailure
  → metering hook (once per attempt, caller-scoped, never breaks the call)
  → streaming tool events (started → succeeded|failed, paired around execution only)
```

### `rag_search` migration (behavior-preserving)

The existing behavior — `claraRuntime.tools.invoke` → `claraRuntime.retrieve`
→ `groundClaraContext` (channel "voice", ragMode from the payload defaulting
to "hybrid", the caller's orgId/agentId/kbId/userId/sessionId carried through
unchanged, `admission: "external"` so the owning turn keeps owning the query
event) — is wrapped, not rewritten. The tool's domain payload IS the incumbent
`GroundingOutcome`, including its domain-level `ok:false` outcomes (e.g. the
402 `plan_limit_exceeded` contract): those are valid tool outputs preserved
byte-for-byte; the typed `ToolFailure` envelope is reserved for runtime-level
failures (context/allowlist/authorization/validation/execution). Parity is
proven by tests that call the registry and the direct implementation with
identical inputs and compare results.

Authorization for `rag_search`: allowed surfaces are exactly the ones the
tool is exposed on today — `realtime` and `embed` (chat never exposed a tool
surface, so it is NOT in the allowlist; public/embed exposure is not
broadened). Plan entitlement is derived from the invocation surface through
the existing `ai-governance` resolver (realtime → `realtime_voice`, embed →
`voice_chat`, chat → `chat`). No org-role requirement is introduced for the
incumbent tool: its owning routes keep the authentication/RBAC boundary
exactly as today; the runtime's RBAC integration point is exercised by tools
that declare `requiredPermission`.

### Metering binding

The runtime exposes the approved hook interface and invokes it once per
invocation attempt with the caller-scoped record. The default Clara hook
follows the existing spine's discipline (append-only,
never-break-the-metered-pipeline, org-scoped) WITHOUT inserting new billing
rows: the incumbent retrieval is metered by its owning turn (the
`admission: "external"` contract exists to prevent double-billing), and the
`usage_events` kind vocabulary is fixed by the existing schema CHECK
constraint (no migrations are authorized in 7-B). Hosts bind their own hook
to extend metering onto the existing spine.

### Stopping boundary

7-B delivers the runtime and the `rag_search` migration only. Provider
tool-calling, the agentic loop, bounded iteration logic, tool-calling
provider APIs, MCP, and integrations are 7-C-and-beyond territory and remain
unauthorized until the architect issues the corresponding explicit
authorization handoffs.
