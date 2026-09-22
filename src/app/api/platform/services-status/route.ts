import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getEmailConfig, getEmailProviderConfigStatus } from "@/lib/email";
import { getPlatformAIRegistry, recordProviderHealth } from "@/modules/ai-governance/core/registry-db";
import { testProviderConnection } from "@/modules/ai-governance/core/health";
import { syncPlatformHealthIncidents, type PlatformHealthCheck } from "@/modules/platform-health/core/incidents";

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
  const { getRedisConnectionOptions } = await import("@/modules/queue/redis");
  const options = { ...getRedisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: CHECK_TIMEOUT_MS };
  const redis = new Redis(options);
  try {
    const start = Date.now();
    await withTimeout(redis.connect(), "Redis");
    const pong = await withTimeout(redis.ping(), "Redis");
    return { status: pong === "PONG" ? "up" : "down", latencyMs: Date.now() - start, detail: options.host + ":" + options.port + (options.tls ? " (TLS)" : "") };
  } catch (err) {
    return { status: "down", detail: options.host + ":" + options.port, error: (err as Error).message };
  } finally {
    try { await redis.quit(); } catch { /* already closed */ }
  }
}

async function checkQdrant(): Promise<CheckResult> {
  const url = (process.env.QDRANT_URL ?? "").trim();
  if (!url) return { status: "not_configured", detail: "QDRANT_URL not set" };
  try {
    const start = Date.now();
    const headers: Record<string, string> = {};
    const apiKey = process.env.QDRANT_API_KEY?.trim();
    if (apiKey) headers["api-key"] = apiKey;
    const base = url.replace(/\/$/, "");
    const res = await withTimeout(fetch(base + "/healthz", { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }), "Qdrant");
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, error: "HTTP " + res.status };
    return { status: "up", latencyMs, detail: new URL(url).hostname };
  } catch (err) {
    return { status: "down", detail: new URL(url).hostname, error: (err as Error).message };
  }
}

async function checkRabbitMq(): Promise<CheckResult> {
  const raw = (process.env.RABBITMQ_URL ?? "").trim();
  if (!raw) return { status: "not_configured", detail: "RABBITMQ_URL not set" };
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "amqp:" && parsed.protocol !== "amqps:") throw new Error("RABBITMQ_URL must use amqp:// or amqps://");
    const { connect } = await import("amqplib");
    const start = Date.now();
    const connection = await withTimeout(connect(raw), "RabbitMQ");
    const channel = await withTimeout(connection.createChannel(), "RabbitMQ channel");
    await channel.close();
    await connection.close();
    return { status: "up", latencyMs: Date.now() - start, detail: parsed.hostname + ":" + (parsed.port || (parsed.protocol === "amqps:" ? 5671 : 5672)) };
  } catch (err) {
    let detail = "invalid configuration";
    try {
      const parsed = new URL(raw);
      detail = parsed.hostname + ":" + (parsed.port || (parsed.protocol === "amqps:" ? 5671 : 5672));
    } catch {}
    return { status: "down", detail, error: (err as Error).message };
  }
}

