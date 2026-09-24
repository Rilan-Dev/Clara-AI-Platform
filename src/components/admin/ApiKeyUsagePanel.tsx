"use client";

/**
 * Deploy tab — request usage for this knowledge base's API keys, from
 * GET /api/kbs/[kbId]/api-keys/usage (previously built but never shown).
 *
 * Stat tiles for the org-wide 24h / 7d / 30d totals, a 24-hour bar sparkline
 * (one series, so one hue and no legend), and a per-key table that doubles
 * as the accessible text view of the numbers.
 */

import { useCallback, useEffect, useState } from "react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { LoadError } from "@/components/ui/load-error";

type KeyUsage = {
  keyId: string; keyName: string; keyPrefix: string; isActive: boolean;
  thisHour: number; last24h: number; last7d: number; last30d: number;
  lastUsedAt: string | null;
};

type UsageResponse = {
  quota: { planName: string; maxReqDay: number; orgDailyUsage: number; percentUsed: number | null } | null;
  keys: KeyUsage[];
  hourly: { hour: string; count: number }[];
  summary: { last24h: number; last7d: number; last30d: number };
};

const fmt = (n: number) => n.toLocaleString();

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Sparkline({ points }: { points: UsageResponse["hourly"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const active = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-medium text-muted-foreground">Requests per hour · last 24 hours</h4>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {active ? `${hourLabel(active.hour)} — ${fmt(active.count)} requests` : `${fmt(total)} total`}
        </p>
      </div>
      <div
        className="flex h-16 items-end gap-[2px] border-b border-border"
        role="img"
        aria-label={`Hourly requests over the last 24 hours, ${fmt(total)} in total, peak ${fmt(max)} in one hour.`}
        onMouseLeave={() => setHover(null)}
      >
        {points.map((p, i) => (
          <div
            key={p.hour}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            title={`${hourLabel(p.hour)}: ${fmt(p.count)} requests`}
          >
            <div
              className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-primary" : "bg-primary/70"}`}
              style={{ height: p.count === 0 ? 0 : `${Math.max(6, (p.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      {points.length > 0 && (
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{hourLabel(points[0]!.hour)}</span>
          <span>now</span>
        </div>
      )}
    </div>
  );
}

export function ApiKeyUsagePanel({ kbId }: { kbId: string }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/kbs/${kbId}/api-keys/usage`), { headers: withAuthHeaders() });
      const body = (await res.json().catch(() => ({}))) as UsageResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div role="status" className="h-40 animate-pulse rounded-2xl bg-muted" aria-label="Loading usage" />;
  }
  if (error) return <LoadError message="API usage couldn't be loaded." detail={error} onRetry={() => void load()} />;
  if (!data) return null;

  const tiles = [
    { label: "Last 24 hours", value: data.summary.last24h },
    { label: "Last 7 days", value: data.summary.last7d },
    { label: "Last 30 days", value: data.summary.last30d },
  ];

  return (
    <section aria-labelledby={`usage-${kbId}`} className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`usage-${kbId}`} className="text-sm font-semibold text-foreground">API usage</h3>
        {data.quota && (
          <p className="text-xs text-muted-foreground">
            Today: {fmt(data.quota.orgDailyUsage)}
            {data.quota.maxReqDay === -1 ? " requests (unlimited plan)" : ` of ${fmt(data.quota.maxReqDay)} daily requests`}
            {data.quota.percentUsed !== null ? ` · ${data.quota.percentUsed}% used` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-lg sm:text-xl font-bold text-foreground">{fmt(t.value)}</div>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Organisation-wide totals across all API keys.</p>

      <Sparkline points={data.hourly} />

      {data.keys.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Requests per API key for this knowledge base</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Key</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">This hour</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">24 h</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">7 days</th>
                <th scope="col" className="py-2 pl-3 font-medium text-right">30 days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.keys.map((k) => (
                <tr key={k.keyId}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="text-foreground">{k.keyName}</span>{" "}
                    <code className="text-xs text-muted-foreground">{k.keyPrefix}…</code>
                    {!k.isActive && <span className="ml-1 text-xs text-muted-foreground">(revoked)</span>}
                  </th>
                  <td className="py-2 px-3 text-right tabular-nums text-foreground">{fmt(k.thisHour)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-foreground">{fmt(k.last24h)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-foreground">{fmt(k.last7d)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-foreground">{fmt(k.last30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
