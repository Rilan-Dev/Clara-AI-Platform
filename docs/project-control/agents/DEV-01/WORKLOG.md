# DEV-01 Role-Local Worklog

Append-only operational history for DEV-01. This is not the source of authorization.

## Entry format

### <SESSION-ID> / <DATE>
- **Task:** <task>
- **Authorization:** <reference or safe-maintenance classification>
- **Started from:** <commit/ref>
- **Actions:** <what was done>
- **Files/code:** <paths>
- **Evidence:** <tests/checks/observations>
- **Blockers/dependencies:** <none or exact>
- **Lesson:** <reusable lesson or none>
- **Next action:** <exact next action>

<!-- Append new entries below. -->


### SESSION-DEV-20261009-01 / 2026-10-09

- **Authorization:** Current `docs/project-control/NEXT_ACTION.md` bounded integration-runtime task; realtime voice dispatch through the Unified Tool Runtime was the explicit next implementation.
- **Started from:** `feature/ai-core-from-doable-source`, recovered from current committed project-control state.
- **Actions:** Added gated realtime integration tool descriptors, an authenticated server-side tool dispatch route, voice-client dispatch handling, and focused regression source for descriptor gating, tenant identity derivation, authorization, and runtime delegation.
- **Files/code:** `src/modules/assistant/api/realtime.ts`; `src/modules/assistant/api/realtime-tool.ts`; `src/app/api/realtime/tool/route.ts`; `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`; `src/modules/assistant/api/realtime.test.ts`; `src/modules/assistant/api/realtime-tool.test.ts`.
- **Implementation commits:** a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.
- **Evidence:** Source files and test source were inspected after edits. Tests/build were not executed; no CI/Vercel/Gates were awaited.
- **Blockers/dependencies:** Architect review pending. No deployment performed.
- **Lesson:** Realtime model tool descriptors are not an authorization boundary; every tool call must re-enter a same-origin authenticated endpoint and derive tenant/agent/user/session identity server-side before invoking the shared runtime.
- **Next action:** Architect review this bounded implementation; route any substantial defect to FIX-01. No unrelated implementation is authorized by this task.


### SESSION-DEV-20261009-03 / 2026-10-09

- **Task:** Add a reachable WhatsApp Business Messaging entry point to the existing per-agent workspace and expose the connection-start action.
- **Authorization:** Explicit current owner task; DEV-01 / Forge. No CI/Vercel gate or repeated verification wait.
- **Started from:** `feature/ai-core-from-doable-source`; project-control recovered from the current GitHub branch.
- **Actions:** Added the Messaging route and screen, a Connect WhatsApp Business dialog with a Meta Business Manager handoff, and the Messaging link in the existing desktop agent sidebar and mobile tabs. Preserved the single existing sidebar; no second rail was added.
- **Files/code:** `src/features/admin/screens/agent-messaging-screen.tsx`; `src/app/(admin)/orgs/[id]/agents/[agentId]/messaging/page.tsx`; `src/features/admin/layouts/admin-shell.tsx`; `src/features/admin/screens/agent-workspace/workspace-shell.tsx`.
- **Commits:** `751db6158fca1b85b6f6c933ad46b45635bfeaf1`, `292e8ea5dd5f7c1548d22a196324035f933de762`, `7d0e28314af14fd1739fa1746f5855632645b4d8`, `8fe3ee7c168c0bbc0d1e837514f1e0a3cab73500`.
- **Evidence:** Source writes returned successful GitHub commits. No tests/typecheck/build/CI/Vercel/live Meta flow was run or awaited.
- **Blockers/dependencies:** Repository search/source inspection found no WhatsApp-specific OAuth/connect API, webhook verification route, or durable WhatsApp message persistence implementation. The UI explicitly states that opening Meta does not connect the number; connection status remains Not connected. This is a real backend capability gap, not a UI success.
- **Lesson:** Never show “connected” just because a user was sent to an external provider. Channel UI must derive readiness from server-persisted connection and verified webhook state.
- **Next action:** Implement the server-side Meta WhatsApp Business connection lifecycle: authenticated per-agent connect initiation, durable single-number-per-agent binding, signed/verified webhook subscription and inbound event handling, and persistent message/delivery state; then wire the UI to the real status and callback result. Do not route this to OPS-01 unless deployment/infrastructure work becomes necessary.


