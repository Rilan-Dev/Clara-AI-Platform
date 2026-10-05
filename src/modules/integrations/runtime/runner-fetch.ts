import { AsyncLocalStorage } from "node:async_hooks";
import { promises as dns } from "node:dns";
import { BlockList, isIP } from "node:net";
import type { XrayCallHandle } from "./xray.js";

// ─── Per-call fetch isolation via AsyncLocalStorage ─────

export interface FetchContext {
  tracedFetch: typeof globalThis.fetch;
  xrayHandle: XrayCallHandle | null;
  supabaseApiKey: string | null;
}

export const fetchCtx = new AsyncLocalStorage<FetchContext>();

// One-time global fetch patch
const _originalFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ctx = fetchCtx.getStore();
  if (ctx) {
    if (ctx.supabaseApiKey) {
      const headers = new Headers(init?.headers);
      if (!headers.has("apikey")) {
        headers.set("apikey", ctx.supabaseApiKey);
      }
      return ctx.tracedFetch(input, { ...init, headers });
    }
    return ctx.tracedFetch(input, init);
  }
  return _originalFetch(input, init);
} as typeof globalThis.fetch;

// ─── HTTP Trace Types ───────────────────────────────────

export interface HttpTraceEntry {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  durationMs: number;
  responseBody: string | null;
  error?: string;
}

/** Headers whose values should be redacted in traces */
const REDACTED_HEADERS = new Set([
  "authorization", "x-api-key", "cookie", "set-cookie",
  "x-access-token", "x-refresh-token", "proxy-authorization",
  "apikey", "x-client-secret", "client-secret", "x-auth-token",
]);

const MAX_TRACE_BODY_CHARS = 2048;
const SENSITIVE_KEY = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|passwd|credential|private[_-]?key|session|cookie|jwt|token)/i;

const PRIVATE_EGRESS = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  PRIVATE_EGRESS.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
] as const) {
  PRIVATE_EGRESS.addSubnet(network, prefix, "ipv6");
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE_EGRESS.check(address, "ipv4");
  if (family === 6) return PRIVATE_EGRESS.check(address, "ipv6");
  return true;
}

/**
 * Host-owned outbound policy for integration actions.
 * Public internet destinations are allowed; loopback, link-local, private,
 * documentation, multicast, carrier-grade NAT and other non-public ranges fail closed.
 * DNS names are resolved before egress so a hostname that resolves into a blocked
 * range cannot be used to reach an internal service through the integration runner.
 */
export async function assertSafeEgressUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Integration egress URL is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Integration egress protocol is not allowed");
  }
  if (url.username || url.password) {
    throw new Error("Integration egress URL cannot contain credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error("Integration egress destination is not allowed");
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Integration egress hostname could not be resolved");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("Integration egress destination is not allowed");
  }
}

export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, "[REDACTED]");
    }
    return u.toString();
  } catch { return rawUrl; }
}

export function redactText(value: string | null): string | null {
  if (value == null) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|password|secret)=)[^&\s]+/gi, "$1[REDACTED]");
}

/** Recursively remove credential-like fields and known secret values from AI-visible data. */
export function redactValue(value: unknown, secretValues: readonly string[] = []): unknown {
  const secrets = secretValues.filter((s) => s.length >= 4);
  const scrubString = (input: string): string => {
    let out = redactText(input) ?? "";
    for (const secret of secrets) {
      out = out.split(secret).join("[REDACTED]");
    }
    return out;
  };
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(item, secrets),
      ]),
    );
  }
  return value;
}

