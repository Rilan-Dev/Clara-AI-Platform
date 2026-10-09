# Clara Integrations & AI Capabilities Enhancement Roadmap

**Status:** Owner-authorized implementation in progress  
**Date:** 2026-10-09  
**Scope:** Clara AI Platform integrations, provider configuration, tool execution, AI agent capabilities, realtime voice, observability, and administration.

## Product objective

Make Clara a dependable AI platform where an organisation can connect external services once, expose only approved capabilities to agents, use those capabilities consistently across chat and realtime voice, and observe or revoke every consequential action. Prefer extending existing Clara modules and the Unified Tool Runtime over creating parallel frameworks.

## Current architecture anchors

- `src/modules/ai-platform-core/`: host seam, provider/tool contracts, Unified Tool Runtime, integration bridge, MCP bridge, provider-tool pilots.
- `src/modules/integrations/`: integration configuration and OAuth app validation.
- `src/app/api/platform/integrations/[integrationId]/oauth-app/route.ts`: platform-managed OAuth app configuration endpoint.
- `src/lib/db/migrations/`: schema changes; migration numbering must remain unique and deployment migration execution must fail closed.
- Existing Clara Qdrant RAG remains the knowledge source; provider-native knowledge bases must not silently replace it.
- Existing tenant, agent, user, session, and KB identity remain server-authoritative.
- Realtime voice and provider chat should continue to share the Unified Tool Runtime when a tool is supported by that surface.

## Prioritised roadmap

### P0 — Make integrations reliable and secure

1. **OAuth setup lifecycle**
   - Separate platform OAuth application configuration (client ID, encrypted secret, redirect URI, scopes) from each organisation's connection/consent.
   - Add an explicit configuration status: missing, incomplete, ready, authorization-required, connected, expired, revoked, error.
   - Validate provider-specific redirect URIs and required scopes before allowing authorization.
   - Implement OAuth state validation, PKCE where supported, exact redirect URI matching, state expiry, one-time state consumption, and CSRF protection.
   - Encrypt tokens at rest, never return secrets/tokens in reads, redact sensitive fields from logs, and support secret rotation and disconnect/revoke.
   - Surface actionable but non-sensitive error categories; keep detailed exception information in access-controlled server logs.

2. **Migration and runtime readiness**
   - Prevent production builds from silently skipping migrations (the guard in `scripts/migrate.ts` is committed).
   - Add a safe, authenticated/admin-only schema/readiness diagnostic for required integration tables and migration version; never expose connection strings or secret data.
   - Make migration numbering collision checks a documented invariant and cover it with a focused test.
   - Ensure the OAuth configuration route reports a controlled diagnostic error while logging a correlation ID and root exception server-side.

3. **Connection health and recovery**
   - Store connection status, provider, granted scopes, token expiry, last successful check, last error category, and last sync time.
   - Add reconnect, revoke, test connection, refresh-token handling, and clear expired/revoked states.
   - Use bounded retries with exponential backoff and jitter; classify transient, rate-limit, permission, configuration, and permanent failures.
   - Never retry a non-idempotent action unless an idempotency strategy makes it safe.

**P0 acceptance:** An administrator can determine whether OAuth app configuration is missing, a user has not consented, a token expired, or a provider is failing—without seeing credentials. Failed setup cannot be mistaken for a healthy connection.

### P1 — Establish a consistent integration framework

1. **Integration catalog and capability descriptors**
   - Define a typed descriptor for provider ID, display metadata, authentication mode, supported capabilities, required scopes, supported execution surfaces, webhook/polling support, rate-limit strategy, and feature flags.
   - Distinguish platform-level provider setup from organisation-level connections.
   - Add integration categories (email, calendar, CRM, storage, messaging, developer tools) and provider capability discovery.
   - Keep descriptors declarative and validate them at registration time.

2. **Provider adapter contract**
   - Standardise connect/disconnect, health check, capability listing, action schema, execution, pagination, webhook verification, and sync checkpoint interfaces where applicable.
   - Normalise provider errors into stable internal codes while preserving safe provider diagnostics.
   - Avoid giant provider-specific conditionals in UI and orchestration code.
   - Require an explicit adapter for each provider; unknown providers and unsupported actions fail closed.

3. **Credential and permission governance**
   - Use least-privilege scopes; explain each requested permission to administrators.
   - Track scope grants and identify when a newly enabled capability requires additional consent.
   - Support per-organisation connection ownership, revocation, rotation, and audit trails.
   - Add role-based policies for who can connect services, configure credentials, and enable agent actions.

