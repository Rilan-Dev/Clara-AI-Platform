import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Lightweight health-check endpoint for Docker HEALTHCHECK, load balancers,
 * and uptime monitors. Returns 200 with basic status info.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      service: "clara-ai-rag",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "0.1.0",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
