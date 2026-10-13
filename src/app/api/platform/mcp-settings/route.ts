import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  MCP_PLATFORM_SETTINGS_DEFAULT,
  mcpPlatformSettingsSchema,
  recordPlatformMcpAudit,
  type McpPlatformSettings,
} from "@/modules/mcp";

export const dynamic = "force-dynamic";

type SettingsRow = {
  mcp_enabled: boolean;
  emergency_disabled: boolean;
  security_policy: unknown;
  platform_catalog_enabled: boolean;
  clara_hosted_enabled: boolean;
  updated_at: Date;
  updated_by: string | null;
};

function mapSettingsRow(row: SettingsRow | undefined): McpPlatformSettings {
  if (!row) return MCP_PLATFORM_SETTINGS_DEFAULT;
  const parsed = mcpPlatformSettingsSchema.safeParse({
    mcpEnabled: row.mcp_enabled,
    emergencyDisabled: row.emergency_disabled,
    securityPolicy: row.security_policy ?? {},
    platformCatalogEnabled: row.platform_catalog_enabled,
    claraHostedEnabled: row.clara_hosted_enabled,
  });
  return parsed.success ? parsed.data : MCP_PLATFORM_SETTINGS_DEFAULT;
}

/** GET /api/platform/mcp-settings — global MCP governance (super admin). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const rows = await query<SettingsRow>(
      `SELECT mcp_enabled, emergency_disabled, security_policy,
              platform_catalog_enabled, clara_hosted_enabled, updated_at, updated_by
         FROM mcp_platform_settings WHERE id = TRUE LIMIT 1`,
    );
    const row = rows[0];
    return NextResponse.json({
      settings: mapSettingsRow(row),
      updatedAt: row ? new Date(row.updated_at).toISOString() : null,
      updatedBy: row?.updated_by ?? null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform mcp-settings GET]", err);
    return NextResponse.json({ error: "Failed to load MCP settings" }, { status: 500 });
  }
}

/**
 * PUT /api/platform/mcp-settings — update global MCP governance.
 *
 * Emergency disablement and platform-wide disablement require an explicit
 * confirmation string in the body ("EMERGENCY-DISABLE" / "DISABLE-MCP") so a
 * stray form submission cannot switch the platform off.
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = (await req.json()) as Record<string, unknown>;

    // Load current state for change detection + confirmation requirements.
    const currentRows = await query<SettingsRow>(
      `SELECT mcp_enabled, emergency_disabled, security_policy,
              platform_catalog_enabled, clara_hosted_enabled, updated_at, updated_by
         FROM mcp_platform_settings WHERE id = TRUE LIMIT 1`,
    );
    const current = mapSettingsRow(currentRows[0]);

    const candidate = {
      mcpEnabled:
        typeof body.mcpEnabled === "boolean" ? body.mcpEnabled : current.mcpEnabled,
      emergencyDisabled:
        typeof body.emergencyDisabled === "boolean"
          ? body.emergencyDisabled
          : current.emergencyDisabled,
      securityPolicy: {
        requireHttps:
          typeof (body.securityPolicy as Record<string, unknown> | undefined)?.requireHttps ===
          "boolean"
            ? (body.securityPolicy as Record<string, unknown>).requireHttps
            : current.securityPolicy.requireHttps,
        blockPrivateNetworks:
          typeof (body.securityPolicy as Record<string, unknown> | undefined)
              ?.blockPrivateNetworks === "boolean"
            ? (body.securityPolicy as Record<string, unknown>).blockPrivateNetworks
            : current.securityPolicy.blockPrivateNetworks,
        maxRedirects:
          typeof (body.securityPolicy as Record<string, unknown> | undefined)?.maxRedirects ===
          "number"
            ? (body.securityPolicy as Record<string, unknown>).maxRedirects
            : current.securityPolicy.maxRedirects,
        requestTimeoutMs:
          typeof (body.securityPolicy as Record<string, unknown> | undefined)
              ?.requestTimeoutMs === "number"
            ? (body.securityPolicy as Record<string, unknown>).requestTimeoutMs
            : current.securityPolicy.requestTimeoutMs,
        // TLS verification cannot be disabled — always true.
        tlsVerify: true,
      },
      platformCatalogEnabled:
        typeof body.platformCatalogEnabled === "boolean"
          ? body.platformCatalogEnabled
          : current.platformCatalogEnabled,
      claraHostedEnabled:
        typeof body.claraHostedEnabled === "boolean"
          ? body.claraHostedEnabled
          : current.claraHostedEnabled,
    };

    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation.trim().toUpperCase() : "";

    if (!candidate.mcpEnabled && current.mcpEnabled && confirmation !== "DISABLE-MCP") {
      return NextResponse.json(
        {
          error:
            "Turning MCP off platform-wide requires explicit confirmation. Type DISABLE-MCP to confirm.",
          code: "CONFIRMATION_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (candidate.emergencyDisabled && !current.emergencyDisabled && confirmation !== "EMERGENCY-DISABLE") {
      return NextResponse.json(
        {
          error:
            "Emergency disablement overrides every plan entitlement. Type EMERGENCY-DISABLE to confirm.",
          code: "CONFIRMATION_REQUIRED",
        },
        { status: 400 },
      );
    }

    const parsed = mcpPlatformSettingsSchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid MCP settings",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 },
      );
    }
    const next = parsed.data;

    await query(
      `UPDATE mcp_platform_settings
          SET mcp_enabled = $1,
              emergency_disabled = $2,
              security_policy = $3::jsonb,
              platform_catalog_enabled = $4,
              clara_hosted_enabled = $5,
              updated_by = $6,
              updated_at = now()
        WHERE id = TRUE`,
      [
        next.mcpEnabled,
        next.emergencyDisabled,
        JSON.stringify(next.securityPolicy),
        next.platformCatalogEnabled,
        next.claraHostedEnabled,
        auth.user.id,
      ],
    );

    // Safe before/after audit (no secrets involved in these settings).
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    if (next.mcpEnabled !== current.mcpEnabled) {
      changes.mcpEnabled = { before: current.mcpEnabled, after: next.mcpEnabled };
    }
    if (next.emergencyDisabled !== current.emergencyDisabled) {
      changes.emergencyDisabled = {
        before: current.emergencyDisabled,
        after: next.emergencyDisabled,
      };
    }
    if (JSON.stringify(next.securityPolicy) !== JSON.stringify(current.securityPolicy)) {
      changes.securityPolicy = {
        before: current.securityPolicy,
        after: next.securityPolicy,
      };
    }
    if (next.platformCatalogEnabled !== current.platformCatalogEnabled) {
      changes.platformCatalogEnabled = {
        before: current.platformCatalogEnabled,
        after: next.platformCatalogEnabled,
      };
    }
    if (next.claraHostedEnabled !== current.claraHostedEnabled) {
      changes.claraHostedEnabled = {
        before: current.claraHostedEnabled,
        after: next.claraHostedEnabled,
      };
    }

    const action = next.emergencyDisabled && !current.emergencyDisabled
      ? "platform.emergency_disabled"
      : !next.emergencyDisabled && current.emergencyDisabled
        ? "platform.emergency_enabled"
        : "platform.settings_updated";

    await recordPlatformMcpAudit({
      actorUserId: auth.user.id,
      action,
      entityType: "mcp_platform_settings",
      entityId: "global",
      details: { changes },
    });

    return NextResponse.json({ settings: next });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform mcp-settings PUT]", err);
    return NextResponse.json({ error: "Failed to update MCP settings" }, { status: 500 });
  }
}