**P1 acceptance:** Adding a provider is mostly implementing its adapter and descriptor, not rewriting shared UI, agent planning, or execution infrastructure.

### P2 — Make the Unified Tool Runtime the action backbone

1. **One safe action path**
   - Route supported integrations through the existing `ToolDefinition` / `invoke()` runtime for provider chat and realtime voice.
   - Validate input/output schemas, action allowlists, tenant scope, connection ownership, permission, and rollout flags at invocation time—not only when displaying a tool.
   - Derive organisation, agent, user, session, and KB context on the server; never trust client-supplied identity.
   - Keep public embed sessions from receiving privileged integration actions unless a separately designed, narrowly scoped policy explicitly permits them.

2. **Human approval and risk tiers**
   - Classify tools as read-only, reversible write, consequential write, or destructive.
   - Require confirmation/approval for sending messages, changing records, purchases, deleting data, or other high-impact actions.
   - Add dry-run/preview for supported writes and include a summary of exactly what will change.
   - Re-check authorization immediately before execution and make approval tokens short-lived and bound to the exact action/input.

3. **Idempotency and execution records**
   - Record action ID, tenant, actor, agent, tool, input hash/redacted input, approval, result status, duration, and provider request ID.
   - Use idempotency keys where providers support them; distinguish unknown outcome from confirmed failure.
   - Add cancellation and timeout handling where technically possible.
   - Keep a bounded execution history and allow administrators to inspect failures without exposing secrets or unnecessary personal data.

**P2 acceptance:** The same policy and execution contracts protect chat and voice. Every action is attributable, permission-checked, and safely retryable or explicitly marked as non-retryable.

### P3 — Improve AI quality, routing, and agent reliability

1. **Provider capability registry**
   - Describe chat, structured output, tool calling, streaming, vision, embeddings, transcription, speech synthesis, and realtime audio capabilities separately.
   - Select models based on task needs, tenant configuration, provider availability, latency, cost, language, and required capabilities.
   - Keep the reasoning/chat provider separate from STT, TTS, and realtime transport settings.
   - Add bounded fallback chains only when the fallback preserves the task's security and output requirements.

2. **Grounded answer pipeline**
   - Preserve Clara Qdrant as the knowledge source.
   - Standardise retrieval filters by tenant/KB/permissions, source attribution, context limits, and no-result handling.
   - Make tool results and retrieved knowledge distinct evidence types; do not let untrusted external content override system policy.
   - Provide explicit “not found / insufficient evidence” behaviour rather than inventing answers.

3. **Bounded agent loop**
   - Support plan → tool call → result → reassessment with maximum iteration, token, time, and spend budgets.
   - Prevent repeated identical calls and circular tool sequences.
   - Require policy checks on every iteration and keep a trace of why a tool was selected.
   - Feature-flag agentic behaviour and default new high-risk capabilities off until evaluated.

4. **Conversation and task memory**
   - Separate short-lived conversation context, durable user-approved preferences, task state, and retrieved organisational knowledge.
   - Store only necessary data, enforce tenant boundaries, provide retention controls, and allow deletion.
   - Do not treat arbitrary email, web pages, or tool output as trusted instructions.

**P3 acceptance:** Model routing is capability-driven; agent loops terminate within configured budgets; responses remain grounded in authorised tenant data; fallback behaviour is observable and tested.

### P4 — Realtime voice and multimodal consistency

- Reuse the same tool definitions, authorization policies, and execution records across chat and voice.
- Keep STT, reasoning model, TTS, and transport configuration independent and explicit.
- Measure time to first audio, STT finalisation, model first token, tool latency, TTS first chunk, interruption/barge-in, and total turn latency.
- Fix duplicate responses with turn IDs, event sequence validation, cancellation of stale generations, and a single response owner per turn.
- Handle partial transcripts, reconnects, provider disconnects, and timeouts without duplicating tool actions.
- Add language/locale configuration and provider capability validation before a session starts.
- Expose clear per-provider health and fallback reasons; never silently switch providers if that violates an administrator's policy.

**P4 acceptance:** Voice and chat execute the same permitted actions; each turn is traceable; latency and duplicate-response regressions can be detected from telemetry.

### P5 — Sync, events, and automation

