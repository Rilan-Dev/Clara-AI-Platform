/**
 * Hardened outbound HTTP transport shared by the MCP Streamable HTTP resolver
 * and the MCP OAuth client.
 *
 * Security posture (identical to the runtime resolver's transport):
 *  - HTTPS only, TLS certificate verification always on
 *  - DNS is re-resolved for every request and every answer is checked against
 *    the private / reserved range blocklist before a socket is opened
 *  - the socket's DNS lookup is pinned to the validated address, so a racing
 *    DNS answer cannot redirect the connection
 *  - redirects are never followed
 *  - request size, response size and wall-clock time are bounded
 *
 * Extracted from mcp-streamable-http-resolver.ts so the OAuth machinery can
 * reuse the same guards without an import cycle.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import type { LookupFunction } from "node:net";

export const MCP_REQUEST_TIMEOUT_MS = 8_000;
export const MCP_MAX_RESPONSE_BYTES = 1_048_576;
export const MCP_MAX_REQUEST_BYTES = 65_536;

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
    if (!/^[23][0-9a-f]{3}:/.test(normalized)) return false;
    if (/^2001:db8:/i.test(normalized) || /^2001:0000:/i.test(normalized) || /^2001:2:/i.test(normalized) || /^2001:10:/i.test(normalized) || /^2001:20:/i.test(normalized) || /^2002:/i.test(normalized) || /^3fff:/i.test(normalized)) return false;
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

export type McpResolvedAddress = { address: string; family: number };
export type McpTransportDependencies = {
  resolveAddresses?: (hostname: string) => Promise<McpResolvedAddress[]>;
  request?: typeof https.request;
};

async function checkedAddresses(hostname: string, resolve: (hostname: string) => Promise<McpResolvedAddress[]>): Promise<McpResolvedAddress[]> {
  const addresses = await resolve(hostname);
  if (!addresses.length || addresses.some((entry) => !isMcpPublicIpAddress(entry.address))) {
    throw new Error("MCP endpoint DNS resolved to a non-public address.");
  }
  return addresses;
}

async function checkedAddressesWithDeadline(hostname: string, timeoutMs: number, signal: AbortSignal | undefined, resolve: (hostname: string) => Promise<McpResolvedAddress[]>): Promise<McpResolvedAddress[]> {
  if (signal?.aborted) throw new Error("MCP request cancelled.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancelled = signal
    ? new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error("MCP request cancelled."));
        signal.addEventListener("abort", onAbort, { once: true });
      })
    : new Promise<never>(() => {});
  try {
    return await Promise.race([
      checkedAddresses(hostname, resolve),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("MCP DNS lookup timed out.")), timeoutMs);
      }),
      cancelled,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

export type McpHttpRequestInit = {
  method?: "GET" | "POST";
  body?: string | null;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type McpHttpResponse = { status: number; headers: IncomingHttpHeaders; body: string };

/** One outbound HTTPS request with the full guard set described above. */
export async function mcpHttpRequest(url: URL, init: McpHttpRequestInit = {}, dependencies: McpTransportDependencies = {}): Promise<McpHttpResponse> {
  const method = init.method ?? "POST";
  const body = init.body ?? null;
  const timeoutMs = init.timeoutMs ?? MCP_REQUEST_TIMEOUT_MS;
  const headers = init.headers ?? {};
  if (body !== null && Buffer.byteLength(body, "utf8") > MCP_MAX_REQUEST_BYTES) throw new Error("MCP request exceeded the size limit.");
  const signal = init.signal;
  if (signal?.aborted) throw new Error("MCP request cancelled.");
  let addresses: Array<{ address: string; family: number }>;
  const resolveAddresses = dependencies.resolveAddresses ?? (async (hostname: string) => lookup(hostname, { all: true, verbatim: true }));
  try { addresses = await checkedAddressesWithDeadline(url.hostname, timeoutMs, signal, resolveAddresses); } catch (error) {
    if (error instanceof Error && /timed out|cancelled/i.test(error.message)) throw error;
    throw new Error("MCP endpoint DNS validation failed.");
  }
  if (signal?.aborted) throw new Error("MCP request cancelled.");
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
  const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: true, lookup: pinnedLookup });
  const request = dependencies.request ?? https.request;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method,
      headers,
      rejectUnauthorized: true,
      agent,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        res.resume(); reject(new Error("MCP redirects are not allowed.")); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MCP_MAX_RESPONSE_BYTES) { req.destroy(new Error("MCP response exceeded the size limit.")); return; }
        chunks.push(bytes);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    const timer = setTimeout(() => req.destroy(new Error("MCP request timed out.")), timeoutMs);
    const onAbort = () => req.destroy(new Error("MCP request cancelled."));
    req.on("error", (error) => reject(error));
    req.on("close", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      agent.destroy();
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (body !== null) req.end(body);
    else req.end();
  });
}
