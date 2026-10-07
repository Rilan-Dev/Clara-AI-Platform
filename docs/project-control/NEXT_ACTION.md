# ACTIVE AUTHORITATIVE TRANSITION — 2026-10-08 — I-3 AUTHORIZED

[architect-verified] The owner has explicitly authorized advancing implementation to **Integrations Framework I-3 — Action Runner**, while I-2 external verification remains deliberately deferred. This is not an I-2 Gate-C/Gate-D PASS and not a production promotion.

- I-2 application implementation is treated as complete for implementation purposes; executable/current-head verification remains deferred by owner instruction.
- I-3 remains restricted to bounded action execution, strict input validation, host egress/SSRF enforcement, deterministic error normalization, redacted tracing, and tenant-isolation regression coverage.
- I-4 Tool Runtime bridge, I-5 provider rollout, MCP, production promotion, and unrelated work remain out of scope.
- Latest I-3 continuation commits: `57f5fd9e22904eee39759a8c06891e73fc8fd513`
- Latest I-3 continuation commits now include `d3c18c3669555f062dd0fae3613cdb9d39ef79ba` and `62ef2fea18c93225dbc2815cbde67f1da72af621`, which make action-lookup and strict-input failures explicit typed runner results and add regressions for deterministic propagation., `99a574e60efd217463628eaa26369c6d515cdfb7`, `9e921b24a53d00fb14287db9a7e274fdf376da8b`, `ef1044273b5fcc143585ddb5fb682dceb08be1b8`, `70ba919fede3c0652a9ced5d6feee88e5119fcbb`, `5b839525bd46de4cc9d07834970e351c2ac2e06e`.
- These corrections keep egress/DNS/redirect failures
- Latest I-3 continuation also includes `d0799b370801d1b1319910876f7053e41d92f66d` and `c764fa4bea306fee7f5447ca8e025ec4c2a330d2`, which scrub known secret values from arbitrary fetch errors before trace emission and add a focused regression. on the host-owned typed error contract, record redacted trace entries for blocked outbound attempts, and validate array item schemas recursively in strict action-input mode.
- External CI/Vercel execution is not awaited.

- Runner correction: `77b806f65d002b53bb6a7d04294ec0164dc392d5` now preserves the per-run redacted HTTP trace collection in failed `RunActionResult` responses, so failure results retain deterministic trace evidence instead of dropping it.

- I-3 strict-schema correction: `6db1b45e0213bba4b53a2675c328bad0f7bdcb7c` rejects null/empty/wrong-typed array elements instead of treating them as optional missing fields; regression `d12d43509463eedeba712b1b657c04cecb8475bb` covers primitive array items.
- I-3 trace correction: `f4c827749065f679d1f79bcdace581f1c5e15903` prevents redirect failures from being recorded twice; regression `8cd183ed2601ac4af43fdba84661fb05f87b5924` asserts one deterministic trace entry.
**Current next implementation:** continue bounded I-3 acceptance review, focusing on remaining deterministic result propagation, strict schema edge cases, redirect/egress boundary coverage, redacted trace invariants, and tenant-isolation regression coverage.

---

## 2026-10-08 — Agent-scoped integration disconnect authorization correction

[architect-verified] Continued bounded I-2 authorization review found that the prior agent-scoped permission correction ran only after the `disconnect` branch, so an `agentId` supplied to disconnect could reach the database under organisation-level permission alone. The route now imports and applies `requireAgentPermission(auth, agentId, "config:update")` before all agent-scoped enable/connect/disconnect mutations, retaining the organisation identity check. This also corrects the missing RBAC import introduced by the prior correction.

- Correction: `8512d960fc7a53beb60849f6823fe9ac7d0834f3`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, authorization, custom-action, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-08 — Agent-scoped integration mutation authorization correction

[architect-verified] Bounded I-2 authorization review found the organisation integration mutation route accepted an optional `agentId` while checking only organisation-level `config:update`. That allowed an organisation member with the org permission to target an agent without an explicit agent-level permission check. Agent-scoped enable/connect/disconnect mutations now require `requireAgentPermission(auth, agentId, "config:update")` and retain the organisation identity check before database mutation.

- Correction: `7b5bed88519884278fa8863d5878ece8d2fc3875`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, authorization, custom-action, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-08 — Integration disconnect tenant/user-scope correction

[architect-verified] Bounded I-2 source review found the organisation integration disconnect mutation could delete every connection for an integration across the organisation when no agentId was supplied. Because connection rows carry user ownership, an org-level configuration request must not implicitly delete another user's credential-bearing connection. The delete is now constrained to the requesting user (while retaining explicitly shared org connections with NULL user_id) and the optional agent scope.

- Correction: `ef9978245c09c980e37f9208e708695508d13ee6`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, authorization, custom-action, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — Credential-vault contract coverage alignment

[architect-verified] Bounded source review found the credential-vault focused test contract had remained on the older unscoped `updateStatus()` SQL shape after the I-2 credential lifecycle hardening. The test fixture is now aligned with the current scoped status-transition contract and the newly introduced optimistic `claimed_at` refresh-write guard. This is verification-support maintenance only; no test execution was performed.

- Correction: `eec6767268c6d2b78f96daabb5180c094741aa61`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 implementation/support corrections if identified. Do not wait for CI/Vercel/gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — OAuth concurrent-refresh stale-write correction

[architect-verified] Continued the bounded I-2 credential/connection review. The OAuth refresh path already failed closed on disabled/disconnected connections, but concurrent refreshes could still both read the same pre-refresh credential state and a later stale refresh could overwrite a newer rotated token. The credential vault now supports an optional expectedClaimedAt compare-and-update predicate over the encrypted credential JSON; the refresh path supplies the timestamp it actually refreshed from. A stale concurrent writer therefore updates zero rows and the runner aborts rather than overwriting newer credentials.

- Credential-vault correction: `0ef4a40038c8fc8059b09980c2ffc830f45c1c72`
- Refresh-path correction: `03b4b46dbef176fd8acaa2cbe7061e8cdd313848`
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.
- **Next planned work:** continue only concrete bounded I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, tenant-boundary, or deployment-resource corrections if identified. Do not wait for CI/Vercel/gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — Optional multilingual embeddings resource containment correction

[architect-verified] Bounded self-hosted resource-hardening review found the opt-in multilingual embeddings service was the remaining Compose service without explicit CPU/RAM/PID ceilings. Although it is not started by the normal deployment script, enabling the profile could bypass the host resource-containment policy while loading the multi-GB embedding model.

- Correction: `18ce0d907ab32969ff3259a6c933a5ebc83134b4`.
- `docker-compose.yml` now caps embeddings at 2 CPU, 4096 MiB memory, and 512 PIDs, with a 2048 MiB memory reservation and matching swap ceiling.
- No tests, CI, Vercel build, Gate-C, or Gate-D execution was awaited.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; this is deployment/resource hardening within the existing bounded scope.
- **Next planned work:** continue only concrete bounded I-2/deployment resource-control corrections if identified; otherwise remain at the I-2 boundary. Do not wait for CI, Vercel, or gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — Self-hosted resource containment + Vercel manual-only deployment

[architect-verified] Owner-directed deployment hardening was applied after Clara Docker deployments were observed making the Linux home server/VPS unreachable under resource pressure. The root cause was not one runaway runtime container alone: backend and worker builds could contend concurrently for CPU/RAM/disk, while the runtime stack had no explicit container CPU/RAM/PID ceilings. The stack now has explicit runtime limits, worker concurrency defaults are reduced to 1/1, and `scripts/vps-deploy.sh` builds backend, worker, and RabbitMQ bridge serially before starting services. This prevents Docker image creation from competing across heavyweight targets and prevents a runtime service from consuming the whole host.

