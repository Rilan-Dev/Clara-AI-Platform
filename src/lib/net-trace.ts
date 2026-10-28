/**
 * src/lib/net-trace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * .env-gated request/upstream tracing that mirrors the browser Network tab.
 *
 * WHY THIS EXISTS
 * Provider failures (Gemini 429, OpenAI 401, embedding connect-timeouts) were
 * only visible as one-line console.error entries in the container log. When
 * an org reported a broken assistant, debugging meant asking "what does the
 * browser Network tab show?" — with no server-side counterpart to compare
 * against. This module prints the SAME row the Network tab shows — method,
 * path, status, duration, request/response payload preview, error cause
 * chain — into stdout, which surfaces in BOTH deployment targets:
 *
 *   • Self-hosted / VPS / Docker:   docker compose logs -f clara-backend
 *   • Vercel serverless:            Dashboard → Deployments → Functions → Logs
 *
 * GATING (.env — documented in .env.example "Debug observability"):
 *   NET_TRACE=off | on | verbose        (default: off)
 *     off      request summaries are hidden. FAILURES are still always
 *              captured — the issue-capture duty is not optional and does
 *              not depend on the flag.
 *     on       one summary line per traced request (status/duration/req-id).
 *     verbose  additionally prints redacted request/response body previews
 *              and successful upstream vendor calls.
 *   NET_TRACE_BODY_CHARS   (default 1200, clamped 200–20000) preview length.
 *   NET_TRACE_SLOW_MS      (default 1500) "slow" marker threshold.
 *
 * CORRELATION WITH DEVTOOLS
 * The handle reuses the incoming `x-request-id` header when present (the
 * admin axios client already sends one), otherwise mints `srv-<rand>`.
 * Routes echo it back on the response (`x-request-id`), so the row the
 * browser Network tab shows — request headers AND response headers — maps
 * 1:1 to the `[net-trace]` row in docker/vercel logs. No guessing which
 * log line belongs to which browser request.
 *
 * ORG-PLATFORM SAFETY (issues are NEVER shown to org users)
 *   • This module only writes to the SERVER console. Nothing it prints is
 *     ever returned to any HTTP client — routes keep returning their
 *     curated public messages (existing behaviour, unchanged).
 *   • Payload previews are PII-redacted (lib/redact: emails, phones, cards)
 *     and secret-scrubbed (authorization / api-key / token / password JSON
 *     keys are masked, as are sk-…, AIza…, JWT and 32+ hex values).
 *   • Turn NET_TRACE off (or leave unset) outside debugging sessions to
 *     keep production logs minimal — failure capture stays on regardless.
 */

import { redactText } from "@/lib/redact";

// ── Levels & env knobs ───────────────────────────────────────────────────────

export type NetTraceLevel = "off" | "on" | "verbose";

const LEVEL_ALIASES: Record<string, NetTraceLevel> = {
  "0": "off", false: "off", off: "off", no: "off", none: "off",
  "1": "on", true: "on", on: "on", yes: "on",
  "2": "verbose", verbose: "verbose", v: "verbose", all: "verbose",
};

/** Read lazily on every call: flipping the env var needs no redeploy/rebuild. */
export function netTraceLevel(): NetTraceLevel {
  const raw = (process.env.NET_TRACE ?? "").trim().toLowerCase();
  return LEVEL_ALIASES[raw] ?? "off";
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), min), max);
}

function bodyCharLimit(): number {
  return intEnv("NET_TRACE_BODY_CHARS", 1200, 200, 20_000);
}

function slowThresholdMs(): number {
  return intEnv("NET_TRACE_SLOW_MS", 1500, 0, 600_000);
}

// ── Redaction & secret scrubbing ─────────────────────────────────────────────

/** JSON object keys whose VALUES must never be printed. */
const SECRET_KEY_RE =
  /^(authorization|proxy-authorization|api[-_]?key|apikey|x-api-key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|client[-_]?secret|password|passwd|credential|credentials|cookie|set-cookie|bearer)$/i;

/** Values that look like live credentials regardless of their key. */
const SECRET_VALUE_RE =
  /\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{10,}|Bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9._-]{10,}|[A-Fa-f0-9]{32,})/g;

function scrubUnknown(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth <= 0) return "[depth-limit]";
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => scrubUnknown(item, depth - 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_RE.test(key) ? "[secret]" : scrubUnknown(val, depth - 1, seen);
    }
    return out;
  } finally {
    // Release so the same object referenced by a SIBLING field is not
    // misreported as circular on the next branch.
    seen.delete(value as object);
  }
}

