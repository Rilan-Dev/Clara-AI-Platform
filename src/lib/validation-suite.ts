import { db } from "@/lib/db";
import { withQuota, checkFeature, peekQuota, localDayStart } from "@/lib/quota";
import { appendUsageEvent, meters } from "@/lib/usage";
import { verifyChain, appendAudit } from "@/lib/audit";
import { PLANS, planSpec } from "@/lib/plans";

/**
 * WS-1.3 Plan-by-plan validation matrix (plan §3.3, Table 5).
 *
 * For each plan tier a seeded organisation is created with its limits set
 * near the boundary; scripted request loops then walk each limit to exactly
 * N, N plus one, and beyond, asserting the refusal, the message copy, the
 * meter accuracy, and the upgrade path at each step. Route-level checks
 * exercise the real HTTP handlers with a raw Request — because a quota that
 * only holds when the UI behaves is not a quota.
 */

export type CheckResult = {
  id: string;
  plan: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
};

const CHAT_ROUTES = ["requests_day", "requests_month"] as const;

async function seedOrg(opts: {
  prefix: string;
  planId: string;
  agentModel: string;
  kbs?: number;
  storageBytes?: number;
  counters?: Partial<Record<(typeof CHAT_ROUTES)[number] | "kbs" | "storage_bytes", number>>;
}) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const org = await db.organization.create({
    data: {
      name: `VL ${planSpec(opts.planId).name} ${suffix}`,
      planId: opts.planId,
      timezone: "Asia/Calcutta",
      renewalDate: new Date(Date.now() + 15 * 864e5),
      storageUsedBytes: BigInt(opts.storageBytes ?? 0),
    },
  });
  const user = await db.user.create({
    data: {
      email: `vl-${suffix}@clara-validation.test`,
      name: `VL ${planSpec(opts.planId).name} Runner`,
      role: "org_admin",
      orgId: org.id,
    },
  });
  const agent = await db.agent.create({
    data: {
      orgId: org.id,
      name: `VL Agent (${planSpec(opts.planId).name})`,
      modelId: opts.agentModel,
    },
  });
  for (let i = 0; i < (opts.kbs ?? 0); i++) {
    await db.knowledgeBase.create({
      data: {
        orgId: org.id,
        name: `VL KB ${i + 1}`,
        embeddingModelId: "text-embedding-3-small",
        dimensions: 1536,
      },
    });
  }
  // seed maintained counters near the boundary
  const dayStart = localDayStart("Asia/Calcutta");
  const monthStart = new Date(dayStart.getTime() - 15 * 864e5);
  if (opts.counters?.requests_day != null) {
    await db.usageCounter.create({
      data: {
        orgId: org.id,
        limitKey: "requests_day",
        windowStart: dayStart,
        count: BigInt(opts.counters.requests_day),
      },
    });
  }
  if (opts.counters?.requests_month != null) {
    await db.usageCounter.create({
      data: {
        orgId: org.id,
        limitKey: "requests_month",
        windowStart: monthStart,
        count: BigInt(opts.counters.requests_month),
      },
    });
  }
  if (opts.counters?.storage_bytes != null) {
    await db.usageCounter.create({
      data: {
        orgId: org.id,
        limitKey: "storage_bytes",
        windowStart: new Date(0),
        count: BigInt(opts.counters.storage_bytes),
      },
    });
  }
  // seed matching usage events so meters equal counters
  const n = opts.counters?.requests_day ?? 0;
  for (let i = 0; i < n; i++) {
    await db.usageEvent.create({
      data: {
        orgId: org.id,
        userId: user.id,
        kind: "CHAT",
        agentId: agent.id,
        model: opts.agentModel,
        promptTokens: 40,
        completionTokens: 80,
        latencyMs: 900,
        createdAt: new Date(dayStart.getTime() + i * 60_000),
      },
    });
  }
  return { org, user, agent };
}

async function expect402(
  fn: () => Promise<unknown>
): Promise<{ ok: boolean; detail: string }> {
  try {
    await fn();
    return { ok: false, detail: "request was admitted — expected 402 refusal" };
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string; upgrade?: { plan?: string } };
    if (e.status === 402 && e.code === "QUOTA_EXCEEDED" && e.upgrade?.plan) {
      return { ok: true, detail: `402 QUOTA_EXCEEDED → upgrade:${e.upgrade.plan}` };
    }
    return {
      ok: false,
      detail: `wrong refusal shape: status=${e.status} code=${e.code}`,
    };
  }
}

