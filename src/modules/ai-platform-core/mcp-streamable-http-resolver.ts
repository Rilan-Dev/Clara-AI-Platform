/**
 * Clara-owned MCP Streamable HTTP resolver.
 *
 * Security posture: server-side only; platform-approved HTTPS endpoints; DNS
 * is re-resolved and every answer is checked before each outbound request;
 * the request pins its socket lookup to a checked address; redirects are never
 * followed; credentials are decrypted only in-process and never logged or
 * returned; discovery and invocation both re-check tenant/agent/plan grants.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import type { LookupFunction } from "node:dns";
import { z } from "zod";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import type { PlatformExecutionContext, SurfaceKind } from "./contracts";
import type { McpToolDescriptor, McpToolResolutionRequest, McpToolResolver } from "./mcp-tool-bridge";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_REQUEST_BYTES = 65_536;
const MAX_TOOLS = 128;
const PROTOCOL_VERSION = "2025-03-26";
const SURFACES: readonly SurfaceKind[] = ["chat", "realtime"];

type JsonObject = Record<string, unknown>;
type ServerAccess = {
  id: string; endpoint_url: string; auth_mode: "none" | "bearer";
  allowed_plans: unknown; tool_name: string; allowed_surfaces: unknown;
  bearer_token: string | null;
};

function inV4Range(ip: string, base: string, bits: number): boolean {
  const toInt = (value: string) => value.split(".").reduce((n, octet) => (n * 256) + Number(octet), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

export function isMcpPublicIpAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const blocked: Array<[string, number]> = [
      ["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],
      ["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],
      ["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],
      ["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4],
    ];
    return !blocked.some(([base,bits]) => inV4Range(ip,base,bits));
  }
  if (family === 6) {
    const normalized = ip.toLowerCase().split("%")[0]!;
    // Only global-unicast 2000::/3 is accepted. This excludes unspecified,
    // loopback, ULA, link-local, multicast, IPv4-mapped and documentation IPs.
    if (!/^2[0-9a-f]{3}:/.test(normalized)) return false;
    if (/^2001:db8:/i.test(normalized)) return false;
    return true;
  }
  return false;
}

export function validateMcpEndpoint(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("MCP endpoint is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
      !url.hostname || url.hostname.endsWith(".localhost") || url.hostname === "localhost" ||
      url.hostname.endsWith(".local") || url.hostname.endsWith(".internal") ||
      url.hostname.endsWith(".test") || url.hostname.endsWith(".invalid") ||
      url.hostname.endsWith(".example") || url.hostname === "metadata.google.internal") {
    throw new Error("MCP endpoint is not an allowed HTTPS URL.");
  }
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new Error("MCP endpoint must use a DNS hostname, not an IP literal.");
  }
  return url;
}

async function checkedAddresses(hostname: string): Promise<Array<{ address: string; family: number }>> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isMcpPublicIpAddress(entry.address))) {
    throw new Error("MCP endpoint DNS resolved to a non-public address.");
  }
  return addresses;
}

function requestOnce(url: URL, body: string, headers: Record<string,string>, signal?: AbortSignal): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise(async (resolve, reject) => {
    let addresses: Array<{ address: string; family: number }>;
    try { addresses = await checkedAddresses(url.hostname); } catch { reject(new Error("MCP endpoint DNS validation failed.")); return; }
    if (signal?.aborted) { reject(new Error("MCP request cancelled.")); return; }
    const pinned = addresses[0]!;
    const pinnedLookup = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
      if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
        callback(new Error("Unexpected DNS lookup hostname."));
        return;
      }
      const opts = options as { all?: boolean } | number | undefined;
      if (typeof opts === "object" && opts?.all) callback(null, addresses);
      else callback(null, pinned.address, pinned.family);
    }) as unknown as LookupFunction;
    const req = https.request(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL_VERSION, ...headers },
      rejectUnauthorized: true,
      agent: new https.Agent({ keepAlive: false, rejectUnauthorized: true, lookup: pinnedLookup }),
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        res.resume(); reject(new Error("MCP redirects are not allowed.")); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_RESPONSE_BYTES) { req.destroy(new Error("MCP response exceeded the size limit.")); return; }
        chunks.push(bytes);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    const timer = setTimeout(() => req.destroy(new Error("MCP request timed out.")), REQUEST_TIMEOUT_MS);
    req.on("error", (error) => reject(error));
    req.on("close", () => clearTimeout(timer));
    signal?.addEventListener("abort", () => req.destroy(new Error("MCP request cancelled.")), { once: true });
    if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) { req.destroy(new Error("MCP request exceeded the size limit.")); return; }
    req.end(body);
  });
}

function decodeRpc(body: string): JsonObject {
  let parsed: unknown;
  try {
    if (body.trimStart().startsWith("data:")) {
      const data = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean).join("\n");
      parsed = JSON.parse(data);
    } else parsed = JSON.parse(body);
  } catch { throw new Error("MCP server returned an invalid JSON-RPC response."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("MCP server returned an invalid JSON-RPC response.");
  const result = parsed as JsonObject;
  if (result.error) throw new Error("MCP server reported a tool protocol error.");
  if (!("result" in result)) throw new Error("MCP server response did not contain a result.");
  return result.result as JsonObject;
}

function jsonRpcId(): string {
  return `clara-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

async function postRpc(url: URL, method: string, params: JsonObject, sessionId?: string, signal?: AbortSignal, extraHeaders: Record<string,string> = {}): Promise<{ result: JsonObject; sessionId?: string }> {
  const id = jsonRpcId();
  const headers: Record<string,string> = { ...extraHeaders };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await requestOnce(url, JSON.stringify({ jsonrpc:"2.0", id, method, params }), headers, signal);
  if (response.status < 200 || response.status >= 300) throw new Error(`MCP endpoint returned HTTP ${response.status}.`);
  const result = decodeRpc(response.body);
  const newSession = response.headers["mcp-session-id"];
  return { result, ...(typeof newSession === "string" ? { sessionId: newSession } : {}) };
}

async function listRemoteTools(url: URL, token: string | null, signal?: AbortSignal): Promise<{ tools: JsonObject[]; sessionId?: string; auth: Record<string,string> }> {
  // Authentication must be present on initialize too; keep one shared path.
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  const initId = jsonRpcId();
  const initResponse = await requestOnce(url, JSON.stringify({ jsonrpc:"2.0", id:initId, method:"initialize", params:{ protocolVersion:PROTOCOL_VERSION, capabilities:{}, clientInfo:{ name:"clara-ai-platform", version:"1.0.0" } } }), auth, signal);
  if (initResponse.status < 200 || initResponse.status >= 300) throw new Error(`MCP endpoint returned HTTP ${initResponse.status}.`);
  const init = decodeRpc(initResponse.body);
  const sessionId = typeof initResponse.headers["mcp-session-id"] === "string" ? initResponse.headers["mcp-session-id"] as string : undefined;
  const notify = await requestOnce(url, JSON.stringify({ jsonrpc:"2.0", method:"notifications/initialized" }), { ...auth, ...(sessionId ? { "mcp-session-id":sessionId } : {}) }, signal);
  if (notify.status >= 300 && notify.status < 400) throw new Error("MCP redirects are not allowed.");
  const listed = await postRpc(url, "tools/list", {}, sessionId, signal, auth);
  const tools = listed.result.tools;
  if (!Array.isArray(tools) || tools.length > MAX_TOOLS || tools.some((tool) => !tool || typeof tool !== "object" || Array.isArray(tool))) {
    throw new Error("MCP server returned an invalid tools list.");
  }
  const effectiveSessionId = listed.sessionId ?? sessionId;
  return { tools: tools as JsonObject[], ...(effectiveSessionId ? { sessionId: effectiveSessionId } : {}), auth };
}

function toZodSchema(raw: unknown, depth = 0): z.ZodType<unknown> {
  if (depth > 8 || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Unsupported MCP input schema.");
  const schema = raw as JsonObject;
  if (schema.type === "string") {
    let value: z.ZodType<unknown> = z.string();
    if (typeof schema.minLength === "number") value = (value as z.ZodString).min(Math.max(0, Math.min(4096, schema.minLength)));
    if (typeof schema.maxLength === "number") value = (value as z.ZodString).max(Math.max(0, Math.min(4096, schema.maxLength)));
    if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.length <= 100 && schema.enum.every((v) => typeof v === "string")) {
      value = z.enum(schema.enum as [string,...string[]]);
    }
    return value;
  }
  if (schema.type === "number" || schema.type === "integer") return schema.type === "integer" ? z.number().int() : z.number().finite();
  if (schema.type === "boolean") return z.boolean();
  if (schema.type === "array") {
    if (typeof schema.maxItems === "number" && schema.maxItems > 256) throw new Error("Unsupported MCP array bound.");
    return z.array(toZodSchema(schema.items, depth + 1)).max(typeof schema.maxItems === "number" ? Math.max(0,schema.maxItems) : 256);
  }
  if (schema.type === "object" || schema.type === undefined) {
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties as JsonObject : {};
    const keys = Object.keys(properties);
    if (keys.length > 64 || keys.some((key) => !/^[a-zA-Z0-9_.:-]{1,128}$/.test(key))) throw new Error("Unsupported MCP object schema.");
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === "string") : []);
    if ([...required].some((key) => !(key in properties))) throw new Error("Invalid MCP required schema.");
    const shape: Record<string,z.ZodTypeAny> = {};
    for (const key of keys) {
      const child = toZodSchema(properties[key], depth + 1) as z.ZodTypeAny;
      shape[key] = required.has(key) ? child : child.optional();
    }
    return z.object(shape).strict();
  }
  throw new Error("Unsupported MCP input schema.");
}

function readTool(raw: JsonObject, serverId: string, approvedSurfaces: readonly SurfaceKind[]): McpToolDescriptor | null {
  if (typeof raw.name !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(raw.name) ||
      typeof raw.description === "string" && raw.description.length > 4000) return null;
  const description = typeof raw.description === "string" ? raw.description : `MCP tool ${raw.name}`;
  try {
    const inputSchema = toZodSchema(raw.inputSchema ?? { type:"object", properties:{} });
    return Object.freeze({ serverId, name:raw.name, description, inputSchema, allowedSurfaces:Object.freeze([...approvedSurfaces]) });
  } catch { return null; }
}

async function getAuthorizedServer(context: PlatformExecutionContext, serverId: string, toolName?: string): Promise<ServerAccess | null> {
  if (!process.env.ENABLE_MCP || !["1","true","yes","on"].includes(process.env.ENABLE_MCP.trim().toLowerCase())) return null;
  if (!SURFACES.includes(context.surface) || !context.userId || !context.agentId || !context.tenantId || !context.kbId) return null;
  let plan: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
  try { plan = await resolveOrgPlanLimits(context.tenantId); } catch { return null; }
  const rows = await query<ServerAccess>(
    `SELECT s.id, s.endpoint_url, s.auth_mode, s.allowed_plans, t.tool_name,
            t.allowed_surfaces, NULLIF((pgp_sym_decrypt(c.credentials_encrypted, $5)::jsonb)->>'bearerToken', '') AS bearer_token
       FROM platform_mcp_servers s
       JOIN platform_mcp_tools t ON t.server_id=s.id AND t.approved=true
       JOIN organisation_mcp_connections c ON c.server_id=s.id AND c.org_id=$1 AND c.status='configured'
       JOIN organisation_mcp_tool_grants g ON g.org_id=$1 AND g.server_id=s.id AND g.tool_name=t.tool_name AND g.enabled=true
       JOIN agent_mcp_tool_grants ag ON ag.org_id=$1 AND ag.server_id=s.id AND ag.tool_name=t.tool_name AND ag.agent_id=$2::uuid AND ag.enabled=true
       JOIN agents a ON a.id=ag.agent_id AND a.org_id=$1
       JOIN knowledge_bases kb ON kb.id=$3 AND kb.agent_id=a.id
      WHERE s.id=$4::uuid AND s.platform_enabled=true
        AND (s.allowed_plans @> to_jsonb($6::text) OR s.allowed_plans @> '["*"]'::jsonb)
        AND ($7::text IS NULL OR t.tool_name=$7)
      LIMIT 1`,
    [context.tenantId,context.agentId,context.kbId,serverId,ENCRYPTION_KEY,plan.plan_id,toolName ?? null],
  );
  const row = rows[0];
  if (!row || !Array.isArray(row.allowed_plans) || !(row.allowed_plans.includes(plan.plan_id) || row.allowed_plans.includes("*"))) return null;
  if (row.auth_mode === "bearer" && !row.bearer_token) return null;
  if (row.auth_mode === "none") row.bearer_token = null;
  return row;
}

export class StreamableHttpMcpToolResolver implements McpToolResolver {
  async resolve(request: McpToolResolutionRequest): Promise<McpToolDescriptor | null> {
    try {
      const access = await getAuthorizedServer(request.context, request.serverId, request.toolName);
      if (!access) return null;
      const endpoint = validateMcpEndpoint(access.endpoint_url);
      const remote = await listRemoteTools(endpoint, access.bearer_token);
      const approved = Array.isArray(access.allowed_surfaces) ? access.allowed_surfaces.filter((surface): surface is SurfaceKind => SURFACES.includes(surface as SurfaceKind)) : [];
      if (!approved.length) return null;
      const tool = remote.tools.find((candidate) => candidate.name === request.toolName);
      if (!tool) return null;
      return readTool(tool, access.id, approved);
    } catch {
      return null;
    }
  }

  async invoke(descriptor: McpToolDescriptor, input: unknown, context: PlatformExecutionContext): Promise<unknown> {
    try {
      const access = await getAuthorizedServer(context, descriptor.serverId, descriptor.name);
      if (!access) throw new Error("MCP access is no longer authorized.");
      const endpoint = validateEndpoint(access.endpoint_url);
      const remote = await listRemoteTools(endpoint, access.bearer_token);
      const surfaces = Array.isArray(access.allowed_surfaces) ? access.allowed_surfaces.filter((surface): surface is SurfaceKind => SURFACES.includes(surface as SurfaceKind)) : [];
      if (!surfaces.includes(context.surface) || !remote.tools.some((tool) => tool.name === descriptor.name)) throw new Error("MCP tool grant or discovery is stale.");
      const parsed = descriptor.inputSchema.safeParse(input);
      if (!parsed.success) throw new Error("MCP tool arguments did not match the approved schema.");
      const sessionId = remote.sessionId;
      const id = jsonRpcId();
      const response = await requestOnce(endpoint, JSON.stringify({ jsonrpc:"2.0", id, method:"tools/call", params:{ name:descriptor.name, arguments:parsed.data } }), { ...remote.auth, ...(sessionId ? { "mcp-session-id":sessionId } : {}) });
      if (response.status < 200 || response.status >= 300) throw new Error(`MCP endpoint returned HTTP ${response.status}.`);
      const result = decodeRpc(response.body);
      // Bound upstream data to a JSON-compatible response and avoid leaking
      // headers, credentials or raw transport diagnostics to the model.
      const serialized = JSON.stringify(result);
      if (serialized.length > MAX_RESPONSE_BYTES) throw new Error("MCP tool result exceeded the size limit.");
      return result;
    } catch (error) {
      console.warn("[MCP] tool invocation failed", { code: error instanceof Error && /timed out/i.test(error.message) ? "MCP_TIMEOUT" : "MCP_INVOKE_FAILED", serverId:descriptor.serverId, toolName:descriptor.name });
      throw new Error("MCP tool invocation failed safely. Check the server connection and approved tool configuration.");
    }
  }
}

export const streamableHttpMcpToolResolver = new StreamableHttpMcpToolResolver();
