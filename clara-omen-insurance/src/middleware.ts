import { NextRequest, NextResponse } from "next/server";

/**
 * clara_omen_token — unique cookie name for the Omen Insurance portal.
 * Prevents browser cookie collision on localhost (browsers share cookies
 * by domain, not port — so all three apps need different cookie names).
 *
 * Cookie map:
 *   clara_platform_token → clara-backend  (port 3000)
 *   clara_omen_token     → clara-omen-insurance (port 3001)  ← this app
 *   clara_tv_token       → clara-techvision (port 3002)
 */
const COOKIE_NAME = "clara_omen_token";

export function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
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
