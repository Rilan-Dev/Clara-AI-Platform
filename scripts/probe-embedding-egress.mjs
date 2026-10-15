#!/usr/bin/env node
/**
 * scripts/probe-embedding-egress.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * LIVE embedding egress diagnostics — staged, operator-actionable, zero deps.
 *
 * WHY: document ingestion fails with
 *   "Embedding failed (gemini/… @ generativelanguage.googleapis.com): fetch
 *    failed [Connect Timeout Error … this server cannot reach
 *    generativelanguage.googleapis.com:443]"
 * while the SAME code path works on other networks. That is a network/ISP/
 * firewall-level block of the Google endpoint, not an application bug. This
 * script proves which layer fails on THIS host and prints the exact fix.
 *
 * RUN (inside the deployment, so it tests the container's network):
 *   docker compose exec clara-backend node scripts/probe-embedding-egress.mjs
 *   docker compose exec clara-worker   node scripts/probe-embedding-egress.mjs
 * or from the repo root on any host: node scripts/probe-embedding-egress.mjs
 *
 * Stages per embedding endpoint (Gemini relay/direct, OpenAI, TEI):
 *   DNS  → does the host's resolver return addresses?
 *   TCP  → can we open a connection within EGRESS_CONNECT_TIMEOUT_MS?
 *   TLS  → does the TLS handshake complete?
 *   HTTP → does the endpoint answer at all (401/403 = reachable, auth needed)?
 *   EMBED→ (key present) full round-trip: real embedding vector returned?
 *
 * Extra Gemini stages (key present):
 *   BATCH→ does :batchEmbedContents honour the one-embedding-per-request
 *          contract for a 3-text batch and a 20-text batch? (Production
 *          evidence: gemini-embedding-2-preview answered HTTP 200 with ONE
 *          embedding for 20 requests — the platform's embedBatch detects
 *          this and degrades to sequential single-text embeds.)
 *
 * Vector-store stage:
 *   QDRANT → is QDRANT_URL reachable and serving (/readyz + /collections)?
 *          (Production evidence: "[vector-store] getCollection failed:
 *          fetch failed" from the ingest worker.)
 *
 * Exit code 0 = at least one embedding route fully works; 1 = none do.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

const CONNECT_TIMEOUT_MS = (() => {
  const v = Number(process.env.EGRESS_CONNECT_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 20_000;
})();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com";
const TEI_BASE_URL = process.env.MULTILINGUAL_EMBEDDINGS_BASE_URL?.trim() || "";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-2-preview";
const QDRANT_URL = process.env.QDRANT_URL?.trim() || "";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY?.trim() || "";

const proxies = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]
  .filter((k) => process.env[k]?.trim());

const results = [];

function line(char = "─") { return char.repeat(78); }

function ok(msg) { return `\x1b[32m✓\x1b[0m ${msg}`; }
function bad(msg) { return `\x1b[31m✗\x1b[0m ${msg}`; }
function warn(msg) { return `\x1b[33m!\x1b[0m ${msg}`; }

/** One probe stage result. */
function record(endpoint, stage, passed, detail, ms) {
  results.push({ endpoint, stage, passed, detail, ms });
  const tag = passed ? ok : bad;
  const msStr = ms != null ? ` \x1b[2m(${ms}ms)\x1b[0m` : "";
  console.log(`   ${tag(`${stage}: ${detail}`)}${msStr}`);
}

async function timed(fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - started, error: null };
  } catch (error) {
    return { value: null, ms: Date.now() - started, error };
  }
}

/** TCP connect stage. */
function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const finish = (err) => {
      socket.removeAllListeners();
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error(`connect timeout after ${timeoutMs}ms`)));
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}

/**
 * Probe one HTTPS embedding endpoint through the FULL transport stack
 * (DNS → TCP → TLS → HTTP). Uses global fetch — the same undici pipeline
 * the provider SDKs use — minus the SDK so the failure modes stay raw.
 */