- Runtime ceilings are intentionally conservative and can be raised per host only after observing stable resource usage.
- Multilingual embeddings remains opt-in via its existing Compose profile and is not started by the normal deployment script.
- `vercel.json` now sets `git.deploymentEnabled: false`; GitHub Actions already has only `workflow_dispatch`. Vercel automatic Git deployments are therefore disabled by repository configuration, while manual CLI/API deployment remains the intended path. Vercel's current Hobby plan does not expose the higher-level deployment-policy API, so no unsupported dashboard policy mutation is claimed.
- The Vercel config provenance check was updated to the new file blob SHA so the manual CI workflow remains internally consistent.
- This is deployment/resource hardening only. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; no Gate-C/D PASS is inferred.

**Self-hosted deployment:** use `bash scripts/vps-deploy.sh`, not `docker compose up -d --build`. The latter can reintroduce concurrent heavy builds on small hosts.

**Vercel deployment:** use an explicit manual deployment from the linked local checkout, for example `vercel --prod`, after linking the checkout to `clara-backend`. Do not rely on Git push to deploy.

**STOP:** no I-3, MCP expansion, production promotion through Git automation, or unrelated implementation.


## 2026-10-07 — Docker build dependency-stage performance correction

[architect-verified] Local Docker Compose build telemetry showed the backend and worker each executing a full `npm ci` concurrently from separate Dockerfiles. Both dependency stages consumed about 3408 seconds (~56m48s), while the RabbitMQ bridge image export/unpack consumed about 597 seconds (~10m) under the resulting host resource pressure. The root cause was duplicated installation of the large Activepieces dependency graph plus concurrent CPU/RAM/network contention.

- The bounded Docker correction moves backend and worker to one multi-stage `Dockerfile` with a shared `deps` stage and BuildKit npm cache.
- `docker-compose.yml` now builds `clara-worker` from the same Dockerfile using the `worker` target; the duplicate `Dockerfile.worker` is removed.
- This is build-system/resource hardening only; I-2 remains **IMPLEMENTED — VERIFICATION PENDING** and no Gate-C/D PASS is inferred from the source change.
- Required next evidence: rerun the local Compose build and capture elapsed time/resource behavior, then continue the existing Gate-C executable verification sequence.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 egress regression coverage: hexadecimal IPv4-mapped IPv6

[architect-verified] Continued the bounded I-2 security review without waiting for GitHub Actions or Vercel. The egress guard already decoded hexadecimal IPv4-mapped IPv6 destinations; the regression suite now explicitly covers ::ffff:7f00:1 so that loopback encoded in hexadecimal cannot regress into an SSRF bypass.

- Regression: e8403571572995d34053f2245b3c09c9cab28fa0
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; this is bounded verification-support work, not phase closure.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-073 OAuth refresh endpoint integrity correction

[architect-verified] Bounded I-2 source review found that OAuth refresh used the connection-stored `token_url` as the credential-bearing destination even though the registry already defines the authoritative OAuth token endpoint. The runner now receives `def.oauth2Config?.tokenUrl`, rejects mismatched stored metadata, and constructs the refresh URL from the registry value.

- Implementation: `59957d4ea03dfb89f8a90c9976322aae86821e73`, `6b781ed042003bd62f056d35b9f5952176b5cb73`
- Regression: `db0284111f94955c038e60bbb62fc59068d208a4`
- I-073: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-072 connection auth-type authority correction

[architect-verified] Bounded I-2 source review found organisation connection creation persisted caller-supplied `authType`, allowing stored connection metadata to diverge from the registry contract. The correction always persists the authoritative registry `def.authType`, with focused conflicting-input regression coverage.

- Implementation: `879e3cbcc98392a48fe8e461255460f8d0e06c4b`
- Regression: `be01ab6ac2d97cf36c6400ef43d121c9c8699902`
- I-072: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-071 custom integration error-body hardening

[architect-verified] Bounded I-2 source review found raw provider response bodies being appended to credential-bearing custom ElevenLabs TTS/STT and Supabase PostgREST errors. The correction removes provider response-body propagation and adds focused regression coverage.

- Implementation: `9c1a838c54cf036f67ac05810b3b6bea0b1f9799`
- Regression: `0d1494ea8686c3186589cf657a8dc361d3443af4`
- I-071: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-067 IPv4-mapped IPv6 egress correction

[architect-verified] Bounded I-2 source review identified an SSRF bypass in the host egress policy: IPv4-mapped IPv6 literals encoded with the final IPv4 address as hexadecimal (for example `::ffff:7f00:1`) were treated as IPv6 and could bypass the private IPv4 ranges. The egress guard now decodes both dotted-decimal and hexadecimal IPv4-mapped forms before applying the IPv4 deny ranges.

- Implementation: `8d176739784d2d510f20d242b533a7383ac5de98`.
- Regression coverage: `ee76381b577f5ffdeb658f4ccdc9b7dd27653cc0`.
- I-067: RESOLVED by architect source review.
- I-2 remains **IMPLEMENTED — VERIFICATION PENDING**; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Do not wait for GitHub Actions or Vercel.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-064 AI integration-tool plan-resolution fail-closed correction

[architect-verified] Source review found that the AI-visible integration_action and integration_availability tools still used the UI-oriented plan helper, which can fall back to free-plan limits when authoritative plan resolution fails. The bounded correction switches both capability boundaries to resolveOrgPlanLimits: execution denies with PLAN_NOT_ENTITLED on resolution failure, while availability returns no capabilities without querying integration state. Corrections: 0f5c2ad1372be0c60ed72b11863b9aad8e48fda6, f394054afa6aa92e8c33ef5dbf7bb0554bf18730, c857a8777f0a9f6ea7f535734966b1d2546d1ca8, 305f59663e83ab8deea910b350c746c2af1420b6. I-064: RESOLVED by architect source review. Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection, custom-action, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-074 execution-authorization source newline correction

[architect-verified] Bounded I-2 source review found literal \\n escape text embedded inside the fail-closed execution authorization block. The intended plan-resolution handling and tenant/agent checks were present, but the literal escapes could collapse statements into a single comment line and corrupt TypeScript source structure.

- Correction: `c6240da3ea64869ce4f49dafa4583cd9b626af88`
- Scope: `src/modules/integrations/runtime/execution-authorization.ts` only.
- I-074: RESOLVED by source correction.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-075 Activepieces package action allowlist enforcement

[architect-verified] Bounded I-2 source review found that runAction could execute an action exposed by the installed Activepieces package even when that action was absent from Clara's reviewed registry def.actions allowlist. This created capability expansion on upstream package updates. The runner now rejects non-registry piece actions before piece loading; Clara-owned custom actions remain explicitly allowed.

- Implementation: c1705ac81c4e77239feca6d518d3ef2afcd0403c
- Regression: 3d41bdc09e125b3143bfb58ddf162b00bd335c8b
- I-075: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

# NEXT_ACTION.md

## 2026-10-08 — I-3 typed runner error boundary hardening

[architect-verified] Continued bounded I-3 Action Runner review found that deterministic classification still depended primarily on matching provider/error message text. The runner now has a host-owned `IntegrationRunnerError` with explicit `IntegrationErrorCode` and retryability, and the core runner plus egress policy use typed classifications for key boundary failures. Legacy/provider errors retain conservative compatibility heuristics. A focused regression verifies explicit classifications take precedence over misleading provider wording.

- Corrections: `6deba78a0ce6a167bb3004164cb0bea8a84c4153`, `3128347169fc107d444bb6b5d5004cdd26a6c9b9`, `2a867bff3b3a19a68d40ad16a9a90fa9f590eef3`, `3a93d4b371b12e966effc80c9a73fc73480fd8ee`.
- Scope: I-3 Action Runner error contract, egress failure classification, and focused regression only.
- No CI, Vercel, Gate-C, Gate-D, or continuous verification was awaited.
- I-2 remains implementation-complete with external verification deferred; I-3 remains the active implementation phase.

