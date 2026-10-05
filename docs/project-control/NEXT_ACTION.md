# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> Canonical continuation instruction. Snapshot: **2026-10-06 — Integrations I-2 implemented; verification pending.** GitHub repository state is authoritative. Current feature tip: **read from GitHub at recovery time; do not duplicate a mutable SHA here**.

## CURRENT AUTHORITATIVE ACTION

**I-2 is the active bounded work.** The repository already contains the I-2 implementation. The immediate job is verification and security correction only.

1. Obtain executable dependency/lock synchronization plus current-head build/test/typecheck/lint evidence.
2. Re-run the focused runtime redaction/store-isolation tests and integration registry/control-plane suites in that executable environment.
3. Use the already-verified 060/061/062 database state as Gate-E evidence; do not re-run migrations merely to manufacture evidence unless a clean-install verification is explicitly required.
4. Perform a bounded real connector/OAuth smoke where valid provider credentials/configuration are available, then browser-verify platform → organisation → agent access and denial paths.
5. Re-run immutable-source, runtime-import, secret and governance gates.
6. Perform I-2 Gate-D review. Only an explicit ChatGPT PASS closes I-2.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

---

## Read this first

Read, in order:
1. `docs/project-control/PROJECT_STATE.md`
2. `docs/project-control/CURRENT_PHASE.md`
3. `docs/project-control/VERIFICATION_STATE.md` — **current I-2 verification record**
4. `docs/project-control/ISSUES.md`
5. `docs/project-control/DECISIONS.md` — **D-032 and current I-2 decisions**
6. `docs/superpowers/plans/2026-10-05-clara-integrations-framework.md`
7. `docs/project-control/sessions/SESSION-033.md` and later I-2 verification/correction records

**Important:** the I-1 material below is historical checkpoint prose. It is **not** the active authorization. The active work is I-2 verification/correction under D-032.

## Historical I-1 record — non-authoritative

## Active work

**Integrations Framework — I-1: host-neutral contract/test foundation.**

D-031 authorizes only:
- `src/modules/ai-platform-core/integrations/**` contract/type definitions, pure validation helpers, tests, and exports;
- threat-model/test-boundary work necessary to validate the contract.

Forbidden until separately authorized:
- database/schema/migrations;
- OAuth routes/token exchange;
- credential-vault implementation;
- Activepieces runtime/dependencies;
- outbound HTTP/egress execution;
- integration tool execution;
- deployment;
- changes to D-023 billing semantics.

## Current checkpoint

- Implementation foundation exists.
- A contract hardening correction was applied after architect review: generic connection metadata and generic error-details bags were removed from the reusable boundary; connection-store/credential-vault APIs now identify concrete connection IDs.
- Focused I-1 CI verification has been added for Vitest, strict TypeScript, and ESLint.
- **Verification is still PENDING** because no GitHub Actions run is currently exposed through the connected GitHub integration for the feature head.
- No PASS is claimed for I-1.
- I-2 and all later integration work remain unauthorized.

## Next bounded action

1. Obtain executable I-1 verification from the repository's CI/Actions surface.
2. Re-run the focused contract tests, strict typecheck, and lint.
3. Re-check immutable-source integrity, runtime import boundary, secret scan, and scope.
4. Perform the architect Gate-D review of the exact verified commit.
5. If all required gates pass, record I-1 closure and issue the next explicit authorization boundary. Otherwise record the blocking finding and correct only within D-031 scope.

**Stopping boundary:** do not implement I-2, OAuth, persistence, credential storage, egress execution, integration actions, or deployment until ChatGPT explicitly authorizes the next bounded sub-phase.

## 2026-10-05 — I-1 correction checkpoint

The I-1 contract/test correction is complete at `bfc40f671aea218def571c617f00789e15b45823`. I-018 is RESOLVED by architect review.

**Next bounded action:** obtain executable CI evidence for the exact current head, then re-run the final I-1 Gate-D closure review. Until that evidence exists, I-1 remains open.

No I-2, OAuth transport, persistence, credential storage, egress execution, integration action runtime, deployment, or billing changes are authorized.


## Current next action — post Phase 7-C closure (2026-10-05)

Phase 7-C is **PASS — CLOSED**. Do not reopen or extend the bounded provider tool-calling/agentic-loop pilot without a new authorization. The next work item is an explicit project-owner decision, not automatic implementation: triage I-014, resolve pending D-P2/D-P4 decisions if needed, or authorize a separately scoped future phase. I-015 is resolved for the dependency/lockfile/environment condition. D-023 remains binding; first-class billable tool metering, MCP, integrations, deployment, and Phase 8 remain unauthorized unless separately authorized.

**STOP boundary:** no additional application implementation is inferred from the Phase 7-C closure.

## 2026-10-05 — Docker build-boundary correction checkpoint

