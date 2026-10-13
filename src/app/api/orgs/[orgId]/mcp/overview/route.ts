import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import {
  resolveEffectiveMcpEntitlements,
  getMcpUsageSummary,
} from "@/modules/mcp";
import { listOrgMcpConnections } from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/orgs/[orgId]/mcp/overview
 * The Integrations screen's MCP data: effective entitlements (with denial
 * reason), real usage counters, and the organisation's connections.
 * Server-authoritative — the client cannot influence any of it.
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");

    let effective;
    try {
      effective = await resolveEffectiveMcpEntitlements(orgId);
    } catch {
      return NextResponse.json(
        { error: "MCP entitlement could not be verified. Try again shortly." },
        { status: 503 },
      );
    }
    const usage = await getMcpUsageSummary(orgId, effective.periodStart);
    const connections = effective.available
      ? await listOrgMcpConnections(orgId)
      : [];

    return NextResponse.json({
      available: effective.available,
      denialReason: effective.denialReason,
      entitlements: effective.entitlements,
      planId: effective.planId,
      planName: effective.planName,
      subscriptionStatus: effective.subscriptionStatus,
      periodStart: effective.periodStart,
      usage,
      connections,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp overview GET]", err);
    return NextResponse.json({ error: "Failed to load MCP overview" }, { status: 500 });
  }
}