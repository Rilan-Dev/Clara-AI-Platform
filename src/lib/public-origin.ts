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

/**
 * True when a hostname can never be a public browser origin: loopback,
 * the unspecified addresses (0.0.0.0 / :: — what the server surfaces when the
 * app listens on 0.0.0.0 behind a Host-rewriting reverse proxy), RFC1918
 * private ranges, link-local, IPv6 ULA/loopback, plus IPv4-mapped IPv6 forms
 * of all of the above.
 *
 * OAuth callbacks use this to classify a request whose visible host is a
 * private/bind address as an unverifiable reverse-proxy hop rather than an
 * origin mismatch: reverse proxies that rewrite Host (nginx's default
 * `proxy_set_header Host $proxy_host`) surface e.g. 0.0.0.0:3000 to the app
 * even though the user's browser is on the real public domain.
 */
export function isPrivateOrLocalHostname(hostname: string): boolean {
  const bare = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!bare) return true;
  if (bare === "localhost" || bare.endsWith(".localhost") || bare.endsWith(".local") || bare.endsWith(".internal")) {
    return true;
  }
  // IPv4 literal, possibly IPv4-mapped IPv6 (::ffff:a.b.c.d).
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  const ipv4 = mapped?.[1] ?? (/^(\d{1,3})(?:\.\d{1,3}){3}$/.test(bare) ? bare : null);
  if (ipv4) {
    const [a, b] = ipv4.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // unspecified, private, loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }
  // IPv6 literals (after unwrapping any IPv4-mapped prefix).
  const ipv6 = bare.replace(/^::ffff:/, "");
  if (ipv6 === "::" || ipv6 === "::1") return true; // unspecified, loopback
  if (/^f[cd][0-9a-f]{2}:/.test(ipv6)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(ipv6)) return true; // fe80::/10 link-local
  return false;
}

/**
 * OAuth callbacks bind the exact redirect URI into server-side state before
 * the browser leaves for the provider, and the provider only redirects the
 * browser to that exact registered URI. This check is defense-in-depth: the
 * request must have landed on the bound URI *as the deployment publicly
 * exposes it*, so compare against the request's PUBLIC origin
 * (resolvePublicOrigin: NEXT_PUBLIC_APP_URL → forwarded headers → Host)
 * rather than req.nextUrl.origin, and treat a private/loopback/unspecified
 * request host as an unverifiable proxy hop instead of a mismatch.
 *
 * A request on a genuinely different public origin still fails closed.
 */
export function oauthRequestOriginMatches(stateRedirectUriOrigin: string, req: Request): boolean {
  const publicOrigin = resolvePublicOrigin(req);
  if (stateRedirectUriOrigin === publicOrigin) return true;
  try {
    return isPrivateOrLocalHostname(new URL(publicOrigin).hostname);
  } catch {
    return false;
  }
}

/** appUrl() with a request-derived base — see resolvePublicOrigin(). */
export function appUrlFor(path: string, req?: Request): string {
  const base = resolvePublicOrigin(req);
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
