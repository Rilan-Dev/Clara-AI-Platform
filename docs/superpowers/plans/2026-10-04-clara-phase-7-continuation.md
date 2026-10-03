# Clara AI Platform — Phase 7 Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Continue the Clara AI Platform program from the closed Phase 7-B baseline toward a reusable, provider-agnostic AI platform without changing the immutable Doable source or weakening the established governance boundaries.

**Architecture:** `src/modules/ai-platform-core/**` is the canonical Clara-owned active platform seam; `src/modules/ai-core/**` remains the incumbent provider layer. The vendored Doable trees are immutable reference material, while `clara-core/` and top-level `ai-platform-core/` remain non-runtime extraction/reference snapshots. Phase 7-C is executed as a bounded, feature-flagged provider tool-calling pilot followed by a bounded agentic loop; MCP, integrations, memory, skills, first-class billable tool metering, deployment, and schema redesign remain outside this plan.

**Tech Stack:** Next.js 15.5.24, TypeScript, Vitest, Zod, existing Clara AI provider/RAG/auth/entitlement infrastructure.

**Spec:** `docs/project-control/PHASE-7-PLAN.md`

## Global Constraints

- GitHub repository state is authoritative.
- Work only on `feature/ai-core-from-doable-source`; never modify `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main` directly.
- `docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**`, and `doable-source-extensions/**` remain byte-for-byte immutable.
- `src/modules/ai-platform-core/**` is the canonical active Clara AI-platform seam; do not duplicate the incumbent `src/modules/ai-core/**` provider layer.
- D-023 remains binding: tool invocation telemetry is audit-only; do not add a TOOL usage kind, add query_events, change rag_search accounting, or design billable tool metering in this plan.
- No database migration or schema change.
- Provider tool calling and the agentic loop are feature-flagged and default-off; existing routes/providers retain their current behavior when disabled.
- MCP, integrations, memory, skills, attachments, image generation, marketplace, deployment, and Phase 8 are not part of this plan.
- Every task is TDD-first, independently verified, and committed.
- Governance/worklog/session records are updated for every authorized implementation boundary.

## Review Focus

1. Disabled feature flags must produce exactly incumbent behavior and no provider tool calls.
2. Tool-call loops must terminate deterministically at a hard iteration bound and never recurse indefinitely.
3. Tool calls must execute only through the provenance-verified Unified Tool Runtime; no direct bypass is permitted by the pilot path.
4. Provider failures and malformed tool-call payloads must become typed, bounded failures without leaking secrets or tenant data.
5. Existing rag_search quota/billing semantics must remain unchanged because its runtime admission remains external to the Unified Tool Runtime.

### Task 1: Canonical reusable-core roles and execution authorization

**Files:**
- Create: `docs/superpowers/plans/2026-10-04-clara-phase-7-continuation.md` (this plan)
- Modify: `docs/project-control/DECISIONS.md`
- Modify: `docs/project-control/PROJECT_STATE.md`
- Modify: `docs/project-control/CURRENT_PHASE.md`
- Modify: `docs/project-control/NEXT_ACTION.md`
- Modify: `docs/project-control/ISSUES.md`
- Modify: `docs/project-control/VERIFICATION_STATE.md`
- Modify: `docs/project-control/ZAI_HANDOFF.md`
- Modify: repository-root `worklog.md`
- Create/modify: `docs/project-control/sessions/SESSION-022.md` and its README index

**Interfaces:** Records A4 core roles, the I-015 bounded infrastructure disposition, the bounded first-consumer decision, and the 7-C authorization boundary. No runtime code is changed.

- [ ] Append D-024: `src/modules/ai-platform-core/**` is the canonical active implementation; `docs/doable-source/**` is immutable reference; `clara-core/**` and top-level `ai-platform-core/**` are reference/extraction snapshots and are not runtime dependencies.
- [ ] Append D-025: I-015 is authorized as a bounded dependency/lockfile infrastructure operation only; no product logic or schema changes.
- [ ] Append D-026: the first Unified Tool Runtime consumer is a default-off internal pilot; production incumbent routes are unchanged while the flag is disabled.
- [ ] Append D-027: Phase 7-C is authorized only for additive provider tool-calling plus a hard-bounded agentic loop behind explicit feature flags; no MCP/integrations/billable metering.
- [ ] Reconcile all canonical state documents and append the session/worklog evidence without rewriting historical entries.
- [ ] Verify governance validators before commit.
- [ ] Commit: `docs: authorize phase 7 continuation boundaries`.

