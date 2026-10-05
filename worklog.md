
## 2026-10-06 — I-048 auth-type authority correction

[architect/ChatGPT] Continued bounded I-2 credential-lifecycle review without waiting for CI or Vercel. Found that runAction used connection.auth_type to decide OAuth refresh, even though the integration registry is the authoritative contract and the connection API accepts authType input. Corrected runAction to pass def.authType into ensureTokenFresh. Commit: 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126. I-048 is architect-resolved by source review; executable Gate-C evidence remains pending.


## 2026-10-06 — I-047 direct-connection plan-limit correction

[architect/ChatGPT] Continued the bounded I-2 plan-to-implementation review without waiting for CI or Vercel. Source review found that the organisation integration connect path checked current plan entitlement but could implicitly enable a previously-disabled integration without applying max_integrations. Corrected the POST control path so connect enforces the integration-count limit only when it would consume a new organisation slot; connections to an already-enabled organisation integration remain allowed. Implementation commit: 846c8d39add3430a5014c5573b3cc4d5ad86ee37. Focused regression: 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is architect-resolved by source review. Gate-C remains pending executable evidence; no I-2 PASS is claimed.


Current status: **IMPLEMENTED — VERIFICATION PENDING** because the connected GitHub integration has not exposed an Actions run for the current feature head. No PASS is claimed.


---

## 2026-10-05 — Integrations I-1 contract hardening and verification checkpoint — `IN_PROGRESS`

| Field | Content |
|---|---|
| Authorization | D-031 — host-neutral Integrations Framework contracts/test foundation only |
| Implementation | [developer/ChatGPT] I-1 contracts, focused tests, and platform-core export were implemented. Architect review identified two boundary weaknesses: generic connection metadata and generic error-detail bags could become secret-bearing surfaces, and connection-store/credential-vault operations were ambiguous for multiple connections. |
| Correction | [developer/ChatGPT] Removed generic metadata/details bags and changed connection lookup/disconnect/credential-handle operations to use concrete connection IDs. Added compile-time negative tests for the forbidden secret-bearing fields. |
| Verification | [architect-verified] Scope remains within D-031. Database/deployment gates are NOT_APPLICABLE. Focused I-1 Vitest/typecheck/lint verification was added to CI, but no Actions run is currently exposed through the connected GitHub integration, so Gate C remains MISSING. |
| Review | [architect-verified] Gate D review completed with `PASS_WITH_FOLLOWUP`: the corrected contract is architect-reviewed, but I-1 cannot close until executable verification is observed. |
| Current status | **IMPLEMENTED — VERIFICATION PENDING**. No I-2 or later integration work is authorized. |
| Next action | Obtain executable I-1 CI evidence, then perform final Gate-D closure review and either close I-1 or issue a bounded correction. |


## 2026-10-05 — Integrations I-1 threat model — verification still pending

D-031-authorized scope now includes the I-1 trust-boundary artifact `src/modules/ai-platform-core/integrations/integration-threat-model.md`. [developer/ChatGPT] The document maps credential, OAuth, tenancy, egress, tool-bridge, and telemetry boundaries and records the stopping boundary for I-1. No runtime integration, persistence, OAuth transport, outbound HTTP, deployment, or billing behavior was added. [architect-verified] I-1 remains open pending executable Gate-C evidence; I-2 remains unauthorized.


## 2026-10-05 — Integrations I-1 — I-018 correction and verification boundary

ChatGPT architect review found a concrete contract/test mismatch before I-1 closure: the test still constructed a removed generic connection `metadata` bag; the execution-result error contract still exposed generic `details`; and the test omitted the result type import. This was recorded as I-018 (P1) and corrected within D-031 scope.

Correction commits:
- `b13e74487a5874b8b070da8ade97963e3f63f0d5`
- `bfc40f671aea218def571c617f00789e15b45823`

Architect verification confirms the correction diff is limited to the two authorized I-1 contract/test files. Gate C remains MISSING because no executable Actions run is exposed for the current feature head. I-1 therefore remains IMPLEMENTED — VERIFICATION PENDING; no closure is claimed. [architect-verified]


## 2026-10-05 — Integrations I-1 current-state architect review