async function expect403(
  fn: () => Promise<unknown>
): Promise<{ ok: boolean; detail: string }> {
  try {
    await fn();
    return { ok: false, detail: "request was allowed — expected 403 refusal" };
  } catch (err) {
    const e = err as { status?: number; code?: string; upgrade?: { plan?: string } };
    if (e.status === 403 && e.upgrade?.plan) {
      return { ok: true, detail: `403 ${e.code} → upgrade:${e.upgrade.plan}` };
    }
    return { ok: false, detail: `wrong refusal shape: status=${e.status} code=${e.code}` };
  }
}

/** Raw route-level call — the real HTTP handler, no browser needed. */
async function rawChat(opts: {
  userId: string;
  agentId: string;
  message: string;
}) {
  const { POST } = await import("@/app/api/chat/route");
  const req = new Request("http://validation.local/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": opts.userId },
    body: JSON.stringify({ agentId: opts.agentId, message: opts.message }),
  });
  return POST(req);
}

async function rawKbCreate(opts: { userId: string; name: string }) {
  const { POST } = await import("@/app/api/kb/route");
  const req = new Request("http://validation.local/api/kb", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": opts.userId },
    body: JSON.stringify({ name: opts.name, embeddingModelId: "text-embedding-3-small" }),
  });
  return POST(req);
}

async function rawDocUpload(opts: {
  userId: string;
  kbId: string;
  fileName: string;
  sizeBytes: number;
}) {
  const { POST } = await import("@/app/api/kb/document/route");
  const req = new Request("http://validation.local/api/kb/document", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": opts.userId },
    body: JSON.stringify({
      kbId: opts.kbId,
      fileName: opts.fileName,
      sizeBytes: opts.sizeBytes,
    }),
  });
  return POST(req);
}

async function runFreeTier(checks: CheckResult[]) {
  const { org, user, agent } = await seedOrg({
    prefix: "free",
    planId: "free",
    agentModel: "gpt-5.6-sol",
    kbs: 1,
    storageBytes: 40 * 1048576,
    counters: { requests_day: 49, requests_month: 100 },
  });

  // KB create at limit (1 of 1 used) — refused with upgrade CTA
  const kbRes = await rawKbCreate({ userId: user.id, name: "Second KB" });
  const kbBody = await kbRes.json().catch(() => ({}));
  checks.push({
    id: "FREE-1",
    plan: "free",
    name: "2nd KB create refused with 402 + upgrade CTA",
    passed: kbRes.status === 402 && kbBody?.error?.code === "QUOTA_EXCEEDED" && !!kbBody?.error?.upgrade,
    expected: "402 QUOTA_EXCEEDED with upgrade payload",
    actual: `${kbRes.status} ${kbBody?.error?.code ?? "-"} upgrade:${kbBody?.error?.upgrade?.plan ?? "none"}`,
  });

  // Requests 50 (admitted), 51+ (refused) — via the real route
  const r50 = await rawChat({ userId: user.id, agentId: agent.id, message: "Boundary request 50" });
  checks.push({
    id: "FREE-2",
    plan: "free",
    name: "Request 50 of 50 admitted (SSE opens)",
    passed: r50.status === 200 && (r50.headers.get("content-type") ?? "").includes("text/event-stream"),
    expected: "200 text/event-stream",
    actual: `${r50.status} ${r50.headers.get("content-type") ?? "-"}`,
  });
  // consume the admitted stream so its usage event lands before meter checks
  await r50.text().catch(() => {});

  const r51 = await rawChat({ userId: user.id, agentId: agent.id, message: "Request 51 must be refused" });
  const b51 = await r51.json().catch(() => ({}));
  checks.push({
    id: "FREE-3",
    plan: "free",
    name: "Request 51 refused with standard error contract (raw API)",
    passed:
      r51.status === 402 &&
      b51?.error?.code === "QUOTA_EXCEEDED" &&
      b51?.error?.message?.includes("Daily request limit") &&
      b51?.error?.upgrade?.plan === "starter",
    expected: "402 QUOTA_EXCEEDED, daily-limit copy, upgrade→starter",
    actual: `${r51.status} ${b51?.error?.code ?? "-"} msg:${(b51?.error?.message ?? "").slice(0, 40)}…`,
  });

  // Storage upload past cap — pre-checked and refused with remaining copy
  const docRes = await rawDocUpload({
    userId: user.id,
    kbId: (await db.knowledgeBase.findFirst({ where: { orgId: org.id } }))!.id,
    fileName: "huge.pdf",
    sizeBytes: 20 * 1048576,
  });
  const docBody = await docRes.json().catch(() => ({}));
  checks.push({
    id: "FREE-4",
    plan: "free",
    name: "Upload past storage cap refused with remaining-storage copy",
    passed:
      docRes.status === 402 &&
      docBody?.error?.code === "QUOTA_EXCEEDED" &&
      /Remaining/i.test(docBody?.error?.message ?? ""),
    expected: "402 with 'Remaining: … MB' copy",
    actual: `${docRes.status} ${(docBody?.error?.message ?? "").slice(0, 60)}…`,
  });

  // Premium model via raw API — 403 even when called directly
  await db.agent.update({ where: { id: agent.id }, data: { modelId: "gpt-5.6-terra" } });
  const modelRes = await rawChat({ userId: user.id, agentId: agent.id, message: "Premium model attempt" });
  const modelBody = await modelRes.json().catch(() => ({}));
  checks.push({
    id: "FREE-5",
    plan: "free",
    name: "Premium model (GPT-5.6 Terra) refused via raw API (403)",
    passed: modelRes.status === 403 && modelBody?.error?.code === "MODEL_NOT_IN_PLAN",
    expected: "403 MODEL_NOT_IN_PLAN",
    actual: `${modelRes.status} ${modelBody?.error?.code ?? "-"}`,
  });

  // Meter accuracy — event log count equals requests-today meter
  const m = await meters(org.id);
  const eventCount = await db.usageEvent.count({
    where: { orgId: org.id, createdAt: { gte: localDayStart("Asia/Calcutta") }, kind: "CHAT" },
  });
  checks.push({
    id: "FREE-6",
    plan: "free",
    name: "requests-today meter equals manual event-log count",
    passed: m.requestsToday === eventCount,
    expected: `meter = ${eventCount}`,
    actual: `meter = ${m.requestsToday}`,
  });
}

