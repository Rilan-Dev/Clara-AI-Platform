/**
 * src/app/api/proxy/[...path]/route.ts
 *
 * Catch-all proxy: forwards every request to clara-backend,
 * injecting the httpOnly clara_token cookie as Authorization: Bearer.
 *
 * Client calls  /api/proxy/kbs/all?orgId=...
 * Proxied to    http://localhost:3000/api/kbs/all?orgId=...
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.CLARA_BACKEND_URL || "http://localhost:3000";

async function proxy(req: NextRequest, method: string): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const proxyPath = url.pathname.replace(/^\/api\/proxy/, "/api");
    const targetUrl = `${BACKEND}${proxyPath}${url.search}`;

    // Read the httpOnly auth token from cookie (only accessible server-side)
    const cookieStore = await cookies();
    const token = cookieStore.get("clara_token")?.value;

    const headers: Record<string, string> = {};
    const contentType = req.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const init: RequestInit = { method, headers };
    if (!["GET", "HEAD"].includes(method)) {
      init.body = await req.text();
    }

    const backendRes = await fetch(targetUrl, init);
    const body = await backendRes.text();

    return new NextResponse(body, {
      status: backendRes.status,
      headers: {
        "Content-Type": backendRes.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Backend unreachable", detail: (err as Error).message },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest)    { return proxy(req, "GET"); }
export async function POST(req: NextRequest)   { return proxy(req, "POST"); }
export async function PUT(req: NextRequest)    { return proxy(req, "PUT"); }
export async function PATCH(req: NextRequest)  { return proxy(req, "PATCH"); }
export async function DELETE(req: NextRequest) { return proxy(req, "DELETE"); }
