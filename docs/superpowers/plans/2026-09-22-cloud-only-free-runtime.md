# Clara Cloud-Only Free Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Clara production from VPS-dependent long-running workers/relay processes to Vercel-native durable queues and WebSockets while keeping the existing Postgres/Qdrant data model, provider choices, and low-latency voice path.

**Architecture:** Next.js remains the application/API host on Vercel. Vercel Queues replace BullMQ worker execution for cloud jobs; existing DB-backed ingestion and crawler business logic is converted into bounded, resumable handlers. Vercel WebSocket Functions replace the custom `scripts/start.mjs` relay process for browser/phone realtime paths, with provider credentials remaining server-side.

**Tech Stack:** Next.js 15.5.24, Node.js runtime, Vercel Fluid Compute, Vercel Queues, `ws`, PostgreSQL, Qdrant Cloud, existing OpenAI/ElevenLabs/Gemini/Sarvam integrations, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-cloud-only-free-runtime-design.md`

## Global Constraints

- Production must not depend on a VPS, Docker worker, local Redis, local RabbitMQ, or `npm start` custom relay.
- No paid infrastructure may be required.
- Preserve OpenAI, ElevenLabs, Gemini, and Sarvam provider configurability.
- Preserve Clara/Qdrant RAG behavior.
- Do not expose provider API keys to browsers.
- Vercel Hobby functions must stay within the 300-second Fluid Compute ceiling.
- Do not use Hobby Cron as a frequent worker loop; use durable queue delivery.
- Keep user-facing voice operations streaming and low-latency.
- Use Mumbai (`bom1`) for latency-sensitive server functions where compatible with the connected data services.
- Keep legacy worker code available until production acceptance proves the replacement.
- Every feature change follows RED → GREEN → full suite → build verification.

## Review Focus

1. A duplicate queue delivery must never index the same document twice.
2. A crawl continuation must resume from persisted state without losing or duplicating URLs.
3. A job close to the 300-second runtime ceiling must persist a continuation before termination.
4. A WebSocket capability token must not authorize a different org/KB/provider or an expired session.
5. A realtime connection must stream the first provider audio promptly instead of buffering a full response.

---

## Phase 0: Branch and baseline safety

### Task 1: Establish the implementation branch and baseline

**Files:**
- Read: repository branch refs
- Read: `package.json`
- Read: `src/modules/queue/redis.ts`
- Read: `workers/worker-entry.ts`
- Read: `scripts/start.mjs`

- [x] **Step 1: Synchronize Vercel-Prod into Vite-Converted**
- [x] **Step 2: Create `feat/cloud-only-free-runtime` from the synchronized Vite-Converted tip**
- [ ] **Step 3: Record baseline verification**
  Run:
  `npm test -- --run`
  `npm run type-check`
  `npm run build`
  Expected: capture exact failures before changing behavior; any pre-existing failure becomes a named migration blocker.

- [ ] **Step 4: Commit the baseline architecture spec and plan**
  The design and plan are already tracked on this feature branch before product implementation.

---

## Phase 1: Vercel queue foundation

### Task 2: Add a provider-neutral cloud queue abstraction

**Files:**
- Create: `src/modules/cloud-jobs/queue.ts`
- Create: `src/modules/cloud-jobs/types.ts`
- Create: `src/modules/cloud-jobs/queue.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `CloudJobKind = "ingest" | "crawl" | "retry"`
- `CloudJobEnvelope = { jobId: string; kind: CloudJobKind; payload: unknown }`
- `enqueueCloudJob(kind, jobId, payload, options?): Promise<{ messageId: string }>`

- [ ] **Step 1: Write failing tests**
  Test deterministic message/job IDs, supported job kinds, and rejection of empty job IDs.

- [ ] **Step 2: Run targeted tests and verify RED**
  Run:
  `npx vitest run src/modules/cloud-jobs/queue.test.ts`
  Expected: FAIL because the cloud queue module does not yet exist.

