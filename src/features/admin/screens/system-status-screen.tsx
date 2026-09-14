"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Database, Zap, Boxes, Rabbit, Mail, ListChecks, Server, Sparkles,
  Activity, ChevronDown, ChevronUp, CircleCheck, CircleX, MinusCircle,
  Clock, Timer, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

/**
 * SystemStatusScreen — /system-status (platform admin)
 * ─────────────────────────────────────────────────────────────────────────────
 * Live status of EVERY service the platform depends on: PostgreSQL, Redis,
 * Qdrant, RabbitMQ, email delivery, background queues and the app server.
 *
 * Design goals ("useful, not rushed"):
 *   - one calm summary banner, not a wall of alarms
 *   - one card per service with the 1-2 numbers that actually matter
 *   - details (pool stats, queue depths, email backlog) collapse behind a
 *     chevron so the default view stays scannable
 *   - auto-refresh every 30s with a visible countdown; any manual action
 *     resets the cycle
 */

type ServiceStatus = "up" | "down" | "not_configured";

type BaseCheck = {
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
  error?: string;
};

type StatusPayload = {
  ok: boolean;
  overall: "healthy" | "degraded";
  summary: { up: number; down: number; notConfigured: number };
  checkedAt: string;
  durationMs: number;
  services: {
    postgres: BaseCheck & { pool?: { total: number; idle: number; waiting: number } };
    redis: BaseCheck;
    qdrant: BaseCheck;
    rabbitmq: BaseCheck;
    email: BaseCheck & {
      provider?: string;
      from?: string;
      queue?: { pending: number; sent: number; failed: number; last24h: number };
    };
    queues: BaseCheck & {
      queues?: Array<{ name: string; waiting: number; active: number; delayed: number; failed: number }>;
    };
    aiOpenai: BaseCheck & { model?: string; endpoint?: string; active?: boolean };
    aiGemini: BaseCheck & { model?: string; endpoint?: string; active?: boolean };
    app: BaseCheck & {
      uptimeSeconds: number;
      memory?: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
      versions?: { node: string; env: string };
    };
  };
};

const REFRESH_INTERVAL_MS = 30_000;

function StatusPill({ status }: { status: ServiceStatus }) {
  if (status === "up") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        Operational
      </span>
    );
  }
  if (status === "down") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300">
        <CircleX className="w-3 h-3" /> Down
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/45">
      <MinusCircle className="w-3 h-3" /> Not configured
    </span>
  );
}

