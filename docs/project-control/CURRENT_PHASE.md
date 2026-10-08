## CURRENT AUTHORITATIVE PHASE — 2026-10-09 — INTEGRATION RUNTIME DISPATCH

[architect-verified] Active bounded task: organisation integration setup plus AI access. OAuth app configuration input validation is implemented and focused regression source added. Provider chat and realtime voice dispatch are not yet complete, so the task remains IN PROGRESS.

- Commits: `175803e3b30605baf8546e49878c4a5d4dcf9255`, `99aab21e6e31436073ed2ffe638c216f5f818a2a`, `7c0614d878c43ac50ec3e89d4c017a690c379d42`, `e8f1a1cf3b0bdcaea81a83a609a3be20bf5737d4`.
- External CI/Vercel/Gate verification is deferred and is not a blocker.

**Next implementation:** wire provider chat tool-call dispatch through the Unified Tool Runtime; then wire realtime voice to that same runtime.

**STOP:** no broad unrelated provider rollout, billing redesign, production promotion, or changes to unrelated integrations.

---

# CURRENT AUTHORITATIVE NEXT ACTION — 2026-10-09 — ORGANISATION INTEGRATION SETUP + AI ACCESS

[architect-verified] Owner-authorized integration usability/runtime task supersedes the prior "no authorized next implementation" state. The immediate defect is that organisation credential setup relies on a raw text/JSON field and does not guide users through provider-specific credentials. Agent access already enforces platform enablement, organisation grant, connection readiness, plan entitlement, and per-agent grants.

### Implemented in this task
- `src/features/admin/screens/org-integrations-screen.tsx` now renders structured credential fields using registry `customAuthFields` where available, with explicit fallback fields for secret-text, OAuth2, and basic-auth integrations.
- Added validation for required fields, request failure messages, success feedback, reconnect/update credentials flow, and a copyable OAuth callback reference.
- UI explicitly clarifies that the callback reference is not an interactive OAuth consent/token-exchange flow; do not represent OAuth as complete until a real server-side callback/state/token exchange is implemented.
- Commit: `5e6c99c06e1fa314c229e83de84832a6e6502b66`.

### Still required in this bounded task
1. Add a secure platform-level OAuth app configuration path for provider client IDs/secrets and callback configuration, using encrypted persistence and never echoing secrets.
2. Ensure provider chat tool-calling dispatch can invoke `integration_availability` and `integration_action` through the Unified Tool Runtime with provenance-verified tenant/agent/user context.
3. Ensure realtime voice agent tool invocation can reach the same authorised integration runtime without introducing a parallel executor or exposing credentials to the model.
4. Update focused regressions and project-control records as source implementation progresses.

### Security/rollout constraints
- Never return stored secret values to the browser.
- Keep exact platform → organisation → agent grants and plan entitlement checks.
- Integration execution must remain in the Unified Tool Runtime / existing runner; do not call provider APIs directly from UI.
- Do not fabricate an OAuth callback or claim a working OAuth flow from a displayed URL.
- Do not wait for CI, Vercel, Gate-C/Gate-D, or continuous verification; report external verification as deferred.
- Next implementation: continue the secure OAuth configuration/runtime dispatch items above, starting with actual route and provider-tool contracts.
- STOP: no broad unrelated provider rollout, billing redesign, production promotion, or changes to unrelated integrations.

---

## I-6 FINAL IMPLEMENTATION RECORD — 2026-10-09

[architect-verified] Final bounded source review is complete. The resolver runtime-shape boundary is enforced before both public tool-definition construction and enabled runtime creation. The empty-request case is therefore fail-closed for malformed resolvers as required by the I-6 trust boundary.

- Final source correction: `74e410e2e21cb641b33e660981877a555cabfc96`
- I-6 implementation status: **COMPLETE**.
- Overall external verification remains separately deferred; no executable Gate/CICD/Vercel PASS is claimed.
- No additional I-6 implementation work remains.

**Next:** use only a newly authorized project-control action for the next implementation; no I-7 scope is inferred or invented.

---

## I-6 BOUNDED HARDENING — IMPLEMENTATION COMPLETE — 2026-10-08

[architect-verified] The I-6 MCP Tool Bridge source implementation is complete. Final hardening closes resolver runtime-shape validation, default-off runtime construction, exact execution-context binding, allowlist/capability authorization invariants, schema validation boundaries, normalized-name collision handling, and transactional registration bookkeeping.

- Final implementation: `63fe42e176e95732a46c3c16f20c586ab025ce99`
- I-6 implementation status: **COMPLETE**.
- Overall phase status remains **IN PROGRESS** because external verification evidence has intentionally not been awaited.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE — FINAL REGISTRATION CORRECTION

