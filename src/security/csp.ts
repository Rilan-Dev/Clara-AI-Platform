/**
 * src/security/csp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Content-Security-Policy directives + security headers.
 *
 * Base directives are STATIC (audited surface, covered by tests). The two
 * runtime-conditional extensions are:
 *   1. The ElevenLabs Conversational AI (Mode B) websocket origin: the browser
 *      connects DIRECTLY to the vendor with a server-minted signed URL, so
 *      `wss://api.elevenlabs.io` must be reachable — but ONLY while Mode B is
 *      platform-enabled (ELEVENLABS_CONVERSATIONAL_AI_ENABLED, plan §11.2).
 *      Mode A (hybrid pipeline) keeps CSP untouched: all vendor traffic is
 *      proxied by platform routes.
 *   2. `https://vercel.live` (script-src + connect-src, static): Vercel's
 *      first-party toolbar/feedback script is injected into PREVIEW
 *      deployments only (never production). Without it every preview build
 *      logs a CSP violation for vercel.live/_next-live/feedback/feedback.js.
 *      vercel.live is owned by Vercel itself — same trust level as the
 *      platform serving the app — so allowing it does not widen the
 *      attack surface to any third party.
 */

const BASE_DIRECTIVES: string[] = [
  "default-src 'self'",
  // Razorpay Checkout loads its risk-detection bundle from cdn.razorpay.com
  // and reports to lumberjack.razorpay.com; blocking them trips CSP reports.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://checkout.razorpay.com https://cdn.razorpay.com https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' wss: https://*.up.railway.app https://api.openai.com https://realtime.openai.com https://*.vercel.app https://api.razorpay.com https://lumberjack.razorpay.com https://vercel.live",
  "media-src 'self' blob:",
  "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://vercel.live",
];

const MODE_B_CONNECT_ORIGINS = " wss://api.elevenlabs.io https://api.elevenlabs.io";

/** Extra embed-widget directives (frame-ancestors for third-party iframes). */
const EMBED_EXTRA_DIRECTIVES: string[] = ["frame-ancestors *"];

function isConversationalAIEnabled(): boolean {
  return (process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED ?? "false").toLowerCase() === "true";
}

function buildCsp(embedWidget: boolean): string {
  const directives = [...BASE_DIRECTIVES];
  if (embedWidget) directives.push(...EMBED_EXTRA_DIRECTIVES);
  directives.push("report-uri /api/csp-report");
  return directives
    .map((directive) =>
      directive.startsWith("connect-src ") && isConversationalAIEnabled()
        ? directive + MODE_B_CONNECT_ORIGINS
        : directive,
    )
    .join("; ");
}

// ─── Static values (Mode B off — the audited default posture) ────────────────

export const CSP_HEADER_VALUE = buildCsp(false);
export const EMBED_WIDGET_CSP_HEADER_VALUE = buildCsp(true);

// ─── Per-request values (Mode B adds the vendor websocket origin) ────────────

/** Computes the app CSP for the current process state. */
export function getCspHeaderValue(): string {
  return buildCsp(false);
}

/** Computes the embed-widget CSP for the current process state. */
export function getEmbedWidgetCspHeaderValue(): string {
  return buildCsp(true);
}

export const SECURITY_HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Content-Security-Policy": CSP_HEADER_VALUE,
} as const;

export const EMBED_WIDGET_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Content-Security-Policy": EMBED_WIDGET_CSP_HEADER_VALUE,
} as const;

/**
 * Per-request security headers (CSP reflects the Mode B flag at request
 * time; everything else matches SECURITY_HEADERS).
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    "Content-Security-Policy": getCspHeaderValue(),
  };
}

/** Per-request embed-widget headers (CSP reflects the Mode B flag). */
export function getEmbedWidgetHeaders(): Record<string, string> {
  return {
    ...EMBED_WIDGET_HEADERS,
    "Content-Security-Policy": getEmbedWidgetCspHeaderValue(),
  };
}
