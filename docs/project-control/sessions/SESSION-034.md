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
