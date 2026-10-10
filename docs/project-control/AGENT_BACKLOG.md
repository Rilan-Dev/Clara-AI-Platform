# APCP Central Agent Backlog

Cross-agent coordination backlog. This records ownership and dependencies; it does not authorize implementation.

## Entry format

### <BACKLOG-ID> — <YYYY-MM-DD>
- **Work:** <task>
- **Owner:** <DEV-01 | FIX-01 | OPS-01 | WORK-01>
- **State:** <READY | ACTIVE | BLOCKED | ROUTED | DONE | SUPERSEDED>
- **Dependency:** <none or exact dependency>
- **Authorization:** <authorization reference>
- **Suggested next action:** <concrete action>
- **Related session/event/handoff:** <ids>

## Routing rule

If a task belongs to another agent, create or update a backlog entry and continue independent work. Do not poll repeatedly for the dependency.

### BACKLOG-OPS-001 — 2026-10-09
- **Work:** Fix duplicate 060 migration numbering blocking the clara-backend Vercel build from Vercel-Preview commit 4ea79c3b3bbb5202a25f2411b63471354200b01d.
- **Owner:** FIX-01
- **State:** ROUTED
- **Dependency:** Correct the migration source on the deployment branch; then a new deployment can be created from the corrected commit.
- **Authorization:** Not authorized for OPS-01 to change application migration source; routed for FIX-01 correction.
- **Suggested next action:** Preserve 060_sarvam_realtime_streaming.sql; remove or renumber the duplicate payment migration so its filename has a unique numeric prefix. The already-established corrected pattern uses 061_payment_settings_category.sql. Keep the duplicate-number guard in src/lib/db/migrate.ts. Do not skip migrations as a deployment workaround.
- **Related session/event/handoff:** EVT-OPS-001; OPS-01 / 2026-10-09


### BACKLOG-OPS-002 — 2026-10-09
- Work: Fix Tailwind v4/PostCSS compatibility blocking the local clara-backend Docker build on feature/ai-core-from-doable-source.
- Owner: FIX-01
- State: ROUTED
- Dependency: update package.json, package-lock.json, and postcss.config.js consistently; no Docker workaround is appropriate.
- Authorization: application build configuration defect; OPS-01 is limited to diagnosis/routing under the supplied OPS-01 mandate.
- Suggested next action: add @tailwindcss/postcss at a Tailwind-4-compatible version, regenerate the npm lockfile with the repository package manager, update PostCSS plugin registration, and then allow future build verification. Preserve Tailwind 4.3 and Docker npm-ci reproducibility.
- Related session/event/handoff: EVT-OPS-002; OPS-01-2026-10-09-DOCKER

- Resolution: FIX-01 applied Tailwind v4 PostCSS compatibility across package.json, package-lock.json, and postcss.config.js.
- Resolution commits: ed56e33d49a391025d605919183cb8cdc581fd20; d119c02853ef2a33eb508c69418745eeab385782; 0d1666efa24950a1a23a995cea57ba4a7adfd4da.

### BACKLOG-OPS-003 — 2026-10-09
- **Work:** Correct Vercel-Preview seed TypeScript/dependency mismatch blocking clara-backend deployment.
- **Owner:** FIX-01
- **State:** ROUTED
- **Dependency:** bounded application-source correction on Vercel-Preview.
- **Authorization:** Not authorized for OPS-01 to modify application source; routed under OPS-01 diagnosis mandate.
- **Suggested next action:** Reconcile production.ts with its required CliLog/observability and integration dependencies; do not bypass next build or db:migrate.
- **Related session/event/handoff:** EVT-OPS-003; HANDOFF-OPS-20261009-02.

### BACKLOG-OPS-004 — 2026-10-09
- **Work:** Correct Docker standalone runtime dependency packaging so compose build does not assume lodash.defaults is top-level hoisted.
- **Owner:** FIX-01
- **State:** ROUTED
- **Dependency:** bounded Dockerfile/package-layout correction on feature/ai-core-from-doable-source.
- **Authorization:** Not authorized for OPS-01 to change application/build source; routed under OPS-01 diagnosis mandate.
- **Suggested next action:** Derive standalone runtime copying from the actual npm-resolved dependency closure or use a reproducible packaging method; preserve lockfile resolution and ElevenLabs/ioredis behavior.
- **Related session/event/handoff:** EVT-OPS-004; HANDOFF-OPS-20261009-02.



### BACKLOG-DEV-20261010-MCP-RUNTIME — 2026-10-10
- **Work:** Implement secure Streamable HTTP MCP resolver and wire authorized MCP tools into actual Chat and realtime voice execution through the Unified Tool Runtime.
- **Owner:** DEV-01
- **State:** ACTIVE
- **Dependency:** MCP control-plane source slice committed in SESSION-DEV-20261010-02; runtime entry-point tracing and DNS/IP SSRF-safe transport remain.
- **Authorization:** Explicit owner continuation request; current `NEXT_ACTION.md`.
- **Suggested next action:** Implement host-owned `McpToolResolver` with connection-time DNS/IP validation, TLS/no-redirect/timeout/response-size controls, discovery/schema validation and tenant-scoped cache; then register tools into chat and realtime voice with invocation-time authorization.
- **Related session/event/handoff:** SESSION-DEV-20261010-02; no handoff yet.

### BACKLOG-DEV-20261011-01 — 2026-10-11
- **Work:** Verify and harden the MCP Streamable HTTP resolver and Chat/realtime Unified Tool Runtime paths with mocked transport, permission-revocation, stale-schema and parity tests; then execute focused tests/typecheck and a controlled live handshake.
- **Owner:** DEV-01
- **State:** ACTIVE
- **Dependency:** Local execution/test environment and an isolated controlled MCP server for end-to-end handshake. Do not wait for CI/Vercel.
- **Authorization:** Explicit owner-authorized next action recorded in `docs/project-control/NEXT_ACTION.md`.
- **Suggested next action:** Add deterministic injection points for DNS/HTTPS transport so DNS rebinding, redirects, timeout/cancellation, size limits and HTTP protocol handling can be tested without public network access; run focused resolver/bridge/Chat/realtime tests and `npm run type-check` when the repository runtime is available.
- **Related session/event/handoff:** SESSION-DEV-20261011-01; no handoff.


### BACKLOG-OPS-20261011-STRIPE-ORPHAN-ORG — 2026-10-11
- **Work:** Diagnose repeated Stripe `invoice.paid` processing failure caused by a billing event referencing an organisation absent from the active database.
- **Owner:** OPS-01
- **State:** READY
- **Dependency:** Read-only access to the same PostgreSQL database used by the running `clara-backend`, and Stripe invoice/subscription/customer lookup for the event.
- **Authorization:** Routed from FIX-01 under the standing rule that database/environment/runtime alignment defects belong to OPS-01. No destructive data repair authorized.
- **Suggested next action:** In the active DB, read-only correlate invoice `evt_1UP9JaSH7giJdRbDjderTSey` and organisation UUID `d8f78644-3198-41db-bcc3-278ecad0ecb4` against Stripe subscription/customer identifiers, `org_subscriptions`, and `organisations`. Verify the container DB target and deployed commit. Determine whether metadata is stale, tenant data is missing, or a lifecycle operation removed a referenced tenant. Do not create placeholders or bypass the FK.
- **Related session/event/handoff:** EVT-FIX-20261011-01; SESSION-FIX-20261011-01.
