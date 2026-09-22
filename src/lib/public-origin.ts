/**
 * src/lib/public-origin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Request-aware public origin resolution — zero dependencies so it can be
 * unit-tested directly and imported from anywhere (email lib, auth flows,
 * payment webhooks) without dragging provider SDKs along.
 *
 * appUrl() (src/lib/stripe.ts) alone falls back to http://localhost:3000
 * when NEXT_PUBLIC_APP_URL is unset — a very common fresh-Vercel-deploy
 * situation. Every link inside a transactional email would then point at
 * localhost: clicking "Verify my email" from a Gmail inbox goes nowhere,
 * which looks to the user exactly like "the feature does not exist".
 *
 * resolvePublicOrigin() fixes that: when the env var is not configured it
 * derives the origin from the actual incoming request (Vercel always sets
 * x-forwarded-host / x-forwarded-proto), so emailed links land on the same
 * domain the user is using. Handlers pass the request; the origin is
 * captured BEFORE any fire-and-forget email continues in the background.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL  — explicit config wins (set via Vercel env vars
 *                             OR Settings → Platform → Public Application
 *                             URL, which overlays process.env at runtime
 *                             from platform_env_settings).
 *   2. Request headers      — x-forwarded-host/proto (proxies, Vercel) or
 *                             plain Host (direct access).
 *   3. http://localhost:3000 — local development fallback.
 */

export function resolvePublicOrigin(req?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (req) {
    const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = fwdHost || req.headers.get("host")?.trim();
    // Only trust non-local hosts from the request — dev requests on
    // localhost keep the explicit dev fallback.
    if (host && !host.startsWith("localhost") && !host.startsWith("127.")) {
      const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const proto = fwdProto || (host.includes(":3000") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  return "http://localhost:3000";
}

/** appUrl() with a request-derived base — see resolvePublicOrigin(). */
export function appUrlFor(path: string, req?: Request): string {
  const base = resolvePublicOrigin(req);
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