/** Redacted + truncated one-line preview of a request/response payload. */
function previewBody(body: unknown): string {
  if (body === undefined) return "—";
  let text: string;
  if (body === null) text = "null";
  else if (typeof body === "string") text = body;
  else {
    try {
      text = JSON.stringify(scrubUnknown(body, 6, new WeakSet<object>())) ?? "null";
    } catch {
      text = String(body);
    }
  }
  const safe = redactText(text).text.replace(SECRET_VALUE_RE, "[secret]");
  const limit = bodyCharLimit();
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit)}… (+${safe.length - limit} chars)`;
}

/** Flatten an error + its `cause` chain into one classifiable string. */
export function netTraceChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [`${error.name}: ${error.message}`];
  let current: unknown = (error as { cause?: unknown }).cause;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      parts.push(current);
      current = null;
    } else {
      current = null;
    }
  }
  return parts.join(" · ");
}

/** First stack frames of the top error — only meaningful for real exceptions. */
function stackPreview(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const lines = error.stack.split("\n").slice(1, 5).map((l) => l.trim());
  return lines.length ? lines.join(" | ") : null;
}

// ── Field rendering (Network-tab style key=value tail) ──────────────────────

export type NetTraceFieldValue = string | number | boolean | null | undefined;
export type NetTraceFields = Record<string, NetTraceFieldValue>;

const FIELD_KEYS_NO_REDACT = new Set(["req", "traceid"]);

function renderFields(fields: ReadonlyArray<[string, NetTraceFieldValue]>): string {
  const parts: string[] = [];
  for (const [key, value] of fields) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string") {
      // `req`/`traceid` are correlation ids (also visible unredacted in the
      // header tail) — redacting them would break Network-tab correlation.
      const safe = FIELD_KEYS_NO_REDACT.has(key.toLowerCase())
        ? value.replace(SECRET_VALUE_RE, "[secret]")
        : redactText(value).text.replace(SECRET_VALUE_RE, "[secret]");
      parts.push(`${key}="${safe.replace(/\s+/g, " ").slice(0, 80)}"`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function durationTag(durationMs: number): string {
  return `${durationMs}ms${durationMs >= slowThresholdMs() ? " slow" : ""}`;
}

// ── Request trace handle ─────────────────────────────────────────────────────

export type NetTraceHandle = {
  /** Correlation id: incoming x-request-id, or srv-<rand> when absent. */
  readonly id: string;
  /** Attach a key=value field to the trace header line (org, kb, provider…). */
  field(key: string, value: NetTraceFieldValue): void;
  /** Replace the request payload used for verbose previews (post-parse). */
  setReqBody(body: unknown): void;
  /** Successful (or routine non-5xx) completion — NET_TRACE gated. */
  end(opts?: { status?: number; resBody?: unknown; note?: string }): void;
  /** Failure — ALWAYS captured (even with NET_TRACE=off), with cause+stack. */
  fail(error: unknown, opts?: { status?: number; resBody?: unknown }): void;
};

function requestIdFrom(
  headers: Headers | Record<string, string> | null | undefined,
): string | null {
  if (!headers) return null;
  let raw: string | null | undefined;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    raw = headers.get("x-request-id");
  } else {
    const record = headers as Record<string, string>;
    raw = record["x-request-id"] ?? record["X-Request-Id"];
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function mintRequestId(): string {
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Start tracing one HTTP request. Cheap enough to call unconditionally —
 * the returned handle no-ops its summary output when NET_TRACE=off, while
 * `fail()` keeps capturing issues either way (the whole point).
 */
export function netTraceRequest(input: {
  /** Short scope label — matches the route file, e.g. "chat", "embed/search". */
  route: string;
  /** HTTP method; defaults to POST. */
  method?: string;
  /** Path (Network-tab style: pathname + search). */
  url: string | URL;
  /** Incoming request headers — reuses the caller's x-request-id when set. */
  headers?: Headers | Record<string, string> | null;
  /** Request payload for verbose previews (scrubbed + truncated before print). */
  reqBody?: unknown;
}): NetTraceHandle {
  const route = input.route;
  const method = (input.method ?? "POST").toUpperCase();
  const url =
    typeof input.url === "string"
      ? input.url
      : `${input.url.pathname}${input.url.search}`;
  const id = requestIdFrom(input.headers) ?? mintRequestId();
  const startedAt = Date.now();
  const fields: Array<[string, NetTraceFieldValue]> = [];
  let reqBody: unknown = input.reqBody;

  const headerLine = (status: number, extra?: string, failed?: boolean): string => {
    const tail = ` req=${id}${renderFields(fields)}`;
    const note = extra ? ` (${extra})` : "";
    const marker = failed ? "✗ " : "";
    return `[net-trace] ${marker}${route} ▸ ${method} ${url} → ${status} · ${durationTag(Date.now() - startedAt)}${note}${tail}`;
  };

  return {
    id,
    field(key: string, value: NetTraceFieldValue): void {
      fields.push([key, value]);
    },
    setReqBody(body: unknown): void {
      reqBody = body;
    },
    end(opts?: { status?: number; resBody?: unknown; note?: string }): void {
      if (netTraceLevel() === "off") return;
      const status = opts?.status ?? 200;
      const header = headerLine(status, opts?.note);
      if (netTraceLevel() === "verbose") {
        const lines = [
          header,
          `    req  ▸ ${previewBody(reqBody)}`,
          `    res  ▸ ${opts?.resBody !== undefined ? previewBody(opts.resBody) : "—"}`,
        ];
        console.log(lines.join("\n"));
      } else {
        console.log(header);
      }
    },
    fail(error: unknown, opts?: { status?: number; resBody?: unknown }): void {
      const status = opts?.status ?? 500;
      const lines = [headerLine(status, "failed", true)];
      if (netTraceLevel() === "verbose") {
        lines.push(`    req  ▸ ${previewBody(reqBody)}`);
        if (opts?.resBody !== undefined) {
          lines.push(`    res  ▸ ${previewBody(opts.resBody)}`);
        }
      }
      lines.push(`    cause ▸ ${netTraceChain(error).slice(0, 2000)}`);
      const stack = stackPreview(error);
      if (stack) lines.push(`    stack ▸ ${stack.slice(0, 600)}`);
      console.error(lines.join("\n"));
    },
  };
}

// ── Standalone always-on issue capture ───────────────────────────────────────

/**
 * Capture an issue from ANY code path (not tied to a traced request) with
 * Network-tab correlation fields. Always logged — the capture duty is not
 * gated by NET_TRACE. Pairs with recordRuntimeIncident()/record*RuntimeFailure()
 * which additionally persist the incident + notify the platform admin.
 */
export function netTraceError(
  scope: string,
  error: unknown,
  fields?: NetTraceFields,
): void {
  const tail = fields ? renderFields(Object.entries(fields)) : "";
  const lines = [
    `[net-trace] ✗ ${scope}${tail}`,
    `    cause ▸ ${netTraceChain(error).slice(0, 2000)}`,
  ];
  const stack = stackPreview(error);
  if (stack) lines.push(`    stack ▸ ${stack.slice(0, 600)}`);
  console.error(lines.join("\n"));
}

// ── Upstream (vendor) call trace ─────────────────────────────────────────────

/**
 * HTTP status carried by SDK/vendor errors — both the OpenAI SDK (APIError)
 * and @google/genai (ApiError) expose `.status`, as do our own relayed
 * errors. Extracted so a failure row reads `→ 429` exactly like the red
 * status column in the devtools Network tab.
 */
function statusFromError(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : undefined;
}

/**
 * Trace one outbound provider call (Gemini / OpenAI / ElevenLabs / Qdrant…).
 * Failures are ALWAYS captured; successes only at NET_TRACE=verbose — vendor
 * calls are frequent and would drown the log at level "on". These calls are
 * server-side egress the browser Network tab can NEVER show — the upstream
 * row is the only devtools-equivalent view of them.
 */
export function netTraceUpstream(input: {
  /** Provider id: gemini | openai | elevenlabs | sarvam | qdrant | resend | … */
  provider: string;
  method?: string;
  url: string;
  status?: number;
  durationMs?: number;
  /** 1-based attempt number (retry ladders), plus total for "attempt 2/4". */
  attempt?: number;
  of?: number;
  error?: unknown;
  requestBody?: unknown;
  /**
   * COMPACT response summary for verbose success rows (counts/dimensions —
   * never the raw vendor payload: embedding bodies are megabytes of floats).
   * Kept small on purpose: `{"embeddings":1,"requests":20}` makes the
   * batch-contract break visible right in the row, like a truncated Network
   * tab response preview.
   */
  responseBody?: unknown;
}): void {
  const status = input.status ?? statusFromError(input.error);
  const failed = Boolean(input.error) || (status !== undefined && status >= 400);
  if (!failed && netTraceLevel() !== "verbose") return;

  const bits: string[] = [input.provider, `▸ ${(input.method ?? "POST").toUpperCase()} ${input.url}`];
  if (status !== undefined) bits.push(`→ ${status}`);
  if (input.durationMs !== undefined) bits.push(`· ${input.durationMs}ms`);
  if (input.attempt !== undefined) bits.push(`attempt ${input.attempt}${input.of ? `/${input.of}` : ""}`);
  const header = `[net-trace] upstream ${bits.join(" ")}`;

  if (input.error) {
    const lines = [header, `    cause ▸ ${netTraceChain(input.error).slice(0, 2000)}`];
    if (netTraceLevel() === "verbose" && input.requestBody !== undefined) {
      lines.push(`    req  ▸ ${previewBody(input.requestBody)}`);
    }
    console.error(lines.join("\n"));
  } else if (failed) {
    console.error(header);
  } else {
    const lines = [header, `    req  ▸ ${previewBody(input.requestBody)}`];
    if (input.responseBody !== undefined) {
      lines.push(`    res  ▸ ${previewBody(input.responseBody)}`);
    }
    console.log(lines.join("\n"));
  }
}
