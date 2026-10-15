/**
 * src/lib/egress.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Outbound HTTP egress policy for every provider SDK call in the Node runtime
 * (Gemini embeddings, OpenAI catalogue, ElevenLabs discovery, health probes).
 *
 * Why this exists (seen in production docker logs): Gemini embedding batches
 * died with `TypeError: fetch failed` → `ConnectTimeoutError (attempted
 * address: generativelanguage.googleapis.com:443, timeout: 10000ms)` after
 * only four short retries, and the platform offered the operator no way to
 * (a) extend the undici connect timeout or (b) route provider traffic
 * through an egress proxy — both standard requirements for self-hosted
 * deployments on restricted or flaky networks.
 *
 * Install once per process, as early as possible:
 *   installEgressDispatcher()      // idempotent
 *
 * Environment:
 *   EGRESS_CONNECT_TIMEOUT_MS   TCP connect timeout for outbound requests
 *                               (default 20000; undici's built-in default is
 *                               10000 — too short for slow international routes)
 *   HTTPS_PROXY / HTTP_PROXY /
 *   ALL_PROXY                    route provider traffic through a proxy
 *   NO_PROXY                     comma-separated hosts kept direct
 *                               (localhost,127.0.0.1,::1 are ALWAYS direct so
 *                               DB/Redis/Qdrant calls never leave the host)
 */

import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
/**
 * Happy-eyeballs attempt window. Node >= 20 enables autoSelectFamily by
 * default; older runtimes (and some docker base images) try only the first
 * DNS family, so an IPv6 blackhole turns into a 10-20s connect timeout
 * against dual-stack vendors (observed: api.openai.com reachable,
 * generativelanguage.googleapis.com timing out). Setting it explicitly
 * makes family fallback version-independent.
 */
const DEFAULT_FAMILY_ATTEMPT_TIMEOUT_MS = 500;

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Never print a proxy URL with embedded credentials in logs. */
function maskProxyUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<proxy>";
  }
}

/**
 * Keep loopback traffic direct. EnvHttpProxyAgent honours NO_PROXY, but if the
 * operator only set HTTPS_PROXY we still must not funnel localhost Postgres /
 * Redis / Qdrant calls through a remote proxy (they would all instantly fail).
 */
function ensureLoopbackNoProxy(): void {
  const loopback = "localhost,127.0.0.1,::1";
  const current = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  const entries = current
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const missing = loopback
    .split(",")
    .filter((host) => !entries.includes(host));
  if (missing.length === 0) return;
  const merged = [...new Set([...entries, ...missing])].join(",");
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

let installed = false;

/**
 * Configure the global outbound dispatcher: connect timeout + optional proxy.
 * Safe to call multiple times (only the first call wins).
 */
export function installEgressDispatcher(): void {
  if (installed) return;
  installed = true;

  const connectTimeoutMs = numberFromEnv("EGRESS_CONNECT_TIMEOUT_MS", DEFAULT_CONNECT_TIMEOUT_MS);
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy ??
    null;

  try {
    const dualStack = {
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: DEFAULT_FAMILY_ATTEMPT_TIMEOUT_MS,
    };
    if (proxyUrl) {
      ensureLoopbackNoProxy();
      setGlobalDispatcher(
        new EnvHttpProxyAgent({ connect: { timeout: connectTimeoutMs }, ...dualStack }),
      );
      console.log(
        `[egress] outbound provider traffic routed through proxy (${maskProxyUrl(proxyUrl)}); ` +
          `connect timeout ${connectTimeoutMs}ms; NO_PROXY=${process.env.NO_PROXY}`,
      );
    } else {
      setGlobalDispatcher(new Agent({ connect: { timeout: connectTimeoutMs }, ...dualStack }));
      console.log(
        `[egress] outbound connect timeout set to ${connectTimeoutMs}ms; ` +
          `dual-stack connect (IPv4/IPv6 fallback) enabled ` +
          `(set EGRESS_CONNECT_TIMEOUT_MS to tune; set HTTPS_PROXY to route provider traffic through an egress proxy)`,
      );
    }
  } catch (error) {
    // Egress policy must never prevent startup — Node defaults still work.
    console.error(
      "[egress] could not install outbound dispatcher — falling back to Node defaults:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ── Network error description ────────────────────────────────────────────────

export type NetworkErrorDetail = {
  /** Host (with optional port) the server failed to reach, when extractable. */
  host: string | null;
  /** The most specific (innermost) cause message. */
  detail: string;
};

const NETWORK_ERROR_PATTERN =
  /fetch failed|connect ?timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|EHOSTUNREACH|ENETUNREACH|EPROTO|network error|unreachable/i;

/**
 * Walk an error's cause chain and, when the failure is a network-level one,
 * extract the operator-actionable detail (which host, which failure mode).
 * Provider SDKs wrap transport errors as bare `TypeError: fetch failed`; the
 * real story ("Connect Timeout Error (attempted address:
 * generativelanguage.googleapis.com:443…)") only lives in `error.cause`.
 */
export function describeNetworkError(error: unknown): NetworkErrorDetail | null {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current != null; depth++) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      messages.push(current);
      current = null;
    } else {
      current = null;
    }
  }
  const text = messages.join(" · ");
  if (!text || !NETWORK_ERROR_PATTERN.test(text)) return null;

  const host =
    text.match(/attempted address:\s*([a-z0-9._-]+(?::\d+)?)/i)?.[1] ??
    // DNS failures carry the host inline: "getaddrinfo ENOTFOUND api.sarvam.ai";
    // refused/unreachable/timeout causes carry it as "connect ECONNREFUSED
    // 127.0.0.1:45037" — without this arm, local relays and dead endpoints
    // were attributed to NO host, hiding which endpoint to debug.
    text.match(
      /(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)\s+([a-z0-9._-]+(?::\d+)?)/i,
    )?.[1] ??
    text.match(/https?:\/\/([a-z0-9._-]+)/i)?.[1] ??
    null;

  return {
    host,
    // The innermost cause is the most specific ("Connect Timeout Error…"),
    // the outermost is usually the useless one ("fetch failed").
    detail: messages[messages.length - 1] ?? text.slice(0, 300),
  };
}
