# Clara Cloud-Only Free Runtime Design Specification

**Date:** 2026-09-22
**Branch:** feat/cloud-only-free-runtime
**Base:** Vite-Converted, synchronized with Vercel-Prod before feature work

## Goal

Remove Clara production's dependency on any VPS/local long-running process while preserving low-latency browser voice, reliable document ingestion, website scraping, retries, Qdrant RAG, and existing provider configurability. The target production runtime is Vercel plus already-managed cloud data/services, with no paid infrastructure and no hidden VPS dependency.

## Constraints and success criteria

- Production must not require Docker, a VPS, local Redis, local RabbitMQ, or a custom `npm start` process.
- Keep Next.js/Vercel as the primary application runtime.
- Preserve OpenAI, ElevenLabs, Gemini, and Sarvam provider selection.
- Preserve Clara/Qdrant retrieval for voice and chat.
- Do not replace existing provider integrations merely to simplify deployment.
- Prioritize latency: keep user-facing API routes short, use Vercel Fluid Compute in Mumbai where appropriate, avoid polling for realtime voice, avoid unnecessary HTTP self-fetches, and keep persistent voice connections on WebSocket paths.
- Background work must be durable and resumable; no function may depend on an in-memory worker loop.
- The free-tier design must respect Vercel Hobby resource limits. Hobby functions have 300s maximum duration with Fluid Compute, 1M invocations and 4 active CPU-hours included; Vercel Queues currently includes 1M API operations on Hobby. Vercel Cron on Hobby is daily only, so it must not be used as a second-by-second worker loop.
- Document and crawl work must be sliced into bounded jobs that can finish inside the Hobby function duration rather than assuming a permanent worker.
- Do not expose provider secrets to browsers.
- Existing database/Qdrant records remain the source of truth; migration must be backwards-compatible with existing pending jobs.
- No new paid service may be required.

## Target architecture

```
Browser
  ├── Next.js UI/API on Vercel
  ├── Chat/streaming API on Vercel
  └── Realtime voice WebSocket on Vercel
          │
          ├── provider upstream WebSocket/API
          └── Clara RAG/tool calls → Vercel API → Postgres + Qdrant

Vercel Queues
  ├── document-ingest topic → bounded ingest consumer
  ├── crawl topic → bounded crawl consumer
  └── retry topic → bounded retry consumer

Managed Postgres ← job/session/document state
Qdrant Cloud   ← embeddings/RAG
Managed Redis  ← retained only for compatibility/legacy BullMQ during migration;
                 not required by the new cloud queue runtime
RabbitMQ       ← retained only for flows that demonstrably still require AMQP;
                 not a dependency of document/crawl processing

VPS/local Docker: NOT REQUIRED in production
```

Vercel WebSockets are now a public beta and can run bidirectional connections on Fluid Compute. This replaces the current custom `scripts/start.mjs` WebSocket monkey-patch for browser voice relays where Vercel can host the route directly. Phone media streams are migrated to Vercel WebSocket handlers as a separate compatibility surface; if a provider proves incompatible with Vercel's WebSocket beta, the implementation must fail explicitly rather than silently depend on a VPS.

## Background job design

The existing business logic in `ingest-worker.ts`, `web-crawler.ts`, and retry code remains reusable.

A new cloud-job layer will:
1. enqueue durable messages;
2. claim/operate on one bounded unit of work;
3. persist progress in Postgres;
4. enqueue the next continuation when more work remains;
5. be idempotent so duplicate delivery is safe;
6. never use an interval/poller in a Vercel function.

Document ingestion will continue using the existing Postgres `ingest_jobs` state machine. Each consumer invocation processes a small bounded number of documents/jobs and stops before the runtime limit. Stale-job recovery remains in the DB layer.

Website discovery will be made resumable. The current monolithic crawl operation will gain a bounded mode/state so one invocation can process a limited URL batch and persist frontier/visited/progress before enqueueing the next continuation. Sitemap discovery should remain fast; Playwright is used only when needed and must be budgeted so a function cannot run past the free runtime ceiling.

URL retries become queue-delayed messages rather than a permanent BullMQ worker.

## Realtime voice design

The browser continues to receive only a short-lived capability token. Vendor API keys stay server-side.

For each provider:
- OpenAI: use provider-native browser realtime where supported, with Clara session/tool/RAG endpoints remaining on Vercel.
- ElevenLabs: prefer the provider's browser/realtime client path where it can preserve the current Clara configuration and KB behavior. If a server relay is required for a provider capability, implement that relay as a Vercel WebSocket route.
- Gemini: move the current HMAC-authenticated relay logic behind a Vercel WebSocket route.
- Sarvam: preserve the current provider selection and audio protocol, but remove dependency on `scripts/start.mjs`; use a Vercel WebSocket route only where the provider's protocol requires a server-side relay.

The browser must connect directly to same-origin `wss://` routes. No localhost/VPS hostname may be generated in production.

## Latency strategy

- Vercel function region should be Mumbai (`bom1`) for Clara's India-centric deployment and cloud databases where regional placement permits.
- Reuse pooled DB connections and avoid opening new clients per token/audio message.
- Keep voice session initialization lightweight and cache static configuration.
- Stream model/audio output immediately; do not buffer complete AI responses.
- Avoid an extra STT → HTTP chat → TTS round trip when a native realtime provider can perform the turn.
- Keep RAG retrieval to one compact Qdrant request per turn, with tight top-k and payload.
- Do not put document ingestion or scraping on the critical path of voice requests.
- Measure first-byte/first-audio latency, end-of-speech-to-first-token, first-audio latency, and total turn latency in verification.

## Compatibility and migration

The old BullMQ workers and `scripts/start.mjs` remain available during development only. Production routes must stop depending on them after the cloud handlers are verified.

Existing BullMQ/Redis data must not be destroyed automatically. Migration must drain or requeue pending work safely. The new cloud queue should use deterministic message IDs/idempotency keys based on existing job IDs/session IDs.

## Security

- Never return provider API keys to the browser.
- Validate WebSocket capability tokens before opening provider connections.
- Bind voice capabilities to org, KB, provider, and expiration.
- Protect queue consumers from public invocation; use Vercel queue-trigger authentication.
- Keep upload limits and validate MIME/type before processing.
- Do not log Redis/RabbitMQ/provider passwords or full connection URLs.

## Verification gates

A phase is complete only after:
- targeted unit tests pass;
- type-check passes;
- full test suite passes;
- production build passes;
- deployment is READY;
- browser verification exercises the relevant UI;
- runtime logs show no new infrastructure errors;
- the exact flow is tested end-to-end.

The final production acceptance tests must cover:
1. login/admin app load;
2. upload a small PDF/TXT document and verify Ready + Qdrant retrieval;
3. scrape a small public website and verify discovered URLs + ingested pages;
4. retry a failed URL and verify delayed retry;
5. chat RAG answer;
6. browser realtime voice with Clara/Qdrant context;
7. at least one provider relay path that uses Vercel WebSocket;
8. production behavior with Redis/RabbitMQ disabled where those services are not part of the selected cloud flow;
9. confirm no production request requires a VPS hostname or Docker service.

## Non-goals

- No visual redesign in this migration.
- No provider replacement.
- No paid-service optimization.
- No unrelated database refactor.
- No removal of legacy worker files until the cloud path has been proven in production and the final branch is ready for cleanup.
