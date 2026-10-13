/**
 * src/modules/mcp/service.ts
 *
 * Organization-owned MCP connection lifecycle — the authoritative server-side
 * business logic shared by every org API route and the runtime.
 *
 * Entitlement enforcement map (server-side only; UI state is never trusted):
 *   - list/detail            → requires available entitlement for management
 *   - create                 → available + customEndpoints + connection limit
 *                              + allowed transport + allowed auth method
 *                              + real handshake + discovery + tool limit
 *   - update/enable          → available + customEndpoints
 *   - test                   → available (connection must belong to org)
 *   - rediscover/approve     → available + tool limits per connection
 *   - agent grants           → available + agent assignment limit
 *   - disable/delete/revoke  → always allowed for unwinding (no entitlement
 *                              dependency, mirroring integrations behavior)
 */

import { query, withTransaction } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import type { PoolClient } from "pg";
import {
  McpClientError,
  mcpDiscoverTools,
  mcpHandshake,
  parseCredentials,
} from "./client";
import {
  resolveEffectiveMcpEntitlements,
  type EffectiveMcpEntitlements,
} from "./entitlements";
import { recordOrgMcpAudit } from "./audit";
import { getMcpUsageSummary } from "./metering";

export class McpServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "McpServiceError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

// ─── Connection projections ──────────────────────────────────────────────────

