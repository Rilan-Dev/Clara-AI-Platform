# Clara visitor demo test suite

These scripts test the public visitor path without requiring a visitor to select an organisation, KB, provider, model, or voice. They use the special `Bearer DEMO_MODE` token and therefore exercise the same server-side Demo configuration used by the landing page.

## Run from the repository root

```bash
node scripts/visitor-tests/01-edge.mjs
node scripts/visitor-tests/02-demo-config.mjs
node scripts/visitor-tests/03-rag-search.mjs
node scripts/visitor-tests/04-chat-rag.mjs
node scripts/visitor-tests/05-realtime-session.mjs
node scripts/visitor-tests/06-voice-connect-contract.mjs
node scripts/visitor-tests/07-performance.mjs
node scripts/visitor-tests/08-all.mjs
```

## Environment

```bash
export CLARA_BASE_URL=https://clara.ai.amazetechclans.com
export CLARA_ORIGIN=https://clara.ai.amazetechclans.com
export CLARA_DEMO_AUTH=DEMO_MODE
export CLARA_TEST_QUERY='What does my insurance cover?'
```

The defaults already point at the production demo URL, so the first run can simply be:

```bash
node scripts/visitor-tests/08-all.mjs
```

## What each layer proves

| Script | Layer | What it verifies |
|---|---|---|
| `01-edge.mjs` | Browser/HTTP edge | embed JS, CORS preflight, unauthenticated rejection |
| `02-demo-config.mjs` | Demo routing | Demo enabled, server-selected KB, voice enabled, OpenAI provider |
| `03-rag-search.mjs` | Embeddings/Qdrant | Demo embedding provider, indexed KB, retrieval sources/context |
| `04-chat-rag.mjs` | RAG + LLM | NDJSON streaming, sources, non-empty answer, no stream error |
| `05-realtime-session.mjs` | OpenAI Realtime | server-side OpenAI key, realtime model, voice, ephemeral session creation |
| `06-voice-connect-contract.mjs` | WebRTC API | SDP endpoint input contract and safe error handling |
| `07-performance.mjs` | Performance | configurable concurrency, success rate and min/p50/p95/max latency |
| `08-all.mjs` | End-to-end | executes every layer sequentially and stops at first failure |

## Performance runs

Default performance test is intentionally modest to avoid accidentally generating large LLM costs:

```bash
CLARA_PERF_REQUESTS=30 CLARA_PERF_CONCURRENCY=5 node scripts/visitor-tests/07-performance.mjs
```

For live chat latency/cost testing, explicitly opt in:

```bash
CLARA_PERF_CHAT=1 CLARA_PERF_CHAT_REQUESTS=5 node scripts/visitor-tests/07-performance.mjs
```

## Real browser voice test

`05-realtime-session.mjs` verifies that the server can successfully create an OpenAI Realtime session. It does **not** pretend that an HTTP 200 proves microphone/WebRTC media works.

For the actual browser voice path, open the public demo, press the voice button, grant microphone permission, speak a question grounded in the configured KB, and verify:

1. microphone permission succeeds;
2. WebRTC connection reaches connected state;
3. user speech is transcribed;
4. Clara responds with audio;
5. the answer is grounded in the Demo KB;
6. stopping voice closes the peer connection cleanly;
7. browser console has no `/api/embed/session` or `/api/embed/voice-connect` errors.

## Failure interpretation

- `02` fails: Demo Admin configuration/migration/KB selection problem.
- `03` fails with zero sources: ingestion/Qdrant/index/dimension problem.
- `04` fails after `03` passes: OpenAI chat/provider/streaming/system-prompt problem.
- `05` fails with 401/502: Demo OpenAI credential/model/realtime configuration problem.
- `06` fails: voice-connect API contract/regression.
- `07` degrades while `03`/`04` pass: investigate database, Qdrant, OpenAI latency, connection pooling, rate limiting, or proxy timeouts.

Never print API keys or client secrets in test output.
