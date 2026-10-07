## 2026-10-08 — I-3 continuation checkpoint

[architect-verified] The active phase remains **Integrations Framework I-3 — Action Runner**. Owner instruction explicitly permits continued implementation without waiting for GitHub Actions, Vercel, or phase gates.

- Current branch tip after bounded implementation: `5b839525bd46de4cc9d07834970e351c2ac2e06e`.
- Latest I-3 corrections: typed egress/DNS/redirect failure propagation with redacted blocked-request traces; recursive array-item action-input validation in strict mode; focused regression coverage for both.
- I-3 remains **IN PROGRESS**; no I-3 PASS/closure is inferred.
- I-2 remains implementation-complete with external verification deferred.
- **STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

## CURRENT AUTHORITATIVE STATE — 2026-10-08 — I-3 ACTIVE

[architect-verified] Owner authorization explicitly advances implementation to **Integrations Framework I-3 — Action Runner** while I-2 executable verification remains deferred. I-2 is not claimed PASS/CLOSED. The active implementation scope is I-3 only; I-4/I-5, MCP, production promotion, and unrelated work remain out of scope.

Current I-3 implementation/support commits: `57f5fd9`, `99a574e`, `9e921b2`, `ef10442`, `70ba919`, `5b83952`. The latest bounded corrections complete typed egress/redirect classification at the fetch boundary and extend strict input validation into array items.

**Recovery rule:** this block supersedes older checkpoint prose below; historical I-2 entries remain historical evidence and must not be interpreted as the current active phase.

---
## 2026-10-07 — I-075 Activepieces action allowlist correction

[architect-verified] Bounded I-2 review corrected runner capability expansion: runAction() now enforces the Clara registry action allowlist before loading an external Activepieces piece. Implementation c1705ac81c4e77239feca6d518d3ef2afcd0403c; regression 3d41bdc09e125b3143bfb58ddf162b00bd335c8b. I-075 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 review only; do not wait for GitHub Actions or Vercel and do not expand to I-3/MCP/production.

## 2026-10-07 — I-074 execution-authorization source correction

[architect-verified] Bounded I-2 review corrected literal \\n escape text in `src/modules/integrations/runtime/execution-authorization.ts`. Commit `c6240da3ea64869ce4f49dafa4583cd9b626af88`. I-074 is RESOLVED by source correction. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 review only; do not wait for GitHub Actions or Vercel and do not expand to I-3/MCP/production.


## 2026-10-06 — I-073 OAuth refresh endpoint integrity correction

[architect-verified] Bounded I-2 source review found OAuth refresh trusted the connection-stored `token_url` even though the registry defines the authoritative OAuth token endpoint. Commits `59957d4ea03dfb89f8a90c9976322aae86821e73` and `6b781ed042003bd62f056d35b9f5952176b5cb73` bind refresh to `def.oauth2Config.tokenUrl`; regression `db0284111f94955c038e60bbb62fc59068d208a4` rejects mismatched endpoints and covers the matching path. I-073 is RESOLVED. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 source review only; no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-072 connection auth-type authority correction

[architect-verified] Bounded I-2 source review found organisation connection creation persisted caller-supplied `authType` instead of the registry definition. Commit `879e3cbcc98392a48fe8e461255460f8d0e06c4b` now persists `def.authType`; regression `be01ab6ac2d97cf36c6400ef43d121c9c8699902` covers conflicting caller input. I-072 is RESOLVED. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-071 custom integration error-body hardening

[architect-verified] Bounded I-2 source review identified raw provider response bodies in credential-bearing custom ElevenLabs TTS/STT and Supabase PostgREST errors. Commit `9c1a838c54cf036f67ac05810b3b6bea0b1f9799` removes response-body propagation; regression `0d1494ea8686c3186589cf657a8dc361d3443af4` covers the PostgREST failure boundary. I-071 is RESOLVED. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. No I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-067 IPv4-mapped IPv6 egress correction

[architect-verified] Bounded I-2 source review identified an SSRF bypass in the host egress policy: IPv4-mapped IPv6 literals encoded with the final IPv4 address as hexadecimal (for example `::ffff:7f00:1`) were treated as IPv6 and could bypass the private IPv4 ranges. The egress guard now decodes both dotted-decimal and hexadecimal IPv4-mapped forms before applying the IPv4 deny ranges.