export function redactBody(value: string | null): string | null {
  if (value == null) return null;
  const truncated = value.length > MAX_TRACE_BODY_CHARS
    ? value.slice(0, MAX_TRACE_BODY_CHARS) + `... [${value.length - MAX_TRACE_BODY_CHARS} chars truncated]`
    : value;
  try {
    return JSON.stringify(redactValue(JSON.parse(truncated)));
  } catch {
    return SENSITIVE_KEY.test(truncated) ? "[REDACTED_BODY]" : redactText(truncated);
  }
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACTED_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function headersToRecord(init?: HeadersInit): Record<string, string> {
  if (!init) return {};
  if (typeof init === "object" && typeof init.forEach === "function") {
    const r: Record<string, string> = {};
    init.forEach((v: string, k: string) => { r[k] = v; });
    return r;
  }
  if (Array.isArray(init)) return Object.fromEntries(init);
  return { ...init } as Record<string, string>;
}

/**
 * Create a fetch wrapper that records HTTP calls into the provided array
 * AND feeds the xray handle with per-request phase data.
 */
export function createTracedFetch(
  traces: HttpTraceEntry[],
  projectId?: string,
  xrayHandle?: XrayCallHandle | null,
): typeof globalThis.fetch {
  return async function tracedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const url = redactUrl(rawUrl);

    // Skip tracing and egress policy for trusted internal Clara broadcast/WS calls.
    if (url.includes('/internal/broadcast') || url.includes('/internal/collab') || url.includes('/internal/yjs')) {
      return _originalFetch(input, init);
    }

    await assertSafeEgressUrl(rawUrl);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const reqHeaders = redactHeaders(headersToRecord(init?.headers));
    const start = Date.now();

    let requestBody: string | null = null;
    try {
      if (init?.body) {
        if (typeof init.body === "string") {
          requestBody = redactBody(init.body);
        } else if (init.body instanceof URLSearchParams) {
          requestBody = redactBody(init.body.toString());
        } else {
          requestBody = "[non-string body]";
        }
      }
    } catch { /* body capture failed — ok */ }

    const xrayHttp = xrayHandle?.httpStart(method, url, requestBody) ?? null;

    try {
      const res = await _originalFetch(input, init);
      const durationMs = Date.now() - start;

      const resHeaders = redactHeaders(headersToRecord(res.headers));

      let bodyText: string | null = null;
      try {
        const clone = res.clone();
        const raw = await clone.text();
        bodyText = redactBody(raw);
      } catch { /* body read failed — ok */ }

      const entry: HttpTraceEntry = { url, method, requestHeaders: reqHeaders, requestBody, statusCode: res.status, responseHeaders: resHeaders, durationMs, responseBody: bodyText };
      traces.push(entry);

      console.log(`[Integration:HTTP] ── REQUEST ──\n  ${method} ${url}\n  Headers: ${JSON.stringify(reqHeaders)}\n  Body: ${requestBody ?? "(none)"}`);
      console.log(`[Integration:HTTP] ── RESPONSE ${res.status} (${durationMs}ms) ──\n  Headers: ${JSON.stringify(resHeaders)}\n  Body: ${bodyText ?? "(empty)"}`);

      if (xrayHttp) xrayHandle?.httpEnd(xrayHttp, res.status, durationMs, bodyText);

      return res;
    } catch (err) {
      const durationMs = Date.now() - start;
      const errMsg = redactText(err instanceof Error ? err.message : String(err)) ?? "Integration HTTP request failed";
      const entry: HttpTraceEntry = {
        url, method, requestHeaders: reqHeaders, requestBody, statusCode: null,
        responseHeaders: {}, durationMs, responseBody: null, error: errMsg,
      };
      traces.push(entry);
      console.error(`[Integration:HTTP] ── REQUEST ──\n  ${method} ${url}\n  Headers: ${JSON.stringify(reqHeaders)}\n  Body: ${requestBody ?? "(none)"}`);
      console.error(`[Integration:HTTP] ── FAILED (${durationMs}ms) ──\n  Error: ${errMsg}\n  Stack: ${err instanceof Error ? err.stack : "n/a"}`);

      if (xrayHttp) xrayHandle?.httpEnd(xrayHttp, null, durationMs, null, errMsg);

      throw err;
    }
  };
}