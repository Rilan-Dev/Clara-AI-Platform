"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Database, Zap, Boxes, Rabbit, Mail, ListChecks, Server, Sparkles, CreditCard, Landmark,
  Activity, ChevronDown, ChevronUp, CircleCheck, CircleX, MinusCircle,
  Clock, Timer, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { RuntimeFlagsPanel } from "@/components/admin/RuntimeFlagsPanel";

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
  alerts: Array<{
    id: string;
    severity: "warning" | "critical";
    title: string;
    message: string;
    actionLabel: string;
    actionHref: string;
  }>;
  services: {
    postgres: BaseCheck & { pool?: { total: number; idle: number; waiting: number } };
    redis: BaseCheck;
    qdrant: BaseCheck;
    rabbitmq: BaseCheck;
    stripe: BaseCheck & { mode?: "test" | "live"; webhookConfigured: boolean; webhookEndpointConfigured?: boolean; priceChecks?: Record<string, "valid" | "invalid"> };
    razorpay: BaseCheck & { webhookConfigured: boolean };
    email: BaseCheck & {
      provider?: string;
      from?: string;
      queue?: { pending: number; sent: number; failed: number; last24h: number };
    };
    queues: BaseCheck & {
      queues?: Array<{ name: string; waiting: number; active: number; delayed: number; failed: number }>;
    };
    aiOpenai: BaseCheck & { model?: string; endpoint?: string; active?: boolean; enabled?: boolean; providerId?: string };
    aiGemini: BaseCheck & { model?: string; endpoint?: string; active?: boolean; enabled?: boolean; providerId?: string };
    aiSarvam: BaseCheck & { active?: boolean; enabled?: boolean; providerId?: string };
    aiElevenLabs: BaseCheck & { active?: boolean; enabled?: boolean; providerId?: string };
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
        <CircleX className="w-3 h-3" /> Down
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <MinusCircle className="w-3 h-3" /> Not configured
    </span>
  );
}

