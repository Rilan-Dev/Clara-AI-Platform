# SESSION-034 — Integrations I-1 contract correction

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source
Authorization: D-031

## Work
Architect review of I-1 identified I-018: the contract/test boundary was inconsistent with its own secret-safety threat model. The test still constructed a removed generic `metadata` field; `IntegrationExecutionResult.error` still exposed generic `details`; and the test omitted the `IntegrationExecutionResult` type import.

## Correction
- Removed generic `error.details` from `integration-contracts.ts`.
- Updated the test to use explicit `providerAccountId` and retain a compile-time negative test for forbidden generic metadata.
- Added the missing `IntegrationExecutionResult` type import.
- Commits: `b13e74487a5874b8b070da8ade97963e3f63f0d5`, `bfc40f671aea218def571c617f00789e15b45823`.

## Verification
[architect-verified] Correction diff is limited to the two D-031 contract/test files. No runtime integration, persistence, OAuth, credential-vault, egress, deployment, billing, MCP, or I-2 scope was introduced.

Gate C remains MISSING because the connected GitHub integration exposes no Actions run for the current feature head. Therefore I-1 remains IMPLEMENTED — VERIFICATION PENDING.

## Stopping boundary
Await executable focused I-1 CI evidence and then perform final Gate-D closure review. No I-2 or later integration work is authorized.


## 2026-10-05 — UI/RBAC/subscription readiness continuation

The same session record now also covers the user-directed UI continuation after I-1 contract correction.

- Members UI visibly explains Admin / Project manager / Editor / Viewer roles.
- Project managers are limited to Editor/Viewer grants in the UI.
- Server-side invitation and role-change handlers enforce the same hierarchy and reject self-role changes.
- Billing & Plan cards expose KB, document/KB, request, storage, Voice, API, Branding, and SSO entitlements alongside existing usage meters and billing flows.
- `@e965/xlsx@0.20.3` is now declared and locked with published integrity metadata; immutable/reference trees remain untouched.

Source review confirms the correction delta from `8585f8db35b2806340e79f4e8ad55f61aa36ca52` to `845753cb347af678dae578c05fef17bed67a5abe` is limited to the RBAC/UI implementation paths.

**Pending:** current-head production build, current-head CI evidence, browser verification, exact-head immutable/runtime-import/secret/governance checks, and final I-1 Gate-D closure review. No I-2 runtime, OAuth, persistence, egress, MCP runtime, or production promotion is authorized.


## Preview trigger
A governance-only continuation commit is being used to request a fresh Vercel preview for browser verification. No application behavior or scope is changed by this trigger.


## 2026-10-06 — I-2 runtime security hardening continuation

Authorization: D-032
Status: IMPLEMENTATION CORRECTION COMPLETE — VERIFICATION PENDING

The active bounded work is Integrations I-2. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

### Corrections
- Added recursive `redactValue()` for AI-visible integration results and scrubbing of known credential values.
- `runAction()` now returns sanitized outputs for both custom and Activepieces-backed actions.
- Added pure `validateActionProps()` pre-execution validation for required fields, common primitive types, and nested object properties.
- Unknown action properties remain allowed for forward compatibility.
- Added regression tests for result redaction and action input validation.

### Commits
- `1d05f3de112e76437e4cdc1a78f12b01eb8199f7`
- `504d74ecf819d1cee40432c69e661f882dd03e68`
- `bf245d2be175fcd9ba457ef2e578801830ba7675`
- `b045f6221fb36e05bf3ba621e293f90dc209d0e1`
- `f68e65afc5ba4f7d6149c84ca1d24a6f082f5113`
- Project-control reconciliation: `c370fc27882381aac8409371879fac022d14727e`, `4f62b86b87cddb8654d8b45b88a2d3cd865f0663`

### Verification
These changes are not Gate-C PASS: executable current-head test/typecheck/lint/build evidence is still outstanding. Remaining bounded I-2 verification is unchanged: dependency/lock synchronization, executable test/build evidence, connector/OAuth smoke where configured, browser access/denial verification, immutable/runtime/secret/governance scans, and final ChatGPT Gate-D review.


## 2026-10-06 — I-2 OAuth refresh implementation continuation

Authorization: D-032  
Status: IMPLEMENTATION CORRECTION COMPLETE — VERIFICATION PENDING

The user-directed continuation does not wait on GitHub Actions or Vercel as a development blocker. The bounded I-2 runtime was reviewed for remaining implementation gaps.

