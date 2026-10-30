/**
 * src/middleware.ts  (Clara Backend — Next.js Edge Middleware)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getEmbedWidgetHeaders, getSecurityHeaders } from "./security/csp";
import { featureForPath, isPlatformFeatureEnabled } from "./lib/feature-availability";

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const multi = process.env.ALLOWED_ORIGINS ?? "";
  const single = process.env.ALLOWED_ORIGIN ?? "";
  for (const raw of [...multi.split(","), ...single.split(",")]) {
    const o = raw.trim();
    if (o) origins.add(o);
  }
  return origins;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();
const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, x-clara-token",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
} as const;
const EMBED_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions",
  "Access-Control-Max-Age": "86400",
} as const;
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function applyEmbedCors(response: NextResponse, origin: string | null): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin ?? "*");
  for (const [k, v] of Object.entries(EMBED_CORS_HEADERS)) response.headers.set(k, v);
  response.headers.set("Vary", "Origin");
  return response;
}

function applyCors(response: NextResponse, origin: string | null): NextResponse {
  if (!origin) return response;
  if (ALLOWED_ORIGINS.has(origin) ||
      (process.env.NODE_ENV !== "production" && LOCALHOST_RE.test(origin))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

// Signed-in app pages. Missing a prefix here does not open data (every API
// enforces auth), but it renders the shell before the client redirect runs.
const ADMIN_PAGE_PREFIXES = [
  "/dashboard", "/orgs", "/subscriptions", "/analytics", "/settings", "/preview",
  "/system-status", "/kbs", "/workspace", "/ingest",
];
const PROTECTED_API_PREFIXES = [
  "/api/kbs", "/api/orgs", "/api/ingest", "/api/documents", "/api/rag",
  "/api/realtime", "/api/subscriptions/checkout", "/api/platform", "/api/agents",
  "/api/analytics",
];
const PUBLIC_PREFIXES = [
  "/api/auth", "/api/embed", "/api/subscriptions/plans", "/api/health", "/api/gemini", "/_next", "/favicon",
  // Public PUBLISHED agent page API — serves only the immutable published
  // state (active deployment + publicAccess) and mints short-lived signed
  // public session tokens; guarded per-IP at the route level.
  "/api/public",
];

function startsWith(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(getSecurityHeaders())) response.headers.set(header, value);
  return response;
}

function addEmbedWidgetHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(getEmbedWidgetHeaders())) response.headers.set(header, value);
  response.headers.delete("X-Frame-Options");
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const isApiRoute = pathname.startsWith("/api/");
  // The same enforcement covers preflight, public iframe/script URLs, direct
  // navigation and authenticated management APIs, before auth or any handler
  // can read/write settings or call external providers.
  const gatedFeature = featureForPath(pathname);
  // Only the PUBLISHED agent's short-lived signed session may reuse the
  // chat, voice-session and realtime RAG transports while the optional
  // third-party embed widget feature remains disabled.
  // This shape check is ROUTING ONLY: each handler independently validates
  // HMAC signature, expiry, active public deployment, KB and org quota.
  // Long-lived external widget keys remain blocked in this environment.
  const header = request.headers.get("authorization") ?? "";
  const publishedAgentTransport =
    request.method === "POST" &&
    (pathname === "/api/embed/chat" || pathname === "/api/embed/session" || pathname === "/api/embed/rag") &&
    /^Bearer pub_v1\.[^.\s]+\.[^.\s]+$/.test(header);
  if (gatedFeature && !publishedAgentTransport && !isPlatformFeatureEnabled(gatedFeature)) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
          { status: 404 },
        )
      : new NextResponse("This feature is not available in this environment.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    response.headers.set("Cache-Control", "private, no-store");
    return addSecurityHeaders(response);
  }

  const isEmbedWidgetRoute =
    pathname === "/embed/widget" || pathname.startsWith("/embed/widget/") ||
    pathname === "/embed/widget-preview" || pathname.startsWith("/embed/widget-preview/") ||
    pathname === "/embed/voice" || pathname.startsWith("/embed/voice/");

  // // Legacy landing demos used DEMO_MODE as a synthetic public API key. That
  // // bypass is intentionally disabled: every embed API request must carry a
  // // real clr_ key issued from the KB Deploy tab.
  // if (pathname.startsWith("/api/embed") && request.headers.get("authorization")?.trim() === "Bearer DEMO_MODE") {
  //   const rejected = NextResponse.json({ error: "DEMO_MODE is no longer supported. Use a generated clr_ API key." }, { status: 401 });
  //   return applyEmbedCors(rejected, origin);
  // }

  if (request.method === "OPTIONS" && isApiRoute) {
    const preflight = new NextResponse(null, { status: 204 });
    return pathname.startsWith("/api/embed") ? applyEmbedCors(preflight, origin) : applyCors(preflight, origin);
  }

  if (startsWith(pathname, PUBLIC_PREFIXES)) {
    const res = addSecurityHeaders(NextResponse.next());
    if (pathname.startsWith("/api/embed")) applyEmbedCors(res, origin);
    else if (isApiRoute) applyCors(res, origin);
    return res;
  }

  if (startsWith(pathname, ADMIN_PAGE_PREFIXES)) {
    const skipAuth = process.env.NODE_ENV !== "production" && process.env.SKIP_AUTH === "true";
    const adminToken = request.cookies.get("clara_platform_token")?.value ?? request.cookies.get("clara_admin_token")?.value ?? request.cookies.get("clara_token")?.value;
    if (!skipAuth && !adminToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  if (startsWith(pathname, PROTECTED_API_PREFIXES)) {
    const skipAuth = process.env.NODE_ENV !== "production" && process.env.SKIP_AUTH === "true";
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookieToken = request.cookies.get("clara_platform_token")?.value ?? request.cookies.get("clara_admin_token")?.value ?? request.cookies.get("clara_token")?.value;
    if (!skipAuth && !bearerToken && !cookieToken) {
      const res = NextResponse.json({ error: "Unauthorised", message: "A valid auth token is required." }, { status: 401 });
      applyCors(res, origin);
      return res;
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-clara-token", bearerToken ?? cookieToken ?? "");
    const res = addSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
    applyCors(res, origin);
    return res;
  }

  const res = isEmbedWidgetRoute ? addEmbedWidgetHeaders(NextResponse.next()) : addSecurityHeaders(NextResponse.next());
  if (isApiRoute) applyCors(res, origin);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)"],
};