**Next implementation:** continue bounded I-3 acceptance review for remaining action-runner gaps, especially strict input-schema coverage, egress/redirect boundaries, redacted trace invariants, deterministic result propagation, and tenant-isolation regression coverage.

**STOP:** no I-4 Tool Runtime bridge, I-5 provider pilot, MCP expansion, production promotion, or unrelated implementation.

 — Fresh-Session Continuation Instruction

## 2026-10-06 — I-066 plan-resolution fail-closed mutation correction

[architect-verified] Source review found two remaining I-2 mutation authorization paths using fallback-capable `getOrgPlanLimits()`: organisation enable/connect and agent integration enable. The bounded correction switches both to authoritative `resolveOrgPlanLimits()`; a resolution failure now returns 503 instead of evaluating entitlement against synthetic free-plan limits.

- I-066: RESOLVED by architect source review.
- Implementation: `e496018850c01edd540b4163a19f565f3fcae4d4`, `575a3bec9d4b7f866a6b7ecfbfc7b11283c80c98`.
- Regressions: `c1fcacb702b1124ac4d0502b37172287c053244f`, `48a76874b7f5d42a967a07e75ca21d26d47b4750`.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.



## 2026-10-06 — I-065 OAuth expiry disable-race correction

[architect-verified] Source review found a remaining I-2 state-transition race: credential-vault `updateStatus()` could change a connection from an explicit `disabled` state to `expired` during concurrent OAuth expiry cleanup. Commit `c3ecd5d72940a2e8af4a53266e368c9d9e3dc8f7` now updates status only when the connection is still active; regression `ac162b6ce439861c0c2ac9a2650971cd79411ef7` covers the active-state predicate.

- I-065: RESOLVED by architect source review.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Do not wait for GitHub Actions or Vercel. After source review is exhausted, obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.



## 2026-10-06 — I-063 Supabase Management fallback authorization correction

[architect-verified] Source review found that supabase.execute_sql unconditionally required the separate supabase-mgmt integration authorization before even determining whether a Management connection existed. That contradicted the implemented action contract, which explicitly supports a service-role/PostgREST fallback when Management OAuth is unavailable. The bounded correction adds a tenant/user/agent-scoped active-connection existence check that does not decrypt credentials; only when a Management connection exists does the action re-check supabase-mgmt authorization and read its credential. A focused regression verifies the service-key fallback does not read the Management credential or invoke the Management authorization boundary.

- Implementation: 6719be8; aa99287
- Regression: 457b07d
- I-063: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection, custom-action, egress, secret, and tenant-boundary review; then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

> Canonical continuation instruction. Snapshot: **2026-10-06 — Integrations I-2 implemented; verification pending.** GitHub repository state is authoritative. Current feature tip: **read from GitHub at recovery time; do not duplicate a mutable SHA here**.

## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] Source review found that Activepieces cross-integration credential lookup could bypass the I-054 execution authorization boundary. `DoableConnectionsManager.get()` now re-checks platform enablement, current plan entitlement, organisation grant, explicit agent scope, and tenant ownership before reading another integration's credentials.

- Implementation: `3a17c31cb16bfa54cb79a48a13a757ae16486971`
- Regression: `4f86976b505487906d18e526b6433be360e97a8b`
- I-055: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-056 execution authorization fail-closed correction

[architect-verified] Source review found that the I-2 execution authorization boundary called the UI-oriented `getOrgPlanLimits()` helper, which converts plan-resolution/database failures into free-plan limits. That fallback could allow an integration permitted to the free plan to execute without proving the organisation's actual entitlement. The bounded correction now calls `resolveOrgPlanLimits()` directly and denies execution when entitlement resolution fails.

- Implementation: `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`; type correction: `9ac86755c94132a86afbde804a7ca3b927e0e83b`
- Regression: `220d1a66fe7279bb55296d31d5f9d5c3133b78ef`
- I-056: RESOLVED by architect source review.
- Next bounded work: continue I-2 credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-061 custom Supabase Management credential authorization correction

[architect-verified] Source review found that the custom `supabase.execute_sql` action directly read the `supabase-mgmt` credential after the outer `supabase` execution authorization, bypassing the separate `supabase-mgmt` platform/plan/organisation/agent authorization boundary. The bounded correction now re-authorizes `supabase-mgmt` before reading its credential and adds a denial-before-read regression.

- Implementation: `5f6d044a2ec1d8ddacaf9bde553f17576c14732e`
- Regression: `3ebbbf7113e851a427d310aee2d3a057a6b8ba83`
- I-061: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level credential/connection authorization, egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-062 Supabase Management error-body boundary

[architect-verified] Source review found that the custom `supabase.execute_sql` action read a secondary `supabase-mgmt` bearer credential correctly scoped to the executing agent, but included the Management API provider response body in its thrown error. Because that secondary credential is resolved inside the custom action, the outer runner's known-secret collection did not necessarily contain it. The bounded correction now reports only the HTTP status and adds a focused regression proving a sentinel Management token cannot enter the thrown error.

- Implementation: `40c410f8ee4542f44156c5fdf20fc7d21ff73004`
- Regression: `eec44f0e478fc2eafe4302d7b857428369f1f43c`
- I-062: RESOLVED by architect source review.
- Next bounded work: continue I-2 credential/connection, custom-action, egress, secret, and tenant-boundary review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## CURRENT AUTHORITATIVE ACTION

## 2026-10-06 — I-050 AI availability tenant-binding correction

[architect-verified] Source review found that the AI-visible integration availability query filtered agent grants by agent identity but did not verify that the agent belongs to the execution tenant. The bounded correction now joins `agents` and requires `a.org_id = context.tenantId` before exposing integration capabilities.

- Implementation: `c9f71d7e776e0127d587d08e03132579c5ac9fad`
- Regression: `c122dfab4a1deee1d3b40614cc8cb993f7812d56`
- I-050: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-049 atomic integration mutation correction

[architect-verified] The next bounded I-2 source correction closed a concurrency/partial-mutation defect in organisation integration enable/connect. `withTransaction()` now covers the entitlement count and mutation, and a transaction-scoped advisory lock serializes per-organisation integration-slot changes. Direct connect no longer leaves an enabled organisation grant behind if connection persistence fails.

- Implementation commits: `0f55d11dfc612b293fcf9046cb6d99c25451cdf9`, `cd35659c8b286dd89d6ba325307ce734cfe0b2dc`
- Regression: `ccd1fb2d7ba0b06d1ebace779aea7854e9e034df`
- I-049: RESOLVED by architect source review.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-048 auth-type authority correction

[architect-verified] Source review found that runAction selected OAuth token-refresh behavior from the stored connection auth_type, while the connection API accepts authType input. Commit 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126 now uses the authoritative integration registry def.authType for ensureTokenFresh, preventing a mismatched connection field from suppressing OAuth refresh. I-048 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.


## 2026-10-06 — I-047 owner continuation: direct-connection plan-limit correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review found that organisation-level connect could implicitly enable a previously-disabled integration without enforcing max_integrations. The bounded correction is committed at 846c8d39add3430a5014c5573b3cc4d5ad86ee37 with focused regression coverage 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is resolved by architect source review.

**Next bounded work:** continue source-level I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review without waiting for GitHub Actions or Vercel. Then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


**I-2 is the active bounded work.** The repository already contains the I-2 implementation. The immediate job is verification and security correction only.

1. Obtain executable dependency/lock synchronization plus current-head build/test/typecheck/lint evidence.
2. Re-run the focused runtime redaction/store-isolation tests and integration registry/control-plane suites in that executable environment.
3. Use the already-verified 060/061/062 database state as Gate-E evidence; do not re-run migrations merely to manufacture evidence unless a clean-install verification is explicitly required.
4. Perform a bounded real connector/OAuth smoke where valid provider credentials/configuration are available, then browser-verify platform → organisation → agent access and denial paths.
5. Re-run immutable-source, runtime-import, secret and governance gates.
6. Perform I-2 Gate-D review. Only an explicit ChatGPT PASS closes I-2.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

