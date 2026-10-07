# Clara Project Worklog

## 2026-10-08 — I-6 MCP Tool Bridge implementation

- Owner instruction: continue next implementation without waiting for GitHub Actions, Vercel, continuous verification, or phase gates.
- Repository review established that I-3 is already implemented and I-4/I-5 are source-complete; they are not restarted.
- Started I-6: bounded MCP Tool Bridge.
- Added `docs/superpowers/plans/2026-10-08-integrations-i6-mcp-tool-bridge.md`.
- Added `src/modules/ai-platform-core/mcp-tool-bridge.ts`.
- Added `src/modules/ai-platform-core/mcp-tool-bridge.test.ts`.
- Exported I-6 bridge types/functions from `src/modules/ai-platform-core/index.ts`.
- Added project-control session `SESSION-060.md`.
- Reconciled the authoritative project-control headers to I-6 active state.
- I-6 is source implementation IN PROGRESS; no external gate or build result is claimed.
- Non-scope: MCP transport/server hosting, OAuth/persistence, marketplace, billing redesign, production promotion, unrelated features.

### I-6 continuation — MCP resolver identity hardening
- `aa062df`: resolver output must exactly match the already-allowlisted server/tool identity; mismatched descriptors are rejected before registration.
- `fb326688`: focused regression covers resolver identity drift.
- External execution remains deferred by owner instruction.

### I-6 continuation — runtime/seam hardening
- `b59f1c9`: focused regressions now prove MCP execution preserves the exact caller execution context and that invalid input is rejected by the Unified Tool Runtime before resolver invocation; resolver server/tool identity drift is covered.
- `827eae5`: MCP resolver discovery exceptions now fail closed instead of escaping as provider/transport errors.
- `d571813`: regression covers unavailable resolver discovery.
- `0b1856b`: public `src/modules/ai-platform-core/index.ts` now exports the I-6 MCP bridge; this corrected a source-level seam gap found during architect review.
- Project-control current-state blocks were reconciled to I-6 and the stale Part-II Z.AI handoff state was removed; Z.AI remains STOPPED and ChatGPT remains implementation owner.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction.

### I-6 bounded hardening — 2026-10-08
- Source review found two bridge fail-closed gaps: explicit empty surface allowlists widened to the default surface set, and sanitized server/tool identifiers could collide.
- `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6` fixes both boundaries: omitted surfaces use the default, explicit empty surfaces deny all; normalized names carry an identity-derived suffix within the 64-character contract.
- `d4bfbe112863696c99ad7abb81857a9399f079c2` adds focused regressions for both cases.
- Session: `docs/project-control/sessions/SESSION-061.md`.
- External CI/Vercel/Gate-C/Gate-D remain deferred; I-6 stays IN PROGRESS.

### I-6 authorization-surface contract hardening — 2026-10-08
- Replaced the exported `authorizeMcpTool()` helper with `isMcpToolAllowlisted()` because the former name implied full authorization while only evaluating static server/tool allowlists.
- `6d37d607689a3379a253659ebd50046d6b1b8727`, `f6454910c436d14b29c768180f344e02159dd908`, and `8504c42a058fce9c8e38979c3d93899fd95345a2` align implementation, regression, and public export.
- Full surface/identity/RBAC/plan/tenant authorization remains owned by the Unified Tool Runtime.