A user-provided Docker build exposed I-019: Next.js type-checking traversed the immutable Doable reference tree and failed on its reference-only `@e965/xlsx` import. ChatGPT corrected the TypeScript inclusion boundary in `tsconfig.json` and `tsconfig.typecheck.json`, excluding only `ai-platform-core/**` and `clara-core/**` reference snapshots.

**Next bounded action:** execute the production build from the current feature head (`docker compose up -d --build` or equivalent CI `npm run build`). If the build passes, close I-019 with evidence; if it fails, correct only the newly evidenced build blocker without modifying immutable/reference material.

No reference-only dependency should be added merely to make the application build traverse an immutable snapshot.


## Current next action — 2026-10-05 — executable verification and browser readiness

The user-directed RBAC/UI continuation is implemented. Do not add more feature scope until verification catches up.

1. Execute the current-head focused I-1 contract tests, strict TypeScript, and ESLint in CI or the project build environment.
2. Execute the production build (`docker compose up -d --build` or equivalent) to close or correct I-019 after the reference-tree TypeScript exclusion.
3. Re-run immutable-source, runtime-import, secret, and governance checks at the exact verified head.
4. Browser-verify `/ai-platform` as a platform-admin surface and verify tenant-role navigation/redirect behavior.
5. Complete I-1 Gate-D closure review only after Gate C evidence exists; then issue the next explicit authorization if required.

**Stopping boundary:** no I-2 integration runtime, OAuth, persistence, credential vault, egress, integration action execution, MCP runtime, or deployment/promotion is authorized merely because the UI exists.


## 2026-10-05 — Current executable verification / browser readiness checkpoint

The requested UI/RBAC/subscription continuation is implemented. Role-aware navigation, agent workspace UI, team role management, live usage meters, Billing & Plan, and explicit entitlement visibility are present. A UI correction prevents project managers from being offered elevated organisation-role grants. Server-side authorization remains authoritative.

A concrete build dependency drift was corrected: package.json already declared @e965/xlsx 0.20.3, while package-lock.json lacked the corresponding package entry. The lock entry was added without modifying immutable/reference material. I-021 records this as CORRECTED — executable build pending.

Vercel clara-backend ignored-build-step was cleared to allow the feature branch to produce a preview on the next pushed commit. No production promotion is performed.

Next bounded verification: execute the current-head production build, current-head focused I-1 tests/typecheck/lint, immutable/runtime-import/secret/governance checks, then browser-verify /ai-platform plus role/redirect and plan-limit behavior. Do not extend into I-2 runtime, OAuth, persistence, egress, MCP, or unrelated deployment work.


## 2026-10-05 — Current RBAC/UI/build checkpoint

The requested role/permission and subscription UI work is implemented on the current feature head. Final source review corrected the least-privilege boundary: organisation admins may assign any defined organisation role; project managers may only grant/manage Editor and Viewer access; self-role changes are rejected. Server-side RBAC remains authoritative.

`@e965/xlsx@0.20.3` is now declared in the application manifest and synchronized in the lockfile. The immutable/reference trees were not changed. The user-provided Docker failure is therefore corrected at the application dependency boundary, but executable build evidence is still required.

**Pending:** current-head production build, current-head CI evidence, browser verification of `/ai-platform` and role/redirect/plan-limit behavior, and final I-1 Gate-D review. No I-2 runtime, OAuth, persistence, egress, MCP runtime, or production promotion is authorized.

## 2026-10-05 — Owner execution checkpoint
Current bounded work is verification, not feature expansion. Completed: UI/RBAC/subscription implementation and production Docker-build CI instrumentation. Pending: (1) executable current-head Docker build, (2) executable I-1 focused Gate-C evidence, (3) browser verification through draft preview PR #266 or equivalent local environment, and (4) final I-1 Gate-D review. Do not start I-2 runtime/OAuth/persistence/egress/MCP work or merge the preview PR as part of this checkpoint.


## UI/RBAC/Subcription checkpoint — 2026-10-05
Completed in current continuation:
- role-aware organisation navigation and direct-route guard;
- role capability contract tests;
- current versioned subscription-plan API wired into admin Plans UI;
- TTS/STT/translation daily limits exposed and persisted in plan versions;
- plan-guard fallback fixed for those limits.

Still pending before Phase 7-C closure:
1. Fresh CI run for the new UI verification job and changed subscription surfaces.
2. Reproduce immutable-source/library-integrity/secret/runtime-boundary closure gates.
3. Fresh-context review of all governance documents and compare against the Phase 7 authorization boundary.
4. Decide and record the repository-wide typecheck/lint baseline disposition; do not modify immutable/reference material merely to make global gates green.
5. Only after all closure evidence passes, perform the governance-only Phase 7-C closure update.

- Latest UI/billing changes are implemented. Pending work is verification-only: fresh CI, immutable/library/secret/runtime gates, then final Phase 7-C closure review.


## 2026-10-05 — Current owner checkpoint

The requested UI/RBAC/subscription implementation is complete. The Members UI role-assignment correction is committed; org_admin can assign all defined roles, while project_manager remains least-privilege constrained. Billing & Plan is enabled with live usage/limits and entitlement visibility.

