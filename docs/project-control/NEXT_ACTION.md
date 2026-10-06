# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> Canonical continuation instruction. Snapshot: **2026-10-06 — Integrations I-2 implemented; verification pending.** GitHub repository state is authoritative. Current feature tip: **read from GitHub at recovery time; do not duplicate a mutable SHA here**.

## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] Source review found that Activepieces cross-integration credential lookup could bypass the I-054 execution authorization boundary. `DoableConnectionsManager.get()` now re-checks platform enablement, current plan entitlement, organisation grant, explicit agent scope, and tenant ownership before reading another integration's credentials.

- Implementation: `3a17c31cb16bfa54cb79a48a13a757ae16486971`
- Regression: `4f86976b505487906d18e526b6433be360e97a8b`
- I-055: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-056 execution authorization fail-closed correction

[architect-verified] Source review found that the I-2 execution authorization boundary called the UI-oriented `getOrgPlanLimits()` helper, which converts plan-resolution/database failures into free-plan limits. That fallback could allow an integration permitted to the free plan to execute without proving the organisation's actual entitlement. The bounded correction now calls `resolveOrgPlanLimits()` directly and denies execution when entitlement resolution fails.

- Implementation: `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`; type correction: `9ac86755c94132a86afbde804a7ca3b927e0e83b`
- Regression: `220d1a66fe7279bb55296d31d5f9d5c3133b78ef`
- I-056: RESOLVED by architect source review.
- Next bounded work: continue I-2 credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## CURRENT AUTHORITATIVE ACTION

## 2026-10-06 — I-050 AI availability tenant-binding correction

[architect-verified] Source review found that the AI-visible integration availability query filtered agent grants by agent identity but did not verify that the agent belongs to the execution tenant. The bounded correction now joins `agents` and requires `a.org_id = context.tenantId` before exposing integration capabilities.

- Implementation: `c9f71d7e776e0127d587d08e03132579c5ac9fad`
- Regression: `c122dfab4a1deee1d3b40614cc8cb993f7812d56`
- I-050: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-049 atomic integration mutation correction

[architect-verified] The next bounded I-2 source correction closed a concurrency/partial-mutation defect in organisation integration enable/connect. `withTransaction()` now covers the entitlement count and mutation, and a transaction-scoped advisory lock serializes per-organisation integration-slot changes. Direct connect no longer leaves an enabled organisation grant behind if connection persistence fails.

- Implementation commits: `0f55d11dfc612b293fcf9046cb6d99c25451cdf9`, `cd35659c8b286dd89d6ba325307ce734cfe0b2dc`
- Regression: `ccd1fb2d7ba0b06d1ebace779aea7854e9e034df`
- I-049: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-048 auth-type authority correction

[architect-verified] Source review found that runAction selected OAuth token-refresh behavior from the stored connection auth_type, while the connection API accepts authType input. Commit 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126 now uses the authoritative integration registry def.authType for ensureTokenFresh, preventing a mismatched connection field from suppressing OAuth refresh. I-048 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-047 owner continuation: direct-connection plan-limit correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review found that organisation-level connect could implicitly enable a previously-disabled integration without enforcing max_integrations. The bounded correction is committed at 846c8d39add3430a5014c5573b3cc4d5ad86ee37 with focused regression coverage 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is resolved by architect source review.

**Next bounded work:** continue source-level I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review without waiting for GitHub Actions or Vercel. Then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


**I-2 is the active bounded work.** The repository already contains the I-2 implementation. The immediate job is verification and security correction only.

1. Obtain executable dependency/lock synchronization plus current-head build/test/typecheck/lint evidence.
2. Re-run the focused runtime redaction/store-isolation tests and integration registry/control-plane suites in that executable environment.
3. Use the already-verified 060/061/062 database state as Gate-E evidence; do not re-run migrations merely to manufacture evidence unless a clean-install verification is explicitly required.
4. Perform a bounded real connector/OAuth smoke where valid provider credentials/configuration are available, then browser-verify platform → organisation → agent access and denial paths.
5. Re-run immutable-source, runtime-import, secret and governance gates.
6. Perform I-2 Gate-D review. Only an explicit ChatGPT PASS closes I-2.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

