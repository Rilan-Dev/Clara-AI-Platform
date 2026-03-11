/**
 * src/middleware.ts  (Clara Backend — Next.js Edge Middleware)
 *
 * Responsibilities:
 *   1. CORS — handle preflight OPTIONS + inject Allow-Origin on all /api/** responses
 *   2. Protect platform admin routes  (/dashboard, /orgs, /subscriptions, /analytics, /settings)
 *      — redirect to /login if no valid clara_admin_token cookie
 *   3. Protect org-level API routes   (/api/kbs/**, /api/projects/**, /api/orgs/**)
 *      — return 401 if no Authorization: Bearer <token> header or clara_token cookie
 *   4. Allow public routes through    (/, /features, /pricing, /contact, /admin/login, /api/auth/**)
 *   5. Add security headers to all responses
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── CORS ────────────────────────────────────────────────────────────────────

/**
 * Build the set of allowed origins at startup.
 *
 * Priority (comma-separated list wins over single value):
 *   ALLOWED_ORIGINS="http://localhost:3001,http://localhost:3002"
 *   ALLOWED_ORIGIN="http://localhost:3001"          ← legacy single-value
 *
 * In development every localhost port is allowed automatically.
 */
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  const multi  = process.env.ALLOWED_ORIGINS ?? "";
  const single = process.env.ALLOWED_ORIGIN  ?? "";

  for (const raw of [...multi.split(","), ...single.split(",")]) {
    const o = raw.trim();
    if (o) origins.add(o);
  }

  // In dev: allow any localhost origin automatically
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://localhost:3002");
    origins.add("http://localhost:3003");
    origins.add("http://localhost:5173"); // Vite default
    origins.add("http://localhost:4200"); // Angular default
  }

  return origins;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, x-clara-token",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400", // 24 h preflight cache
} as const;

function applyCors(response: NextResponse, origin: string | null): NextResponse {
  if (!origin) return response;

  if (ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      response.headers.set(k, v);
    }
    // Vary is required so CDNs/proxies cache per-origin correctly
    response.headers.set("Vary", "Origin");
  }

  return response;
}


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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
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
  const origin = request.headers.get("origin");
  const isApiRoute = pathname.startsWith("/api/");

  // ── CORS preflight — must be handled BEFORE any auth checks ─────────────
  if (request.method === "OPTIONS" && isApiRoute) {
    const preflight = new NextResponse(null, { status: 204 });
    applyCors(preflight, origin);
    return preflight;
  }

  // Always allow public routes through immediately
  if (startsWith(pathname, PUBLIC_PREFIXES)) {
    const res = addSecurityHeaders(NextResponse.next());
    if (isApiRoute) applyCors(res, origin);
    return res;
  }

  // ── Platform admin page protection ──────────────────────────────────────
  if (startsWith(pathname, ADMIN_PAGE_PREFIXES)) {
    const adminToken =
      request.cookies.get("clara_platform_token")?.value ??
      request.cookies.get("clara_admin_token")?.value ?? // legacy fallback
      request.cookies.get("clara_token")?.value;         // legacy fallback

    if (!adminToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return addSecurityHeaders(NextResponse.next());
  }

  // ── Protected API route enforcement ─────────────────────────────────────
  if (startsWith(pathname, PROTECTED_API_PREFIXES)) {
    const authHeader  = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookieToken =
      request.cookies.get("clara_platform_token")?.value ??
      request.cookies.get("clara_admin_token")?.value ??  // legacy fallback
      request.cookies.get("clara_token")?.value;          // legacy fallback

    if (!bearerToken && !cookieToken) {
      const res = NextResponse.json(
        { error: "Unauthorised", message: "A valid auth token is required." },
        { status: 401 },
      );
      applyCors(res, origin); // CORS headers on 401 too — browser must read the error body
      return res;
    }

    // Pass token forward in a header so API routes can verify it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-clara-token", bearerToken ?? cookieToken ?? "");

    const res = addSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
    applyCors(res, origin);
    return res;
  }

  // ── All other routes (marketing pages, embed widget, etc.) ──────────────
  const res = addSecurityHeaders(NextResponse.next());
  if (isApiRoute) applyCors(res, origin);
  return res;
}

// ─── Matcher ────────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)",
  ],
};
