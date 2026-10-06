import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, withTransaction } from "@/lib/db";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { getOrgPlanLimits } from "@/lib/plan-guard";
import { listIntegrations } from "@/modules/integrations/registry";
import { ENCRYPTION_KEY } from "@/lib/secrets";

type Params = { params: Promise<{ orgId: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");
    const [platform, orgRows, connections] = await Promise.all([
      query<{integration_id:string;enabled:boolean;allowed_plans:string[]}>(`SELECT integration_id, enabled, allowed_plans FROM platform_integrations`),
      query<{integration_id:string;enabled:boolean}>(`SELECT integration_id, enabled FROM organisation_integrations WHERE org_id = $1`, [orgId]),
      query<{integration_id:string;count:number}>(`SELECT integration_id, COUNT(*)::int AS count FROM integration_connections WHERE org_id = $1 AND status = 'active' GROUP BY integration_id`, [orgId]),
    ]);
    const orgById = new Map(orgRows.map(r => [r.integration_id, r]));
    const connById = new Map(connections.map(r => [r.integration_id, r.count]));
    const platformById = new Map(platform.map(r => [r.integration_id, r]));
    const limits = await getOrgPlanLimits(orgId);
    const planId = limits.plan_id;
    return NextResponse.json({
      plan: { id: planId, maxIntegrations: limits.max_integrations ?? 0 },
      integrations: listIntegrations().map(def => {
        const p = platformById.get(def.id);
        const o = orgById.get(def.id);
        return {
          ...def,
          platformEnabled: p?.enabled ?? false,
          planAllowed: Array.isArray(p?.allowed_plans) ? p!.allowed_plans.includes(planId) || p!.allowed_plans.includes("*") : false,
          organisationEnabled: o?.enabled ?? false,
          connected: (connById.get(def.id) ?? 0) > 0,
        };
      }),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org integrations GET]", err);
    return NextResponse.json({ error: "Failed to load organisation integrations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = await req.json() as {
      integrationId?: string;
      action?: "enable"|"disable"|"connect"|"disconnect";
      authType?: string;
      credentials?: unknown;
      displayName?: string;
      agentId?: string;
    };
    if (!body.integrationId || !body.action) return NextResponse.json({ error: "integrationId and action are required" }, { status: 400 });
    const def = listIntegrations().find(i => i.id === body.integrationId);
    if (!def) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    const platform = (await query<{enabled:boolean;allowed_plans:string[]}>(`SELECT enabled, allowed_plans FROM platform_integrations WHERE integration_id = $1`, [body.integrationId]))[0];
    if (!platform?.enabled) return NextResponse.json({ error: "This integration is disabled by the platform administrator", code: "INTEGRATION_DISABLED" }, { status: 403 });

    // Enabling or connecting requires current plan entitlement. Disabling or
    // disconnecting must remain available after a downgrade and therefore must
    // not depend on the plan-limit service being readable.
    const requiresPlanEntitlement = body.action === "enable" || body.action === "connect";
    const limits = requiresPlanEntitlement ? await getOrgPlanLimits(orgId) : null;
    if (
      requiresPlanEntitlement &&
      limits &&
      (!Array.isArray(platform.allowed_plans) ||
        (!platform.allowed_plans.includes(limits.plan_id) && !platform.allowed_plans.includes("*")))
    ) {
      return NextResponse.json({ error: `The ${limits.plan_id} plan cannot use this integration`, code: "PLAN_NOT_ENTITLED" }, { status: 402 });
    }

    if (body.action === "enable") {
      const limitError = await withTransaction(async client => {
        // Serialise all integration-slot mutations for this organisation so
        // concurrent enable/connect requests cannot both pass the count check.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [orgId]);
        const count = (await client.query<{count:number}>(
          `SELECT COUNT(*)::int AS count FROM organisation_integrations WHERE org_id = $1 AND enabled = true`,
          [orgId],
        )).rows[0]?.count ?? 0;
        const existing = (await client.query(
          `SELECT 1 FROM organisation_integrations WHERE org_id = $1 AND integration_id = $2 AND enabled = true LIMIT 1`,
          [orgId, body.integrationId],
        )).rows[0];
        const max = limits?.max_integrations ?? 0;
        if (max !== -1 && count >= max && !existing) {
          return {
            error: `Your ${limits?.plan_id ?? "current"} plan allows ${max} integrations`,
            code: "INTEGRATION_LIMIT_REACHED",
            limit: max,
            current: count,
          };
        }

        await client.query(
          `INSERT INTO organisation_integrations(org_id,integration_id,enabled,created_by) VALUES($1,$2,true,$3)
           ON CONFLICT(org_id,integration_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
          [orgId, body.integrationId, auth.user.id],
        );
        return null;
      });

      if (limitError) return NextResponse.json(limitError, { status: 402 });
      return NextResponse.json({ ok: true, enabled: true });
    }

    if (body.action === "disable") {
      await query(
        `INSERT INTO organisation_integrations(org_id,integration_id,enabled,created_by) VALUES($1,$2,false,$3)
         ON CONFLICT(org_id,integration_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
        [orgId, body.integrationId, auth.user.id],
      );
      return NextResponse.json({ ok: true, enabled: false });
    }

    if (body.action === "disconnect") {
      await query(`DELETE FROM integration_connections WHERE org_id=$1 AND integration_id=$2 AND ($3::uuid IS NULL OR agent_id=$3)`, [orgId, body.integrationId, body.agentId ?? null]);
      return NextResponse.json({ ok: true });
    }

    if (body.agentId) {
      const agent = (await query<{ id:string }>(
        `SELECT id FROM agents WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [body.agentId, orgId],
      ))[0];
      if (!agent) return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    }

    if (body.credentials === undefined) return NextResponse.json({ error: "credentials are required" }, { status: 400 });

    // Connection creation and implicit organisation enablement must be one
    // transaction. This prevents a failed connection insert from leaving the
    // organisation grant enabled, and serialises the entitlement check with
    // the mutation so concurrent connect requests cannot both consume the same
    // integration slot.
    const limitError = await withTransaction(async client => {
      const current = (await client.query<{ enabled: boolean }>(
        `SELECT enabled FROM organisation_integrations WHERE org_id = $1 AND integration_id = $2 FOR UPDATE`,
        [orgId, body.integrationId],
      )).rows[0];

      if (!current?.enabled) {
        const count = (await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM organisation_integrations
            WHERE org_id = $1 AND enabled = true`,
          [orgId],
        )).rows[0]?.count ?? 0;
        const max = limits?.max_integrations ?? 0;
        if (max !== -1 && count >= max) {
          return {
            error: `Your ${limits?.plan_id ?? "current"} plan allows ${max} integrations`,
            code: "INTEGRATION_LIMIT_REACHED",
            limit: max,
            current: count,
          };
        }
      }

      await client.query(
        `INSERT INTO organisation_integrations(org_id,integration_id,enabled,created_by) VALUES($1,$2,true,$3)
         ON CONFLICT(org_id,integration_id) DO UPDATE SET enabled=true,updated_at=now()`,
        [orgId, body.integrationId, auth.user.id],
      );
      await client.query(
        `INSERT INTO integration_connections(org_id,agent_id,user_id,integration_id,auth_type,credentials_encrypted,display_name)
         VALUES($1,$2,$3,$4,$5,pgp_sym_encrypt($6,$7),$8)`,
        [orgId, body.agentId ?? null, auth.user.id, body.integrationId, body.authType ?? def.authType, JSON.stringify(body.credentials), ENCRYPTION_KEY, body.displayName ?? def.displayName],
      );
      return null;
    });

    if (limitError) return NextResponse.json(limitError, { status: 402 });
    return NextResponse.json({ ok: true, connected: true }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org integrations POST]", err);
    return NextResponse.json({ error: "Failed to update integration access" }, { status: 500 });
  }
}
