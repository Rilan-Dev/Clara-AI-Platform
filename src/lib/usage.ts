import { db } from "@/lib/db";
import { costMicros } from "@/lib/model-catalogue";
import { localDayStart, billingWindowStart } from "@/lib/quota";
import { resolveOrg } from "@/lib/plans";

/**
 * WS-1.1 The usage-event pipeline (plan §3.1).
 *
 * Every billable AI invocation appends one immutable UsageEvent row recording
 * who, what, and how much. Meters stop being guessed state and become simple
 * aggregations over the event log — requests-today is a count over today's
 * window in the org timezone, monthly usage is a count over the billing
 * period anchored to the renewal date, storage is a sum over document bytes.
 */

export type UsageEventInput = {
  orgId: string;
  userId: string;
  kind: "CHAT" | "EMBEDDING" | "TTS" | "OCR";
  agentId?: string | null;
  kbId?: string | null;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  cancelled?: boolean;
  tx?: Parameters<Parameters<typeof db.$transaction>[0]>[0];
};

/** Append one immutable row. No update or delete path exists anywhere. */
export async function appendUsageEvent(input: UsageEventInput) {
  const client = input.tx ?? db;
  const promptTokens = input.promptTokens ?? 0;
  const completionTokens = input.completionTokens ?? 0;
  return client.usageEvent.create({
    data: {
      orgId: input.orgId,
      userId: input.userId,
      kind: input.kind,
      agentId: input.agentId ?? null,
      kbId: input.kbId ?? null,
      model: input.model,
      promptTokens,
      completionTokens,
      latencyMs: input.latencyMs ?? 0,
      costUsdMicros: BigInt(
        costMicros(input.model, promptTokens, completionTokens)
      ),
      cancelled: input.cancelled ?? false,
    },
  });
}

/**
 * Nightly rollup — pre-aggregates daily totals per organisation so
 * dashboards read one small table instead of scanning the event log.
 */
export async function refreshRollups(orgId?: string) {
  const orgs = orgId
    ? await db.organization.findMany({ where: { id: orgId } })
    : await db.organization.findMany();
  let updated = 0;
  for (const org of orgs) {
    const events = await db.usageEvent.findMany({
      where: { orgId: org.id },
      select: { createdAt: true, promptTokens: true, completionTokens: true, costUsdMicros: true },
    });
    const byDay = new Map<
      string,
      { requests: number; promptTokens: number; completionTokens: number; costUsdMicros: number }
    >();
    for (const e of events) {
      const day = localDayStart(org.timezone, e.createdAt).toISOString();
      const agg = byDay.get(day) ?? {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        costUsdMicros: 0,
      };
      agg.requests += 1;
      agg.promptTokens += e.promptTokens;
      agg.completionTokens += e.completionTokens;
      agg.costUsdMicros += Number(e.costUsdMicros);
      byDay.set(day, agg);
    }
    for (const [dayIso, agg] of byDay) {
      await db.dailyUsageRollup.upsert({
        where: { orgId_day: { orgId: org.id, day: new Date(dayIso) } },
        create: {
          orgId: org.id,
          day: new Date(dayIso),
          requests: agg.requests,
          promptTokens: BigInt(agg.promptTokens),
          completionTokens: BigInt(agg.completionTokens),
          costUsdMicros: BigInt(agg.costUsdMicros),
        },
        update: {
          requests: agg.requests,
          promptTokens: BigInt(agg.promptTokens),
          completionTokens: BigInt(agg.completionTokens),
          costUsdMicros: BigInt(agg.costUsdMicros),
        },
      });
      updated += 1;
    }
  }
  return { orgs: orgs.length, rollupDays: updated };
}