### Task 2: Resolve I-015 with a deterministic lockfile refresh

**Files:**
- Modify: `package-lock.json` only as dependency metadata required to make `package.json` and the lockfile consistent.
- Do not modify application source, migrations, Vercel configuration, or immutable/reference trees.

**Interfaces:** The package manifest already declares `@vercel/functions ^3.9.9`; the lockfile must contain the corresponding root dependency and resolved package metadata.

- [ ] Write a verification script/test asserting the root manifest dependency is represented in the lockfile and the package entry has a resolved version/integrity record.
- [ ] Run the check before the refresh and record the expected failure.
- [ ] Regenerate the lockfile using the repository's npm workflow, without upgrading unrelated dependencies.
- [ ] Run the check again and require PASS.
- [ ] Run the existing typecheck and confirm the prior seven missing-module cascades disappear; any remaining errors must be classified against the pre-refresh baseline.
- [ ] Run the relevant AI-platform tests, lint, model-config validation, immutable-source verification, and governance validators.
- [ ] Append evidence to worklog/session/control state.
- [ ] Commit: `fix: reconcile vercel functions lockfile`.

### Task 3: Build the bounded first-consumer pilot

**Files:**
- Modify: `src/modules/ai-platform-core/**` only where the pilot adapter/consumer belongs.
- Create/modify colocated tests.
- Modify the selected existing transport only through a default-off feature flag; no behavior change when disabled.

**Interfaces:** Consume the existing `ToolRuntime` invocation contract and preserve `rag_search`'s external admission semantics. Produce a provider-facing tool-call bridge that can translate normalized provider tool calls into Unified Tool Runtime invocations and return normalized tool results.

- [ ] Write failing tests for disabled mode, allowed tool-call translation, provenance enforcement, malformed calls, and deterministic denial.
- [ ] Implement the minimal provider-neutral bridge.
- [ ] Verify all tests RED→GREEN.
- [ ] Verify the pilot is unreachable when the feature flag is disabled.
- [ ] Run the relevant existing realtime/chat regression suites and confirm no incumbent behavior changes.
- [ ] Commit: `feat: add bounded unified-tool consumer pilot`.

### Task 4: Add provider tool-calling surface

**Files:**
- Modify: `src/modules/ai-core/types.ts`
- Modify: only the provider implementation(s) explicitly selected by the pilot, initially OpenAI.
- Create/modify colocated tests.

**Interfaces:** Extend the existing chat stream contract additively with normalized tool-call/tool-result events and optional tool definitions. Existing callers that do not provide tools remain unchanged.

- [ ] Write failing tests for optional tool definitions, tool-call event normalization, text-only regression, and provider error normalization.
- [ ] Implement additive OpenAI tool-calling support without changing the default path.
- [ ] Convert provider tool-call payloads into the Unified Tool Runtime contract.
- [ ] Run focused and existing provider tests.
- [ ] Commit: `feat: add optional provider tool calling`.

### Task 5: Add a hard-bounded agentic loop pilot

**Files:**
- Create: bounded loop module under `src/modules/ai-platform-core/**`
- Create: colocated tests
- Modify: pilot wiring only

**Interfaces:** Consume provider-neutral tool-call events and the Unified Tool Runtime. Produce bounded assistant/tool event sequences. Maximum iterations are explicit and enforced; no autonomous background execution.

- [ ] Write failing tests for one tool round-trip, multiple rounds, hard iteration cap, provider failure, tool failure, cancellation, and disabled flag.
- [ ] Implement the smallest loop that satisfies those tests.
- [ ] Verify the loop cannot recurse past the configured bound.
- [ ] Verify tenant/provenance context is preserved for every tool invocation.
- [ ] Run focused, full test, typecheck, lint, immutable-source, secret, model-config, and governance verification.
- [ ] Commit: `feat: add bounded agentic tool loop pilot`.

### Task 6: Whole-branch review and governance closure

**Files:**
- Modify only governance/session/worklog files needed to record final evidence.

**Interfaces:** No new runtime interfaces; review the complete Task 1–5 range against this plan and `PHASE-7-PLAN.md`.

- [ ] Perform a fresh-context-style whole-branch review against Review Focus.
- [ ] Re-grade all findings by runtime effect.
- [ ] Fix Critical/Important findings with RED→GREEN tests in one pass.
- [ ] Record deferred Minor findings explicitly.
- [ ] Run the complete verification matrix again.
- [ ] Update canonical state to the actual result; do not claim Phase 7 complete unless all remaining phase gates are satisfied.
- [ ] Commit the final governance record and push normally.
