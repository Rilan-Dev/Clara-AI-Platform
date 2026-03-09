import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.CLARA_BACKEND_URL || "http://localhost:3000";
const COOKIE_NAME = "clara_tv_token";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  // Best-effort: tell backend to destroy the session
  if (token) {
    await fetch(`${BACKEND}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
