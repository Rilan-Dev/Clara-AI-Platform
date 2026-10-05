# PROJECT_STATE.md — Authoritative Current-State Summary

> ## CURRENT AUTHORITATIVE RECONCILIATION — 2026-10-05
> **This block supersedes stale earlier checkpoint prose in this document.** Repository truth at feature HEAD is **Integrations Framework I-2 — IMPLEMENTED / VERIFICATION PENDING**. The project-control Final State Contract is **RECONCILED / CONSISTENT** at this checkpoint; I-2 remains open because executable Gate-C evidence and final Gate-D review are incomplete. Phase 7 is **PASS — CLOSED** and is not reopened. I-1 remains historical/incomplete where its Gate-C evidence was never independently observed.
>
> Current feature branch: `feature/ai-core-from-doable-source`; current GitHub tip must be read from GitHub at recovery time. Latest bounded I-2 source correction reviewed here: **`4c653b18c488661a9000f21f73344ce90d669b1a`** [architect-verified]; regression coverage is **`289bb2a9dc8d40532479c62980f0ab110a600849`**. The current feature tip must still be read from GitHub at recovery time. ChatGPT is the implementation owner under D-024. **Z.AI is STOPPED; there is no active developer handoff.**
>
> Completed I-2 corrections now include runtime trace redaction, organisation-scoped integration-store access, agent/org ownership enforcement, migration sequencing, database/RLS hardening, AI-visible action-output credential redaction, pre-execution action-input validation, and tenant-scoped OAuth access-token refresh with encrypted persistence, plus an outbound integration egress policy blocking non-public destinations and complete-payload trace redaction before truncation. Redirect following is also fail-closed in the generic runner (I-036). Project and agent scope are now modeled separately in the runner (I-037). The remaining bounded blockers are: Activepieces package manifest/lockfile synchronization, executable current-head build/test/typecheck/lint evidence, connector/OAuth smoke, browser verification, real connector/OAuth smoke where credentials are available, current-head browser verification, and final immutable/runtime/secret/governance scans. No I-3, MCP expansion, production promotion, or unrelated feature work is authorized.


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

## Current phase

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