- [ ] **Step 3: Add `@vercel/queue` and implement the thin adapter**
  The adapter must contain Vercel-specific code only. Business processors must consume `CloudJobEnvelope`, not Vercel SDK types.

- [ ] **Step 4: Run targeted tests and verify GREEN**
  Run:
  `npx vitest run src/modules/cloud-jobs/queue.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add package.json package-lock.json src/modules/cloud-jobs && git commit -m "feat: add cloud job queue abstraction"`

---

## Phase 2: Document ingestion as bounded durable jobs

### Task 3: Make DB-backed document processing bounded and continuation-safe

**Files:**
- Modify: `src/modules/knowledge-bases/worker/ingest-worker.ts`
- Modify: `src/modules/knowledge-bases/core/documents-db.ts`
- Create: `src/modules/cloud-jobs/process-ingest.ts`
- Create: `src/app/api/cloud-jobs/ingest/route.ts`
- Create: `src/modules/cloud-jobs/process-ingest.test.ts`
- Modify: upload/reprocess routes that currently call `kickIngestQueue`

**Interfaces:**
- `processIngestCloudBatch(input: { maxJobs: number; deadlineMs: number }): Promise<{ processed: number; errors: number; hasMore: boolean }>`
- The handler claims jobs using the existing `FOR UPDATE SKIP LOCKED` mechanism and never processes a job already marked running/done.

- [ ] **Step 1: Write a regression test for bounded processing**
  Test that a batch stops before the deadline and returns `hasMore: true` when another pending job remains.

- [ ] **Step 2: Run the test and verify RED**
  `npx vitest run src/modules/cloud-jobs/process-ingest.test.ts`

- [ ] **Step 3: Extract a bounded processor around existing `processNextJob` logic**
  Do not rewrite parsing, chunking, embeddings, or Qdrant upsert. Reuse the existing `processClaimedJob` implementation.

- [ ] **Step 4: Add stale-job handling tuned for Vercel**
  Preserve the existing 10-minute recovery policy, but make the cloud handler stop accepting new work before the 300-second function ceiling.

- [ ] **Step 5: Add a private queue consumer route**
  The route must validate the Vercel queue callback, process a bounded batch, and enqueue a continuation when `hasMore` is true.

- [ ] **Step 6: Replace upload-time self-triggering**
  Upload routes publish an ingest job after DB creation instead of relying on an in-process timer/poller.

- [ ] **Step 7: Run targeted tests and then the full suite**
  `npx vitest run src/modules/cloud-jobs/process-ingest.test.ts`
  `npm test -- --run`

- [ ] **Step 8: Commit**
  `git add src/modules/knowledge-bases/worker src/modules/knowledge-bases/core src/modules/cloud-jobs src/app/api && git commit -m "feat: run document ingestion through cloud jobs"`

---

## Phase 3: Website crawl as resumable cloud work

### Task 4: Persist crawl frontier and process bounded crawl batches

**Files:**
- Modify: `src/modules/ingest/crawlers/web-crawler.ts`
- Modify: `src/modules/knowledge-bases/core/scrape-sessions-db.ts`
- Modify: `src/modules/knowledge-bases/core/scrape-url-retry-db.ts`
- Create: `src/modules/cloud-jobs/process-crawl.ts`
- Create: `src/app/api/cloud-jobs/crawl/route.ts`
- Create: `src/modules/cloud-jobs/process-crawl.test.ts`
- Modify: `src/modules/queue/index.ts`
- Modify: scrape discovery producer route

**Interfaces:**
- `processCrawlCloudBatch(input: { sessionId: string; maxPages: number; deadlineMs: number }): Promise<{ discovered: number; remaining: boolean }>`
- Crawl state is persisted in Postgres so a new invocation can continue without relying on process memory.

- [ ] **Step 1: Write a failing test for continuation**
  Given a session with more frontier URLs than the batch limit, the processor must persist progress and return `remaining: true`.

