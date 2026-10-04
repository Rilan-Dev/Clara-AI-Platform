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