### Implemented
- credentialVault.updateCredentials(connectionId, orgId, credentials) added with an explicit organisation predicate and encrypted pgp_sym_encrypt() persistence.
- ensureTokenFresh() now performs an OAuth 2 refresh when the access token enters the 15-minute safety window.
- Refresh requests use the stored trusted HTTPS token endpoint and form-encoded OAuth refresh parameters.
- Successful refresh preserves the prior refresh token when a provider omits a replacement and persists the new access token/expiry encrypted.
- HTTP/network failures are normalized without exposing response bodies or credentials.
- Invalid-grant-style 400/401 responses mark only the tenant-scoped connection as expired.
- Added regression coverage for no-refresh, successful refresh, invalid-grant expiry, and HTTPS enforcement.

### Commits
- c874781611b105853489addbb9a05dd69ecff14f — tenant-scoped encrypted credential update
- 32733343d8d0bb13322e2f64bd45c2fc977989d2 — OAuth access-token refresh
- bda5dc7a98c1494721268caa7716035f2f47553e — OAuth refresh regression tests
- 85392fcd8196d36907f90a5126044ebb5b71ddab / b5ed07730fe326a77c81b7a91b2d5aaee691a806 — control-state reconciliation

### Remaining bounded I-2 gaps
OAuth callback/state transport is still not implemented as a complete end-to-end flow, so OAuth smoke cannot yet be represented as fully PASS. Dependency/lock synchronization and executable current-head test/typecheck/lint/build evidence also remain outstanding. No I-3, MCP expansion, production promotion, or unrelated work is authorized.


## 2026-10-06 — I-2 outbound egress/SSRF hardening continuation

Authorization: D-032  
Status: IMPLEMENTATION CORRECTION COMPLETE — VERIFICATION PENDING

### Implemented
- Added a host-owned outbound integration egress policy in runner-fetch.
- HTTP/HTTPS are the only allowed integration protocols.
- URL userinfo is rejected.
- Literal and DNS-resolved destinations in loopback, private, link-local, carrier-grade NAT, documentation, multicast, and other non-public ranges are denied.
- The policy is applied before external integration requests while preserving the existing trusted internal Clara broadcast/collaboration bypass.
- Added regression coverage for private/loopback/metadata/multicast denial, protocol/userinfo rejection, and a public IP allow case.

### Commits
- c950c1f6fd8a71ea04b4928f60c52b8bcbb65664 — initial SSRF egress policy
- 1e0561ca03ef883995d03c7eb88a38882a4a77fd — Node DNS typing correction
- c913bf77f45808237df832e8fe60e0321b91bacf — SSRF regression tests
- c9c09b068002535190daba66259233229640ab80 — preserve trusted internal fetch bypass ordering
- 4eba8c473c06406c7ba57e48a1af0b8d9dc4ed6b / 8283c14c909ccdf31d9fdb906986960714ef2dfb — control-state reconciliation

### Remaining bounded security note
The current policy validates the initial integration destination and blocks non-public DNS answers. Automatic HTTP redirect targets are not independently revalidated by the current fetch wrapper; this remains a bounded verification/security item and is not being claimed as fully closed. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.


## 2026-10-06 — I-2 OAuth refresh egress and STT diagnostic hardening

Authorization: D-032  
Status: IMPLEMENTATION CORRECTION COMPLETE — VERIFICATION PENDING

### Implemented
- OAuth token refresh now explicitly calls the existing host-owned `assertSafeEgressUrl()` policy before contacting the provider token endpoint. This closes the pre-action-context egress gap in `ensureTokenFresh()`.
- Removed the temporary server-side STT audio dump to `/tmp/stt-last.*`.
- Removed verbose Scribe `wordsHead` logging; only bounded operational metadata remains.
- Added focused regression coverage for private/loopback IPv4 and IPv6 destinations, non-HTTP protocols, and URL-embedded credentials.

### Commits
- 17ff52f0b54f0eb2b4d2c17408d3c6247d3a87ee — OAuth refresh egress + STT diagnostic hardening
- 21331a5c2924ce983d6c075d4cfe4c8b256c15b4 — egress regression tests

### Verification
These are architect-executed source corrections only. Gate-C remains MISSING because executable current-head build/test/typecheck/lint evidence has not been produced. Gate-D remains IN_PROGRESS. I-2 remains open.

No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.