- [ ] **Step 2: Verify RED**
  `npx vitest run src/modules/cloud-jobs/process-crawl.test.ts`

- [ ] **Step 3: Add persisted frontier state**
  Reuse `scrape_urls` and session state where possible. If a small migration is necessary, add it as a numbered migration after the current latest migration.

- [ ] **Step 4: Refactor `crawlWebsite` to expose bounded work**
  Keep sitemap-first discovery, robots handling, URL normalization, SPA fallback, and Playwright optimization. Add a time/page budget rather than duplicating the crawler.

- [ ] **Step 5: Disable Playwright when the remaining budget is unsafe**
  The function must prefer HTTP parsing when possible and only use the browser fallback while enough execution budget remains.

- [ ] **Step 6: Enqueue continuation**
  A continuation message must carry only `sessionId` and deterministic state identifiers, not an entire in-memory frontier.

- [ ] **Step 7: Run targeted + full tests**
  `npx vitest run src/modules/cloud-jobs/process-crawl.test.ts`
  `npm test -- --run`

- [ ] **Step 8: Commit**
  `git add src/modules/ingest/crawlers src/modules/knowledge-bases/core src/modules/cloud-jobs src/modules/queue src/app/api && git commit -m "feat: make website crawling cloud-resumable"`

---

## Phase 4: URL retry scheduling without BullMQ workers

### Task 5: Move failed URL retries to cloud queue delivery

**Files:**
- Modify: `src/modules/knowledge-bases/core/scrape-url-retry-db.ts`
- Create: `src/modules/cloud-jobs/process-retry.ts`
- Create: `src/app/api/cloud-jobs/retry/route.ts`
- Create: `src/modules/cloud-jobs/process-retry.test.ts`
- Modify: `workers/all-workers.ts` only for legacy compatibility comments/guarding

- [ ] **Step 1: Write failing retry continuation tests**
  Cover: success, permanent error, and transient error scheduling the next attempt.

- [ ] **Step 2: Verify RED**
  `npx vitest run src/modules/cloud-jobs/process-retry.test.ts`

- [ ] **Step 3: Extract retry business logic from `processRetryJob`**
  Reuse `loadWebPage`, `createDocument`, `createIngestJob`, and the bounded ingest processor.

- [ ] **Step 4: Publish delayed cloud messages**
  Preserve the current 5m/30m/2h schedule and deterministic retry IDs.

- [ ] **Step 5: Verify GREEN + full suite**
  `npx vitest run src/modules/cloud-jobs/process-retry.test.ts`
  `npm test -- --run`

- [ ] **Step 6: Commit**
  `git add src/modules/knowledge-bases/core src/modules/cloud-jobs src/app/api workers/all-workers.ts && git commit -m "feat: move URL retries to cloud jobs"`

---

## Phase 5: Vercel WebSocket runtime

### Task 6: Replace the custom relay bootstrap with Vercel WebSocket functions

**Files:**
- Create: `api/voice-realtime.ts` or provider-specific Vercel WebSocket handlers if bundle isolation requires it
- Create: `src/modules/voice-core/realtime/vercel-ws.ts`
- Modify: `src/modules/voice-core/realtime/relay-url.ts`
- Modify: provider realtime auth/session modules
- Modify: `src/modules/voice-core/api/elevenlabs/realtime-init.ts`
- Modify: Gemini/Sarvam realtime relay modules
- Modify: `vercel.json` only if route mapping is required
- Create: `src/modules/voice-core/realtime/vercel-ws.test.ts`

**Interfaces:**
- `createRealtimeWebSocketHandler(provider): Node HTTP/WebSocket handler`
- Browser endpoints remain same-origin and capability-token authenticated.

- [ ] **Step 1: Write failing capability-routing tests**
  Verify an expired token, wrong provider, and wrong KB/org are rejected.