**Pending only:** executable current-head CI/production-build evidence and browser verification. Vercel preview evidence is temporarily blocked by the provider daily deployment quota; do not use the older cancelled preview as current-head evidence. No I-2 integration runtime, OAuth, persistence, egress, MCP runtime, production promotion, or Phase 8 work is authorized.


## 2026-10-05 — Integrations I-2 implementation checkpoint

I-2 is IMPLEMENTED — VERIFICATION PENDING under D-032.

Next bounded actions:
1. Run npm install --legacy-peer-deps in the executable build environment to synchronize the 529 Doable Activepieces package dependencies and lockfile.
2. Execute the 052 integration migration and verify platform/org/agent connection persistence plus pgcrypto encryption.
3. Run registry tests and strict typecheck/lint for the integration runtime, API, AI tools, and UI.
4. Configure/test at least one real connector action using an organization/agent connection.
5. Browser-verify platform admin → organisation → agent integration access and denial paths.
6. Re-run immutable-source, secret, runtime-import, and governance checks, then perform I-2 Gate-D review.

Stopping boundary: no production promotion or claim of complete integrations until the above evidence exists.


## 2026-10-05 — I-2 database verification checkpoint

Current HEAD: `1ed4490e6266a6c52a4a307007c5c468714f9619`.

Completed: migrations 052, corrected 061, and 062 executed and verified; pgcrypto operational; I-2 agent/org constraints verified; six I-2 integration tables RLS-enabled and anon/authenticated access revoked.

Still required: executable npm/build/test/typecheck/lint evidence; focused runtime/API tests; real connector and OAuth smoke; current-head browser verification; immutable/runtime/secret/governance scans; final ChatGPT Gate-D review.

GitHub Actions current-head run 37301575945 failed without usable step logs, so no CI PASS is inferred.

STOP: no I-3/MCP expansion, production promotion, or unrelated work.
\n\n## 2026-10-05 — I-2 migration sequencing correction\n\nCompleted a bounded build-blocker correction: the integration control-plane migration was moved from the colliding 052 sequence to 060, while the pre-existing Sarvam 060 migration was moved to 064 so the integration sequence remains 060 → 061 → 062. Repository enumeration now reports no duplicate migration numbers.\n\nNext verification remains executable only: run the exact CI/build/test/typecheck/lint commands in an execution-capable environment, then perform connector/OAuth/browser/security/governance verification. No I-2 PASS is claimed until those gates execute successfully.\n

## 2026-10-05 — I-2 execution-path reconciliation

Completed: current-head branch reconciliation; current-head Vercel build attempt; confirmation that Cloud CI is restricted to Vercel-Prod push/PR events; no current-head build PASS inferred from the stalled Vercel attempt.

Remaining bounded verification is unchanged: obtain a completed executable current-head build/test/typecheck/lint result through an approved execution environment, then complete connector/OAuth/browser/security/governance checks and Gate-D. Do not create a broad PR merely to manufacture CI evidence: the feature branch is 724 commits ahead and 27 behind Vercel-Prod, so such a PR would be an unsafe validation shortcut.

## 2026-10-05 — Current authoritative I-2 next action

The control documents have been reconciled against GitHub. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**, not BLOCKED and not PASS.

Completed since the earlier checkpoint: runtime redaction hardening, organisation-scoped integration-store isolation, agent/org ownership enforcement, migration sequence correction, and database/RLS hardening. Gate-E is evidenced.

**Next bounded execution:** obtain executable dependency/lock synchronization and current-head build/test/typecheck/lint evidence; then perform the required connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-06 — Current owner continuation

The plan-to-implementation audit found and corrected I-033: the agent integration grant mutation now re-checks the organisation's current plan entitlement before enabling an integration. The correction is committed and recorded in ISSUES.md / VERIFICATION_STATE.md.

**Next bounded work remains executable verification:** current-head build/test/typecheck/lint evidence, focused I-2 runtime/API tests, real connector/OAuth smoke where valid credentials/configuration exist, browser access/denial verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review. Do not wait for GitHub Actions or Vercel before performing bounded source-level corrections. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Current owner continuation after I-034

I-2 remains IMPLEMENTED — VERIFICATION PENDING. ChatGPT completed another bounded plan-to-implementation correction: agent integration grants now enforce current plan entitlement only when enabling; disabling remains available after downgrade, with focused regression coverage (I-034). This does not close Gate-C or Gate-D.

**Next bounded work:** continue source-level I-2 review for concrete plan/implementation gaps without waiting for GitHub Actions or Vercel; prioritize credential/connection authorization, AI-tool exposure, runtime action validation, and tenant isolation. Then obtain executable test/typecheck/lint/build evidence, connector/OAuth smoke, browser verification, and final Gate-D review.

**Stopping boundary:** no I-3, MCP expansion, production promotion, or unrelated implementation.