ChatGPT independently re-read the current I-1 contract/test/threat-model state at the feature-branch tip `d9705441`. The corrected contract at `bfc40f67` is an ancestor of the current tip and removes the previously identified generic metadata/error-detail bags; concrete connection IDs and opaque credential handles remain enforced; the Unified Tool Runtime remains the only execution bridge. **Gate D: PASS_WITH_FOLLOWUP** for the corrected contract boundary. **Gate C remains pending** because the connected GitHub Actions surface exposes no workflow run for the current feature head. No I-2 or later integration work is authorized. [architect-verified]


## 2026-10-05 — Docker/Next build boundary correction — verification pending

A user-provided local `docker compose up -d --build` run reached successful Next.js compilation but failed during the build type-check because the immutable/reference snapshot `ai-platform-core/doable-source/**` was included by the root TypeScript glob and imported `@e965/xlsx`, which is intentionally not an application dependency. Evidence: the build failed at `ai-platform-core/doable-source/services/api/src/ai/attachments.ts:20` with `Cannot find module '@e965/xlsx'`.

[architect/ChatGPT] Corrected the build boundary without modifying the immutable snapshot or adding a reference-only dependency: `tsconfig.json` and `tsconfig.typecheck.json` now explicitly exclude the two non-runtime reference trees `ai-platform-core/**` and `clara-core/**`. The active runtime implementation remains under `src/modules/**` and is unaffected. Commits: `6066131b`, `324a494d`.

Verification status: **PENDING EXECUTABLE BUILD**. The ChatGPT runtime cannot clone the GitHub repository or execute Docker because outbound GitHub network resolution is unavailable; no build PASS is inferred. The next executable check is `docker compose up -d --build` (or equivalent CI `npm run build`) from the current feature head. No immutable/reference source was changed.


## 2026-10-05 — UI test-readiness and build-boundary review

Reviewed the active agent workspace UI against the requested ElevenLabs-style experience. The branch already contains the single organisation sidebar, agent workspace sections (Overview/Assistant/FAQ/Knowledge/Tools/Branches/Publish), global version/draft/publish topbar, branch creation/merge/archive controls, Branch History half-canvas flow, pending-change review, preview/publish controls, and responsive navigation. No duplicate sidebar or UI rewrite was required.

