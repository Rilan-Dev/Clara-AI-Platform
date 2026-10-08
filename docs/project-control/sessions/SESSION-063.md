# SESSION-063 — I-6 MCP runtime capability isolation correction

Date: 2026-10-08
Owner: ChatGPT — architect / implementation owner
Phase: Integrations Framework I-6 — MCP Tool Bridge
Status: IMPLEMENTATION CONTINUING

## Scope
Owner-authorized continuation of I-6 source implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

## Finding
The MCP runtime builder used `buildClaraToolRuntime()`, which intentionally registers RAG/integration tools in addition to MCP capabilities. This widened the MCP runtime capability set and contradicted the I-6 isolation contract.

## Correction
Commit `9eaf90d1a01697a9dc7481290bfbf25813e88828` changes `buildMcpToolRuntime()` to construct an isolated Unified Tool Runtime using Clara's existing authorization and metering bindings only. Unrelated RAG/integration tools are not registered.

## Evidence
- Existing focused I-6 regression requires the enabled runtime to contain only the resolved MCP capability and rejects `rag_search`.
- Direct source review confirms the implementation now matches that contract.
- External test/CI/Vercel/Gate-C/Gate-D evidence remains deferred by owner instruction.

## Next action
Continue bounded I-6 resolver/registration and capability-authorization invariant review. No MCP transport/server hosting, persistence/OAuth, marketplace, billing, production promotion, or unrelated scope.
