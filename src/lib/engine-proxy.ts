/**
 * src/lib/engine-proxy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin helper that forwards a Next.js Request to the clara-engine microservice.
 *
 * Every AI-heavy API route in clara-backend calls engineProxy() instead of
 * running the logic locally.  The actual code lives on the private VPS.
 *
 * Environment variables (set in clara-backend .env):
 *   CLARA_ENGINE_URL    = https://engine.yourdomain.com   (no trailing slash)
 *   CLARA_ENGINE_SECRET = <same secret set in clara-engine .env>
 *
 * If CLARA_ENGINE_URL is not set the app returns 503 — engine offline.
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL    = process.env.CLARA_ENGINE_URL;
const ENGINE_SECRET = process.env.CLARA_ENGINE_SECRET ?? "";

/**
 * Forward a Next.js request to the engine and stream the response back.
 * Handles both regular JSON responses and streaming NDJSON responses.
 */
export async function engineProxy(
  req: NextRequest,
  enginePath: string,
  options?: { method?: string; body?: unknown },
): Promise<NextResponse> {
  if (!ENGINE_URL) {
    return NextResponse.json(
      { error: "Clara Engine is offline. Service unavailable." },
      { status: 503 },
    );
  }

  const url    = `${ENGINE_URL}${enginePath}`;
  const method = options?.method ?? req.method;

  let body: BodyInit | undefined;
  const contentType = req.headers.get("content-type") ?? "";

  if (options?.body !== undefined) {
    body = JSON.stringify(options.body);
  } else if (method !== "GET" && method !== "HEAD") {
    // Forward the raw body as-is
    body = await req.text();
  }

  // Forward relevant headers (auth, content-type, custom x- headers)
  const forwardHeaders: Record<string, string> = {
    Authorization:   `Bearer ${ENGINE_SECRET}`,
    "Content-Type":  contentType || "application/json",
  };

  // Pass through custom x- headers (e.g. x-kb-id, x-phone-internal)
  req.headers.forEach((value, key) => {
    if (key.startsWith("x-")) forwardHeaders[key] = value;
  });

  try {
    const upstream = await fetch(url, {
      method,
      headers: forwardHeaders,
      body,
      // @ts-ignore — Node 18+ fetch supports duplex for streaming
      duplex: "half",
    });

    // Stream the response body back to the client unchanged
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      // Don't forward encoding headers — Next.js handles that
      if (key === "content-encoding") return;
      responseHeaders.set(key, value);
    });

    return new NextResponse(upstream.body, {
      status:  upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[engine-proxy] ${enginePath}:`, err);
    return NextResponse.json(
      { error: "Clara Engine unreachable. Please try again later." },
      { status: 503 },
    );
  }
}

/**
 * Convenience: forward the entire request including query string.
 * Use for GET endpoints like /api/embed/config?kbId=xxx
 */
export async function engineProxyGet(
  req: NextRequest,
  enginePath: string,
): Promise<NextResponse> {
  const search = req.nextUrl.search; // ?kbId=xxx etc.
  return engineProxy(req, `${enginePath}${search}`, { method: "GET" });
}
