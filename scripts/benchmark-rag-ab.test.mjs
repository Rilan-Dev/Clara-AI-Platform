import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./benchmark-rag-ab.mjs", import.meta.url));

async function runTool(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, CLARA_DEBUG_TOKEN: "bench-test-token", CLARA_DEBUG_COOKIE: "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (x) => { stdout += x; });
    child.stderr.setEncoding("utf8").on("data", (x) => { stderr += x; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Minimal deterministic /api/rag/search mock with per-question source lists. */
function mockClara({ failStatus = null, failAuth = false, sourcesByQuestion = null } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const body = JSON.parse(await new Promise((resolve) => {
      let raw = "";
      req.on("data", (data) => { raw += data; });
      req.on("end", () => resolve(raw));
    }));
    calls.push({ url: req.url, authorization: req.headers.authorization, body });
    if (failAuth) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not authenticated" }));
      return;
    }
    if (failStatus) {
      res.writeHead(failStatus, { "content-type": "text/html", "x-request-id": "mock-gateway-1" });
      res.end("<html>secret-gateway-debug-page</html>");
      return;
    }
    const hit = (id, score, extra = {}) => ({
      id, documentId: "doc-1", pageNumber: 3, score, title: "Policy Manual",
      snippet: "SENSITIVE-SNAPSHOT-SNIPPET-" + id, sourceType: "vector", ...extra,
    });
    const question = String(body.query ?? "");
    const sources = sourcesByQuestion
      ? sourcesByQuestion(question)
      : [hit("pt-a", 0.91), hit("pt-b", 0.84), hit("pt-c", 0.77)];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      context: "[S1] Policy Manual (page 3)\nSENSITIVE-ASSEMBLED-CONTEXT-TEXT",
      sources,
      graphSources: [],
      grounded: sources.length > 0, mode: "classic",
      kb: { id: body.kbId, name: "Test KB", collection: "col" },
      scope: {}, intent: "knowledge", responseLanguage: "en",
      knowledgeLanguage: "en", retrievalQuery: question,
      latencyMs: 40 + (calls.length % 3) * 5,
      timings: {
        metadataMs: 1, admissionMs: 2, configMs: 3, translationMs: 0,
        retrievalMs: 30 + (calls.length % 3) * 5,
        embeddingMs: 9, denseSearchMs: 0, indexLookupMs: 7, referenceHeaderMs: 4,
        referenceNeighborMs: 3, referenceScoreMs: 1, referenceFallbackMs: 0,
        graphMs: 0, totalMs: 40 + (calls.length % 3) * 5,
      },
    }));
  });
  return { server, calls };
}

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server) => new Promise((resolve) => server.close(resolve));

