import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, withTransaction } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

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
      platformEnabled?: boolean; tools?: unknown;
    };
    if (!body.serverKey || !/^[a-z][a-z0-9_-]{1,62}$/.test(body.serverKey) ||
        !body.displayName?.trim() || body.displayName.trim().length > 120 ||
        !validEndpoint(body.endpointUrl) ||
        (body.transportType ?? "streamable_http") !== "streamable_http" ||
        !["none", "bearer"].includes(body.authMode ?? "none") ||
        (body.allowedPlans !== undefined && !validPlans(body.allowedPlans)) ||
        (body.tools !== undefined && !validTools(body.tools))) {
      return NextResponse.json({ error: "Invalid MCP server configuration. Only HTTPS Streamable HTTP endpoints and supported auth modes are accepted." }, { status: 400 });
    }
    const result = await withTransaction(async client => {
      const inserted = await client.query<{id:string}>(
        `INSERT INTO platform_mcp_servers(server_key,display_name,description,transport_type,endpoint_url,auth_mode,platform_enabled,allowed_plans,created_by)
         VALUES($1,$2,$3,'streamable_http',$4,$5,$6,$7::jsonb,$8) RETURNING id`,
        [body.serverKey, body.displayName.trim(), (body.description ?? "").slice(0, 2000), body.endpointUrl,
          body.authMode ?? "none", body.platformEnabled === true, JSON.stringify(body.allowedPlans ?? ["pro","enterprise"]), auth.user.id],
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
    };
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id) ||
        (body.platformEnabled !== undefined && typeof body.platformEnabled !== "boolean") ||
        (body.displayName !== undefined && (!body.displayName.trim() || body.displayName.trim().length > 120)) ||
        (body.endpointUrl !== undefined && !validEndpoint(body.endpointUrl)) ||
        (body.authMode !== undefined && !["none","bearer"].includes(body.authMode)) ||
        (body.allowedPlans !== undefined && !validPlans(body.allowedPlans)) ||
        (body.tools !== undefined && !validTools(body.tools))) {
      return NextResponse.json({ error: "Invalid MCP server update" }, { status: 400 });
    }
    const result = await withTransaction(async client => {
      const updated = await client.query(
        `UPDATE platform_mcp_servers SET
           platform_enabled = COALESCE($2, platform_enabled),
           display_name = COALESCE($3, display_name),
           description = COALESCE($4, description),
           endpoint_url = COALESCE($5, endpoint_url),
           auth_mode = COALESCE($6, auth_mode),
           allowed_plans = COALESCE($7::jsonb, allowed_plans),
           updated_at = now()
         WHERE id = $1 RETURNING id`,
        [body.id, body.platformEnabled ?? null, body.displayName?.trim() ?? null,
          body.description?.slice(0,2000) ?? null, body.endpointUrl ?? null, body.authMode ?? null,
          body.allowedPlans === undefined ? null : JSON.stringify(body.allowedPlans)],
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
