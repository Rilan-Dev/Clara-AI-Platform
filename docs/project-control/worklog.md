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


### I-6 continued source hardening — 2026-10-08
- `635b5126`: resolved MCP capabilities are now bound to the exact provenance-verified execution-context identity used during resolver discovery; cross-context invocation fails closed with `TENANT_SCOPE_VIOLATION`.
- `55e7f36c`: regression covers cross-context invocation against a different tenant context.
- `02bff62a`: regressions cover default-off runtime construction and registration through the Unified Tool Runtime.
- `9eb58ab6`: malformed resolver descriptors are treated as unavailable capabilities when Unified Tool Runtime registration rejects them; unrelated valid capabilities can still register.
- `ddaa02bc`: regression covers malformed resolver schema output.
- Project-control NEXT_ACTION/PROJECT_STATE/VERIFICATION_STATE records updated.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction; no PASS/closure is claimed.

## 2026-10-08 — I-6 malformed surface allowlist + direct-context test correction

[architect-verified] Continued the owner-authorized I-6 source acceptance review without waiting for external CI/Vercel/Gate-C/Gate-D evidence. The MCP bridge now treats any malformed `allowedSurfaces` entry as a fail-closed registration error rather than silently discarding unknown values. A focused test also aligns direct allowlist-rejection construction with the required provenance-minted execution-context contract.

- Implementation: `030e905833097211adc0b69d202223c5e1f69de1`.
- Regression: `8b59963f594beac5980f2b1178b85400261642ab`.
- Test-contract correction: `b307056aa67c54024bc18b010d95ca13eec9ce73`.
- I-6 remains IN PROGRESS — bounded source hardening.
- External CI/Vercel/Gate-C/Gate-D remain deferred by owner instruction.
- Next implementation remains bounded I-6 resolver/registration and capability-authorization acceptance review.


### I-6 / runtime configuration correction — 2026-10-08
- Replaced the fragile Next TypeScript config boundary with explicit ESM `next.config.mjs` and `process.cwd()` root resolution; removed the old `next.config.ts`.
- Removed the obsolete Next 16 `eslint` build option.
- Hardened the MCP bridge against malformed runtime policy/descriptor shapes and added focused regressions.
- No external CI, deployment gate, or continuous verification was awaited.


## 2026-10-09 — Self-hosted Clara CSS regression hotfix

- Inspected the live public site and latest `feature/ai-core-from-doable-source` source.
- Confirmed dependency configuration uses `tailwindcss@4.3` and `@tailwindcss/postcss@4.3.3`, while `src/app/globals.css` used legacy v3 `@tailwind base/components/utilities` directives.
- Corrected the CSS entry to `@import "tailwindcss";` plus `@config "../../tailwind.config.js";` so Tailwind v4 generates utilities using the existing design-token configuration.
- Commit: `449afb73ea2a111c633c91dcd34e03f9d6a7480c`.
- The Dockerfile already copies `.next/static` into the runner image. The host's Docker build/recreate and HTTP asset verification remain pending because no SSH/server execution tool is available in this chat. No live deployment success is claimed.
- Immediate next action: pull the commit on the Docker host, rebuild/recreate `clara-backend`, and verify the served CSS assets.


## 2026-10-09 — Responsive login card hotfix

- Owner reported that the login page lost responsiveness and the card layout looked incorrect.
- Updated `src/features/admin/screens/login-screen.tsx`: small/dynamic viewport-safe minimum height, vertical padding for short screens, horizontal overflow protection, min-width-safe card wrapper, responsive header spacing, and explicit card padding that avoids the mobile `p-5` density override.
- Source commit: `4d6a9720383a77374d59a326a509a83940a3fa0c`.
- Project-control NEXT_ACTION now prioritizes Docker rebuild and visual checks on mobile/narrow and short viewports.
- No tests, build, device/browser validation, or self-hosted Docker deployment was run. Live fix remains pending rollout.


## 2026-10-09 — DEV-01 / Forge — realtime voice integration dispatch

- **Authorization:** Current `docs/project-control/NEXT_ACTION.md` bounded integration-runtime task; realtime voice dispatch through the Unified Tool Runtime was the explicit next implementation.
- **Started from:** `feature/ai-core-from-doable-source`, recovered from current committed project-control state.
- **Actions:** Added gated realtime integration tool descriptors, an authenticated server-side tool dispatch route, voice-client dispatch handling, and focused regression source for descriptor gating, tenant identity derivation, authorization, and runtime delegation.
- **Files/code:** `src/modules/assistant/api/realtime.ts`; `src/modules/assistant/api/realtime-tool.ts`; `src/app/api/realtime/tool/route.ts`; `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`; `src/modules/assistant/api/realtime.test.ts`; `src/modules/assistant/api/realtime-tool.test.ts`.
- **Implementation commits:** a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.
- **Evidence:** Source files and test source were inspected after edits. Tests/build were not executed; no CI/Vercel/Gates were awaited.
- **Blockers/dependencies:** Architect review pending. No deployment performed.
- **Lesson:** Realtime model tool descriptors are not an authorization boundary; every tool call must re-enter a same-origin authenticated endpoint and derive tenant/agent/user/session identity server-side before invoking the shared runtime.
- **Next action:** Architect review this bounded implementation; route any substantial defect to FIX-01. No unrelated implementation is authorized by this task.
