/**
 * src/modules/mcp/client.ts
 *
 * Bounded MCP client for the Streamable HTTP transport.
 *
 * Implements the Model Context Protocol Streamable HTTP binding:
 *   - JSON-RPC 2.0 `initialize` handshake (protocol version negotiation)
 *   - `notifications/initialized` completion notice
 *   - `tools/list` discovery
 *   - `tools/call` invocation with structured content results
 *
 * Security properties (enforced here, not optional):
 *   - HTTPS required when the global security policy demands it (default).
 *   - SSRF validation on every request target — including each redirect hop —
 *     via the shared integration egress policy (IPv4, IPv6, DNS rebinding
 *     resistant because resolution happens per request).
 *   - Redirects followed manually, bounded by policy.maxRedirects.
 *   - Bounded request timeouts from the global security policy.
 *   - No credential values are ever included in errors or logs.
 */

import { assertSafeEgressUrl } from "@/modules/integrations/runtime/runner-fetch";
import type {
  McpAuthMethod,
  McpGlobalSecurityPolicy,
} from "./entitlements";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_FALLBACKS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type McpCredentials =
  | { authType: "none" }
  | { authType: "bearer_token"; token: string }
  | { authType: "basic_auth"; username: string; password: string }
  | { authType: "api_key_header"; headerName: string; headerValue: string };

export class McpClientError extends Error {
  readonly code:
    | "ENDPOINT_BLOCKED"
    | "ENDPOINT_INVALID"
    | "HANDSHAKE_FAILED"
    | "PROTOCOL_UNSUPPORTED"
    | "DISCOVERY_FAILED"
    | "INVOCATION_FAILED"
    | "TIMEOUT"
    | "TRANSPORT_ERROR"
    | "AUTH_REJECTED";
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: McpClientError["code"],
    message: string,
    options?: { status?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = "McpClientError";
    this.code = code;
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
  }
}

function buildAuthHeaders(credentials: McpCredentials): Record<string, string> {
  switch (credentials.authType) {
    case "none":
      return {};
    case "bearer_token":
      return { Authorization: `Bearer ${credentials.token}` };
    case "basic_auth": {
      const encoded = Buffer.from(
        `${credentials.username}:${credentials.password}`,
        "utf8",
      ).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "api_key_header": {
      const name = credentials.headerName.replace(/[^A-Za-z0-9-]/g, "-");
      return { [name]: credentials.headerValue };
    }
  }
}

let nextRequestId = 1;

function jsonRpcRequest(method: string, params?: unknown): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: nextRequestId++,
    method,
    ...(params === undefined ? {} : { params }),
  });
}

function jsonRpcNotification(method: string): string {
  return JSON.stringify({ jsonrpc: "2.0", method });
}

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: number | string;
  result: unknown;
};
type JsonRpcError = {
  jsonrpc: "2.0";
  id?: number | string | null;
  error: { code: number; message: string; data?: unknown };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/** Parse an MCP HTTP response body: JSON or text/event-stream framed. */
async function parseRpcPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/event-stream")) {
    // Take the first `data:` line that parses as JSON-RPC. Multiple frames can
    // arrive (responses + notifications); the response frame carries the id.
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        return JSON.parse(payload);
      } catch {
        // Skip frames that are not JSON (comments/keepalives).
      }
    }
    throw new McpClientError(
      "TRANSPORT_ERROR",
      "MCP server returned an event stream without a usable JSON-RPC frame.",
    );
  }
  if (!text) {
    throw new McpClientError(
      "TRANSPORT_ERROR",
      "MCP server returned an empty response body.",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new McpClientError(
      "TRANSPORT_ERROR",
      "MCP server returned a non-JSON response body.",
    );
  }
}

function unwrapRpcResult(payload: unknown, failureCode: McpClientError["code"], context: string): unknown {
  if (isPlainObject(payload) && "error" in payload) {
    const error = (payload as JsonRpcError).error;
    throw new McpClientError(
      failureCode,
      `${context}: ${error?.message ?? "Unknown MCP error"} (code ${error?.code ?? "?"})`,
    );
  }
  if (isPlainObject(payload) && "result" in payload) {
    return (payload as JsonRpcSuccess).result;
  }
  throw new McpClientError(
    failureCode,
    `${context}: response was not a JSON-RPC 2.0 result.`,
  );
}