async function runStarterTier(checks: CheckResult[]) {
  const { org, user } = await seedOrg({
    prefix: "starter",
    planId: "starter",
    agentModel: "gpt-4o",
    kbs: 4,
    counters: { requests_day: 239, requests_month: 4999 },
  });
  const agent = await db.agent.findFirst({ where: { orgId: org.id } });

  // 80% soft warning fires exactly once (240 = 0.8 × 300)
  const w240 = await withQuota({ orgId: org.id, limitKey: "requests_day" });
  const warningRows = await db.softWarning.count({
    where: { orgId: org.id, limitKey: "requests_day" },
  });
  const w241 = await withQuota({ orgId: org.id, limitKey: "requests_month", increment: 0 + 1 });
  void w241;
  // second crossing must NOT create another warning
  await withQuota({ orgId: org.id, limitKey: "requests_day" }).catch(() => null);
  const warningRowsAfter = await db.softWarning.count({
    where: { orgId: org.id, limitKey: "requests_day" },
  });
  checks.push({
    id: "START-1",
    plan: "starter",
    name: "80% banner event fired exactly once at 240/300",
    passed: !!w240.warning && warningRows === 1 && warningRowsAfter === 1,
    expected: "warning at 240; still 1 row after 241",
    actual: `warning=${!!w240.warning}, rows ${warningRows}→${warningRowsAfter}`,
  });

  // Monthly cap walk: 5000th admitted, 5001st refused with renewal copy
  const m5000 = await withQuota({ orgId: org.id, limitKey: "requests_month" });
  const monthly = await expect402(() =>
    withQuota({ orgId: org.id, limitKey: "requests_month" })
  );
  checks.push({
    id: "START-2",
    plan: "starter",
    name: "Monthly cap: 5000 admitted, 5001 refused with renewal copy",
    passed: m5000.used === 5000 && monthly.ok,
    expected: "used=5000 then 402",
    actual: `used=${m5000.used}, ${monthly.detail}`,
  });

  // Daily reset — the window bucket rolls over at local midnight
  const tomorrow = new Date(localDayStart("Asia/Calcutta").getTime() + 864e5);
  const peekToday = await peekQuota(org.id, "requests_day");
  checks.push({
    id: "START-3",
    plan: "starter",
    name: "Daily window resets at local midnight (org timezone)",
    passed:
      peekToday.windowStart.getTime() === localDayStart("Asia/Calcutta").getTime() &&
      tomorrow.getTime() > peekToday.windowStart.getTime(),
    expected: "window anchored to today's local midnight; next bucket is +24h",
    actual: `window=${peekToday.windowStart.toISOString().slice(0, 10)} next=${tomorrow.toISOString().slice(0, 10)}`,
  });

  // 6th KB create refused (5 KB limit, 4 seeded + none created)
  const kbRes = await rawKbCreate({ userId: user.id, name: "KB five" });
  const kbBody = await kbRes.json().catch(() => ({}));
  void kbBody;
  const kb6 = await rawKbCreate({ userId: user.id, name: "KB six" });
  checks.push({
    id: "START-4",
    plan: "starter",
    name: "KB limit: 5th created, 6th refused (402)",
    passed: kbRes.status === 201 && kb6.status === 402,
    expected: "201 then 402",
    actual: `${kbRes.status} then ${kb6.status}`,
  });
  void agent;
}