- Support webhooks first where the provider offers reliable signed events; use polling with checkpoints where it does not.
- Verify webhook signatures, timestamps, replay windows, and event IDs.
- Use durable queues for ingestion and background work, with retry/backoff, dead-letter handling, deduplication, and tenant-scoped concurrency.
- Store sync cursors/checkpoints and expose last-success/lag/error status.
- Add an event/trigger catalog for scheduled summaries, inbound messages, and agent workflows.
- Separate event ingestion from AI reasoning and action execution; events should not bypass tool authorization or approval policies.

**P5 acceptance:** Duplicate events do not create duplicate actions, failed syncs are recoverable, and each automated action links to its triggering event and policy decision.

### P6 — Admin experience and operations

- Build a unified Integrations hub with categories, search, provider detail, setup status, capabilities, scopes, connection health, last sync, and safe troubleshooting.
- Separate tabs/sections for provider application configuration, organisation connections, agent capability grants, execution history, and webhook/sync status.
- Provide a guided setup checklist with actionable errors and no secret echoing.
- Add per-tenant usage, rate limits, token/cost budgets, error rates, latency percentiles, and provider status.
- Add audit history for credential changes, consent, grants, revocations, agent tool access, and approvals.
- Provide accessible empty/loading/error states and avoid reporting “Enabled” as equivalent to “Configured and connected.”

**P6 acceptance:** Admins can understand and repair a connection without reading server logs or confusing global enablement with organisation-level authorization.

### P7 — Evaluation, security, and release discipline

- Create contract tests for each provider adapter and schema tests for each action.
- Add security tests for cross-tenant access, forged identities, missing/revoked scopes, expired OAuth state, webhook replay, secret redaction, prompt injection through external content, and approval bypass.
- Add end-to-end tests for configure → connect → invoke read action → approve write action → revoke.
- Maintain a provider capability matrix and integration conformance checklist.
- Use feature flags and staged rollout for new providers, tools, and agentic features.
- Track SLOs for successful connection, successful action execution, error rate, latency, and recovery time.
- Record verification honestly: source-complete is not test-passed; test-passed is not deployed; deployed is not production-recovered until a live smoke test succeeds.

## Recommended implementation order

1. **Incident reliability:** confirm the OAuth migration path and improve route diagnostics; ensure migration startup cannot be skipped in production.
2. **OAuth lifecycle:** app configuration versus tenant connection state, secure consent/token lifecycle, actionable status.
3. **Integration contracts:** typed descriptors and adapter conformance, extending existing modules.
4. **Runtime safety:** authorization re-check, risk tiers, approval, idempotency, action audit.
5. **Provider capability registry:** task-aware routing and safe fallbacks.
6. **Chat/voice parity:** common tools and policies, turn tracing, latency/duplicate response fixes.
7. **Sync/automation:** signed webhooks, polling checkpoints, durable event processing.
8. **Integrations hub:** setup UX, diagnostics, permissions, and observability.
9. **Evaluation and rollout:** security regression suite, provider conformance, staged flags, operational SLOs.

## Non-goals and guardrails

- Do not replace Clara Qdrant with provider-native knowledge bases.
- Do not create a second tool runtime, identity system, or provider registry if an existing Clara module can be extended.
- Do not expose provider credentials, OAuth tokens, cookies, or raw secrets to browsers or logs.
- Do not grant agents all integration actions by default.
- Do not allow user-supplied tenant/agent/session IDs to determine authorization.
- Do not auto-execute high-impact actions without the appropriate policy and approval.
- Do not wait on continuous CI/deployment polling as a substitute for continuing independent implementation; record evidence and blockers accurately.
- Preserve existing behaviour behind flags and make schema changes through uniquely numbered migrations.

## Definition of done for the programme

- An organisation can securely connect, inspect, test, reconnect, and revoke an integration.
- Agent capability grants are explicit and enforced at execution time.
- Supported tools behave consistently in provider chat and realtime voice.
- OAuth, tool execution, sync, and agent traces are auditable without leaking secrets.
- Provider failures, rate limits, and expired credentials produce actionable states and safe recovery.
- Automated regression tests cover tenant isolation, permissions, OAuth lifecycle, action idempotency, and chat/voice parity.
- Release status distinguishes code changes, tests, deployment, and confirmed production recovery.

## Next bounded planning-to-implementation task

Start with the OAuth lifecycle/readiness slice: inspect the existing route, migration runner, OAuth start/callback/token storage, integration connection schema, and admin UI; write a source-grounded gap list; then implement the smallest backward-compatible fix for missing configuration diagnostics and connection readiness. Do not claim the original production incident is fixed until the deployed endpoint is smoke-tested.