export interface McpHandshakeResult {
  protocolVersion: string;
  serverInfo: { name?: string; version?: string; title?: string };
  capabilities: Record<string, unknown>;
  sessionId: string | null;
}

export interface McpDiscoveredTool {
  name: string;
  title: string | null;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpInvocationResult {
  content: Array<Record<string, unknown>>;
  isError: boolean;
  structuredContent: Record<string, unknown> | null;
}

/** Public options shared by every operation. */
export interface McpClientOptions {
  endpointUrl: string;
  credentials: McpCredentials;
  securityPolicy: McpGlobalSecurityPolicy;
  /** Session id persisted from a previous handshake, if any. */
  sessionId?: string | null;
}

async function validatedUrl(
  rawUrl: string,
  policy: McpGlobalSecurityPolicy,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpClientError("ENDPOINT_INVALID", "The MCP endpoint URL is not valid.");
  }
  if (policy.requireHttps && url.protocol !== "https:") {
    throw new McpClientError(
      "ENDPOINT_BLOCKED",
      "MCP endpoints must use HTTPS on this deployment.",
    );
  }
  await assertSafeEgressUrl(url.toString());
  return url;
}

/**
 * Perform one bounded MCP HTTP POST, manually following redirects within the
 * policy limit and re-validating every hop against the egress policy.
 */
async function rpcPost(
  url: URL,
  body: string,
  credentials: McpCredentials,
  policy: McpGlobalSecurityPolicy,
  sessionId: string | null,
): Promise<Response> {
  let currentUrl = url;
  let hops = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...buildAuthHeaders(credentials),
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new McpClientError(
          "TIMEOUT",
          `MCP request timed out after ${policy.requestTimeoutMs}ms.`,
          { retryable: true },
        );
      }
      throw new McpClientError(
        "TRANSPORT_ERROR",
        "MCP endpoint could not be reached.",
        { retryable: true },
      );
    }
    clearTimeout(timer);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new McpClientError(
          "TRANSPORT_ERROR",
          "MCP endpoint returned a redirect without a location.",
        );
      }
      hops += 1;
      if (hops > policy.maxRedirects) {
        throw new McpClientError(
          "ENDPOINT_BLOCKED",
          `MCP endpoint redirected more than ${policy.maxRedirects} time(s); refusing to follow.`,
        );
      }
      let next: URL;
      try {
        next = new URL(location, currentUrl);
      } catch {
        throw new McpClientError(
          "TRANSPORT_ERROR",
          "MCP endpoint returned an invalid redirect location.",
        );
      }
      // Re-validate each redirect hop: destination scheme and network target.
      await validatedUrl(next.toString(), policy);
      currentUrl = next;
      continue;
    }

    return response;
  }
}

function assertHttpOk(response: Response, context: string): void {
  if (response.status === 401 || response.status === 403) {
    throw new McpClientError(
      "AUTH_REJECTED",
      `${context}: the MCP server rejected the configured credentials (HTTP ${response.status}).`,
      { status: response.status },
    );
  }
  if (response.status === 404) {
    throw new McpClientError(
      "HANDSHAKE_FAILED",
      `${context}: the MCP endpoint was not found (HTTP 404). Check the URL path.`,
      { status: 404 },
    );
  }
  if (response.status >= 500) {
    throw new McpClientError(
      "TRANSPORT_ERROR",
      `${context}: the MCP server errored (HTTP ${response.status}).`,
      { status: response.status, retryable: true },
    );
  }
  if (response.status >= 400) {
    throw new McpClientError(
      "TRANSPORT_ERROR",
      `${context}: the MCP server rejected the request (HTTP ${response.status}).`,
      { status: response.status },
    );
  }
}

/**
 * MCP Streamable HTTP handshake. Sends `initialize`, validates the negotiated
 * protocol version, and delivers the `notifications/initialized` notice.
 */