[architect-verified] I-6 MCP Tool Bridge implementation is complete within the bounded plan. The final registration invariant records normalized MCP identity only after successful Unified Tool Runtime registration, allowing a later identical capability to retry after a registration rejection without silently being skipped.

- Implementation: `a215bb81b1bf53f1c4c98d5205aa841bb2a0ee43`
- Regression: `e4cdc946a15b76a004e4123be5eaf060b4edcd9d`
- Status: **IMPLEMENTATION COMPLETE — EXTERNAL VERIFICATION DEFERRED**.

**STOP:** no MCP transport/server hosting, OAuth/persistence expansion, marketplace/catalog, broad provider rollout, production promotion, billing redesign, or unrelated implementation under I-6.

**Next:** await a newly authorized project-control implementation action; do not invent I-7 scope.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 IMPLEMENTATION COMPLETE

[architect-verified] I-6 MCP Tool Bridge bounded implementation is complete. All implementation-side acceptance requirements in the I-6 plan are represented in the AI Platform Core seam, including fail-closed authorization, exact execution-context preservation, runtime input-schema enforcement through Unified Tool Runtime, resolver-boundary validation, deterministic naming/collision protection, default-off behavior, and public export.

Latest commits:
- Implementation: `aa6951a499fd66c40a467c646332d8cacd019648`
- Regression: `17c925a11a478d910779c3ce77e946500252ed67`

Status: **IMPLEMENTATION COMPLETE — EXTERNAL VERIFICATION DEFERRED**.

**STOP:** Do not add MCP transport/server hosting, OAuth/persistence expansion, marketplace/catalog work, broad provider rollout, production promotion, billing redesign, or unrelated implementation under I-6.

**Next:** await/record the next explicitly authorized project-control implementation action; no new I-7 scope is inferred from I-6 completion.

---

## CURRENT AUTHORITATIVE I-6 STATE — 2026-10-08 — REGISTRATION BOUNDARY HARDENING

[architect-verified] The MCP runtime builder validates the injected resolver before registration iteration, including the empty-request case. Malformed resolver input fails closed instead of producing a misleading empty runtime.

- Implementation: `a885eac30a6b6ce8056ecc57091f6319d8d032a2`
- Regression: `bbdedae0497fc4b01ae0a4a4f4eb42e520add55c`
- I-6 remains IN PROGRESS; external CI/Vercel/Gate evidence is deferred.

**Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 MCP RESOLVER SHAPE HARDENING

[architect-verified] I-6 continues as bounded MCP Tool Bridge implementation. The injected resolver boundary now validates its runtime shape before the bridge binds resolver execution, preventing malformed host adapters from crossing the public builder boundary.

- Implementation: `d6ee7f8acd007ffe0b687f9acd7a1522e28efcab`
- Regression: `6fda566ecfe25361ee2bbf1901433ec46609fc53`
- Status: IN PROGRESS — bounded source hardening; external verification deferred.

**Next implementation:** continue bounded I-6 registration and capability-authorization invariant review.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, marketplace, production promotion, billing redesign, or unrelated implementation.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 RESOLVER REQUEST IMMUTABILITY CORRECTION

[architect-verified] I-6 source hardening continues under the owner instruction to keep implementation moving without waiting for external CI/Vercel or phase gates.

- The resolver receives a frozen request snapshot containing the authorized server/tool identity and provenance-verified execution context.
- Malformed `requireUserId` policy values are rejected fail-closed.
- Implementation: `9cfec56c90da88e367ac543e174716639802862b`
- Regression: `7ac7557abeb700f0a3a42ffd44ce58346c0b165a`
- Status: IN PROGRESS — bounded source hardening; external verification deferred.

**Next implementation:** continue bounded I-6 resolver/registration and capability-authorization invariant review.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, marketplace, production promotion, billing redesign, or unrelated implementation.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 MCP RUNTIME ISOLATION CORRECTION

[architect-verified] I-6 implementation continues under owner authorization without waiting for external CI/Vercel or phase gates.

- `9eaf90d1a01697a9dc7481290bfbf25813e88828` corrects `buildMcpToolRuntime()` to construct an isolated Unified Tool Runtime using Clara authorization/metering bindings without registering unrelated RAG/integration tools.
- This restores the I-6 capability-set isolation contract and aligns the existing focused runtime regression with the source implementation.
- Status: IN PROGRESS — bounded source hardening; external verification deferred.

**Next implementation:** continue bounded I-6 resolver/registration and capability-authorization invariant review.

**STOP:** no MCP transport/server hosting, broad provider rollout, OAuth/persistence expansion, marketplace, production promotion, billing redesign, or unrelated implementation.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 MCP TOOL BRIDGE ACTIVE