### SESSION-DEV-20261009-03 / 2026-10-09

- **Task:** Add a reachable WhatsApp Business Messaging entry point to the existing per-agent workspace.
- **Authorization:** Explicit current owner task; DEV-01 / Forge.
- **Started from:** `feature/ai-core-from-doable-source`; project-control recovered from current GitHub branch.
- **Actions:** Added the Messaging route and screen, a Connect WhatsApp Business dialog with Meta Business Manager handoff, and Messaging links in the existing desktop agent sidebar and mobile tabs. No second sidebar added.
- **Files:** `src/features/admin/screens/agent-messaging-screen.tsx`; `src/app/(admin)/orgs/[id]/agents/[agentId]/messaging/page.tsx`; `src/features/admin/layouts/admin-shell.tsx`; `src/features/admin/screens/agent-workspace/workspace-shell.tsx`.
- **Commits:** `751db6158fca1b85b6f6c933ad46b45635bfeaf1`, `292e8ea5dd5f7c1548d22a196324035f933de762`, `7d0e28314af14fd1739fa1746f5855632645b4d8`, `8fe3ee7c168c0bbc0d1e837514f1e0a3cab73500`.
- **Evidence:** GitHub source writes succeeded. Tests/typecheck/build/CI/Vercel/live Meta flow were not run or awaited.
- **Blockers:** No WhatsApp-specific connect API, webhook verification route, or durable message persistence found. UI remains Not connected and explains that opening Meta alone does not authorize Clara.
- **Lesson:** Never infer connected status from external navigation; readiness must come from durable server-side connection and verified webhook state.
- **Next action:** Implement authenticated Meta connection initiation/callback, agent-scoped phone binding, webhook verification/inbound processing, durable message state, then bind UI to server state.


### SESSION-DEV-20261009-04 / 2026-10-09

