/**
 * lib/net-trace.ts tests — .env-gated Network-tab-style server tracing.
 *
 * Contract under test (the org-platform observability policy):
 *   1. NET_TRACE gates ONLY the summary/verbose rows; FAILURES are always
 *      captured (issue-capture duty is not optional).
 *   2. The trace id reuses the incoming x-request-id so docker/vercel log
 *      rows correlate 1:1 with the browser devtools Network row.
 *   3. Payload previews are PII-redacted and credential-scrubbed.
 *   4. Nothing is returned to any client — output is console-only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  netTraceChain,
  netTraceError,
  netTraceLevel,
  netTraceRequest,
  netTraceUpstream,
} from "@/lib/net-trace";

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  delete process.env.NET_TRACE;
  delete process.env.NET_TRACE_BODY_CHARS;
  delete process.env.NET_TRACE_SLOW_MS;
});

describe("netTraceLevel", () => {
  it.each([
    [undefined, "off"],
    ["", "off"],
    ["0", "off"],
    ["false", "off"],
    ["off", "off"],
    ["1", "on"],
    ["true", "on"],
    ["on", "on"],
    ["verbose", "verbose"],
    ["2", "verbose"],
    ["all", "verbose"],
    ["something-else", "off"],
  ])("maps %s → %s", (raw, expected) => {
    if (raw === undefined) delete process.env.NET_TRACE;
    else process.env.NET_TRACE = raw as string;
    expect(netTraceLevel()).toBe(expected);
  });
});

describe("netTraceRequest", () => {
  it("is silent on end() when NET_TRACE is off", () => {
    process.env.NET_TRACE = "off";
    const trace = netTraceRequest({ route: "chat", url: "/api/chat" });
    trace.end({ status: 200 });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs one summary row at level on (no bodies)", () => {
    process.env.NET_TRACE = "on";
    const trace = netTraceRequest({
      route: "chat",
      url: "/api/chat",
      reqBody: { query: "reset password" },
    });
    trace.field("org", "ab69cf61");
    trace.end({ status: 200, resBody: { ok: true } });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]![0] as string;
    expect(line).toContain("[net-trace] chat ▸ POST /api/chat → 200");
    expect(line).toContain("req=");
    expect(line).toContain('org="ab69cf61"');
    expect(line).not.toContain("reset password"); // no body preview at "on"
  });

  it("includes redacted body previews at level verbose", () => {
    process.env.NET_TRACE = "verbose";
    const trace = netTraceRequest({
      route: "chat",
      url: "/api/chat",
      reqBody: { query: "email me at john.doe@example.com" },
    });
    trace.end({ status: 200, resBody: { error: "no" } });
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(output).toContain("req  ▸");
    expect(output).toContain("res  ▸");
    expect(output).toContain("[email]"); // PII redacted
    expect(output).not.toContain("john.doe@example.com");
  });

  it("reuses the incoming x-request-id as the correlation id", () => {
    process.env.NET_TRACE = "on";
    const trace = netTraceRequest({
      route: "chat",
      url: "/api/chat",
      headers: new Headers({ "x-request-id": "admin-123-abc" }),
    });
    expect(trace.id).toBe("admin-123-abc");
    trace.end({ status: 200 });
    expect(logSpy.mock.calls[0]![0]).toContain("req=admin-123-abc");
  });

  it("supports plain-object headers too", () => {
    const trace = netTraceRequest({
      route: "embed/search",
      url: "/api/embed/search",
      headers: { "x-request-id": "srv-fixed-1" },
    });
    expect(trace.id).toBe("srv-fixed-1");
  });

  it("fails are ALWAYS captured, even with NET_TRACE off", () => {
    process.env.NET_TRACE = "off";
    const trace = netTraceRequest({ route: "chat", url: "/api/chat" });
    const cause = new Error("Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443)");
    const error = new Error("fetch failed", { cause });
    trace.fail(error, { status: 502, resBody: { error: "Knowledge-base search failed." } });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("✗");
    expect(output).toContain("/api/chat → 502");
    expect(output).toContain("cause ▸");
    // The full vendor cause chain is captured for the log, never the client.
    expect(output).toContain("generativelanguage.googleapis.com");
    // No request/response bodies at level off.
    expect(output).not.toContain("Knowledge-base search failed.");
  });

  it("includes bodies and stack on fail at verbose", () => {
    process.env.NET_TRACE = "verbose";
    const trace = netTraceRequest({
      route: "chat",
      url: "/api/chat",
      reqBody: { query: "hello" },
    });
    trace.fail(new Error("boom"), { status: 500 });
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("req  ▸ {\"query\":\"hello\"}");
    expect(output).toContain("stack ▸");
  });

  it("marks slow requests", () => {
    process.env.NET_TRACE = "on";
    process.env.NET_TRACE_SLOW_MS = "0"; // every request is "slow"
    const trace = netTraceRequest({ route: "chat", url: "/api/chat" });
    trace.end({ status: 200 });
    expect(logSpy.mock.calls[0]![0]).toContain("slow");
  });

  it("truncates verbose previews to NET_TRACE_BODY_CHARS with an elide marker", () => {
    process.env.NET_TRACE = "verbose";
    process.env.NET_TRACE_BODY_CHARS = "200";
    const trace = netTraceRequest({ route: "chat", url: "/api/chat" });
    trace.end({ status: 200, resBody: { blob: "x".repeat(5000) } });
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("");
    expect(output).toContain("… (+");
    expect(output.length).toBeLessThan(600);
  });
});

describe("secret scrubbing", () => {
  it("masks credential-looking JSON keys and values in previews", () => {
    process.env.NET_TRACE = "verbose";
    const trace = netTraceRequest({
      route: "chat",
      url: "/api/chat",
      reqBody: {
        apiKey: "AIzaSyABCDE1234567890",
        Authorization: "Bearer abcdefghijk",
        nested: { token: "super-secret-value", plain: "ok" },
      },
    });
    trace.end({ status: 200 });
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("");
    expect(output).toContain("[secret]");
    expect(output).toContain("ok");
    expect(output).not.toContain("AIzaSyABCDE1234567890");
    expect(output).not.toContain("super-secret-value");
    expect(output).not.toContain("abcdefghijk");
  });

  it("survives circular payload references", () => {
    process.env.NET_TRACE = "verbose";
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const trace = netTraceRequest({ route: "chat", url: "/api/chat", reqBody: circular });
    expect(() => trace.end({ status: 200 })).not.toThrow();
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("");
    expect(output).toContain("[circular]");
  });
});

describe("netTraceError", () => {
  it("always captures with correlation fields", () => {
    process.env.NET_TRACE = "off";
    const error = new Error("429 You exceeded your quota");
    netTraceError("chat/retrieval", error, { req: "srv-x1", kb: "support_rilan" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("✗ chat/retrieval");
    expect(output).toContain('req="srv-x1"');
    expect(output).toContain('kb="support_rilan"');
    expect(output).toContain("429 You exceeded your quota");
  });

  it("keeps request correlation ids intact (PII redaction must not mask them)", () => {
    // admin-1760697800-q8w1e contains a 10-digit run that looks like a phone
    // number — masking it would break the docker-log ↔ Network-tab mapping.
    process.env.NET_TRACE = "off";
    netTraceError("chat/stream", new Error("boom"), { req: "admin-1760697800-q8w1e" });
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain('req="admin-1760697800-q8w1e"');
    expect(output).not.toContain("[phone]");
  });

  it("redacts PII inside ordinary field values", () => {
    process.env.NET_TRACE = "off";
    netTraceError("chat/retrieval", new Error("boom"), { stage: "contact john.doe@example.com" });
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[email]");
    expect(output).not.toContain("john.doe@example.com");
  });
});

describe("netTraceUpstream", () => {
  it("always captures upstream failures with the cause chain", () => {
    process.env.NET_TRACE = "off";
    netTraceUpstream({
      provider: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
      status: 429,
      durationMs: 3812,
      attempt: 2,
      of: 4,
      error: new Error("Resource has been exhausted"),
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("upstream gemini");
    expect(output).toContain("→ 429");
    expect(output).toContain("attempt 2/4");
    expect(output).toContain("Resource has been exhausted");
  });

  it("logs upstream successes only at verbose", () => {
    process.env.NET_TRACE = "on";
    netTraceUpstream({ provider: "qdrant", url: "http://qdrant:6333/collections/x/points/search", status: 200 });
    expect(logSpy).not.toHaveBeenCalled();

    process.env.NET_TRACE = "verbose";
    netTraceUpstream({ provider: "qdrant", url: "http://qdrant:6333/collections/x/points/search", status: 200 });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("extracts the HTTP status from SDK errors when status is not passed", () => {
    // OpenAI APIError and @google/genai ApiError both carry .status — the row
    // must read "→ 429" like the red status column in the devtools Network tab.
    process.env.NET_TRACE = "off";
    netTraceUpstream({
      provider: "openai",
      url: "https://api.openai.com/v1/embeddings",
      durationMs: 96,
      error: Object.assign(new Error("429 Rate limit reached for requests"), { status: 429 }),
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("→ 429");
    expect(output).toContain("429 Rate limit reached");
  });

  it("prints the request preview on verbose failures (devtools shows both sides)", () => {
    process.env.NET_TRACE = "verbose";
    netTraceUpstream({
      provider: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents",
      durationMs: 21000,
      error: Object.assign(new Error("fetch failed"), {
        cause: new Error("Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443)"),
      }),
      requestBody: ["policies document chunk 1", "policies document chunk 2"],
    });
    const output = errorSpy.mock.calls[0]![0] as string;
    expect(output).toContain("req  ▸ [\"policies document chunk 1\",\"policies document chunk 2\"]");
    expect(output).toContain("cause ▸");
    expect(output).toContain("generativelanguage.googleapis.com");
  });

  it("prints a compact response summary on verbose successes", () => {
    // The count summary makes the production batch-contract break visible
    // right in the row: 1 embedding returned for 20 requests.
    process.env.NET_TRACE = "verbose";
    netTraceUpstream({
      provider: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents",
      status: 200,
      durationMs: 1734,
      requestBody: ["chunk 1", "chunk 2"],
      responseBody: { embeddings: 1, requests: 20, dimension: 1536 },
    });
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("");
    expect(output).toContain("res  ▸ {\"embeddings\":1,\"requests\":20,\"dimension\":1536}");
  });

  it("keeps verbose success rows silent for non-verbose levels", () => {
    process.env.NET_TRACE = "on";
    netTraceUpstream({
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      status: 200,
      durationMs: 842,
      requestBody: { model: "gpt-4o-mini" },
      responseBody: { stream: "opened" },
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("netTraceChain", () => {
  it("flattens the error cause chain for classification", () => {
    const root = new Error("Connect Timeout Error (attempted address: api.openai.com:443)");
    const mid = new Error("fetch failed", { cause: root });
    const top = new Error("request failed", { cause: mid });
    expect(netTraceChain(top)).toBe(
      "Error: request failed · fetch failed · Connect Timeout Error (attempted address: api.openai.com:443)",
    );
  });

  it("stringifies non-Error values", () => {
    expect(netTraceChain("plain failure")).toBe("plain failure");
  });
});
