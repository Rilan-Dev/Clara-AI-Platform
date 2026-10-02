## Part II — Active Handoff Instance

> **Phase 7-B — Unified Tool Runtime implementation-authorization instance** — materialized from `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` per Part I §I.12 on 2026-10-03, replacing the fully executed CH-002 Phase 7-A corrective-handoff instance with its appended closure record (superseded; recoverable in Git history at `a2c74204cd793758444a6f5e307c2921014e8c90` and identified in the canonical `worklog.md` Phase 7-A closure entry). This instance authorizes **ONLY sub-phase 7-B — Unified Tool Runtime** on the existing host seam (`src/modules/ai-platform-core/**`), issued after: Phase 7-A implementation was reviewed and required correction; CH-002 correction was implemented in `577189d4`; the architect re-reviewed `577189d4` and returned `PASS`; Phase 7-A was formally closed by governance commit `a2c74204`; and the closure record was architect-reviewed and accepted. Phase 7 remains `IN_PROGRESS`; 7-C remains **NOT AUTHORIZED**. It does **not** authorize 7-C (provider tool calling, agentic loop, bounded iteration logic, tool-calling provider APIs), MCP, integrations framework, agent runtime, Agent Work Mode, memory, skills, attachments, image generation, marketplace, templates, automation, collaboration, new provider integrations, provider catalog expansion, Anthropic/BYOK expansion, deployment work, `vercel.json`, production-branch work, database migrations, Supabase schema work, dependency upgrades, lockfile repair, fixing I-015, resolving I-014, resolving D-P2, resolving D-P4, or Phase 8 work.

## Phase identity

| Field | Value |
|---|---|
| Phase number | **7** (sub-phase **7-B**) |
| Phase name | **AI Platform Core Foundation** — sub-phase **7-B — Unified Tool Runtime** |
| Full designation | Phase 7-B — Unified Tool Runtime (implementation stage) |
| Current status | **`IN_PROGRESS`** — sub-phase 7-A: `PASS — CORRECTION VERIFIED — CLOSED`; sub-phase 7-B: **`IMPLEMENTATION AUTHORIZED / IN PROGRESS`**; 7-C: `NOT AUTHORIZED`; Phase 7 itself not `PASS`, not `CLOSED` |
| Repository | `Rilan-Dev/Clara-AI-Platform` |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `a2c74204cd793758444a6f5e307c2921014e8c90` (the Phase 7-A closure-record commit; the immediate child of the reviewed Phase 7-A correction `577189d4963121a64a696c59bd3fb16dacb3b61d` — verified parent relationship `577189d4 → a2c74204`; the developer verified per Part I §I.6 before executing: branch correct; HEAD = the baseline = origin tip after fresh fetch; clean tree; the immutable Doable source unchanged — the four tree OIDs identical to the recorded baseline) |
| Architect | ChatGPT |
| Developer | Z.AI |
| Handoff date | 2026-10-03 |

## Objective

Introduce the Unified Tool Runtime under `src/modules/ai-platform-core/**` per the architect-reviewed Phase 7 plan (§§8–10, §§15–21, the §21 sub-phase 7-B entry) and migrate the existing `rag_search` capability onto it, while preserving existing externally observable behavior — one precise statement, no implied extras.

## Scope (approved)

