/**
 * src/middleware.ts  (Clara Backend — Next.js Edge Middleware)
 *
 * Responsibilities:
 *   1. Protect platform admin routes  (/dashboard, /orgs, /subscriptions, /analytics, /settings)
 *      — redirect to /login if no valid clara_admin_token cookie
 *   2. Protect org-level API routes   (/api/kbs/**, /api/projects/**, /api/orgs/**)
 *      — return 401 if no Authorization: Bearer <token> header or clara_token cookie
 *   3. Allow public routes through    (/, /features, /pricing, /contact, /admin/login, /api/auth/**)
 *   4. Add security headers to all responses
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── Route classification ────────────────────────────────────────────────────

/** Platform super-admin pages (indigo dark theme at /dashboard, /orgs, etc.) */
const ADMIN_PAGE_PREFIXES = [
  "/dashboard",
  "/orgs",
  "/subscriptions",
  "/analytics",
  "/settings",
];

/** Org-level API routes that require authentication */
const PROTECTED_API_PREFIXES = [
  "/api/kbs",
  "/api/projects",
  "/api/orgs",
  "/api/ingest",
  "/api/documents",
  "/api/rag",
  "/api/realtime",
  "/api/subscriptions/checkout",
  "/api/platform",
];

/** Routes that are always public */
const PUBLIC_PREFIXES = [
  "/api/auth",         // login, logout, register
  "/api/embed",        // public embed endpoints
  "/api/subscriptions/plans", // public pricing
  "/api/health",
  "/api/gemini",
  "/_next",
  "/favicon",
];

// ─── Helper: check if path starts with any of the given prefixes ─────────────

function startsWith(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

// ─── Security headers applied to every response ──────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js requires unsafe-eval in dev
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' wss: https://api.openai.com https://realtime.openai.com",
      "media-src 'self' blob:",
    ].join("; "),
  );
  return response;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Always allow public routes through immediately
  if (startsWith(pathname, PUBLIC_PREFIXES)) {
    return addSecurityHeaders(NextResponse.next());
  }

  // ── Platform admin page protection ──────────────────────────────────────
  if (startsWith(pathname, ADMIN_PAGE_PREFIXES)) {
    const adminToken =
      request.cookies.get("clara_admin_token")?.value ??
      request.cookies.get("clara_token")?.value;

    if (!adminToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Token exists — allow through (JWT verification happens in the API routes)
    return addSecurityHeaders(NextResponse.next());
  }

  // ── Protected API route enforcement ─────────────────────────────────────
  if (startsWith(pathname, PROTECTED_API_PREFIXES)) {
    const authHeader  = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookieToken =
      request.cookies.get("clara_token")?.value ??
      request.cookies.get("clara_admin_token")?.value;

    if (!bearerToken && !cookieToken) {
      return NextResponse.json(
        { error: "Unauthorised", message: "A valid auth token is required." },
        { status: 401 },
      );
    }

    // Pass token forward in a header so API routes can verify it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-clara-token", bearerToken ?? cookieToken ?? "");

    return addSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  }

  // ── All other routes (marketing pages, embed widget, etc.) ──────────────
  return addSecurityHeaders(NextResponse.next());
}

// ─── Matcher ────────────────────────────────────────────────────────────────
// Exclude static files and Next.js internals from middleware execution

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static   (static files)
     * - _next/image    (image optimisation)
     * - favicon.ico
     * - public assets (png, jpg, svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)",
  ],
};
