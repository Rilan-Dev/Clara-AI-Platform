# CURRENT_PHASE.md — Active-Phase Contract

> ## CURRENT AUTHORITATIVE RECONCILIATION — 2026-10-05
> **This block supersedes stale earlier checkpoint prose in this document.** The active bounded work is **Integrations Framework I-2 — IMPLEMENTED / VERIFICATION PENDING**. The Final State Contract is **RECONCILED / CONSISTENT** at this checkpoint; I-2 is not closed because Gate-C executable evidence and the final architect Gate-D review are still outstanding. Phase 7 remains **PASS — CLOSED** and is not reopened.
>
> Current GitHub tip must be read from GitHub at recovery time. Latest reviewed I-2 implementation source commit: **`3305c9027ddcef4fff0520d941dfebc73f9ef94a`** [architect-verified]; subsequent control-only reconciliation commits do not change the implementation scope. ChatGPT is the implementation owner under D-024. **Z.AI is STOPPED; there is no active developer handoff.**
>
> Completed I-2 corrections: sensitive runtime observability redaction, organisation-scoped FLOW-store keys and access, agent/org ownership enforcement, migration sequence correction, I-2 database/RLS hardening, AI-visible action-output credential redaction, pre-execution action-input validation, and tenant-scoped OAuth access-token refresh with encrypted persistence, plus an outbound integration egress policy blocking non-public destinations and complete-payload trace redaction before truncation. Redirect following is also fail-closed in the generic runner (I-036). Project and agent scope are now modeled separately in the runner (I-037). Remaining verification is executable dependency/lock synchronization, build/test/typecheck/lint, connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and Gate-D. No I-3, MCP expansion, production promotion, or unrelated work is authorized.


> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-06 — Phase 7 CLOSED; Integrations I-2 active, implementation complete, verification pending; control reconciliation CONSISTENT at the current checkpoint**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance — the Phase 7-B implementation-authorization instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence register + the durable verification and phase-gate contract + the durable correction and issue-control workflow), `VERIFICATION_CHECKLIST.md` (canonical checklist/template), `ISSUES.md` (the durable issue register + the canonical issue-control system — I-014 and I-015 are `RESOLVED`; I-016/I-017 are `RESOLVED` — architect-verified), repository-root `worklog.md` (canonical historical audit trail), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan), **`docs/project-control/PHASE-7-PLAN.md` (the architect-reviewed Phase 7 planning package — the 7-A/7-B design source)**.

> **Closure state (2026-10-02, sub-phase 7-A):** Phase 6 — Correction and Issue-Control Workflow is **`CLOSED`** (architect re-review `PASS`, 2026-10-01). The architect reviewed the Phase 7 planning package — outcome **`PASS`** — and issued the Phase 7-A implementation authorization (2026-10-02) [architect-verified workflow actions]. The developer implemented 7-A (commit `688070a5`, `[developer-reported]`). The architect's review of the 7-A implementation returned `CORRECTION_REQUIRED` (CH-002 / issue I-016) [architect-verified — as communicated in the corrective handoff]. The developer applied the correction (commit `577189d4963121a64a696c59bd3fb16dacb3b61d`, `[developer-reported]`). **The architect's re-review of the Phase 7-A correction occurred 2026-10-02 and returned `PASS`** [architect-verified — as communicated in the Phase 7-A closure handoff]. **Sub-phase 7-A is `PASS — CORRECTION VERIFIED — CLOSED`; issue I-016 is `RESOLVED` (architect-verified disposition).** The ratified architectural decisions are recorded as D-021 (the D-P3 seam resolution) and D-022 (the phase-ladder reconciliation) in `DECISIONS.md`.


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