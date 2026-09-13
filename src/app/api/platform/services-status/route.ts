import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getEmailConfig } from "@/lib/email";

/**
 * GET /api/platform/services-status
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot health snapshot of EVERY service the platform depends on:
 * PostgreSQL, Redis, Qdrant, RabbitMQ, email delivery (Resend/SMTP), the
 * BullMQ background queues, and the app server itself.
 *
 * Powers the admin "System Status" screen. Designed to degrade gracefully:
 * each check returns { status: 'up'|'down'|'not_configured', latencyMs?, … }
 * instead of throwing, so one dead service never blanks the whole panel.
 *
 * Status semantics:
 *   up            — check succeeded
 *   down          — check failed (connection refused / timeout / error)
 *   not_configured — service has no credentials/URL set (monitored only when
 *                    configured) — rendered as neutral, not an outage.
 */
export type ServiceStatus = "up" | "down" | "not_configured";

type CheckResult = {
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
  error?: string;
};

const CHECK_TIMEOUT_MS = 2_500;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS),
    ),
  ]);
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkPostgres(): Promise<CheckResult & { pool?: object; migrations?: number }> {
  const start = Date.now();
  await withTimeout(pool.query("SELECT 1"), "PostgreSQL");
  const latencyMs = Date.now() - start;

  let migrations = 0;
  try {
    const rows = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM schema_migrations");
    migrations = parseInt(rows[0]?.count ?? "0", 10);
  } catch { /* non-fatal */ }

  return {
    status: "up",
    latencyMs,
    detail: `${migrations} migrations applied`,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  };
}

async function checkRedis(): Promise<CheckResult> {
  const { default: Redis } = await import("ioredis");
  const host = process.env.REDIS_HOST ?? "redis";
  const port = parseInt(process.env.REDIS_PORT ?? "6379", 10);

  const redis = new Redis({ host, port, lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: CHECK_TIMEOUT_MS });
  try {
    const start = Date.now();
    await withTimeout(redis.connect(), "Redis");
    const pong = await withTimeout(redis.ping(), "Redis");
    const latencyMs = Date.now() - start;
    return { status: pong === "PONG" ? "up" : "down", latencyMs, detail: `${host}:${port}` };
  } catch (err) {
    return { status: "down", detail: `${host}:${port}`, error: (err as Error).message };
  } finally {
    try { redis.quit(); } catch { /* already closed */ }
  }
}

async function checkQdrant(): Promise<CheckResult> {
  const url = (process.env.QDRANT_URL ?? "").trim();
  if (!url) return { status: "not_configured", detail: "QDRANT_URL not set" };
  try {
    const start = Date.now();
    const res = await withTimeout(fetch(`${url.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }), "Qdrant");
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, error: `HTTP ${res.status}` };
    return { status: "up", latencyMs, detail: url };
  } catch (err) {
    return { status: "down", detail: url, error: (err as Error).message };
  }
}

async function checkRabbitMq(): Promise<CheckResult> {
  // RABBITMQ_URL (amqp://user:pass@host:5672/%2F) → management API at host:15672.
  const raw = (process.env.RABBITMQ_URL ?? "").trim();
  if (!raw) return { status: "not_configured", detail: "RABBITMQ_URL not set" };

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const user = decodeURIComponent(u.username || process.env.RABBITMQ_DEFAULT_USER || "guest");
    const pass = decodeURIComponent(u.password || process.env.RABBITMQ_DEFAULT_PASS || "guest");
    const mgmtPort = parseInt(process.env.RABBITMQ_MANAGEMENT_PORT ?? "15672", 10);

    const start = Date.now();
    const res = await withTimeout(
      fetch(`http://${host}:${mgmtPort}/api/overview`, {
        headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      }),
      "RabbitMQ",
    );
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, detail: `${host}:${mgmtPort}`, error: `HTTP ${res.status}` };

    const data = (await res.json()) as { rabbitmq_version?: string; node?: string };
    return {
      status: "up",
      latencyMs,
      detail: `${host}:${mgmtPort} · v${data.rabbitmq_version ?? "?"}`,
    };
  } catch (err) {
    return { status: "down", detail: raw.replace(/\/\/.*@/, "//***@"), error: (err as Error).message };
  }
}

