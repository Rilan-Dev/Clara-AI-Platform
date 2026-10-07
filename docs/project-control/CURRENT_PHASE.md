## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-3 ACTIVE

[architect-verified] By explicit owner authorization, implementation advances to **Integrations Framework I-3 — Action Runner**. I-2 remains implementation-complete with external verification deferred; no I-2 PASS is inferred. I-3 is now the active bounded implementation track.

I-3 deliverables: bounded integration execution, strict/pre-execution action validation, host-owned egress/SSRF enforcement, deterministic error normalization, redacted tracing, and tenant-isolation regression coverage. Current source corrections keep DNS/private egress failures and redirect rejection on explicit host-owned error classifications and extend strict validation through array item schemas.

Latest continuation commits: `57f5fd9`, `99a574e`, `9e921b2`, `ef10442`, `70ba919`, `5b83952`.

**Next implementation:** continue bounded I-3 acceptance review for remaining deterministic result propagation, strict schema edge cases, egress/redirect boundaries, redacted trace invariants, and tenant-isolation regression coverage.

**STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

---

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

[architect-verified] The custom supabase.execute_sql action no longer requires the separate supabase-mgmt authorization when no active Management connection exists. A tenant/user/agent-scoped non-decrypting connection-existence check now gates the optional Management credential path, preserving the service-role/PostgREST fallback. Implementation 6719be8bec7cf9f6deeae30fb1c3ff01b108a9ea and aa99287f844c7b99c381666df98071878050e5f5; regression 457b07d7db82736a1b7724e4da1476ff9477fbe7. I-063 is RESOLVED by architect source review. Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

## 2026-10-06 — I-061 custom Management credential authorization correction

[architect-verified] The custom `supabase.execute_sql` action now re-authorizes the separate `supabase-mgmt` integration before reading its OAuth credential, preventing a secondary credential lookup from bypassing platform/plan/organisation/agent authorization. Implementation `5f6d044a2ec1d8ddacaf9bde553f17576c14732e`; regression `3ebbbf7113e851a427d310aee2d3a057a6b8ba83`. I-061 is RESOLVED. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.



## 2026-10-06 — I-057 OAuth refresh disable-race correction

[architect-verified] I-2 source review found that an in-flight OAuth refresh could restore credentials as active after a concurrent disable. The credential vault now requires active status for tenant-scoped refresh reads/writes, and the runner fails closed if the post-refresh active connection disappears. I-057 is RESOLVED. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
# CURRENT_PHASE.md

## 2026-10-08 — I-3 typed runner error boundary hardening

[architect-verified] Continued bounded I-3 Action Runner review found that deterministic classification still depended primarily on matching provider/error message text. The runner now has a host-owned `IntegrationRunnerError` with explicit `IntegrationErrorCode` and retryability, and the core runner plus egress policy use typed classifications for key boundary failures. Legacy/provider errors retain conservative compatibility heuristics. A focused regression verifies explicit classifications take precedence over misleading provider wording.

- Corrections: `6deba78a0ce6a167bb3004164cb0bea8a84c4153`, `3128347169fc107d444bb6b5d5004cdd26a6c9b9`, `2a867bff3b3a19a68d40ad16a9a90fa9f590eef3`, `3a93d4b371b12e966effc80c9a73fc73480fd8ee`.
- Scope: I-3 Action Runner error contract, egress failure classification, and focused regression only.
- No CI, Vercel, Gate-C, Gate-D, or continuous verification was awaited.
- I-2 remains implementation-complete with external verification deferred; I-3 remains the active implementation phase.

**Next implementation:** continue bounded I-3 acceptance review for remaining action-runner gaps, especially strict input-schema coverage, egress/redirect boundaries, redacted trace invariants, deterministic result propagation, and tenant-isolation regression coverage.

**STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

 — Active-Phase Contract

## 2026-10-06 — I-066 integration mutation entitlement resolution correction

[architect-verified] I-2 source review found that organisation enable/connect and agent enable mutation routes could use free-plan fallback limits when authoritative plan resolution failed. The bounded correction uses `resolveOrgPlanLimits()` for mutation authorization and fails closed with 503 on resolution errors. Implementation commits `e496018850c01edd540b4163a19f565f3fcae4d4` and `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98`; focused regressions `c1fcacb702b1124ac4d0502b37172287c053244f` and `48a76874b7f5d42a967a07e75ca21d26d47b4750`. I-066 is RESOLVED. Gate-C remains MISSING; Gate-D remains IN_PROGRESS.