export async function mcpHandshake(
  options: McpClientOptions,
): Promise<McpHandshakeResult> {
  const url = await validatedUrl(options.endpointUrl, options.securityPolicy);

  const initResponse = await rpcPost(
    url,
    jsonRpcRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "clara-ai-platform", version: "1.0.0" },
    }),
    options.credentials,
    options.securityPolicy,
    options.sessionId ?? null,
  );
  assertHttpOk(initResponse, "MCP handshake");

  if (initResponse.status === 202) {
    // A server MAY answer notifications with 202; for initialize this is not
    // a valid completion, so treat it as a failed handshake.
    throw new McpClientError(
      "HANDSHAKE_FAILED",
      "MCP endpoint acknowledged the handshake without returning capabilities.",
    );
  }

  const payload = await parseRpcPayload(initResponse);
  const result = unwrapRpcResult(payload, "HANDSHAKE_FAILED", "MCP handshake") as Record<string, unknown>;
  if (!isPlainObject(result)) {
    throw new McpClientError(
      "HANDSHAKE_FAILED",
      "MCP handshake result was malformed.",
    );
  }

  const protocolVersion =
    typeof result.protocolVersion === "string" ? result.protocolVersion : "";
  if (
    protocolVersion !== MCP_PROTOCOL_VERSION &&
    !SUPPORTED_PROTOCOL_FALLBACKS.includes(protocolVersion)
  ) {
    throw new McpClientError(
      "PROTOCOL_UNSUPPORTED",
      `MCP server uses unsupported protocol version "${protocolVersion}".`,
    );
  }

  const sessionId = initResponse.headers.get("mcp-session-id");
  const serverInfo = isPlainObject(result.serverInfo)
    ? {
        name: typeof result.serverInfo.name === "string" ? result.serverInfo.name : undefined,
        version: typeof result.serverInfo.version === "string" ? result.serverInfo.version : undefined,
        title: typeof result.serverInfo.title === "string" ? result.serverInfo.title : undefined,
      }
    : {};

  // Complete the lifecycle with the initialized notification. 202/200 both
  // acceptable; failures here are non-fatal for discovery but surfaced.
  try {
    await rpcPost(
      url,
      jsonRpcNotification("notifications/initialized"),
      options.credentials,
      options.securityPolicy,
      sessionId,
    );
  } catch {
    // Some minimal servers close sessions after initialize; discovery will
    // surface a real failure if the server is unusable.
  }

  return {
    protocolVersion,
    serverInfo,
    capabilities: isPlainObject(result.capabilities) ? result.capabilities : {},
    sessionId,
  };
}

