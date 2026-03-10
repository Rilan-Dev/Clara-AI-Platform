import { NextRequest, NextResponse } from "next/server";
import { APP_COOKIE_NAME, getBackendUrl } from "@/config/app";

const BACKEND = getBackendUrl();

/** POST /api/auth  — proxies to clara-backend auth */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const backendRes = await fetch(`${BACKEND}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json();
    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }
    const res = NextResponse.json(data);
    if (data.token) {
      res.cookies.set(APP_COOKIE_NAME, data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 503 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