---

## 2026-10-06 — I-2 owner continuation: redirect egress hardening

I-2 remains the active bounded work. A second security correction was implemented without waiting for GitHub Actions or Vercel: the generic integration HTTP runner no longer follows redirects implicitly, preventing an unchecked 3xx Location from bypassing the host egress/SSRF boundary. I-036 is resolved by source review; focused regression coverage was added. Executable Gate-C evidence remains pending.

- Runner correction: `e2a9131d04d567a79c3f3531e1cff63b60d5a81d`
- Regression tests: `452a998076fef63e97f08c804b9ab6e216daa7f6`
- I-036: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/corrections only; do not expand to I-3/MCP/production.

## 2026-10-06 — I-2 owner continuation: trace-redaction hardening

I-2 remains the active bounded work. A concrete security correction was implemented without waiting for GitHub Actions or Vercel: trace payloads are now fully redacted before truncation, closing the late-field credential exposure found as I-035.

- Implementation: `f6b9f5f89a476743e48610b5dcc4d8d678ff6366`
- Regression test: `710565d1de3aa0a9bd96ea651f2c0be8ff7eaa1c`
- I-035: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/corrections; do not expand to I-3/MCP/production.
## 2026-10-06 — I-2 owner continuation: action-context scope hardening

I-2 remains the active bounded work. A source audit after the I-037 runner credential-scope correction found the same project/agent conflation inside the Activepieces action context: store and cross-integration connection-manager adapters were still receiving projectId. This was corrected without waiting for CI/Vercel.

- Context correction: a5680cd51c6d9ca961ab93effd20fb069d0e2bbe
- Runner propagation: f3bd397dbbc7c0ddb8674b8b3c97358be8fa8a11
- Regression test: 550b751b745d7a8a4a52854edc1cc328d7c891b2
- I-040: RESOLVED by architect source review.
- Next: continue bounded I-2 verification/security review only; do not expand to I-3/MCP/production.

## Read this first

Read, in order:
1. `docs/project-control/PROJECT_STATE.md`
2. `docs/project-control/CURRENT_PHASE.md`
3. `docs/project-control/VERIFICATION_STATE.md` — **current I-2 verification record**
4. `docs/project-control/ISSUES.md`
5. `docs/project-control/DECISIONS.md` — **D-032 and current I-2 decisions**
6. `docs/superpowers/plans/2026-10-05-clara-integrations-framework.md`
7. `docs/project-control/sessions/SESSION-033.md` and later I-2 verification/correction records

**Important:** the I-1 material below is historical checkpoint prose. It is **not** the active authorization. The active work is I-2 verification/correction under D-032.

## Historical I-1 record — non-authoritative

## Active work

**Integrations Framework — I-1: host-neutral contract/test foundation.**

D-031 authorizes only:
- `src/modules/ai-platform-core/integrations/**` contract/type definitions, pure validation helpers, tests, and exports;
- threat-model/test-boundary work necessary to validate the contract.

Forbidden until separately authorized:
- database/schema/migrations;
- OAuth routes/token exchange;
- credential-vault implementation;
- Activepieces runtime/dependencies;
- outbound HTTP/egress execution;
- integration tool execution;
- deployment;
- changes to D-023 billing semantics.

## Current checkpoint

- Implementation foundation exists.
- A contract hardening correction was applied after architect review: generic connection metadata and generic error-details bags were removed from the reusable boundary; connection-store/credential-vault APIs now identify concrete connection IDs.
- Focused I-1 CI verification has been added for Vitest, strict TypeScript, and ESLint.
- **Verification is still PENDING** because no GitHub Actions run is currently exposed through the connected GitHub integration for the feature head.
- No PASS is claimed for I-1.
- I-2 and all later integration work remain unauthorized.

## Next bounded action

1. Obtain executable I-1 verification from the repository's CI/Actions surface.
2. Re-run the focused contract tests, strict typecheck, and lint.
3. Re-check immutable-source integrity, runtime import boundary, secret scan, and scope.
4. Perform the architect Gate-D review of the exact verified commit.
5. If all required gates pass, record I-1 closure and issue the next explicit authorization boundary. Otherwise record the blocking finding and correct only within D-031 scope.

**Stopping boundary:** do not implement I-2, OAuth, persistence, credential storage, egress execution, integration actions, or deployment until ChatGPT explicitly authorizes the next bounded sub-phase.

## 2026-10-05 — I-1 correction checkpoint

The I-1 contract/test correction is complete at `bfc40f671aea218def571c617f00789e15b45823`. I-018 is RESOLVED by architect review.

**Next bounded action:** obtain executable CI evidence for the exact current head, then re-run the final I-1 Gate-D closure review. Until that evidence exists, I-1 remains open.

No I-2, OAuth transport, persistence, credential storage, egress execution, integration action runtime, deployment, or billing changes are authorized.


## Current next action — post Phase 7-C closure (2026-10-05)

Phase 7-C is **PASS — CLOSED**. Do not reopen or extend the bounded provider tool-calling/agentic-loop pilot without a new authorization. The next work item is an explicit project-owner decision, not automatic implementation: triage I-014, resolve pending D-P2/D-P4 decisions if needed, or authorize a separately scoped future phase. I-015 is resolved for the dependency/lockfile/environment condition. D-023 remains binding; first-class billable tool metering, MCP, integrations, deployment, and Phase 8 remain unauthorized unless separately authorized.

**STOP boundary:** no additional application implementation is inferred from the Phase 7-C closure.

## 2026-10-05 — Docker build-boundary correction checkpoint

A user-provided Docker build exposed I-019: Next.js type-checking traversed the immutable Doable reference tree and failed on its reference-only `@e965/xlsx` import. ChatGPT corrected the TypeScript inclusion boundary in `tsconfig.json` and `tsconfig.typecheck.json`, excluding only `ai-platform-core/**` and `clara-core/**` reference snapshots.

**Next bounded action:** execute the production build from the current feature head (`docker compose up -d --build` or equivalent CI `npm run build`). If the build passes, close I-019 with evidence; if it fails, correct only the newly evidenced build blocker without modifying immutable/reference material.

No reference-only dependency should be added merely to make the application build traverse an immutable snapshot.


## Current next action — 2026-10-05 — executable verification and browser readiness

The user-directed RBAC/UI continuation is implemented. Do not add more feature scope until verification catches up.

1. Execute the current-head focused I-1 contract tests, strict TypeScript, and ESLint in CI or the project build environment.
2. Execute the production build (`docker compose up -d --build` or equivalent) to close or correct I-019 after the reference-tree TypeScript exclusion.
3. Re-run immutable-source, runtime-import, secret, and governance checks at the exact verified head.
4. Browser-verify `/ai-platform` as a platform-admin surface and verify tenant-role navigation/redirect behavior.
5. Complete I-1 Gate-D closure review only after Gate C evidence exists; then issue the next explicit authorization if required.

**Stopping boundary:** no I-2 integration runtime, OAuth, persistence, credential vault, egress, integration action execution, MCP runtime, or deployment/promotion is authorized merely because the UI exists.


## 2026-10-05 — Current executable verification / browser readiness checkpoint

The requested UI/RBAC/subscription continuation is implemented. Role-aware navigation, agent workspace UI, team role management, live usage meters, Billing & Plan, and explicit entitlement visibility are present. A UI correction prevents project managers from being offered elevated organisation-role grants. Server-side authorization remains authoritative.

A concrete build dependency drift was corrected: package.json already declared @e965/xlsx 0.20.3, while package-lock.json lacked the corresponding package entry. The lock entry was added without modifying immutable/reference material. I-021 records this as CORRECTED — executable build pending.

Vercel clara-backend ignored-build-step was cleared to allow the feature branch to produce a preview on the next pushed commit. No production promotion is performed.