async function probeEndpoint({ label, baseUrl, apiKey, embedRequest }) {
  console.log(`\n${line()}`);
  console.log(`\x1b[1m${label}\x1b[0m  ${baseUrl}`);
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    console.log(`   ${bad("config: base URL is not a valid URL — fix the env value")}`);
    record(label, "config", false, "invalid base URL", null);
    return { label, reachable: false, embeds: false };
  }
  const host = url.hostname;
  const port = url.port ? Number(url.port) : url.protocol === "http:" ? 80 : 443;

  // Stage 1 — DNS
  const dns = await timed(() => lookup(host, { all: true }));
  if (dns.error) {
    record(label, "DNS", false, `${host} does not resolve (${dns.error.code ?? dns.error.message}) — fix DNS or set the base URL to a reachable relay`, dns.ms);
    return { label, reachable: false, embeds: false };
  }
  record(label, "DNS", true, `${host} → ${dns.value.map((a) => a.address).slice(0, 3).join(", ")}${dns.value.length > 3 ? ` (+${dns.value.length - 3})` : ""}`, dns.ms);

  // Stage 2 — TCP
  const tcp = await timed(() => tcpConnect(host, port, CONNECT_TIMEOUT_MS));
  if (tcp.error) {
    record(label, "TCP", false, `${host}:${port} unreachable (${tcp.error.message}). THIS is the layer the ingest worker fails on: the route to this host is blocked (firewall/ISP/region). Fix: route via an egress proxy (HTTPS_PROXY) or point the base URL at a reachable relay`, tcp.ms);
    return { label, reachable: false, embeds: false };
  }
  record(label, "TCP", true, `${host}:${port} connection established`, tcp.ms);

  // Stage 3+4 — TLS + HTTP (a plain GET on the models path)
  const probeUrl = new URL(url.toString().replace(/\/+$/, "") + (label.startsWith("OpenAI") ? "/v1/models" : "/v1beta/models"));
  const http = await timed(() =>
    fetch(probeUrl, {
      method: "GET",
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS + 5_000),
    }),
  );
  if (http.error) {
    record(label, "HTTP", false, `request failed before a response: ${http.error.cause?.message ?? http.error.message}`, http.ms);
    return { label, reachable: false, embeds: false };
  }
  const status = http.value.status;
  // 401/403 = endpoint answered; auth is a separate question.
  record(label, "HTTP", true, `endpoint answered (HTTP ${status}${status === 401 || status === 403 ? " — transport OK, auth-gated" : ""})`, http.ms);

  // Stage 5 — full embedding round-trip (only when a key is configured)
  if (!apiKey) {
    console.log(`   ${warn("EMBED: skipped — no API key configured for this provider")}`);
    return { label, reachable: true, embeds: null };
  }
  if (!embedRequest) {
    console.log(`   ${warn("EMBED: skipped — no round-trip request defined for this provider")}`);
    return { label, reachable: true, embeds: null };
  }
  const embed = await timed(() =>
    fetch(embedRequest.url, {
      method: "POST",
      headers: embedRequest.headers,
      body: JSON.stringify(embedRequest.body),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS + 15_000),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
  );
  if (embed.error) {
    record(label, "EMBED", false, `round-trip failed: ${embed.error.cause?.message ?? embed.error.message}`, embed.ms);
    return { label, reachable: true, embeds: false };
  }
  const body = embed.value.body;
  const vector =
    body?.embedding?.values ??
    body?.embeddings?.[0]?.values ??
    body?.data?.[0]?.embedding ??
    (Array.isArray(body) ? body : null);
  if (embed.value.status === 200 && Array.isArray(vector) && vector.length > 0) {
    record(label, "EMBED", true, `full round-trip OK — ${vector.length}-dim vector returned by ${embedRequest.model}`, embed.ms);
    return { label, reachable: true, embeds: true };
  }
  const apiError = body?.error?.message ?? JSON.stringify(body)?.slice(0, 200);
  record(label, "EMBED", false, `HTTP ${embed.value.status} from the API${apiError ? ` — ${apiError}` : ""} (transport works; this is a credentials/model problem, not a network one)`, embed.ms);
  return { label, reachable: true, embeds: false };
}

// ── Banner ───────────────────────────────────────────────────────────────────

