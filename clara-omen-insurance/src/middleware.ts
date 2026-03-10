import { NextRequest, NextResponse } from "next/server";
import { APP_COOKIE_NAME } from "@/config/app";

/**
 * clara_omen_token — unique cookie name for the Omen Insurance portal.
 * Browsers share cookies by domain (not port), so all three localhost apps
 * would clobber each other if they all used "clara_token".
 *
 * Cookie map:
 *   clara-backend      (port 3000) → clara_platform_token
 *   clara-omen         (port 3001) → clara_omen_token      ← this app
 *   clara-techvision   (port 3002) → clara_tv_token
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get(APP_COOKIE_NAME)?.value;
  const { pathname } = req.nextUrl;

  // Protect all portal routes
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/knowledge-bases") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/settings")
  ) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Redirect already-logged-in users away from login page
  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/knowledge-bases/:path*",
    "/chat/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/login",
  ],
};