- Implementation: `8d176739784d2d510f20d242b533a7383ac5de98`.
- Regression coverage: `ee76381b577f5ffdeb658f4ccdc9b7dd27653cc0`.
- I-067: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-064 AI integration-tool plan-resolution fail-closed correction

[architect-verified] Source review identified inconsistent fail-open plan resolution in the AI-visible integration_action and integration_availability boundaries. Both now use resolveOrgPlanLimits directly; execution denies on resolution failure and availability exposes no capabilities without authoritative entitlement. Implementation/test commits: 0f5c2ad1372be0c60ed72b11863b9aad8e48fda6, f394054afa6aa92e8c33ef5dbf7bb0554bf18730, c857a8777f0a9f6ea7f535734966b1d2546d1ca8, 305f59663e83ab8deea910b350c746c2af1420b6. I-064 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-06 — I-063 Supabase Management fallback authorization correction

[architect-verified] Source review found that the custom supabase.execute_sql action required the separate supabase-mgmt authorization even when no active Management connection existed, preventing the documented service-role/PostgREST fallback. The bounded correction adds a tenant/user/agent-scoped active-connection existence check without decrypting credentials; Management authorization and credential retrieval occur only when that optional connection exists. Implementation commits 6719be8bec7cf9f6deeae30fb1c3ff01b108a9ea and aa99287f844c7b99c381666df98071878050e5f5; regression 457b07d7db82736a1b7724e4da1476ff9477fbe7. I-063 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-06 — I-061 custom Management credential authorization correction

[architect-verified] Source review found that custom `supabase.execute_sql` directly read the separate `supabase-mgmt` credential without re-checking that integration's platform/plan/organisation/agent authorization. Commit `5f6d044a2ec1d8ddacaf9bde553f17576c14732e` adds the fail-closed authorization check before credential retrieval; regression `3ebbbf7113e851a427d310aee2d3a057a6b8ba83` covers denial-before-read. I-061 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



## 2026-10-06 — I-057 OAuth refresh disable-race correction

[architect-verified] The I-2 credential refresh path was hardened against a concurrent disable: tenant-scoped decrypt/update now require an active connection, and the runner fails closed if the post-refresh active connection disappears. I-057 is RESOLVED by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
# PROJECT_STATE.md

## 2026-10-08 — I-3 typed runner error boundary hardening

[architect-verified] Continued bounded I-3 Action Runner review found that deterministic classification still depended primarily on matching provider/error message text. The runner now has a host-owned `IntegrationRunnerError` with explicit `IntegrationErrorCode` and retryability, and the core runner plus egress policy use typed classifications for key boundary failures. Legacy/provider errors retain conservative compatibility heuristics. A focused regression verifies explicit classifications take precedence over misleading provider wording.

- Corrections: `6deba78a0ce6a167bb3004164cb0bea8a84c4153`, `3128347169fc107d444bb6b5d5004cdd26a6c9b9`, `2a867bff3b3a19a68d40ad16a9a90fa9f590eef3`, `3a93d4b371b12e966effc80c9a73fc73480fd8ee`.
- Scope: I-3 Action Runner error contract, egress failure classification, and focused regression only.
- No CI, Vercel, Gate-C, Gate-D, or continuous verification was awaited.
- I-2 remains implementation-complete with external verification deferred; I-3 remains the active implementation phase.

**Next implementation:** continue bounded I-3 acceptance review for remaining action-runner gaps, especially strict input-schema coverage, egress/redirect boundaries, redacted trace invariants, deterministic result propagation, and tenant-isolation regression coverage.

**STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

 — Authoritative Current-State Summary

## 2026-10-06 — I-066 integration mutation plan resolution must fail closed

[architect-verified] Source review found that organisation enable/connect and agent enable mutation routes still used the UI-oriented `getOrgPlanLimits()` helper, which falls back to free-plan limits when authoritative plan resolution fails. The bounded correction switches those mutation authorization paths to `resolveOrgPlanLimits()` and returns 503 on resolution failure; focused regressions cover both routes. Implementation commits: `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98`; tests: `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`. I-066 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



## 2026-10-06 — I-065 OAuth expiry status must not overwrite an explicit disable

