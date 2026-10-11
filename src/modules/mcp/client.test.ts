import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Egress policy is exercised by its own suite; here we stub it so client
// behaviour tests run without live DNS.
vi.mock("@/modules/integrations/runtime/runner-fetch", () => ({
  assertSafeEgressUrl: async (url: string) => {
    if (url.includes("blocked.example")) {
      throw Object.assign(new Error("blocked"), { code: "EGRESS_BLOCKED" });
    }
  },
}));

import {
  McpClientError,
  MCP_PROTOCOL_VERSION,
  mcpDiscoverTools,
  mcpHandshake,
  mcpInvokeTool,
  parseCredentials,
} from "./client";

const POLICY = {
  requireHttps: true,
  blockPrivateNetworks: true,
  maxRedirects: 0,
  requestTimeoutMs: 5_000,
  tlsVerify: true as const,
};

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sseResponse(body: unknown, headers: Record<string, string> = {}) {
  const frames = Array.isArray(body) ? body : [body];
  const text = frames
    .map((frame) => `event: message\ndata: ${JSON.stringify(frame)}\n\n`)
    .join("");
  return new Response(text, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

let idCounter = 0;
function rpcResult(result: unknown) {
  return { jsonrpc: "2.0", id: ++idCounter, result };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENDPOINT = "https://mcp.example.com/mcp";
const NO_AUTH = { authType: "none" as const };

describe("mcpHandshake — Streamable HTTP initialize lifecycle", () => {
  it("negotiates the protocol and captures server info", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "acme-tools", version: "1.2.3" },
        }),
        { "mcp-session-id": "sess-1" },
      ),
    );
    // notifications/initialized may be answered 202
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    const result = await mcpHandshake({
      endpointUrl: ENDPOINT,
      credentials: NO_AUTH,
      securityPolicy: POLICY,
    });

    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.serverInfo.name).toBe("acme-tools");
    expect(result.sessionId).toBe("sess-1");

    const initCall = fetchMock.mock.calls[0];
    const body = JSON.parse(String(initCall[1]?.body));
    expect(body.method).toBe("initialize");
    expect(body.params.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(initCall[1]?.headers.accept).toBe("application/json, text/event-stream");
  });

  it("parses SSE-framed handshake responses", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        rpcResult({
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          serverInfo: { name: "sse-server" },
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    const result = await mcpHandshake({
      endpointUrl: ENDPOINT,
      credentials: NO_AUTH,
      securityPolicy: POLICY,
    });
    expect(result.serverInfo.name).toBe("sse-server");
  });

  it("rejects unsupported protocol versions", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({
          protocolVersion: "1999-01-01",
          capabilities: {},
          serverInfo: {},
        }),
      ),
    );
    await expect(
      mcpHandshake({ endpointUrl: ENDPOINT, credentials: NO_AUTH, securityPolicy: POLICY }),
    ).rejects.toMatchObject({ code: "PROTOCOL_UNSUPPORTED" });
  });

  it("surfaces JSON-RPC errors as handshake failures", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "method not found" },
      }),
    );
    await expect(
      mcpHandshake({ endpointUrl: ENDPOINT, credentials: NO_AUTH, securityPolicy: POLICY }),
    ).rejects.toMatchObject({ code: "HANDSHAKE_FAILED" });
  });

  it("rejects non-HTTPS endpoints when policy requires HTTPS", async () => {
    await expect(
      mcpHandshake({
        endpointUrl: "http://mcp.example.com/mcp",
        credentials: NO_AUTH,
        securityPolicy: POLICY,
      }),
    ).rejects.toMatchObject({ code: "ENDPOINT_BLOCKED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks egress-rejected destinations before any request", async () => {
    await expect(
      mcpHandshake({
        endpointUrl: "https://blocked.example/mcp",
        credentials: NO_AUTH,
        securityPolicy: POLICY,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses redirect responses under a zero-redirect policy", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://mcp.example.com/v2" } }),
    );
    await expect(
      mcpHandshake({ endpointUrl: ENDPOINT, credentials: NO_AUTH, securityPolicy: POLICY }),
    ).rejects.toMatchObject({ code: "ENDPOINT_BLOCKED" });
  });

  it("maps 401/403 to typed credential rejection", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await expect(
      mcpHandshake({ endpointUrl: ENDPOINT, credentials: NO_AUTH, securityPolicy: POLICY }),
    ).rejects.toMatchObject({ code: "AUTH_REJECTED" });
  });

  it("classifies 5xx as retryable transport errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 503 }));
    const rejection = mcpHandshake({
      endpointUrl: ENDPOINT,
      credentials: NO_AUTH,
      securityPolicy: POLICY,
    });
    await expect(rejection).rejects.toMatchObject({ code: "TRANSPORT_ERROR", retryable: true });
  });
});

