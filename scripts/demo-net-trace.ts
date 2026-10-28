/**
 * Smoke demo — what [net-trace] rows look like in `docker compose logs
 * clara-backend` / Vercel function logs at each NET_TRACE level, including
 * the per-vendor-call upstream rows now wired into the Gemini and OpenAI
 * provider layers (chat + embeddings).
 *
 * Run:  npx tsx scripts/demo-net-trace.ts
 */
import { netTraceError, netTraceRequest, netTraceUpstream } from "@/lib/net-trace";

function section(title: string): void {
  console.log(`\n═══ ${title} ${"═".repeat(Math.max(0, 60 - title.length))}`);
}

// ── Level: off (production default) ─────────────────────────────────────────
process.env.NET_TRACE = "off";
section("NET_TRACE=off — quiet, but failures still captured");

const failed = netTraceRequest({
  route: "chat",
  url: "/api/chat",
  headers: { "x-request-id": "admin-1760697600-x7f2a" },
  reqBody: { kbId: "ab69cf61", query: "how do I reset my password?" },
});
failed.field("org", "ab69cf61");
failed.field("kb", "support_rilan");
failed.fail(
  new Error("fetch failed", {
    cause: new Error("Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443, timeout: 10000ms)"),
  }),
  { status: 502, resBody: { error: "Knowledge-base search failed. Please verify the embedding configuration and try again." } },
);

// ── Level: on ────────────────────────────────────────────────────────────────
process.env.NET_TRACE = "on";
section("NET_TRACE=on — one summary row per request");

const ok = netTraceRequest({
  route: "chat",
  url: "/api/chat",
  headers: { "x-request-id": "admin-1760697700-b31cc" },
});
ok.field("org", "ab69cf61");
ok.field("kb", "support_rilan");
ok.field("provider", "gemini");
ok.end({ status: 200, note: "stream-complete" });

// ── Level: verbose ───────────────────────────────────────────────────────────
process.env.NET_TRACE = "verbose";
section("NET_TRACE=verbose — + redacted body previews + vendor rows");

const verbose = netTraceRequest({
  route: "embed/chat",
  url: "/api/embed/chat",
  headers: { "x-request-id": "srv-m0x1y2z-9k4j2h" },
});
verbose.field("org", "ab69cf61");
verbose.field("kb", "support_rilan");
verbose.setReqBody({ messages: 2, sessionId: "web-167596b3", realtimeVoice: false });
verbose.end({
  status: 200,
  resBody: { sources: 3, note: "stream-complete" },
});

netTraceUpstream({
  provider: "gemini",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
  status: 429,
  durationMs: 3812,
  attempt: 2,
  of: 4,
  error: new Error("429 Resource has been exhausted (Quota exceeded)"),
});

// Verbose vendor rows — one per server-side egress call (Gemini/OpenAI chat
// + embeddings): the calls the browser Network tab can NEVER show. The res
// summary makes the production count-mismatch visible right in the row.
netTraceUpstream({
  provider: "gemini",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents",
  status: 200,
  durationMs: 1734,
  requestBody: ["policies document chunk 1 — full text preview…", "policies document chunk 2 — full text preview…"],
  responseBody: { embeddings: 1, requests: 20, dimension: 1536 },
});
netTraceUpstream({
  provider: "openai",
  url: "https://api.openai.com/v1/chat/completions",
  status: 200,
  durationMs: 842,
  requestBody: { model: "gpt-4o-mini", messages: [{ role: "user", content: "how do I reset my password?" }] },
  responseBody: { stream: "opened" },
});

// Standalone issue capture (always on) — the incident recorder pairs with this.
process.env.NET_TRACE = "off";
section("netTraceError — always-on issue capture (works at NET_TRACE=off)");
netTraceError("chat/retrieval", new Error("401 invalid_api_key"), {
  stage: "retrieval failed (degrading to an ungrounded answer)",
  req: "admin-1760697800-q8w1e",
  org: "ab69cf61",
  kb: "support_rilan",
});

// Upstream vendor failures are ALSO always-on, with the HTTP status pulled
// from the SDK error (OpenAI APIError / Gemini ApiError both carry .status).
section("upstream failures — always-on, status extracted from the SDK error");
netTraceUpstream({
  provider: "openai",
  url: "https://api.openai.com/v1/embeddings",
  durationMs: 96,
  error: Object.assign(new Error("401 Incorrect API key provided"), { status: 401 }),
});
netTraceUpstream({
  provider: "gemini",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
  durationMs: 4210,
  attempt: 2,
  error: Object.assign(new Error("fetch failed"), {
    cause: new Error("Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443, timeout: 10000ms)"),
  }),
});
