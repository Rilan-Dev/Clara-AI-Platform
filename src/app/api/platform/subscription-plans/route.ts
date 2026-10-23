import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { pool, query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { validateMcpEntitlements, recordPlatformMcpAudit } from "@/modules/mcp";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";

export const dynamic = "force-dynamic";

type PlanInput = {
  planId?: string;
  name?: string;
  description?: string;
  priceUsd?: number;
  maxKbs?: number;
  maxDocsPerKb?: number;
  maxReqDay?: number;
  maxStorageMb?: number;
  maxIntegrations?: number;
  maxTtsCharsDay?: number;
  maxSttAudioSecDay?: number;
  maxTranslationCharsDay?: number;
  voiceEnabled?: boolean;
  apiAccess?: boolean;
  customBranding?: boolean;
  multilingualEmbeddings?: boolean;
  ssoEnabled?: boolean;
  analyticsLevel?: "basic" | "full" | "advanced" | "custom";
  prioritySupport?: boolean;
  features?: string[];
  enabled?: boolean;
  action?: "enable" | "disable";
  /** MCP plan entitlements — validated centrally before any write. */
  mcpEntitlements?: unknown;
};

async function requirePlatformAdmin(req: NextRequest) {
  const auth = await requireAuth(req);
  await requireSuperAdmin(auth);
  return auth;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await requirePlatformAdmin(req);
    const plans = await query(`
      SELECT sp.id, sp.enabled, COALESCE(pv.name, sp.name) AS name,
             COALESCE(pv.description, sp.description) AS description,
             COALESCE(pv.price_usd, sp.price_usd) AS price_usd,
             COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
             COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
             COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
             COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
             COALESCE(pv.max_integrations, sp.max_integrations) AS max_integrations,
             COALESCE(pv.max_tts_chars_day, sp.max_tts_chars_day, -1) AS max_tts_chars_day,
             COALESCE(pv.max_stt_audio_sec_day, sp.max_stt_audio_sec_day, -1) AS max_stt_audio_sec_day,
             COALESCE(pv.max_translation_chars_day, sp.max_translation_chars_day, -1) AS max_translation_chars_day,
             COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
             COALESCE(pv.api_access, sp.api_access) AS api_access,
             COALESCE(pv.custom_branding, sp.custom_branding) AS custom_branding,
              COALESCE(pv.multilingual_embeddings, sp.multilingual_embeddings) AS multilingual_embeddings,
             COALESCE(pv.sso_enabled, sp.sso_enabled) AS sso_enabled,
             COALESCE(pv.analytics_level, sp.analytics_level) AS analytics_level,
             COALESCE(pv.priority_support, sp.priority_support) AS priority_support,
             COALESCE(pv.features, sp.features) AS features,
             sp.mcp_entitlements AS mcp_entitlements,
             pv.id AS published_version_id, pv.version AS published_version,
             (SELECT v.id FROM subscription_plan_versions v WHERE v.plan_id = sp.id AND v.status = 'draft' ORDER BY v.version DESC LIMIT 1) AS draft_version_id,
             (SELECT v.version FROM subscription_plan_versions v WHERE v.plan_id = sp.id AND v.status = 'draft' ORDER BY v.version DESC LIMIT 1) AS draft_version,
             (SELECT COUNT(*)::int FROM subscription_plan_versions all_versions WHERE all_versions.plan_id = sp.id) AS version_count
      FROM subscription_plans sp
      LEFT JOIN LATERAL (
        SELECT * FROM subscription_plan_versions
        WHERE plan_id = sp.id AND status = 'published'
        ORDER BY version DESC LIMIT 1
      ) pv ON TRUE
      ORDER BY sp.price_usd ASC, sp.id ASC
    `);
    return NextResponse.json({ plans });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/subscription-plans]", err);
    return NextResponse.json({ error: "Failed to fetch plan versions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requirePlatformAdmin(req);
    const body = await req.json() as PlanInput;
    if (!body.planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
    // A subscription plan is a shared billing resource. Do not block edits to
    // non-MCP fields, but reject direct attempts to change the disabled MCP
    // feature before fetching a plan or writing versions/audit records.
    if (body.mcpEntitlements !== undefined && !isPlatformFeatureEnabled("integrations")) {
      return NextResponse.json(
        { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
        { status: 404 },
      );
    }

    const base = (await query<Record<string, unknown>>(
      "SELECT * FROM subscription_plans WHERE id = $1 LIMIT 1", [body.planId],
    ))[0];
    if (!base) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // MCP entitlements: validate centrally; fall back to the plan's current
    // value when the editor did not send an MCP section.
    let mcpEntitlementsJson: string | null;
    if (body.mcpEntitlements !== undefined) {
      const validated = validateMcpEntitlements(body.mcpEntitlements);
      if (!validated.ok) {
        return NextResponse.json(
          { error: "Invalid MCP entitlements", issues: validated.errors },
          { status: 400 },
        );
      }
      mcpEntitlementsJson = JSON.stringify(validated.value);
      // Restrictive/high-impact MCP changes on a plan require confirmation.
      const current = base.mcp_entitlements as Record<string, unknown> | null;
      if (current?.enabled === true && !validated.value.enabled) {
        const confirmation =
          typeof (body as Record<string, unknown>).mcpConfirmation === "string"
            ? String((body as Record<string, unknown>).mcpConfirmation).trim().toUpperCase()
            : "";
        if (confirmation !== "DISABLE-PLAN-MCP") {
          return NextResponse.json(
            {
              error:
                "Disabling MCP for a plan blocks new operations for its subscribers. Type DISABLE-PLAN-MCP to confirm.",
              code: "CONFIRMATION_REQUIRED",
            },
            { status: 400 },
          );
        }
      }
      await recordPlatformMcpAudit({
        actorUserId: auth.user.id,
        action: "plan.mcp_entitlements_updated",
        entityType: "subscription_plan",
        entityId: body.planId,
        details: {
          draftVersion: true,
          before: current ?? null,
          after: validated.value,
        },
      });
    } else {
      mcpEntitlementsJson =
        base.mcp_entitlements != null
          ? JSON.stringify(base.mcp_entitlements)
          : null;
    }

    const nextVersion = (await query<{ version: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM subscription_plan_versions WHERE plan_id = $1",
      [body.planId],
    ))[0]?.version ?? 1;

    const version = (await query<Record<string, unknown>>(`
      INSERT INTO subscription_plan_versions
        (plan_id, version, name, description, price_usd, max_kbs, max_docs_per_kb,
         max_req_day, max_storage_mb, max_integrations, max_tts_chars_day, max_stt_audio_sec_day, max_translation_chars_day,
         voice_enabled, api_access, custom_branding, sso_enabled, analytics_level, priority_support,
         features, status, created_by, multilingual_embeddings, mcp_entitlements)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'draft',$21,$22,$23::jsonb)
      RETURNING *
    `, [
      body.planId, nextVersion,
      body.name ?? base.name, body.description ?? base.description,
      body.priceUsd ?? base.price_usd, body.maxKbs ?? base.max_kbs,
      body.maxDocsPerKb ?? base.max_docs_per_kb, body.maxReqDay ?? base.max_req_day,
      body.maxStorageMb ?? base.max_storage_mb,
      body.maxIntegrations ?? base.max_integrations,
      body.maxTtsCharsDay ?? base.max_tts_chars_day ?? -1,
      body.maxSttAudioSecDay ?? base.max_stt_audio_sec_day ?? -1,
      body.maxTranslationCharsDay ?? base.max_translation_chars_day ?? -1,
      body.voiceEnabled ?? base.voice_enabled,
      body.apiAccess ?? base.api_access, body.customBranding ?? base.custom_branding,
      body.ssoEnabled ?? base.sso_enabled, body.analyticsLevel ?? base.analytics_level,
      body.prioritySupport ?? base.priority_support, JSON.stringify(body.features ?? base.features ?? []),
      auth.user.id,
      body.multilingualEmbeddings ?? null,
      mcpEntitlementsJson,
    ]))[0];

    // Keep the live plan row's MCP entitlements aligned with the draft so the
    // entitlement resolver (which reads the live row, matching
    // max_integrations behavior) reflects the newest admin intent. The
    // published-version value remains the auditable snapshot.
    if (body.mcpEntitlements !== undefined && mcpEntitlementsJson != null) {
      await query(
        `UPDATE subscription_plans SET mcp_entitlements = $1::jsonb WHERE id = $2`,
        [mcpEntitlementsJson, body.planId],
      );
    }

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/subscription-plans]", err);
    return NextResponse.json({ error: "Failed to create plan draft" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    await requirePlatformAdmin(req);
    const body = await req.json() as {
      versionId?: string;
      action?: "publish" | "archive" | "enable" | "disable" | "multilingual";
      planId?: string;
      enabled?: boolean;
    };
    // Multilingual knowledge index entitlement: a plan-wide feature switch.
    // Versions inherit it (NULL) so every subscriber of the plan follows it.
    if (body.action === "multilingual") {
      if (!body.planId || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "planId and enabled are required" }, { status: 400 });
      }
      const updated = await query<{ id: string }>(
        "UPDATE subscription_plans SET multilingual_embeddings = $1 WHERE id = $2 RETURNING id",
        [body.enabled, body.planId],
      );
      if (!updated[0]) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      await query("UPDATE subscription_plan_versions SET multilingual_embeddings = NULL WHERE plan_id = $1", [body.planId]);
      return NextResponse.json({ ok: true, planId: body.planId, multilingualEmbeddings: body.enabled });
    }
    if (body.action === "enable" || body.action === "disable") {
      if (!body.planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
      if (!["free", "starter", "pro", "enterprise"].includes(body.planId)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
      const result = await query<{ id: string }>(
        "UPDATE subscription_plans SET enabled = $1 WHERE id = $2 RETURNING id",
        [body.action === "enable", body.planId],
      );
      if (!result[0]) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      return NextResponse.json({ ok: true, planId: body.planId, enabled: body.action === "enable" });
    }

    if (!body.versionId || !body.action) {
      return NextResponse.json({ error: "versionId and action are required" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ plan_id: string }>(
        "SELECT plan_id FROM subscription_plan_versions WHERE id = $1 FOR UPDATE", [body.versionId],
      );
      if (!found.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Plan version not found" }, { status: 404 });
      }
      if (body.action === "publish") {
        await client.query(
          "UPDATE subscription_plan_versions SET status = 'archived' WHERE plan_id = $1 AND status = 'published'",
          [found.rows[0].plan_id],
        );
      }
      await client.query(
        "UPDATE subscription_plan_versions SET status = $1, effective_at = CASE WHEN $1 = 'published' THEN now() ELSE effective_at END WHERE id = $2",
        [body.action === "publish" ? "published" : "archived", body.versionId],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/platform/subscription-plans]", err);
    return NextResponse.json({ error: "Failed to update plan version" }, { status: 500 });
  }
}