test("run mode: real RAG API contract, warmup separation, percentiles, shareable output", async () => {
  const { server, calls } = mockClara();
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-"));
  try {
    await listen(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    const queries = join(dir, "queries.json");
    await writeFile(queries, JSON.stringify({ questions: ["What does clause 4.2 cover?", "How do I file a claim?"] }));
    const output = join(dir, "baseline.json");
    const result = await runTool([
      "--base-url", base, "--kb-id", "kb-1", "--queries", queries,
      "--label", "rerank-off", "--warmup", "1", "--repeat", "2", "--gap-ms", "0",
      "--out", output,
    ]);
    assert.equal(result.code, 0, result.stderr);
    // The report contains raw question wording and document titles, even though snippets are excluded.
    assert.match(result.stdout, /PRIVATE output: contains question text and document titles/i);

    // 2 questions x (1 warmup + 2 measured) = 6 requests, all authenticated.
    assert.equal(calls.length, 6);
    assert.ok(calls.every((c) => c.url === "/api/rag/search" && c.authorization === "Bearer bench-test-token"));
    for (const call of calls) {
      assert.deepEqual(call.body, {
        kbId: "kb-1", query: call.body.query, topK: 6, scope: "live", channel: "chat",
      });
      assert.ok(["What does clause 4.2 cover?", "How do I file a claim?"].includes(call.body.query));
    }

    const run = JSON.parse(await readFile(output, "utf8"));
    assert.equal(run.schemaVersion, "clara.rag-ab-benchmark.v1");
    assert.equal(run.kind, "run");
    assert.equal(run.label, "rerank-off");
    assert.equal(run.config.kbId, "kb-1");
    assert.equal(run.config.baseUrlOrigin, base);
    assert.equal(run.warmup.requests, 2);
    assert.equal(run.warmup.failures, 0);
    assert.equal(run.aggregate.measuredRequests, 4);
    assert.equal(run.aggregate.successfulRequests, 4);
    assert.equal(run.aggregate.groundedRate, 1);
    assert.equal(run.perQuestion.length, 2);
    for (const q of run.perQuestion) {
      assert.equal(q.attempts, 2);
      assert.equal(q.failures, 0);
      assert.equal(q.sourceStableAcrossAttempts, true);
      assert.equal(q.contextStableAcrossAttempts, true);
      assert.equal(q.sources.length, 3);
      assert.equal(q.sources[0].id, "pt-a");
      assert.equal(q.sources[0].score, 0.91);
      assert.equal(q.latency.n, 2);
      assert.equal(q.clientLatency.n, 2);
      assert.ok(Number.isFinite(q.clientLatency.p50));
    }
    assert.equal(run.aggregate.clientLatency.n, 4);
    assert.ok(run.aggregate.clientLatency.p95 >= run.aggregate.clientLatency.p50);
    assert.equal(run.warmup.clientFirstSeenLatency.n, 2);
    for (const attempt of run.attempts) {
      assert.ok(Number.isFinite(attempt.clientLatencyMs));
      assert.ok(attempt.clientLatencyMs >= 0);
    }
    assert.match(result.stdout, /Measured client HTTP round trip:/);
    // Stage percentiles recorded from the route's timings payload.
    assert.equal(run.aggregate.stages.retrievalMs.n, 4);
    assert.equal(run.aggregate.stages.referenceHeaderMs.p50, 4);
    assert.equal(run.aggregate.stages.referenceNeighborMs.p50, 3);
    assert.equal(run.aggregate.stages.embeddingMs.p50, 9);
    assert.ok(run.aggregate.latency.p50 >= run.aggregate.latency.min);
    assert.ok(run.aggregate.latency.p95 <= run.aggregate.latency.max);

    // Shareable by design: no snippets, no assembled context, no token.
    const raw = await readFile(output, "utf8");
    assert.doesNotMatch(raw, /SENSITIVE-SNAPSHOT-SNIPPET/);
    assert.doesNotMatch(raw, /SENSITIVE-ASSEMBLED-CONTEXT-TEXT/);
    assert.doesNotMatch(raw + result.stdout + result.stderr, /bench-test-token/);
    // Context presence is captured as length + digest only.
    assert.equal(run.perQuestion[0].contextChars, "[S1] Policy Manual (page 3)\nSENSITIVE-ASSEMBLED-CONTEXT-TEXT".length);
    assert.match(run.perQuestion[0].contextHash, /^[0-9a-f]{16}$/);

    // Refuses to overwrite the existing output file.
    const again = await runTool([
      "--base-url", base, "--kb-id", "kb-1", "--queries", queries, "--out", output,
    ]);
    assert.equal(again.code, 1);
    assert.match(again.stderr, /already exists/);
    assert.equal(calls.length, 6); // no extra requests were made
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("compare mode: overlap, kendall tau, top-1 change, score drift and latency deltas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-cmp-"));
  try {
    const baseline = {
      schemaVersion: "clara.rag-ab-benchmark.v1",
      kind: "run",
      label: "rerank-off",
      capturedAt: "2026-10-30T00:00:00.000Z",
      config: { kbId: "kb-1", topK: 6, mode: null, scope: "live", channel: "chat", repeat: 2, warmup: 1, gapMs: 0, baseUrlOrigin: "https://clara.example" },
      warmup: { requests: 2, failures: 0, firstSeenLatency: { n: 2, min: 90, max: 110, mean: 100, p50: 100, p95: 109 } },
      perQuestion: [
        {
          question: "What does clause 4.2 cover?",
          attempts: 2, failures: 0, grounded: true, mode: "classic",
          sources: [
            { id: "a", documentId: "d1", pageNumber: 1, title: "Doc", score: 0.90 },
            { id: "b", documentId: "d1", pageNumber: 2, title: "Doc", score: 0.80 },
            { id: "c", documentId: "d1", pageNumber: 3, title: "Doc", score: 0.70 },
          ],
          graphSourceCount: 0, contextChars: 100, contextHash: "aaaaaaaaaaaaaaaa",
          sourceStableAcrossAttempts: true, contextStableAcrossAttempts: true,
          latency: { n: 2, min: 100, max: 200, mean: 150, p50: 150, p95: 195 },
        },
        {
          question: "How do I file a claim?",
          attempts: 2, failures: 0, grounded: true, mode: "classic",
          sources: [
            { id: "x", documentId: "d1", pageNumber: 1, title: "Doc", score: 0.95 },
            { id: "y", documentId: "d1", pageNumber: 2, title: "Doc", score: 0.85 },
          ],
          graphSourceCount: 0, contextChars: 80, contextHash: "bbbbbbbbbbbbbbbb",
          sourceStableAcrossAttempts: true, contextStableAcrossAttempts: true,
          latency: { n: 2, min: 100, max: 200, mean: 150, p50: 150, p95: 195 },
        },
      ],
      attempts: [],
      aggregate: {
        questions: 2, measuredRequests: 4, successfulRequests: 4, failedRequests: 0,
        groundedQuestions: 2, groundedRate: 1,
        latency: { n: 4, min: 100, max: 200, mean: 150, p50: 150, p95: 195 },
        stages: { retrievalMs: { n: 4, min: 90, max: 180, mean: 135, p50: 135, p95: 176 } },
        returnedMoreThanTopKRequests: 0,
      },
    };
    // Candidate: q1 has b promoted over a (tau = (2-1)/3 = 1/3) with identical
    // Qdrant scores; q2 keeps order but appends a NEW source z (jaccard 2/3).
    const candidate = JSON.parse(JSON.stringify(baseline));
    candidate.label = "rerank-on";
    candidate.capturedAt = "2026-10-30T01:00:00.000Z";
    candidate.perQuestion[0].sources = [
      { id: "b", documentId: "d1", pageNumber: 2, title: "Doc", score: 0.80 },
      { id: "a", documentId: "d1", pageNumber: 1, title: "Doc", score: 0.90 },
      { id: "c", documentId: "d1", pageNumber: 3, title: "Doc", score: 0.70 },
    ];
    candidate.perQuestion[0].contextHash = "cccccccccccccccc";
    candidate.perQuestion[1].sources = [
      { id: "x", documentId: "d1", pageNumber: 1, title: "Doc", score: 0.95 },
      { id: "y", documentId: "d1", pageNumber: 2, title: "Doc", score: 0.85 },
      { id: "z", documentId: "d1", pageNumber: 4, title: "Doc", score: 0.60 },
    ];
    candidate.perQuestion[1].contextHash = "eeeeeeeeeeeeeeee";
    candidate.aggregate.latency = { n: 4, min: 150, max: 260, mean: 200, p50: 200, p95: 255 };
    candidate.aggregate.stages.retrievalMs = { n: 4, min: 140, max: 240, mean: 190, p50: 190, p95: 236 };
    for (const q of candidate.perQuestion) q.latency = { n: 2, min: 150, max: 260, mean: 200, p50: 200, p95: 255 };

    const baseFile = join(dir, "baseline.json");
    const candFile = join(dir, "candidate.json");
    const reportFile = join(dir, "report.json");
    await writeFile(baseFile, JSON.stringify(baseline));
    await writeFile(candFile, JSON.stringify(candidate));

    const result = await runTool(["--compare", baseFile, candFile, "--out", reportFile]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(await readFile(reportFile, "utf8"));
    assert.equal(report.kind, "compare");
    assert.equal(report.aggregate.questionsCompared, 2);

    const q1 = report.perQuestion.find((p) => p.question === "What does clause 4.2 cover?");
    assert.equal(q1.commonSources, 3);
    assert.equal(q1.top1Changed, true);
    assert.equal(q1.overlapAtK, 1);
    assert.equal(q1.jaccard, 1);
    assert.equal(q1.top3Overlap, 1);
    // baseline order a,b,c vs candidate order b,a,c on the common set:
    // pairs (a,b) discordant, (a,c) + (b,c) concordant -> tau = 1/3.
    assert.equal(Math.abs(q1.rankTau - 1 / 3) < 1e-9, true);
    assert.equal(q1.meanRankDelta, 0.67); // round((1+1+0)/3, 2)
    assert.equal(q1.contextChanged, true);
    assert.equal(q1.meanQdrantScoreDrift, 0);

    const q2 = report.perQuestion.find((p) => p.question === "How do I file a claim?");
    assert.equal(q2.top1Changed, false);
    assert.equal(q2.overlapAtK, 1);
    assert.equal(q2.jaccard, 0.6667); // round(2/3, 4)
    assert.equal(q2.onlyCandidate, 1);
    assert.equal(q2.onlyBaseline, 0);
    assert.equal(q2.rankTau, 1);
    assert.equal(q2.contextChanged, true);

    assert.equal(report.aggregate.top1ChangeRate, 0.5);
    assert.equal(Math.abs(report.aggregate.meanJaccard - 5 / 6) < 0.001, true);
    assert.equal(report.aggregate.meanQdrantScoreDrift, 0);
    assert.equal(report.aggregate.contextChangeRate, 1);
    assert.equal(report.aggregate.latency.baseline.p50, 150);
    assert.equal(report.aggregate.latency.candidate.p50, 200);
    assert.equal(report.aggregate.latency.candidateRetrievalMs.p50, 190);
    assert.match(result.stdout, /Top-1 source changed: 1\/2/);
    assert.match(result.stdout, /p50: 150ms -> 200ms \(\+50ms\)/);
    assert.match(result.stdout, /Retrieval stage p50: 135ms -> 190ms \(\+55ms\)/);
    assert.match(result.stdout, /index stable/);
    assert.match(result.stdout, /Review the 1 question\(s\) with a changed top-1/);
    assert.match(result.stdout, /Retrieval p95 increased by 60ms/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("compare mode: score drift and config mismatch produce validity warnings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-drift-"));
  try {
    const mk = (label, topK, score) => ({
      schemaVersion: "clara.rag-ab-benchmark.v1", kind: "run", label, capturedAt: "2026-10-30T00:00:00.000Z",
      config: { kbId: "kb-1", topK, mode: null, scope: "live", channel: "chat", repeat: 1, warmup: 0, gapMs: 0, baseUrlOrigin: "https://clara.example" },
      warmup: { requests: 0, failures: 0, firstSeenLatency: null },
      perQuestion: [{
        question: "q", attempts: 1, failures: 0, grounded: true, mode: "classic",
        sources: [{ id: "a", documentId: "d", pageNumber: 1, title: "Doc", score }],
        graphSourceCount: 0, contextChars: 10, contextHash: "dddddddddddddddd",
        sourceStableAcrossAttempts: true, contextStableAcrossAttempts: true,
        latency: { n: 1, min: 50, max: 50, mean: 50, p50: 50, p95: 50 },
      }],
      attempts: [],
      aggregate: {
        questions: 1, measuredRequests: 1, successfulRequests: 1, failedRequests: 0,
        groundedQuestions: 1, groundedRate: 1,
        latency: { n: 1, min: 50, max: 50, mean: 50, p50: 50, p95: 50 },
        stages: {}, returnedMoreThanTopKRequests: 0,
      },
    });
    const a = join(dir, "a.json");
    const b = join(dir, "b.json");
    await writeFile(a, JSON.stringify(mk("arm-a", 6, 0.80)));
    const candidate = mk("arm-b", 8, 0.72);
    candidate.config.repeat = 3;
    candidate.config.warmup = 1;
    candidate.config.gapMs = 250;
    candidate.config.baseUrlOrigin = "https://different.example";
    await writeFile(b, JSON.stringify(candidate)); // different settings AND drifted score
    const result = await runTool(["--compare", a, b]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /VALIDITY WARNING: mean Qdrant score drift/);
    assert.match(result.stdout, /Re-run BOTH arms/);
    assert.match(result.stdout, /run configs differ/);
    assert.match(result.stdout, /topK: 6 -> 8/);
    assert.match(result.stdout, /repeat: 1 -> 3/);
    assert.match(result.stdout, /warmup: 0 -> 1/);
    assert.match(result.stdout, /gapMs: 0 -> 250/);
    assert.match(result.stdout, /baseUrlOrigin: "https:\/\/clara.example" -> "https:\/\/different.example"/);
    const reportless = await runTool(["--compare", a, b]);
    assert.equal(reportless.code, 0); // --out is optional for compare mode

    // A candidate that swaps every source has no common Qdrant score values.
    // The benchmark must not assert index stability from an empty comparison.
    candidate.perQuestion[0].sources = [{ id: "other", documentId: "d", pageNumber: 1, title: "Doc", score: 0.95 }];
    const c = join(dir, "no-common.json");
    await writeFile(c, JSON.stringify(candidate));
    const noCommon = await runTool(["--compare", a, c]);
    assert.equal(noCommon.code, 0, noCommon.stderr);
    assert.match(noCommon.stdout, /cannot verify index stability/i);
    assert.doesNotMatch(noCommon.stdout, /\(index stable\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("compare mode rejects files that are not benchmark runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-bad-"));
  try {
    const bad = join(dir, "bad.json");
    await writeFile(bad, JSON.stringify({ schemaVersion: "something.else.v1", kind: "run" }));
    const good = join(dir, "good.json");
    await writeFile(good, JSON.stringify({ schemaVersion: "clara.rag-ab-benchmark.v1", kind: "run", perQuestion: [] }));
    const result = await runTool(["--compare", bad, good]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not a benchmark run file/);
    const result2 = await runTool(["--compare", good, bad]);
    assert.equal(result2.code, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run mode aborts on the first 401 without further quota-consuming requests", async () => {
  const { server, calls } = mockClara({ failAuth: true });
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-auth-"));
  try {
    await listen(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    const queries = join(dir, "queries.json");
    await writeFile(queries, JSON.stringify(["q1", "q2", "q3"]));
    const result = await runTool([
      "--base-url", base, "--kb-id", "kb-1", "--queries", queries,
      "--warmup", "1", "--repeat", "2", "--gap-ms", "0", "--out", join(dir, "out.json"),
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Authentication or KB permission denied/);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /bench-test-token/);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("run mode fails with exit 2 when fewer than half of measured requests succeed", async () => {
  const { server } = mockClara({ failStatus: 502 });
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-502-"));
  try {
    await listen(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    const queries = join(dir, "queries.json");
    await writeFile(queries, JSON.stringify(["q1", "q2"]));
    const output = join(dir, "out.json");
    const result = await runTool([
      "--base-url", base, "--kb-id", "kb-1", "--queries", queries,
      "--warmup", "0", "--repeat", "2", "--gap-ms", "0", "--out", output,
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /fewer than half of the measured requests succeeded/);
    // Gateway HTML bodies never leak; only status + request id are reported.
    assert.match(result.stderr, /HTTP 502/);
    assert.match(result.stderr, /mock-gateway-1/);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-gateway-debug-page/);
    assert.doesNotMatch(result.stdout + result.stderr, /bench-test-token/);
    const run = JSON.parse(await readFile(output, "utf8"));
    assert.equal(run.aggregate.successfulRequests, 0);
    assert.equal(run.aggregate.measuredRequests, 4);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("run mode fails with exit 2 when no question returns grounded sources", async () => {
  const { server } = mockClara({ sourcesByQuestion: () => [] });
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-empty-"));
  try {
    await listen(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    const queries = join(dir, "queries.json");
    await writeFile(queries, JSON.stringify(["totally unrelated question"]));
    const result = await runTool([
      "--base-url", base, "--kb-id", "kb-1", "--queries", queries,
      "--warmup", "0", "--repeat", "1", "--gap-ms", "0", "--out", join(dir, "out.json"),
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /no question returned grounded sources/);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("credentials must come from the environment, never CLI arguments", async () => {
  const result = await runTool(
    ["--base-url", "http://127.0.0.1:3000", "--kb-id", "kb-1", "--question", "q", "--out", "/tmp/unused-bench.json"],
    { CLARA_DEBUG_COOKIE: "secret-cookie-value", CLARA_DEBUG_TOKEN: "" },
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /clara_platform_token=VALUE/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-cookie-value/);
});

test("preflight authenticates via /api/auth/me before any RAG search request", async () => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url);
    if (req.url === "/api/auth/me") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ user: { id: "u1" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      context: "[S1] ok", sources: [{ id: "s1", score: 0.9, title: "Doc" }],
      graphSources: [], grounded: true, mode: "classic", latencyMs: 5,
      timings: { metadataMs: 1, admissionMs: 1, configMs: 1, translationMs: 0, retrievalMs: 3, graphMs: 0, totalMs: 5 },
    }));
  });
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-ab-preflight-"));
  try {
    await listen(server);
    const result = await runTool([
      "--base-url", `http://127.0.0.1:${server.address().port}`,
      "--kb-id", "kb-1", "--question", "hello", "--preflight-auth",
      "--warmup", "0", "--repeat", "1", "--gap-ms", "0", "--out", join(dir, "out.json"),
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(seen, ["/api/auth/me", "/api/rag/search"]);
    assert.match(result.stdout, /Authentication preflight: PASS/);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});
