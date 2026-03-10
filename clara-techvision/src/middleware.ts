import { NextRequest, NextResponse } from "next/server";
import { APP_COOKIE_NAME } from "@/config/app";

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
    "/demo-website/:path*",
    "/login",
  ],
};