function LatencyTag({ ms }: { ms?: number }) {
  if (ms === undefined) return null;
  const tone = ms < 100 ? "text-emerald-300/80" : ms < 500 ? "text-amber-300/80" : "text-red-300/80";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${tone}`}>
      <Timer className="w-3 h-3" /> {ms} ms
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] text-white/35">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[11px] text-white/65">{value}</span>
    </div>
  );
}

function ServiceCard({
  icon, name, subtitle, check, children,
}: {
  icon: React.ReactNode;
  name: string;
  subtitle: string;
  check: BaseCheck;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`min-w-0 rounded-2xl border p-5 transition-colors ${
        check.status === "down"
          ? "border-red-500/25 bg-red-500/[0.04]"
          : check.status === "up"
            ? "border-white/[0.08] bg-white/[0.02]"
            : "border-white/[0.06] bg-white/[0.01]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            check.status === "up"
              ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-300"
              : check.status === "down"
                ? "border-red-500/20 bg-red-500/10 text-red-300"
                : "border-white/10 bg-white/[0.03] text-white/30"
          }`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{name}</h3>
            <p className="mt-0.5 truncate text-xs text-white/40">{check.detail ?? subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusPill status={check.status} />
          <LatencyTag ms={check.latencyMs} />
        </div>
      </div>

      {check.error && (
        <p className="mt-3 break-words rounded-lg bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-300/90">
          {check.error}
        </p>
      )}

      {children && (
        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[11px] font-medium text-white/45 transition-colors hover:text-white/75"
            aria-expanded={open}
          >
            Details
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {open && <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
        </div>
      )}
    </div>
  );
}

export function SystemStatusScreen() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_INTERVAL_MS / 1000);
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(apiUrl("/api/platform/services-status"), { headers: withAuthHeaders() });
      const payload = await res.json() as StatusPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to load status");
      if (mounted.current) {
        setData(payload);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) {
        setRefreshing(false);
        setLoading(false);
        setSecondsLeft(REFRESH_INTERVAL_MS / 1000);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchStatus();
    return () => { mounted.current = false; };
  }, [fetchStatus]);

  // Countdown + auto-refresh cycle.
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          void fetchStatus();
          return REFRESH_INTERVAL_MS / 1000;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchStatus]);

  const checkedAt = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString()
    : "—";

  const fmtUptime = (s: number) => {
    const days = Math.floor(s / 86_400);
    const hours = Math.floor((s % 86_400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    return `${days ? `${days}d ` : ""}${hours}h ${mins}m`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-indigo-500/15 to-violet-500/10">
              <Activity className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">System status</h1>
              <p className="mt-1 text-sm text-white/45">
                Live health of every service Clara depends on — data stores, queues,
                message broker and email delivery.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-500"
              />
              Auto {autoRefresh ? `(${secondsLeft}s)` : "off"}
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStatus()}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/[0.03]" />
              ))}
            </div>
          </div>
        ) : data ? (
          <>
            {/* ── Summary banner ────────────────────────────────────────── */}
            <div
              className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${
                data.summary.down > 0
                  ? "border-red-500/25 bg-red-500/[0.06]"
                  : "border-emerald-500/20 bg-emerald-500/[0.05]"
              }`}
            >
              <div className="flex items-center gap-3">
                {data.summary.down > 0 ? (
                  <CircleX className="h-8 w-8 text-red-400" />
                ) : (
                  <CircleCheck className="h-8 w-8 text-emerald-400" />
                )}
                <div>
                  <p className="text-sm font-semibold text-white">
                    {data.summary.down > 0
                      ? `${data.summary.down} service${data.summary.down > 1 ? "s" : ""} need attention`
                      : "All systems operational"}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    {data.summary.up} operational
                    {data.summary.notConfigured > 0 && ` · ${data.summary.notConfigured} not configured`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-white/35">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Checked {checkedAt}
                </span>
                <span className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" /> Full scan {data.durationMs} ms
                </span>
              </div>
            </div>

            {/* ── Services grid ─────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <ServiceCard
                icon={<Database className="w-5 h-5" />}
                name="PostgreSQL"
                subtitle="Primary relational store"
                check={data.services.postgres}
              >
                {data.services.postgres.pool && (
                  <div>
                    <DetailRow label="Migrations applied" value={data.services.postgres.detail?.split(" ")[0] ?? "—"} />
                    <DetailRow label="Pool connections" value={`${data.services.postgres.pool.total} total · ${data.services.postgres.pool.idle} idle · ${data.services.postgres.pool.waiting} waiting`} />
                  </div>
                )}
              </ServiceCard>

              <ServiceCard
                icon={<Zap className="w-5 h-5" />}
                name="Redis"
                subtitle="Cache & BullMQ job backend"
                check={data.services.redis}
              />

              <ServiceCard
                icon={<Boxes className="w-5 h-5" />}
                name="Qdrant"
                subtitle="Vector search store"
                check={data.services.qdrant}
              />

              <ServiceCard
                icon={<Rabbit className="w-5 h-5" />}
                name="RabbitMQ"
                subtitle="Event outbox message broker"
                check={data.services.rabbitmq}
              />

              <ServiceCard
                icon={<Mail className="w-5 h-5" />}
                name="Email delivery"
                subtitle={`Provider: ${data.services.email.provider ?? "—"}`}
                check={data.services.email}
              >
                {data.services.email.queue && (
                  <div>
                    {data.services.email.from && <DetailRow label="Sender" value={data.services.email.from} />}
                    <DetailRow label="Notifications sent" value={String(data.services.email.queue.sent)} />
                    <DetailRow label="Pending" value={String(data.services.email.queue.pending)} />
                    <DetailRow label="Failed (retryable)" value={String(data.services.email.queue.failed)} />
                    <DetailRow label="Queued last 24h" value={String(data.services.email.queue.last24h)} />
                  </div>
                )}
              </ServiceCard>

              <ServiceCard
                icon={<Sparkles className="w-5 h-5" />}
                name="AI: OpenAI"
                subtitle={`${data.services.aiOpenai.active ? "Active provider" : "Standby"} · embeddings & chat`}
                check={data.services.aiOpenai}
              >
                <div>
                  <DetailRow label="Embedding model" value={data.services.aiOpenai.model ?? "—"} />
                  <DetailRow label="Endpoint" value={data.services.aiOpenai.endpoint?.replace(/^https?:\/\//, "") ?? "—"} />
                  {data.services.aiOpenai.status === "down" && (
                    <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 font-mono text-[10px] leading-4 break-all text-red-200/80">
                      {data.services.aiOpenai.error ?? "unreachable"}
                    </p>
                  )}
                </div>
              </ServiceCard>

              <ServiceCard
                icon={<Sparkles className="w-5 h-5" />}
                name="AI: Gemini"
                subtitle={`${data.services.aiGemini.active ? "Active provider" : "Standby"} · embeddings & chat`}
                check={data.services.aiGemini}
              >
                <div>
                  <DetailRow label="Embedding model" value={data.services.aiGemini.model ?? "—"} />
                  <DetailRow label="Endpoint" value={data.services.aiGemini.endpoint?.replace(/^https?:\/\//, "") ?? "—"} />
                  {data.services.aiGemini.status === "down" && (
                    <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 font-mono text-[10px] leading-4 break-all text-red-200/80">
                      {data.services.aiGemini.error ?? "unreachable"}
                    </p>
                  )}
                </div>
              </ServiceCard>

              <ServiceCard
                icon={<ListChecks className="w-5 h-5" />}
                name="Background queues"
                subtitle="Crawl & retry workers (BullMQ)"
                check={data.services.queues}
              >
                {data.services.queues.queues && (
                  <div className="space-y-2">
                    {data.services.queues.queues.map((q) => (
                      <div key={q.name} className="rounded-lg bg-white/[0.03] px-3 py-2">
                        <p className="font-mono text-[11px] text-white/60">{q.name}</p>
                        <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[10px]">
                          <div><p className="text-white/30">waiting</p><p className="font-mono text-white/70">{q.waiting}</p></div>
                          <div><p className="text-white/30">active</p><p className="font-mono text-white/70">{q.active}</p></div>
                          <div><p className="text-white/30">delayed</p><p className="font-mono text-white/70">{q.delayed}</p></div>
                          <div><p className={q.failed > 0 ? "text-red-300/60" : "text-white/30"}>failed</p><p className={`font-mono ${q.failed > 0 ? "text-red-300" : "text-white/70"}`}>{q.failed}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ServiceCard>

              <ServiceCard
                icon={<Server className="w-5 h-5" />}
                name="Application server"
                subtitle={`Node ${data.services.app.versions?.node ?? ""} · ${(data.services.app.versions?.env ?? "development")}`}
                check={data.services.app}
              >
                {data.services.app.memory && (
                  <div>
                    <DetailRow label="Uptime" value={fmtUptime(data.services.app.uptimeSeconds)} />
                    <DetailRow label="Memory (RSS)" value={`${data.services.app.memory.rssMb} MB`} />
                    <DetailRow label="Heap" value={`${data.services.app.memory.heapUsedMb} / ${data.services.app.memory.heapTotalMb} MB`} />
                  </div>
                )}
              </ServiceCard>
            </div>

            <p className="pb-4 text-center text-[11px] text-white/25">
              Status checks are read-only and run on demand — no service is modified.
              Not-configured services are monitored automatically once their
              settings exist.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