---

## 2026-10-06 — I-2 owner continuation: redirect egress hardening

I-2 remains the active bounded work. A second security correction was implemented without waiting for GitHub Actions or Vercel: the generic integration HTTP runner no longer follows redirects implicitly, preventing an unchecked 3xx Location from bypassing the host egress/SSRF boundary. I-036 is resolved by source review; focused regression coverage was added. Executable Gate-C evidence remains pending.

- Runner correction: `e2a9131d04d567a79c3f3531e1cff63b60d5a81d`
- Regression tests: `452a998076fef63e97f08c804b9ab6e216daa7f6`
- I-036: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/corrections only; do not expand to I-3/MCP/production.

## 2026-10-06 — I-2 owner continuation: trace-redaction hardening

I-2 remains the active bounded work. A concrete security correction was implemented without waiting for GitHub Actions or Vercel: trace payloads are now fully redacted before truncation, closing the late-field credential exposure found as I-035.

- Implementation: `f6b9f5f89a476743e48610b5dcc4d8d678ff6366`
- Regression test: `710565d1de3aa0a9bd96ea651f2c0be8ff7eaa1c`
- I-035: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/corrections; do not expand to I-3/MCP/production.
## 2026-10-06 — I-2 owner continuation: action-context scope hardening

I-2 remains the active bounded work. A source audit after the I-037 runner credential-scope correction found the same project/agent conflation inside the Activepieces action context: store and cross-integration connection-manager adapters were still receiving projectId. This was corrected without waiting for CI/Vercel.

- Context correction: a5680cd51c6d9ca961ab93effd20fb069d0e2bbe
- Runner propagation: f3bd397dbbc7c0ddb8674b8b3c97358be8fa8a11
- Regression test: 550b751b745d7a8a4a52854edc1cc328d7c891b2
- I-040: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/security review only; do not expand to I-3/MCP/production.

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


## 2026-10-06 — Current owner continuation after I-037

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review identified and corrected I-037: the integration runner had been passing `projectId` into the credential vault's agent-scope parameter. The runner now carries an explicit `agentId` field and no longer conflates project and agent identity.

- Correction commits: `8cad5e6759e79dfe54729257b68bc719319e7161`, `54fa672ce7e1df29d97cc2fbc5589403c5682ab0`.
- I-037: RESOLVED by architect source review.
- Next bounded work: continue I-2 source review for concrete credential/connection authorization, AI-tool exposure, action-input validation, and tenant-isolation gaps; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: known-secret trace redaction

I-2 remains the active bounded work. Without waiting for GitHub Actions or Vercel, ChatGPT identified a remaining telemetry hardening gap: redaction was pattern/key based but did not scrub the exact credential values already resolved for an integration when a provider echoed them under a non-sensitive field name or plain text.

- Implementation: `d288975526e40a67e4c22cdc402760f1ca6649af`
- Runner call-site propagation: `1a19b95d10c03b9b4e8128628846827cf2b1676f`
- Focused regression tests: `750e5da08150c1f09be0fb8db232413df23df25b`
- I-038: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next: continue only bounded I-2 verification/security corrections; do not expand to I-3, MCP, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: OAuth refresh redirect hardening

I-2 remains the active bounded work. Without waiting for GitHub Actions or Vercel, ChatGPT found that the credential-bearing OAuth token refresh request used default fetch redirect behavior after checking only the initial token endpoint.

- Implementation: `fddf00ca3c5cea63daa5c4146ae212908deb205a`
- I-039: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next: continue only bounded I-2 verification/security corrections; do not expand to I-3, MCP, production promotion, or unrelated implementation.


## 2026-10-06 — I-041 post-refresh credential scope correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. The source audit found one remaining project/agent conflation after the I-037/I-040 corrections: the post-OAuth-refresh credential refetch still passed projectId into the agent-scoped credential-vault parameter.