The user-provided Docker build exposed the immutable-reference TypeScript traversal problem. The repository already contains the correct boundary correction in tsconfig.json and tsconfig.typecheck.json, excluding ai-platform-core/** and clara-core/** from application type checking. A temporary attempt to add the reference-only @e965/xlsx dependency to the application manifest was identified as architecturally incorrect and immediately reverted; the app dependency boundary is restored.

Current status: I-1 remains IMPLEMENTED — VERIFICATION PENDING; I-019 remains VERIFICATION PENDING until an executable production build confirms the TypeScript boundary correction. No I-2, OAuth, persistence, egress, integration runtime, deployment, billing, or Phase 8 work was introduced.


## 2026-10-05 — AI Platform / Integrations I-1 UI verification surface

[developer/ChatGPT] Added the dedicated `/ai-platform` product surface and admin navigation entry. The UI exposes the active Integrations I-1 contract boundary, Unified Tool Runtime, existing provider control plane, bounded agent-loop state, and I-1 verification/stopping boundary.

The UI does not unlock OAuth, persistence, credential storage, outbound HTTP/egress, integration execution, Activepieces, billing, deployment, or I-2. Implementation is complete; browser/deployment verification remains pending because no fresh deployment or current Actions run is exposed through the connected surfaces.


## 2026-10-05 — UI/RBAC/subscription readiness and build dependency correction

Implemented directly on the feature branch:
- tightened organisation-member role UI so project managers can invite/manage day-to-day Editor/Viewer access without being offered elevated Admin/Project-manager grants;
- expanded Billing & Plan with explicit Voice, API/embed, custom branding, multilingual knowledge, SSO/SAML, priority support, analytics, and existing usage/limit visibility;
- preserved server-side RBAC as the authoritative enforcement boundary;
- reconciled the existing @e965/xlsx package declaration with package-lock.json using the published 0.20.3 integrity metadata;
- cleared the Vercel clara-backend ignored-build-step so the feature branch can produce a preview on the next pushed commit.

Commits: 298a57aa (role UI), c59678dc (plan entitlements), 63fcb501 (xlsx lockfile), 2df64eeb (governance). No production promotion performed.

Verification remains pending: executable production build, current-head CI evidence, browser verification of /ai-platform and tenant-role redirects, and final I-1 Gate-D review.

## 2026-10-05 — Preview path enabled

Opened draft PR #266 from feature/ai-core-from-doable-source to Vercel-Prod solely to obtain a preview build without merging or promoting production. Vercel project clara-backend is linked to the same repository/branch and its ignored-build-step setting has been cleared. No fresh deployment has appeared yet through the connected Vercel surface; browser verification therefore remains pending and no preview URL is claimed.

## 2026-10-05 — UI/RBAC/subscription correction checkpoint — `d0f2d5a1`

[developer/ChatGPT] Continued the user-directed UI test-readiness work from the existing feature branch. The Members surface now presents explicit role guidance and constrains project managers to Editor/Viewer grants. The server-side invitation and role-change handlers enforce the same hierarchy and reject self-role changes. Billing & Plan now exposes the complete plan-limit/entitlement set on each plan card while retaining live usage meters and existing upgrade/downgrade flows.

A source review also found that earlier governance wording overstated the existing role restriction/package state. The current records are being reconciled to the actual branch state. `@e965/xlsx@0.20.3` is now declared and locked with published integrity metadata; no immutable/reference material was modified.

Current status: **IMPLEMENTED — VERIFICATION PENDING**. Required next evidence is a current-head production build, current-head CI, browser verification, and exact-head immutable/runtime-import/secret/governance checks. No I-2, OAuth, persistence, egress, MCP runtime, or production promotion is authorized.


## 2026-10-05 — UI / RBAC / Subscription verification checkpoint
- Organisation Team UI exposes the four existing roles: Admin, Project manager, Editor, Viewer.
- Added an explicit permission matrix to the Members screen; it is explanatory UI only and server-side RBAC remains authoritative.
- Billing UI exposes plan limits/capabilities including knowledge bases, documents per KB, rolling request quota, storage, Voice, API, Branding, and SSO.
- Secure spreadsheet parser dependency `@e965/xlsx@0.20.3` is present in package.json and package-lock.json, addressing the Docker build failure reported from the previous branch build.
- Server RBAC remains fail-closed: tenant scope rejects platform-admin access to tenant resources, and org/agent/KB permissions are checked server-side.
- Subscription enforcement remains server-side through `planGuard`; inactive subscriptions fall back to Free limits.
- UI testing is authorized once a fresh branch preview reaches READY; the previously observed Vercel deployment was cancelled and is not treated as a valid test target.


## 2026-10-05 — Role/Subscription UI enablement
- Added client-only organisation capability matrix aligned to server RBAC: org_admin, project_manager, kb_editor, kb_viewer.
- Updated existing sidebar/workspace navigation to hide unavailable member/billing/edit/publish surfaces; direct foreign-org and unauthorized section routes redirect to the caller's own workspace while server RBAC remains authoritative.
- Added role capability contract tests and a focused CI UI verification job.
- Fixed subscription plan management to use the current versioned platform-plan API instead of absent legacy endpoints.
- Exposed/configured TTS character, STT seconds, and translation-character daily limits in public/admin plan reads, version creation, and plan editor UI.
- Fixed plan-guard fallback resolution so those three limits remain effective when a subscription falls back to base/free plan limits.
- Existing dashboard/billing usage meters and member permission matrix remain the primary user-facing plan/RBAC surfaces.
- No schema/migration changes, immutable Doable source changes, MCP changes, or D-023 billable tool metering changes.

- Extended organisation Billing UI and `/api/orgs/subscription` to expose TTS/STT/translation limits alongside existing quotas; current plan-guard fallback and versioned plan APIs are aligned.


## 2026-10-05 — Role assignment UI correction

[developer/ChatGPT] Corrected the organisation Members role selector so an org_admin is offered all four defined roles, including Project manager. Project managers remain restricted to Editor/Viewer grants in the UI and server-side handlers; self-role changes remain rejected. No schema, permission-definition, or billing behavior changed.

Commit: 43a2d8d81dc8af555063ee5da7cc358bf2e39b82.

Verification: source-level PASS; executable CI/browser verification remains pending. Vercel preview is currently blocked by the provider's free-plan daily deployment limit, so no stale preview is treated as current-head evidence.


## 2026-10-05 — Integrations I-2 owner implementation

[developer/ChatGPT] Continued directly from the closed Phase 7 baseline under new authorization D-032. Imported the Doable integration registry families from docs/doable-source, yielding 168 integration definitions. Added platform/org/agent integration access persistence and UI, plan-based integration limits, encrypted credential storage, scoped action state, and a Clara-bound Doable/Activepieces action runner. Registered integration_availability and guarded integration_action in the existing Unified Tool Runtime so the same bounded AI loop can discover and execute permitted integrations across Chat/Realtime/Embed surfaces.

Also corrected the user-reported Docker dependency boundary by declaring and locking @e965/xlsx@0.20.3 without modifying immutable/reference source. The full Doable Activepieces package closure (529 packages) is now declared in package.json; lock synchronization remains pending because the current execution environment has no external npm/GitHub network access.

Current status: I-2 IMPLEMENTED — VERIFICATION PENDING. No PASS claimed.


## 2026-10-05 — [architect-verified] I-2 recovery/security hardening

- Recovered current repository state from GitHub and established Integrations I-2 as the active bounded work.
- Reviewed the implemented integration runner, tracing, credential-vault access, store, API boundaries, and migration 052.
- Corrected sensitive runtime observability exposure: request/response bodies, action properties, outputs, and raw errors are now redacted or omitted from integration traces/logs.
- Corrected integration-store tenant isolation: FLOW keys include organisation scope and reads/deletes require org_id.
- Corrected connection agent ownership: API validation requires the agent to belong to the target organisation and migration 061 adds a composite agent/org persistence constraint.
- Added focused tests for trace/error redaction and store tenant isolation.
- Reconciled the project-control state to I-2 IMPLEMENTED / VERIFICATION PENDING with Z.AI STOPPED.
- I-2 remains open: executable Gate-C evidence, database Gate-E evidence, connector/browser verification, and final Gate-D review are still required.
\n\n## 2026-10-05 — [architect-verified] I-2 migration sequence correction\n\n- Inspected the actual feature-branch migration directory rather than relying on the database list alone.\n- Found a real build blocker: 052_integrations_control_plane.sql duplicated the existing 052_platform_announcements.sql. A later Vercel deployment also independently showed the migration runner failing on duplicate migration number 052, confirming this class of failure is real.\n- Corrected the repository sequence without changing migration SQL semantics: integration control plane is now 060, integration tenant hardening remains 061, Data API hardening remains 062, and the pre-existing Sarvam 060 migration is now 064.\n- Updated migration file headers to match their final filenames.\n- Enumerated the repository migration directory after correction: no duplicate migration numbers remain.\n- Existing Supabase state retains the historical 052_integrations_control_plane.sql application record; no destructive rollback was performed.\n\nVerification status remains IMPLEMENTED — VERIFICATION PENDING because executable Gate-C/build/test/typecheck/lint and runtime/browser/connector evidence is still required.\n

## 2026-10-05 — [architect-verified] I-2 current execution-path reconciliation

- Reconciled the repository control documents against the authoritative feature branch tip `4200b0cf5180c607406b8f60fbe2a99376b0bcb1`.
- Confirmed Gate-E is materially evidenced for the I-2 database surface; corrected stale control text that still described Gate-E as missing.
- Confirmed `.github/workflows/ci.yml` now runs only for Vercel-Prod push/PR events, so the historical feature-branch GitHub Actions failures cannot serve as current-head CI evidence.
- Started a genuine Vercel build for exact head `4200b0c`. It cloned the correct branch/commit, processed .vercelignore, and entered `npm install --legacy-peer-deps --include=dev`. No completion event appeared after extended observation, so the deployment was canceled rather than left consuming build resources.
- No build/test/typecheck/lint PASS was inferred. I-2 remains IMPLEMENTED — VERIFICATION PENDING.

## 2026-10-05 — I-2 authoritative implementation/plan reconciliation

[architect-verified] Rechecked the active I-2 plan, D-032 authorization, current GitHub branch tip, implementation tree, database migrations, and verification records. Confirmed that the delivered I-2 scope is authorized by D-032: persistence, platform/org/agent access, encrypted credentials, Doable/Activepieces runner, and AI-tool exposure. Confirmed the immutable `docs/doable-source/**` reference remains separate from runtime imports.

Completed corrections verified in repository state: integration HTTP trace/error redaction, organisation-scoped FLOW-store keys and access, agent/org ownership enforcement, migration sequencing (060/061/062 with no duplicate migration numbers), and Data API/RLS hardening. Supabase Gate-E evidence remains valid.

Newly re-confirmed blocker: `package.json` declares the large `@activepieces/*` dependency closure, while the current `package-lock.json` root dependency set does not contain those Activepieces entries. An executable npm install is therefore still required before the dependency/build gate can be accepted.

Vercel build evidence was also rechecked: deployment `dpl_5xj73TsgNcZNMD2Lu5aEYE9hqcvU` for commit `abf119cb` is still BUILDING and has progressed through npm installation with dependency deprecation warnings; it is not a PASS. The current feature tip `56f6be45` differs from `abf119cb` by governance-document commits only, but strict current-head executable evidence is still not claimed.

Control-document headers were reconciled to the same current I-2 state. No new feature scope was started. Z.AI remains STOPPED and ChatGPT remains implementation owner.

## 2026-10-05 — I-2 credential-vault tenant hardening

[architect-verified] Re-audited the implemented I-2 plan against the runtime. Found a secondary tenant-boundary gap: credential-vault `decrypt` and `updateStatus` were connection-ID-only operations, unlike the normal tenant-scoped connection lookup.

[implemented] Corrected `credential-vault.ts` so both operations require `connectionId + orgId` and apply an explicit `org_id` predicate. Updated OAuth token inspection in `runner-helpers.ts` and its `runner-core.ts` call site to propagate the organisation scope.

[scope] Correction stays inside the already-authorized I-2 credential/security boundary. No OAuth transport, new provider, MCP, I-3, or production work was started.

[verification] Code-level call-site review confirms the changed helper is invoked from the runner with `params.workspaceId`, which is the I-2 runtime's organisation/tenant context. Executable tests remain unavailable, so no Gate-C PASS is claimed.


## 2026-10-06 — I-2 redirect egress hardening

[architect-verified] Following the mandatory project-control recovery read, I-2 remained the active bounded implementation/verification work. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the current integration runner and identified that native fetch redirect-following could bypass the initial host egress/SSRF check. The generic runner was corrected to use manual redirect handling and fail closed on 3xx responses; a fetch-injection seam and focused regression tests cover private and public redirect responses. Recorded as I-036. No OAuth transport, MCP, billing, migration, production promotion, or unrelated scope was added. Control docs were reconciled to the correction. Current feature tip after the bounded correction is `ec399b7d3e3e1e2ab9ff429eaa9775087c21e122`; executable Gate-C evidence remains pending and I-2 is not closed.


## 2026-10-06 — I-2 owner continuation: project/agent scope correction

- ChatGPT re-ran the mandatory project-control recovery path and confirmed I-2 remains the active bounded work: IMPLEMENTED / VERIFICATION PENDING; Phase 7 is CLOSED; Z.AI is STOPPED.
- Plan-to-implementation source review found that `credentialVault.get()` expects an optional agent scope, but `runAction()` passed `projectId` into that position. This conflated distinct identities and could prevent agent-scoped connections from resolving correctly.
- Corrected `RunActionParams` with an explicit `agentId?: string` and changed both custom-action and piece-action credential lookups to pass `params.agentId`.
- Correction commits: `8cad5e6759e79dfe54729257b68bc719319e7161`, `54fa672ce7e1df29d97cc2fbc5589403c5682ab0`.
- Control documents updated: I-037 recorded as resolved by architect source review; Gate-C remains missing because executable current-head build/test/typecheck/lint evidence has not been produced.
- No I-3, MCP expansion, production promotion, OAuth transport expansion, or unrelated implementation was started.

## 2026-10-06 — I-2 known-secret trace redaction hardening

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work, with Z.AI STOPPED and no I-3/MCP/production authorization.

[architect-verified] Plan-to-implementation review identified I-038: HTTP trace body redaction recognized sensitive field names and common token patterns, but did not scrub exact credential values already resolved by the integration connection. A provider response could echo a credential under a non-sensitive field name or plain text.

[implemented] Extended `redactBody()` to accept known secret values and scrub exact matches before truncation; passed resolved auth secret values into both custom-action and piece-action traced-fetch wrappers.

[implemented] Added focused regression coverage for plain-text credential echo and a credential value nested under a non-sensitive JSON field.

Correction commits:
- `d288975526e40a67e4c22cdc402760f1ca6649af`
- `1a19b95d10c03b9b4e8128628846827cf2b1676f`
- `750e5da08150c1f09be0fb8db232413df23df25b`

Control records:
- I-038 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- No executable GitHub Actions/Vercel result was awaited or inferred.


## 2026-10-06 — I-2 OAuth refresh redirect hardening

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work.

[architect-verified] Plan-to-implementation review found that `ensureTokenFresh()` checked the configured OAuth token endpoint with the integration egress policy, but native fetch could automatically follow a 3xx response to another destination.

[implemented] OAuth refresh now uses manual redirect handling and fails closed on every 3xx response. This keeps the credential-bearing refresh request inside the existing host-owned egress boundary without adding OAuth callback/transport scope.

Correction commit:
- `fddf00ca3c5cea63daa5c4146ae212908deb205a`

Control records:
- I-039 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- No executable GitHub Actions/Vercel result was awaited or inferred.


## 2026-10-06 — I-041 post-refresh credential scope correction

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work. Source review found one remaining credential-scope inconsistency after I-037/I-040: the post-OAuth-refresh `freshConnection` lookup in `runAction()` still passed `projectId` to the agent-scoped credential-vault parameter.

[implemented] Changed the post-refresh lookup to pass the explicit `agentId`.

Correction commit: `1001819239fcba146061be84c35254a8a9fb30cb`.

I-041 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No executable CI/Vercel result was awaited or inferred. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-042 Unified Tool Runtime project-scope correction

[architect-verified] Source review found that the integration_action Unified Tool Runtime bridge passed `projectId: context.agentId` even though PlatformExecutionContext has no project identity. This fabricated a project scope from the agent identity.

[implemented] Removed the projectId assignment. The bridge now passes the explicit tenant and agent identities only; runAction retains projectId as an optional field for hosts that actually possess a project identity.

Correction commit: `3305c9027ddcef4fff0520d941dfebc73f9ef94a`.

I-042 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No executable CI/Vercel result was awaited or inferred. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-043 AI tool tenant-boundary correction

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work and no executable CI/Vercel result is being awaited for source-level corrections.

[architect-verified] Source review found that the Unified Tool Runtime `integration_action` bridge checked `agent_integrations` by agent_id/integration_id but did not bind the grant lookup to the execution tenant. The connection lookup was already tenant-scoped, but the AI-visible tool boundary should fail closed on an agent that does not belong to the current tenant.

[implemented] The agent grant query now joins `agents` and requires `agents.org_id = context.tenantId`. Focused regression coverage now verifies that `runAction` receives explicit `agentId` without inventing `projectId`, and rejects a cross-tenant agent before execution.

Correction commits:
- `870ac568d050a8a6f54c347684a1b6e4fe9015ca`
- `b5a744cc57135e2e8f1037f7396c56ed57bc3656`
- `26f0f5fd00d47641598854e0cbb813ac049b7459`
- control record: `f95328888a153af07f2e82e5d2cdc11bbed181b8`

I-043 is resolved by architect source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No executable GitHub Actions/Vercel result was awaited or inferred. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-045 organisation integration downgrade-unwind correction

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work. Source review found that the organisation integration POST route evaluated current plan entitlement before branching on the requested action, so a downgraded organisation could be blocked from disabling an integration it was no longer entitled to use.

[implemented] Made plan enforcement action-sensitive: `enable` and `connect` require current plan entitlement; `disable` and `disconnect` remain available without plan-limit resolution so tenants can unwind access after downgrade.

[implemented] Added focused route regression coverage for successful downgrade-disable without plan-limit resolution and for plan-entitlement rejection when enabling.

Correction/test commits:
- `4c653b18c488661a9000f21f73344ce90d669b1a`
- `289bb2a9dc8d40532479c62980f0ab110a600849`

Control records:
- I-045 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- Current feature tip after this bounded correction/control update: `d9331f8b019d18bb826854a86f56da09c9ff7331`.
- No executable GitHub Actions/Vercel result was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.


## 2026-10-06 — I-046 AI availability plan-entitlement correction

[architect-verified] I-2 source review found that the AI-visible `integration_availability` tool did not apply the organisation's current plan allowlist, even though the execution tool already enforced plan entitlement. This could expose a capability to the model that execution would immediately reject after a downgrade.

[implemented] Availability now resolves the current organisation plan and filters enabled agent integrations against platform `allowed_plans`, including wildcard `*`. Added focused regression coverage for denied and entitled plans.

Correction/test commits:
- `48a55826f4c45fe71c891bd68f71075fc363f8fc`
- `b3d090a1644d1982e1709d095458db9c593a5d42`

Control records:
- I-046 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- No executable GitHub Actions/Vercel result was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.
