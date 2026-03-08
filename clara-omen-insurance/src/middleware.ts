import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("clara_token")?.value;
  const { pathname } = req.nextUrl;

  // Protect all portal routes
  if (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/knowledge-bases") ||
      pathname.startsWith("/chat") ||
      pathname.startsWith("/analytics") ||
      pathname.startsWith("/settings")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Redirect logged-in users away from login
  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/knowledge-bases/:path*", "/chat/:path*",
            "/analytics/:path*", "/settings/:path*", "/login"],
};