- Correction: `1001819239fcba146061be84c35254a8a9fb30cb`
- I-041: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

**Next bounded work:** continue only I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation, and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-042 Unified Tool Runtime project-scope correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. The source audit found the Unified Tool Runtime integration_action bridge was fabricating a project scope by assigning agentId to RunActionParams.projectId. The host execution context defines agentId but no projectId.

- Correction: `3305c9027ddcef4fff0520d941dfebc73f9ef94a`
- I-042: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

**Next bounded work:** continue only I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation, and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-043 owner continuation

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review corrected the AI-visible integration tool boundary: agent integration grants are now bound to the execution tenant through the authoritative `agents.org_id` relationship, and focused regression coverage rejects a cross-tenant agent before `runAction`. The existing I-042 project/agent scope correction remains intact.

- I-043: RESOLVED by architect source review.
- Correction commits: `870ac568d050a8a6f54c347684a1b6e4fe9015ca`, `b5a744cc57135e2e8f1037f7396c56ed57bc3656`, `26f0f5fd00d47641598854e0cbb813ac049b7459`.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.
## 2026-10-06 — I-2 owner continuation: bounded runner correctness correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the current runner helper and found a bounded correctness defect in the ElevenLabs custom action: its 3xx failure path emitted an OAuth-refresh-specific error even though it was the ElevenLabs transport. The transport already fails closed on redirects; the correction only restores the correct action-specific error semantics.

- Correction commit: `499feacf01907f82da9578b74cb8789931d10752`
- Scope: `src/modules/integrations/runtime/runner-helpers.ts` ElevenLabs TTS redirect handling only.
- No OAuth callback/transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor.
- **Next:** continue bounded I-2 security/correctness review and implementation corrections; then obtain executable Gate-C evidence, connector/browser checks, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated feature work.

## 2026-10-06 — I-2 owner continuation: credential-value error-boundary hardening

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the runner's final error boundary and found that provider error text could bypass value-based credential redaction when a provider echoed a resolved secret under a non-sensitive field name or plain-text message.

- Correction commit: `a8a1997f958c37b524451618eb0d3bb4a3746b5f`
- Scope: `src/modules/integrations/runtime/runner-core.ts`; retain resolved credential values for the request lifetime and apply value-based redaction to the final runner error before XRay, usage logging, and the returned error.
- No new provider, OAuth callback/transport, MCP, billing, migration, production promotion, or unrelated feature work.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next:** continue only bounded I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-2 owner continuation: final error credential-value redaction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. A bounded source correction was applied without waiting for GitHub Actions or Vercel: the runner now preserves the resolved credential values for the active execution and applies value-based redaction at the final error boundary. This prevents provider-echoed credentials under non-sensitive field names from reaching returned errors, XRay, or usage logging.

- Correction commit: `ca2394e85e191a709f774a083137798e2cf90dc8`.
- Scope: I-2 runtime security/observability only.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next: continue bounded I-2 verification/security review; do not expand to I-3, MCP, production promotion, or unrelated work.


## 2026-10-06 — I-2 owner continuation: organisation downgrade-unwind correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT audited plan-entitlement symmetry and found I-045: the organisation integration POST route blocked `disable` after a plan downgrade because it evaluated current plan entitlement before branching on the requested action.

- Correction: `4c653b18c488661a9000f21f73344ce90d669b1a`.
- Regression test: `289bb2a9dc8d40532479c62980f0ab110a600849`.
- I-045: RESOLVED by architect source review.
- `enable`/`connect` remain entitlement-gated; `disable`/`disconnect` remain available for downgrade unwind.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next bounded work:** continue I-2 executable verification and only further concrete I-2 corrections; then connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: AI availability plan-entitlement correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT audited the AI-visible integration discovery boundary and found I-046: `integration_availability` exposed platform/org/agent-enabled integrations without applying the organisation's current plan allowlist.

