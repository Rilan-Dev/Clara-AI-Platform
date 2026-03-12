/**
 * GET  /api/kbs/[kbId]/api-keys  — list all keys for this KB (+ quota info)
 * POST /api/kbs/[kbId]/api-keys  — create a new key (subscription-gated)
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  listApiKeys,
  createApiKey,
  getAllKeysUsageStats,
} from "@/modules/embed/core/api-keys-db";
import { checkApiKeyQuota } from "@/modules/embed/core/subscription-guard";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";

type Props = { params: Promise<{ kbId: string }> };

export async function GET(_req: NextRequest, { params }: Props): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId } = await params;

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "KB not found" }, { status: 404 });

    const orgId = await getOrgIdForKb(kbId);
    if (!orgId) return NextResponse.json({ error: "Organisation not found for KB" }, { status: 404 });

    const [keys, usageStats, quota] = await Promise.all([
      listApiKeys(kbId),
      getAllKeysUsageStats(kbId),
      checkApiKeyQuota(orgId),
    ]);

    const statsMap = Object.fromEntries(usageStats.map((s) => [s.keyId, s]));

    return NextResponse.json({
      keys: keys.map((k) => ({
        ...k,
        usage: statsMap[k.id] ?? { totalLast24h: 0, totalLast7d: 0, thisHour: 0 },
      })),
      // Quota info so the UI can show limits and disable the button
      quota: {
        allowed:  quota.allowed,
        current:  quota.current,
        limit:    quota.limit,
        plan:     quota.plan,
        planName: quota.planName,
      },
    });
  } catch (err) {
    console.error("[api-keys] GET:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Props): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId } = await params;

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "KB not found" }, { status: 404 });

    const orgId = await getOrgIdForKb(kbId);
    if (!orgId) return NextResponse.json({ error: "Organisation not found for KB" }, { status: 404 });

    // ── Subscription enforcement ──────────────────────────────────────────────
    const quota = await checkApiKeyQuota(orgId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error:   quota.reason,
          code:    "SUBSCRIPTION_LIMIT",
          quota: {
            current:  quota.current,
            limit:    quota.limit,
            plan:     quota.plan,
            planName: quota.planName,
          },
        },
        { status: 403 }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const body = (await req.json()) as {
      name?: string;
      allowedOrigins?: string[];
      rateLimitPerHour?: number;
    };

    const allowedOrigins = (body.allowedOrigins ?? [])
      .map((o: string) => o.trim().replace(/\/$/, ""))
      .filter(Boolean);

    const rateLimit =
      typeof body.rateLimitPerHour === "number" && body.rateLimitPerHour >= 0
        ? body.rateLimitPerHour
        : 500;

    const result = await createApiKey({
      kbId,
      orgId,
      name: body.name || "Default",
      allowedOrigins,
      rateLimitPerHour: rateLimit,
    });

    return NextResponse.json(
      {
        key: result.key,
        rawKey: result.rawKey,   // returned ONCE — must be copied immediately
        quota: {
          current:  quota.current + 1,
          limit:    quota.limit,
          plan:     quota.plan,
          planName: quota.planName,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api-keys] POST:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function getOrgIdForKb(kbId: string): Promise<string | null> {
  const { pool } = await import("@/lib/db");
  const result = await pool.query<{ org_id: string }>(
    `SELECT p.org_id
     FROM knowledge_bases kb
     JOIN projects p ON p.id = kb.project_id
     WHERE kb.id = $1`,
    [kbId]
  );
  return result.rows[0]?.org_id ?? null;
}