- [ ] **Step 2: Verify RED**
  `npx vitest run src/modules/voice-core/realtime/vercel-ws.test.ts`

- [ ] **Step 3: Implement the smallest Vercel-compatible WS entrypoint**
  Follow Vercel's current `ws`/Node WebSocket Function contract. Do not monkey-patch `http.createServer` globally.

- [ ] **Step 4: Route provider connections**
  Keep provider relay logic in existing modules. The new entrypoint is an adapter, not a second implementation.

- [ ] **Step 5: Keep browser credentials short-lived**
  Continue using the existing HMAC capability token. Provider API keys remain server-only.

- [ ] **Step 6: Update same-origin endpoint descriptors**
  No descriptor may contain a localhost, Docker service, VPS, or provider secret.

- [ ] **Step 7: Run targeted tests**
  `npx vitest run src/modules/voice-core/realtime/vercel-ws.test.ts`

- [ ] **Step 8: Commit**
  `git add api src/modules/voice-core vercel.json && git commit -m "feat: host realtime voice websockets on Vercel"`

---

## Phase 6: Phone voice cloud migration

### Task 7: Move Twilio/Vonage media WebSockets to the Vercel runtime

**Files:**
- Create/modify Vercel WS handler for `/api/phone/twilio/stream`
- Create/modify Vercel WS handler for `/api/phone/vonage/stream`
- Modify: `scripts/phone-stream.mjs` only to extract reusable protocol logic if required
- Create: phone WS tests

- [ ] **Step 1: Write failing handshake/auth tests**
  Test Twilio and Vonage connection initialization without real provider calls.

- [ ] **Step 2: Verify RED**
  Run the focused Vitest file.

- [ ] **Step 3: Extract provider-independent stream processing**
  Preserve current audio encoding and provider event handling.

- [ ] **Step 4: Add cloud WS routing**
  Keep the public webhook path stable if Vercel's routing permits it; otherwise update provider webhook configuration in the deployment settings and test the exact URL.

- [ ] **Step 5: Verify end-to-end handshake**
  Use a controlled test connection and inspect Vercel runtime logs.

- [ ] **Step 6: Commit**
  `git add api src scripts && git commit -m "feat: move phone media websockets to cloud runtime"`

---

## Phase 7: Remove production dependence on BullMQ/Redis/RabbitMQ

### Task 8: Make cloud runtime independent of worker infrastructure

**Files:**
- Modify: `src/modules/queue/index.ts`
- Modify: `src/app/api/platform/services-status/route.ts`
- Modify: environment/config validation
- Modify: affected producers/consumers
- Add: infrastructure independence tests

- [ ] **Step 1: Write tests proving document/crawl cloud paths do not import BullMQ workers**
  Assert the cloud handlers can load without starting `Worker` instances.

- [ ] **Step 2: Verify RED**
  Run the focused tests.

- [ ] **Step 3: Remove production imports of `workers/all-workers.ts`**
  Keep the legacy worker entrypoints for local compatibility only.

- [ ] **Step 4: Change service status semantics**
  Redis/RabbitMQ may remain visible as optional legacy integrations, but their outage must not mark cloud document/crawl processing unavailable when the Vercel queue path is healthy.

- [ ] **Step 5: Ensure no production code starts `startIngestPoller`**
  The poller remains a local/legacy utility only.

- [ ] **Step 6: Verify**
  `npm run type-check`
  `npm test -- --run`

- [ ] **Step 7: Commit**
  `git add src workers && git commit -m "refactor: remove cloud dependency on legacy workers"`

---

## Phase 8: Latency and payload optimization

### Task 9: Protect realtime latency and function budget

**Files:**
- Modify: `src/modules/voice-core/realtime/*`
- Modify: RAG retrieval helper used by voice turns
- Modify: relevant Vercel configuration
- Create: `src/modules/voice-core/realtime/latency.test.ts`

