import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import {
  MCP_OVERRIDE_KEYS,
  mcpOverrideSchema,
  recordPlatformMcpAudit,
  resolveEffectiveMcpEntitlements,
} from "@/modules/mcp";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type OverrideRow = {
  entitlements: unknown;
  reason: string;
  expires_at: Date | string | null;
  created_at: Date;
  created_by: string | null;
};

async function orgExists(orgId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM organisations WHERE id = $1 LIMIT 1`,
    [orgId],
  );
  return Boolean(rows[0]);
}

/**
 * GET /api/platform/orgs/[id]/mcp-override
 * Effective MCP entitlements for one organisation: plan defaults, current
 * usage, and the active override (if any) with its provenance.
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isPlatformFeatureEnabled("integrations")) {
      return NextResponse.json({ error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" }, { status: 404 });
    }
    const { id: orgId } = await params;
    if (!(await orgExists(orgId))) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }

    const [effective, overrideRows] = await Promise.all([
      resolveEffectiveMcpEntitlements(orgId),
      query<OverrideRow>(
        `SELECT entitlements, reason, expires_at, created_at, created_by
           FROM org_mcp_overrides WHERE org_id = $1 LIMIT 1`,
        [orgId],
      ),
    ]);
    const override = overrideRows[0];

    // Real usage (no projections).
    const usageRows = await query<{
      connections: number;
      tools_approved: number;
      agent_assignments: number;
      period_calls: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM org_mcp_connections WHERE org_id = $1) AS connections,
         (SELECT COUNT(*)::int FROM org_mcp_tools WHERE org_id = $1 AND approved = TRUE AND status = 'approved') AS tools_approved,
         (SELECT COUNT(*)::int FROM org_mcp_agent_grants WHERE org_id = $1 AND enabled = TRUE) AS agent_assignments,
         (SELECT COUNT(*)::int FROM mcp_tool_usage_log WHERE org_id = $1 AND period_start = $2::date) AS period_calls`,
      [orgId, effective.periodStart],
    );

    return NextResponse.json({
      planId: effective.planId,
      planName: effective.planName,
      subscriptionStatus: effective.subscriptionStatus,
      available: effective.available,
      denialReason: effective.denialReason,
      entitlements: effective.entitlements,
      sources: effective.sources,
      globalSettings: effective.globalSettings,
      periodStart: effective.periodStart,
      usage: {
        connections: usageRows[0]?.connections ?? 0,
        toolsApproved: usageRows[0]?.tools_approved ?? 0,
        agentAssignments: usageRows[0]?.agent_assignments ?? 0,
        toolCallsThisPeriod: usageRows[0]?.period_calls ?? 0,
      },
      override: override
        ? {
            entitlements: override.entitlements ?? {},
            reason: override.reason,
            expiresAt: override.expires_at
              ? new Date(override.expires_at).toISOString()
              : null,
            createdAt: new Date(override.created_at).toISOString(),
            createdBy: override.created_by,
            active: effective.override?.active ?? false,
            expired: effective.override?.expired ?? false,
          }
        : null,
      overridableKeys: MCP_OVERRIDE_KEYS,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform org mcp-override GET]", err);
    return NextResponse.json({ error: "Failed to load MCP entitlements" }, { status: 500 });
  }
}

/**
 * PUT /api/platform/orgs/[id]/mcp-override
 * Apply or replace an organization-specific MCP entitlement override.
 * Overrides only adjust limits (never capability switches), require a reason,
 * optionally expire, and are audited.
 */
export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isPlatformFeatureEnabled("integrations")) {
      return NextResponse.json({ error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" }, { status: 404 });
    }
    const { id: orgId } = await params;
    if (!(await orgExists(orgId))) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }
    const body = (await req.json()) as {
      entitlements?: unknown;
      reason?: string;
      expiresAt?: string | null;
    };

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 500) {
      return NextResponse.json(
        { error: "A reason between 1 and 500 characters is required for an override." },
        { status: 400 },
      );
    }
    const parsed = mcpOverrideSchema.safeParse(body.entitlements ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid override entitlements",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "An override must set at least one limit." },
        { status: 400 },
      );
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt != null && body.expiresAt !== "") {
      const parsedDate = new Date(body.expiresAt);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() < Date.now()) {
        return NextResponse.json(
          { error: "Override expiry must be a valid future date." },
          { status: 400 },
        );
      }
      expiresAt = parsedDate;
    }

    await query(
      `INSERT INTO org_mcp_overrides (org_id, entitlements, reason, created_by, expires_at)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (org_id) DO UPDATE SET
         entitlements = EXCLUDED.entitlements,
         reason = EXCLUDED.reason,
         created_by = EXCLUDED.created_by,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()`,
      [orgId, JSON.stringify(parsed.data), reason, auth.user.id, expiresAt],
    );

    await recordPlatformMcpAudit({
      actorUserId: auth.user.id,
      action: "org.override_applied",
      entityType: "org_mcp_override",
      entityId: orgId,
      details: { override: parsed.data, reason, expiresAt: expiresAt?.toISOString() ?? null },
    });

    return NextResponse.json({ ok: true, override: parsed.data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform org mcp-override PUT]", err);
    return NextResponse.json({ error: "Failed to apply MCP override" }, { status: 500 });
  }
}

/** DELETE — remove the organisation's override (reverts to plan defaults). */
export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    if (!isPlatformFeatureEnabled("integrations")) {
      return NextResponse.json({ error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" }, { status: 404 });
    }
    const { id: orgId } = await params;
    const deleted = await query<{ org_id: string }>(
      `DELETE FROM org_mcp_overrides WHERE org_id = $1 RETURNING org_id`,
      [orgId],
    );
    if (deleted.length === 0) {
      return NextResponse.json({ error: "No override exists for this organisation" }, { status: 404 });
    }
    await recordPlatformMcpAudit({
      actorUserId: auth.user.id,
      action: "org.override_removed",
      entityType: "org_mcp_override",
      entityId: orgId,
      details: {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform org mcp-override DELETE]", err);
    return NextResponse.json({ error: "Failed to remove MCP override" }, { status: 500 });
  }
}