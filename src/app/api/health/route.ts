import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * GET /api/health
 * ─────────────────────────────────────────────────────────────────────────────
 * Enhanced health-check: real DB ping, Qdrant connectivity, system stats.
 * Used by Docker HEALTHCHECK, load balancers, uptime monitors,
 * and the Platform Analytics screen.
 */
export async function GET() {
  const start = Date.now();

  // Database and vector-store checks are independent. Run them together so a
  // slow dependency cannot add its full latency to the other check.
  const qdrantUrl = process.env.QDRANT_URL;
  const [dbCheck, qdrantCheck] = await Promise.all([
    (async () => {
      try {
        const dbStart = Date.now();
        await withTimeout(pool.query("SELECT 1"), 2_000, "database health check timed out");
        return { status: "ok" as const, latencyMs: Date.now() - dbStart };
      } catch (err) {
        return { status: "error" as const, latencyMs: 0, error: (err as Error).message };
      }
    })(),
    (async () => {
      if (!qdrantUrl) return { status: "unconfigured" as const, latencyMs: 0, error: undefined };
      try {
        const qdrantStart = Date.now();
        // Qdrant Cloud enforces the api-key header on every endpoint
        // (including /healthz — keyless probes are rejected with HTTP 403).
        // Without this header the check only ever passed against a local,
        // unauthenticated Qdrant instance.
        const qdrantApiKey = process.env.QDRANT_API_KEY?.trim();
        const res = await fetch(`${qdrantUrl.replace(/\/$/, "")}/healthz`, {
          headers: qdrantApiKey ? { "api-key": qdrantApiKey } : undefined,
          signal: AbortSignal.timeout(2_000),
          cache: "no-store",
        });
        return {
          status: res.ok ? "ok" as const : "error" as const,
          latencyMs: Date.now() - qdrantStart,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        };
      } catch (err) {
        return { status: "error" as const, latencyMs: 0, error: (err as Error).message };
      }
    })(),
  ]);
  const dbStatus = dbCheck.status;
  const dbLatencyMs = dbCheck.latencyMs;
  const dbError = dbCheck.error;
  const qdrantStatus = qdrantCheck.status;
  const qdrantLatencyMs = qdrantCheck.latencyMs;
  const qdrantError = qdrantCheck.error;

  // ── System stats ──────────────────────────────────────────────────────────
  const memUsage   = process.memoryUsage();
  const uptimeSecs = process.uptime();

  // ── DB pool stats (pg Pool exposes these) ────────────────────────────────
  const poolStats = {
    total:   (pool as unknown as { totalCount: number }).totalCount   ?? null,
    idle:    (pool as unknown as { idleCount:  number }).idleCount    ?? null,
    waiting: (pool as unknown as { waitingCount: number }).waitingCount ?? null,
  };

  const overallStatus =
    dbStatus === "ok" && (qdrantStatus === "ok" || qdrantStatus === "unconfigured")
      ? "healthy"
      : "degraded";

  const totalMs = Date.now() - start;

  return NextResponse.json(
    {
      status:    overallStatus,
      service:   "clara-ai-rag",
      timestamp: new Date().toISOString(),
      version:   process.env.npm_package_version || "0.1.0",
      uptime: {
        seconds: Math.floor(uptimeSecs),
        human:   formatUptime(uptimeSecs),
      },
      checks: {
        database: {
          status:    dbStatus,
          latencyMs: dbLatencyMs,
          error:     process.env.NODE_ENV === "production" ? undefined : dbError,
          pool:      poolStats,
        },
        qdrant: {
          status:    qdrantStatus,
          latencyMs: qdrantLatencyMs,
          url:       qdrantUrl ? qdrantUrl.replace(/:[^:@]+@/, ":***@") : null,
          error:     qdrantError,
        },
      },
      memory: {
        heapUsedMb:  Math.round(memUsage.heapUsed  / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMb:       Math.round(memUsage.rss       / 1024 / 1024),
      },
      responseMs: totalMs,
    },
    {
      status: overallStatus === "healthy" ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    }
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
