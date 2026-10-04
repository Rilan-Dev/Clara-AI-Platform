"use client";

/**
 * src/features/admin/screens/org-members-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Team management — invite by email, change roles, remove members.
 * Roles are explained in plain English so org admins never guess
 * what a permission means ("Less user thinking").
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Loader2, Mail, Shield, Trash2, UserPlus, Users,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { useAuth } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";

type Member = {
  userId: string; roleName: string; joinedAt: string;
  email?: string; fullName?: string; avatarUrl?: string | null;
  emailVerified?: boolean; userStatus?: string;
};

const ROLES: { id: string; label: string; desc: string; badge: string }[] = [
  { id: "org_admin",       label: "Admin",            desc: "Manage members, billing and everything in the organisation", badge: "bg-primary/10 text-primary border-primary/30" },
  { id: "project_manager", label: "Project manager",  desc: "Create agents and knowledge bases, manage daily work",       badge: "bg-secondary/10 text-secondary border-secondary/30" },
  { id: "kb_editor",       label: "Editor",           desc: "Upload documents and edit knowledge bases",                  badge: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
  { id: "kb_viewer",       label: "Viewer",           desc: "View knowledge bases and analytics — read only",              badge: "bg-muted text-muted-foreground border-border" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  org_admin: ["Members & roles", "Billing & plan", "Agents", "Knowledge bases", "Agent configuration"],
  project_manager: ["Agents", "Knowledge bases", "Agent configuration", "Daily operations"],
  kb_editor: ["Knowledge bases", "Documents & ingestion", "Knowledge analytics"],
  kb_viewer: ["Knowledge bases", "Knowledge analytics (read only)"],
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function OrgMembersScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const { user, primaryOrgRole } = useAuth();
  const isAdmin    = user?.isSuperAdmin ?? false;
  const canInvite  = primaryOrgRole === "org_admin" || primaryOrgRole === "project_manager";
  const canManageMembers = primaryOrgRole === "org_admin";
  const inviteRoles = primaryOrgRole === "org_admin"
    ? ROLES
    : ROLES.filter((r) => r.id === "kb_editor" || r.id === "kb_viewer");

  const [members, setMembers]   = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [apiCanInvite, setApiCanInvite] = useState(true); // server remains authoritative

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("kb_editor");
  const [inviting, setInviting]       = useState(false);
  const [message, setMessage]         = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId]           = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(apiUrl(`/api/orgs/${id}/members`), { headers: withAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403) setApiCanInvite(false);
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<Member[]>;
      })
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true); setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/orgs/${id}/members`), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json() as { isNewUser?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      setMessage({
        ok: true,
        text: data.isNewUser
          ? `Invitation sent to ${inviteEmail} — they'll set their password from the email link.`
          : `${inviteEmail} already has a Clara AI account and now has access.`,
      });
      setInviteEmail("");
      load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    setBusyId(userId); setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/orgs/${id}/members/${userId}`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ role }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Role change failed");
      setMessage({ ok: true, text: "Role updated." });
      load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(userId: string, email?: string) {
    const ok = await confirmAction({
      title: `Remove ${email ?? "this member"}?`,
      description: "They lose access to this organisation but keep their Clara AI account.",
      confirmLabel: "Remove member",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(userId); setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/orgs/${id}/members/${userId}`), {
        method: "DELETE",
        headers: withAuthHeaders(),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setMessage({ ok: true, text: "Member removed." });
      load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  const currentUserId = user?.id;
  const roleOf = (m: Member) => ROLES.find((r) => r.id === m.roleName);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        icon={Users}
        title="Team"
        description="Invite teammates, control what each person can do, and keep your organisation secure."
        breadcrumbs={isAdmin ? [{ label: "Organisations", href: "/orgs" }, { label: "Members" }] : undefined}
      />

      {message && (
        <div className={`mb-4 sm:mb-6 rounded-xl border px-4 py-3 text-sm ${
          message.ok ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-600" : "border-destructive/25 bg-destructive/10 text-destructive"
        }`}>
          {message.text}
        </div>
      )}

      {/* Invite form — the primary action, front and center */}
      {canInvite && apiCanInvite && (
        <div className="mb-4 sm:mb-6 border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Invite a teammate</h2>
          </div>
          {/* Mobile: stacked single column with 16px inputs; desktop keeps
              the horizontal email+role+button row. */}
          <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <div>
              <label htmlFor="org-members-screen-work-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Work email</label>
              <input id="org-members-screen-work-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="teammate@company.com"
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="org-members-screen-access-level" className="block text-xs font-medium text-muted-foreground mb-1.5">Access level</label>
              <select id="org-members-screen-access-level"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {inviteRoles.map((r) => (
                  <option key={r.id} value={r.id} className="bg-popover">{r.label}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={inviting || !inviteEmail.trim()} className="gap-2 w-full sm:w-auto">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </form>
          <p className="hidden sm:block text-xs text-muted-foreground/70 mt-3">
            {ROLES.find((r) => r.id === inviteRole)?.desc}. New teammates get an email to set their own password.
          </p>
        </div>
      )}

      {/* Members list */}
      <div className="border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Members
            <span className="text-xs text-muted-foreground/70 font-normal">({members.length})</span>
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-8 text-center">No members found.</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const role = roleOf(m);
              const isSelf = m.userId === currentUserId;
              return (
                <div key={m.userId}
                  className="rounded-xl border border-border/70 bg-muted/50 px-4 sm:px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-border shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-primary font-bold shrink-0">
                        {(m.fullName ?? m.email ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2 truncate">
                        {m.fullName || m.email}
                        {isSelf && <span className="text-[11px] text-muted-foreground/70">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground/70 truncate">{m.email}</p>
                      {/* Joined date — desktop noise, hidden on phones */}
                      <p className="hidden lg:block text-[11px] text-muted-foreground/80">Joined {formatDate(m.joinedAt)}</p>
                    </div>
                  </div>

                  {/* Actions — aligned with the text block on phones (avatar
                      40px + gap 12px), badge left / controls right. */}
                  <div className="flex items-center gap-2 flex-wrap pl-[52px] sm:pl-0 sm:justify-end">
                    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${role?.badge ?? "bg-muted text-muted-foreground border-border"}`}>
                      {role?.label ?? m.roleName}
                    </span>

                    {canManageMembers && apiCanInvite && !isSelf && (
                      <select
                        value={m.roleName}
                        disabled={busyId === m.userId}
                        onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                        aria-label={`Change role for ${m.fullName ?? m.email}`}
                        className="bg-muted/50 border border-border rounded-lg px-2.5 py-2 text-base sm:text-xs text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-40"
                      >
                        {(canManageMembers ? ROLES : ROLES.filter((r) => r.id === "kb_editor" || r.id === "kb_viewer")).filter((r) => r.id === m.roleName || r.id === "kb_editor" || r.id === "kb_viewer").map((r) => (
                          <option key={r.id} value={r.id} className="bg-popover">{r.label}</option>
                        ))}
                      </select>
                    )}

                    {canManageMembers && apiCanInvite && !isSelf && (
                      <Button variant="outline" size="sm"
                        className="border-destructive/20 text-destructive hover:bg-destructive/10 h-9 w-9 p-0"
                        aria-label={`Remove ${m.fullName ?? m.email} from organisation`}
                        disabled={busyId === m.userId}
                        onClick={() => handleRemove(m.userId, m.email)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Access guide — keeps role intent visible before an admin changes a member. */}
      <div className="mt-6 border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div><h2 className="font-semibold text-foreground">Roles & access</h2><p className="text-sm text-muted-foreground mt-1">Choose the least-privileged role that matches the teammate’s job. Server-side RBAC remains the source of truth for every action.</p></div>
          <Shield className="w-5 h-5 text-primary shrink-0" aria-hidden />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((r) => (<div key={r.id} className="rounded-xl border border-border/70 bg-muted/40 p-4"><div className="flex items-center justify-between gap-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${r.badge}`}>{r.label}</span><span className="text-[10px] font-mono text-muted-foreground/70">{r.id}</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{r.desc}.</p></div>))}
        </div>
      </div>

      {/* Permission matrix — makes the effective organisation access model
          visible before an admin changes a role. Server-side RBAC remains authoritative. */}
      <div className="mt-6 border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Role permissions</h2>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Organisation roles control workspace access. Platform admins are separate and are not assigned an organisation role.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Effective access</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role.id} className="border-b last:border-0 border-border/70">
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${role.badge}`}>{role.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(ROLE_PERMISSIONS[role.id] ?? []).map((permission) => (
                        <span key={permission} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                          {permission}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role legend — plain-English reference (desktop; phones use the
          select labels — the legend is reference noise on a 390px screen) */}
      <div className="mt-6 hidden sm:grid grid-cols-2 xl:grid-cols-4 gap-3">
        {ROLES.map((r) => (
          <div key={r.id} className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3.5">
            <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border mb-2 ${r.badge}`}>
              {r.label}
            </span>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