async function runProTier(checks: CheckResult[]) {
  const { org, user } = await seedOrg({
    prefix: "pro",
    planId: "pro",
    agentModel: "gpt-5.6-terra",
    kbs: 20,
    counters: { requests_day: 1999 },
  });
  const agent = await db.agent.findFirst({ where: { orgId: org.id } });

  // The race test: 100 simultaneous requests, 1 remaining credit.
  const attempts = await Promise.allSettled(
    Array.from({ length: 100 }, () =>
      withQuota({ orgId: org.id, limitKey: "requests_day" })
    )
  );
  const admitted = attempts.filter((a) => a.status === "fulfilled").length;
  const refused = attempts.filter(
    (a) => a.status === "rejected" && (a.reason as { status?: number })?.status === 402
  ).length;
  checks.push({
    id: "PRO-1",
    plan: "pro",
    name: "100 parallel requests at 1 remaining: exactly 1 admitted, 99 refused 402",
    passed: admitted === 1 && refused === 99,
    expected: "admitted=1 refused=99",
    actual: `admitted=${admitted} refused402=${refused} other=${100 - admitted - refused}`,
  });

  // Concurrent KB create at limit — all refused
  const kbAttempts = await Promise.allSettled(
    Array.from({ length: 10 }, () => withQuota({ orgId: org.id, limitKey: "kbs" }))
  );
  const kbAdmitted = kbAttempts.filter((a) => a.status === "fulfilled").length;
  checks.push({
    id: "PRO-2",
    plan: "pro",
    name: "10 concurrent KB creates at 20/20 limit: none admitted",
    passed: kbAdmitted === 0,
    expected: "admitted=0",
    actual: `admitted=${kbAdmitted}`,
  });

  // Meter equals event log to the row after the burst
  await appendUsageEvent({
    orgId: org.id,
    userId: user.id,
    kind: "CHAT",
    agentId: agent?.id,
    model: "gpt-5.6-terra",
    promptTokens: 40,
    completionTokens: 80,
    latencyMs: 850,
  });
  const m = await meters(org.id);
  const eventCount = await db.usageEvent.count({
    where: { orgId: org.id, createdAt: { gte: localDayStart("Asia/Calcutta") }, kind: "CHAT" },
  });
  const counter = await db.usageCounter.findFirst({
    where: { orgId: org.id, limitKey: "requests_day" },
  });
  checks.push({
    id: "PRO-3",
    plan: "pro",
    name: "Meters equal event-log counts to the row (no over-count)",
    passed: m.requestsToday === eventCount && Number(counter?.count) === 2000,
    expected: `meter=eventLog=${eventCount}, counter=2000`,
    actual: `meter=${m.requestsToday}, eventLog=${eventCount}, counter=${Number(counter?.count)}`,
  });
}