- Correction: `48a55826f4c45fe71c891bd68f71075fc363f8fc`.
- Regression test: `b3d090a1644d1982e1709d095458db9c593a5d42`.
- I-046: RESOLVED by architect source review.
- `integration_availability` now filters by current plan; `integration_action` remains independently fail-closed.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next bounded work:** continue I-2 executable verification and only concrete I-2 corrections found by source review; then connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: project/tenant scope separation
I-2 source review found that buildActionContext() still defaulted project.id to workspaceId when no explicit project identity was supplied, despite the ratified I-037 separation of project and agent/tenant scope. ChatGPT corrected this bounded defect at 59e8d360180a6458d4b965406829185fc6224785; focused regression coverage is 327740e9aec6d0bf0b0260af717a344b03e3d8ed. I-051 is recorded RESOLVED by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
**Next bounded work:** continue I-2 source-level credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: telemetry schema + fail-closed entitlement corrections

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.

[architect-verified] Two concrete plan-to-implementation gaps were corrected without waiting for GitHub Actions or Vercel:
- I-052: integration usage telemetry now matches the existing `integration_usage_log(org_id, agent_id, ...)` schema instead of attempting the non-existent `workspace_id` column.
- I-053: malformed/null platform `allowed_plans` now fails closed on AI execution, organisation enable/connect, and agent enable rather than bypassing entitlement checks.

Focused regression source was added for both corrections.

**Next bounded work:** continue I-2 source-level authorization/connection, action-input, tenant-isolation, egress, and secret review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Vercel deployment blocker checkpoint

[architect-verified] Deployment `dpl_2zSX7vRmLwJUDYXRdnE1YpeD1noL` failed before application compilation because `npm ci --legacy-peer-deps --include=dev` rejected an unsynchronized `package.json` / `package-lock.json`, with the newly declared `@activepieces/*` family missing from the lockfile. Bounded correction `3d87c000b7f3bdee337d524eeb06718094ebeb84` changes Vercel's install command to `npm install --legacy-peer-deps --include=dev` so the declared dependency graph can be resolved while strict lock synchronization remains open. A clean `npm install --package-lock-only` attempt in a Vercel sandbox ran ~13.8 minutes and failed; no generated lockfile was accepted. Fresh Vercel deployment is currently blocked by the team's `api-deployments-free-per-day` quota. Do not claim build success until a fresh deployment is actually observed. See `SESSION-049.md`.


## 2026-10-06 — I-054 runner execution-authorization correction

[architect-verified] The I-2 runner now re-checks the authoritative integration execution boundary immediately before custom or Activepieces action execution. This closes the stale-authorization/direct-runner bypass identified in I-054.

- Runtime correction: `2d2383a196d83fba26dd93a4b4a1ec2ecec31207`
- Authorization module: `facb32c99b5fc9bcdd0d05900e0a92bdf9c60e6d`
- Regression coverage: `e4110290c8cfa57c1f5357eaf4f57c719785a4ee`
- I-054: RESOLVED by architect source review.
- Gate-C remains OPEN/MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then current-head executable verification, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-057 OAuth refresh disable-race correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, source review found I-057: an in-flight OAuth refresh could re-persist credentials with status='active' after a connection had been disabled, and the runner did not explicitly fail closed if the post-refresh active connection disappeared.

- Corrections: `a8e66489e57d84326e63b56b86914ba3b5ea3cf3`, `ac8d4bf5388c1cf993a9355c3032e8c8d090782f`.
- I-057: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection authorization and egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-058 custom integration egress/redirect correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review found native fetch paths in custom ElevenLabs and Supabase actions bypassing the generic egress/redirect boundary. The bounded correction adds explicit host egress checks and manual redirect handling for those credential-bearing requests.

- Corrections: `d4e3a44956da9f377be7afcd8b7a012b54a6c944`, `434316d642c26f7d088e216d0b91407049a16d57`.
- I-058: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level authorization, credential, egress and secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.