[architect-verified] Source review of the current I-2 credential vault found that `updateStatus(connectionId, orgId, status)` could overwrite a concurrently applied tenant/admin `disabled` or disconnect state with `expired` during OAuth failure cleanup. The bounded correction changes the status transition to apply only while the connection is still `active`; regression `ac162b6ce439861c0c2ac9a2650971cd79411ef7` asserts the active-state predicate. Implementation `c3ecd5d72940a2e8af4a53266e368c9d9e3dc8f7`. I-065 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



> ## CURRENT AUTHORITATIVE RECONCILIATION — 2026-10-05
> **This block supersedes stale earlier checkpoint prose in this document.** Repository truth at feature HEAD is **Integrations Framework I-2 — IMPLEMENTED / VERIFICATION PENDING**. The project-control Final State Contract is **RECONCILED / CONSISTENT** at this checkpoint; I-2 remains open because executable Gate-C evidence and final Gate-D review are incomplete. Phase 7 is **PASS — CLOSED** and is not reopened. I-1 remains historical/incomplete where its Gate-C evidence was never independently observed.
>
> Current feature branch: `feature/ai-core-from-doable-source`; current GitHub tip must be read from GitHub at recovery time. Latest bounded I-2 source correction reviewed here: **I-066 — `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98` + regressions `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`** [architect-verified]. The current feature tip must still be read from GitHub at recovery time. ChatGPT is the implementation owner under D-024. **Z.AI is STOPPED; there is no active developer handoff.**
>
> Completed I-2 corrections now include runtime trace redaction, organisation-scoped integration-store access, agent/org ownership enforcement, migration sequencing, database/RLS hardening, AI-visible action-output credential redaction, pre-execution action-input validation, and tenant-scoped OAuth access-token refresh with encrypted persistence, plus an outbound integration egress policy blocking non-public destinations and complete-payload trace redaction before truncation. Redirect following is also fail-closed in the generic runner (I-036). I-047 also closes the direct-connection path's integration-count entitlement bypass. I-048 makes the registry auth contract authoritative for OAuth refresh behavior. Project and agent scope are now modeled separately in the runner (I-037). The remaining bounded blockers are: Activepieces package manifest/lockfile synchronization, executable current-head build/test/typecheck/lint evidence, connector/OAuth smoke, browser verification, real connector/OAuth smoke where credentials are available, current-head browser verification, and final immutable/runtime/secret/governance scans. No I-3, MCP expansion, production promotion, or unrelated feature work is authorized.


> Canonical project-control document for the Clara AI Platform.
> A fresh ChatGPT/architect session reads this file first (after repository agent instructions) to reconstruct exact project state without chat history.
> Snapshot date: **2026-10-06 — Phase 7 CLOSED; Integrations I-2 implemented, verification pending; control-layer reconciliation CONSISTENT at the current checkpoint**. Repository state is authoritative; this file records a dated snapshot and always names the recovery command (see RISKS.md R-1: undated state drifts).
> Evidence classification: every field below is labeled **[developer-reported]** or **[architect-verified]**. See VERIFICATION_STATE.md for the definitions and full evidence register.

## Identity

| Field | Value | Evidence |
|---|---|---|
| Project | Clara AI Platform — multi-tenant RAG + Voice AI SaaS (Next.js 15, TypeScript, PostgreSQL/Supabase, Qdrant, Redis/BullMQ) | [architect-verified] README.md |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) | [architect-verified] |
| Current branch | `feature/ai-core-from-doable-source` | [developer-reported, 2026-10-02] |
| Authoritative source of truth | **GitHub repository state.** Chat/conversational memory is supplementary only (spec principle 6, DECISIONS.md D-001) | [architect-verified] spec |

## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] A bounded I-2 credential-access bypass was corrected in the Activepieces ConnectionsManager. Cross-integration credential lookup now passes through the same tenant/plan/platform/agent authorization boundary as direct integration execution. Implementation `3a17c31cb16bfa54cb79a48a13a757ae16486971`; regression `4f86976b505487906d18e526b6433be360e97a8b`. I-055 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING.

## 2026-10-06 — I-056 execution authorization fail-closed correction

