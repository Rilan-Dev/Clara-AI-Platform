/**
 * src/modules/auth/core/db.ts
 * All PostgreSQL queries for users, sessions, roles, org/project membership,
 * permissions, and audit logs.
 */

import { query, queryOne, execute } from "@/lib/db";
import type {
  User,
  Role,
  RoleName,
  OrgMember,
  Session,
  AuditLogInput,
  PermissionKey,
} from "./models";

// ── Row → model mappers ───────────────────────────────────────────────────────

function toUser(row: Record<string, unknown>): User {
  return {
    id:            String(row.id),
    email:         String(row.email),
    fullName:      String(row.full_name),
    avatarUrl:     row.avatar_url != null ? String(row.avatar_url) : null,
    status:        (row.status as User["status"]) ?? "active",
    emailVerified: Boolean(row.email_verified),
    isSuperAdmin:  Boolean(row.is_super_admin),
    lastLoginAt:   row.last_login_at != null ? String(row.last_login_at) : null,
    createdAt:     String(row.created_at),
    updatedAt:     String(row.updated_at),
  };
}

function toSession(row: Record<string, unknown>): Session {
  return {
    id:          String(row.id),
    userId:      String(row.user_id),
    expiresAt:   String(row.expires_at),
    ipAddress:   row.ip_address != null ? String(row.ip_address) : null,
    userAgent:   row.user_agent != null ? String(row.user_agent) : null,
    createdAt:   String(row.created_at),
  };
}

function toOrgMember(row: Record<string, unknown>): OrgMember {
  return {
    id:         String(row.id),
    orgId:      String(row.org_id),
    userId:     String(row.user_id),
    roleId:     String(row.role_id),
    roleName:   String(row.role_name) as RoleName,
    invitedBy:  row.invited_by != null ? String(row.invited_by) : null,
    joinedAt:   String(row.joined_at),
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function createUser(
  email: string,
  passwordHash: string,
  fullName: string,
  avatarUrl?: string
): Promise<User> {
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO users (email, password_hash, full_name, avatar_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [email.toLowerCase().trim(), passwordHash, fullName.trim(), avatarUrl ?? null]
  );
  if (!row) throw new Error("Failed to create user");
  return toUser(row);
}

export async function getUserById(id: string): Promise<User | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );
  return row ? toUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
  if (!row) return null;
  return { ...toUser(row), passwordHash: String(row.password_hash) };
}

export async function listUsers(orgId?: string): Promise<User[]> {
  if (orgId) {
    const rows = await query<Record<string, unknown>>(
      `SELECT u.* FROM users u
       JOIN org_members om ON om.user_id = u.id
       WHERE om.org_id = $1
       ORDER BY u.full_name ASC`,
      [orgId]
    );
    return rows.map(toUser);
  }
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM users ORDER BY full_name ASC"
  );
  return rows.map(toUser);
}

export async function updateUser(
  id: string,
  input: { fullName?: string; avatarUrl?: string | null; status?: string; emailVerified?: boolean }
): Promise<User | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.fullName      !== undefined) { sets.push(`full_name = $${i++}`);      params.push(input.fullName); }
  if (input.avatarUrl     !== undefined) { sets.push(`avatar_url = $${i++}`);     params.push(input.avatarUrl); }
  if (input.status        !== undefined) { sets.push(`status = $${i++}`);         params.push(input.status); }
  if (input.emailVerified !== undefined) { sets.push(`email_verified = $${i++}`); params.push(input.emailVerified); }
  if (sets.length === 0) return getUserById(id);
  params.push(id);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );
  return row ? toUser(row) : null;
}

export async function touchLastLogin(userId: string): Promise<void> {
  await execute("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  ipAddress?: string,
  userAgent?: string
): Promise<Session> {
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, tokenHash, expiresAt.toISOString(), ipAddress ?? null, userAgent ?? null]
  );
  if (!row) throw new Error("Failed to create session");
  return toSession(row);
}

export async function getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM sessions
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );
  return row ? toSession(row) : null;
}