console.log(line("═"));
console.log("\x1b[1mClara AI — embedding egress probe\x1b[0m");
console.log(new Date().toISOString());
console.log(line("═"));
console.log(`egress connect timeout : ${CONNECT_TIMEOUT_MS}ms (EGRESS_CONNECT_TIMEOUT_MS)`);
console.log(`proxy configured        : ${proxies.length ? proxies.map((k) => `${k}=${process.env[k]}`).join(", ") : "none"}`);
if (proxies.length === 0) {
  console.log(`                          ${warn("no HTTPS_PROXY set — a blocked route cannot be bypassed without one")}`);
}
console.log(`GEMINI_BASE_URL         : ${GEMINI_BASE_URL}${process.env.GEMINI_BASE_URL ? "" : "  (default direct — Google endpoint)"}`);
console.log(`GEMINI_API_KEY          : ${GEMINI_API_KEY ? "set" : warn("NOT set")}`);
console.log(`OPENAI_BASE_URL         : ${OPENAI_BASE_URL}`);
console.log(`OPENAI_API_KEY          : ${OPENAI_API_KEY ? "set" : warn("NOT set")}`);
console.log(`GEMINI_EMBEDDING_MODEL  : ${GEMINI_EMBEDDING_MODEL}`);
if (TEI_BASE_URL) {
  console.log(`TEI embeddings endpoint : ${TEI_BASE_URL}${process.env.MULTILINGUAL_EMBEDDINGS_ENABLED === "true" ? " (enabled)" : warn(" (MULTILINGUAL_EMBEDDINGS_ENABLED is not true)")}`);
}

// ── Probes ───────────────────────────────────────────────────────────────────

const geminiEmbedBody = {
  content: { parts: [{ text: "clara egress probe" }] },
  taskType: "RETRIEVAL_DOCUMENT",
};