[architect-verified] Source review found that the I-2 execution authorization boundary used the UI-oriented `getOrgPlanLimits()` helper, whose fallback converts plan-resolution/database failures into free-plan limits. This could allow an integration permitted on the free plan to execute without proving the organisation's actual entitlement. The bounded correction now calls `resolveOrgPlanLimits()` directly and denies execution when entitlement resolution fails. Implementation `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`; type correction `9ac86755c94132a86afbde804a7ca3b927e0e83b`; focused regression `220d1a66fe7279bb55296d31d5f9d5c3133b78ef`. I-056 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## Current phase

## 2026-10-06 — I-047 direct-connection limit correction

[architect-verified] Source review found that organisation-level connect could implicitly enable a previously-disabled integration without enforcing max_integrations. Commit 846c8d39add3430a5014c5573b3cc4d5ad86ee37 now enforces the organisation integration-count entitlement when connect would consume a new slot; regression coverage is 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-040 action-context scope correction checkpoint

[architect-verified] Source review found that the prior I-037 credential-scope correction did not propagate the explicit agent scope into the Activepieces action context. The action-context PostgresStore and cross-integration ConnectionsManager were still constructed with projectId. Commits a5680cd51c6d9ca961ab93effd20fb069d0e2bbe and a58edb20d5c95ce0fbd711cc0e23bff0582fc5ed correct this, and test commit 550b751b745d7a8a4a52854edc1cc328d7c891b2 adds focused regression coverage. Gate-C remains MISSING and Gate-D remains IN_PROGRESS; no I-2 PASS is claimed.


## 2026-10-06 — I-040 completion checkpoint

[architect-verified] The bounded scope correction now covers both the Activepieces action context and the Unified Tool Runtime integration-action boundary: explicit agentId is propagated into the store/connections manager and into runAction. Focused regression tests cover both propagation points. Gate-C remains MISSING and Gate-D remains IN_PROGRESS; no I-2 PASS is claimed.


## 2026-10-06 — I-043 owner continuation

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review corrected the AI-visible integration tool boundary: agent integration grants are now bound to the execution tenant through the authoritative `agents.org_id` relationship, and focused regression coverage rejects a cross-tenant agent before `runAction`. The existing I-042 project/agent scope correction remains intact.

- I-043: RESOLVED by architect source review.
- Correction commits: `870ac568d050a8a6f54c347684a1b6e4fe9015ca`, `b5a744cc57135e2e8f1037f7396c56ed57bc3656`, `26f0f5fd00d47641598854e0cbb813ac049b7459`.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.
## 2026-10-06 — I-2 owner continuation: runner correctness correction

[architect-verified] ChatGPT independently reviewed the current I-2 runner source and corrected a bounded ElevenLabs redirect error-message defect at `499feacf01907f82da9578b74cb8789931d10752`. The redirect remains fail-closed; only the action-specific error semantics were corrected. I-2 remains IMPLEMENTED — VERIFICATION PENDING, Gate-C remains MISSING, and Gate-D remains IN_PROGRESS. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.

## 2026-10-06 — I-044 credential-value error-boundary hardening

[architect-verified] Source review found a bounded I-2 observability defect: the runner's final catch boundary only performed pattern-based redaction, so a provider could echo a resolved credential value under a non-sensitive field name and have that value reach XRay, usage logging, or the returned error. Commit `a8a1997f958c37b524451618eb0d3bb4a3746b5f` retains the resolved credential values for the active run and applies value-based redaction before the error is recorded or returned.

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-045 organisation downgrade-unwind correction

[architect-verified] I-045 was identified and corrected within I-2: organisation-level `disable`/`disconnect` operations no longer depend on plan-limit resolution, while `enable`/`connect` remain fail-closed against current plan entitlement. Correction `4c653b18c488661a9000f21f73344ce90d669b1a`; focused regression `289bb2a9dc8d40532479c62980f0ab110a600849`. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-046 AI availability plan-entitlement correction

[architect-verified] I-2 source review found that the AI-visible `integration_availability` tool exposed platform/org/agent-enabled integrations without applying the organisation's current plan allowlist. Commit `48a55826f4c45fe71c891bd68f71075fc363f8fc` now resolves the current plan and filters the availability surface by `allowed_plans`, while `integration_action` remains independently fail-closed. Regression commit: `b3d090a1644d1982e1709d095458db9c593a5d42`.

I-046 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-054 runner execution-authorization correction

