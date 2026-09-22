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

// ── AI provider connectivity ──────────────────────────────────────────────────

const AI_CHECK_TIMEOUT_MS = 10_000;

/**
 * Live embedding round-trip against a provider using the configured key.
 * This is the check that answers "why do my uploads keep failing?" — when the
 * server's network cannot reach the provider (geo-block, firewall, DNS), the
 * raw provider error is surfaced verbatim so the operator knows exactly what
 * to fix (e.g. switch AI_PROVIDER to the other provider).
 */
async function checkAiEmbedding(
  providerName: "openai" | "gemini",
): Promise<CheckResult & { model?: string; endpoint?: string; active?: boolean }> {
  const active = (process.env.AI_PROVIDER ?? "openai").toLowerCase() === providerName;
  const apiKey = (providerName === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)?.trim();
  const model = (providerName === "openai"
    ? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
    : process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001").trim();

  if (!apiKey) return { status: "not_configured", model, active, detail: "API key not set" };

  const endpoint = providerName === "openai"
    ? `${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/embeddings`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

  const start = Date.now();
  try {
    let res: Response;
    if (providerName === "openai") {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: ["connectivity check"], model, dimensions: 16 }),
        signal: AbortSignal.timeout(AI_CHECK_TIMEOUT_MS),
      });
    } else {
      res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: "connectivity check" }] },
          outputDimensionality: 16,
        }),
        signal: AbortSignal.timeout(AI_CHECK_TIMEOUT_MS),
      });
    }
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return {
        status: "down",
        latencyMs,
        model,
        endpoint,
        active,
        error: `HTTP ${res.status}: ${body}`,
      };
    }
    return { status: "up", latencyMs, model, endpoint, active, detail: "embedding round-trip OK" };
  } catch (err) {
    return {
      status: "down",
      model,
      endpoint,
      active,
      error: (err as Error).message,
    };
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

    const [redis, qdrant, rabbitmq, email, aiOpenai, aiGemini, app] = await Promise.all([
      checkRedis().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkQdrant().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkRabbitMq().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkEmail().catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message })),
      checkAiEmbedding("openai").catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: (process.env.AI_PROVIDER ?? "openai").toLowerCase() === "openai" })),
      checkAiEmbedding("gemini").catch((e) => ({ status: "down" as ServiceStatus, error: (e as Error).message, active: (process.env.AI_PROVIDER ?? "openai").toLowerCase() === "gemini" })),
      Promise.resolve(checkApp()),
    ]);

    const queues = await checkQueues(redis.status === "up");

    const services = { postgres, redis, qdrant, rabbitmq, email, queues, aiOpenai, aiGemini, app };

    const alerts: Array<{
      id: string;
      severity: "warning" | "critical";
      title: string;
      message: string;
      actionLabel?: string;
      actionHref?: string;
    }> = [];

    const activeProvider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
    const activeAI = activeProvider === "gemini" ? aiGemini : aiOpenai;
    if (activeAI.status === "not_configured") {
      alerts.push({
        id: `ai-${activeProvider}-credentials`,
        severity: "critical",
        title: `${activeProvider === "openai" ? "OpenAI" : "Gemini"} credentials are missing`,
        message: `The active AI provider has no usable server credential. AI chat/embedding jobs may fail. Add the provider credential in Platform → AI Platform, then run the provider connection test.`,
        actionLabel: "Open AI Platform",
        actionHref: "/settings/ai-platform",
      });
    } else if (activeAI.status === "down") {
      alerts.push({
        id: `ai-${activeProvider}-down`,
        severity: "critical",
        title: `${activeProvider === "openai" ? "OpenAI" : "Gemini"} is unavailable`,
        message: activeAI.error ?? "The active AI provider connectivity check failed.",
        actionLabel: "Open AI Platform",
        actionHref: "/settings/ai-platform",
      });
    }

    if (redis.status === "down") {
      alerts.push({
        id: "redis-down",
        severity: "critical",
        title: "Redis is unavailable",
        message: redis.error ?? "Queue/cache connectivity failed. Background jobs and cache-backed features may be affected.",
      });
    }

    if (postgres.status === "down") {
      alerts.push({
        id: "postgres-down",
        severity: "critical",
        title: "PostgreSQL is unavailable",
        message: postgres.error ?? "The primary database health check failed. Authentication, configuration and tenant data may be unavailable.",
      });
    }

    if (qdrant.status === "down") {
      alerts.push({
        id: "qdrant-down",
        severity: "critical",
        title: "Qdrant is unavailable",
        message: qdrant.error ?? "Vector retrieval/ingestion health check failed.",
      });
    }

    // Roll-up: down services (excluding not_configured) mark the platform degraded.
    // AI providers only count when they are the ACTIVE provider — an unreachable
    // standby is visible on its card but does not degrade the whole platform.
    const aiOpenaiActive = aiOpenai.active ?? false;
    const aiGeminiActive = aiGemini.active ?? false;
    const rollupEntries: Array<{ status: ServiceStatus; counts: boolean }> = [
      ...Object.values({ postgres, redis, qdrant, rabbitmq, email, queues, app }).map(
        (s) => ({ status: s.status, counts: true }),
      ),
      { status: aiOpenai.status, counts: aiOpenaiActive },
      { status: aiGemini.status, counts: aiGeminiActive },
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
        alerts,
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