function LatencyTag({ ms }: { ms?: number }) {
  if (ms === undefined) return null;
  const tone = ms < 100 ? "text-emerald-600/80" : ms < 500 ? "text-amber-600/80" : "text-destructive/80";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${tone}`}>
      <Timer className="w-3 h-3" /> {ms} ms
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] text-muted-foreground/70">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[11px] text-muted-foreground">{value}</span>
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
      className={`min-w-0 rounded-2xl border p-4 sm:p-5 transition-colors ${
        check.status === "down"
          ? "border-destructive/25 bg-destructive/5"
          : check.status === "up"
            ? "border-border bg-card shadow-sm"
            : "border-border/70 bg-muted/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            check.status === "up"
              ? "border-primary/20 bg-primary/10 text-primary"
              : check.status === "down"
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : "border-border bg-muted/50 text-muted-foreground/70"
          }`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{check.detail ?? subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusPill status={check.status} />
          <LatencyTag ms={check.latencyMs} />
        </div>
      </div>

      {check.error && (
        <p className="mt-3 break-words rounded-lg bg-destructive/10 px-3 py-2 text-[11px] leading-relaxed text-destructive/90">
          {check.error}
        </p>
      )}

      {children && (
        <div className="mt-3 border-t border-border/70 pt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground/80"
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

  // force: re-run the live AI-provider checks (manual Refresh). Auto-refresh
  // reuses provider results younger than a minute.
  const fetchStatus = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const res = await fetch(apiUrl(`/api/platform/services-status${force ? "?force=1" : ""}`), { headers: withAuthHeaders() });
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
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-indigo-500/15 to-violet-500/10">
              <Activity className="h-[18px] w-[18px] sm:h-5 sm:w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">System status</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Live health of every service Clara depends on — data stores, queues,
                message broker and email delivery.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Auto {autoRefresh ? `(${secondsLeft}s)` : "off"}
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStatus(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {data?.alerts?.length ? (
          <div className="space-y-2">
            {data.alerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground break-words">{alert.message}</p>
                </div>
                <a href={alert.actionHref} className="shrink-0 text-xs font-medium underline underline-offset-4">
                  {alert.actionLabel}
                </a>
              </div>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          </div>
        ) : data ? (
          <>
            {/* ── Summary banner ────────────────────────────────────────── */}
            <div
              className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 ${
                data.summary.down > 0
                  ? "border-destructive/25 bg-destructive/5"
                  : "border-emerald-600/20 bg-emerald-500/5"
              }`}
            >
              <div className="flex items-center gap-3">
                {data.summary.down > 0 ? (
                  <CircleX className="h-8 w-8 text-destructive" />
                ) : (
                  <CircleCheck className="h-8 w-8 text-emerald-600" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {data.summary.down > 0
                      ? `${data.summary.down} service${data.summary.down > 1 ? "s" : ""} need attention`
                      : "All systems operational"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {data.summary.up} operational
                    {data.summary.notConfigured > 0 && ` · ${data.summary.notConfigured} not configured`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground/70">
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
                icon={<CreditCard className="w-5 h-5" />}
                name="Stripe payments"
                subtitle={data.services.stripe.mode ? `Stripe API · ${data.services.stripe.mode} mode` : "USD payment gateway"}
                check={data.services.stripe}
              >
                <div>
                  <DetailRow label="API mode" value={data.services.stripe.mode ?? "—"} />
                  <DetailRow label="Webhook secret" value={data.services.stripe.webhookConfigured ? "Configured" : "Missing"} />
                  <DetailRow label="Webhook endpoint" value={data.services.stripe.webhookEndpointConfigured ? "Enabled" : "Missing"} />
                  {data.services.stripe.priceChecks && Object.entries(data.services.stripe.priceChecks).map(([plan, status]) => (
                    <DetailRow key={plan} label={`${plan} price ID`} value={status} />
                  ))}
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground/70">
                    This check calls Stripe server-side, so an invalid/revoked secret is detected before checkout.
                  </p>
                </div>
              </ServiceCard>

              <ServiceCard
                icon={<Landmark className="w-5 h-5" />}
                name="Razorpay payments"
                subtitle="INR payment gateway"
                check={data.services.razorpay}
              >
                <div>
                  <DetailRow label="Webhook secret" value={data.services.razorpay.webhookConfigured ? "Configured" : "Missing"} />
                </div>
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
                    <p className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 font-mono text-[11px] leading-4 break-all text-destructive/80">
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
                    <p className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 font-mono text-[11px] leading-4 break-all text-destructive/80">
                      {data.services.aiGemini.error ?? "unreachable"}
                    </p>
                  )}
                </div>
              </ServiceCard>

              <ServiceCard
                icon={<Sparkles className="w-5 h-5" />}
                name="AI: Sarvam AI"
                subtitle={`${data.services.aiSarvam.active ? "Active provider" : "Standby"} · chat & voice`}
                check={data.services.aiSarvam}
              >
                <div>
                  <DetailRow label="Provider" value="Sarvam AI" />
                  <DetailRow label="Connectivity" value={data.services.aiSarvam.detail ?? "—"} />
                </div>
              </ServiceCard>

              <ServiceCard
                icon={<Sparkles className="w-5 h-5" />}
                name="AI: ElevenLabs"
                subtitle={`${data.services.aiElevenLabs.active ? "Active provider" : "Standby"} · voice & realtime`}
                check={data.services.aiElevenLabs}
              >
                <div>
                  <DetailRow label="Provider" value="ElevenLabs" />
                  <DetailRow label="Connectivity" value={data.services.aiElevenLabs.detail ?? "—"} />
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
                      <div key={q.name} className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="font-mono text-[11px] text-muted-foreground">{q.name}</p>
                        <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px]">
                          <div><p className="text-muted-foreground/70">waiting</p><p className="font-mono text-muted-foreground">{q.waiting}</p></div>
                          <div><p className="text-muted-foreground/70">active</p><p className="font-mono text-muted-foreground">{q.active}</p></div>
                          <div><p className="text-muted-foreground/70">delayed</p><p className="font-mono text-muted-foreground">{q.delayed}</p></div>
                          <div><p className={q.failed > 0 ? "text-destructive/70" : "text-muted-foreground/70"}>failed</p><p className={`font-mono ${q.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}>{q.failed}</p></div>
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

            <RuntimeFlagsPanel />

            <p className="pb-4 text-center text-xs text-muted-foreground">
              Status checks run server-side and never expose provider credentials.
              Enabled provider failures create a persistent platform incident and
              notify active super-admins; repeated refreshes do not spam duplicate alerts.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
