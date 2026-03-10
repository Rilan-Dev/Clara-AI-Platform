import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.CLARA_BACKEND_URL || "http://localhost:3000";
const COOKIE_NAME = "clara_omen_token";

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
    const res = NextResponse.json(data, { status: 200 });
    if (data.token) {
      res.cookies.set(COOKIE_NAME, data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