Next bounded verification: execute the current-head production build, current-head focused I-1 tests/typecheck/lint, immutable/runtime-import/secret/governance checks, then browser-verify /ai-platform plus role/redirect and plan-limit behavior. Do not extend into I-2 runtime, OAuth, persistence, egress, MCP, or unrelated deployment work.


## 2026-10-05 — Current RBAC/UI/build checkpoint

The requested role/permission and subscription UI work is implemented on the current feature head. Final source review corrected the least-privilege boundary: organisation admins may assign any defined organisation role; project managers may only grant/manage Editor and Viewer access; self-role changes are rejected. Server-side RBAC remains authoritative.

`@e965/xlsx@0.20.3` is now declared in the application manifest and synchronized in the lockfile. The immutable/reference trees were not changed. The user-provided Docker failure is therefore corrected at the application dependency boundary, but executable build evidence is still required.

**Pending:** current-head production build, current-head CI evidence, browser verification of `/ai-platform` and role/redirect/plan-limit behavior, and final I-1 Gate-D review. No I-2 runtime, OAuth, persistence, egress, MCP runtime, or production promotion is authorized.

## 2026-10-05 — Owner execution checkpoint
Current bounded work is verification, not feature expansion. Completed: UI/RBAC/subscription implementation and production Docker-build CI instrumentation. Pending: (1) executable current-head Docker build, (2) executable I-1 focused Gate-C evidence, (3) browser verification through draft preview PR #266 or equivalent local environment, and (4) final I-1 Gate-D review. Do not start I-2 runtime/OAuth/persistence/egress/MCP work or merge the preview PR as part of this checkpoint.


## UI/RBAC/Subcription checkpoint — 2026-10-05
Completed in current continuation:
- role-aware organisation navigation and direct-route guard;
- role capability contract tests;
- current versioned subscription-plan API wired into admin Plans UI;
- TTS/STT/translation daily limits exposed and persisted in plan versions;
- plan-guard fallback fixed for those limits.

Still pending before Phase 7-C closure:
1. Fresh CI run for the new UI verification job and changed subscription surfaces.
2. Reproduce immutable-source/library-integrity/secret/runtime-boundary closure gates.
3. Fresh-context review of all governance documents and compare against the Phase 7 authorization boundary.
4. Decide and record the repository-wide typecheck/lint baseline disposition; do not modify immutable/reference material merely to make global gates green.
5. Only after all closure evidence passes, perform the governance-only Phase 7-C closure update.

- Latest UI/billing changes are implemented. Pending work is verification-only: fresh CI, immutable/library/secret/runtime gates, then final Phase 7-C closure review.


## 2026-10-05 — Current owner checkpoint

The requested UI/RBAC/subscription implementation is complete. The Members UI role-assignment correction is committed; org_admin can assign all defined roles, while project_manager remains least-privilege constrained. Billing & Plan is enabled with live usage/limits and entitlement visibility.

**Pending only:** executable current-head CI/production-build evidence and browser verification. Vercel preview evidence is temporarily blocked by the provider daily deployment quota; do not use the older cancelled preview as current-head evidence. No I-2 integration runtime, OAuth, persistence, egress, MCP runtime, production promotion, or Phase 8 work is authorized.


## 2026-10-05 — Integrations I-2 implementation checkpoint

I-2 is IMPLEMENTED — VERIFICATION PENDING under D-032.

Next bounded actions:
1. Run npm install --legacy-peer-deps in the executable build environment to synchronize the 529 Doable Activepieces package dependencies and lockfile.
2. Execute the 052 integration migration and verify platform/org/agent connection persistence plus pgcrypto encryption.
3. Run registry tests and strict typecheck/lint for the integration runtime, API, AI tools, and UI.
4. Configure/test at least one real connector action using an organization/agent connection.
5. Browser-verify platform admin → organisation → agent integration access and denial paths.
6. Re-run immutable-source, secret, runtime-import, and governance checks, then perform I-2 Gate-D review.

Stopping boundary: no production promotion or claim of complete integrations until the above evidence exists.


## 2026-10-05 — I-2 database verification checkpoint

Current HEAD: `1ed4490e6266a6c52a4a307007c5c468714f9619`.

Completed: migrations 052, corrected 061, and 062 executed and verified; pgcrypto operational; I-2 agent/org constraints verified; six I-2 integration tables RLS-enabled and anon/authenticated access revoked.

Still required: executable npm/build/test/typecheck/lint evidence; focused runtime/API tests; real connector and OAuth smoke; current-head browser verification; immutable/runtime/secret/governance scans; final ChatGPT Gate-D review.

GitHub Actions current-head run 37301575945 failed without usable step logs, so no CI PASS is inferred.

STOP: no I-3/MCP expansion, production promotion, or unrelated work.
\n\n## 2026-10-05 — I-2 migration sequencing correction\n\nCompleted a bounded build-blocker correction: the integration control-plane migration was moved from the colliding 052 sequence to 060, while the pre-existing Sarvam 060 migration was moved to 064 so the integration sequence remains 060 → 061 → 062. Repository enumeration now reports no duplicate migration numbers.\n\nNext verification remains executable only: run the exact CI/build/test/typecheck/lint commands in an execution-capable environment, then perform connector/OAuth/browser/security/governance verification. No I-2 PASS is claimed until those gates execute successfully.\n

## 2026-10-05 — I-2 execution-path reconciliation

Completed: current-head branch reconciliation; current-head Vercel build attempt; confirmation that Cloud CI is restricted to Vercel-Prod push/PR events; no current-head build PASS inferred from the stalled Vercel attempt.

Remaining bounded verification is unchanged: obtain a completed executable current-head build/test/typecheck/lint result through an approved execution environment, then complete connector/OAuth/browser/security/governance checks and Gate-D. Do not create a broad PR merely to manufacture CI evidence: the feature branch is 724 commits ahead and 27 behind Vercel-Prod, so such a PR would be an unsafe validation shortcut.

## 2026-10-05 — Current authoritative I-2 next action

The control documents have been reconciled against GitHub. I-2 remains **IMPLEMENTED — VERIFICATION PENDING**, not BLOCKED and not PASS.

Completed since the earlier checkpoint: runtime redaction hardening, organisation-scoped integration-store isolation, agent/org ownership enforcement, migration sequence correction, and database/RLS hardening. Gate-E is evidenced.

**Next bounded execution:** obtain executable dependency/lock synchronization and current-head build/test/typecheck/lint evidence; then perform the required connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-06 — Current owner continuation

The plan-to-implementation audit found and corrected I-033: the agent integration grant mutation now re-checks the organisation's current plan entitlement before enabling an integration. The correction is committed and recorded in ISSUES.md / VERIFICATION_STATE.md.

**Next bounded work remains executable verification:** current-head build/test/typecheck/lint evidence, focused I-2 runtime/API tests, real connector/OAuth smoke where valid credentials/configuration exist, browser access/denial verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review. Do not wait for GitHub Actions or Vercel before performing bounded source-level corrections. No I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Current owner continuation after I-034

I-2 remains IMPLEMENTED — VERIFICATION PENDING. ChatGPT completed another bounded plan-to-implementation correction: agent integration grants now enforce current plan entitlement only when enabling; disabling remains available after downgrade, with focused regression coverage (I-034). This does not close Gate-C or Gate-D.

**Next bounded work:** continue source-level I-2 review for concrete plan/implementation gaps without waiting for GitHub Actions or Vercel; prioritize credential/connection authorization, AI-tool exposure, runtime action validation, and tenant isolation. Then obtain executable test/typecheck/lint/build evidence, connector/OAuth smoke, browser verification, and final Gate-D review.

**Stopping boundary:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Current owner continuation after I-037

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review identified and corrected I-037: the integration runner had been passing `projectId` into the credential vault's agent-scope parameter. The runner now carries an explicit `agentId` field and no longer conflates project and agent identity.