describe("mcpDiscoverTools — tools/list", () => {
  it("lists tools with normalized metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({
          tools: [
            {
              name: "search_docs",
              title: "Search documentation",
              description: "Full-text search",
              inputSchema: { type: "object", properties: { q: { type: "string" } } },
            },
            { name: "", description: "invalid — dropped" },
            "not-an-object",
          ],
        }),
      ),
    );
    const tools = await mcpDiscoverTools({
      endpointUrl: ENDPOINT,
      credentials: NO_AUTH,
      securityPolicy: POLICY,
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: "search_docs", title: "Search documentation" });
  });

  it("follows pagination cursors until exhaustion", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(rpcResult({ tools: [{ name: "a" }], nextCursor: "page-2" })),
      )
      .mockResolvedValueOnce(
        jsonResponse(rpcResult({ tools: [{ name: "b" }], nextCursor: undefined })),
      );
    const tools = await mcpDiscoverTools({
      endpointUrl: ENDPOINT,
      credentials: NO_AUTH,
      securityPolicy: POLICY,
    });
    expect(tools.map((t) => t.name)).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(secondCall.params).toEqual({ cursor: "page-2" });
  });

  it("stops at the client-side hard ceiling of 500 tools", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        rpcResult({
          tools: Array.from({ length: 300 }, (_, i) => ({ name: `tool_${i}` })),
          nextCursor: "more",
        }),
      ),
    );
    const tools = await mcpDiscoverTools({
      endpointUrl: ENDPOINT,
      credentials: NO_AUTH,
      securityPolicy: POLICY,
    });
    expect(tools.length).toBe(500);
  });
});

describe("mcpInvokeTool — tools/call", () => {
  it("returns content and structured results", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({
          content: [{ type: "text", text: "42" }],
          structuredContent: { answer: 42 },
        }),
      ),
    );
    const result = await mcpInvokeTool(
      { endpointUrl: ENDPOINT, credentials: NO_AUTH, securityPolicy: POLICY },
      "calculator",
      { expression: "6*7" },
    );
    expect(result.content).toEqual([{ type: "text", text: "42" }]);
    expect(result.structuredContent).toEqual({ answer: 42 });
    expect(result.isError).toBe(false);

    const call = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(call.method).toBe("tools/call");
    expect(call.params).toEqual({ name: "calculator", arguments: { expression: "6*7" } });
  });

  it("marks isError results without throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({
          content: [{ type: "text", text: "division by zero" }],
          isError: true,
        }),
      ),
    );
    const result = await mcpInvokeTool(
      { endpointUrl: ENDPOINT, credentials: NO_AUTH, securityPolicy: POLICY },
      "calculator",
      { expression: "1/0" },
    );
    expect(result.isError).toBe(true);
  });
});

describe("authentication header construction", () => {
  it("bearer token sends an Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, serverInfo: {} }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await mcpHandshake({
      endpointUrl: ENDPOINT,
      credentials: { authType: "bearer_token", token: "secret-token" },
      securityPolicy: POLICY,
    });
    expect(fetchMock.mock.calls[0][1]?.headers.Authorization).toBe("Bearer secret-token");
  });

  it("basic auth sends base64-encoded credentials", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, serverInfo: {} }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await mcpHandshake({
      endpointUrl: ENDPOINT,
      credentials: { authType: "basic_auth", username: "user", password: "pass" },
      securityPolicy: POLICY,
    });
    const expected = Buffer.from("user:pass").toString("base64");
    expect(fetchMock.mock.calls[0][1]?.headers.Authorization).toBe(`Basic ${expected}`);
  });

  it("api-key headers sanitize the header name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        rpcResult({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, serverInfo: {} }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await mcpHandshake({
      endpointUrl: ENDPOINT,
      credentials: {
        authType: "api_key_header",
        headerName: "X-API Key;Invalid",
        headerValue: "value",
      },
      securityPolicy: POLICY,
    });
    expect(fetchMock.mock.calls[0][1]?.headers["X-API-Key-Invalid"]).toBe("value");
  });
});

describe("parseCredentials — stored credential projection", () => {
  it("validates completeness per method without echoing secrets", () => {
    expect(parseCredentials("none", {})).toMatchObject({ ok: true });
    expect(parseCredentials("bearer_token", { token: "t" }).ok).toBe(true);
    expect(parseCredentials("bearer_token", {}).ok).toBe(false);
    expect(parseCredentials("basic_auth", { username: "u" }).ok).toBe(false);
    expect(parseCredentials("api_key_header", { headerName: "X-K" }).ok).toBe(false);
    expect(parseCredentials("oauth2", {}).ok).toBe(false);
  });
});

describe("McpClientError — typed surface", () => {
  it("carries code, status and retryability", () => {
    const err = new McpClientError("TIMEOUT", "timed out", { retryable: true });
    expect(err.code).toBe("TIMEOUT");
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("McpClientError");
  });
});