[architect-verified] I-6 exact authorization now uses a server/tool pair allowlist. The coarse server boundary remains required, while the authoritative pair entry must match both identities exactly. This prevents cross-product authorization when multiple MCP servers/tools are configured.

- Implementation: `37ae1f648df78cd651bd7eecec0bcce1fd3847c0`
- Regression: `a0ac98adacadbd77d78e98cb88bd49fac49e7167`
- Status: IN PROGRESS — bounded source hardening; external verification deferred.

---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-6 MCP TOOL BRIDGE ACTIVE

[architect-verified] Owner instruction advances implementation to **Integrations Framework I-6 — MCP Tool Bridge**. I-3 is already implemented and I-4/I-5 are source-complete; this phase does not reopen them. External CI/Vercel/Gate-C/Gate-D evidence remains deferred.

### I-6 implementation contract
- MCP tools arrive through an injected, already-resolved host adapter.
- Server/tool identity is exact-allowlisted and resolver output must match the authorized request exactly.
- MCP is default-off through `ENABLE_MCP`.
- MCP tools become existing Clara `ToolDefinition` objects.
- Invocation uses the existing Unified Tool Runtime; no second executor is created.
- Provenance-verified `PlatformExecutionContext` is mandatory and preserved unchanged through invocation.
- Tool schemas are supplied by the resolver and validated by the Unified Tool Runtime.
- Resolver discovery failures fail closed; credentials never enter definitions or metadata.
- The bridge is exported through the public `ai-platform-core` seam.
- No MCP transport, persistence, OAuth callback, marketplace, or deployment work is in scope.

Latest I-6 implementation commits: `9e855c7`, `012aca0`, `95b75a8`, `fb326688`, `b59f1c9`, `827eae5`, `d571813`, `0b1856b`, `ff64b9b`, `12815df`, `d90cddbe`.

Latest hardening: caller-owned policy/descriptor mutation is snapshot-bound at definition construction; normalized-name collisions are fail-closed instead of silently skipped.

**Status:** IN PROGRESS — bounded source hardening; external verification deferred.

---
---

## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-4/I-5 ACTIVE

[architect-verified] Explicit owner authorization advances implementation to **Integrations Framework I-4/I-5** without waiting for external CI/Vercel or phase gates. I-2 remains externally unverified; I-3 external verification is likewise deferred. This is an implementation continuation, not a Gate-C/Gate-D closure.

### I-4 — Unified Tool Runtime bridge
- Connected integration actions are represented as Clara-owned `ToolDefinition` objects.
- Input schemas reuse the I-3 strict action-property validator through Zod refinement.
- Tool names are deterministic and bounded to the Phase 7 runtime contract.
- Connected action discovery checks platform, plan, organisation, agent and active user/agent connection scope.
- Invocation delegates to the existing Unified Tool Runtime and then `runAction()`; credentials never enter the tool definition.

### I-5 — First Provider Pilot
- Provider: Firecrawl.
- Action: `search`.
- Feature flag: `ENABLE_INTEGRATION_PROVIDER_PILOT`.
- Exact allowlist; default-off.
- Existing I-2 connection lifecycle supplies connect/disconnect; I-4 supplies runtime execution.

Current implementation commits: `f44caf5`, `a86ffd5`, `6be5dd5`, `9d746ed`, `8927e2c`, `829667e`, `b5f9640`, `92c611a`.

**Next implementation:** finish I-4/I-5 source integration, focused regressions, project-control/worklog reconciliation, and then treat external CI/Vercel/Gate-C/Gate-D as deferred evidence rather than a development blocker.

**STOP:** no MCP expansion, broad provider rollout, production promotion, or unrelated work.

---

## 2026-10-08 — I-3 strict array-item schema correction

[architect-verified] Bounded I-3 source review found strict array validation treated null/empty primitive elements as missing and therefore skipped type enforcement. The validator now treats array elements as values and rejects null, empty, or wrong-typed primitive items; nested object/array validation remains recursive.

- Implementation: `6db1b45e0213bba4b53a2675c328bad0f7bdcb7c`
- Regression: `d12d43509463eedeba712b1b657c04cecb8475bb`
- No CI, Vercel, Gate-C, or Gate-D execution was awaited.
- I-3 remains IN PROGRESS; no phase closure is inferred.


## 2026-10-08 — I-3 failure-result trace propagation

[architect-verified] Bounded I-3 source review found that `runAction()` accumulated redacted HTTP traces during execution but omitted them from failed `RunActionResult` responses. The runner now keeps one per-run trace collection across custom/piece execution and returns the redacted trace set on failure.