- Correction commits: `8cad5e6759e79dfe54729257b68bc719319e7161`, `54fa672ce7e1df29d97cc2fbc5589403c5682ab0`.
- I-037: RESOLVED by architect source review.
- Next bounded work: continue I-2 source review for concrete credential/connection authorization, AI-tool exposure, action-input validation, and tenant-isolation gaps; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: known-secret trace redaction

I-2 remains the active bounded work. Without waiting for GitHub Actions or Vercel, ChatGPT identified a remaining telemetry hardening gap: redaction was pattern/key based but did not scrub the exact credential values already resolved for an integration when a provider echoed them under a non-sensitive field name or plain text.

- Implementation: `d288975526e40a67e4c22cdc402760f1ca6649af`
- Runner call-site propagation: `1a19b95d10c03b9b4e8128628846827cf2b1676f`
- Focused regression tests: `750e5da08150c1f09be0fb8db232413df23df25b`
- I-038: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next: continue only bounded I-2 verification/security corrections; do not expand to I-3, MCP, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: OAuth refresh redirect hardening

I-2 remains the active bounded work. Without waiting for GitHub Actions or Vercel, ChatGPT found that the credential-bearing OAuth token refresh request used default fetch redirect behavior after checking only the initial token endpoint.

- Implementation: `fddf00ca3c5cea63daa5c4146ae212908deb205a`
- I-039: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next: continue only bounded I-2 verification/security corrections; do not expand to I-3, MCP, production promotion, or unrelated implementation.


## 2026-10-06 — I-041 post-refresh credential scope correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. The source audit found one remaining project/agent conflation after the I-037/I-040 corrections: the post-OAuth-refresh credential refetch still passed projectId into the agent-scoped credential-vault parameter.

- Correction: `1001819239fcba146061be84c35254a8a9fb30cb`
- I-041: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

**Next bounded work:** continue only I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation, and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-042 Unified Tool Runtime project-scope correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. The source audit found the Unified Tool Runtime integration_action bridge was fabricating a project scope by assigning agentId to RunActionParams.projectId. The host execution context defines agentId but no projectId.

- Correction: `3305c9027ddcef4fff0520d941dfebc73f9ef94a`
- I-042: RESOLVED by architect source review.
- Gate-C remains MISSING and Gate-D remains IN_PROGRESS.

**Next bounded work:** continue only I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation, and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-043 owner continuation

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. [architect-verified] Source review corrected the AI-visible integration tool boundary: agent integration grants are now bound to the execution tenant through the authoritative `agents.org_id` relationship, and focused regression coverage rejects a cross-tenant agent before `runAction`. The existing I-042 project/agent scope correction remains intact.

- I-043: RESOLVED by architect source review.
- Correction commits: `870ac568d050a8a6f54c347684a1b6e4fe9015ca`, `b5a744cc57135e2e8f1037f7396c56ed57bc3656`, `26f0f5fd00d47641598854e0cbb813ac049b7459`.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.
## 2026-10-06 — I-2 owner continuation: bounded runner correctness correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the current runner helper and found a bounded correctness defect in the ElevenLabs custom action: its 3xx failure path emitted an OAuth-refresh-specific error even though it was the ElevenLabs transport. The transport already fails closed on redirects; the correction only restores the correct action-specific error semantics.

- Correction commit: `499feacf01907f82da9578b74cb8789931d10752`
- Scope: `src/modules/integrations/runtime/runner-helpers.ts` ElevenLabs TTS redirect handling only.
- No OAuth callback/transport expansion, provider rollout, MCP, billing, migration, production promotion, or unrelated runtime refactor.
- **Next:** continue bounded I-2 security/correctness review and implementation corrections; then obtain executable Gate-C evidence, connector/browser checks, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated feature work.

## 2026-10-06 — I-2 owner continuation: credential-value error-boundary hardening

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the runner's final error boundary and found that provider error text could bypass value-based credential redaction when a provider echoed a resolved secret under a non-sensitive field name or plain-text message.

- Correction commit: `a8a1997f958c37b524451618eb0d3bb4a3746b5f`
- Scope: `src/modules/integrations/runtime/runner-core.ts`; retain resolved credential values for the request lifetime and apply value-based redaction to the final runner error before XRay, usage logging, and the returned error.
- No new provider, OAuth callback/transport, MCP, billing, migration, production promotion, or unrelated feature work.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next:** continue only bounded I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant-isolation and secret/egress review; then obtain executable Gate-C evidence and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-2 owner continuation: final error credential-value redaction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. A bounded source correction was applied without waiting for GitHub Actions or Vercel: the runner now preserves the resolved credential values for the active execution and applies value-based redaction at the final error boundary. This prevents provider-echoed credentials under non-sensitive field names from reaching returned errors, XRay, or usage logging.

- Correction commit: `ca2394e85e191a709f774a083137798e2cf90dc8`.
- Scope: I-2 runtime security/observability only.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next: continue bounded I-2 verification/security review; do not expand to I-3, MCP, production promotion, or unrelated work.


## 2026-10-06 — I-2 owner continuation: organisation downgrade-unwind correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT audited plan-entitlement symmetry and found I-045: the organisation integration POST route blocked `disable` after a plan downgrade because it evaluated current plan entitlement before branching on the requested action.

- Correction: `4c653b18c488661a9000f21f73344ce90d669b1a`.
- Regression test: `289bb2a9dc8d40532479c62980f0ab110a600849`.
- I-045: RESOLVED by architect source review.
- `enable`/`connect` remain entitlement-gated; `disable`/`disconnect` remain available for downgrade unwind.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next bounded work:** continue I-2 executable verification and only further concrete I-2 corrections; then connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: AI availability plan-entitlement correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, ChatGPT audited the AI-visible integration discovery boundary and found I-046: `integration_availability` exposed platform/org/agent-enabled integrations without applying the organisation's current plan allowlist.

- Correction: `48a55826f4c45fe71c891bd68f71075fc363f8fc`.
- Regression test: `b3d090a1644d1982e1709d095458db9c593a5d42`.
- I-046: RESOLVED by architect source review.
- `integration_availability` now filters by current plan; `integration_action` remains independently fail-closed.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.

**Next bounded work:** continue I-2 executable verification and only concrete I-2 corrections found by source review; then connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: project/tenant scope separation
I-2 source review found that buildActionContext() still defaulted project.id to workspaceId when no explicit project identity was supplied, despite the ratified I-037 separation of project and agent/tenant scope. ChatGPT corrected this bounded defect at 59e8d360180a6458d4b965406829185fc6224785; focused regression coverage is 327740e9aec6d0bf0b0260af717a344b03e3d8ed. I-051 is recorded RESOLVED by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
**Next bounded work:** continue I-2 source-level credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.
**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-2 owner continuation: telemetry schema + fail-closed entitlement corrections

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.

[architect-verified] Two concrete plan-to-implementation gaps were corrected without waiting for GitHub Actions or Vercel:
- I-052: integration usage telemetry now matches the existing `integration_usage_log(org_id, agent_id, ...)` schema instead of attempting the non-existent `workspace_id` column.
- I-053: malformed/null platform `allowed_plans` now fails closed on AI execution, organisation enable/connect, and agent enable rather than bypassing entitlement checks.

Focused regression source was added for both corrections.

**Next bounded work:** continue I-2 source-level authorization/connection, action-input, tenant-isolation, egress, and secret review; then obtain executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — Vercel deployment blocker checkpoint