async function checkEmail(): Promise<CheckResult & {
  provider?: string; from?: string; queue?: { pending: number; sent: number; failed: number; last24h: number };
}> {
  const cfg = getEmailConfig();
  const providerLabel = cfg.provider === "console" ? "none (dev mode)" : cfg.provider;
  const configStatus = getEmailProviderConfigStatus();

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

  if (!configStatus.configured) {
    return { status: "not_configured", provider: providerLabel, queue, error: configStatus.reason };
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

// ── AI provider connectivity ──────────────────────────────────────────────────

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


async function checkGovernedProvider(
  providerId: "openai" | "gemini" | "sarvam" | "elevenlabs",
  activeProviderId: string,
  checkedBy: string | null,
): Promise<CheckResult & { active: boolean; providerId: string; enabled: boolean }> {
  const registry = await getPlatformAIRegistry();
  const provider = registry.providers.find((item) => item.providerId === providerId);
  const active = activeProviderId === providerId;

  if (!provider) {
    return { status: "down", active, enabled: false, providerId, error: "Provider is missing from the platform AI registry." };
  }
  if (!provider.enabled) {
    return { status: "not_configured", active, enabled: false, providerId, detail: "Disabled by platform admin." };
  }

  const outcome = await testProviderConnection(providerId);
  await recordProviderHealth(providerId, outcome, checkedBy);
  return {
    status: outcome.status === "healthy" ? "up" : "down",
    active,
    enabled: true,
    providerId,
    latencyMs: outcome.latencyMs ?? undefined,
    error: outcome.errorMessage ?? undefined,
    detail: outcome.status === "healthy" ? "Authenticated connectivity check passed" : "Provider connectivity check failed",
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const cronAuthorized =
      Boolean(process.env.CRON_SECRET) &&
      req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

    let checkedBy: string | null = null;
    if (!cronAuthorized) {
      const auth = await requireAuth(req);
      await requireSuperAdmin(auth);
      checkedBy = auth.user.id;
    }

    const startedAt = Date.now();

    // Postgres first — the other checks fall back gracefully if it is down.
    let postgres: Awaited<ReturnType<typeof checkPostgres>>;
    try {
      postgres = await checkPostgres();
    } catch (err) {
      postgres = { status: "down", error: (err as Error).message };
    }

    const activeProviderId = (process.env.AI_PROVIDER ?? "openai").trim().toLowerCase();
    const [redis, qdrant, rabbitmq, email, aiOpenai, aiGemini, aiSarvam, aiElevenLabs, app] = await Promise.all([
      checkRedis().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkQdrant().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkRabbitMq().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkEmail().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkGovernedProvider("openai", activeProviderId, checkedBy).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "openai", enabled: true, providerId: "openai" })),
      checkGovernedProvider("gemini", activeProviderId, checkedBy).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "gemini", enabled: true, providerId: "gemini" })),
      checkGovernedProvider("sarvam", activeProviderId, checkedBy).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "sarvam", enabled: true, providerId: "sarvam" })),
      checkGovernedProvider("elevenlabs", activeProviderId, checkedBy).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "elevenlabs", enabled: true, providerId: "elevenlabs" })),
      Promise.resolve(checkApp()),
    ]);

    const queues = await checkQueues(redis.status === "up");

    const services = { postgres, redis, qdrant, rabbitmq, email, queues, aiOpenai, aiGemini, aiSarvam, aiElevenLabs, app };

    type Alert = {
      id: string;
      severity: "warning" | "critical";
      title: string;
      message: string;
      actionLabel: string;
      actionHref: string;
    };
    const alerts: Alert[] = [];
    const addAlert = (alert: Alert) => alerts.push(alert);

    const governedProviders = [aiOpenai, aiGemini, aiSarvam, aiElevenLabs];
    for (const provider of governedProviders) {
      if (!provider.enabled) continue;
      if (provider.status === "not_configured" || provider.status === "down") {
        addAlert({
          id: `ai-provider-${provider.providerId}`,
          severity: provider.active ? "critical" : "warning",
          title: `${provider.providerId} provider requires attention`,
          message: provider.error ?? `${provider.providerId} is enabled but its credential/connectivity check failed.`,
          actionLabel: "Open AI settings",
          actionHref: "/settings/ai",
        });
      }
    }
    if (postgres.status === "down") addAlert({
      id: "postgres-down", severity: "critical", title: "PostgreSQL is down",
      message: postgres.error ?? "Database health check failed.",
      actionLabel: "Review system status", actionHref: "/system-status",
    });
    if (redis.status === "down") addAlert({
      id: "redis-down", severity: "critical", title: "Redis is down",
      message: redis.error ?? "Redis health check failed.",
      actionLabel: "Review system status", actionHref: "/system-status",
    });
    if (qdrant.status === "down") addAlert({
      id: "qdrant-down", severity: "critical", title: "Qdrant is down",
      message: qdrant.error ?? "Qdrant health check failed.",
      actionLabel: "Review system status", actionHref: "/system-status",
    });
    if (rabbitmq.status === "down") addAlert({
      id: "rabbitmq-down", severity: "critical", title: "RabbitMQ is down",
      message: rabbitmq.error ?? "RabbitMQ health check failed.",
      actionLabel: "Review system status", actionHref: "/system-status",
    });
    if (email.status === "down") addAlert({
      id: "email-down", severity: "warning", title: "Email delivery is failing",
      message: email.error ?? "Email provider health check failed.",
      actionLabel: "Review system status", actionHref: "/system-status",
    });

    const aiProviderChecks: PlatformHealthCheck[] = governedProviders
      .filter((provider) => provider.enabled)
      .map((provider) => ({
        key: `ai-provider:${provider.providerId}`,
        serviceName: provider.providerId,
        healthy: provider.status === "up",
        severity: provider.active ? "critical" as const : "warning" as const,
        message: provider.error ?? `${provider.providerId} is enabled but its connectivity check failed.`,
      }));

    const serviceChecks: PlatformHealthCheck[] = [
      { key: "postgres", serviceName: "PostgreSQL", healthy: postgres.status === "up", severity: "critical", message: postgres.error ?? "PostgreSQL health check failed." },
      { key: "redis", serviceName: "Redis", healthy: redis.status === "up", severity: "critical", message: redis.error ?? "Redis health check failed." },
      { key: "qdrant", serviceName: "Qdrant", healthy: qdrant.status === "up", severity: "critical", message: qdrant.error ?? "Qdrant health check failed." },
      { key: "rabbitmq", serviceName: "RabbitMQ", healthy: rabbitmq.status === "up", severity: "critical", message: rabbitmq.error ?? "RabbitMQ health check failed." },
      { key: "email", serviceName: "Email delivery", healthy: email.status === "up", severity: "warning", message: email.error ?? "Email delivery health check failed." },
      ...aiProviderChecks,
    ];
    await syncPlatformHealthIncidents(serviceChecks);

    const rollupEntries: Array<{ status: ServiceStatus; counts: boolean }> = [
      ...Object.values({ postgres, redis, qdrant, rabbitmq, email, queues, app }).map(
        (s) => ({ status: s.status, counts: true }),
      ),
      ...governedProviders.map((provider) => ({ status: provider.status, counts: provider.enabled })),
    ];
    const statuses = rollupEntries.filter((s) => s.counts).map((s) => s.status);
    const down = statuses.filter((s) => s === "down").length;
    const up = statuses.filter((s) => s === "up").length;
    const notConfigured = statuses.filter((s) => s === "not_configured").length;

    return NextResponse.json(
      {
        ok: down === 0,
        overall: down === 0 ? "healthy" : "degraded",
        summary: { up, down, notConfigured },
        services,
        alerts,
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