[architect-verified] I-054 is RESOLVED. `runAction()` now re-checks platform enablement, current plan entitlement, organisation grant, explicit agent scope, and the authoritative `agents.org_id` relationship before any integration action executes. Focused regression source covers plan downgrade, cross-tenant agent grant, and missing agent scope. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-058 custom integration egress/redirect correction

[architect-verified] Custom ElevenLabs and Supabase integration HTTP paths now use explicit host egress validation and manual redirect handling. I-058 is RESOLVED by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-059 Supabase Management API egress correction

[architect-verified] Source review identified a remaining credential-bearing native fetch in the custom Supabase Management API action outside the I-058 egress/redirect boundary. Commit `c7a2b7f4edb33cc919e2fe6c9a0bec2c981450be` now applies `assertSafeEgressUrl()`, manual redirect handling, and explicit 3xx rejection. I-059 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains source-level I-2 authorization/credential/egress review, followed by executable Gate-C evidence and final Gate-D review. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-060 custom Management credential agent-scope correction

[architect-verified] Source review identified a bounded I-2 credential-scope defect in the custom Supabase Management API action: its secondary `supabase-mgmt` credential lookup omitted the executing `agentId`. Commit `a90254ee5e4a7910fd92291810fe0cdff72c2ee0` now preserves explicit agent scope, with focused regression `040cfafb0d4aad1b9b95de9aafa3d5dfa975bd35`. I-060 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.

## 2026-10-06 — I-068 integration-route source correction

[architect-verified] Bounded I-2 source review found literal \\n escape text embedded between TypeScript statements in the organisation integration POST route and agent integration PATCH route. The escapes were replaced with actual statement newlines in c07b87596ffdc7959a4b507621b3a57d900c6a82. No authorization behavior was changed. I-068 is resolved by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Continue bounded I-2 review only; do not wait for GitHub Actions or Vercel and do not expand to I-3/MCP/production.

## 2026-10-06 — I-070 agent-scoped FLOW store correction

[architect-verified] I-2 source review identified that FLOW store keys omitted agentId, allowing same-user cross-agent state collision inside one organisation. The bounded correction adds explicit agent scope to FLOW keys and focused regression coverage. Implementation f0f476e74b1fbd66ed3e716bdc23e9e6b775b; regression efc652c8096488e3cf8d2ac2422d108c345924ca. I-070 is resolved by source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING; continue bounded I-2 review only.

## 2026-10-07 — I-076 registry-authoritative action discovery

[architect-verified] Bounded I-2 source review found getIntegrationActions could advertise unreviewed Activepieces package actions through its sparse-match fallback, despite the runner execution boundary rejecting those actions. The fallback now stays within Clara's reviewed registry action set; custom Clara-owned actions remain exposed separately. Implementation 9435c6ce036634fe5f1126fa35c424db0e8582a2; focused regression 55271624623ec65ec1ae892bf8585063d2dc5371. I-076 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-07 — I-077 Supabase credential URL error-boundary hardening

[architect-verified] Bounded I-2 source review found the custom supabase.execute_sql action included credential-derived projectUrl in an error when project-ref parsing failed. The correction now returns a generic invalid-project-URL error. Implementation 6ae5663938c2144f2f880afe0d7ebdcd97ebf54a; focused regression 0f3347d8b679f0ea4110768fdf5f5c33de129d57. I-077 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## 2026-10-07 — I-078 runner early-rejection trace initialization correction

[architect-verified] Bounded I-2 source review found the registry action-allowlist rejection path referenced the normal XRay handle before initialization, causing a temporal-dead-zone ReferenceError instead of the intended structured fail-closed response. Correction ddd38bbf84f274a7f2daa159007a080f964b3046 removes that premature trace call. I-078 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-07 — I-079 AI action readiness user-scope correction

[architect-verified] Continued bounded I-2 source review found that `integration_action` readiness checked for any active organisation/agent connection but omitted the current `userId`. Because the runner already enforces tenant/user/agent credential scope, this was a readiness correctness issue rather than a credential-access bypass: another user's connection could make the AI tool report readiness for the current user, followed by a later runner failure. The readiness query now requires the same user scope and prioritizes the current user's connection.