- [ ] **Step 1: Add latency instrumentation**
  Record server-side timestamps for session creation, provider connection, first provider token/audio, first client audio, and completion. Never log secrets or raw audio.

- [ ] **Step 2: Add regression tests for streaming**
  Verify first chunks are forwarded immediately and are not buffered until completion.

- [ ] **Step 3: Bound RAG work**
  Keep top-k small and fetch only required payload fields. Avoid document ingestion, queue processing, or full KB scans inside a voice turn.

- [ ] **Step 4: Configure region**
  Prefer `bom1` for latency-sensitive Node functions where compatible with the deployment.

- [ ] **Step 5: Verify**
  `npx vitest run src/modules/voice-core/realtime/latency.test.ts`
  `npm run type-check`

- [ ] **Step 6: Commit**
  `git add src/modules/voice-core && git commit -m "perf: protect realtime voice latency"`

---

## Phase 9: Production verification

### Task 10: Build and deploy the feature branch

**Files:**
- No product source changes unless verification finds a concrete defect.

- [ ] **Step 1: Run the complete local verification**
  `npm test -- --run`
  `npm run type-check`
  `npm run lint`
  `npm run build`

- [ ] **Step 2: Push `feat/cloud-only-free-runtime`**
  Use the GitHub branch as the deployment source. Do not modify Vercel-Prod directly.

- [ ] **Step 3: Deploy the branch to a Vercel preview**
  Confirm the deployment is READY before runtime testing.

- [ ] **Step 4: Browser verify**
  Use the browser verification skill against the preview deployment:
  - login
  - KB list
  - upload
  - chat
  - start voice session
  - verify no console/runtime error
  - verify realtime connection URL is Vercel same-origin

- [ ] **Step 5: Verify background jobs**
  Create a document and crawl job, then verify Postgres state transitions, Qdrant vectors, and Vercel queue consumer logs.

- [ ] **Step 6: Verify Redis/RabbitMQ independence**
  Disable/omit those variables in an isolated preview only if the rest of the environment permits it. Confirm document/crawl jobs still complete through Vercel Queues.

- [ ] **Step 7: Measure latency**
  Capture:
  - HTTP API TTFB
  - voice session initialization
  - WebSocket connect
  - end-of-speech → first provider output
  - first output → first client audio
  - total turn time

- [ ] **Step 8: Inspect Vercel runtime logs**
  Search for:
  `ENOTFOUND redis://`
  `ACCESS_REFUSED`
  `FUNCTION_INVOCATION_TIMEOUT`
  `WebSocket`
  `ingest`
  `crawl`
  and confirm no new production errors.

---

## Phase 10: Production integration and final acceptance

### Task 11: Merge only the verified branch

**Files:**
- Git integration only.

- [ ] **Step 1: Re-run verification immediately before PR**
  `npm test -- --run`
  `npm run type-check`
  `npm run build`

- [ ] **Step 2: Create PR**
  Target: `Vercel-Prod`
  Source: `feat/cloud-only-free-runtime`
  PR body must list each acceptance test and its observed result.

- [ ] **Step 3: Merge the PR**
  Do not write commits directly to `Vercel-Prod`.

- [ ] **Step 4: Wait for Vercel production deployment**
  Verify the deployment commit equals the merged PR commit and status is READY.

- [ ] **Step 5: Production browser verification**
  Test login, KB upload/RAG, crawl, chat, browser voice, and the relevant phone/realtime endpoint.

- [ ] **Step 6: Production runtime verification**
  Inspect Vercel logs and service status. Confirm there is no request path to the VPS.

- [ ] **Step 7: Final branch synchronization**
  If `Vite-Converted` and `Vercel-Prod` diverge after merge, synchronize them with a normal PR; never force-reset either branch.

- [ ] **Step 8: Final acceptance**
  Only report completion after the deployment, runtime logs, browser flow, queue processing, Qdrant retrieval, and latency measurements all provide fresh evidence.