- **Task:** Implement the server-side WhatsApp Business connection lifecycle, webhook processing, durable message state, and verified-connection briefing gate.
- **Authorization:** Explicit owner instruction and current authoritative `docs/project-control/NEXT_ACTION.md`; DEV-01 / Forge.
- **Started from:** `feature/ai-core-from-doable-source`; recovered current project-control and role-local records before editing.
- **Actions:** Added migration 067 for OAuth states/sessions, encrypted connection credentials, WABA/phone identities, unique one-active-phone constraints, webhook event dedupe, and durable message/delivery rows. Added authenticated connect/status/select/disconnect/subscribe/briefing actions, Meta OAuth callback and phone discovery, WABA subscription, signed webhook challenge/HMAC validation, transactional event processing, UI wiring to server state, regression helper tests, and Meta setup documentation.
- **Files/code:** `src/lib/db/migrations/067_whatsapp_business_lifecycle.sql`; `src/app/api/orgs/[orgId]/agents/[agentId]/messaging/connection/route.ts`; `src/app/api/whatsapp/oauth/callback/route.ts`; `src/app/api/webhooks/whatsapp/route.ts`; `src/modules/integrations/whatsapp-webhook.ts`; `src/modules/integrations/whatsapp-webhook.test.ts`; `src/features/admin/screens/agent-messaging-screen.tsx`; `docs/deployment/whatsapp-business.md`.
- **Source commits:** `27ad17cb8f9bff9d0278ce4eb68900e81fe2ecfe`, `89ce8d7b23e1fadb877c41f14540aa140b2f864b`, `496db2482512d39d632ee2c95c5ec2779a466bd4`, `3b238a36890b9f6d2acb8973a4e9681d6606ce26`, `19c6401062334447277171c3e44c906809378a6d`, `a664b5ce903c8ad5855fc411894d1ae42bc2c4bb`, `a5ccba51b4ecd06bc279c9f8f67b13c34cb1dc78`, `d44557504dc0e331d7530b240a292d32f5779105`, `392978f3df24a2656c43ed4b12241317ad1df66`, `a4f3e2049d71839b795119d1d239d82143f5a7cc`, `588af00d25e84a064315b0a96f60bef3ec81bccf`, `30fca3dfe1d2fc6a847cc8da7ca725a4dcf93f0c`, `0a14d72ad158492f81f8815fd9d55b1da6cde79f`, `9c63b124f3dd048322967f34b58d2c7578b70ba3`, `dc8f21c4cc0ee7a614d6aa2f20402e35dbe33ee5`, `7f5edfad9713a8561ddb07ad400c047a6c0fee4c`.
- **Evidence:** GitHub source commits succeeded and the source was re-fetched for inspection. Regression test source was authored but not run. No typecheck/build/Docker/CI/Vercel/deployment/live Meta flow was run or awaited; no runtime PASS is claimed.
- **Blockers/dependencies:** Server must have `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, a stable `NEXT_PUBLIC_APP_URL`, and `INTEGRATION_ENCRYPTION_KEY` (or supported `AUTH_SECRET` fallback); Meta app callback/webhook and scopes must be configured. The daily briefing flag is only a readiness/preference bit; no outbound sender or scheduled summary worker exists yet. Meta token expiry/revocation monitoring is also pending.
- **Lesson:** OAuth callback success alone is not channel readiness. Keep the token encrypted, phone binding database-enforced, webhook events signature-verified and idempotent, and daily briefing eligibility server-gated by active connection plus a valid signed event. Do not claim scheduled delivery until the actual worker and outbound send path exist.
- **Next action:** Implement outbound WhatsApp send/delivery capture and a `CRON_SECRET`-protected daily-summary worker that only selects active, webhook-verified, briefing-enabled connections; add route-level regression source for tenant isolation, state replay, phone uniqueness, duplicate events, and briefing gating. Continue without CI/Vercel polling. Route substantial correctness/security defects to FIX-01 and deployment/infrastructure-only work to OPS-01.


### SESSION-DEV-20261009-04 — follow-up source hardening

- Bound the callback to the initiating authenticated user session as well as the one-time OAuth state; sent Graph API access tokens in the Authorization header and WABA subscription tokens in the POST body rather than the URL.
- Bounded webhook body size, validated provider timestamps, rejected non-WhatsApp webhook objects, and fixed disconnect result reporting.
- Follow-up commits: `86819cc2af482ad6ae46474496546202cd8c2fc7`, `9c63b124f3dd048322967f34b58d2c7578b70ba3`, `dc8f21c4cc0ee7a614d6aa2f20402e35dbe33ee5`, `93743aebaa8d66f55ccf30cfc15c8b6b7aa0976`, `ef6f17b22c1bacd7be7741a6d496c64c792e409a`, `494fc312ecf14ed22e8540f560cb94fd19dc42a`.
- Verification remains source inspection only; no tests/build/live Meta flow were run or awaited.


### SESSION-DEV-20261009-04 — scheduled briefing follow-up

- **Actions:** Added recipient E.164 validation and explicit opt-in fields; briefing eligibility now requires a verified connection plus saved recipient consent. Added `whatsapp_daily_briefing_runs`, a `CRON_SECRET`-protected sender using an approved Meta template, outbound message/status persistence, duplicate-per-date prevention, and a 03:00 UTC schedule in `vercel.json` (also consumed by self-hosted `local-cron`). Extracted and authored regression source for recipient validation and bounded daily digest generation.
- **Additional files:** `src/app/api/cron/whatsapp-daily-briefings/route.ts`; `src/modules/integrations/whatsapp-briefing.ts`; `src/modules/integrations/whatsapp-briefing.test.ts`; updated `src/lib/db/migrations/067_whatsapp_business_lifecycle.sql`, `src/app/api/orgs/[orgId]/agents/[agentId]/messaging/connection/route.ts`, `src/features/admin/screens/agent-messaging-screen.tsx`, and `vercel.json`.
- **Commits:** `6535699544f97dd912fff7ecbd997c05dbbbde9a`, `82fbd0d46bfc179cb90ff4ed86963b48283b96b8`, `68feadd4843e30ec4214b3ca38ec3e9839c89677`, `15e1285c3d1be6402fe42232bcb2b28eedf98ef7`, `4aafbb3ab2435d8ea52816be7641f53faf0a21e7`, `6b280078a817e8e98fe18244eea152a5c2e245e9`, `8301d7f59d3275795e1cd326be2ca51b61fa6fa5`, `e17a6376ab9bd75feb4c681767fce534579b0635`, `8669eeb679afa39a295038817dae9fe316f70f76`, `62675fe59e5570366e925140a18c2f28884936d3`, `7086c66ea3458617f69eff28a2eefaa2785c25f4`.
- **Boundary:** Daily content is a deterministic digest of recent inbound excerpts, not LLM summarization. The approved template, Meta app setup, CRON_SECRET, and recipient opt-in are required. No tests/build/cron run/live provider send was executed or awaited.
- **Next:** Implement token expiry/revocation/reconnect health and route-level regression source; reconcile ambiguous `sending` runs without unsafe automatic retries.


### SESSION-DEV-20261009-04 — token-health and queue follow-up

- **Actions:** Persisted Meta `expires_in` in OAuth session and active connection state when returned; GET/POST status handling and cron mark expired active tokens as `error` and disable briefing eligibility. Graph 401/403 from the sender mark the connection unhealthy and stop future scheduled sends. Reconnect is available through the existing Connect action when the current connection needs attention. Added opt-in withdrawal, guarded selection of non-expired OAuth sessions, and queue filtering that avoids retrying ambiguous `sending` runs or letting exhausted failures starve other connections.
- **Schedule:** `vercel.json` checks the briefing queue every 15 minutes (UTC), up to three eligible connections per invocation, and the job avoids more than one successful run per connection/UTC date. `src/lib/local-cron.test.ts` now asserts the new route is registered.
- **Additional commits:** `8eed6a9081351341bd35bc69537ec99c3915d72b`, `b9b0f3e1ad4ce8fd19b01df5658c5b7fa8f477f6`, `5b534dde67ccde6d3777aa5785558be59b39b18c`, `a3055f6f13b64b5123dd5d09397514a6fcc584fb`, `25900977c6c7eec91e48d9bac621ea71b1368919`, `0208608bd9de3791f6ff190dfe65023454eb0bef`, `74d1559046370cdc5a7073f90106cc311b441a8d`, `37f1fc18437cc76d911a1444d8c406eecb6362da`, `447a62fb18d5c0729c12548bddd105beb355a3a8`, `2d8f467a163cbc504007caad9e13efd6b8abfefd`, `b4cee0d1760a5fb66ac493eb9c458d5086441fce`, `6535699544f97dd912fff7ecbd997c05dbbbde9a`, `82fbd0d46bfc179cb90ff4ed86963b48283b96b8`, `68feadd4843e30ec4214b3ca38ec3e9839c89677`, `15e1285c3d1be6402fe42232bcb2b28eedf98ef7`, `4aafbb3ab2435d8ea52816be7641f53faf0a21e7`, `6b280078a817e8e98fe18244eea152a5c2e245e9`, `8301d7f59d3275795e1cd326be2ca51b61fa6fa5`, `e17a6376ab9bd75feb4c681767fce534579b0635`, `8669eeb679afa39a295038817dae9fe316f70f76`, `62675fe59e5570366e925140a18c2f28884936d3`, `7086c66ea3458617f69eff28a2eefaa2785c25f4`, `1591b6b23210cbe701df0899cd98c675d62bf649`, `35695d6a4a7cb0755e43b3c7412f44010ff37bf8`, `5f64e74a38e4b2c55a58e3c3774fff448956a8c3`, `e074186a3db3c9b44965fd97868f5916c4e09c5a`, `74d1559046370cdc5a7073f90106cc311b441a8d`, `37f1fc18437cc76d911a1444d8c406eecb6362da`.
- **Verification:** Source inspection only; no tests/build/cron/live Meta flow executed or awaited.
- **Next:** Add proactive revocation/permission-health probes and focused route-level regression source. Continue without CI/Vercel polling.


### SESSION-DEV-20261009-04 — regression-source and delivery-order follow-up

- **Actions:** Added `advanceWhatsAppMessageStatus` so late `sent`/`failed`/unknown events cannot regress delivered/read states; webhook processing and early-status reconciliation use the same monotonic transition helper. Added regression source for status transitions, callback state replay/current permission, tenant boundary, briefing gate, E.164 recipient validation, and summary bounds. Added cron registration assertion.
- **Files:** `src/modules/integrations/whatsapp-message-status.ts`; `src/modules/integrations/whatsapp-message-status.test.ts`; `src/app/api/whatsapp/oauth/callback/route.test.ts`; `src/app/api/orgs/[orgId]/agents/[agentId]/messaging/connection/route.test.ts`; `src/lib/local-cron.test.ts`; webhook and scheduled worker status update paths.
- **Commits:** `84f9cdb1f4cb57fc9515271366abace3e0467c74`, `5da2109defd6b6539cb9f6b2dae680bd6ca2943a`, `c94d8957cbacbc261787984841c67d9dd1570910`, `9af04c79e7f6aefa6f151d7f8252f29fe1f4f491`, `8e1cac3858f84812d48e50584ad9d28dc6ae528f`, `c646654fb1b32f07732201329612f2c7330de26e`, `211c037416f81659982bdba7e68f411273ce7d62`, `289b71f1fc98d54fadb5b3146d40c07e9754c4ce`.
- **Verification:** Test source authored only; none of the tests were executed. No typecheck/build/cron/live Meta flow was run or awaited.
- **Next:** Add remaining phone uniqueness and duplicate-webhook retry tests, proactive token revocation/reconnect health, and safe reconciliation for ambiguous sending states.


### SESSION-DEV-20261009-04 — manual Meta health probe

- **Actions:** Added authenticated `verify` action to check access to the selected WABA using the encrypted active token. HTTP 401/403 marks the connection `error`, disables daily briefing eligibility, and presents the reconnect path. Messaging now exposes Verify Meta access and refreshes state after subscription/verification failures.
- **Regression source:** Added a route test for a rejected Meta token and the resulting unhealthy state/briefing disablement. It is source only and has not been executed.
- **Boundary:** Proactive periodic health probing remains pending; expiry and send-time 401/403 are guarded, while the manual probe is user-triggered.


### SESSION-DEV-20261010-01 / 2026-10-10
- **Task:** Audit completed/incomplete MCP functionality and plan platform-admin, organisation, agent, chat and realtime voice experience.
- **Authorization:** Explicit current owner request; DEV-01 / Forge.
- **Started from:** `feature/ai-core-from-doable-source`; current project-control and role-local records recovered from GitHub.
- **Actions:** Inspected project state/next action/verification state, DEV-01 memory/worklog and central sessions; inspected I-6 MCP bridge/tests, shared integration policy, integration bridge, realtime dispatch and existing UI paths. Added MCP audit/roadmap and made it authoritative NEXT_ACTION.
- **Files:** `docs/superpowers/plans/2026-10-10-mcp-configuration-ui-chat-voice-roadmap.md`; `docs/project-control/NEXT_ACTION.md`; `docs/project-control/sessions/SESSION-DEV-20261010-01.md`.
- **Commits:** `7a57655b4df9a347456dde9f7cb3749cb1fd4c8b`, `d85b3bab2342d548af1313d0c80aee4487442b4c`.
- **Evidence:** Source inspection and successful document commits. No tests/typecheck/build/CI/Vercel/runtime verification performed or claimed.
- **Blockers:** Need inspect migration, integration API, credential vault and runtime context before active MCP persistence/transport. Bridge expects a host resolver; no end-to-end MCP transport/configuration path established by this inspection.
- **Lesson:** Bridge completion does not prove configured servers, tenant-safe credentials, discovery or chat/voice availability. Recheck grants at discovery and execution; never trust client-supplied identity.
- **Next action:** Implement registry/credential/grant contract and platform/org UI in existing integration surfaces; wire supported transport to chat/realtime via Unified Tool Runtime.

### SESSION-DEV-20261010-02 / 2026-10-10
- **Task:** Implement first MCP server registry and connection/grant contract plus platform/org/agent UI.
- **Actions:** Inspected migrations 060–062, existing encryption and integration APIs/UI; added migration 069, platform MCP registry API, org-scoped connection/grant API, platform/org/agent panels, and regression test source.
- **Files:** `src/lib/db/migrations/069_mcp_server_control_plane.sql`; `src/app/api/platform/mcp-servers/route.ts`; `src/app/api/orgs/[orgId]/mcp-servers/route.ts`; matching `.test.ts` files; `src/features/admin/screens/{mcp-servers-panel,org-mcp-servers-panel,agent-mcp-tools-panel}.tsx`; existing integration screens; `docs/project-control/NEXT_ACTION.md`; session record.
- **Evidence:** Successful GitHub source commits; source rereads for key files. Tests were authored, not executed. No typecheck/build/runtime/CI/Vercel PASS claimed.
- **Security:** Org tokens use existing server-side pgcrypto encryption; APIs do not return credentials; org/agent grants are separate; server disabled by default; URL registration rejects HTTPS/IP/private obvious endpoint patterns; credential save status is `configured`, not `connected`.
- **Pending:** Live transport and DNS-rebinding-resistant resolver, real tool discovery/schema conversion, chat and realtime runtime registration, invocation-time reauthorization, runtime audit and end-to-end tests.
- **Lesson:** Config-time URL filtering is not enough for SSRF protection; actual transport must validate DNS/IP targets at connect time. Stored credentials are not proof of connectivity.
- **Next action:** Implement secure Streamable HTTP resolver and register the authorized tool set in Chat and realtime voice through Unified Tool Runtime.
- **Follow-up hardening:** Registration rejects literal IP and numeric-host endpoint forms (`d5b9dcb4`); tool-surface and transport test cases were separated (`f03ae80a`); disabled servers and unapproved tools still permit tenant-side revocation/disconnect (`f393f753`); MCP connection state is explicitly `configured`, not a successful handshake.

### SESSION-DEV-20261011-01 / 2026-10-11

- **Task:** Fix Gmail OAuth app configuration PUT failure from production logs.
- **Authorization:** User supplied production curl/log evidence; bounded source bug fix on current branch.
- **Started from:** `feature/ai-core-from-doable-source`.
- **Actions:** Traced the runtime error to a named import of a non-exported helper; exported `normalizeScopes` from its existing validation module.
- **Files/code:** `src/modules/integrations/oauth-app-validation.ts`.
- **Evidence:** Existing `oauth-app-validation.test.ts` already imports and exercises `normalizeScopes`; source commit `bfc5fc00de27309598b4bcfe4813f8626de9b8b0` created. No test/build/deployment/live request executed.
- **Blockers/dependencies:** Deployment must rebuild/reload the updated module. Exposed cookie/client secret need revocation/rotation before retry.
- **Lesson:** A named export mismatch may surface as a runtime `is not a function` when build/runtime configuration does not reject the missing export; check the source export and deployed build revision together.
- **Next action:** Rebuild/redeploy, then retest using fresh credentials; inspect only redacted logs if another failure occurs.


### SESSION-DEV-20261011-01 / 2026-10-11

- **Task:** Implement secure Streamable HTTP MCP resolver and wire discovered tools into Chat and realtime voice via the Unified Tool Runtime.
- **Authorization:** Explicit next action in `docs/project-control/NEXT_ACTION.md`; continuation from SESSION-DEV-20261010-02.
- **Started from:** `feature/ai-core-from-doable-source`.
- **Actions:** Added server-side resolver; HTTPS/DNS public-IP pinning/TLS/no-redirect/timeout/cancellation/size guards; JSON-RPC initialize and paginated tools/list; bounded schema conversion and stale-schema check; execution-time platform/plan/org/agent/user/KB/session/surface rechecks; request-scoped runtime composition; Chat and OpenAI realtime advertisement/dispatch; focused endpoint/IP regression source.
- **Files/code:** `src/modules/ai-platform-core/mcp-streamable-http-resolver.ts`, `mcp-streamable-http-resolver.test.ts`, `mcp-tool-bridge.ts`, `index.ts`, `src/modules/assistant/api/chat.ts`, `src/modules/assistant/api/realtime.ts`, `src/modules/assistant/api/realtime-tool.ts`, and project-control records.
- **Evidence:** Source commits written to the feature branch and changed files re-fetched for review. No executable verification was run.
- **Blockers/dependencies:** No local test/typecheck execution or controlled MCP test server available in this source-only workflow; no verified live transport.
- **Lesson:** Keep MCP definitions bound to a request-scoped execution context; never attach them to the process-global runtime. Recheck current DB grants on every resolution/invocation and do not cache tool discovery until invalidation semantics cover platform, organisation, agent and remote-schema changes.
- **Next action:** Add mocked transport/runtime regressions, run focused tests and `npm run type-check` when execution is available, fix source issues without waiting for CI/Vercel, then validate a controlled live initialize/list/call before enabling servers.


#### SESSION-DEV-20261011-01 addendum — 2026-10-11

- Added `070_mcp_connection_handshake_status.sql` to distinguish encrypted-but-unverified configuration from a successful MCP discovery handshake.
- Resolver now records `connected` and `last_connected_at` only after valid approved-tool discovery. Runtime queries and organisation/agent UI accept both `configured` and `connected`; organisation UI shows the last handshake and permits bearer credential rotation.
- Migration application and all executable verification remain pending; keep MCP servers disabled.


#### SESSION-DEV-20261011-01 cache clarification — 2026-10-11

- Added a 3-second bounded singleflight cache only for remote tool metadata within the same immutable execution context and credential fingerprint. Every resolve still rechecks authoritative DB authorization; side-effecting invocation bypasses this cache and rechecks current grants/schema immediately before `tools/call`.
- This is not a cross-request or cross-tenant cache. The earlier no-cache guidance applies to shared caches without reliable invalidation. Cache concurrency remains untested.

## 2026-10-11 — FIX-01 build failure: duplicate named export

- **Observed:** Owner-provided Docker build at branch head `985b2a07` failed Next.js webpack compilation: `src/modules/ai-platform-core/index.ts` exported `buildClaraToolRuntime` twice. Docker therefore did not produce a new backend image; the healthy container logs afterward are from the previous image and still showed the earlier `normalizeScopes` runtime exception.
- **Correction:** Removed the duplicate `buildClaraToolRuntime` export. Commit: `d755aea0de75509cabfe2ed4c76e7cae2468db2e`.
- **Verification:** Source correction committed only. No post-fix build/typecheck/tests or production OAuth save was executed. Do not treat the old container as updated.
- **Next:** Rebuild `clara-backend` from the feature branch. If another compiler error appears, fix that exact failure. Once build succeeds, recreate the backend and retry OAuth save with a fresh session and rotated Google client secret; never reuse the exposed credentials.