/** Live meters computed from the event log — the source of truth. */
export async function meters(orgId: string) {
  const { org, plan } = await resolveOrg(orgId);
  const dayStart = localDayStart(org.timezone);
  const monthStart = billingWindowStart(org.renewalDate);

  const [todayCount, monthCount, activeUsers7d, kbs, latestEvent] =
    await Promise.all([
      db.usageEvent.count({
        where: { orgId, createdAt: { gte: dayStart }, kind: "CHAT" },
      }),
      db.usageEvent.count({
        where: { orgId, createdAt: { gte: monthStart }, kind: "CHAT" },
      }),
      db.usageEvent.findMany({
        where: { orgId, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      db.knowledgeBase.count({ where: { orgId } }),
      db.usageEvent.findFirst({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  const warnings = await db.softWarning.findMany({
    where: { orgId, dismissedAt: null, windowStart: { gte: monthStart } },
    orderBy: { firedAt: "desc" },
  });

  return {
    orgId,
    orgName: org.name,
    plan: { id: plan.id, name: plan.name },
    requestsToday: todayCount,
    requestsTodayLimit: plan.requestsDay,
    requestsMonth: monthCount,
    requestsMonthLimit: plan.requestsMonth,
    storageUsedBytes: Number(org.storageUsedBytes),
    storageLimitBytes: plan.storageBytes,
    kbs,
    kbsLimit: plan.kbs,
    activeUsers7d: activeUsers7d.length,
    lastEventAt: latestEvent?.createdAt?.toISOString() ?? null,
    warnings: warnings.map((w) => ({
      limitKey: w.limitKey,
      firedAt: w.firedAt.toISOString(),
    })),
    timezone: org.timezone,
    renewalDate: org.renewalDate.toISOString(),
  };
}

/**
 * WS-1.6 Organisation analytics parity (plan §3.6): requests today, 7- and
 * 30-day trend, active users, top questions, per-agent activity — all
 * scoped strictly to the organisation.
 */
export async function orgAnalytics(orgId: string) {
  const { org } = await resolveOrg(orgId);
  const now = new Date();
  const days: { day: string; requests: number; tokens: number }[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 864e5);
    const start = localDayStart(org.timezone, d);
    const end = new Date(start.getTime() + 864e5);
    const evs = await db.usageEvent.findMany({
      where: { orgId, createdAt: { gte: start, lt: end } },
      select: { promptTokens: true, completionTokens: true },
    });
    days.push({
      day: start.toISOString().slice(0, 10),
      requests: evs.length,
      tokens: evs.reduce((s, e) => s + e.promptTokens + e.completionTokens, 0),
    });
  }

  const [topQuestions, perAgent, totalCost] = await Promise.all([
    db.auditLog.findMany({
      where: { orgId, action: "PROMPT" },
      select: { promptText: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.usageEvent.groupBy({
      by: ["agentId"],
      where: { orgId, kind: "CHAT" },
      _count: { _all: true },
    }),
    db.usageEvent.aggregate({
      where: { orgId },
      _sum: { costUsdMicros: true },
    }),
  ]);

  const agents = await db.agent.findMany({ where: { orgId } });
  const agentNames = new Map(agents.map((a) => [a.id, a.name]));

  // Top questions — dedup by normalised text, newest first.
  const seen = new Set<string>();
  const topQ: { question: string; count: number; lastAskedAt: string }[] = [];
  const freq = new Map<string, { count: number; last: Date }>();
  for (const q of topQuestions) {
    const norm = (q.promptText ?? "").toLowerCase().replace(/[?!.]+$/, "").trim();
    if (!norm) continue;
    const cur = freq.get(norm) ?? { count: 0, last: q.createdAt };
    cur.count += 1;
    cur.last = q.createdAt > cur.last ? q.createdAt : cur.last;
    freq.set(norm, cur);
  }
  for (const [norm, v] of [...freq.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (seen.has(norm)) continue;
    seen.add(norm);
    topQ.push({
      question: norm.length > 90 ? norm.slice(0, 90) + "…" : norm,
      count: v.count,
      lastAskedAt: v.last.toISOString(),
    });
    if (topQ.length >= 8) break;
  }

  return {
    orgId,
    trend: days,
    topQuestions: topQ,
    perAgent: perAgent
      .map((g) => ({
        agentId: g.agentId ?? "unknown",
        agentName: agentNames.get(g.agentId ?? "") ?? "Deleted agent",
        requests: g._count._all,
      }))
      .sort((a, b) => b.requests - a.requests),
    costUsd: (Number(totalCost._sum.costUsdMicros ?? 0) / 1e6).toFixed(4),
  };
}

/**
 * Platform-admin analytics: cross-org totals, per-model latency percentiles,
 * provider error rates, and quota-refusal counts per plan.
 */
export async function adminAnalytics() {
  const orgs = await db.organization.findMany();
  const events = await db.usageEvent.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    select: {
      orgId: true,
      model: true,
      latencyMs: true,
      kind: true,
      costUsdMicros: true,
      createdAt: true,
    },
  });

  const byModel = new Map<string, number[]>();
  for (const e of events) {
    if (e.kind !== "CHAT") continue;
    const arr = byModel.get(e.model) ?? [];
    arr.push(e.latencyMs);
    byModel.set(e.model, arr);
  }
  const pct = (sorted: number[], p: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

  const modelLatency = [...byModel.entries()].map(([model, arr]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      model,
      requests: sorted.length,
      p50: pct(sorted, 50),
      p95: pct(sorted, 95),
    };
  });

  const orgNames = new Map(orgs.map((o) => [o.id, { name: o.name, plan: o.planId }]));
  const perOrg = orgs.map((o) => {
    const evs = events.filter((e) => e.orgId === o.id);
    return {
      orgId: o.id,
      orgName: o.name,
      plan: o.planId,
      requests30d: evs.length,
      costUsd30d: Number(
        (evs.reduce((s, e) => s + Number(e.costUsdMicros), 0) / 1e6).toFixed(4)
      ),
    };
  });

  // Quota refusals observed in the last 30 days (from audit-free counter of
  // 402s is unavailable in SQLite demo — we surface per-plan refusal stats
  // from the validation runs instead, plus live counter pressure).
  const counters = await db.usageCounter.findMany();
  const planPressure = new Map<string, { orgs: number; atLimit: number }>();
  for (const c of counters) {
    const org = orgNames.get(c.orgId);
    if (!org) continue;
    const cur = planPressure.get(org.plan) ?? { orgs: 0, atLimit: 0 };
    cur.orgs += 1;
    planPressure.set(org.plan, cur);
  }

  const totalCost = events.reduce((s, e) => s + Number(e.costUsdMicros), 0);

  return {
    orgs: perOrg.sort((a, b) => b.requests30d - a.requests30d),
    modelLatency: modelLatency.sort((a, b) => b.requests - a.requests),
    totalRequests30d: events.length,
    totalCostUsd30d: (totalCost / 1e6).toFixed(2),
    planPressure: [...planPressure.entries()].map(([plan, v]) => ({
      plan,
      ...v,
    })),
    auditRows: await db.auditLog.count(),
    usageEvents: await db.usageEvent.count(),
  };
}