export async function deleteSession(id: string): Promise<void> {
  await execute("DELETE FROM sessions WHERE id = $1", [id]);
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await execute("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

export async function purgeExpiredSessions(): Promise<void> {
  await execute("DELETE FROM sessions WHERE expires_at < now()");
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function getRoleByName(name: RoleName): Promise<Role | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM roles WHERE name = $1",
    [name]
  );
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name) as RoleName,
    description: row.description != null ? String(row.description) : null,
    createdAt: String(row.created_at),
  };
}

// ── Permissions ───────────────────────────────────────────────────────────────

/**
 * Load all permission keys for a role — cached per request by the RBAC layer.
 * Format: "resource:action"
 */
export async function getPermissionsForRole(roleId: string): Promise<Set<PermissionKey>> {
  const rows = await query<{ resource: string; action: string }>(
    `SELECT p.resource, p.action
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1`,
    [roleId]
  );
  return new Set(rows.map((r) => `${r.resource}:${r.action}` as PermissionKey));
}

// ── Org membership ────────────────────────────────────────────────────────────

export async function addOrgMember(
  orgId: string,
  userId: string,
  roleName: RoleName,
  invitedBy?: string
): Promise<OrgMember> {
  const role = await getRoleByName(roleName);
  if (!role) throw new Error(`Role "${roleName}" not found`);

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO org_members (org_id, user_id, role_id, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, user_id)
     DO UPDATE SET role_id = EXCLUDED.role_id
     RETURNING *`,
    [orgId, userId, role.id, invitedBy ?? null]
  );
  if (!row) throw new Error("Failed to add org member");

  return {
    id:        String(row.id),
    orgId:     String(row.org_id),
    userId:    String(row.user_id),
    roleId:    String(row.role_id),
    roleName,
    invitedBy: row.invited_by != null ? String(row.invited_by) : null,
    joinedAt:  String(row.joined_at),
  };
}

export async function getOrgMembership(
  orgId: string,
  userId: string
): Promise<OrgMember | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT om.*, r.name AS role_name
     FROM org_members om
     JOIN roles r ON r.id = om.role_id
     WHERE om.org_id = $1 AND om.user_id = $2`,
    [orgId, userId]
  );
  return row ? toOrgMember(row) : null;
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT om.*, r.name AS role_name,
            u.email, u.full_name, u.avatar_url, u.email_verified, u.status AS user_status
     FROM org_members om
     JOIN roles r ON r.id = om.role_id
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = $1
     ORDER BY
       CASE r.name
         WHEN 'org_admin' THEN 0
         WHEN 'project_manager' THEN 1
         WHEN 'kb_editor' THEN 2
         WHEN 'kb_viewer' THEN 3
         ELSE 4
       END,
       om.joined_at ASC`,
    [orgId]
  );
  return rows.map((row) => ({
    ...toOrgMember(row),
    email:         String(row.email ?? ""),
    fullName:      String(row.full_name ?? ""),
    avatarUrl:     row.avatar_url != null ? String(row.avatar_url) : null,
    emailVerified: Boolean(row.email_verified),
    userStatus:    String(row.user_status ?? "active"),
  }));
}

export async function removeOrgMember(orgId: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM org_members WHERE org_id = $1 AND user_id = $2 RETURNING id",
    [orgId, userId]
  );
  return rows.length > 0;
}

/**
 * Finds which org an agent/KB belongs to by traversal:
 * knowledge_bases → agents → organisations
 */
export async function getOrgIdForKb(kbId: string): Promise<string | null> {
  const row = await queryOne<{ org_id: string }>(
    `SELECT o.id AS org_id
     FROM knowledge_bases kb
     JOIN agents a ON a.id = kb.agent_id
     JOIN organisations o ON o.id = a.org_id
     WHERE kb.id = $1`,
    [kbId]
  );
  return row?.org_id ?? null;
}

export async function getOrgIdForAgent(agentId: string): Promise<string | null> {
  const row = await queryOne<{ org_id: string }>(
    "SELECT org_id FROM agents WHERE id = $1",
    [agentId]
  );
  return row?.org_id ?? null;
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await execute(
    `INSERT INTO audit_logs (user_id, org_id, action, resource_type, resource_id, old_data, new_data, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.userId ?? null,
      input.orgId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.oldData ? JSON.stringify(input.oldData) : null,
      input.newData ? JSON.stringify(input.newData) : null,
      input.ipAddress ?? null,
    ]
  );
}
