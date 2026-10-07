# SESSION-055 — I-082 OAuth refresh credential scope

Date: 2026-10-07
Role: ChatGPT — architect / implementation owner / reviewer
Phase: Integrations Framework I-2
Starting state: project-control continuity and NEXT_ACTION were re-read; I-2 remained the only authorized implementation boundary. No GitHub Actions, Vercel build, Gate-C evidence, or continuous verification was awaited.

## Finding

The runner selected active credentials with organisation + agent + user scope, but OAuth refresh subsequently called credential-vault decrypt/status/update operations using only connectionId + organisation. A concurrent connection scope change could therefore leave the refresh mutation boundary weaker than the execution credential-selection boundary.

## Correction

1. credentialVault.decrypt now accepts and enforces userId and agentId while preserving organisation-scoped connections.
2. credentialVault.updateStatus now preserves the same user/agent scope.
3. credentialVault.updateCredentials now preserves the same user/agent scope.
4. ensureTokenFresh receives userId and agentId and propagates them to every refresh read/write path.
5. runAction passes params.userId and params.agentId into ensureTokenFresh.

## Evidence

- f74d3928ce875e40ebafba473e92da4c90305ca0 — credential-vault scope correction.
- 4ea030a1d75e31983605e59026437de4336d5e16 — OAuth refresh scope propagation.
- bd238eaa379d51f11c9d867434cd0a77dc5ab1a0 — runner propagation.
- ff36bc22d29585275cb7b18b7887fb6fb44deec0 — I-082 recorded in ISSUES.md.
- b66d834b3db3fc60e2e26bf7daf7c84950e56c6b — NEXT_ACTION updated.
- 255a15661894439c4cc5cee3385ec0398c90fcc0 — PROJECT_STATE updated.

## Disposition

I-082 is RESOLVED by architect source review. I-2 remains IMPLEMENTED — VERIFICATION PENDING. Gate-C remains MISSING and Gate-D remains IN PROGRESS. Continue only bounded I-2 credential/connection, custom-action, authorization, egress, secret, AI-tool, and tenant-boundary work.

## Stopping boundary

No I-3, MCP expansion, production promotion, or unrelated implementation was started.
