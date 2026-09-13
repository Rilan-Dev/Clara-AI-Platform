/**
 * src/middleware.ts  (Clara Backend — Next.js Edge Middleware)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { EMBED_WIDGET_HEADERS, SECURITY_HEADERS } from "./security/csp";

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const multi = process.env.ALLOWED_ORIGINS ?? "";
  const single = process.env.ALLOWED_ORIGIN ?? "";
  for (const raw of [...multi.split(","), ...single.split(",")]) {
    const o = raw.trim();
    if (o) origins.add(o);
  }
  if (process.env.NODE_ENV !== "production") {
    for (const port of [3000, 3001, 3002, 3003, 5173, 4200]) origins.add(`http://localhost:${port}`);
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
  "Access-Control-Allow-Credentials": "true",
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
  if (LOCALHOST_RE.test(origin) || ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

const ADMIN_PAGE_PREFIXES = ["/dashboard", "/orgs", "/subscriptions", "/analytics", "/settings"];
const PROTECTED_API_PREFIXES = [
  "/api/kbs", "/api/orgs", "/api/ingest", "/api/documents", "/api/rag",
  "/api/realtime", "/api/subscriptions/checkout", "/api/platform", "/api/agents",
];
const PUBLIC_PREFIXES = [
  "/api/auth", "/api/embed", "/api/subscriptions/plans", "/api/health", "/api/gemini", "/_next", "/favicon",
];

function startsWith(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(header, value);
  return response;
}

function addEmbedWidgetHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(EMBED_WIDGET_HEADERS)) response.headers.set(header, value);
  response.headers.delete("X-Frame-Options");
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const isApiRoute = pathname.startsWith("/api/");
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
    const skipAuth = process.env.SKIP_AUTH === "true";
    const adminToken = request.cookies.get("clara_platform_token")?.value ?? request.cookies.get("clara_admin_token")?.value ?? request.cookies.get("clara_token")?.value;
    if (!skipAuth && !adminToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  if (startsWith(pathname, PROTECTED_API_PREFIXES)) {
    const skipAuth = process.env.SKIP_AUTH === "true";
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
