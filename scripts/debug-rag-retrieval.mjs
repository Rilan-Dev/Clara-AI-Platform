#!/usr/bin/env node
/**
 * Exercise exactly the authenticated /api/rag/search -> postRagSearch ->
 * groundClaraContext route used by Clara RAG. Never call Qdrant with a
 * separate embedding configuration: that would give misleading diagnostics.
 *
 * Examples:
 *   CLARA_DEBUG_TOKEN=<token-in-your-env> node scripts/debug-rag-retrieval.mjs \
 *      --kb-id <authorized-kb-id> --question "What does policy DO.2.1 require?" \
 *      --top-k 6 --out ./clara-rag-probe.json
 *
 * Use an already authenticated local admin session token, or set
 * CLARA_DEBUG_COOKIE if the deployment authenticates via a session cookie.
 * Do not paste cookies/tokens into questions, files or issue comments.
 */
import { writeFile } from "node:fs/promises";

const help = `Usage:
  node scripts/debug-rag-retrieval.mjs --kb-id KB_ID --question "User question" [options]

Options:
  --base-url URL       Clara app origin (default CLARA_BASE_URL or http://localhost:3000)
  --kb-id ID           Required, must be authorized for kb:read
  --question TEXT      Required, actual user question to embed/retrieve
  --top-k N            1..20, defaults to 6 (current grounding service cap)
  --document-id ID     Optional document-scoped search within this KB
  --mode MODE          classic | hybrid | agentic; omit to use platform runtime default
  --scope SCOPE        live (default) | draft (requires kb:update)
  --expect TEXT        Assert this text appears in returned AI context (repeatable)
  --allow-empty        Don't fail exit status for 0 results (out-of-scope tests)
  --no-context         Do not print full AI context to the terminal
  --out FILE           Save a shareable JSON trace; refuses to overwrite file
  --help               Display this help

Authentication (env only, never CLI args):
  CLARA_DEBUG_TOKEN    Access token for this Clara deployment
  CLARA_DEBUG_COOKIE   Cookie header from an authorized local session

Nothing is sent to an LLM for answer generation; the route returns the same
retrieved context/sources that Clara's grounded assistant uses. Running this
probe may consume embedding usage/quota and record a RAG search audit event.
`;

