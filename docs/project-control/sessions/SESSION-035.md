# SESSION-035 — Integrations I-1 current-state architect review

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Current branch tip: d9705441b016d565923f9e0813d7a22544aef8c8
Authorization: D-031

## Review target

Fresh-context review of the current I-1 Integrations Framework contract/test foundation after the recorded correction at bfc40f671aea218def571c617f00789e15b45823.

## Findings

- The corrected contract removes generic connection metadata and generic error-detail bags.
- Connection and credential-vault lookups require concrete connection IDs.
- Integration actions require zod-backed input schemas.
- The integration bridge is explicitly typed to the Phase 7 Unified Tool Runtime; no second executor is introduced.
- The threat model preserves host ownership of persistence, credential decryption, OAuth transport, egress/SSRF policy, and runtime execution.
- The current branch tip is d9705441; the correction commit bfc40f67 is an ancestor of the current tip.
- The current PR is #265. The connected GitHub Actions surface exposes no workflow run for the current feature head, and combined commit status exposes only the unrelated Vercel status.

## Architect disposition

**Gate D: PASS_WITH_FOLLOWUP.** The corrected I-1 contract boundary is architecturally acceptable, but executable Gate-C evidence is still required before I-1 can close.

No correction is authorized from this review. The next bounded action is to obtain executable CI evidence for the exact current head, then perform the final Gate-D closure review.

## Non-scope

No I-2, OAuth routes, persistence, credential-vault implementation, outbound HTTP/egress execution, integration action runtime, Activepieces dependency, deployment, billing changes, MCP runtime, or Phase 8 work.

## Stopping boundary

I-1 remains IMPLEMENTED — VERIFICATION PENDING.