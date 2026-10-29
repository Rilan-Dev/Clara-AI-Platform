# RAG reranker A/B benchmark — production-enablement gate

The optional self-hosted reranker (`clara-reranker`, TEI cross-encoder) is
**deployed but disabled** on the reference host: `RAG_RERANK_URL` is unset, so
chat/voice retrieval is unchanged in production. Enabling it permanently is a
two-part decision that must be backed by measured evidence on the real KB and
the real traffic shape, not by the smoke probe alone:

1. **Relevance/citation effect** — which cited sources change, which top-1
   answers change, and whether the changes are improvements.
2. **Latency effect** — p50/p95 drift of the whole grounding call and of the
   retrieval stage, under warm-cache (repeat question) and first-seen
   (new question) conditions.

`scripts/benchmark-rag-ab.mjs` produces both halves. It drives the exact
authenticated production route (`POST /api/rag/search` → `postRagSearch` →
`groundClaraContext`) with a fixed query set, records per-question source
identity/order/scores plus stage timings, and compares two runs arm-to-arm.
Result files are **private operator data**, even though snippets, assembled
AI context and credentials are omitted: each run preserves complete query
text, document titles, source IDs and KB identifiers. Keep these JSON files
restricted to authorized operators and redact them before sharing.

## Prerequisites

- An authenticated session token with `kb:read` for the target KB
  (`CLARA_DEBUG_TOKEN`; see `scripts/debug-rag-retrieval.mjs` for the cookie
  alternative and the same security rules).
- Node 20+ on the operator machine, or run inside the backend container
  (the script ships in the image: `docker compose exec clara-backend …`).
- The TEI container ready when benchmarking the rerank arm (below).
- Nothing else: the script is zero-dependency Node, like the other Clara
  operator scripts.

## Building the query set

Use **real user questions**, not synthetic ones — the point is the production
traffic shape. Two sources:

- **Top real queries** (super admin): `GET /api/analytics/queries?limit=50`
  returns the most frequent `query_text` values with counts and average
  latency. Pick 10–20 distinct questions from the target KB's range (filter
  `orgId` if needed), favouring frequent + long-tail + known-hard questions.
- **Hand-picked edge cases**: questions that currently cite multiple
  documents, questions that rely on exact clause IDs (these bypass reranking
  by design — `extractStructuredReferences`), and out-of-scope questions to
  confirm the no-evidence path is unaffected.
- **Language-specific slices**: separately evaluate English and each supported
  KB language (especially Arabic), plus cross-lingual query/source pairs.
  Do not aggregate away a language-specific relevance regression.

Save them as `rag-ab-queries.json`:

```json
{ "questions": [
  "What does clause DO.2.1 require?",
  "How do I file a claim for water damage?",
  "Is dental treatment covered for dependents?"
] }
```

Keep the **same file, byte-identical**, for both arms — compare mode aligns
runs by exact question text.

## Model-language gate (before running Arm B)

The currently deployed CPU-compatible default, `mixedbread-ai/mxbai-rerank-base-v1`,
is marked **English (`en`)** on its official Hugging Face model card:
https://huggingface.co/mixedbread-ai/mxbai-rerank-base-v1.
Its successful Mars/English smoke probe only proves service connectivity and
basic English ordering; it is **not** evidence that Arabic or other languages
rerank correctly. A multilingual Clara deployment must evaluate each language
and choose a TEI-compatible model with verified multilingual relevance and
hardware support before permanent enablement.

## Arm A — baseline (reranker off)

The default state (`RAG_RERANK_URL` unset) IS the baseline arm.

```bash
export CLARA_DEBUG_TOKEN='<your-session-token>'
node scripts/benchmark-rag-ab.mjs \
  --kb-id '<KB_ID>' \
  --queries rag-ab-queries.json \
  --label rerank-off \
  --out rag-ab-baseline.json
```

Defaults: `--top-k 6`, `--scope live`, `--repeat 3` measured passes,
`--warmup 1` cache-priming pass, `--gap-ms 250`. The warmup pass is reported
separately as **first-seen latency** (cold embedding + config resolution);
percentiles come from the measured passes only. Add `--preflight-auth` to
verify the token via `/api/auth/me` before any quota-consuming request.

Every request consumes embedding usage/quota and records a RAG search audit
event — the planned request count is printed before the first request fires.

## Arm B — reranker on

1. Start the TEI service (host with ≥ 2.5 GiB free RAM):

   ```bash
   mkdir -p infra/rag-reranker
   docker compose --profile rerank up -d clara-reranker
   ```

   Start the service first. The smoke probe runs only **after** the backend
   receives the reranker URL in step 3; otherwise it exits because
   `RAG_RERANK_URL` is unset.

2. Enable the stage in backend `.env`. On the measured CPU host
   (6 cores, 2-CPU container cap) the safe values are:

   ```dotenv
   RAG_RERANK_URL=http://clara-reranker:80/rerank
   RAG_RERANK_ENABLED=true
   RAG_RERANK_TIMEOUT_MS=6000
   RAG_RERANK_MAX_CANDIDATES=8
   ```

   `RAG_RERANK_TIMEOUT_MS=6000` exists because the 1500 ms default only suits
   short snippets on CPU (measured p50 ≈ 3.9 s for realistic ~900-char
   chunks; see the `clara-reranker` comment in `docker-compose.yml`). A GPU
   TEI image can use tighter values.

