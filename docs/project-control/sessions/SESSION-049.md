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


# SESSION-049 — I-2 owner continuation: telemetry schema and plan entitlement hardening

Date: 2026-10-06
Role: ChatGPT — architect / implementation owner / reviewer
Phase: Integrations I-2
Starting branch: `feature/ai-core-from-doable-source`
Starting verified control state: I-2 IMPLEMENTED — VERIFICATION PENDING; Z.AI STOPPED; no I-3/MCP/production scope.

## Work performed

- Re-read the active continuation controls and I-2 authorization boundary.
- Reviewed the current integration runtime against the authoritative 060 integration control-plane migration.
- Corrected the usage telemetry column mismatch: runtime now writes tenant/agent scope using `org_id`/`agent_id`.
- Added focused telemetry regression coverage.
- Audited plan entitlement enforcement for malformed `allowed_plans` values.
- Corrected fail-open entitlement behavior in AI execution, organisation enable/connect, and agent enable paths.
- Added focused regressions for malformed allowlist denial.

## Resulting commits

- `61c186b885084b9ff158d6e1f07636717527a184`
- `2446b86aafa99799e66e2f303df348a8cea12772`
- `83bf8c8737bb5d79590194f7efa3f30ffbb4dfd1`
- `cf2c74ec62343485148e9560e55e720092774f73`
- `53a2bfe2c1a8bc5066974cfa12a1188167feef1e`
- `5f9f6e3ae63314cc9d7b056f1e37d967282180fa`
- `3266c441f0c76398e51f9f36ab599444eb38f4c1`
- `6f4ea246beda935a7e46e301612d0e8cc21fa7a1`
- `b8312ed9348825a228677679730b1e04a619102d`

## Verification state

- Gate C: OPEN/MISSING; no CI/Vercel completion is awaited or inferred.
- Gate D: IN PROGRESS.
- Gate E: existing I-2 database evidence remains valid; no migration rerun.
- No I-2 PASS claimed.

## Stopping boundary

Continue only bounded I-2 source review/correction and later executable verification. No I-3, MCP expansion, production promotion, or unrelated implementation.
