#!/usr/bin/env node
/**
 * Relevance/latency A-B benchmark for the optional RAG reranker (TEI).
 *
 * Executes a fixed query set against the SAME authenticated grounding route
 * Clara uses in production (/api/rag/search -> postRagSearch ->
 * groundClaraContext), then compares two runs (reranker OFF vs ON) for
 * citation-identity changes, ordering changes and p50/p95 latency drift.
 *
 * The tool has two modes:
 *
 *   RUN      node scripts/benchmark-rag-ab.mjs --kb-id KB --queries FILE \
 *              --out baseline.json --label rerank-off
 *   COMPARE  node scripts/benchmark-rag-ab.mjs --compare baseline.json \
 *              candidate.json [--out report.json]
 *
 * Typical enablement workflow (see docs/deployment/rag-reranker-ab-benchmark.md):
 *   1. Reranker stopped/unset  -> run baseline.json
 *   2. Enable via .env (RAG_RERANK_URL, RAG_RERANK_ENABLED, tuned
 *      RAG_RERANK_TIMEOUT_MS / RAG_RERANK_MAX_CANDIDATES) -> run candidate.json
 *   3. --compare baseline.json candidate.json -> inspect overlap/top-1/tau
 *      and latency deltas before deciding production enablement.
 *
 * Security: authentication is read from the environment (CLARA_DEBUG_TOKEN or
 * CLARA_DEBUG_COOKIE), never from CLI arguments. Result files are PRIVATE: they contain raw questions, document titles,
 * source/KB identifiers, scores and timing metadata. Snippets, assembled
 * context and credentials are omitted, but identifiers can be sensitive.
 * Redact before sharing; never paste cookies/tokens into questions or issues.
 *
 * Cost notice: every request consumes embedding usage/quota and records a RAG
 * search audit event, exactly like the debug probe. The planned request count
 * is printed before the first request is sent.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";

const SCHEMA_VERSION = "clara.rag-ab-benchmark.v1";

const help = `Usage:
  node scripts/benchmark-rag-ab.mjs --kb-id KB_ID --queries FILE --out run.json [options]
  node scripts/benchmark-rag-ab.mjs --compare BASELINE.json CANDIDATE.json [--out report.json]

Run options:
  --base-url URL       Clara app origin (default CLARA_BASE_URL or http://localhost:3000)
  --kb-id ID           Required for run mode; must be authorized for kb:read
  --queries FILE       JSON array of question strings, or {"questions": [...]}
  --question TEXT      Repeatable; extra questions appended after --queries
  --label TEXT         Run label recorded in the output (e.g. rerank-off / rerank-on)
  --top-k N            1..20, defaults to 6 (current grounding service cap)
  --mode MODE          classic | hybrid | agentic; omit for platform runtime default
  --scope SCOPE        live (default) | draft (requires kb:update)
  --repeat N           Measured passes per question, 1..10, default 3
  --warmup N           Unmeasured cache-priming passes, 0..3, default 1
                       (warmup latencies are reported separately as first-seen)
  --gap-ms N           Pause between requests, 0..60000, default 250
  --timeout-ms N       Per-request timeout, default 90000
  --preflight-auth     Check /api/auth/me BEFORE any quota-consuming request
  --out FILE           Required: results JSON; refuses to overwrite an existing file

Compare options:
  --compare A B        Two run files previously produced by this tool
  --out FILE           Optional comparison report JSON; refuses to overwrite

Authentication (env only, never CLI args):
  CLARA_DEBUG_TOKEN    Access token for this Clara deployment
  CLARA_DEBUG_COOKIE   Full Cookie header e.g. clara_platform_token=TOKEN
                       Prefer CLARA_DEBUG_TOKEN for CLI access

Every request consumes embedding usage/quota and records a RAG search audit
event. Nothing is sent to an LLM for answer generation; the route returns the
same retrieved context/sources Clara's grounded assistant uses.

Result files are PRIVATE: they omit snippets, assembled AI context and
credentials, but preserve raw questions and document/source identifiers.
Redact or aggregate before sharing outside the authorized organization.
`;

// ── CLI parsing ────────────────────────────────────────────────────────────

function readArgs(argv) {
  const args = { questions: [], repeat: 3, warmup: 1, gapMs: 250, timeoutMs: 90_000, topK: 6, scope: "live" };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--help" || key === "-h") { args.help = true; continue; }
    if (key === "--preflight-auth") { args.preflightAuth = true; continue; }
    if (key === "--question") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --question");
      args.questions.push(value);
      continue;
    }
    const supported = ["--base-url", "--kb-id", "--queries", "--label", "--top-k", "--mode", "--scope", "--repeat", "--warmup", "--gap-ms", "--timeout-ms", "--out", "--compare"];
    if (!supported.includes(key)) throw new Error(`Unknown option: ${key}`);
    if (key === "--compare") {
      const first = argv[++i];
      const second = argv[++i];
      if (!first || first.startsWith("--") || !second || second.startsWith("--")) {
        throw new Error("--compare requires exactly two file paths");
      }
      args.compare = [first, second];
      continue;
    }
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    const map = {
      "--base-url": "baseUrl", "--kb-id": "kbId", "--queries": "queriesFile", "--label": "label",
      "--top-k": "topK", "--mode": "mode", "--scope": "scope", "--repeat": "repeat",
      "--warmup": "warmup", "--gap-ms": "gapMs", "--timeout-ms": "timeoutMs", "--out": "output",
    };
    args[map[key]] = value;
  }
  if (args.help) return args;

  if (args.compare) {
    if (args.kbId || args.queriesFile || args.questions.length) {
      throw new Error("--compare cannot be combined with run-mode options");
    }
    return args;
  }

  if (!args.kbId) throw new Error("--kb-id is required for run mode");
  if (!args.queriesFile && args.questions.length === 0) {
    throw new Error("Provide --queries FILE or at least one --question");
  }
  if (!args.output) throw new Error("--out FILE is required for run mode");
  const k = Number(args.topK);
  if (!Number.isSafeInteger(k) || k < 1 || k > 20) throw new Error("--top-k must be an integer from 1 to 20");
  args.topK = k;
  for (const [name, current, min, max] of [["--repeat", args.repeat, 1, 10], ["--warmup", args.warmup, 0, 3], ["--gap-ms", args.gapMs, 0, 60000], ["--timeout-ms", args.timeoutMs, 1000, 300000]]) {
    const n = Number(current);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    if (name === "--repeat") args.repeat = n; else if (name === "--warmup") args.warmup = n;
    else if (name === "--gap-ms") args.gapMs = n; else args.timeoutMs = n;
  }
  if (args.mode && !["classic", "hybrid", "agentic"].includes(args.mode)) throw new Error("Invalid --mode");
  if (!["live", "draft"].includes(args.scope)) throw new Error("Invalid --scope");
  return args;
}

// ── Shared helpers (same conventions as debug-rag-retrieval.mjs) ───────────

function baseUrlOf(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) throw new Error("--base-url must be a bare application origin");
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) {
    throw new Error("Credentials must use HTTPS, except for local development");
  }
  return url.origin;
}

function responseDiagnostic(res) {
  const headers = [
    ["content-type", "Content-Type"],
    ["server", "Server"],
    ["x-request-id", "X-Request-ID"],
    ["x-vercel-id", "X-Vercel-ID"],
    ["cf-ray", "CF-Ray"],
  ];
  return [
    `HTTP ${res.status} ${res.statusText || ""}`.trim(),
    ...headers.map(([key, label]) => {
      const value = res.headers.get(key);
      // These fields contain diagnostic metadata, never Bearer/cookie values.
      return value ? `${label}: ${value.slice(0, 160)}` : "";
    }).filter(Boolean),
  ].join(" | ");
}

function httpFailureHint(status) {
  if (status === 401 || status === 403) {
    return "Authentication or KB permission denied. Check session validity and kb:read access.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "Gateway/upstream failure. Check reverse-proxy and Clara backend logs at this request time; if /api/auth/me works, inspect RAG provider, Qdrant, DB and gateway timeouts.";
  }
  return "Inspect the Clara backend logs for this request; do not share access tokens or raw HTTP headers.";
}

function authHeaders() {
  const token = process.env.CLARA_DEBUG_TOKEN?.trim();
  const cookie = process.env.CLARA_DEBUG_COOKIE?.trim();
  if (!token && !cookie) {
    throw new Error("Set CLARA_DEBUG_TOKEN or CLARA_DEBUG_COOKIE in your local environment; credentials must never be passed as CLI arguments.");
  }
  if (cookie && !/(?:^|;\s*)clara_platform_token=[^;\s]+/.test(cookie)) {
    throw new Error("CLARA_DEBUG_COOKIE must be a full cookie header containing clara_platform_token=VALUE, not a bare token. Prefer CLARA_DEBUG_TOKEN for a session token.");
  }
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Linear-interpolated percentile over an ascending numeric array. */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sorted[lo]);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