1. **The 7-B runtime capabilities** (per the plan's reviewed definition): `ToolDefinition`; Zod-backed input/schema validation; tool registry; tool registration; tool listing/discovery; invocation; mandatory `ExecutionContext`; per-tool authorization hook; existing RBAC/entitlement integration; result normalization; typed error normalization; streaming tool-event types; usage-metering hooks.
2. **The `rag_search` migration** (behavior-preserving): locate the current implementation and its callers before changing anything; the required outcome pipeline is `existing rag_search behavior → ToolDefinition → ToolRegistry → validated invocation → mandatory ExecutionContext → authorization → existing retrieval implementation → normalized result / typed error → existing metering spine`; the registry wraps/adapts the existing behavior — the underlying RAG implementation is NOT rewritten merely to fit the registry.
3. **The authorized implementation surface** — the existing host seam: `src/modules/ai-platform-core/**` (the Phase 7-A contracts and adapter foundation at `a2c74204` are the starting point and are preserved, not replaced, bypassed, weakened, or duplicated; no second competing tool/runtime seam elsewhere).
4. **The governance records** for an explicitly authorized implementation stage: the Final State Contract members reconciled to `Phase 7-A: PASS — CORRECTION VERIFIED — CLOSED` / `Phase 7-B: IMPLEMENTATION AUTHORIZED / IN PROGRESS` / `Phase 7-C: NOT AUTHORIZED` / `Phase 7: IN_PROGRESS`; this handoff recorded as the architect authorization event; all historical Phase 7-A records preserved append-only.
5. **Focused tests** for the 7-B runtime (§ Testing requirements below) and the full validation suite with recorded actual results.

## Non-scope (explicit)

- **7-C and beyond — NOT AUTHORIZED**: provider tool calling (the OpenAI provider's tool-calling surface and other providers' implementations are untouched); agentic loop; bounded iteration logic; tool-calling provider APIs; MCP; integrations framework; agent runtime; Agent Work Mode; memory; skills; attachments; image generation; marketplace; templates; automation; collaboration; new provider integrations; provider catalog expansion; Anthropic/BYOK expansion.
- **The incumbent provider/brain layer** — `src/modules/ai-core/**` remains authoritative: do not replace the provider resolver; do not change provider precedence; do not change provider entitlement semantics; do not change brain/voice separation; do not duplicate provider resolution inside the tool runtime. The runtime consumes the existing provider/host infrastructure through approved adapters/contracts.
- **Production routes**: do not broadly rewrite `src/app/api/**`; do not redesign chat/realtime routes; do not change production behavior merely to make implementation easier — if a route modification becomes necessary, STOP and report the exact required change rather than expanding scope silently.
- **Database/metering**: no new billing or usage subsystem; no new tables; no migrations; no Supabase schema changes — metering hooks integrate with the existing usage/event infrastructure; the runtime exposes the appropriate hook/interface rather than hard-coding a new billing architecture.
- **Deployment**: no deployment work; `vercel.json` untouched; no production-branch work.
- **Immutable Doable source — absolute prohibition**: no source edits, formatting, renames, refactors, generated changes, dependency changes, or vendoring changes under `docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**`, `doable-source-extensions/**`; no runtime import of Doable source from `src/**`; I-014 remains OPEN and must not be resolved as part of 7-B.
- **I-015 remains OPEN**: no lockfile regeneration; no dependency-changing installation; no package upgrades; no dependency-graph rewrite. If the existing 19 application-code typecheck errors remain, report them exactly as pre-existing environmental/repository state; do not claim them fixed.
- **No unrelated issues resolved**: I-014, I-015, I-001, I-007, D-P2, D-P4, R-3/R-4/R-5 all remain as recorded; no `DECISIONS.md`/`RISKS.md`/`PHASE-7-PLAN.md` changes; Phase 7 is not marked `PASS` or `CLOSED`; 7-B is not marked complete before architect review.

## Prerequisites

1. The architect's 7-B authorization was issued ONLY after: the 7-A implementation review (`CORRECTION_REQUIRED`), the CH-002 correction (`577189d4`), the architect re-review of `577189d4` (`PASS`), the formal 7-A closure (`a2c74204`), and the architect's acceptance of the closure record [architect-verified workflow actions].
2. Phase 7-A's contracts and adapter foundation at `a2c74204` are confirmed as the starting point (pre-flight executed and recorded: branch/HEAD/origin/clean-tree/parent-relationship/immutable-source all verified).
3. `zod` is already a project dependency — zero new runtime npm dependencies are required or authorized.
4. The Phase 7 plan explicitly establishes that I-014 does not block 7-B (A1–A3 reference source present and byte-verified).

## Required reading

- `docs/project-control/PHASE-7-PLAN.md` — especially §§8–10 (architecture, adapter boundaries, dependency graph), §§15–21 (multi-tenant, provider, testing strategy, verification gates, acceptance criteria, rollback, ordered sub-phases), and the Phase 7-B entry in §21 (the authoritative design).
- `docs/project-control/CURRENT_PHASE.md`, `docs/project-control/PROJECT_STATE.md`, `docs/project-control/VERIFICATION_STATE.md`, `docs/project-control/ISSUES.md` (I-014/I-015 OPEN; I-016 RESOLVED), `docs/project-control/NEXT_ACTION.md`.
- The Phase 7-A implementation under `src/modules/ai-platform-core/**` (contracts.ts, execution-context.ts, adapter-registry.ts, clara-adapters.ts, clara-runtime.ts, index.ts, README.md) — the approved seam this stage builds on.
- The existing `rag_search` implementation and its callers (located before any change): `clara-runtime.ts` (the `tools` seam and `retrieve`), `src/modules/rag/grounding.ts` (`groundClaraContext`), and the exposure sites (`src/modules/assistant/api/realtime.ts`, `src/app/api/embed/voice-connect/route.ts`, `src/modules/phone/core/call-handler.ts`, `src/app/api/phone/session/route.ts`, the realtime client hooks).

## Implementation tasks (numbered, deterministic)

1. Pre-flight: verify the branch, HEAD == origin, clean worktree, the parent relationship `577189d4 → a2c74204`, and the immutable Doable source unchanged; confirm the Phase 7-A contracts/adapter foundation as the starting point. Do not begin implementation until confirmed.
2. Implement the 7-B runtime contracts (`tool-contracts.ts`): ToolDefinition; the typed-error vocabulary; result normalization envelopes; the declarative per-tool authorization policy + the host authorization adapter port; the usage-metering hook; the normalized streaming tool-event types + event sink (contract only).
3. Implement the Unified Tool Runtime (`tool-registry.ts`): fail-closed registration (up-front validation, duplicate rejection, committed definitions frozen); listing/discovery; deterministic lookup; the full invocation lifecycle (mandatory provenance-verified ExecutionContext → tool allowlist → authorization: surface allowlist + declared identity requirements + the host adapter, fail-closed on adapter errors → zod input validation → execute → normalized result/typed error → metering hook → streaming events).
4. Migrate `rag_search` onto the registry (`clara-tools.ts`): the ToolDefinition wraps the existing `claraRuntime.retrieve` behavior (tenant isolation, orgId/agentId/kbId/userId/sessionId, session context, retrieval semantics, Qdrant/Clara knowledge-base behavior, authorization boundaries, public/embed restrictions, existing usage accounting — all unchanged); the Clara authorization adapter (existing RBAC/entitlement integration); the metering hook binding; the application singleton.
5. Replace the hardcoded `claraRuntime.tools` object with delegation to the Unified Tool Runtime (the plan §9 A2 entry point), preserving the external seam contract.
6. Fail-closed proofs: every invocation requires a valid execution context; rejection proven for missing orgId, missing agentId where required, missing kbId where the tool requires KB scope, missing user/session identity where required, invalid/untrusted execution contexts (forged structural lookalikes rejected via the 7-A provenance boundary), unauthorized surface, unauthorized role, insufficient plan entitlement; no permissive fallback.
7. Additive exports (`index.ts`) and module documentation (`README.md` — the 7-B section).
8. Write the focused 7-B tests (§ Testing requirements).
9. Run the full validation suite (§ Testing requirements) and record actual results.
10. Update the governance records (§ Scope item 4) and append the session record.
11. Commit as a focused implementation commit; inspect `git diff --stat` / `git diff --name-only` / `git diff` before committing — the changed-path set must be explainable entirely by the authorized 7-B scope; push normally; verify HEAD == origin and a clean worktree.
12. Produce the implementation report; STOP.

## Files / components

| Path | Action | Bounded change |
|---|---|---|
| `src/modules/ai-platform-core/tool-contracts.ts` | create | The 7-B host-neutral vocabulary (types, error codes, event contracts, hook ports, ToolDefinition). |
| `src/modules/ai-platform-core/tool-registry.ts` | create | The Unified Tool Runtime (registration, discovery, the invocation lifecycle, normalization, metering, events). |
| `src/modules/ai-platform-core/clara-tools.ts` | create | The Clara binding (the migrated rag_search ToolDefinition; the authorization adapter; the metering hook; the singleton; the incumbent-identity migration helper). |
| `src/modules/ai-platform-core/tool-registry.test.ts` | create | The focused registry/invocation/tenant-isolation/metering/streaming tests. |
| `src/modules/ai-platform-core/clara-tools.test.ts` | create | The focused rag_search migration/parity/authorization/metering tests. |
| `src/modules/ai-platform-core/clara-runtime.ts` | modify | The hardcoded `tools` object replaced by delegation to the unified runtime (external contract preserved); no other behavior change. |
| `src/modules/ai-platform-core/clara-runtime.test.ts` | modify | The seam tests updated to the migrated delegation (legacy contracts preserved and proven). |
| `src/modules/ai-platform-core/index.ts` | modify | Additive 7-B exports only. |
| `src/modules/ai-platform-core/README.md` | modify | The 7-B documentation section. |
| `docs/project-control/ZAI_HANDOFF.md` | modify | This Part II instance (per §I.12). |
| `docs/project-control/CURRENT_PHASE.md`, `PROJECT_STATE.md`, `VERIFICATION_STATE.md`, `NEXT_ACTION.md` | modify | The 7-B stage reconciliation (append-only; historical records preserved unrewritten). |
| `worklog.md` | modify | The append-only Phase 7-B implementation entry. |
| `docs/project-control/sessions/SESSION-015.md` + `sessions/README.md` | create/modify | The session audit record + its index row. |

## Interfaces / contracts

- The Phase 7-A seam is preserved: `contracts.ts` / `execution-context.ts` (the provenance-hardened factory — reused, not replaced) / `adapter-registry.ts` (its immutability guarantees untouched; no mutable global adapter state; no bypass of registration validation; no ad-hoc adapter instances outside the approved registry) / `clara-adapters.ts`.
- The incumbent `ai-core` stack is consumed, never duplicated or modified; `claraRuntime` remains the delegation surface for provider resolution and retrieval.
- The existing `rag_search` externally observable behavior is preserved (the seam's legacy return/throw contract; the retrieval pipeline's arguments and outcomes; the owning-turn metering contract `admission: "external"`).
- The authorization model is preserved: tool allowlist × surface restrictions × RBAC × plan entitlement × tenant execution context; public/embed surfaces must not gain broader tool exposure; authorization failures are deterministic and fail closed.
- The Final State Contract, status vocabulary, and evidence classes ([developer-reported] vs [architect-verified]) per `VERIFICATION_STATE.md`; Phase 7 is not claimed `PASS`/`CLOSED`; 7-B is not claimed complete before architect review.

## Security constraints

- No secrets, credentials, or access tokens written anywhere (R-5 token never reproduced); tools receive capability abstractions, never raw secrets — the Phase 7-A secrets adapter boundary (`transferPolicy: "never"`) is untouched.
- No private chain-of-thought — observable evidence only.
- Tenancy: every invocation requires the mandatory tenant-scoped `PlatformExecutionContext` (orgId + kbId non-blank; fail-closed; no ambient fallback); tenant identity is carried through to the underlying retrieval unchanged; forged frozen lookalike contexts are rejected by the reused 7-A provenance boundary.
- Immutable-source boundaries: the four Doable trees never modified (D-007); no runtime import of Doable source from `src/**`.
- Production-branch restrictions: no work on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main` (D-008); no deployment; `vercel.json` untouched; `b65725e5` untouched.

## Testing requirements

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | Registry: registration, duplicate handling, listing, lookup, invalid definitions rejected, schema validation | `npx vitest run src/modules/ai-platform-core/tool-registry.test.ts` | all pass |
| 2 | Invocation: valid invocation; mandatory ExecutionContext; invalid/forged context; unknown tool; unauthorized surface; unauthorized role; insufficient entitlement; invalid arguments; normalized success; normalized typed error | `npx vitest run src/modules/ai-platform-core/tool-registry.test.ts` | all pass |
| 3 | Tenant isolation: tool execution scoped to the caller's context | `npx vitest run src/modules/ai-platform-core/tool-registry.test.ts` + `clara-tools.test.ts` | all pass |
| 4 | `rag_search`: registration; invocation; valid tenant/KB context; authorization behavior; result normalization; error behavior; parity vs the existing direct implementation | `npx vitest run src/modules/ai-platform-core/clara-tools.test.ts` + `clara-runtime.test.ts` | all pass |
| 5 | Metering: the approved hook invoked with correctly scoped context; hook failure never breaks the invocation | the same suites | all pass |
| 6 | Streaming: the normalized event contract (paired started→terminal events; no events for pre-execution refusals; sink failure tolerance) — WITHOUT provider tool calling | `npx vitest run src/modules/ai-platform-core/tool-registry.test.ts` | all pass |
| 7 | Focused module suite | `npx vitest run src/modules/ai-platform-core/` | all pass |
| 8 | Full suite | `npx vitest run` | all pass, zero regressions |
| 9 | Typecheck | `npx tsc --noEmit -p tsconfig.typecheck.json` | the 19 pre-existing application-code errors unchanged (exact before/after count; NOT claimed fixed — I-015); zero new errors |
| 10 | Lint | `npx eslint src/modules/ai-platform-core/` | 0 errors, 0 warnings |
| 11 | Model-config validation | `npm run validate:model-config` | PASS |
| 12 | Governance validators | the two deterministic scripts | 8/8 exit 0; 24/24 exit 0 |
| 13 | Library integrity | `node verification/validate-library.mjs` (from `docs/doable-source/`) | PASS |
| 14 | Immutable-source verification | `git diff 03482584 --stat -- <four trees>` (empty); tree OIDs vs baseline; the worktree blob verifier | empty diff; OIDs identical; 771/771 byte-verified; the 31 absent files confined to `mcp-servers/` (I-014 unchanged) |
| 15 | Runtime Doable-import scan | `src/**` import scan | zero matches |
| 16 | Secret scan | pattern scan over changed paths | no matches |
| 17 | Changed-path scope check | `git status` / `git diff --stat` / `git diff --name-only` | explainable entirely by the authorized 7-B scope |
| 18 | Production-branch reference check + `vercel.json` unchanged | `git rev-parse` refs; `git log -1 -- vercel.json` | refs unchanged; `vercel.json` untouched |

Do not weaken existing tests to make the suite pass.

## Acceptance criteria (pass/fail)

1. The Phase 7-A seam is preserved (not replaced, bypassed, weakened, or duplicated) and 7-B is built on top of it — PASS/FAIL.
2. The 7-B runtime provides the plan-defined capabilities (ToolDefinition; zod validation; registry; registration; listing/discovery; invocation; mandatory ExecutionContext; per-tool authorization hook; existing RBAC/entitlement integration; result normalization; typed error normalization; streaming tool-event types; usage-metering hooks) — PASS/FAIL.
3. The `rag_search` migration is behavior-preserving (the required pipeline; the unchanged list: tenant isolation, orgId/agentId/kbId/userId/sessionId, session context, retrieval semantics, Qdrant/Clara KB behavior, authorization boundaries, public/embed restrictions, existing usage accounting) — PASS/FAIL.
4. Fail-closed behavior is proven for every required rejection case (missing orgId; missing agentId where required; missing kbId where required; missing user/session identity where required; invalid/untrusted contexts incl. forged lookalikes; unauthorized surface; unauthorized role; insufficient plan entitlement); no permissive fallback — PASS/FAIL.
5. The Phase 7-A adapter registry's immutability guarantees are preserved; no mutable global adapter state; no ad-hoc adapter instances outside the approved registry — PASS/FAIL.
6. The authorization model (allowlist × surface × RBAC × plan entitlement × tenant context) is enforced deterministically and fail-closed; public/embed surfaces did not gain broader tool exposure; the existing `rag_search` exposure remains behaviorally equivalent — PASS/FAIL.
7. Metering: the hook/interface is exposed and invoked with correctly scoped context; no new billing/usage subsystem; no tables; no migrations; no Supabase schema changes — PASS/FAIL.
8. Streaming tool events: the normalized contract is implemented and proven; NO 7-C work (no provider tool-calling, no agentic loop, no bounded iteration, no tool-calling provider APIs; the OpenAI provider's tool-calling surface and other providers untouched) — PASS/FAIL.
9. Production routes are unchanged (`src/app/api/**` untouched); the incumbent `ai-core` layer is unmodified — PASS/FAIL.
10. The immutable Doable source is byte-unchanged; no runtime Doable import from `src/**`; I-014/I-015 remain OPEN (the 19 pre-existing typecheck errors not claimed fixed) — PASS/FAIL.
11. Zero new runtime dependencies; zero database changes; zero deployment actions; `vercel.json` untouched — PASS/FAIL.
12. Validation evidence is real and recorded (actual results; pre-existing failures reported exactly as such, demonstrated pre-existing) — PASS/FAIL.
13. Governance records distinguish `IMPLEMENTATION AUTHORIZED / IN PROGRESS` (7-B) from `PASS — CORRECTION VERIFIED — CLOSED` (7-A) and `NOT AUTHORIZED` (7-C); Phase 7 remains `IN_PROGRESS`; no completion claim before architect review; historical records append-only — PASS/FAIL.

## Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; push normally; no force-push; no production-branch work.
- One focused implementation commit (or a tightly bounded set only if technically necessary): `feat: implement phase 7-b unified tool runtime` — the immediate child of `a2c74204cd793758444a6f5e307c2921014e8c90`; application changes confined to `src/modules/ai-platform-core/**`; documentation changes confined to the repository-root `worklog.md` and `docs/project-control/**`; no unrelated cleanup; no formatting-only touches to unrelated files.
- Before committing: inspect `git diff --stat`, `git diff --name-only`, `git diff` — the final changed-path set must be explainable entirely by the authorized 7-B scope.
- After pushing: verify HEAD == `origin/feature/ai-core-from-doable-source` and a clean worktree.

## Evidence requirements

Per Part I §I.7: exact changed files; implementation summary; tests run; validation commands and their actual outputs/results; Git status (clean/in-sync) and the implementation commit SHA; remaining issues (I-014/I-015 OPEN — the 19 pre-existing typecheck errors reported exactly as pre-existing); remaining risks; deviations from scope (if any); unresolved questions (if any); security/tenancy considerations; no migration/deployment details (none applicable — zero migrations, zero deployments); explicit confirmation that no later phase was started (7-C NOT AUTHORIZED, not started). The mandatory final report fields are those in the architect's handoff §20.

## Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.** The Phase 7-B implementation report is developer evidence only; only the architect may subsequently accept 7-B, require correction, or authorize 7-C. 7-B must not be marked complete before architect review; Phase 7 must not be claimed `PASS` or `CLOSED`.

## STOP boundary

After implementation and validation are complete: commit the 7-B implementation; push normally; verify HEAD == origin and a clean worktree; produce the implementation report with actual validation evidence; clearly list any failures or environmental blockers; then **STOP**. Do NOT begin 7-C; do NOT fix unrelated issues after the implementation; do NOT perform deployment; do NOT continue into MCP/integrations/agent runtime. This STOP boundary is mandatory (Part I §I.9): until a new architect-issued handoff arrives, Z.AI must not start the next phase, implement unrelated improvements, make architectural decisions outside the handoff, deploy, modify production, or silently expand scope.