## 2026-10-06 — I-065 OAuth expiry status must preserve explicit disable state

[architect-verified] Current I-2 source review found that OAuth expiry cleanup could overwrite a concurrent tenant/admin disable by updating connection status without requiring the current status to remain `active`. The bounded correction `c3ecd5d72940a2e8af4a53266e368c9d9e3dc8f7` adds the active-state predicate; regression `ac162b6ce439861c0c2ac9a2650971cd79411ef7` covers the SQL contract. I-065 is RESOLVED by architect source review. Gate-C remains MISSING; Gate-D remains IN_PROGRESS.



> ## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] Source review found a bounded I-2 credential-access bypass in the Activepieces cross-integration ConnectionsManager. The adapter now re-checks the authoritative execution authorization contract before retrieving another integration's credentials. Implementation `3a17c31cb16bfa54cb79a48a13a757ae16486971`; regression `4f86976b505487906d18e526b6433be360e97a8b`. I-055 is RESOLVED by architect source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

## CURRENT AUTHORITATIVE RECONCILIATION — 2026-10-05
> **This block supersedes stale earlier checkpoint prose in this document.** The active bounded work is **Integrations Framework I-2 — IMPLEMENTED / VERIFICATION PENDING**. The Final State Contract is **RECONCILED / CONSISTENT** at this checkpoint; I-2 is not closed because Gate-C executable evidence and the final architect Gate-D review are still outstanding. Phase 7 remains **PASS — CLOSED** and is not reopened.
>
> Current GitHub tip must be read from GitHub at recovery time. Latest bounded I-2 corrections in this continuation: I-052 usage-telemetry schema alignment and I-053 fail-closed plan-allowlist enforcement. These remain source-verified corrections only; Gate-C executable evidence is still missing and Gate-D remains open. Latest bounded I-2 source correction reviewed here: **I-066 — `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98` + regressions `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`** [architect-verified]. The current feature tip must still be read from GitHub at recovery time. ChatGPT is the implementation owner under D-024. **Z.AI is STOPPED; there is no active developer handoff.**
>
> Completed I-2 corrections: sensitive runtime observability redaction, organisation-scoped FLOW-store keys and access, agent/org ownership enforcement, migration sequence correction, I-2 database/RLS hardening, AI-visible action-output credential redaction, pre-execution action-input validation, and tenant-scoped OAuth access-token refresh with encrypted persistence, plus an outbound integration egress policy blocking non-public destinations and complete-payload trace redaction before truncation. Redirect following is also fail-closed in the generic runner (I-036). Project and agent scope are now modeled separately in the runner (I-037). Remaining verification is executable dependency/lock synchronization, build/test/typecheck/lint, connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and Gate-D. No I-3, MCP expansion, production promotion, or unrelated work is authorized.


> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-06 — Phase 7 CLOSED; Integrations I-2 active, implementation complete, verification pending; control reconciliation CONSISTENT at the current checkpoint**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance — the Phase 7-B implementation-authorization instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence register + the durable verification and phase-gate contract + the durable correction and issue-control workflow), `VERIFICATION_CHECKLIST.md` (canonical checklist/template), `ISSUES.md` (the durable issue register + the canonical issue-control system — I-014 and I-015 are `RESOLVED`; I-016/I-017 are `RESOLVED` — architect-verified), repository-root `worklog.md` (canonical historical audit trail), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan), **`docs/project-control/PHASE-7-PLAN.md` (the architect-reviewed Phase 7 planning package — the 7-A/7-B design source)**.