[architect-verified] Deployment `dpl_2zSX7vRmLwJUDYXRdnE1YpeD1noL` failed before application compilation because `npm ci --legacy-peer-deps --include=dev` rejected an unsynchronized `package.json` / `package-lock.json`, with the newly declared `@activepieces/*` family missing from the lockfile. Bounded correction `3d87c000b7f3bdee337d524eeb06718094ebeb84` changes Vercel's install command to `npm install --legacy-peer-deps --include=dev` so the declared dependency graph can be resolved while strict lock synchronization remains open. A clean `npm install --package-lock-only` attempt in a Vercel sandbox ran ~13.8 minutes and failed; no generated lockfile was accepted. Fresh Vercel deployment is currently blocked by the team's `api-deployments-free-per-day` quota. Do not claim build success until a fresh deployment is actually observed. See `SESSION-049.md`.


## 2026-10-06 — I-054 runner execution-authorization correction

[architect-verified] The I-2 runner now re-checks the authoritative integration execution boundary immediately before custom or Activepieces action execution. This closes the stale-authorization/direct-runner bypass identified in I-054.

- Runtime correction: `2d2383a196d83fba26dd93a4b4a1ec2ecec31207`
- Authorization module: `facb32c99b5fc9bcdd0d05900e0a92bdf9c60e6d`
- Regression coverage: `e4110290c8cfa57c1f5357eaf4f57c719785a4ee`
- I-054: RESOLVED by architect source review.
- Gate-C remains OPEN/MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level authorization/egress/secret review, then current-head executable verification, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-057 OAuth refresh disable-race correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Without waiting for GitHub Actions or Vercel, source review found I-057: an in-flight OAuth refresh could re-persist credentials with status='active' after a connection had been disabled, and the runner did not explicitly fail closed if the post-refresh active connection disappeared.

- Corrections: `a8e66489e57d84326e63b56b86914ba3b5ea3cf3`, `ac8d4bf5388c1cf993a9355c3032e8c8d090782f`.
- I-057: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level credential/connection authorization and egress/secret review, then executable Gate-C evidence, bounded connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-058 custom integration egress/redirect correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review found native fetch paths in custom ElevenLabs and Supabase actions bypassing the generic egress/redirect boundary. The bounded correction adds explicit host egress checks and manual redirect handling for those credential-bearing requests.

- Corrections: `d4e3a44956da9f377be7afcd8b7a012b54a6c944`, `434316d642c26f7d088e216d0b91407049a16d57`.
- I-058: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- Next bounded work: continue I-2 source-level authorization, credential, egress and secret review, then executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-06 — I-059 Supabase Management API egress correction

I-2 remains **IMPLEMENTED — VERIFICATION PENDING**. Source review found that the custom Supabase Management API action was the remaining credential-bearing native fetch path not covered by the I-058 egress/redirect correction.

- Correction: `c7a2b7f4edb33cc919ebfe528d0fd316b4698136`
- I-059: RESOLVED by architect source review.
- Gate-C remains MISSING; Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection authorization, AI-tool exposure, action-input validation, tenant isolation, and secret/egress review. Do not wait for GitHub Actions or Vercel. After source-level review is exhausted, obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-060 custom Management credential agent-scope correction

[architect-verified] Source review found that the custom Supabase Management API action's secondary `supabase-mgmt` credential lookup omitted the executing `agentId`, despite the surrounding runner authorization being explicitly agent-scoped. The lookup now passes `params.agentId`, and focused regression coverage asserts tenant/user/agent scoping.

- Implementation: `a90254ee5e4a7910fd92291810fe0cdff72c2ee0`
- Regression: `040cfafb0d4aad1b9b95de9aafa3d5dfa975bd35`
- I-060: RESOLVED by architect source review.
- **Next bounded implementation review:** continue I-2 credential/connection and custom-action authorization/egress review only; then obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-068 route-source correction

[architect-verified] Source review found and corrected literal \\n escape text embedded in two I-2 authorization route files. Correction commit: c07b87596ffdc7959a4b507621b3a57d900c6a82. No authorization semantics changed.

Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. After source review is exhausted, obtain executable Gate-C evidence, bounded connector/OAuth smoke, browser access/denial verification, immutable/runtime/secret/governance scans, and final Gate-D review.

STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-069 focused-test alignment

[architect-verified] I-2 source review found a stale plan-guard mock in the agent integration route test after the production route had moved to resolveOrgPlanLimits. The test now configures the authoritative resolver and verifies downgrade-disable does not call it. Correction: 953bf1b698b52010bab1e00e4fcfac8b6603272f.

Next bounded work: continue concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and remaining bounded smoke/browser/security scans.

STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-06 — I-070 agent-scoped FLOW store correction

[architect-verified] I-2 source review found that FLOW-scoped Activepieces store keys omitted agentId. The store now keys FLOW state by organisation + agent + user, with a focused regression. Implementation f0f476e74b1fbd66ed3e716bdc23e9e6b775b; regression efc652c8096488e3cf8d2ac2422d108c345924ca.

Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and remaining bounded smoke/browser/security scans.

STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-076 registry-authoritative action discovery

[architect-verified] Continued bounded I-2 review found getIntegrationActions could fall back to enumerating every action shipped by the installed Activepieces package when fewer than half of Clara's registry actions matched. That could advertise unreviewed upstream actions even though runAction now correctly rejects them. The discovery fallback has been removed: capability discovery now exposes only registry-approved actions plus Clara-owned custom actions.

- Implementation: 9435c6ce036634fe5f1126fa35c424db0e8582a2
- Regression: 55271624623ec65ec1ae892bf8585063d2dc5371
- I-076: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-077 Supabase credential URL error-boundary hardening

[architect-verified] Bounded I-2 review found the custom supabase.execute_sql action included the credential-derived projectUrl in an error when project-ref parsing failed. Because projectUrl is credential material, that error could expose stored connection data through the runner error boundary. The correction now returns a generic invalid-project-URL error and adds focused regression coverage.

- Implementation: 6ae5663938c2144f2f880afe0d7ebdcd97ebf54a
- Regression: 0f3347d8b679f0ea4110768fdf5f5c33de129d57
- I-077: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.

## 2026-10-07 — I-078 runner early-rejection trace initialization correction

[architect-verified] Continued bounded I-2 review found the registry action-allowlist rejection path referenced the normal XRay handle before that handle was initialized. The intended fail-closed rejection therefore could raise a temporal-dead-zone ReferenceError. The early rejection now returns directly without touching the later trace handle.

- Correction: ddd38bbf84f274a7f2daa159007a080f964b3046
- I-078: RESOLVED by source correction.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- Next bounded work: continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- STOP: no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-079 AI action readiness user-scope correction

[architect-verified] Bounded I-2 source review found that the AI `integration_action` readiness query could report another user's active connection as ready because it omitted `user_id`, even though the downstream runner correctly enforced tenant/user/agent credential scope. The readiness query now applies the same user scope and prioritizes the current user's connection.

- Implementation: `9e168851bc2e978f68c0576235e084eba63be4a2`
- Regression: `f2b3dc2ac263d5112dc8d6e7649acfdd76bc735a`
- I-079: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-080 AI availability regression alignment

[architect-verified] Continued bounded I-2 review found a stale test mock reference to the removed `getOrgPlanLimits` helper in the cross-tenant AI availability regression. The test now configures the authoritative `resolveOrgPlanLimits` resolver.

- Correction: `3ed83c8ddcde22e05ddfa415bce134e7773fca75`
- I-080: RESOLVED by test-source correction.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-081 AI availability user-scope correction

[architect-verified] Bounded I-2 review found `integration_availability` could report another user's active connection as connected. Availability now requires user context and applies organisation + agent + user connection scope, preserving organisation-scoped connections.

- Implementation: `f9dc068c0ca6b4067d0cda6d44743d4f91ac82a5`
- Regression: `0e53c6a42fa316ddb776b565b32dd5b03599a69a`
- I-081: RESOLVED by source correction and focused regression.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN_PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-082 OAuth refresh credential-scope correction

