import { NextRequest, NextResponse } from "next/server";
import { APP_COOKIE_NAME, getBackendUrl } from "@/config/app";

const BACKEND = getBackendUrl();

export async function POST(req: NextRequest) {
  const token = req.cookies.get(APP_COOKIE_NAME)?.value;

  // Best-effort: tell backend to destroy the session
  if (token) {
    await fetch(`${BACKEND}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

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