const endpoints = [
  {
    label: "Gemini (embedding backbone)",
    baseUrl: GEMINI_BASE_URL,
    apiKey: GEMINI_API_KEY,
    embedRequest: {
      url: `${GEMINI_BASE_URL.replace(/\/+$/, "")}/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`,
      model: GEMINI_EMBEDDING_MODEL,
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: geminiEmbedBody,
    },
  },
];
if (OPENAI_API_KEY) {
  endpoints.push({
    label: "OpenAI (fallback candidate)",
    baseUrl: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
    embedRequest: {
      url: `${OPENAI_BASE_URL.replace(/\/+$/, "")}/v1/embeddings`,
      model: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_API_KEY}` },
      body: { model: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small", input: "clara egress probe" },
    },
  });
}
if (TEI_BASE_URL && process.env.MULTILINGUAL_EMBEDDINGS_ENABLED === "true") {
  endpoints.push({
    label: "TEI multilingual (self-hosted)",
    baseUrl: TEI_BASE_URL,
    apiKey: process.env.MULTILINGUAL_EMBEDDINGS_API_KEY?.trim() || "",
    embedRequest: {
      url: `${TEI_BASE_URL.replace(/\/+$/, "")}/embed`,
      model: "tei",
      headers: {
        "content-type": "application/json",
        ...(process.env.MULTILINGUAL_EMBEDDINGS_API_KEY?.trim()
          ? { authorization: `Bearer ${process.env.MULTILINGUAL_EMBEDDINGS_API_KEY.trim()}` }
          : {}),
      },
      body: { inputs: "clara egress probe" },
    },
  });
}

const probed = [];
for (const endpoint of endpoints) {
  probed.push(await probeEndpoint(endpoint));
}

// ── Gemini batch-contract probe ───────────────────────────────────────

/**
 * Does the LIVE endpoint honour "one embedding per request" for
 * multi-request batches? The documented contract says yes; production says
 * gemini-embedding-2-preview returned 1 embedding for 20 requests (HTTP
 * 200, deterministic — a model-side batch quirk, NOT a transport failure).
 * The platform survives either answer, but this stage tells the operator
 * WHICH behaviour their endpoint/model currently has.
 */
async function probeGeminiBatchContract() {
  console.log(`\n${line()}`);
  console.log(`\x1b[1mGemini batch contract\x1b[0m  ${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`);
  if (!GEMINI_API_KEY) {
    console.log(`   ${warn("BATCH: skipped — no GEMINI_API_KEY")}`);
    return null;
  }

  const probeBatch = async (texts) => {
    const body = {
      requests: texts.map((text) => ({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      })),
    };
    const attempt = await timed(() =>
      fetch(`${GEMINI_BASE_URL.replace(/\/+$/, "")}/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS + 15_000),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    );
    if (attempt.error) {
      return { ok: false, detail: `request failed: ${attempt.error.cause?.message ?? attempt.error.message}`, ms: attempt.ms };
    }
    const { status, body: json } = attempt.value;
    if (status !== 200) {
      return { ok: false, detail: `HTTP ${status}: ${String(json?.error?.message ?? "").slice(0, 160)}`, ms: attempt.ms };
    }
    const returned = Array.isArray(json?.embeddings) ? json.embeddings.length : 0;
    const dims = json?.embeddings?.[0]?.values?.length ?? null;
    return {
      ok: returned === texts.length,
      detail:
        returned === texts.length
          ? `contract honoured — ${returned} embeddings for ${texts.length} requests (${dims}-dim)`
          : `CONTRACT BROKEN — ${returned} embedding(s) returned for ${texts.length} requests (HTTP 200)`,
      ms: attempt.ms,
    };
  };

  const small = await probeBatch(["alpha chunk", "beta chunk", "gamma chunk"]);
  record("Gemini batch", "BATCH(3)", small.ok, small.detail, small.ms);
  const full = await probeBatch(Array.from({ length: 20 }, (_, i) => `policies chunk ${i} of a real ingest batch`));
  record("Gemini batch", "BATCH(20)", full.ok, full.detail, full.ms);

  if (!small.ok || !full.ok) {
    console.log(
      `   ${warn("multi-request batches misbehave on this model/endpoint — the platform's embedBatch detects")}`,
    );
    console.log(
      `   ${warn("the short response and automatically degrades to sequential single-text embeds (slower, correct).")}`,
    );
  }
  return { small, full };
}

const batchContract = await probeGeminiBatchContract();

// ── Vector-store (Qdrant) probe ──────────────────────────────────────

async function probeQdrant() {
  console.log(`\n${line()}`);
  console.log(`\x1b[1mQdrant (vector store)\x1b[0m  ${QDRANT_URL || "(QDRANT_URL not set)"}`);
  if (!QDRANT_URL) {
    console.log(`   ${warn("QDRANT: skipped — QDRANT_URL is not set")}`);
    return null;
  }
  const headers = {
    ...(QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {}),
  };

  const ready = await timed(() =>
    fetch(`${QDRANT_URL.replace(/\/+$/, "")}/readyz`, {
      headers,
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    }).then(async (r) => ({ status: r.status, text: await r.text().catch(() => "") })),
  );
  if (ready.error) {
    record("Qdrant", "READY", false, `unreachable (${ready.error.cause?.message ?? ready.error.message}) — THIS is what "[vector-store] getCollection failed: fetch failed" means: the worker cannot reach QDRANT_URL`, ready.ms);
    return { reachable: false };
  }
  record("Qdrant", "READY", ready.value.status === 200, `/readyz answered HTTP ${ready.value.status} (${ready.value.text.slice(0, 40) || "empty"})`, ready.ms);

  const collections = await timed(() =>
    fetch(`${QDRANT_URL.replace(/\/+$/, "")}/collections`, {
      headers,
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
  );
  if (collections.error) {
    record("Qdrant", "COLLECTIONS", false, `request failed: ${collections.error.cause?.message ?? collections.error.message}`, collections.ms);
    return { reachable: ready.value.status === 200 };
  }
  const list = Array.isArray(collections.value.body?.result?.collections)
    ? collections.value.body.result.collections
    : [];
  const names = list.map((c) => c.name ?? "?").sort();
  const kbCollections = names.filter((n) => /kb_/i.test(n));
  record(
    "Qdrant",
    "COLLECTIONS",
    collections.value.status === 200,
    collections.value.status === 200
      ? `${list.length} collection(s) visible${kbCollections.length ? ` — ${kbCollections.length} kb_* (${kbCollections.slice(0, 3).join(", ")}${kbCollections.length > 3 ? ", …" : ""})` : ""}`
      : `HTTP ${collections.value.status} — check QDRANT_API_KEY if Qdrant requires one`,
    collections.ms,
  );
  return { reachable: ready.value.status === 200, collections: names };
}

const qdrant = await probeQdrant();

// ── Verdict ──────────────────────────────────────────────────────────────────

console.log(`\n${line("═")}`);
console.log("\x1b[1mVERDICT\x1b[0m");
const gemini = probed.find((p) => p.label.startsWith("Gemini"));
const anyWorking = probed.some((p) => p.embeds === true);

if (anyWorking) {
  console.log(ok("At least one embedding route round-trips fully — ingestion can succeed."));
  const working = probed.filter((p) => p.embeds === true).map((p) => p.label);
  console.log(`   working: ${working.join(", ")}`);
}

if (gemini && gemini.embeds === true) {
  console.log(ok("Gemini embeddings are fully functional on this host."));
  if (batchContract && (!batchContract.small.ok || !batchContract.full.ok)) {
    console.log(warn("Gemini multi-request BATCHES are misbehaving (see BATCH stages above) — the"));
    console.log("   platform degrades to sequential single-text embeds automatically; ingestion will");
    console.log("   be slower but correct. No action needed unless the BATCH stages fail with HTTP");
    console.log("   errors (that would be a key/quota problem, not the model quirk).");
  }
} else if (gemini && !gemini.reachable) {
  console.log(bad("Gemini endpoint is UNREACHABLE from this host (network-level block)."));
  console.log("   Remediation, in order of effort:");
  console.log("   1. GEMINI_BASE_URL  — point it at an HTTPS relay you control that CAN");
  console.log("                        reach Google (a tiny Cloudflare Worker / VPS nginx");
  console.log("                        proxy). Restart with it set; re-run this probe.");
  console.log("                        Settings → AI → test the embedding default, then");
  console.log("                        Retry the failed documents from the KB page.");
  console.log("   2. HTTPS_PROXY      — route ALL provider traffic through an egress proxy");
  console.log("                        reachable from this host (the platform's egress");
  console.log("                        layer honours HTTPS_PROXY + NO_PROXY automatically):");
  console.log("                        HTTPS_PROXY=http://host.docker.internal:7890");
  console.log("                        docker compose up -d  (recreate containers)");
  console.log("   3. Self-hosted      — docker compose --profile multilingual up -d embeddings");
  console.log("                        (fully offline embeddings, no vendor network needed;");
  console.log("                        needs ~3 GB RAM; re-index the KB to its model).");
  if (OPENAI_API_KEY && probed.some((p) => p.label.startsWith("OpenAI") && p.embeds === true)) {
    console.log("   4. OpenAI fallback  — OpenAI embeddings round-trip fine from here:");
    console.log("                        Settings → AI → Embeddings → switch the default to");
    console.log("                        OpenAI (re-index jobs follow automatically).");
  }
} else if (gemini && gemini.reachable && gemini.embeds === false) {
  console.log(warn("Gemini endpoint is REACHABLE but the embedding call fails — check the API"));
  console.log("   key (GEMINI_API_KEY) and the model name printed above (401/403/404 detail).");
} else if (gemini && gemini.reachable && gemini.embeds === null) {
  console.log(ok("Gemini endpoint is REACHABLE from this host — the network route is fine."));
  console.log(`   ${warn("transport-only check: set GEMINI_API_KEY to also verify a full embedding round-trip")}`);
  process.exitCode = 0; // transport healthy — not a failure for a no-key diagnostic run
} else if (!gemini) {
  console.log(warn("No Gemini probe configured (missing GEMINI_API_KEY is fine for a"));
  console.log("   transport-only check — DNS/TCP/HTTP stages above still apply).");
}

const noKeysAtAll = probed.length > 0 && probed.every((p) => p.embeds === null);
if (!anyWorking && !noKeysAtAll) {
  console.log(bad("No embedding route currently works end-to-end on this host."));
  process.exitCode = 1;
} else if (!anyWorking && noKeysAtAll) {
  console.log(warn("Transport-only run (no API keys configured) — stages above are the verdict."));
}
if (qdrant && qdrant.reachable === false) {
  console.log(bad("Qdrant is UNREACHABLE — document ingest cannot read/create collections."));
  console.log("   Fix: check the qdrant container (docker compose ps clara-qdrant), verify");
  console.log("   QDRANT_URL matches the compose service name, then Retry the failed documents.");
  process.exitCode = 1;
}
console.log(line("═"));