- Implementation: `9e168851bc2e978f68c0576235e084eba63be4a2`
- Regression: `f2b3dc2ac263d5112dc8d6e7649acfdd76bc735a`
- I-079: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- No I-2 PASS is claimed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — I-080 AI availability regression alignment

[architect-verified] Continued bounded I-2 review found a stale `getOrgPlanLimits` mock reference in the AI availability cross-tenant regression after production had migrated to `resolveOrgPlanLimits`. Correction `3ed83c8ddcde22e05ddfa415bce134e7773fca75` aligns the test with the authoritative resolver; no production behavior changed.

- I-080 is RESOLVED by test-source correction.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- No I-2 PASS is claimed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — I-081 AI availability user-scope correction

[architect-verified] Bounded I-2 review found `integration_availability` could report another user's active connection as connected. Availability now requires user context and applies organisation + agent + user connection scope, preserving organisation-scoped connections.

- Implementation: `f9dc068c0ca6b4067d0cda6d44743d4f91ac82a5`
- Regression: `0e53c6a42fa316ddb776b565b32dd5b03599a69a`
- I-081: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-082 OAuth refresh credential-scope correction

[architect-verified] OAuth refresh now preserves the execution user and agent scope through credential-vault decrypt, expiry status updates, and refreshed-credential persistence. This closes a bounded I-2 scope gap where the initial connection lookup was user/agent scoped but subsequent refresh mutations used only connectionId + organisation.

- I-082 is RESOLVED by source review.
- Corrections: f74d3928ce875e40ebafba473e92da4c90305ca0; 4ea030a1d75e31983605e59026437de4336d5e16; bd238eaa379d51f11c9d867434cd0a77dc5ab1a0.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- No I-2 PASS is claimed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — Owner CI/CD pause control

[architect-verified] Automatic GitHub Actions triggers were disabled in .github/workflows/ci.yml by replacing push/pull_request execution with workflow_dispatch only; the file contains short restoration guidance. Vercel project clara-backend was paused because Git deployment-source controls are unavailable on the current Hobby plan. This is an operational owner control and does not change I-2 application behavior.

I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING; Gate-D remains IN PROGRESS. No CI, Vercel build, or Gate result was awaited.


## 2026-10-07 — I-084 OAuth refresh scope drift correction

[architect-verified] Current branch source was re-audited after I-082 and exposed a partial regression: runner-core passed user/agent scope to ensureTokenFresh, but the helper signature and some vault calls had reverted to unscoped form. The helper now propagates userId/agentId across decrypt, expiry status, and credential persistence. Corrections: bd6a7a58819d8ff9b203a9638c3d806d5e5caa15 and f5bc88e57667d886100f875b81fff9b1e71cd435.

I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING; Gate-D remains IN PROGRESS.


## 2026-10-07 — I-085 OAuth refresh lost-scope fail-closed correction

[architect-verified] Source review found a race boundary where an OAuth refresh could successfully obtain a new provider token but its scoped persistence update could match zero rows after concurrent connection state changes; the runner had no explicit signal and could continue. updateCredentials now returns success/failure from the scoped UPDATE, and ensureTokenFresh aborts when persistence loses the active connection scope. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING; Gate-D remains IN PROGRESS.


## 2026-10-07 — I-086 organisation integration mutation serialization correction

[architect-verified] Continued bounded I-2 source review identified a concurrency gap in the organisation integration connect path: its `FOR UPDATE` lock protected only an existing `organisation_integrations` row, so first-time connects with no existing grant row could race through the `max_integrations` count check. Commit `51c14f65b7dac8812ccae353bc23e9cf07694d8c` now acquires the organisation-level PostgreSQL advisory transaction lock before the connect grant/count read; disable and disconnect acquire the same lock to serialize the complete organisation integration mutation domain.

I-086 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN PROGRESS. No CI, Vercel, Gate-C, or Gate-D result was awaited. No I-2 PASS is claimed.

**Next planned implementation:** continue only the bounded I-2 credential/connection and authorization race review, then remaining custom-action, AI-tool, egress/secret, action-input, and tenant-isolation gaps. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-07 — Gate-C execution readiness

[architect-verified] Gate-C preparation is complete at the repository level: CI remains manual-only and the platform health schedule is disabled. Gate-C is not falsely marked PASS; its sole remaining gap is executable current-head evidence. After that evidence exists, the next planned architect work is Gate-D final review.