export type OrgMcpConnectionSummary = {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  transport: string;
  authType: string;
  status: "active" | "disabled" | "error" | "expired" | "testing";
  lastError: string | null;
  lastCheckedAt: string | null;
  serverName: string | null;
  serverVersion: string | null;
  protocolVersion: string | null;
  toolCount: number;
  approvedToolCount: number;
  agentGrantCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgMcpToolRow = {
  id: string;
  toolName: string;
  title: string | null;
  description: string;
  inputSchema: Record<string, unknown>;
  approved: boolean;
  status: "discovered" | "approved" | "revoked" | "stale";
  approvedAt: string | null;
  approvedBy: string | null;
  lastSeenAt: string | null;
  agentGrantCount: number;
  updatedAt: string;
};

export type OrgMcpConnectionDetail = OrgMcpConnectionSummary & {
  tools: OrgMcpToolRow[];
  usage: {
    callsLast24h: number;
    callsThisPeriod: number;
    failedCallsThisPeriod: number;
  };
};

type ConnectionRow = {
  id: string;
  name: string;
  description: string;
  endpoint_url: string;
  transport: string;
  auth_type: string;
  status: string;
  last_error: string | null;
  last_checked_at: Date | null;
  handshake_protocol: string | null;
  handshake_server_info: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  tool_count: number;
  approved_tool_count: number;
  agent_grant_count: number;
};

const CONNECTION_LIST_SELECT = `
  SELECT c.id, c.name, c.description, c.endpoint_url, c.transport, c.auth_type,
         c.status, c.last_error, c.last_checked_at, c.handshake_protocol,
         c.handshake_server_info, c.created_at, c.updated_at,
         (SELECT COUNT(*)::int FROM org_mcp_tools t WHERE t.connection_id = c.id) AS tool_count,
         (SELECT COUNT(*)::int FROM org_mcp_tools t WHERE t.connection_id = c.id AND t.approved = TRUE AND t.status = 'approved') AS approved_tool_count,
         (SELECT COUNT(*)::int FROM org_mcp_agent_grants g JOIN org_mcp_tools t ON t.id = g.tool_id
           WHERE t.connection_id = c.id AND g.enabled = TRUE) AS agent_grant_count
`;

function mapConnectionRow(row: ConnectionRow): OrgMcpConnectionSummary {
  const serverInfo = row.handshake_server_info ?? {};
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    endpointUrl: row.endpoint_url,
    transport: row.transport,
    authType: row.auth_type,
    status: (row.status as OrgMcpConnectionSummary["status"]) ?? "disabled",
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at
      ? new Date(row.last_checked_at).toISOString()
      : null,
    serverName:
      typeof serverInfo.name === "string" ? serverInfo.name : null,
    serverVersion:
      typeof serverInfo.version === "string" ? serverInfo.version : null,
    protocolVersion: row.handshake_protocol,
    toolCount: row.tool_count,
    approvedToolCount: row.approved_tool_count,
    agentGrantCount: row.agent_grant_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export async function listOrgMcpConnections(
  orgId: string,
): Promise<OrgMcpConnectionSummary[]> {
  const rows = await query<ConnectionRow>(
    `${CONNECTION_LIST_SELECT}
      FROM org_mcp_connections c
     WHERE c.org_id = $1
     ORDER BY c.updated_at DESC`,
    [orgId],
  );
  return rows.map(mapConnectionRow);
}

export async function getOrgMcpConnectionDetail(
  orgId: string,
  connectionId: string,
): Promise<OrgMcpConnectionDetail | null> {
  const effective = await resolveEffectiveMcpEntitlements(orgId).catch(() => null);
  const periodStart = effective?.periodStart ?? new Date().toISOString().slice(0, 10);
  const [rows, toolRows, usageRows] = await Promise.all([
    query<ConnectionRow>(
      `${CONNECTION_LIST_SELECT}
        FROM org_mcp_connections c
       WHERE c.org_id = $1 AND c.id = $2
       LIMIT 1`,
      [orgId, connectionId],
    ),
    query<{
      id: string;
      tool_name: string;
      title: string | null;
      description: string;
      input_schema: Record<string, unknown>;
      approved: boolean;
      status: string;
      approved_at: Date | null;
      approved_by: string | null;
      last_seen_at: Date | null;
      agent_grant_count: number;
      updated_at: Date;
    }>(
      `SELECT t.id, t.tool_name, t.title, t.description, t.input_schema,
              t.approved, t.status, t.approved_at, t.approved_by, t.last_seen_at,
              t.updated_at,
              (SELECT COUNT(*)::int FROM org_mcp_agent_grants g
                WHERE g.tool_id = t.id AND g.enabled = TRUE) AS agent_grant_count
         FROM org_mcp_tools t
        WHERE t.connection_id = $1 AND t.org_id = $2
        ORDER BY t.approved DESC, t.tool_name ASC`,
      [connectionId, orgId],
    ),
    query<{ day_calls: number; period_calls: number; failed_calls: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE metered_at >= now() - INTERVAL '24 hours')::int AS day_calls,
         COUNT(*) FILTER (WHERE period_start = $2::date)::int AS period_calls,
         COUNT(*) FILTER (WHERE period_start = $2::date AND success = FALSE)::int AS failed_calls
       FROM mcp_tool_usage_log
      WHERE connection_id = $1`,
      [connectionId, periodStart],
    ),
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapConnectionRow(row),
    tools: toolRows.map((t) => ({
      id: t.id,
      toolName: t.tool_name,
      title: t.title,
      description: t.description,
      inputSchema: t.input_schema ?? {},
      approved: t.approved,
      status: (t.status as OrgMcpToolRow["status"]) ?? "discovered",
      approvedAt: t.approved_at ? new Date(t.approved_at).toISOString() : null,
      approvedBy: t.approved_by,
      lastSeenAt: t.last_seen_at ? new Date(t.last_seen_at).toISOString() : null,
      agentGrantCount: t.agent_grant_count,
      updatedAt: new Date(t.updated_at).toISOString(),
    })),
    usage: {
      callsLast24h: usageRows[0]?.day_calls ?? 0,
      callsThisPeriod: usageRows[0]?.period_calls ?? 0,
      failedCallsThisPeriod: usageRows[0]?.failed_calls ?? 0,
    },
  };
}

// ─── Entitlement guards ──────────────────────────────────────────────────────

async function requireMcpAvailable(
  orgId: string,
  operation: string,
): Promise<EffectiveMcpEntitlements> {
  let effective: EffectiveMcpEntitlements;
  try {
    effective = await resolveEffectiveMcpEntitlements(orgId);
  } catch {
    throw new McpServiceError(
      "ENTITLEMENT_RESOLUTION_FAILED",
      "MCP entitlement could not be verified. Try again shortly.",
      503,
    );
  }
  if (!effective.available) {
    throw new McpServiceError(
      effective.denialReason ?? "PLAN_NOT_ENTITLED",
      effective.denialReason === "EMERGENCY_DISABLED"
        ? "MCP access is temporarily disabled by the platform administrator."
        : effective.denialReason === "GLOBAL_DISABLED"
          ? "MCP is not enabled for your plan. Upgrade to use custom MCP servers."
          : "MCP access is temporarily disabled by the platform administrator.",
      403,
      { denialReason: effective.denialReason },
    );
  }
  return effective;
}

// ─── Validation probe (wizard step 3) ────────────────────────────────────────

export type McpValidationProbeResult = {
  handshake: {
    protocolVersion: string;
    serverName: string | null;
    serverVersion: string | null;
    serverTitle: string | null;
  };
  discoveredTools: Array<{
    name: string;
    title: string | null;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  toolLimit: number;
  toolLimitExceeded: boolean;
};

/**
 * Run a live endpoint validation: SSRF policy, handshake, tool discovery.
 * Nothing is persisted — the wizard uses this to show real discovered tools
 * before the organization approves anything. The entitlement is re-resolved
 * so an unavailable plan cannot probe endpoints either.
 */
export async function probeOrgMcpEndpoint(
  orgId: string,
  actorUserId: string,
  input: {
    endpointUrl: string;
    authType: string;
    credentials: Record<string, string>;
  },
): Promise<McpValidationProbeResult> {
  const effective = await requireMcpAvailable(orgId, "probe");
  const entitlements = effective.entitlements;

  if (!entitlements.customEndpoints) {
    throw new McpServiceError(
      "CUSTOM_ENDPOINTS_NOT_ALLOWED",
      "Your plan does not allow organization-owned custom MCP endpoints.",
      403,
    );
  }
  if (!entitlements.allowedTransports.includes("streamable_http" as never)) {
    throw new McpServiceError(
      "TRANSPORT_NOT_ALLOWED",
      "Your plan does not permit the Streamable HTTP MCP transport.",
      403,
    );
  }
  if (
    !entitlements.allowedAuthMethods.includes(input.authType as never)
  ) {
    throw new McpServiceError(
      "AUTH_METHOD_NOT_ALLOWED",
      `Your plan does not permit the "${input.authType}" MCP authentication method.`,
      403,
      { allowedAuthMethods: entitlements.allowedAuthMethods },
    );
  }

  const parsed = parseCredentials(input.authType, input.credentials);
  if (!parsed.ok) throw new McpServiceError("INVALID_CREDENTIALS", parsed.error, 400);

  const options = {
    endpointUrl: input.endpointUrl.trim(),
    credentials: parsed.credentials,
    securityPolicy: effective.globalSettings.securityPolicy,
  };

  let handshake;
  try {
    handshake = await mcpHandshake(options);
  } catch (err) {
    throw toServiceError(err);
  }

  let discovered;
  try {
    discovered = await mcpDiscoverTools(options);
  } catch (err) {
    throw toServiceError(err);
  }

  const toolLimit = entitlements.maxToolsPerConnection;
  return {
    handshake: {
      protocolVersion: handshake.protocolVersion,
      serverName: handshake.serverInfo.name ?? null,
      serverVersion: handshake.serverInfo.version ?? null,
      serverTitle: handshake.serverInfo.title ?? null,
    },
    discoveredTools: discovered.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    toolLimit,
    toolLimitExceeded:
      toolLimit !== -1 && discovered.length > toolLimit,
  };
}

function toServiceError(err: unknown): McpServiceError {
  if (err instanceof McpClientError) {
    return new McpServiceError(err.code, err.message, err.status ?? 502, {
      retryable: err.retryable,
    });
  }
  return new McpServiceError(
    "ENDPOINT_INVALID",
    "The MCP endpoint could not be validated.",
    502,
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────

export type CreateConnectionInput = {
  orgId: string;
  actorUserId: string;
  name: string;
  description: string;
  endpointUrl: string;
  authType: string;
  credentials: Record<string, string>;
  approvedToolNames: string[];
};

/**
 * Create a connection end to end inside one transaction:
 *   entitlement → connection limit → live handshake + discovery →
 *   store encrypted credentials → persist discovered tools → apply explicit
 *   approvals (bounded by the per-connection tool limit) → audit.
 *
 * The discovered tool set comes from the live probe, never from the client.
 */
export async function createOrgMcpConnection(
  input: CreateConnectionInput,
): Promise<{ connectionId: string; summary: OrgMcpConnectionDetail }> {
  const effective = await requireMcpAvailable(input.orgId, "create");
  const entitlements = effective.entitlements;
  if (!entitlements.customEndpoints) {
    throw new McpServiceError(
      "CUSTOM_ENDPOINTS_NOT_ALLOWED",
      "Your plan does not allow organization-owned custom MCP endpoints.",
      403,
    );
  }
  if (
    !entitlements.allowedAuthMethods.includes(input.authType as never)
  ) {
    throw new McpServiceError(
      "AUTH_METHOD_NOT_ALLOWED",
      `Your plan does not permit the "${input.authType}" MCP authentication method.`,
      403,
    );
  }
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new McpServiceError("INVALID_NAME", "Connection name must be 1-120 characters.", 400);
  }
  const description = input.description.trim().slice(0, 500);
  const endpointUrl = input.endpointUrl.trim();
  if (endpointUrl.length > 2048) {
    throw new McpServiceError("INVALID_ENDPOINT", "Endpoint URL is too long.", 400);
  }

  const parsed = parseCredentials(input.authType, input.credentials);
  if (!parsed.ok) throw new McpServiceError("INVALID_CREDENTIALS", parsed.error, 400);

  const options = {
    endpointUrl,
    credentials: parsed.credentials,
    securityPolicy: effective.globalSettings.securityPolicy,
  };
  let handshake;
  try {
    handshake = await mcpHandshake(options);
  } catch (err) {
    throw toServiceError(err);
  }
  let discovered;
  try {
    discovered = await mcpDiscoverTools(options);
  } catch (err) {
    throw toServiceError(err);
  }

  const approvedSet = new Set(
    input.approvedToolNames
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && n.length <= 200),
  );
  const approvable = discovered.filter((tool) => approvedSet.has(tool.name));
  if (approvable.length === 0 && discovered.length > 0 && approvedSet.size > 0) {
    // The client approved tools that no longer exist on the server (changed
    // between probe and save). Fail closed rather than silently dropping.
    throw new McpServiceError(
      "TOOL_SET_CHANGED",
      "The tool list changed since validation. Re-run discovery and approve the current tools.",
      409,
    );
  }

  const connectionId = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `mcp:${input.orgId}`,
    ]);

    const countRows = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM org_mcp_connections WHERE org_id = $1`,
      [input.orgId],
    );
    const count = countRows.rows[0]?.count ?? 0;
    if (
      entitlements.maxConnections !== -1 &&
      count >= entitlements.maxConnections
    ) {
      throw new McpServiceError(
        "CONNECTION_LIMIT_REACHED",
        `Your ${effective.planId} plan allows ${entitlements.maxConnections} MCP connection(s).`,
        402,
        { limit: entitlements.maxConnections, current: count },
      );
    }

    const toolLimit = entitlements.maxToolsPerConnection;
    if (toolLimit !== -1 && approvable.length > toolLimit) {
      throw new McpServiceError(
        "TOOL_LIMIT_REACHED",
        `Your plan allows ${toolLimit} approved tools per connection; ${approvable.length} were approved.`,
        402,
        { limit: toolLimit, requested: approvable.length },
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO org_mcp_connections
         (org_id, name, description, endpoint_url, transport, auth_type,
          credentials_encrypted, status, last_checked_at, handshake_protocol,
          handshake_server_info, created_by)
       VALUES ($1,$2,$3,$4,'streamable_http',$5,
               $6, 'active', now(), $7, $8::jsonb, $9)
       RETURNING id`,
      [
        input.orgId,
        name,
        description,
        endpointUrl,
        input.authType,
        input.authType === "none"
          ? null
          : await encryptCredentials(client, input.authType, input.credentials),
        handshake.protocolVersion,
        JSON.stringify(handshake.serverInfo),
        input.actorUserId,
      ],
    );
    const id = inserted.rows[0].id;

    for (const tool of discovered) {
      await client.query(
        `INSERT INTO org_mcp_tools
           (connection_id, org_id, tool_name, title, description, input_schema,
            approved, approved_by, approved_at, last_seen_at, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,
                 CASE WHEN $7 THEN now() ELSE NULL END, now(),
                 CASE WHEN $7 THEN 'approved' ELSE 'discovered' END)
         ON CONFLICT (connection_id, tool_name) DO NOTHING`,
        [
          id,
          input.orgId,
          tool.name,
          tool.title,
          tool.description,
          JSON.stringify(tool.inputSchema ?? {}),
          approvedSet.has(tool.name),
          approvedSet.has(tool.name) ? input.actorUserId : null,
        ],
      );
    }

    return id;
  });

  await recordOrgMcpAudit({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "connection.created",
    entityType: "org_mcp_connection",
    entityId: connectionId,
    details: {
      name,
      endpointUrl: redactEndpoint(endpointUrl),
      authType: input.authType,
      transport: "streamable_http",
      serverName: handshake.serverInfo.name ?? null,
      protocolVersion: handshake.protocolVersion,
      discoveredTools: discovered.length,
      approvedTools: approvable.length,
    },
  });

  const detail = await getOrgMcpConnectionDetail(input.orgId, connectionId);
  if (!detail) {
    throw new McpServiceError("CREATE_FAILED", "Connection could not be read back.", 500);
  }
  return { connectionId, summary: detail };
}

function redactEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[invalid]";
  }
}

async function encryptCredentials(
  client: PoolClient,
  authType: string,
  credentials: Record<string, string>,
): Promise<Buffer> {
  const result = await client.query<{ encrypted: Buffer }>(
    `SELECT pgp_sym_encrypt($1, $2) AS encrypted`,
    [JSON.stringify({ authType, ...credentials }), ENCRYPTION_KEY],
  );
  return result.rows[0].encrypted;
}

// ─── Update / enable / disable / delete ──────────────────────────────────────

export type UpdateConnectionInput = {
  orgId: string;
  actorUserId: string;
  connectionId: string;
  name?: string;
  description?: string;
  endpointUrl?: string;
};

export async function updateOrgMcpConnection(
  input: UpdateConnectionInput,
): Promise<void> {
  const effective = await requireMcpAvailable(input.orgId, "update");
  if (!effective.entitlements.customEndpoints) {
    throw new McpServiceError(
      "CUSTOM_ENDPOINTS_NOT_ALLOWED",
      "Your plan does not allow organization-owned custom MCP endpoints.",
      403,
    );
  }
  const updates: string[] = [];
  const values: unknown[] = [input.connectionId, input.orgId];
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw new McpServiceError("INVALID_NAME", "Connection name must be 1-120 characters.", 400);
    }
    values.push(name);
    updates.push(`name = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description.trim().slice(0, 500));
    updates.push(`description = $${values.length}`);
  }
  if (input.endpointUrl !== undefined) {
    const url = input.endpointUrl.trim();
    if (url.length > 2048) {
      throw new McpServiceError("INVALID_ENDPOINT", "Endpoint URL is too long.", 400);
    }
    // Endpoint changes must pass the same SSRF/https policy as creation.
    const { assertSafeEgressUrl } = await import(
      "@/modules/integrations/runtime/runner-fetch"
    );
    try {
      if (effective.globalSettings.securityPolicy.requireHttps && !url.startsWith("https://")) {
        throw new Error("https required");
      }
      await assertSafeEgressUrl(url);
    } catch {
      throw new McpServiceError(
        "ENDPOINT_BLOCKED",
        "The new endpoint URL is not allowed by the platform security policy.",
        400,
      );
    }
    values.push(url);
    updates.push(`endpoint_url = $${values.length}`);
  }
  if (updates.length === 0) return;

  updates.push("updated_at = now()");
  const result = await query<{ id: string }>(
    `UPDATE org_mcp_connections SET ${updates.join(", ")}
      WHERE id = $1 AND org_id = $2
      RETURNING id`,
    values,
  );
  if (result.length === 0) {
    throw new McpServiceError("NOT_FOUND", "Connection not found.", 404);
  }
  await recordOrgMcpAudit({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "connection.updated",
    entityType: "org_mcp_connection",
    entityId: input.connectionId,
    details: {
      name: input.name,
      endpointUrl: input.endpointUrl ? redactEndpoint(input.endpointUrl) : undefined,
    },
  });
}

export async function setOrgMcpConnectionStatus(
  orgId: string,
  actorUserId: string,
  connectionId: string,
  enabled: boolean,
): Promise<void> {
  // Disabling is always allowed (unwinding access); enabling requires the
  // entitlement so a downgraded org cannot re-enable MCP usage.
  if (enabled) await requireMcpAvailable(orgId, "enable");
  const result = await query<{ id: string }>(
    `UPDATE org_mcp_connections
        SET status = $3, updated_at = now(), last_error = NULL
      WHERE id = $1 AND org_id = $2
      RETURNING id`,
    [connectionId, orgId, enabled ? "active" : "disabled"],
  );
  if (result.length === 0) {
    throw new McpServiceError("NOT_FOUND", "Connection not found.", 404);
  }
  await recordOrgMcpAudit({
    orgId,
    actorUserId,
    action: enabled ? "connection.enabled" : "connection.disabled",
    entityType: "org_mcp_connection",
    entityId: connectionId,
    details: {},
  });
}

/**
 * Safe deletion: removes the connection, its tool rows and agent grants
 * (cascades). Usage history rows survive with connection_id NULLed so billing
 * period counts remain correct. Never runs inside the org's MCP lock domain
 * alone — deletion itself takes the advisory lock to serialize against create.
 */
export async function deleteOrgMcpConnection(
  orgId: string,
  actorUserId: string,
  connectionId: string,
): Promise<void> {
  const existing = await query<{ name: string }>(
    `SELECT name FROM org_mcp_connections WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [connectionId, orgId],
  );
  if (!existing[0]) {
    throw new McpServiceError("NOT_FOUND", "Connection not found.", 404);
  }
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `mcp:${orgId}`,
    ]);
    await client.query(
      `DELETE FROM org_mcp_connections WHERE id = $1 AND org_id = $2`,
      [connectionId, orgId],
    );
  });
  await recordOrgMcpAudit({
    orgId,
    actorUserId,
    action: "connection.deleted",
    entityType: "org_mcp_connection",
    entityId: connectionId,
    details: { name: existing[0].name },
  });
}

// ─── Test connection ─────────────────────────────────────────────────────────

export async function testOrgMcpConnection(
  orgId: string,
  actorUserId: string,
  connectionId: string,
): Promise<{
  ok: boolean;
  protocolVersion: string | null;
  serverName: string | null;
  serverVersion: string | null;
  discoveredTools: number | null;
  error: string | null;
}> {
  await requireMcpAvailable(orgId, "test");
  const rows = await query<{
    endpoint_url: string;
    auth_type: string;
    handshake_server_info: Record<string, unknown> | null;
  }>(
    `SELECT endpoint_url, auth_type, handshake_server_info
       FROM org_mcp_connections
      WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [connectionId, orgId],
  );
  const row = rows[0];
  if (!row) throw new McpServiceError("NOT_FOUND", "Connection not found.", 404);

  const creds = await loadDecryptedCredentials(connectionId, row.auth_type);
  if (!creds.ok) {
    await persistTestOutcome(connectionId, false, creds.error);
    return {
      ok: false, protocolVersion: null, serverName: null,
      serverVersion: null, discoveredTools: null, error: creds.error,
    };
  }

  const effective = await resolveEffectiveMcpEntitlements(orgId);
  const options = {
    endpointUrl: row.endpoint_url,
    credentials: creds.credentials,
    securityPolicy: effective.globalSettings.securityPolicy,
  };

  try {
    const handshake = await mcpHandshake(options);
    let toolCount: number | null = null;
    try {
      const tools = await mcpDiscoverTools(options);
      toolCount = tools.length;
    } catch {
      toolCount = null;
    }
    await persistTestOutcome(
      connectionId,
      true,
      null,
      handshake.protocolVersion,
      handshake.serverInfo,
    );
    await recordOrgMcpAudit({
      orgId,
      actorUserId,
      action: "connection.tested",
      entityType: "org_mcp_connection",
      entityId: connectionId,
      details: { ok: true, protocolVersion: handshake.protocolVersion },
    });
    return {
      ok: true,
      protocolVersion: handshake.protocolVersion,
      serverName: handshake.serverInfo.name ?? null,
      serverVersion: handshake.serverInfo.version ?? null,
      discoveredTools: toolCount,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof McpClientError ? err.message : "The MCP endpoint could not be reached.";
    await persistTestOutcome(connectionId, false, message);
    await recordOrgMcpAudit({
      orgId,
      actorUserId,
      action: "connection.tested",
      entityType: "org_mcp_connection",
      entityId: connectionId,
      details: { ok: false },
    });
    return {
      ok: false, protocolVersion: null, serverName: null,
      serverVersion: null, discoveredTools: null, error: message,
    };
  }
}

async function persistTestOutcome(
  connectionId: string,
  ok: boolean,
  error: string | null,
  protocolVersion?: string,
  serverInfo?: Record<string, unknown>,
): Promise<void> {
  await query(
    `UPDATE org_mcp_connections
        SET last_checked_at = now(),
            last_error = $2,
            status = CASE WHEN $1 THEN 'active' ELSE status END,
            handshake_protocol = COALESCE($3, handshake_protocol),
            handshake_server_info = COALESCE($4::jsonb, handshake_server_info),
            updated_at = now()
      WHERE id = $5`,
    [
      ok,
      error ? error.slice(0, 500) : null,
      protocolVersion ?? null,
      serverInfo ? JSON.stringify(serverInfo) : null,
      connectionId,
    ],
  );
}

// ─── Credential rotation ─────────────────────────────────────────────────────

export async function rotateOrgMcpCredentials(
  orgId: string,
  actorUserId: string,
  connectionId: string,
  authType: string,
  credentials: Record<string, string>,
): Promise<void> {
  await requireMcpAvailable(orgId, "rotate");
  const effective = await resolveEffectiveMcpEntitlements(orgId);
  if (!effective.entitlements.allowedAuthMethods.includes(authType as never)) {
    throw new McpServiceError(
      "AUTH_METHOD_NOT_ALLOWED",
      `Your plan does not permit the "${authType}" MCP authentication method.`,
      403,
    );
  }
  const parsed = parseCredentials(authType, credentials);
  if (!parsed.ok) throw new McpServiceError("INVALID_CREDENTIALS", parsed.error, 400);

  // Verify new credentials actually handshake before persisting them.
  const rows = await query<{ endpoint_url: string }>(
    `SELECT endpoint_url FROM org_mcp_connections WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [connectionId, orgId],
  );
  if (!rows[0]) throw new McpServiceError("NOT_FOUND", "Connection not found.", 404);

  try {
    await mcpHandshake({
      endpointUrl: rows[0].endpoint_url,
      credentials: parsed.credentials,
      securityPolicy: effective.globalSettings.securityPolicy,
    });
  } catch (err) {
    throw toServiceError(err);
  }

  await withTransaction(async (client) => {
    const encrypted = await encryptCredentials(client, authType, credentials);
    await client.query(
      `UPDATE org_mcp_connections
          SET auth_type = $3, credentials_encrypted = $4, updated_at = now()
        WHERE id = $1 AND org_id = $2`,
      [connectionId, orgId, authType, encrypted],
    );
  });

  await recordOrgMcpAudit({
    orgId,
    actorUserId,
    action: "connection.credentials_rotated",
    entityType: "org_mcp_connection",
    entityId: connectionId,
    details: { authType },
  });
}

// ─── Tool discovery / approval ───────────────────────────────────────────────

export type RediscoveryResult = {
  discovered: number;
  added: number;
  removed: number;
  unchanged: number;
  removedToolNames: string[];
};

/**
 * Re-run tool discovery for a connection. Newly seen tools are inserted as
 * `discovered` (never auto-approved); tools no longer present are marked
 * `stale` (kept for audit, excluded from advertisement); reappearing stale
 * tools return to `discovered`.
 */
export async function rediscoverOrgMcpTools(
  orgId: string,
  actorUserId: string,
  connectionId: string,
): Promise<RediscoveryResult> {
  const effective = await requireMcpAvailable(orgId, "rediscover");
  const rows = await query<{
    endpoint_url: string;
    auth_type: string;
    status: string;
  }>(
    `SELECT endpoint_url, auth_type, status
       FROM org_mcp_connections WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [connectionId, orgId],
  );
  const row = rows[0];
  if (!row) throw new McpServiceError("NOT_FOUND", "Connection not found.", 404);
  if (row.status === "disabled") {
    throw new McpServiceError(
      "CONNECTION_DISABLED",
      "Enable the connection before rediscovering tools.",
      409,
    );
  }

  const creds = await loadDecryptedCredentials(connectionId, row.auth_type);
  if (!creds.ok) throw new McpServiceError("INVALID_CREDENTIALS", creds.error, 400);

  const options = {
    endpointUrl: row.endpoint_url,
    credentials: creds.credentials,
    securityPolicy: effective.globalSettings.securityPolicy,
  };

  let tools;
  try {
    tools = await mcpDiscoverTools(options);
  } catch (err) {
    throw toServiceError(err);
  }

  const toolLimit = effective.entitlements.maxToolsPerConnection;
  if (toolLimit !== -1 && tools.length > toolLimit) {
    throw new McpServiceError(
      "TOOL_LIMIT_REACHED",
      `The server exposes ${tools.length} tools; your plan allows ${toolLimit} per connection. Approve at most ${toolLimit}.`,
      402,
      { limit: toolLimit, discovered: tools.length },
    );
  }

  const result = await withTransaction(async (client) => {
    const existing = await client.query<{
      tool_name: string;
      status: string;
    }>(
      `SELECT tool_name, status FROM org_mcp_tools WHERE connection_id = $1 AND org_id = $2`,
      [connectionId, orgId],
    );
    const existingNames = new Set(existing.rows.map((r) => r.tool_name));
    const seenNames = new Set(tools.map((t) => t.name));

    let added = 0;
    for (const tool of tools) {
      const isNew = !existingNames.has(tool.name);
      const insert = await client.query(
        `INSERT INTO org_mcp_tools
           (connection_id, org_id, tool_name, title, description, input_schema,
            last_seen_at, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb, now(), 'discovered')
         ON CONFLICT (connection_id, tool_name) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           input_schema = EXCLUDED.input_schema,
           last_seen_at = now(),
           status = CASE
             WHEN org_mcp_tools.status = 'stale' THEN 'discovered'
             WHEN org_mcp_tools.status = 'approved' THEN 'approved'
             ELSE org_mcp_tools.status
           END,
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [
          connectionId,
          orgId,
          tool.name,
          tool.title,
          tool.description,
          JSON.stringify(tool.inputSchema ?? {}),
        ],
      );
      if (insert.rows[0]?.inserted) added += 1;
    }

    const removedNames: string[] = [];
    for (const existingTool of existing.rows) {
      if (!seenNames.has(existingTool.tool_name)) {
        if (existingTool.status !== "stale") removedNames.push(existingTool.tool_name);
        await client.query(
          `UPDATE org_mcp_tools SET status = 'stale', updated_at = now()
            WHERE connection_id = $1 AND tool_name = $2`,
          [connectionId, existingTool.tool_name],
        );
      }
    }

    await client.query(
      `UPDATE org_mcp_connections SET last_checked_at = now(), updated_at = now(), status = 'active', last_error = NULL
        WHERE id = $1 AND org_id = $2`,
      [connectionId, orgId],
    );

    return {
      discovered: tools.length,
      added,
      removed: removedNames.length,
      unchanged: tools.length - added,
      removedToolNames: removedNames,
    };
  });

  await recordOrgMcpAudit({
    orgId,
    actorUserId,
    action: "tools.rediscovered",
    entityType: "org_mcp_connection",
    entityId: connectionId,
    details: {
      discovered: result.discovered,
      added: result.added,
      removed: result.removed,
    },
  });
  return result;
}

export async function setOrgMcpToolApproval(
  orgId: string,
  actorUserId: string,
  connectionId: string,
  toolName: string,
  approved: boolean,
): Promise<void> {
  const effective = await requireMcpAvailable(orgId, "approve");
  const toolRows = await query<{ id: string; status: string; approved: boolean }>(
    `SELECT id, status, approved FROM org_mcp_tools
      WHERE connection_id = $1 AND org_id = $2 AND tool_name = $3 LIMIT 1`,
    [connectionId, orgId, toolName],
  );
  const tool = toolRows[0];
  if (!tool) {
    throw new McpServiceError("TOOL_NOT_FOUND", "Tool not found on this connection.", 404);
  }
  if (tool.status === "stale") {
    throw new McpServiceError(
      "TOOL_STALE",
      "This tool is no longer offered by the server. Rediscover tools first.",
      409,
    );
  }

  if (approved && !tool.approved) {
    // Approving a new tool must respect the per-connection approved limit.
    const countRows = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM org_mcp_tools
        WHERE connection_id = $1 AND approved = TRUE AND status = 'approved'`,
      [connectionId],
    );
    const current = countRows[0]?.count ?? 0;
    const limit = effective.entitlements.maxToolsPerConnection;
    if (limit !== -1 && current >= limit) {
      throw new McpServiceError(
        "TOOL_LIMIT_REACHED",
        `Your plan allows ${limit} approved tools per connection.`,
        402,
        { limit, current },
      );
    }
  }

  await query(
    `UPDATE org_mcp_tools
        SET approved = $4,
            approved_by = CASE WHEN $4 THEN $5 ELSE approved_by END,
            approved_at = CASE WHEN $4 THEN now() ELSE approved_at END,
            revoked_at = CASE WHEN $4 THEN NULL ELSE now() END,
            status = CASE WHEN $4 THEN 'approved' ELSE 'revoked' END,
            updated_at = now()
      WHERE id = $1 AND org_id = $2 AND connection_id = $3`,
    [tool.id, orgId, connectionId, approved, actorUserId],
  );

  // Revoking a tool also revokes every agent grant referencing it so a
  // revoked tool cannot remain executable.
  if (!approved) {
    await query(
      `UPDATE org_mcp_agent_grants g
          SET enabled = FALSE, revoked_at = now()
        WHERE g.tool_id = $1 AND g.org_id = $2 AND g.enabled = TRUE`,
      [tool.id, orgId],
    );
  }

  await recordOrgMcpAudit({
    orgId,
    actorUserId,
    action: approved ? "tool.approved" : "tool.revoked",
    entityType: "org_mcp_tool",
    entityId: tool.id,
    details: { toolName, connectionId },
  });
}

// ─── Agent grants ────────────────────────────────────────────────────────────

export async function setOrgMcpAgentGrant(
  orgId: string,
  actorUserId: string,
  toolId: string,
  agentId: string,
  enabled: boolean,
): Promise<void> {
  const toolRows = await query<{ id: string; connection_id: string; approved: boolean; status: string; tool_name: string }>(
    `SELECT id, connection_id, approved, status, tool_name
       FROM org_mcp_tools WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [toolId, orgId],
  );
  const tool = toolRows[0];
  if (!tool) throw new McpServiceError("TOOL_NOT_FOUND", "Tool not found.", 404);

  if (enabled) {
    const effective = await requireMcpAvailable(orgId, "grant");
    if (!tool.approved || tool.status !== "approved") {
      throw new McpServiceError(
        "TOOL_NOT_APPROVED",
        "Only organization-approved tools can be granted to agents.",
        409,
      );
    }
    const connRows = await query<{ status: string }>(
      `SELECT status FROM org_mcp_connections WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [tool.connection_id, orgId],
    );
    if (connRows[0]?.status !== "active") {
      throw new McpServiceError(
        "CONNECTION_NOT_ACTIVE",
        "The connection must be active before granting its tools.",
        409,
      );
    }
    // Agent assignment limit under the org advisory lock.
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `mcp:${orgId}`,
      ]);
      const countRows = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM org_mcp_agent_grants WHERE org_id = $1 AND enabled = TRUE`,
        [orgId],
      );
      const current = countRows.rows[0]?.count ?? 0;
      const limit = effective.entitlements.maxAgentAssignments;
      if (limit !== -1 && current >= limit) {
        throw new McpServiceError(
          "AGENT_ASSIGNMENT_LIMIT_REACHED",
          `Your ${effective.planId} plan allows ${limit} active agent assignments.`,
          402,
          { limit, current },
        );
      }
      await client.query(
        `INSERT INTO org_mcp_agent_grants (agent_id, tool_id, org_id, enabled, granted_by, granted_at, revoked_at)
         VALUES ($1,$2,$3,TRUE,$4,now(),NULL)
         ON CONFLICT (agent_id, tool_id) DO UPDATE SET
           enabled = TRUE, granted_by = $4, granted_at = now(), revoked_at = NULL`,
        [agentId, toolId, orgId, actorUserId],
      );
    });
  } else {
    await query(
      `UPDATE org_mcp_agent_grants
          SET enabled = FALSE, revoked_at = now()
        WHERE agent_id = $1 AND tool_id = $2 AND org_id = $3`,
      [agentId, toolId, orgId],
    );
  }

  await recordOrgMcpAudit({
    orgId,
    actorUserId,
    action: enabled ? "agent.granted" : "agent.revoked",
    entityType: "org_mcp_agent_grant",
    entityId: `${agentId}:${toolId}`,
    details: { toolId, toolName: tool.tool_name, agentId },
  });
}

// ─── Credential loading (server-only) ────────────────────────────────────────

async function loadDecryptedCredentials(
  connectionId: string,
  authType: string,
): Promise<
  { ok: true; credentials: import("./client").McpCredentials } | { ok: false; error: string }
> {
  if (authType === "none") {
    return { ok: true, credentials: { authType: "none" } };
  }
  const rows = await query<{ decrypted: string | null }>(
    `SELECT pgp_sym_decrypt(credentials_encrypted, $2) AS decrypted
       FROM org_mcp_connections WHERE id = $1 LIMIT 1`,
    [connectionId, ENCRYPTION_KEY],
  );
  const raw = rows[0]?.decrypted;
  if (!raw) {
    return { ok: false, error: "Stored credentials could not be decrypted. Re-enter them." };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Stored credentials are malformed. Re-enter them." };
  }
  return parseCredentials(authType, parsedJson);
}

// ─── Usage / entitlement overview for org surfaces ───────────────────────────

export async function getOrgMcpOverview(orgId: string): Promise<{
  effective: EffectiveMcpEntitlements;
  usage: ReturnType<typeof getMcpUsageSummary> extends Promise<infer T> ? T : never;
}> {
  const effective = await resolveEffectiveMcpEntitlements(orgId);
  const usage = await getMcpUsageSummary(orgId, effective.periodStart);
  return { effective, usage };
}

// ─── Runtime advertisement (chat / realtime) ─────────────────────────────────

export type AdvertisedMcpTool = {
  connectionId: string;
  connectionName: string;
  connectionStatus: string;
  toolId: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * List the tools that may be advertised to a runtime surface for one agent:
 * active connection + approved tool + enabled agent grant. This is the
 * discovery half; every invocation re-checks the same conditions atomically
 * (see invokeAdvertisedTool).
 */
export async function listAdvertisedMcpTools(
  orgId: string,
  agentId: string,
): Promise<AdvertisedMcpTool[]> {
  const rows = await query<{
    connection_id: string;
    connection_name: string;
    connection_status: string;
    tool_id: string;
    tool_name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>(
    `SELECT c.id AS connection_id, c.name AS connection_name, c.status AS connection_status,
            t.id AS tool_id, t.tool_name, t.description, t.input_schema
       FROM org_mcp_agent_grants g
       JOIN org_mcp_tools t ON t.id = g.tool_id
       JOIN org_mcp_connections c ON c.id = t.connection_id
      WHERE g.org_id = $1 AND g.agent_id = $2 AND g.enabled = TRUE
        AND t.approved = TRUE AND t.status = 'approved'
        AND c.status = 'active'`,
    [orgId, agentId],
  );
  return rows.map((row) => ({
    connectionId: row.connection_id,
    connectionName: row.connection_name,
    connectionStatus: row.connection_status,
    toolId: row.tool_id,
    toolName: row.tool_name,
    description: row.description,
    inputSchema: row.input_schema ?? {},
  }));
}

/**
 * Invocation-time reauthorization + execution. Re-resolves the entitlement,
 * re-checks the connection/tool/grant state, admits the call against quota +
 * rate limits under the org advisory lock, then performs the real MCP call.
 * Both success and failure are metered.
 */
export async function invokeAdvertisedTool(input: {
  orgId: string;
  agentId: string;
  userId: string | null;
  surface: "chat" | "realtime" | "embed" | "api";
  toolId: string;
  args: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      content: Array<Record<string, unknown>>;
      structuredContent: Record<string, unknown> | null;
      isError: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
    }
> {
  const started = Date.now();
  const { resolveEffectiveMcpEntitlements: resolve } = await import("./entitlements");
  const { withMcpAdmission, recordMcpUsage } = await import("./metering");

  let effective: EffectiveMcpEntitlements;
  try {
    effective = await resolve(input.orgId);
  } catch {
    return {
      ok: false,
      code: "ENTITLEMENT_RESOLUTION_FAILED",
      message: "MCP entitlement could not be verified.",
      retryable: true,
    };
  }
  if (!effective.available) {
    return {
      ok: false,
      code: effective.denialReason ?? "PLAN_NOT_ENTITLED",
      message: "MCP access is not currently available.",
      retryable: false,
    };
  }

  const rows = await query<{
    connection_id: string;
    connection_status: string;
    connection_endpoint: string;
    connection_auth_type: string;
    tool_name: string;
    tool_approved: boolean;
    tool_status: string;
    grant_enabled: boolean;
  }>(
    `SELECT c.id AS connection_id, c.status AS connection_status, c.endpoint_url AS connection_endpoint,
            c.auth_type AS connection_auth_type,
            t.tool_name, t.approved AS tool_approved, t.status AS tool_status,
            g.enabled AS grant_enabled
       FROM org_mcp_tools t
       JOIN org_mcp_connections c ON c.id = t.connection_id
       LEFT JOIN org_mcp_agent_grants g ON g.tool_id = t.id AND g.agent_id = $2
      WHERE t.id = $1 AND t.org_id = $3 AND g.org_id = $3
      LIMIT 1`,
    [input.toolId, input.agentId, input.orgId],
  );
  const row = rows[0];
  if (
    !row ||
    row.connection_status !== "active" ||
    !row.tool_approved ||
    row.tool_status !== "approved" ||
    !row.grant_enabled
  ) {
    return {
      ok: false,
      code: "PERMISSION_REVOKED",
      message: "This MCP tool is no longer available to this agent.",
      retryable: false,
    };
  }

  const creds = await loadDecryptedCredentials(row.connection_id, row.connection_auth_type);
  if (!creds.ok) {
    return {
      ok: false,
      code: "CREDENTIALS_UNAVAILABLE",
      message: creds.error,
      retryable: false,
    };
  }

  const admission = await withMcpAdmission(
    input.orgId,
    effective.entitlements,
    effective.periodStart,
    async (_client, admission) => admission,
  );
  if (!admission.allowed) {
    return {
      ok: false,
      code: admission.reason,
      message: admission.message,
      retryable: admission.reason === "RATE_LIMITED",
    };
  }

  try {
    const { mcpInvokeTool } = await import("./client");
    const result = await mcpInvokeTool(
      {
        endpointUrl: row.connection_endpoint,
        credentials: creds.credentials,
        securityPolicy: effective.globalSettings.securityPolicy,
      },
      row.tool_name,
      input.args,
    );
    await recordMcpUsage({
      orgId: input.orgId,
      agentId: input.agentId,
      connectionId: row.connection_id,
      toolId: input.toolId,
      toolName: row.tool_name,
      userId: input.userId,
      surface: input.surface,
      success: !result.isError,
      durationMs: Date.now() - started,
      errorCode: result.isError ? "TOOL_REPORTED_ERROR" : null,
      errorMessage: null,
      periodStart: effective.periodStart,
    });
    if (result.isError) {
      return {
        ok: false,
        code: "TOOL_REPORTED_ERROR",
        message: "The MCP tool reported an error for this invocation.",
        retryable: false,
      };
    }
    return {
      ok: true,
      content: result.content,
      structuredContent: result.structuredContent,
      isError: false,
    };
  } catch (err) {
    const code = err instanceof McpClientError ? err.code : "INVOCATION_FAILED";
    const message =
      err instanceof McpClientError
        ? err.message
        : "The MCP invocation could not be completed.";
    await recordMcpUsage({
      orgId: input.orgId,
      agentId: input.agentId,
      connectionId: row.connection_id,
      toolId: input.toolId,
      toolName: row.tool_name,
      userId: input.userId,
      surface: input.surface,
      success: false,
      durationMs: Date.now() - started,
      errorCode: code,
      errorMessage: message.slice(0, 500),
      periodStart: effective.periodStart,
    });
    return {
      ok: false,
      code,
      message,
      retryable: err instanceof McpClientError ? err.retryable : false,
    };
  }
}

// ─── Agent tool listing (agent editor UI) ────────────────────────────────────
export type AgentMcpToolView = {
  connectionId: string;
  connectionName: string;
  connectionStatus: string;
  toolId: string;
  toolName: string;
  title: string | null;
  description: string;
  approved: boolean;
  toolStatus: string;
  granted: boolean;
  grantRevokedAt: string | null;
};

/**
 * Tools visible in the agent editor: org-approved tools across all of the
 * organisation's connections with the agent's grant state and unavailability
 * reasons. Only org-scoped rows are returned.
 */
export async function listAgentMcpTools(
  orgId: string,
  agentId: string,
): Promise<AgentMcpToolView[]> {
  const rows = await query<{
    connection_id: string;
    connection_name: string;
    connection_status: string;
    tool_id: string;
    tool_name: string;
    title: string | null;
    description: string;
    approved: boolean;
    tool_status: string;
    granted: boolean | null;
    revoked_at: Date | null;
  }>(
    `SELECT c.id AS connection_id, c.name AS connection_name, c.status AS connection_status,
            t.id AS tool_id, t.tool_name, t.title, t.description, t.approved, t.status AS tool_status,
            g.enabled AS granted, g.revoked_at
       FROM org_mcp_tools t
       JOIN org_mcp_connections c ON c.id = t.connection_id
       LEFT JOIN org_mcp_agent_grants g ON g.tool_id = t.id AND g.agent_id = $2
      WHERE t.org_id = $1 AND t.approved = TRUE AND t.status = 'approved'
      ORDER BY c.name ASC, t.tool_name ASC`,
    [orgId, agentId],
  );
  return rows.map((row) => ({
    connectionId: row.connection_id,
    connectionName: row.connection_name,
    connectionStatus: row.connection_status,
    toolId: row.tool_id,
    toolName: row.tool_name,
    title: row.title,
    description: row.description,
    approved: row.approved,
    toolStatus: row.tool_status,
    granted: row.granted === true,
    grantRevokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  }));
}