- Correction: `77b806f65d002b53bb6a7d04294ec0164dc392d5`
- No CI, Vercel, Gate-C, or Gate-D execution was awaited.
- I-3 remains IN PROGRESS; this is implementation evidence only.
- Next bounded work remains strict schema edge cases, deterministic result propagation, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression coverage.


## CURRENT AUTHORITATIVE PHASE — 2026-10-08 — I-3 ACTIVE

[architect-verified] By explicit owner authorization, implementation advances to **Integrations Framework I-3 — Action Runner**. I-2 remains implementation-complete with external verification deferred; no I-2 PASS is inferred. I-3 is now the active bounded implementation track.

I-3 deliverables: bounded integration execution, strict/pre-execution action validation, host-owned egress/SSRF enforcement, deterministic error normalization, redacted tracing, and tenant-isolation regression coverage. Current source corrections keep DNS/private egress failures and redirect rejection on explicit host-owned error classifications and extend strict validation through array item schemas.

Latest continuation commits: `57f5fd9`, `99a574e`, `9e921b2`, `ef10442`, `70ba919`, `5b83952`.
Latest continuation commits now also include `d3c18c3`
Latest continuation also includes `d0799b3` and `c764fa4`, extending redacted trace invariants to arbitrary thrown HTTP errors containing known secret values. and `62ef2fe`, making registry-approved/package-missing action lookup and strict input rejection deterministic typed runner failures.

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




## 2026-10-08 — I-3 malformed action-props boundary correction

[architect-verified] Continued bounded I-3 Action Runner review found a runtime-input gap: RunActionParams.props is typed as a record, but AI/direct callers can still supply null or an array at runtime. The strict validator previously traversed such values as if they were valid property maps, risking an exception or a misleading downstream execution failure instead of a deterministic pre-execution INVALID_INPUT result.

- Implementation: 7aa1ebc8521c377684c711d97710e0614f66b4e3
- Regression: 8ac329d38af49a6c3acba22ac25935fb8b151c3c
- Scope: runtime action-props shape validation only; no integration behavior, authorization, persistence, or schema semantics changed.
- I-3 remains IN PROGRESS; no Gate-C/Gate-D execution or phase closure is inferred.

Next implementation: continue bounded I-3 acceptance review for strict schema edge cases, deterministic result propagation, egress/redirect boundaries, redacted trace invariants, and tenant-isolation regression coverage.

STOP: no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-08 — I-3 redirect egress classification correction
[architect-verified] The active I-3 Action Runner now preserves the typed host-owned egress classification when a validated HTTP redirect targets a private, loopback, link-local, or otherwise blocked destination. Only malformed redirect locations are classified as REDIRECT_BLOCKED. Focused regression coverage verifies EGRESS_BLOCKED propagation and trace state.
- Implementation: 42527f0a2c83e8b7d3d6baa5fd70c8d1c2dd7d78
- Regression: e74b9f6f1e82102474ccb53c56da3931fde3fdd6
- I-3 remains IN PROGRESS; no external verification or phase closure is inferred.
- Next implementation: deterministic result propagation, strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression coverage.


## 2026-10-08 — I-3 strict validation fail-closed correction
[architect-verified] Strict action-property validation now fails closed when an action has no usable property schema: supplied properties are rejected as not allowed, while empty props remain valid. Non-strict callers retain the previous compatibility behavior.
- Implementation: d6bdaa4238b9694430a4a484af2eb480f28fa5eb
- Regression: d90a314df428bd13d18a6655a81bd498945d549e
- I-3 remains IN PROGRESS; no external verification or phase closure is inferred.


### I-6 Follow-up — 2026-10-08
- Removed an unused context-value snapshot from the MCP resolver path after exact execution-context object binding became the authoritative invariant.
- Commit: `9e3ab09931ea10584803f51feb6073c2eafce06f`.
- External CI/Vercel/Gates were not awaited.
- Next: continue bounded I-6 registration/capability-authorization invariant review.


## 2026-10-09 — Integration discovery hardening / dispatch remains active

[architect-verified] Connected integration discovery requires user and agent identity and scopes candidates by active connection, platform enablement, organisation grant, agent grant/ownership, and plan allowlist. Execution remains in Unified Tool Runtime and the existing runner. Commits: `8aac1c8a5b0e4f61c3f36f2d416c0fc3da6102b5`, `e0a3001e6911fc896df0611e83756c78ecb22da4`, `d722ff3f547a00b90c027b45e479944aa3cf9827`. Next: wire provider chat and realtime voice call sites to the shared runtime without changing Clara/Qdrant RAG behavior. Secure OAuth configuration remains pending. External verification is deferred.
