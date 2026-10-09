"use client";
/**
 * AnalyticsDashboard — per-KB usage analytics:
 *   • Stat cards (total queries, this week, avg latency, avg sources)
 *   • SVG bar chart — daily query volume (last 30 days)
 *   • Top 10 queries table
 */
import type { KbAnalytics } from "@/modules/admin-ui/api";

type Props = { analytics: KbAnalytics };

export function AnalyticsDashboard({ analytics }: Props) {
  const { totalQueries, queriesThisWeek, queriesPerDay, topQueries, avgLatencyMs, avgSourceCount } = analytics;

  // Build SVG bar chart from queriesPerDay
  const BAR_W   = 12;
  const GAP     = 3;
  const CHART_H = 80;
  const maxCount = Math.max(...queriesPerDay.map((d) => d.count), 1);

  // Only show last 30 days; if fewer, show what we have
  const bars = queriesPerDay.slice(-30);

  const chartWidth = bars.length * (BAR_W + GAP);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Queries"    value={totalQueries.toLocaleString()}               color="primary" />
        <StatCard label="This Week"        value={queriesThisWeek.toLocaleString()}             color="success" />
        <StatCard label="Avg Latency"      value={avgLatencyMs != null ? `${avgLatencyMs} ms` : "—"} color="foreground" />
        <StatCard label="Avg Sources/Query" value={avgSourceCount != null ? avgSourceCount.toFixed(1) : "—"} color="foreground" />
      </div>

      {/* Bar chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Daily Query Volume (last 30 days)</h3>
        {bars.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No query data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <svg
              width={Math.max(chartWidth, 200)}
              height={CHART_H + 24}
              className="block"
            >
              {bars.map((day, i) => {
                const barH = Math.max(2, Math.round((day.count / maxCount) * CHART_H));
                const x = i * (BAR_W + GAP);
                const y = CHART_H - barH;
                return (
                  <g key={day.date}>
                    <rect
                      x={x} y={y}
                      width={BAR_W} height={barH}
                      className="fill-primary/70 hover:fill-primary transition-colors"
                      rx={2}
                    >
                      <title>{formatDate(day.date)}: {day.count} queries</title>
                    </rect>
                  </g>
                );
              })}
              {/* X axis */}
              <line
                x1={0} y1={CHART_H} x2={chartWidth} y2={CHART_H}
                stroke="hsl(var(--border))" strokeWidth={1}
              />
              {/* First and last date labels */}
              {bars.length > 0 && (
                <>
                  <text x={0} y={CHART_H + 16} className="text-[11px]" fill="hsl(var(--muted-foreground))">
                    {formatDate(bars[0]!.date)}
                  </text>
                  <text
                    x={chartWidth} y={CHART_H + 16}
                    textAnchor="end"
                    className="text-[11px]"
                    fill="hsl(var(--muted-foreground))"
                  >
                    {formatDate(bars[bars.length - 1]!.date)}
                  </text>
                </>
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Top queries */}
      {topQueries.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">Top Queries</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">#</th>
                <th className="px-5 py-2.5 text-left font-medium">Query</th>
                <th className="px-5 py-2.5 text-right font-medium">Count</th>
                <th className="px-5 py-2.5 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topQueries.map((q, i) => {
                const pct = totalQueries > 0 ? ((q.count / totalQueries) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={i} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="max-w-xs break-words [overflow-wrap:anywhere] px-5 py-2.5 font-medium text-foreground">{q.queryText}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-foreground">{q.count}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {topQueries.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 py-12 text-center">
          <p className="text-sm text-muted-foreground">No query data yet. Analytics are recorded as users search this knowledge base.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    primary:    "text-primary",
    success:    "text-success",
    foreground: "text-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${colorMap[color] ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
