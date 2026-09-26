import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getEmailConfig, getEmailProviderConfigStatus } from "@/lib/email";
import { getPlatformAIRegistry, recordProviderHealth } from "@/modules/ai-governance/core/registry-db";
import { testProviderConnection } from "@/modules/ai-governance/core/health";
import { syncPlatformHealthIncidents, type PlatformHealthCheck } from "@/modules/platform-health/core/incidents";
import { checkRazorpayGateway, checkStripeGateway, type PaymentGatewayHealth } from "@/modules/billing/core/health";

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

/**
 * Per-check timeout. 2.5 s was too tight for a busy self-hosted VPS (one
 * Node process, local Postgres/Qdrant/RabbitMQ sharing the CPU) and made
 * healthy services flap to "down". Override with HEALTH_CHECK_TIMEOUT_MS.
 */
const CHECK_TIMEOUT_MS = (() => {
  const value = Number(process.env.HEALTH_CHECK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 5_000;
})();

/** A failed infrastructure check is retried once after this pause. */
const RETRY_DELAY_MS = 750;

/** Live AI-provider checks call the vendor APIs; reuse a result this long. */
const PROVIDER_CHECK_TTL_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Report "down" only when a check fails twice in a row. One slow answer
 * (GC pause, a busy connection, a container briefly restarting its
 * listener) must not flip the status page and email every super admin.
 */
async function confirmed<T extends CheckResult>(run: () => Promise<T>): Promise<T> {
  const attempt = () => run().catch((err): T => ({ status: "down", error: (err as Error).message }) as T);
  const first = await attempt();
  if (first.status !== "down") return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  const second = await attempt();
  if (second.status === "down") return second;
  return { ...second, detail: [second.detail, "recovered on retry"].filter(Boolean).join(" · ") };
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
    const connecting = connect(raw, { timeout: CHECK_TIMEOUT_MS });
    let connection: Awaited<typeof connecting>;
    try {
      connection = await withTimeout(connecting, "RabbitMQ");
    } catch (err) {
      // A connection that completes after the timeout must still be closed,
      // otherwise every slow check leaks an AMQP connection.
      void connecting.then((late) => late.close()).catch(() => {});
      throw err;
    }
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
    // Failed jobs are history, not an outage: BullMQ keeps them until they
    // are cleaned, so a long-running VPS accumulates them. Surface them as a
    // warning (see alerts) instead of reporting the queues as down.
    return {
      status: "up",
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
    detail: `${process.env.VERCEL ? "Vercel" : "Self-hosted"} · up ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m · DB pool ${pool.options.max ?? "?"}`,
    memory: {
      rssMb: Math.round(mem.rss / 1_048_576),
      heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
      heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
    },
    versions: {
      node: process.version,
      env: process.env.NODE_ENV ?? "development",
      platform: process.env.VERCEL ? "vercel" : "self-hosted",
    },
  };
}


type ProviderCheckOutcome = Awaited<ReturnType<typeof testProviderConnection>>;
const providerCheckCache = new Map<string, { at: number; outcome: ProviderCheckOutcome }>();

async function checkGovernedProvider(
  providerId: "openai" | "gemini" | "sarvam" | "elevenlabs",
  activeProviderId: string,
  checkedBy: string | null,
  force = false,
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

  // The status page auto-refreshes every 30 s; calling four vendor APIs and
  // writing four health rows on every refresh wastes quota and DB writes.
  const cached = providerCheckCache.get(providerId);
  let outcome: ProviderCheckOutcome;
  if (!force && cached && Date.now() - cached.at < PROVIDER_CHECK_TTL_MS) {
    outcome = cached.outcome;
  } else {
    outcome = await testProviderConnection(providerId);
    providerCheckCache.set(providerId, { at: Date.now(), outcome });
    await recordProviderHealth(providerId, outcome, checkedBy);
  }
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
    // Manual "Refresh" and the cron re-run the live AI-provider checks;
    // auto-refresh reuses results younger than PROVIDER_CHECK_TTL_MS.
    const force = cronAuthorized || req.nextUrl.searchParams.get("force") === "1";

    // Postgres first — the other checks fall back gracefully if it is down.
    const postgres: Awaited<ReturnType<typeof checkPostgres>> = await confirmed(checkPostgres);

    const platformRegistry = await getPlatformAIRegistry();
    const activeProviderId =
      platformRegistry.defaults.find((item) => item.capability === "chat")?.providerId?.toLowerCase() ??
      (process.env.AI_PROVIDER ?? "openai").trim().toLowerCase();
    const [redis, qdrant, rabbitmq, email, stripe, razorpay, aiOpenai, aiGemini, aiSarvam, aiElevenLabs, app] = await Promise.all([
      confirmed(checkRedis),
      confirmed(checkQdrant),
      confirmed(checkRabbitMq),
      checkEmail().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkStripeGateway().catch((e): PaymentGatewayHealth => ({ status: "down", error: (e as Error).message, webhookConfigured: false })),
      checkRazorpayGateway().catch((e): PaymentGatewayHealth => ({ status: "down", error: (e as Error).message, webhookConfigured: false })),
      checkGovernedProvider("openai", activeProviderId, checkedBy, force).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "openai", enabled: true, providerId: "openai" })),
      checkGovernedProvider("gemini", activeProviderId, checkedBy, force).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "gemini", enabled: true, providerId: "gemini" })),
      checkGovernedProvider("sarvam", activeProviderId, checkedBy, force).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "sarvam", enabled: true, providerId: "sarvam" })),
      checkGovernedProvider("elevenlabs", activeProviderId, checkedBy, force).catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: activeProviderId === "elevenlabs", enabled: true, providerId: "elevenlabs" })),
      Promise.resolve(checkApp()),
    ]);

    const queues = await confirmed(() => checkQueues(redis.status === "up"));

    const services = { postgres, redis, qdrant, rabbitmq, email, queues, stripe, razorpay, aiOpenai, aiGemini, aiSarvam, aiElevenLabs, app };

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
    const failedJobs = (queues.queues ?? []).reduce((sum, q) => sum + q.failed, 0);
    if (failedJobs > 100) addAlert({
      id: "queues-failed-jobs", severity: "warning", title: "Background jobs have failed",
      message: `${failedJobs} crawl/retry jobs failed. The workers are running; review and clean the failed jobs.`,
      actionLabel: "Review system status", actionHref: "/system-status",
    });
    if (email.status === "down") addAlert({
      id: "email-down", severity: "warning", title: "Email delivery is failing",
      message: email.error ?? "Email provider health check failed.",
      actionLabel: "Review system status", actionHref: "/system-status",
    });
    if (stripe.status === "down") addAlert({
      id: "stripe-down", severity: "critical", title: "Stripe payments require attention",
      message: stripe.error ?? stripe.detail ?? "Stripe payment gateway health check failed.",
      actionLabel: "Open payment settings", actionHref: "/settings/payments",
    });
    if (razorpay.status === "down") addAlert({
      id: "razorpay-down", severity: "critical", title: "Razorpay payments require attention",
      message: razorpay.error ?? razorpay.detail ?? "Razorpay payment gateway health check failed.",
      actionLabel: "Open payment settings", actionHref: "/settings/payments",
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
      { key: "stripe", serviceName: "Stripe payments", healthy: stripe.status === "up", severity: "critical", message: stripe.error ?? stripe.detail ?? "Stripe payment gateway health check failed." },
      { key: "razorpay", serviceName: "Razorpay payments", healthy: razorpay.status === "up", severity: "critical", message: razorpay.error ?? razorpay.detail ?? "Razorpay payment gateway health check failed." },
      ...aiProviderChecks,
    ];
    await syncPlatformHealthIncidents(serviceChecks);

    const rollupEntries: Array<{ status: ServiceStatus; counts: boolean }> = [
      ...Object.values({ postgres, redis, qdrant, rabbitmq, email, queues, stripe, razorpay, app }).map(
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
