# SESSION-048 — I-2 plan-enforcement continuation

Date: 2026-10-06
Role: ChatGPT — architect / implementation owner / reviewer
Phase: Integrations Framework I-2

## Continuation check

- Re-read the mandatory project-control continuity procedure and NEXT_ACTION contract before implementation.
- I-2 remains the only active bounded capability; Phase 7 remains PASS/CLOSED.
- Z.AI remains STOPPED; ChatGPT remains implementation owner under D-024.
- GitHub remains authoritative. No GitHub Actions/Vercel completion was used as a prerequisite for this bounded source correction.

## Work performed

1. Re-reviewed the agent integration grant route against the I-2 entitlement boundary and the recently corrected I-033 plan check.
2. Found a downgrade usability/security defect: applying the plan check to both enable and disable mutations could prevent a downgraded tenant from disabling an existing grant.
3. Corrected the route so current plan entitlement is required only when enabling an agent integration grant.
4. Corrected the focused route-test auth mock and added a regression test proving a downgraded tenant can disable the grant without invoking the plan resolver.
5. Recorded the finding as I-034.

## Evidence

- Source correction commit: a590c0f1efb5cff240e7f81437d4c6f9afa27bcb
- Focused regression test commit: f6a2c5b40a403f17d37d83971ad57fddf57f0b61
- Issue: I-034

## Verification disposition

Gate-C remains open because executable current-head test/typecheck/lint/build evidence has not been observed. Gate-D remains in progress. The source correction is architect-reviewed but does not close I-2.

## Stopping boundary

No I-3, MCP expansion, production promotion, OAuth transport expansion, or unrelated implementation was started.