function latencyStats(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

function mean(values) {
  const list = values.filter((v) => Number.isFinite(v));
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
}

// ── Response summarisation (private; no snippet or context text) ────────

function summarizeResponse(payload, topK) {
  const sources = payload.sources.map((hit) => ({
    id: String(hit.id),
    documentId: hit.documentId != null ? String(hit.documentId) : null,
    pageNumber: typeof hit.pageNumber === "number" ? hit.pageNumber : null,
    title: typeof hit.title === "string" ? hit.title : "Document",
    score: Number.isFinite(Number(hit.score)) ? Number(hit.score) : null,
  }));
  return {
    grounded: payload.grounded === true,
    mode: typeof payload.mode === "string" ? payload.mode : null,
    latencyMs: Number.isFinite(Number(payload.latencyMs)) ? Number(payload.latencyMs) : null,
    timings: payload.timings && typeof payload.timings === "object" ? payload.timings : null,
    sources,
    graphSourceCount: Array.isArray(payload.graphSources) ? payload.graphSources.length : 0,
    contextChars: typeof payload.context === "string" ? payload.context.length : null,
    contextHash: typeof payload.context === "string"
      ? createHash("sha256").update(payload.context).digest("hex").slice(0, 16)
      : null,
    returnedMoreThanTopK: sources.length > topK,
    responseLanguage: typeof payload.responseLanguage === "string" ? payload.responseLanguage : null,
    knowledgeLanguage: typeof payload.knowledgeLanguage === "string" ? payload.knowledgeLanguage : null,
  };
}

async function callRagSearch({ base, headers, body, timeoutMs }) {
  const res = await fetch(base + "/api/rag/search", {
    method: "POST", headers, body: JSON.stringify(body),
    redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status >= 300 && res.status < 400) throw new Error(`Unexpected redirect HTTP ${res.status}; use the real Clara app origin`);
  // A 502 from a reverse proxy often contains an HTML body. Never leak raw
  // error pages, credentials or provider errors into shared benchmark logs.
  if (!res.ok) {
    const error = new Error(`RAG endpoint: ${responseDiagnostic(res)}. ${httpFailureHint(res.status)}`);
    error.status = res.status;
    throw error;
  }
  const payload = await res.json().catch(() => null);
  if (!Array.isArray(payload?.sources) || typeof payload?.context !== "string") {
    throw new Error("Unexpected RAG response: sources[] and context string are required");
  }
  return payload;
}

async function assertWritable(output) {
  try { await access(output); } catch { return; } // does not exist yet -> writable
  throw new Error(`Output file already exists: ${output} (refusing to overwrite; choose a new file name)`);
}

// ── Query-set loading ──────────────────────────────────────────────────────

async function loadQuestions(queriesFile, cliQuestions) {
  let fromFile = [];
  if (queriesFile) {
    const raw = JSON.parse(await readFile(queriesFile, "utf8"));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.questions) ? raw.questions : null;
    if (!list) throw new Error('--queries file must be a JSON array of strings or {"questions": [...]}');
    fromFile = list;
  }
  const all = [...fromFile, ...cliQuestions];
  const invalid = all.filter((q) => typeof q !== "string" || !q.trim() || q.length > 2000);
  if (invalid.length) throw new Error("Every question must be a non-empty string of at most 2000 characters");
  const unique = [...new Set(all.map((q) => q.trim()))];
  const duplicates = all.length - unique.length;
  return { questions: unique, duplicates };
}

// ── RUN MODE ───────────────────────────────────────────────────────────────

async function runBenchmark(opts) {
  const headers = authHeaders();
  const base = baseUrlOf(opts.baseUrl ?? process.env.CLARA_BASE_URL ?? "http://localhost:3000");
  const { questions, duplicates } = await loadQuestions(opts.queriesFile, opts.questions);
  if (!questions.length) throw new Error("The query set is empty; provide --queries FILE or at least one --question");
  if (duplicates > 0) console.log(`Note: removed ${duplicates} duplicate question(s) from the query set.`);
  if (questions.length < 3) {
    console.log("Warning: fewer than 3 questions gives weak percentiles; 10-20 realistic questions are recommended.");
  }

  const body = {
    kbId: opts.kbId,
    topK: opts.topK,
    scope: opts.scope,
    channel: "chat",
    ...(opts.mode ? { ragMode: opts.mode } : {}),
  };

  if (opts.preflightAuth) {
    const authRes = await fetch(base + "/api/auth/me", {
      method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
    if (!authRes.ok) {
      throw new Error(`Authentication preflight failed: ${responseDiagnostic(authRes)}. ${httpFailureHint(authRes.status)}`);
    }
    console.log("Authentication preflight: PASS (/api/auth/me)");
  }

  const totalRequests = questions.length * (opts.warmup + opts.repeat);
  console.log(`Benchmark plan: ${questions.length} question(s) x (${opts.warmup} warmup + ${opts.repeat} measured) = ${totalRequests} requests.`);
  console.log("Every request consumes embedding usage/quota and records a RAG search audit event.");
  console.log("PRIVATE output: contains question text and document titles, source and KB IDs; redact before sharing.");

  const warmupRecords = [];
  const measuredRecords = [];

  const executePass = async (passIndex, measured) => {
    for (let qi = 0; qi < questions.length; qi++) {
      const requestBody = { ...body, query: questions[qi] };
      let summary = null;
      let failure = null;
      try {
        const payload = await callRagSearch({ base, headers, body: requestBody, timeoutMs: opts.timeoutMs });
        summary = summarizeResponse(payload, opts.topK);
      } catch (error) {
        failure = { message: error.message, status: error.status ?? null };
        if (error.status === 401 || error.status === 403) throw error;
      }
      if (measured) {
        measuredRecords.push({ questionIndex: qi, pass: passIndex, ...summary, failure });
      } else {
        warmupRecords.push({ questionIndex: qi, pass: passIndex, latencyMs: summary?.latencyMs ?? null, failure });
      }
      if (summary) {
        const retrieval = summary.timings?.retrievalMs;
        console.log(
          `q${String(qi + 1).padStart(2, "0")} pass${passIndex}${measured ? "" : " (warmup)"} `
          + `${summary.latencyMs ?? "?"}ms${Number.isFinite(retrieval) ? ` (retrieval ${retrieval}ms)` : ""} `
          + `hits=${summary.sources.length}/${opts.topK}${failure ? " [failed]" : ""}`,
        );
      } else {
        console.log(`q${String(qi + 1).padStart(2, "0")} pass${passIndex}${measured ? "" : " (warmup)"} FAILED: ${failure.status ?? "error"}`);
      }
      if (opts.gapMs > 0 && !(measured && passIndex === opts.repeat - 1 && qi === questions.length - 1)) {
        await sleep(opts.gapMs);
      }
    }
  };

  for (let pass = 0; pass < opts.warmup; pass++) await executePass(pass, false);
  for (let pass = 0; pass < opts.repeat; pass++) await executePass(pass, true);

  // Per-question rollup (source identity from the LAST successful attempt).
  const perQuestion = questions.map((question, qi) => {
    const attempts = measuredRecords.filter((r) => r.questionIndex === qi);
    const successful = attempts.filter((r) => !r.failure);
    const last = successful[successful.length - 1] ?? null;
    const idLists = successful.map((r) => r.sources.map((s) => s.id).join("\u0000"));
    const stableSources = idLists.length > 1 ? new Set(idLists).size === 1 : successful.length === 1;
    const hashes = successful.map((r) => r.contextHash).filter(Boolean);
    const contextStable = hashes.length > 1 ? new Set(hashes).size === 1 : hashes.length === 1;
    return {
      question,
      attempts: attempts.length,
      failures: attempts.filter((r) => r.failure).length,
      grounded: last?.grounded ?? null,
      mode: last?.mode ?? null,
      sources: last?.sources ?? [],
      graphSourceCount: last?.graphSourceCount ?? 0,
      contextChars: last?.contextChars ?? null,
      contextHash: last?.contextHash ?? null,
      sourceStableAcrossAttempts: successful.length ? stableSources : null,
      contextStableAcrossAttempts: successful.length ? contextStable : null,
      latency: latencyStats(successful.map((r) => r.latencyMs).filter((v) => v != null)),
    };
  });

  const successfulMeasured = measuredRecords.filter((r) => !r.failure);
  const failureCount = measuredRecords.length - successfulMeasured.length;
  const stageNames = ["metadataMs", "admissionMs", "configMs", "translationMs", "retrievalMs", "graphMs", "totalMs"];
  const stages = {};
  for (const stage of stageNames) {
    const stats = latencyStats(successfulMeasured.map((r) => r.timings?.[stage]).filter((v) => Number.isFinite(v)));
    if (stats) stages[stage] = stats;
  }

  const aggregate = {
    questions: questions.length,
    measuredRequests: measuredRecords.length,
    successfulRequests: successfulMeasured.length,
    failedRequests: failureCount,
    groundedQuestions: perQuestion.filter((q) => q.grounded === true).length,
    groundedRate: questions.length ? round(perQuestion.filter((q) => q.grounded === true).length / questions.length, 4) : null,
    latency: latencyStats(successfulMeasured.map((r) => r.latencyMs).filter((v) => v != null)),
    stages,
    returnedMoreThanTopKRequests: successfulMeasured.filter((r) => r.returnedMoreThanTopK).length,
  };

  const firstSeen = latencyStats(warmupRecords.filter((r) => !r.failure).map((r) => r.latencyMs).filter((v) => v != null));
  const warmupSummary = {
    requests: warmupRecords.length,
    failures: warmupRecords.filter((r) => r.failure).length,
    firstSeenLatency: firstSeen,
  };

  const run = {
    schemaVersion: SCHEMA_VERSION,
    kind: "run",
    label: opts.label ?? "unlabeled",
    capturedAt: new Date().toISOString(),
    tool: "scripts/benchmark-rag-ab.mjs",
    config: {
      kbId: opts.kbId,
      topK: opts.topK,
      mode: opts.mode ?? null,
      scope: opts.scope,
      channel: "chat",
      repeat: opts.repeat,
      warmup: opts.warmup,
      gapMs: opts.gapMs,
      baseUrlOrigin: base,
    },
    warmup: warmupSummary,
    perQuestion,
    attempts: measuredRecords.map(({ questionIndex, pass, grounded, latencyMs, timings, failure, sources }) => ({
      questionIndex, pass, grounded, latencyMs, timings: timings ?? null,
      sourcesCount: sources?.length ?? 0, failure: failure ? { status: failure.status, message: failure.message } : null,
    })),
    aggregate,
  };

  await writeFile(opts.output, JSON.stringify(run, null, 2) + "\n", { flag: "wx", mode: 0o600 });

  console.log(`\nRun "${run.label}": ${aggregate.successfulRequests}/${aggregate.measuredRequests} measured requests succeeded.`);
  if (aggregate.latency) {
    console.log(`Measured latency: p50 ${aggregate.latency.p50}ms / p95 ${aggregate.latency.p95}ms (n=${aggregate.latency.n}).`);
  }
  if (stages.retrievalMs) {
    console.log(`Retrieval stage: p50 ${stages.retrievalMs.p50}ms / p95 ${stages.retrievalMs.p95}ms.`);
  }
  if (firstSeen) {
    console.log(`First-seen (warmup) latency: p50 ${firstSeen.p50}ms / p95 ${firstSeen.p95}ms (n=${firstSeen.n}).`);
  }
  console.log(`Grounded questions: ${aggregate.groundedQuestions}/${aggregate.questions}.`);
  console.log(`Saved: ${opts.output} (PRIVATE: no snippets/context, but questions and source metadata remain)`);

  const successRate = measuredRecords.length ? successfulMeasured.length / measuredRecords.length : 0;
  const firstFailure = measuredRecords.find((r) => r.failure)?.failure ?? null;
  if (measuredRecords.length && successRate < 0.5) {
    console.error("FAIL: fewer than half of the measured requests succeeded; benchmark results are not usable.");
    if (firstFailure) console.error(`First request failure: ${firstFailure.message}`);
    process.exitCode = 2;
  } else if (aggregate.groundedQuestions === 0 && questions.length > 0) {
    console.error("FAIL: no question returned grounded sources; check the query set matches this KB.");
    process.exitCode = 2;
  }
}

// ── COMPARE MODE ───────────────────────────────────────────────────────────

/** Kendall tau over the SAME set of ids ordered differently in two lists. */
function kendallTau(orderA, orderB) {
  const n = orderA.length;
  if (n < 2) return null;
  const posB = new Map(orderB.map((id, i) => [id, i]));
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = posB.get(orderA[i]) - posB.get(orderA[j]);
      if (a < 0) concordant++;
      else if (a > 0) discordant++;
    }
  }
  return (concordant - discordant) / (n * (n - 1) / 2);
}

async function readRunFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read run file ${path}: ${error.message}`);
  }
  if (parsed?.schemaVersion !== SCHEMA_VERSION || parsed?.kind !== "run") {
    throw new Error(`${path} is not a benchmark run file (expected schemaVersion ${SCHEMA_VERSION}, kind "run")`);
  }
  if (!Array.isArray(parsed?.perQuestion)) throw new Error(`${path} is missing the perQuestion array`);
  return parsed;
}

function compareQuestionPair(baseQ, candQ) {
  const baseIds = baseQ.sources.map((s) => s.id);
  const candIds = candQ.sources.map((s) => s.id);
  const baseSet = new Set(baseIds);
  const candSet = new Set(candIds);
  const common = baseIds.filter((id) => candSet.has(id));
  const unionSize = new Set([...baseIds, ...candIds]).size;
  const baseScoreById = new Map(baseQ.sources.map((s) => [s.id, s.score]));
  const scoreDeltas = common
    .map((id) => {
      const cand = candQ.sources.find((s) => s.id === id);
      const base = baseScoreById.get(id);
      return Number.isFinite(base) && Number.isFinite(cand?.score) ? Math.abs(cand.score - base) : null;
    })
    .filter((v) => Number.isFinite(v));
  // Candidate-ordering of the common ids (orderA is the baseline ordering,
  // because `common` was built by iterating the baseline id list).
  const orderA = common.slice();
  const orderB = candIds.filter((id) => baseSet.has(id));
  const rankDeltas = common.map((id) => {
    const ra = baseIds.indexOf(id);
    const rb = candIds.indexOf(id);
    return ra >= 0 && rb >= 0 ? Math.abs(ra - rb) : null;
  }).filter((v) => Number.isFinite(v));
  return {
    question: baseQ.question,
    baselineSources: baseIds.length,
    candidateSources: candIds.length,
    commonSources: common.length,
    onlyBaseline: baseIds.filter((id) => !candSet.has(id)).length,
    onlyCandidate: candIds.filter((id) => !baseSet.has(id)).length,
    overlapAtK: Math.min(baseIds.length, candIds.length) > 0
      ? round(common.length / Math.min(baseIds.length, candIds.length), 4) : null,
    jaccard: unionSize ? round(common.length / unionSize, 4) : null,
    top1Changed: baseIds[0] !== candIds[0],
    top3Overlap: (() => {
      const b3 = new Set(baseIds.slice(0, 3));
      const c3 = new Set(candIds.slice(0, 3));
      const denom = Math.min(3, baseIds.length, candIds.length);
      return denom ? round([...b3].filter((id) => c3.has(id)).length / denom, 4) : null;
    })(),
    rankTau: kendallTau(orderA, orderB),
    meanRankDelta: rankDeltas.length ? round(mean(rankDeltas), 2) : null,
    meanQdrantScoreDrift: scoreDeltas.length ? round(mean(scoreDeltas), 6) : null,
    groundedBaseline: baseQ.grounded ?? null,
    groundedCandidate: candQ.grounded ?? null,
    contextChanged: baseQ.contextHash != null && candQ.contextHash != null && baseQ.contextHash !== candQ.contextHash,
    baselineLatencyP50: baseQ.latency?.p50 ?? null,
    candidateLatencyP50: candQ.latency?.p50 ?? null,
  };
}

async function compareRuns(opts) {
  const [baseline, candidate] = await Promise.all(opts.compare.map(readRunFile));

  const baseByQuestion = new Map(baseline.perQuestion.map((q) => [q.question, q]));
  const candByQuestion = new Map(candidate.perQuestion.map((q) => [q.question, q]));
  const shared = baseline.perQuestion.filter((q) => candByQuestion.has(q.question));
  const unmatchedBaseline = baseline.perQuestion.filter((q) => !candByQuestion.has(q.question)).map((q) => q.question);
  const unmatchedCandidate = candidate.perQuestion.filter((q) => !baseByQuestion.has(q.question)).map((q) => q.question);
  if (!shared.length) {
    throw new Error("No question text is shared between the two runs; the query sets differ. Re-run with the same --queries file.");
  }

  const pairs = shared.map((baseQ) => compareQuestionPair(baseQ, candByQuestion.get(baseQ.question)));

  const configMismatch = [];
  for (const key of ["kbId", "topK", "mode", "scope", "channel"]) {
    const b = JSON.stringify(baseline.config?.[key] ?? null);
    const c = JSON.stringify(candidate.config?.[key] ?? null);
    if (b !== c) configMismatch.push(`${key}: ${b} -> ${c}`);
  }

  const aggregate = {
    questionsCompared: pairs.length,
    questionsUnmatched: { baseline: unmatchedBaseline.length, candidate: unmatchedCandidate.length },
    top1ChangeRate: round(pairs.filter((p) => p.top1Changed).length / pairs.length, 4),
    meanOverlapAtK: round(mean(pairs.map((p) => p.overlapAtK)), 4),
    meanJaccard: round(mean(pairs.map((p) => p.jaccard)), 4),
    meanTop3Overlap: round(mean(pairs.map((p) => p.top3Overlap)), 4),
    meanRankTau: round(mean(pairs.map((p) => p.rankTau)), 4),
    contextChangeRate: round(pairs.filter((p) => p.contextChanged).length / pairs.length, 4),
    meanQdrantScoreDrift: round(mean(pairs.map((p) => p.meanQdrantScoreDrift)), 6),
    groundedRate: {
      baseline: round(pairs.filter((p) => p.groundedBaseline === true).length / pairs.length, 4),
      candidate: round(pairs.filter((p) => p.groundedCandidate === true).length / pairs.length, 4),
    },
    latency: {
      baseline: baseline.aggregate?.latency ?? null,
      candidate: candidate.aggregate?.latency ?? null,
      baselineRetrievalMs: baseline.aggregate?.stages?.retrievalMs ?? null,
      candidateRetrievalMs: candidate.aggregate?.stages?.retrievalMs ?? null,
    },
    configMismatch,
  };

  const report = {
    schemaVersion: SCHEMA_VERSION,
    kind: "compare",
    capturedAt: new Date().toISOString(),
    tool: "scripts/benchmark-rag-ab.mjs",
    baseline: { label: baseline.label, capturedAt: baseline.capturedAt, file: opts.compare[0] },
    candidate: { label: candidate.label, capturedAt: candidate.capturedAt, file: opts.compare[1] },
    perQuestion: pairs,
    unmatched: { baseline: unmatchedBaseline, candidate: unmatchedCandidate },
    aggregate,
  };

  // ── Human summary ──
  console.log(`A/B compare: "${baseline.label}" vs "${candidate.label}" (${aggregate.questionsCompared} shared question(s)).`);
  if (aggregate.configMismatch.length) {
    console.log(`WARNING — run configs differ (${aggregate.configMismatch.join("; ")}); latency/ordering deltas may not be attributable to reranking alone.`);
  }
  if (unmatchedBaseline.length || unmatchedCandidate.length) {
    console.log(`Unmatched questions: ${unmatchedBaseline.length} baseline-only, ${unmatchedCandidate.length} candidate-only (excluded).`);
  }
  console.log(`Top-1 source changed: ${pairs.filter((p) => p.top1Changed).length}/${pairs.length} | mean overlap@k ${aggregate.meanOverlapAtK} | mean top-3 overlap ${aggregate.meanTop3Overlap} | mean rank tau ${aggregate.meanRankTau}.`);
  console.log(`Context changed: ${pairs.filter((p) => p.contextChanged).length}/${pairs.length} | grounded rate ${aggregate.groundedRate.baseline} -> ${aggregate.groundedRate.candidate}.`);
  const bl = aggregate.latency.baseline;
  const cl = aggregate.latency.candidate;
  if (bl && cl) {
    console.log(`Measured latency p50: ${bl.p50}ms -> ${cl.p50}ms (${cl.p50 - bl.p50 >= 0 ? "+" : ""}${cl.p50 - bl.p50}ms) | p95: ${bl.p95}ms -> ${cl.p95}ms (${cl.p95 - bl.p95 >= 0 ? "+" : ""}${cl.p95 - bl.p95}ms).`);
  }
  const br = aggregate.latency.baselineRetrievalMs;
  const cr = aggregate.latency.candidateRetrievalMs;
  if (br && cr) {
    console.log(`Retrieval stage p50: ${br.p50}ms -> ${cr.p50}ms (${cr.p50 - br.p50 >= 0 ? "+" : ""}${cr.p50 - br.p50}ms) | p95: ${br.p95}ms -> ${cr.p95}ms (${cr.p95 - br.p95 >= 0 ? "+" : ""}${cr.p95 - br.p95}ms).`);
  }

  const drift = aggregate.meanQdrantScoreDrift;
  if (drift != null && drift > 0.005) {
    console.log(`VALIDITY WARNING: mean Qdrant score drift ${drift} across common sources — the vector index or embedding backbone changed between arms. Re-run BOTH arms before drawing enablement conclusions.`);
  } else {
    console.log("Qdrant score drift on common sources: " + (drift == null ? "n/a" : drift) + " (index stable).");
  }

  const changedTop1 = pairs.filter((p) => p.top1Changed);
  if (!changedTop1.length && aggregate.meanOverlapAtK === 1) {
    console.log("Ordering was identical on every question — reranking did not change retrieval for this query set; weigh the added latency against zero observed relevance delta.");
  } else if (changedTop1.length) {
    console.log(`Review the ${changedTop1.length} question(s) with a changed top-1 with scripts/debug-rag-retrieval.mjs before enabling (spot-check the actual evidence text).`);
  }
  if (cr && br && cr.p95 - br.p95 > 0) {
    console.log(`Retrieval p95 increased by ${cr.p95 - br.p95}ms — verify this stays within the RAG_RERANK_TIMEOUT_MS budget and the stage no-ops safely on timeout.`);
  }

  if (opts.output) {
    await writeFile(opts.output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`Saved: ${opts.output} (PRIVATE: no snippets/context, but questions and source metadata remain)`);
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main() {
  let opts;
  try { opts = readArgs(process.argv.slice(2)); }
  catch (err) { console.error(err.message + "\n\n" + help); process.exitCode = 1; return; }
  if (opts.help) { console.log(help); return; }
  if (opts.compare) {
    if (opts.output) await assertWritable(opts.output);
    await compareRuns(opts);
  } else {
    await assertWritable(opts.output);
    await runBenchmark(opts);
  }
}

main().catch((err) => { console.error(`Benchmark failed: ${err.message}`); process.exitCode = 1; });
