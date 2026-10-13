/**
 * src/modules/mcp/audit.ts
 *
 * Safe audit records for organization MCP actions and platform MCP
 * administration. Details are whitelisted projections — credential values,
 * encrypted blobs and raw secrets are never written here.
 */

import { query } from "@/lib/db";

export type OrgMcpAuditAction =
  | "connection.created"
  | "connection.updated"
  | "connection.enabled"
  | "connection.disabled"
  | "connection.deleted"
  | "connection.tested"
  | "connection.credentials_rotated"
  | "tools.rediscovered"
  | "tool.approved"
  | "tool.revoked"
  | "agent.granted"
  | "agent.revoked";

export type PlatformMcpAuditAction =
  | "platform.settings_updated"
  | "platform.emergency_disabled"
  | "platform.emergency_enabled"
  | "plan.mcp_entitlements_updated"
  | "org.override_applied"
  | "org.override_removed";

/** Keys that must never appear inside audit details. */
const FORBIDDEN_DETAIL_KEYS =
  /(?:credential|secret|password|token|api[_-]?key|encrypted|authorization)/i;

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_DETAIL_KEYS.test(key)) continue;
    if (typeof value === "string" && value.length > 500) {
      safe[key] = `${value.slice(0, 500)}…`;
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export async function recordOrgMcpAudit(input: {
  orgId: string;
  actorUserId: string | null;
  action: OrgMcpAuditAction;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO org_mcp_audit_log
       (org_id, actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.orgId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(sanitizeDetails(input.details ?? {})),
    ],
  );
}

export async function recordPlatformMcpAudit(input: {
  actorUserId: string | null;
  action: PlatformMcpAuditAction;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO mcp_platform_audit_log
       (actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(sanitizeDetails(input.details ?? {})),
    ],
  );
}

export type OrgMcpAuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor: { id: string | null; name: string | null; email: string | null };
};

/** Scoped audit history for one organisation (optionally one entity). */
export async function listOrgMcpAudit(
  orgId: string,
  options?: { entityId?: string; limit?: number },
): Promise<OrgMcpAuditEntry[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const rows = await query<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: Date;
    actor_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
  }>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            u.id AS actor_id, u.full_name AS actor_name, u.email AS actor_email
       FROM org_mcp_audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.org_id = $1
        AND ($2::text IS NULL OR a.entity_id = $2)
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [orgId, options?.entityId ?? null, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details: row.details ?? {},
    created_at: new Date(row.created_at).toISOString(),
    actor: {
      id: row.actor_id,
      name: row.actor_name,
      email: row.actor_email,
    },
  }));
}