function normalizeTool(raw: unknown): McpDiscoveredTool | null {
  if (!isPlainObject(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 200) return null;
  const description =
    typeof raw.description === "string" ? raw.description.slice(0, 4000) : "";
  const title =
    typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null;
  const inputSchema = isPlainObject(raw.inputSchema)
    ? (raw.inputSchema as Record<string, unknown>)
    : {};
  return { name, title, description, inputSchema };
}

/** Discover tools via `tools/list` (with bounded pagination). */
export async function mcpDiscoverTools(
  options: McpClientOptions,
): Promise<McpDiscoveredTool[]> {
  const url = await validatedUrl(options.endpointUrl, options.securityPolicy);
  const tools: McpDiscoveredTool[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 50; page += 1) {
    const response = await rpcPost(
      url,
      jsonRpcRequest(
        "tools/list",
        cursor ? { cursor } : {},
      ),
      options.credentials,
      options.securityPolicy,
      options.sessionId ?? null,
    );
    assertHttpOk(response, "MCP tool discovery");
    if (response.status === 202) {
      throw new McpClientError(
        "DISCOVERY_FAILED",
        "MCP server acknowledged tool discovery without returning tools.",
      );
    }
    const payload = await parseRpcPayload(response);
    const result = unwrapRpcResult(payload, "DISCOVERY_FAILED", "MCP tool discovery") as Record<string, unknown>;
    const rawTools = Array.isArray(result.tools) ? result.tools : [];
    for (const raw of rawTools) {
      const tool = normalizeTool(raw);
      if (tool) tools.push(tool);
      if (tools.length >= 500) break; // hard client-side ceiling
    }
    const nextCursor =
      typeof result.nextCursor === "string" && result.nextCursor
        ? result.nextCursor
        : undefined;
    if (!nextCursor || tools.length >= 500) break;
    cursor = nextCursor;
  }

  return tools;
}

/** Invoke a tool via `tools/call`. */
export async function mcpInvokeTool(
  options: McpClientOptions,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpInvocationResult> {
  const url = await validatedUrl(options.endpointUrl, options.securityPolicy);
  const response = await rpcPost(
    url,
    jsonRpcRequest("tools/call", { name: toolName, arguments: args }),
    options.credentials,
    options.securityPolicy,
    options.sessionId ?? null,
  );
  assertHttpOk(response, "MCP tool invocation");
  if (response.status === 202) {
    throw new McpClientError(
      "INVOCATION_FAILED",
      "MCP server acknowledged the tool call without a result.",
    );
  }
  const payload = await parseRpcPayload(response);
  const result = unwrapRpcResult(payload, "INVOCATION_FAILED", "MCP tool invocation") as Record<string, unknown>;
  if (!isPlainObject(result)) {
    throw new McpClientError(
      "INVOCATION_FAILED",
      "MCP tool invocation result was malformed.",
    );
  }
  return {
    content: Array.isArray(result.content)
      ? (result.content.filter(isPlainObject) as Array<Record<string, unknown>>)
      : [],
    isError: result.isError === true,
    structuredContent: isPlainObject(result.structuredContent)
      ? (result.structuredContent as Record<string, unknown>)
      : null,
  };
}

/**
 * Parse stored encrypted-credential JSON back into the discriminated union.
 * Never returns secret values in errors.
 */
export function parseCredentials(
  authType: string,
  raw: unknown,
): { ok: true; credentials: McpCredentials } | { ok: false; error: string } {
  const data = isPlainObject(raw) ? raw : {};
  switch (authType) {
    case "none":
      return { ok: true, credentials: { authType: "none" } };
    case "bearer_token": {
      const token = typeof data.token === "string" ? data.token : "";
      if (!token) return { ok: false, error: "Bearer token credentials are incomplete." };
      return { ok: true, credentials: { authType: "bearer_token", token } };
    }
    case "basic_auth": {
      const username = typeof data.username === "string" ? data.username : "";
      const password = typeof data.password === "string" ? data.password : "";
      if (!username || !password) {
        return { ok: false, error: "Basic authentication credentials are incomplete." };
      }
      return {
        ok: true,
        credentials: { authType: "basic_auth", username, password },
      };
    }
    case "api_key_header": {
      const headerName =
        typeof data.headerName === "string" ? data.headerName.trim() : "";
      const headerValue =
        typeof data.headerValue === "string" ? data.headerValue : "";
      if (!headerName || !headerValue) {
        return { ok: false, error: "API-key header credentials are incomplete." };
      }
      return {
        ok: true,
        credentials: { authType: "api_key_header", headerName, headerValue },
      };
    }
    default:
      return { ok: false, error: `Unsupported MCP auth type "${authType}".` };
  }
}

/** Credential field descriptors for UI forms (only implemented methods). */
export const MCP_AUTH_METHOD_FIELDS: Record<
  Exclude<McpAuthMethod, "none">,
  Array<{ name: string; label: string; secret: boolean; required: boolean; hint?: string }>
> = {
  bearer_token: [
    {
      name: "token",
      label: "Bearer token",
      secret: true,
      required: true,
      hint: "Sent as an Authorization: Bearer header. Encrypted at rest.",
    },
  ],
  basic_auth: [
    { name: "username", label: "Username", secret: false, required: true },
    { name: "password", label: "Password", secret: true, required: true, hint: "Encrypted at rest." },
  ],
  api_key_header: [
    {
      name: "headerName",
      label: "Header name",
      secret: false,
      required: true,
      hint: "Example: X-API-Key",
    },
    {
      name: "headerValue",
      label: "Header value",
      secret: true,
      required: true,
      hint: "Encrypted at rest.",
    },
  ],
};