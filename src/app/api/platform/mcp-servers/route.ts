import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, withTransaction } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

const AUTH_MODES = ["none", "bearer", "oauth"] as const;
type AuthMode = (typeof AUTH_MODES)[number];

function validBearerToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.length <= 8192;
}

export const dynamic = "force-dynamic";

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const normalizedHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) return false;
    // Require DNS hostnames at configuration time; the eventual transport must
    // also resolve and reject private/link-local targets on every connection.
    if (isIP(normalizedHost) !== 0 || /^[0-9.]+$/.test(normalizedHost)) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host === "metadata.google.internal" || host === "169.254.169.254" ||
        /^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("fc") || host.startsWith("fd")) return false;
    return true;
  } catch { return false; }
}
function validPlans(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 &&
    value.every((v) => typeof v === "string" && (v === "*" || /^[a-z0-9_-]{1,64}$/.test(v)));
}
function validTools(value: unknown): value is Array<{ name: string; approved: boolean; allowedSurfaces?: string[] }> {
  return Array.isArray(value) && value.length <= 250 &&
    value.every((t) => t && typeof t.name === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(t.name) &&
      typeof t.approved === "boolean" &&
      (t.allowedSurfaces === undefined || (Array.isArray(t.allowedSurfaces) && t.allowedSurfaces.length > 0 &&
        t.allowedSurfaces.every((s: unknown) => s === "chat" || s === "realtime"))));
}

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const servers = await query(
      `SELECT s.id, s.server_key AS "serverKey", s.display_name AS "displayName",
              s.description, s.transport_type AS "transportType", s.endpoint_url AS "endpointUrl",
              s.auth_mode AS "authMode", s.platform_enabled AS "platformEnabled",
              (s.platform_credentials_encrypted IS NOT NULL) AS "hasPlatformCredential",
              s.oauth_status AS "oauthStatus", s.oauth_error AS "oauthError",
              s.oauth_connected_at AS "oauthConnectedAt",
              s.allowed_plans AS "allowedPlans", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
              COALESCE(jsonb_agg(jsonb_build_object('name', t.tool_name, 'approved', t.approved,
                'allowedSurfaces', t.allowed_surfaces)) FILTER (WHERE t.tool_name IS NOT NULL), '[]'::jsonb) AS tools
         FROM platform_mcp_servers s LEFT JOIN platform_mcp_tools t ON t.server_id = s.id
        GROUP BY s.id ORDER BY s.created_at DESC`,
    );
    return NextResponse.json({ servers });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform MCP GET]", err);
    return NextResponse.json({ error: "Failed to load MCP servers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as {
      serverKey?: string; displayName?: string; description?: string; endpointUrl?: string;
      transportType?: string; authMode?: string; allowedPlans?: unknown;
      platformEnabled?: boolean; tools?: unknown; bearerToken?: unknown;
    };
    if (!body.serverKey || !/^[a-z][a-z0-9_-]{1,62}$/.test(body.serverKey) ||
        typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.trim().length > 120 ||
        !validEndpoint(body.endpointUrl) ||
        (body.transportType ?? "streamable_http") !== "streamable_http" ||
        !AUTH_MODES.includes((body.authMode ?? "none") as AuthMode) ||
        (body.allowedPlans !== undefined && !validPlans(body.allowedPlans)) ||
        (body.tools !== undefined && !validTools(body.tools)) ||
        (body.bearerToken !== undefined && body.bearerToken !== null && body.bearerToken !== "" && !validBearerToken(body.bearerToken)) ||
        (body.authMode === "oauth" && body.bearerToken)) {
      return NextResponse.json({ error: "Invalid MCP server configuration. Only HTTPS Streamable HTTP endpoints and supported auth modes are accepted." }, { status: 400 });
    }
    const displayName = body.displayName.trim();
    const authMode = (body.authMode ?? "none") as AuthMode;
    // Platform-managed credential: an admin-supplied bearer token is stored
    // encrypted (never returned by any API) and used for admin tests and, by
    // default, for organisation connections. OAuth servers start unconnected
    // and gain their credential through the OAuth sign-in flow.
    const platformCredential = authMode === "bearer" && validBearerToken(body.bearerToken)
      ? JSON.stringify({ type: "bearer", bearerToken: (body.bearerToken as string).trim() })
      : null;
    const result = await withTransaction(async client => {
      const inserted = await client.query<{id:string}>(
        `INSERT INTO platform_mcp_servers(server_key,display_name,description,transport_type,endpoint_url,auth_mode,platform_enabled,allowed_plans,created_by,platform_credentials_encrypted)
         VALUES($1,$2,$3,'streamable_http',$4,$5,$6,$7::jsonb,$8,
           CASE WHEN $9::text IS NULL THEN NULL ELSE pgp_sym_encrypt($9,$10) END)
         RETURNING id`,
        [body.serverKey, displayName, (body.description ?? "").slice(0, 2000), body.endpointUrl,
          authMode, body.platformEnabled === true, JSON.stringify(body.allowedPlans ?? ["pro","enterprise"]), auth.user.id,
          platformCredential, ENCRYPTION_KEY],
      );
      const id = inserted.rows[0].id;
      if (Array.isArray(body.tools) && body.tools.length) {
        for (const tool of body.tools as Array<{name:string;approved:boolean;allowedSurfaces?:string[]}>) {
          await client.query(
            `INSERT INTO platform_mcp_tools(server_id,tool_name,approved,allowed_surfaces,updated_by)
             VALUES($1,$2,$3,$4::jsonb,$5)`,
            [id, tool.name, tool.approved, JSON.stringify(tool.allowedSurfaces ?? ["chat","realtime"]), auth.user.id],
          );
        }
      }
      return id;
    });
    return NextResponse.json({ ok: true, id: result }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (typeof err === "object" && err !== null && "code" in err && (err as {code?:string}).code === "23505") {
      return NextResponse.json({ error: "An MCP server with this key already exists" }, { status: 409 });
    }
    console.error("[platform MCP POST]", err);
    return NextResponse.json({ error: "Failed to create MCP server" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as {
      id?: string; platformEnabled?: boolean; displayName?: string; description?: string;
      endpointUrl?: string; authMode?: string; allowedPlans?: unknown; tools?: unknown;
      bearerToken?: unknown; clearPlatformCredential?: boolean;
    };
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id) ||
        (body.platformEnabled !== undefined && typeof body.platformEnabled !== "boolean") ||
        (body.displayName !== undefined && (!body.displayName.trim() || body.displayName.trim().length > 120)) ||
        (body.endpointUrl !== undefined && !validEndpoint(body.endpointUrl)) ||
        (body.authMode !== undefined && !AUTH_MODES.includes(body.authMode as AuthMode)) ||
        (body.allowedPlans !== undefined && !validPlans(body.allowedPlans)) ||
        (body.tools !== undefined && !validTools(body.tools)) ||
        (body.bearerToken !== undefined && body.bearerToken !== null && body.bearerToken !== "" && !validBearerToken(body.bearerToken)) ||
        (body.clearPlatformCredential !== undefined && typeof body.clearPlatformCredential !== "boolean")) {
      return NextResponse.json({ error: "Invalid MCP server update" }, { status: 400 });
    }
    const result = await withTransaction(async client => {
      // Credential lifecycle on update:
      //  - switching auth mode clears the stored credential (its shape is
      //    mode-specific) and resets the OAuth connection state
      //  - a non-empty bearerToken (bearer mode) replaces the stored secret
      //  - clearPlatformCredential removes it explicitly
      //  - a blank/absent bearerToken keeps the current secret untouched
      const updated = await client.query<{ auth_mode: string }>(
        `UPDATE platform_mcp_servers SET
           platform_enabled = COALESCE($2, platform_enabled),
           display_name = COALESCE($3, display_name),
           description = COALESCE($4, description),
           endpoint_url = COALESCE($5, endpoint_url),
           auth_mode = COALESCE($6, auth_mode),
           allowed_plans = COALESCE($7::jsonb, allowed_plans),
           platform_credentials_encrypted = CASE
             WHEN $8::boolean THEN NULL
             WHEN $6 IS NOT NULL AND $6 IS DISTINCT FROM auth_mode THEN NULL
             WHEN $9::text IS NOT NULL AND COALESCE($6, auth_mode) = 'bearer' THEN pgp_sym_encrypt($9, $10)
             ELSE platform_credentials_encrypted END,
           oauth_status = CASE
             WHEN $6 IS NOT NULL AND $6 IS DISTINCT FROM auth_mode THEN 'not_connected'
             WHEN $8::boolean THEN 'not_connected'
             ELSE oauth_status END,
           oauth_error = CASE
             WHEN $6 IS NOT NULL AND $6 IS DISTINCT FROM auth_mode THEN NULL
             WHEN $8::boolean THEN NULL
             ELSE oauth_error END,
           oauth_connected_at = CASE
             WHEN $6 IS NOT NULL AND $6 IS DISTINCT FROM auth_mode THEN NULL
             WHEN $8::boolean THEN NULL
             ELSE oauth_connected_at END,
           updated_at = now()
         WHERE id = $1 RETURNING auth_mode`,
        [body.id, body.platformEnabled ?? null, body.displayName?.trim() ?? null,
          body.description?.slice(0,2000) ?? null, body.endpointUrl ?? null, body.authMode ?? null,
          body.allowedPlans === undefined ? null : JSON.stringify(body.allowedPlans),
          body.clearPlatformCredential === true,
          validBearerToken(body.bearerToken) ? JSON.stringify({ type: "bearer", bearerToken: (body.bearerToken as string).trim() }) : null,
          ENCRYPTION_KEY],
      );
      if (!updated.rows[0]) return false;
      if (body.tools !== undefined) {
        for (const tool of body.tools as Array<{name:string;approved:boolean;allowedSurfaces?:string[]}>) {
          await client.query(
            `INSERT INTO platform_mcp_tools(server_id,tool_name,approved,allowed_surfaces,updated_by)
             VALUES($1,$2,$3,$4::jsonb,$5)
             ON CONFLICT(server_id,tool_name) DO UPDATE SET approved=EXCLUDED.approved,
               allowed_surfaces=EXCLUDED.allowed_surfaces,updated_by=EXCLUDED.updated_by,updated_at=now()`,
            [body.id, tool.name, tool.approved, JSON.stringify(tool.allowedSurfaces ?? ["chat","realtime"]), auth.user.id],
          );
        }
      }
      return true;
    });
    if (!result) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform MCP PATCH]", err);
    return NextResponse.json({ error: "Failed to update MCP server" }, { status: 500 });
  }
}

/** DELETE — remove an MCP server. Every dependent row (platform tools,
 *  organisation connections, organisation and agent tool grants) is declared
 *  ON DELETE CASCADE in migration 069, so one transactional delete removes
 *  the whole footprint without leaving orphaned grants behind. */
export async function DELETE(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as { id?: string };
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) {
      return NextResponse.json({ error: "A valid MCP server id is required" }, { status: 400 });
    }
    const result = await withTransaction(async client => {
      const deleted = await client.query<{ id: string; server_key: string }>(
        `DELETE FROM platform_mcp_servers WHERE id = $1 RETURNING id, server_key`,
        [body.id],
      );
      return deleted.rows[0] ?? null;
    });
    if (!result) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: true, id: result.id, serverKey: result.server_key });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform MCP DELETE]", err);
    return NextResponse.json({ error: "Failed to delete MCP server" }, { status: 500 });
  }
}
