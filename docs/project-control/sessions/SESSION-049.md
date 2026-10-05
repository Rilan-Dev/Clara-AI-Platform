# SESSION-049 — I-2 organisation downgrade correction

Date: 2026-10-06
Role: ChatGPT — architect / implementation owner / reviewer
Phase: Integrations Framework I-2
Starting repository state: feature branch current tip `9f0d74ada8046576e155181a6afe013ee00f8dcc`.

## Work performed

1. Re-read the mandatory project-control continuation path and confirmed I-2 remains the only active bounded capability; Phase 7 remains PASS/CLOSED and Z.AI remains STOPPED.
2. Re-checked the I-2 implementation against D-032 and the integrations plan without waiting for GitHub Actions or Vercel.
3. Audited the organisation integration control route for plan-entitlement symmetry with the already-corrected agent integration route.
4. Found I-045: the organisation integration POST route applied the current plan entitlement check to `disable` as well as `enable`, so a downgraded tenant could be unable to remove an integration it was no longer entitled to use.
5. Corrected the route so only `enable` and `connect` require current plan entitlement. `disable` and `disconnect` remain available as downgrade-unwind operations.
6. Added focused route regression coverage for downgrade-disable success without plan-limit resolution and for entitlement rejection when enabling.

## Evidence

- Source correction: `4c653b18c488661a9000f21f73344ce90d669b1a`
- Regression test: `289bb2a9dc8d40532479c62980f0ab110a600849`
- Issue: I-045
- Control record: `14e2ba17fd67f50db33897dff215f57e66ca5ca4`

## Verification disposition

The correction is architect-reviewed at source level and recorded RESOLVED. Executable Gate-C evidence remains pending for the overall I-2 phase; no I-2 PASS is claimed.

## Stopping boundary

No I-3, MCP expansion, production promotion, OAuth transport expansion, provider rollout, migration, billing redesign, or unrelated implementation was started. Next bounded work remains I-2 verification and only further concrete corrections found within that boundary.
