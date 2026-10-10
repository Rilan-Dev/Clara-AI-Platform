"use client";

import { useEffect, useMemo, useState } from "react";
import { api, useClara } from "@/lib/store";
import { UsageBar } from "@/components/clara/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity,
  MessageSquare,
  Database,
  Users,
  Search,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type Meters = {
  orgName: string;
  plan: { id: string; name: string };
  requestsToday: number;
  requestsTodayLimit: number;
  requestsMonth: number;
  requestsMonthLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  kbs: number;
  kbsLimit: number;
  activeUsers7d: number;
  lastEventAt: string | null;
};
type Analytics = {
  trend: { day: string; requests: number; tokens: number }[];
  topQuestions: { question: string; count: number; lastAskedAt: string }[];
  perAgent: { agentId: string; agentName: string; requests: number }[];
  costUsd: string;
};
type QuestionRow = {
  id: string;
  question: string | null;
  askedBy: string;
  askedAt: string;
  answered: boolean;
  answerPreview: string | null;
  model: string | null;
  truncated: boolean;
};

function fmtBytes(b: number) {
  if (b >= 1024 * 1048576) return `${(b / (1024 * 1048576)).toFixed(1)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

export function OrgDashboard({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}) {
  const { showToast } = useClara();
  const [data, setData] = useState<{
    meters: Meters;
    analytics: Analytics;
  } | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [q, setQ] = useState("");

  const load = useMemo(
    () => async () => {
      try {
        const res = await api(`/api/analytics/org?orgId=${orgId}`, userId);
        if (res.ok) setData(await res.json());
      } catch {
        /* transient */
      }
    },
    [orgId, userId]
  );

  useEffect(() => {
    const first = setTimeout(load, 0); // deferred first load (SWR-style)
    const t = setInterval(load, 10000); // live meters, stale-while-revalidate cadence
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await api(
          `/api/org/questions?orgId=${orgId}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
          userId,
          { signal: controller.signal }
        );
        if (res.ok) {
          const body = await res.json();
          setQuestions(body.rows ?? []);
        }
      } catch {
        /* aborted */
      }
    }, q ? 300 : 0);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [orgId, userId, q]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
  }
  const { meters: m, analytics: a } = data;

  const stats = [
    {
      label: "Requests today",
      value: m.requestsToday.toLocaleString(),
      sub: `of ${m.requestsTodayLimit === -1 ? "∞" : m.requestsTodayLimit.toLocaleString()} · live`,
      icon: Activity,
      tone: "text-emerald-600",
    },
    {
      label: "Requests this month",
      value: m.requestsMonth.toLocaleString(),
      sub: `of ${m.requestsMonthLimit === -1 ? "∞" : m.requestsMonthLimit.toLocaleString()} · resets on renewal`,
      icon: MessageSquare,
      tone: "text-teal-600",
    },
    {
      label: "Storage used",
      value: fmtBytes(m.storageUsedBytes),
      sub: `of ${m.storageLimitBytes === -1 ? "∞" : fmtBytes(m.storageLimitBytes)}`,
      icon: Database,
      tone: "text-cyan-700",
    },
    {
      label: "Active users (7d)",
      value: String(m.activeUsers7d),
      sub: `${m.kbs}/${m.kbsLimit === -1 ? "∞" : m.kbsLimit} knowledge bases`,
      icon: Users,
      tone: "text-emerald-700",
    },
  ];

  return (
    <div className="space-y-6 overflow-y-auto p-4 pb-8 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">{m.orgName} — Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {m.plan.name} plan · every number is a live aggregation over the
          immutable usage-event log, not guessed state.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.tone}`} aria-hidden />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Requests — last 30 days</CardTitle>
            <CardDescription>
              Daily totals with token volume · est. spend ${a.costUsd}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.trend}>
                  <defs>
                    <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number) => [`${v} requests`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#reqFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <UsageBar
                used={m.requestsToday}
                limit={m.requestsTodayLimit}
                label="Daily requests"
              />
              <UsageBar
                used={m.requestsMonth}
                limit={m.requestsMonthLimit}
                label="Monthly requests"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top questions</CardTitle>
            <CardDescription>What your team keeps asking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.topQuestions.length === 0 && (
              <p className="text-sm text-muted-foreground">No questions yet.</p>
            )}
            {a.topQuestions.slice(0, 6).map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border p-2.5 text-sm"
              >
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 px-1.5 tabular-nums"
                >
                  {t.count}×
                </Badge>
                <p className="line-clamp-2 text-muted-foreground">{t.question}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Agent activity</CardTitle>
            <CardDescription>Requests per agent (all time)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.perAgent.map((g) => {
              const max = Math.max(...a.perAgent.map((x) => x.requests), 1);
              return (
                <div key={g.agentId} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate font-medium">{g.agentName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {g.requests}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(g.requests / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">User questions</CardTitle>
            <CardDescription>
              Your organisation&apos;s prompts with answer status — the
              content-gap backlog
            </CardDescription>
            <div className="relative mt-2">
              <Search
                className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search questions…"
                className="h-9 pl-8"
                aria-label="Search questions"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {questions.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No questions found.
                </p>
              )}
              {questions.slice(0, 30).map((row) => (
                <button
                  key={row.id}
                  onClick={() => {
                    if (row.answerPreview) {
                      showToast(`${row.askedBy}: ${row.answerPreview.slice(0, 90)}…`, "info");
                    }
                  }}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={row.answered ? "secondary" : "destructive"}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {row.answered ? (row.truncated ? "truncated" : "answered") : "open"}
                    </Badge>
                    <span className="text-xs font-medium">{row.askedBy}</span>
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden />
                      {new Date(row.askedAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{row.question}</p>
                  {row.answerPreview && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      ↳ {row.answerPreview}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