> **Closure state (2026-10-02, sub-phase 7-A):** Phase 6 — Correction and Issue-Control Workflow is **`CLOSED`** (architect re-review `PASS`, 2026-10-01). The architect reviewed the Phase 7 planning package — outcome **`PASS`** — and issued the Phase 7-A implementation authorization (2026-10-02) [architect-verified workflow actions]. The developer implemented 7-A (commit `688070a5`, `[developer-reported]`). The architect's review of the 7-A implementation returned `CORRECTION_REQUIRED` (CH-002 / issue I-016) [architect-verified — as communicated in the corrective handoff]. The developer applied the correction (commit `577189d4963121a64a696c59bd3fb16dacb3b61d`, `[developer-reported]`). **The architect's re-review of the Phase 7-A correction occurred 2026-10-02 and returned `PASS`** [architect-verified — as communicated in the Phase 7-A closure handoff]. **Sub-phase 7-A is `PASS — CORRECTION VERIFIED — CLOSED`; issue I-016 is `RESOLVED` (architect-verified disposition).** The ratified architectural decisions are recorded as D-021 (the D-P3 seam resolution) and D-022 (the phase-ladder reconciliation) in `DECISIONS.md`.


## 2026-10-06 — I-047 direct-connection limit correction

[architect-verified] Source review found that organisation-level connect could implicitly enable a previously-disabled integration without enforcing max_integrations. Commit 846c8d39add3430a5014c5573b3cc4d5ad86ee37 now checks the organisation grant before connection creation and enforces the current plan's integration count when connect would consume a new slot. Regression coverage is 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS; no I-2 PASS is claimed.


## 2026-10-06 — I-048 auth-type authority correction

[architect-verified] Source review found that runAction selected OAuth token-refresh behavior from the stored connection auth_type, while the connection API accepts authType input. Commit 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126 now uses the authoritative integration registry def.authType for ensureTokenFresh, preventing a mismatched connection field from suppressing OAuth refresh. I-048 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


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

[architect-verified] ChatGPT corrected a bounded ElevenLabs custom-action redirect error-message defect at `499feacf01907f82da9578b74cb8789931d10752`. Existing manual redirect handling remains fail-closed. I-2 stays **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.

## 2026-10-06 — I-044 credential-value error-boundary hardening

[architect-verified] The I-2 runner final error boundary now applies the same resolved-credential value redaction used for AI-visible outputs and HTTP traces, preventing provider-echoed credentials from bypassing field/pattern redaction in XRay, usage logs, or returned errors. Correction commit: `a8a1997f958c37b524451618eb0d3bb4a3746b5f`.

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-045 organisation downgrade-unwind correction

[architect-verified] I-045 was identified and corrected within I-2: organisation-level `disable`/`disconnect` operations no longer depend on plan-limit resolution, while `enable`/`connect` remain fail-closed against current plan entitlement. Correction `4c653b18c488661a9000f21f73344ce90d669b1a`; focused regression `289bb2a9dc8d40532479c62980f0ab110a600849`. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-046 AI availability plan-entitlement correction

[architect-verified] I-2 source review found that the AI-visible `integration_availability` tool exposed platform/org/agent-enabled integrations without applying the organisation's current plan allowlist. Commit `48a55826f4c45fe71c891bd68f71075fc363f8fc` now resolves the current plan and filters the availability surface by `allowed_plans`, while `integration_action` remains independently fail-closed. Regression commit: `b3d090a1644d1982e1709d095458db9c593a5d42`.

I-046 is RESOLVED by architect source review. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-054 runner execution-authorization correction

[architect-verified] I-054 is RESOLVED. `runAction()` now re-checks platform enablement, current plan entitlement, organisation grant, explicit agent scope, and the authoritative `agents.org_id` relationship before any integration action executes. Focused regression source covers plan downgrade, cross-tenant agent grant, and missing agent scope. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No I-2 PASS is claimed.


## 2026-10-06 — I-058 custom integration egress/redirect correction

[architect-verified] Custom ElevenLabs TTS/STT and Supabase REST fallback requests were brought under the host-owned egress and redirect boundary. I-058 is RESOLVED. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-059 Supabase Management API egress correction

[architect-verified] Source review identified a remaining credential-bearing native fetch in the custom Supabase Management API action outside the I-058 egress/redirect boundary. Commit `c7a2b7f4edb33cc919e2fe6c9a0bec2c981450be` now applies `assertSafeEgressUrl()`, manual redirect handling, and explicit 3xx rejection. I-059 is RESOLVED. I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS. Next bounded work remains source-level I-2 authorization/credential/egress review, followed by executable Gate-C evidence and final Gate-D review. No I-3, MCP expansion, production promotion, or unrelated implementation.