async function checkEmail(): Promise<CheckResult & {
  provider?: string; from?: string; queue?: { pending: number; sent: number; failed: number; last24h: number };
}> {
  const cfg = getEmailConfig();
  const providerLabel = cfg.provider === "console" ? "none (dev mode)" : cfg.provider;

  let queue: { pending: number; sent: number; failed: number; last24h: number } | undefined;
  try {
    const rows = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM subscription_notifications GROUP BY status`,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, parseInt(r.count, 10)]));
    const recent = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM subscription_notifications WHERE created_at > now() - interval '24 hours'`,
    );
    queue = {
      pending: byStatus.pending ?? 0,
      sent: byStatus.sent ?? 0,
      failed: byStatus.failed ?? 0,
      last24h: parseInt(recent[0]?.count ?? "0", 10),
    };
  } catch { /* non-fatal */ }

  if (cfg.provider === "console") {
    return { status: "not_configured", provider: providerLabel, queue };
  }
  if (cfg.provider === "resend") {
    return { status: "up", provider: "resend", from: cfg.fromAddress, queue };
  }
  return {
    status: "up",
    provider: "smtp",
    from: cfg.smtp.fromAddress,
    detail: `${cfg.smtp.host}:${cfg.smtp.port} ${cfg.smtp.secure ? "(SSL)" : "(STARTTLS)"}`,
    queue,
  };
}

async function checkQueues(redisUp: boolean): Promise<CheckResult & {
  queues?: Array<{ name: string; waiting: number; active: number; delayed: number; failed: number }>;
}> {
  if (!redisUp) return { status: "down", error: "Redis unavailable — queue depths unknown" };
  try {
    const { Queue } = await import("bullmq");
    const { redisConnection } = await import("@/modules/queue/redis");

    const collect = async (name: string) => {
      const q = new Queue(name, { connection: { ...redisConnection, maxRetriesPerRequest: 2 as unknown as null } });
      try {
        const counts = await withTimeout(
          Promise.all([q.getJobCounts("waiting", "active", "delayed", "failed")]),
          `queue ${name}`,
        );
        return { name, waiting: counts[0].waiting ?? 0, active: counts[0].active ?? 0, delayed: counts[0].delayed ?? 0, failed: counts[0].failed ?? 0 };
      } finally {
        await q.close();
      }
    };

    const queues = await Promise.all([collect("clara-crawl"), collect("clara-retry")]);
    const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);
    return {
      status: totalFailed > 100 ? "down" : "up",
      queues,
      detail: totalFailed > 100 ? `${totalFailed} failed jobs need attention` : "workers processing normally",
    };
  } catch (err) {
    return { status: "down", error: (err as Error).message };
  }
}

function checkApp(): CheckResult & { uptimeSeconds: number; memory: object; versions: object } {
  const mem = process.memoryUsage();
  return {
    status: "up",
    uptimeSeconds: Math.round(process.uptime()),
    detail: `up ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    memory: {
      rssMb: Math.round(mem.rss / 1_048_576),
      heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
      heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
    },
    versions: {
      node: process.version,
      env: process.env.NODE_ENV ?? "development",
    },
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const startedAt = Date.now();

    // Postgres first — the other checks fall back gracefully if it is down.
    let postgres: Awaited<ReturnType<typeof checkPostgres>>;
    try {
      postgres = await checkPostgres();
    } catch (err) {
      postgres = { status: "down", error: (err as Error).message };
    }

    const [redis, qdrant, rabbitmq, email, app] = await Promise.all([
      checkRedis().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkQdrant().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkRabbitMq().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkEmail().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      Promise.resolve(checkApp()),
    ]);

    const queues = await checkQueues(redis.status === "up");

    const services = { postgres, redis, qdrant, rabbitmq, email, queues, app };

    // Roll-up: down services (excluding not_configured) mark the platform degraded.
    const statuses = Object.values(services).map((s) => s.status as ServiceStatus);
    const down = statuses.filter((s) => s === "down").length;
    const up = statuses.filter((s) => s === "up").length;
    const notConfigured = statuses.filter((s) => s === "not_configured").length;

    return NextResponse.json(
      {
        ok: down === 0,
        overall: down === 0 ? "healthy" : "degraded",
        summary: { up, down, notConfigured },
        services,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/services-status]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