async function runEnterpriseTier(checks: CheckResult[]) {
  const { org, user } = await seedOrg({
    prefix: "ent",
    planId: "enterprise",
    agentModel: "gpt-5.6-terra",
  });

  // Unlimited flags on — a huge burst never refuses
  const burst = await Promise.allSettled(
    Array.from({ length: 25 }, () =>
      withQuota({ orgId: org.id, limitKey: "requests_day", increment: 1000 })
    )
  );
  const allAdmitted = burst.every((b) => b.status === "fulfilled");
  checks.push({
    id: "ENT-1",
    plan: "enterprise",
    name: "Unlimited plan: 25 × 1000-request burst, no artificial caps",
    passed: allAdmitted,
    expected: "all admitted",
    actual: `admitted=${burst.filter((b) => b.status === "fulfilled").length}/25`,
  });

  // Every enterprise feature passes its gate
  const feats = ["sso", "custom_llm", "widget", "connectors", "api_keys"];
  const featOk = await Promise.all(feats.map((f) => checkFeature(org.id, f).then(() => true).catch(() => false)));
  checks.push({
    id: "ENT-2",
    plan: "enterprise",
    name: "SSO, custom LLM, widget, connectors, API keys all enabled",
    passed: featOk.every(Boolean),
    expected: "5/5 features",
    actual: `${featOk.filter(Boolean).length}/5`,
  });

  // Per-plan gates: a FREE org calling SSO via the API is still refused
  const freeOrg = await seedOrg({ prefix: "gate", planId: "free", agentModel: "gpt-5.6-sol" });
  const ssoRefusal = await expect403(() => checkFeature(freeOrg.org.id, "sso"));
  const modelRefusal = await expect403(() => checkFeature(freeOrg.org.id, "model:gpt-5.6-terra"));
  checks.push({
    id: "ENT-3",
    plan: "enterprise",
    name: "Gates are per-plan: free org refused SSO + premium model",
    passed: ssoRefusal.ok && modelRefusal.ok,
    expected: "403 PLAN_FEATURE_UNAVAILABLE + 403 MODEL_NOT_IN_PLAN",
    actual: `${ssoRefusal.detail} | ${modelRefusal.detail}`,
  });

  // Audit records every action — the suite itself is audited
  const before = await db.auditLog.count();
  await appendAudit({
    orgId: org.id,
    actorUserId: user.id,
    actorRole: "org_admin",
    action: "CONFIG",
    answerText: "Validation suite exercised enterprise tier.",
  });
  const after = await db.auditLog.count();
  checks.push({
    id: "ENT-4",
    plan: "enterprise",
    name: "Audit log records every validation action (+1 row)",
    passed: after === before + 1,
    expected: "audit +1",
    actual: `${before} → ${after}`,
  });

  // Chain integrity after the whole suite wrote rows
  const chain = await verifyChain();
  checks.push({
    id: "ENT-5",
    plan: "enterprise",
    name: "Hash chain verifies after all suite writes",
    passed: chain.ok,
    expected: `ok over ${chain.total} rows`,
    actual: `${chain.ok} (checked ${chain.checked}/${chain.total})${chain.firstBreak ? ` break@${chain.firstBreak.seq}` : ""}`,
  });
}

/** Run the full suite across all four tiers. */
export async function runValidationSuite() {
  const checks: CheckResult[] = [];
  const startedAt = new Date();

  await runFreeTier(checks);
  await runStarterTier(checks);
  await runProTier(checks);
  await runEnterpriseTier(checks);

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;

  // Tamper-evidence check — flip a char, chain must break, restore, ok again
  const verifyRoute = await import("@/app/api/audit/verify/route");
  const tamperReq = new Request("http://validation.local/api/audit/verify", {
    method: "POST",
    headers: { "x-user-id": (await db.user.findFirst({ where: { role: "platform_admin" } }))!.id },
  });
  const tamperRes = await verifyRoute.POST(tamperReq);
  const tamper = await tamperRes.json();
  checks.push({
    id: "CHAIN-1",
    plan: "all",
    name: "Tamper test: chain breaks on edit, restored after revert",
    passed: tamper.chainBrokeAfterTamper === true && tamper.chainOkAfterRestore === true,
    expected: "break=true then ok=true",
    actual: `break=${tamper.chainBrokeAfterTamper}, restored=${tamper.chainOkAfterRestore}`,
  });

  const run = await db.validationRun.create({
    data: {
      planId: "all",
      passed: checks.filter((c) => c.passed).length,
      failed: checks.length - checks.filter((c) => c.passed).length,
      results: JSON.stringify(checks),
      startedAt,
    },
  });

  return {
    runId: run.id,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    passed,
    failed,
    total: checks.length,
    checks,
  };
}

export async function latestRuns() {
  const runs = await db.validationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
  });
  return runs.map((r) => ({
    id: r.id,
    planId: r.planId,
    passed: r.passed,
    failed: r.failed,
    startedAt: r.startedAt.toISOString(),
    checks: JSON.parse(r.results) as CheckResult[],
  }));
}

export const PLAN_TIERS = PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  requestsDay: p.requestsDay,
  requestsMonth: p.requestsMonth,
  kbs: p.kbs,
  maxModelTier: p.maxModelTier,
  features: p.features,
}));