function readArgs(argv) {
  const args = { expected: [], topK: 6, scope: "live", printContext: true, allowEmpty: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--help" || key === "-h") { args.help = true; continue; }
    if (key === "--allow-empty") { args.allowEmpty = true; continue; }
    if (key === "--no-context") { args.printContext = false; continue; }
    const supported = ["--base-url", "--kb-id", "--question", "--top-k", "--document-id", "--mode", "--scope", "--expect", "--out"];
    if (!supported.includes(key)) throw new Error(`Unknown option: ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    if (key === "--expect") args.expected.push(value);
    else args[({ "--base-url": "baseUrl", "--kb-id": "kbId", "--question": "question", "--top-k": "topK", "--document-id": "documentId", "--mode": "mode", "--scope": "scope", "--out": "output" })[key]] = value;
  }
  if (args.help) return args;
  if (!args.kbId || !args.question?.trim()) throw new Error("--kb-id and --question are required");
  const k = Number(args.topK);
  if (!Number.isSafeInteger(k) || k < 1 || k > 20) throw new Error("--top-k must be an integer from 1 to 20");
  args.topK = k;
  if (args.mode && !["classic", "hybrid", "agentic"].includes(args.mode)) throw new Error("Invalid --mode");
  if (!["live", "draft"].includes(args.scope)) throw new Error("Invalid --scope");
  return args;
}

function baseUrlOf(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) throw new Error("--base-url must be a bare application origin");
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) {
    throw new Error("Credentials must use HTTPS, except for local development");
  }
  return url.origin;
}

async function main() {
  let opts;
  try { opts = readArgs(process.argv.slice(2)); }
  catch (err) { console.error(err.message + "\n\n" + help); process.exitCode = 1; return; }
  if (opts.help) { console.log(help); return; }
  const token = process.env.CLARA_DEBUG_TOKEN?.trim();
  const cookie = process.env.CLARA_DEBUG_COOKIE?.trim();
  if (!token && !cookie) {
    throw new Error("Set CLARA_DEBUG_TOKEN or CLARA_DEBUG_COOKIE in your local environment; credentials must never be passed as CLI arguments.");
  }
  const base = baseUrlOf(opts.baseUrl ?? process.env.CLARA_BASE_URL ?? "http://localhost:3000");
  const requestBody = {
    kbId: opts.kbId,
    query: opts.question,
    topK: opts.topK,
    scope: opts.scope,
    channel: "chat",
    ...(opts.documentId ? { documentId: opts.documentId } : {}),
    ...(opts.mode ? { ragMode: opts.mode } : {}),
  };
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + "/api/rag/search", {
    method: "POST", headers, body: JSON.stringify(requestBody),
    redirect: "manual", signal: AbortSignal.timeout(90_000),
  });
  if (res.status >= 300 && res.status < 400) throw new Error(`Unexpected redirect HTTP ${res.status}; use the real Clara app origin`);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`RAG endpoint HTTP ${res.status}: ${typeof payload?.error === "string" ? payload.error : "request failed"}`);
  }
  if (!Array.isArray(payload?.sources) || typeof payload?.context !== "string") {
    throw new Error("Unexpected RAG response: sources[] and context string are required");
  }
  const sources = payload.sources;
  const failures = opts.expected.filter((term) => !payload.context.includes(term));
  if (!opts.allowEmpty && sources.length === 0) failures.push("No Qdrant vector sources returned");
  if (sources.length > opts.topK) failures.push(`Received ${sources.length} vector sources, greater than requested topK ${opts.topK}`);

  const trace = {
    schemaVersion: "clara.rag-retrieval-probe.v1",
    capturedAt: new Date().toISOString(),
    endpoint: "/api/rag/search",
    path: "postRagSearch -> groundClaraContext",
    request: requestBody,
    response: {
      kb: payload.kb,
      mode: payload.mode,
      scope: payload.scope,
      intent: payload.intent,
      grounded: payload.grounded,
      responseLanguage: payload.responseLanguage,
      knowledgeLanguage: payload.knowledgeLanguage,
      retrievalQuery: payload.retrievalQuery,
      latencyMs: payload.latencyMs,
      timings: payload.timings ?? null,
      context: payload.context,
      sources,
      graphSources: payload.graphSources ?? [],
      guidance: payload.guidance,
      outOfScopeReply: payload.outOfScopeReply,
    },
    checks: {
      vectorResults: sources.length,
      requestedTopK: opts.topK,
      returnedAtMostTopK: sources.length <= opts.topK,
      expectedText: opts.expected.map((text) => ({ text, found: payload.context.includes(text) })),
      passed: failures.length === 0,
      failures,
    },
  };
  console.log(`Clara RAG retrieval: ${opts.question}`);
  console.log(`Mode: ${payload.mode} | grounded: ${payload.grounded} | vector hits: ${sources.length}/${opts.topK} | graph hits: ${payload.graphSources?.length ?? 0} | latency: ${payload.latencyMs}ms`);
  sources.forEach((hit, i) => {
    console.log(`\n#${i + 1} score=${Number(hit.score).toFixed(4)} point=${hit.id} document=${hit.documentId ?? "unknown"} page=${hit.pageNumber ?? "unknown"}`);
    console.log(`  ${hit.title}`);
    console.log(`  ${String(hit.snippet ?? "").slice(0, 350).replace(/\s+/g, " ")}`);
  });
  if (opts.printContext) console.log("\n--- EXACT AI CONTEXT FROM CLARA ---\n" + payload.context + "\n--- END AI CONTEXT ---");
  if (opts.output) {
    await writeFile(opts.output, JSON.stringify(trace, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`Saved: ${opts.output} (includes potentially sensitive source text; inspect before sharing)`);
  }
  console.log(failures.length ? `FAIL: ${failures.join("; ")}` : "PASS: expected retrieval conditions met");
  if (failures.length) process.exitCode = 2;
}

main().catch((err) => { console.error(`RAG probe failed: ${err.message}`); process.exitCode = 1; });