3. Recreate the backend so it picks up the env, then run arm B:

   ```bash
   docker compose up -d --no-deps --force-recreate clara-backend
   docker compose exec clara-backend node scripts/probe-rag-reranker.mjs
   node scripts/benchmark-rag-ab.mjs \
     --kb-id '<KB_ID>' \
     --queries rag-ab-queries.json \
     --label rerank-on \
     --out rag-ab-candidate.json
   ```

   Require `RAG reranker smoke PASS` before running Arm B. Use the **same
   kbId, topK, mode, scope, repeat, warmup and gap-ms** as
   arm A. Compare mode warns when run configs differ, because then latency
   deltas are no longer attributable to reranking alone. This also checks
   repeat count, warmup count, gap and API origin, in addition to kbId,
   topK, mode, scope and channel.

## Compare and interpret

```bash
node scripts/benchmark-rag-ab.mjs \
  --compare rag-ab-baseline.json rag-ab-candidate.json \
  --out rag-ab-report.json
```

| Metric | Reads as | What to look for |
|---|---|---|
| `top1ChangeRate` | share of questions whose first cited source changed | every change deserves a manual spot-check (below) |
| `meanOverlapAtK` / `meanJaccard` | how much of the citation set changed | large drops mean the reranker swaps whole evidence sets, not just order |
| `meanRankTau` | ordering agreement on common sources (−1…1) | low tau with high overlap = pure reordering, the reranker's intended effect |
| `contextChangeRate` | share of questions whose assembled AI context changed | directly predicts answer-text changes downstream |
| `latency` p50/p95 deltas | total grounding call | compare against your latency budget for chat/voice turns |
| retrieval-stage p50/p95 deltas | total vector retrieval including TEI | includes embedding, Qdrant, translations and reranking; **not** equivalent to model runtime |
| `rerankMs` p50/p95 | TEI stage wall time | isolates optional inference and connection wait; zero for skipped requests |
| `rerankOutcomes` | applied / skipped / timeout / fallback / unavailable counts | establish whether the candidate actually reranked and whether the model timed out; unavailable indicates an older backend image with no instrumentation |
| `meanQdrantScoreDrift` | validity check | **> 0.005 signals a possible index/embedding change — rerun both arms**; zero drift only supports the scores of shared hits, not full index identity |
| `qdrantScoreComparison` | number of questions with/without comparable scores | when no source IDs overlap, index stability **cannot be verified** from scores; investigate rather than interpreting it as stable |
| `groundedRate` | answers that still return evidence | any drop means the rerank arm lost retrievable answers |

**Use the current instrumented backend image for both arms.** When the backend
image includes outcome instrumentation, `timings.rerankMs` and
`timings.rerankStatus` (`applied`, `skipped`, `timeout`, `fallback`) are
returned in the authenticated RAG response. The A/B CLI prints per-run counts
and the stage p50/p95, and records `rerankOutcomes` for each question and for
the complete run. If rerank status is `unavailable`, the image predates this
feature; rebuild the test image and run **both** arms again before relying
on model success/timeout statistics.

Some questions with explicit clause IDs deliberately bypass reranking, so
`skipped` is expected for those questions. This is not an inference success.
The HTTP model timeout only bounds TEI work, not embedding, translation or
whole-response processing. A 6-second TEI timeout may accompany a longer
total retrieval, but compare model-specific timeout counts and `rerankMs`
before attributing it to the model. Model inference that succeeds yet leaves
citation order unchanged still counts as `applied`.

**Spot-check changed top-1 answers before enabling.** For each question the
compare output flags, run the debug probe with the same question and read the
actual evidence text the model would receive:

```bash
node scripts/debug-rag-retrieval.mjs --kb-id '<KB_ID>' \
  --question '<the changed question>' --top-k 6
```

If the new top-1 is clearly more on-topic, that is a win; if it is a
near-duplicate demoting a better section, note it. The reranker cannot be
judged from IDs alone.

**Enablement guidance** (the script prints these hints from your data):

- Ordering identical everywhere + latency up → reranking adds nothing for
  this query set; not justified on this host.
- Top-1 changes concentrated on multi-document questions with flat cosine
  scores → the intended use case; verify the changes are improvements.
- Retrieval p95 approaching the configured timeout → the stage will start
  silently no-oping under load (safe, but the benefit disappears); raise the
  timeout, lower `RAG_RERANK_MAX_CANDIDATES`, or move TEI to GPU.

## Rollback

Reranking is env-gated and fail-open: unset `RAG_RERANK_URL` (or set
`RAG_RERANK_ENABLED=false`) in `.env`, `docker compose up -d --no-deps
clara-backend`, and retrieval is byte-identical to baseline again. The TEI
container can stay stopped: `docker compose stop clara-reranker` — the image
and model cache remain on the host for one-command re-enablement.

## Scope and non-goals

The benchmark measures the **retrieval** layer only: sources, ordering and
latency of the grounding call. It does not generate answers, so it cannot
measure final answer quality — that is what the top-1 spot-checks are for.
It deliberately records no snippet or context text, but the raw questions,
document titles, source IDs and KB identifiers may be tenant-sensitive. Do
**not** post raw benchmark files in issues or public review threads. Redact
identifiers/question text or share aggregate metrics only.
