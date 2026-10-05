import { AsyncLocalStorage } from "node:async_hooks";
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

globalThis.fetch = function patchedFetch(input: any, init?: RequestInit): Promise<Response> {
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

export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, "[REDACTED]");
    }
    return u.toString();
  } catch { return rawUrl; }
}

export function redactBody(value: string | null): string | null {
  if (value == null) return null;
  const truncated = value.length > MAX_TRACE_BODY_CHARS
    ? value.slice(0, MAX_TRACE_BODY_CHARS) + `... [${value.length - MAX_TRACE_BODY_CHARS} chars truncated]`
    : value;
  try {
    const parsed: unknown = JSON.parse(truncated);
    const redact = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(redact);
      if (v && typeof v === "object") {
        return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(val)]));
      }
      return v;
    };
    return JSON.stringify(redact(parsed));
  } catch {
    return SENSITIVE_KEY.test(truncated) ? "[REDACTED_BODY]" : truncated;
  }
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACTED_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function headersToRecord(init?: any): Record<string, string> {
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
  return async function tracedFetch(input: any, init?: RequestInit): Promise<Response> {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const url = redactUrl(rawUrl);

    // Skip tracing for internal broadcast/WS calls
    if (url.includes('/internal/broadcast') || url.includes('/internal/collab') || url.includes('/internal/yjs')) {
      return _originalFetch(input, init);
    }

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
      const errMsg = err instanceof Error ? err.message : String(err);
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
