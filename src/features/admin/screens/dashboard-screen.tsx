"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  TrendingUp,
  Activity,
  Database,
  FileText,
  DollarSign,
  RefreshCw,
  BarChart3,
  Bot,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import http from "@/lib/http";
import { LoadError } from "@/components/ui/load-error";
import { useAuth } from "@/modules/admin-ui/hooks";

type Stats = {
  totalOrgs: number;
  totalUsers: number;
  mrr: number;
  payingOrgs: number;
  totalQueries: number;
  totalKbs: number;
  totalDocuments: number;
  totalQueriesThisMonth: number;
  totalAgents: number;
};
type Revenue = {
  totalMrr: number;
  totalArr: number;
  byPlan: {
    plan_id: string;
    plan_name: string;
    price_usd: number;
    org_count: number;
    plan_mrr: number;
  }[];
  planDist: { plan_id: string; count: number }[];
};
const PLAN_BAR: Record<string, string> = {
  free: "bg-slate-500",
  starter: "bg-cyan-500",
  pro: "bg-indigo-500",
  enterprise: "bg-amber-500",
};

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, primaryOrgId } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!user?.isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    Promise.all([
      http.get<Stats>("/platform/stats"),
      http.get<Revenue>("/platform/revenue"),
    ])
      .then(([s, r]) => {
        setStats(s.data);
        setRevenue(r.data);
      })
      .catch((err: unknown) => setLoadError((err as Error)?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [user?.isSuperAdmin]);
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!user.isSuperAdmin) {
      router.replace(primaryOrgId ? `/orgs/${primaryOrgId}` : "/settings/account");
      return;
    }
    load();
  }, [authLoading, load, primaryOrgId, router, user]);
  if (authLoading || !user?.isSuperAdmin) {
    return <div className="min-h-[60vh] bg-background" aria-hidden="true" />;
  }

  const arr = (stats?.mrr ?? 0) * 12;
  const arpu =
    stats && stats.payingOrgs > 0
      ? Math.round(stats.mrr / stats.payingOrgs)
      : 0;
  const total = Math.max(stats?.totalOrgs ?? 0, 1);
  const cards = [
    ["Organisations", stats?.totalOrgs, "text-violet-600", Building2],
    ["Agents", stats?.totalAgents, "text-fuchsia-600", Bot],
    ["Knowledge Bases", stats?.totalKbs, "text-primary", Database],
    ["Users", stats?.totalUsers, "text-sky-600", Users],
    ["Documents", stats?.totalDocuments, "text-pink-600", FileText],
    [
      "MRR",
      stats ? `$${stats.mrr.toLocaleString()}` : "—",
      "text-emerald-600",
      DollarSign,
    ],
    [
      "ARR",
      stats ? `$${arr.toLocaleString()}` : "—",
      "text-emerald-600",
      TrendingUp,
    ],
    [
      "Queries This Month",
      stats?.totalQueriesThisMonth?.toLocaleString(),
      "text-amber-600",
      Activity,
    ],
    ["ARPU", arpu ? `$${arpu}` : "—", "text-blue-600", BarChart3],
  ] as const;
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Mobile: tight single row — title + icon refresh; desktop keeps
          the two text buttons. Long subtitle hidden on phones. */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">Platform Overview</h1>
          <p className="hidden sm:block text-muted-foreground/70 text-sm mt-0.5">
            Platform-wide counts and billing — organisation content is managed by each organisation itself.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/subscriptions" className="hidden sm:inline-flex text-xs text-muted-foreground hover:text-foreground border border-border px-3 py-2 rounded-lg">
            Subscriptions
          </Link>
          <button
            onClick={load}
            aria-label="Refresh stats"
            className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-foreground border border-border px-3 py-2 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
      <div className="space-y-4 sm:space-y-6">
          {loadError && (
            <LoadError
              message="Platform stats couldn't be loaded — the numbers below may be missing."
              detail={loadError}
              onRetry={load}
            />
          )}
          {/* Mobile: compact 2-col stat grid — tighter padding, label + value
              only; desktop keeps the roomy 5-col layout. */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-4">
            {cards.map(([label, value, color, Icon]) => (
              <div
                key={label}
                className="border border-border bg-card rounded-2xl p-3 sm:p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-1.5 sm:mb-3">
                  <span className="text-[11px] sm:text-xs text-muted-foreground/70 leading-tight">{label}</span>
                  <Icon className={`w-4 h-4 ${color} shrink-0`} />
                </div>
                <div className="text-xl sm:text-2xl font-black text-foreground">
                  {loading ? (
                    <div className="h-6 sm:h-7 w-12 sm:w-14 bg-muted rounded animate-pulse" />
                  ) : (
                    value
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Explainer + org-managed content panel — desktop-only context;
             on phones it's noise between the stats and the money rows. */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
              <h3 className="font-semibold text-foreground text-sm mb-4">
                Plan Distribution
              </h3>
              <div className="space-y-3">
                {(revenue?.planDist ?? []).map((p) => {
                  const pct = Math.round((p.count / total) * 100);
                  return (
                    <div key={p.plan_id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground capitalize">
                          {p.plan_id}
                        </span>
                        <span className="text-muted-foreground/70">{p.count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${PLAN_BAR[p.plan_id] ?? "bg-slate-500"} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Desktop-only explainer — phones skip the prose and get
                straight to the numbers. */}
            <div className="hidden lg:block border border-border bg-card rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-foreground text-sm mb-2">
                Organisation-managed content
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground/70">
                Agents, knowledge bases and AI configuration are created and managed
                inside each organisation by its own team. This platform view shows only totals —
                open the Subscriptions workspace for billing actions.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Agents", stats?.totalAgents],
                  ["KBs", stats?.totalKbs],
                ].map(([label, value]) => (
                  <div
                    key={label as string}
                    className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3 text-center"
                  >
                    <div className="text-xl font-bold text-foreground">
                      {loading ? "—" : (value as number) ?? 0}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5">{label as string}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        <div className="border border-border bg-card rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Revenue by Plan</h3>
              <p className="text-xs text-muted-foreground/70 mt-1">Current recurring revenue and organisation distribution.</p>
            </div>
            <Link href="/subscriptions" className="text-xs text-primary">Open billing →</Link>
          </div>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            {(revenue?.byPlan ?? []).map((r) => (
              <div key={r.plan_id} className="flex justify-between py-2 border-b border-border/70">
                <span className="text-sm text-foreground">{r.plan_name} <span className="text-muted-foreground/70">({r.org_count})</span></span>
                <span className="text-sm text-emerald-600">${r.plan_mrr.toLocaleString()}/mo</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI provider configuration — the operator's entry point into
            provider switching, API keys, models and the ElevenLabs voice
            integration (platform defaults + per-org overrides). */}
        <div className="border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground text-sm">AI providers &amp; voice</h3>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Switch providers, change models, manage API keys — OpenAI, Gemini and ElevenLabs.
                </p>
              </div>
            </div>
            <Link
              href="/settings/ai"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/30 px-3 py-2 rounded-lg"
            >
              Configure <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
