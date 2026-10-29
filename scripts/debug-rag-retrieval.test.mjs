import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./debug-rag-retrieval.mjs", import.meta.url));

async function runProbe(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, CLARA_DEBUG_TOKEN: "probe-test-token", CLARA_DEBUG_COOKIE: "", ...env },
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

test("retrieval CLI uses authorized real RAG API contract and exports exact context", async () => {
  let requested = null;
  let auth = null;
  const server = createServer(async (req, res) => {
    auth = req.headers.authorization;
    requested = JSON.parse(await new Promise((resolve) => {
      let body = "";
      req.on("data", (data) => { body += data; });
      req.on("end", () => resolve(body));
    }));
    assert.equal(req.url, "/api/rag/search");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      context: "[S1] Policy (page 65)\nDO.2.1 requirement",
      sources: [{ id: "qdrant-point-1", documentId: "doc-1", pageNumber: 65, score: 0.88, title: "Policy", snippet: "DO.2.1 requirement" }],
      graphSources: [],
      grounded: true, mode: "classic", kb: { id: "kb-1", name: "Test", collection: "col" },
      scope: {}, intent: "knowledge", latencyMs: 23,
    }));
  });
  const dir = await mkdtemp(join(tmpdir(), "clara-rag-probe-"));
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const output = join(dir, "trace.json");
    const result = await runProbe([
      "--base-url", base, "--kb-id", "kb-1", "--document-id", "doc-1",
      "--question", "What is DO.2.1?", "--top-k", "4",
      "--expect", "DO.2.1", "--out", output,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(auth, "Bearer probe-test-token");
    assert.deepEqual(requested, {
      kbId: "kb-1", query: "What is DO.2.1?", topK: 4, scope: "live",
      channel: "chat", documentId: "doc-1",
    });
    assert.match(result.stdout, /qdrant-point-1/);
    assert.doesNotMatch(result.stdout + result.stderr, /probe-test-token/);
    const trace = JSON.parse(await readFile(output, "utf8"));
    assert.equal(trace.response.context, "[S1] Policy (page 65)\nDO.2.1 requirement");
    assert.equal(trace.response.sources[0].pageNumber, 65);
    assert.equal(trace.checks.passed, true);

    const failed = await runProbe([
      "--base-url", base, "--kb-id", "kb-1", "--question", "different",
      "--expect", "absent source detail", "--no-context",
    ]);
    assert.equal(failed.code, 2);
    assert.match(failed.stdout, /FAIL/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects bare session cookie before network access and never prints the cookie", async () => {
  const badCookie = "secret-cookie-value-should-not-appear";
  const result = await runProbe(
    ["--base-url", "http://127.0.0.1:3000", "--kb-id", "kb-1", "--question", "question"],
    { CLARA_DEBUG_COOKIE: badCookie, CLARA_DEBUG_TOKEN: "" },
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /clara_platform_token=VALUE/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-cookie-value/);
});

test("preflight authenticates via the real auth/me route before invoking RAG search", async () => {
  const calls = [];
  const server = createServer((req, res) => {
    calls.push({ path: req.url, authorization: req.headers.authorization });
    if (req.url === "/api/auth/me") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ user: { id: "allowed-user" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      context: "[S1] verified", sources: [{
        id: "id-1", score: 0.9, snippet: "verified", title: "Document",
      }], graphSources: [], mode: "classic", grounded: true, latencyMs: 3,
    }));
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const result = await runProbe([
      "--base-url", `http://127.0.0.1:${addr.port}`,
      "--kb-id", "kb-1", "--question", "verified", "--preflight-auth",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(calls.map((c) => c.path), ["/api/auth/me", "/api/rag/search"]);
    assert.ok(calls.every((c) => c.authorization === "Bearer probe-test-token"));
    assert.match(result.stdout, /Authentication preflight: PASS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("502 upstream HTML is reported with status and request ID without leaking gateway content", async () => {
  const secret = "private-upstream-debug-page-must-not-leak";
  const server = createServer((_req, res) => {
    res.writeHead(502, {
      "content-type": "text/html",
      "x-request-id": "gateway-id-123",
      server: "nginx",
    });
    res.end("<html>" + secret + "</html>");
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const result = await runProbe([
      "--base-url", `http://127.0.0.1:${addr.port}`,
      "--kb-id", "kb-1", "--question", "some query",
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /HTTP 502/);
    assert.match(result.stderr, /gateway-id-123/);
    assert.match(result.stderr, /reverse-proxy and Clara backend logs/);
    assert.doesNotMatch(result.stdout + result.stderr, /private-upstream-debug-page/);
    assert.doesNotMatch(result.stdout + result.stderr, /probe-test-token/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
