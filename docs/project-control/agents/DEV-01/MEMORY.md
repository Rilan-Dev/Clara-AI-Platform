# DEV-01 Role-Local Memory

This is durable memory for DEV-01. It supplements, but never overrides, shared APCP memory or repository authority.

## Read before work
- docs/project-control/AGENT_MEMORY.md
- docs/project-control/AGENT_EVENTS.md
- docs/project-control/AGENT_SESSIONS.md
- docs/project-control/AGENT_HANDOFF.md
- docs/project-control/AGENT_BACKLOG.md
- this file
- current project-control state and applicable architecture/plan

## Record
- recurring issues;
- role-specific mistakes and prevention;
- successful patterns;
- failed approaches;
- environment-specific observations;
- lessons that should be promoted to AGENT_MEMORY.md when cross-agent.

## Do not store
Secrets, tokens, passwords, private keys, or sensitive personal data.

<!-- Append durable DEV-01 lessons below. -->


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-01
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** Realtime voice exposed only `rag_search`; integration tools could not be invoked by a live voice session.
- **Root cause:** The Realtime session descriptor list and browser tool-call handler were not connected to the existing server-side integration runtime.
- **Failed approach:** Treating client-supplied KB/tenant/agent identity or a model tool descriptor as sufficient authorization would bypass server-side provenance and tenant boundaries.
- **Remedy:** Gate descriptors behind both existing default-off flags and authenticated KB membership; submit calls to a same-origin route that derives org/agent/user/session identity from server state and invokes the existing Unified Tool Runtime.
- **Prevention:** Every voice tool call must pass server authentication, KB access checks, a factory-minted execution context, and the existing runtime; public embed sessions must not receive these workspace integration tools.
- **Related record:** `src/modules/assistant/api/realtime-tool.ts`; source commits a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-03
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** Agent workspace had no Messaging navigation path or WhatsApp Business connection action; source search did not find a WhatsApp-specific connect route, webhook verifier, or durable message store.
- **Root cause:** The generic integrations UI controls AI tool integrations, not WhatsApp as a messaging channel; adding only an integration toggle would not establish a WhatsApp phone connection.
- **Failed approach:** Treating a generic integration grant or an external Meta page visit as a completed WhatsApp connection would falsely imply account authorization and webhook readiness.
- **Remedy:** Add Messaging to the existing agent sidebar and mobile tabs and keep status Not connected until a server-side Meta connection lifecycle exists.
- **Prevention:** UI state must be backed by durable tenant/agent-scoped connection state and verified webhook status; external provider navigation is setup guidance only.
- **Related record:** SESSION-DEV-20261009-03; commits 751db6158fca1b85b6f6c933ad46b45635bfeaf1, 292e8ea5dd5f7c1548d22a196324035f933de762, 7d0e28314af14fd1739fa1746f5855632645b4d8, 8fe3ee7c168c0bbc0d1e837514f1e0a3cab73500.


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-03
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** Agent workspace had no Messaging navigation path or WhatsApp Business connection action; no WhatsApp-specific connect API, webhook verifier, or durable message store was found.
- **Root cause:** Generic agent integrations grant AI tool access; that is not a WhatsApp phone connection.
- **Failed approach:** Treating an external Meta page visit as a completed WhatsApp connection would falsely imply account authorization and webhook readiness.
- **Remedy:** Add Messaging to the existing sidebar/mobile navigation and keep the channel Not connected until a server-side Meta connection lifecycle exists.
- **Prevention:** UI readiness must be backed by durable tenant/agent-scoped connection state and verified webhook status.
- **Related record:** SESSION-DEV-20261009-03; commits 751db6158fca1b85b6f6c933ad46b45635bfeaf1, 292e8ea5dd5f7c1548d22a196324035f933de762, 7d0e28314af14fd1739fa1746f5855632645b4d8, 8fe3ee7c168c0bbc0d1e837514f1e0a3cab73500.


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-04
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** WhatsApp Business was only a UI entry point; there was no server-owned Meta authorization, durable phone binding, signed webhook processing, or message state.
- **Root cause:** Generic AI tool integrations do not establish a WhatsApp channel connection.
- **Remedy:** Add a separate agent-scoped WhatsApp lifecycle with hashed one-time OAuth state, encrypted tokens, unique active phone constraints, WABA subscription, raw-body HMAC validation, transactional idempotency, and server-authoritative readiness.
- **Prevention:** Never expose OAuth tokens or trust client-supplied tenant/agent IDs without RBAC; do not enable daily briefing eligibility before a valid signed webhook event. A preference bit is not proof that outbound messaging or scheduled delivery exists.
- **Verification boundary:** Helper regression source authored but not executed; no build, typecheck, live Meta consent, webhook challenge, subscription, or deployment PASS.
- **Next:** Implement outbound send/delivery persistence and the CRON_SECRET-protected daily summary worker, then token expiry/revocation and route-level regressions.


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-04
- **Agent:** DEV-01 / Forge
- **Lesson:** A daily WhatsApp send needs more than a connected phone. Require explicit recipient opt-in, an approved Meta template, a CRON_SECRET-protected schedule, one run per connection/date, and durable provider message IDs/statuses. If a network/persistence failure leaves send acceptance ambiguous, do not blindly retry; that can duplicate messages.
- **Boundary:** The first scheduled briefing implementation is a deterministic digest of inbound message excerpts. Do not call it an AI summary or claim delivery until a real provider run is evidenced.
- **Next:** Implement token expiry/revocation/reconnect and route-level regression source; reconcile ambiguous sends safely.


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-04
- **Lesson:** Provider delivery callbacks can arrive out of order. A durable message state machine must be monotonic: late `sent` or `failed` events must not regress a `delivered`/`read` state, and `read`, `deleted`, and terminal `failed` states must not be overwritten by late lower-value events. Use the same transition rule in webhook processing and replay/reconciliation paths.
- **Test boundary:** Route/helper regression source now covers OAuth replay and permission recheck, tenant boundary, briefing gate, signature/idempotency, recipient format/digest, and status ordering. No tests have been executed.


- **Date/session:** 2026-10-10 / SESSION-DEV-20261010-01
- **Agent:** DEV-01 / Forge
- **Finding:** `mcp-tool-bridge.ts` adapts host-resolved descriptors into Clara's Unified Tool Runtime; it does not itself implement transport or persistent server configuration. Existing integration screens and generic realtime integration dispatch do not prove configured MCP servers are callable end-to-end.
- **Prevention:** Keep platform approval, organisation-owned connection/credentials, agent grants, discovery, transport and invocation as distinct layers. Recheck platform/org/plan/agent/user/surface policy at execution; isolate discovery caches by tenant; never expose secrets to UI/model; default-deny public embeds and platform-admin invocation.
- **Related plan:** `docs/superpowers/plans/2026-10-10-mcp-configuration-ui-chat-voice-roadmap.md`.
- **Verification boundary:** Source/document inspection only; no runtime PASS.