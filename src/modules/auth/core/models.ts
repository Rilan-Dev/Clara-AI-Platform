/**
 * src/modules/auth/core/models.ts
 * TypeScript types for users, roles, sessions and RBAC.
 */

// ── User ──────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  status: "active" | "suspended" | "pending_verification";
  emailVerified: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Safe public projection — never include passwordHash in responses */
export type PublicUser = Omit<User, never>; // same fields, no password exposed

export type CreateUserInput = {
  email: string;
  password: string;    // plain-text, hashed before storage
  fullName: string;
  avatarUrl?: string;
};

export type UpdateUserInput = Partial<{
  fullName: string;
  avatarUrl: string | null;
  status: User["status"];
  emailVerified: boolean;
}>;

// ── Role ──────────────────────────────────────────────────────────────────────

export type RoleName = "org_admin" | "project_manager" | "kb_editor" | "kb_viewer";

export type Role = {
  id: string;
  name: RoleName;
  description: string | null;
  createdAt: string;
};

// ── Permission ────────────────────────────────────────────────────────────────

export type Resource = "org" | "project" | "kb" | "document" | "config" | "user";
export type Action   = "create" | "read" | "update" | "delete" | "manage_members" | "invite" | "remove";

export type Permission = {
  id: string;
  resource: Resource;
  action: Action;
};

/** Shorthand key used in permission checks: "resource:action" */
export type PermissionKey = `${Resource}:${Action}`;

// ── Org/Project membership ────────────────────────────────────────────────────

export type OrgMember = {
  id: string;
  orgId: string;
  userId: string;
  roleId: string;
  roleName: RoleName;
  invitedBy: string | null;
  joinedAt: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  roleId: string;
  roleName: RoleName;
  grantedBy: string | null;
  grantedAt: string;
};

// ── Session ───────────────────────────────────────────────────────────────────

export type Session = {
  id: string;
  userId: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

/** Attached to every authenticated request */
export type AuthContext = {
  user: User;
  session: Session;
};

// ── Audit ─────────────────────────────────────────────────────────────────────

export type AuditLogInput = {
  userId?: string;
  orgId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string;
};
