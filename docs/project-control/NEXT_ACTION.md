# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> Canonical continuation instruction. Snapshot: **2026-10-05 — Integrations I-1 contract foundation implemented; verification and architect review pending.** GitHub repository state is authoritative.

## Read this first

Read, in order:
1. `docs/project-control/PROJECT_STATE.md`
2. `docs/project-control/CURRENT_PHASE.md`
3. `docs/project-control/VERIFICATION_STATE.md` — current Integrations I-1 record
4. `docs/project-control/ISSUES.md`
5. `docs/project-control/DECISIONS.md` — D-031
6. `docs/superpowers/plans/2026-10-05-clara-integrations-framework.md`
7. `docs/project-control/sessions/SESSION-033.md`

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