[architect-verified] Bounded I-2 source review found that OAuth refresh credential-vault mutations were scoped only by connectionId + organisation after the runner had selected a connection using user + agent scope. The vault decrypt/status/update operations now preserve user and agent scope, and runAction passes both into ensureTokenFresh().

- I-082: RESOLVED by source correction.
- Corrections: f74d3928ce875e40ebafba473e92da4c90305ca0; 4ea030a1d75e31983605e59026437de4336d5e16; bd238eaa379d51f11c9d867434cd0a77dc5ab1a0.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN PROGRESS.
- **Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review; then executable Gate-C evidence and final Gate-D review.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — Owner CI/CD pause control

[architect-verified] Per owner directive, automatic GitHub Actions execution is disabled: .github/workflows/ci.yml now retains only workflow_dispatch, with the original push/pull_request triggers preserved as commented re-enable guidance. Vercel clara-backend is paused because deployment-source controls are unavailable on the current Hobby plan; this prevents automatic deployments until the owner deliberately unpauses the project. No CI/Vercel result is being awaited.

**Next bounded work:** continue I-2 source implementation/review only, without waiting for CI, Vercel, Gate-C, or Gate-D. Gate-C remains MISSING and Gate-D remains IN PROGRESS. After bounded source work is exhausted, the existing plan still calls for executable Gate-C evidence, connector/OAuth smoke where configuration exists, browser verification, immutable/runtime/secret/governance scans, and final Gate-D review when the owner chooses to resume verification.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — I-084 OAuth refresh scope drift corrected

[architect-verified] Bounded source review found I-082's recorded OAuth refresh scope was not fully reflected in current runner-helpers.ts. ensureTokenFresh now accepts and propagates userId/agentId through credential decrypt, expiry status, and refreshed credential persistence. No tests, CI, Vercel build, Gate-C, or Gate-D result was awaited.

**Next bounded work:** continue only concrete I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary review. Then executable Gate-C evidence and final Gate-D review when verification is deliberately resumed.


## 2026-10-07 — I-085 OAuth refresh lost-scope fail-closed correction

[architect-verified] The bounded I-2 OAuth refresh path now fails closed if the scoped credential persistence update affects zero rows, preventing an in-flight refresh from continuing after a concurrent connection disable/disconnect or scope change. Corrections: 45ab1758a30e2c1088f165452c2d550a72d669d1 and eb4a3bed89204d6b7b2670d4f4bc045873ed7be8.

**Next planned work:** continue the bounded I-2 credential/connection and authorization review, especially connection mutation and runner authorization race boundaries; then move to the remaining custom-action, AI-tool, egress/secret, and tenant-isolation gaps. Do not wait for CI, Vercel, Gate-C, or Gate-D.


## 2026-10-07 — I-086 organisation integration mutation serialization correction

[architect-verified] Bounded I-2 source review found that the organisation-level connect transaction locked only an existing integration-grant row. When the row was absent, concurrent first-time connects could both pass the `max_integrations` count check. The connect transaction now acquires the existing organisation advisory transaction lock before reading the grant/count; disable and disconnect use the same lock so the mutation domain is serialized consistently.

- I-086: RESOLVED by architect source correction.
- Correction: `51c14f65b7dac8812ccae353bc23e9cf07694d8c`.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains MISSING and Gate-D remains IN PROGRESS.
- No CI, Vercel build, Gate-C, or Gate-D result was awaited.
- **Next planned work:** continue the bounded I-2 credential/connection and authorization race review, then inspect remaining custom-action, AI-tool, egress/secret, action-input, and tenant-isolation gaps. Continue implementation directly without waiting for CI, Vercel, or gates.
- **STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — Gate-C execution readiness

[architect-verified] Gate-C is execution-ready but not verified at current head. The implementation checklist is complete and automatic CI/health automation is disabled. One manual workflow_dispatch execution against the current feature head is required to create authoritative executable evidence; after that, proceed immediately to final Gate-D architect review.


## 2026-10-07 — Gate-D final architect precondition result

[architect-verified] Final Gate-D closure cannot be issued yet. The feature branch currently exposes commit `895f4aa4d593cff999e2fe6c9a0bec2c981450be`, and GitHub reports zero workflow runs for that exact commit. Therefore the required current-head Gate-C executable evidence does not exist in the repository evidence surface.

**Current disposition:** Gate-C **NOT VERIFIED**; Gate-D **BLOCKED / NOT CLOSURE-ELIGIBLE**; I-2 remains **IMPLEMENTED — VERIFICATION PENDING**.

**Next action:** obtain one manual current-head Gate-C execution, record its run ID/conclusion and required job evidence, then immediately perform the final Gate-D architect review. Do not treat older runs, source inspection, or partial build initiation as Gate-C PASS evidence.

**STOP:** no I-3, MCP expansion, production promotion, or unrelated implementation.


## 2026-10-07 — Gate-C execution contract completed; external execution intentionally deferred

[architect-verified] The Gate-C implementation-side gap is now closed. The manual CI workflow has been strengthened to use `npm ci --legacy-peer-deps` (lockfile-enforcing installation) and now contains a dedicated `integrations-i2-focused` job covering runtime redaction/egress, credential-vault/runner behavior, AI integration authorization/readiness, registry/control-plane tests, focused typecheck, and focused lint.

- Workflow correction: `4714e5f5f2d157a8c868e118df5b26149b98c9cd`.
- Automatic CI remains disabled by owner directive; `workflow_dispatch` remains available.
- Gate-C is therefore **IMPLEMENTATION-COMPLETE / EXECUTION-DEFERRED**, not falsely marked verified.
- GitHub/Vercel execution evidence is explicitly skipped under the current owner instruction not to wait on external gates.
- I-2 application implementation is complete; remaining items are verification/operational evidence only.
- Gate-D is likewise skipped/deferred because its closure depends on Gate-C evidence and the owner has instructed that external gates must not block development.
- No I-3, MCP expansion, production promotion, or unrelated feature implementation is authorized by the current project-control boundary.

### I-2 owner checklist — 2026-10-07

**DONE — implementation**
- [x] Registry-authoritative integration/action capability model
- [x] Organisation/agent/user authorization boundaries
- [x] Fail-closed plan entitlement resolution
- [x] Connection auth-type authority
- [x] OAuth token endpoint authority
- [x] OAuth refresh user/agent scope preservation
- [x] OAuth refresh disable/disconnect race protection
- [x] Fail-closed scoped credential persistence
- [x] Activepieces reviewed-action allowlist
- [x] Registry-authoritative action discovery
- [x] AI integration action user-scoped readiness
- [x] AI integration availability user/tenant-scoped readiness
- [x] Custom Supabase Management credential authorization/fallback boundary
- [x] Secret/error/trace redaction
- [x] SSRF/private-network egress protection and redirect hardening
- [x] FLOW/store tenant isolation
- [x] Agent/org ownership enforcement
- [x] Organisation integration mutation serialization
- [x] Integration slot entitlement concurrency protection
- [x] I-2 migration/control-plane source implementation
- [x] Gate-C manual workflow contract

**PENDING — external verification only**
- [ ] Current-head GitHub workflow execution evidence
- [ ] Current-head production Docker build evidence
- [ ] Database migration/runtime execution evidence where environment access is required
- [ ] Real connector/OAuth smoke with valid provider credentials
- [ ] Browser allow/deny-path verification
- [ ] Immutable-source/runtime-import/secret/governance execution evidence
- [ ] Final Gate-D closure review

**IN PROGRESS**
- [ ] None in application implementation. I-2 source implementation is complete; external verification is deliberately not allowed to block the plan.

**DEFERRED/SKIPPED BY OWNER CONTROL**
- [x] Do not wait for GitHub Actions
- [x] Do not wait for Vercel
- [x] Do not run continuous verification
- [x] Do not block feature development on Gate-C/Gate-D execution

**Next planned work:** remain at the I-2 boundary until the owner re-enables external verification or explicitly authorizes the next phase. Do not silently expand scope.