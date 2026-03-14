import { NextRequest, NextResponse } from "next/server";
import { APP_COOKIE_NAME } from "@/config/app";
import { SECURITY_HEADERS } from "./server/security-headers";

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  return response;
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get(APP_COOKIE_NAME)?.value;
  const { pathname } = req.nextUrl;

  // Protect all portal routes
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/knowledge-bases") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/demo-website")
  ) {
    if (!token) {
      return applySecurityHeaders(NextResponse.redirect(new URL("/login", req.url)));
    }
  }

  // Redirect already-logged-in users away from login page
  if (pathname === "/login" && token) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard", req.url)));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)",
  ],
};
