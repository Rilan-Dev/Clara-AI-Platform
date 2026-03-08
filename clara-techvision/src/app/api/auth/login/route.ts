import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.CLARA_BACKEND_URL || "http://localhost:3010";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    const cookie = res.headers.get("set-cookie");
    if (cookie) response.headers.set("set-cookie", cookie);
    return response;
  } catch { return NextResponse.json({ error: "Backend unreachable" }, { status: 502 }); }
}
