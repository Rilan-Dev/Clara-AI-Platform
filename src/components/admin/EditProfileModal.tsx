"use client";
/**
 * src/components/admin/EditProfileModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Profile & security modal — opened from the topbar profile menu.
 *
 *   Tab 1 "Profile"  : name + avatar URL        → PATCH /api/auth/me
 *   Tab 2 "Security" : change password          → POST /api/auth/change-password
 *
 * Everything about ME in one place — no hunting through settings pages.
 */

import { useState } from "react";
import { Camera, KeyRound, Lock, Save, ShieldCheck, User, X } from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { Button } from "@/components/ui/button";

type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  isSuperAdmin?: boolean;
};

type Tab = "profile" | "security";

export function EditProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserProfile;
  onClose: () => void;
  onSaved: (updated?: UserProfile) => void;
}) {
  const [tab, setTab]               = useState<Tab>("profile");
  const [fullName,  setFullName]    = useState(user.fullName);
  const [avatarUrl, setAvatarUrl]   = useState(user.avatarUrl ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSaveProfile() {
    if (!fullName.trim()) { setError("Name cannot be empty"); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res  = await fetch(apiUrl("/api/auth/me"), {
        method:  "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ fullName: fullName.trim(), avatarUrl: avatarUrl.trim() || null }),
      });
      const data = await res.json() as { user?: UserProfile; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update profile");
      setSuccess("Profile updated.");
      onSaved(data.user);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleChangePassword() {
    if (newPassword.length < 8)       { setError("New password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setError("New passwords don't match"); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res = await fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      setSuccess("Password changed. Other devices were signed out.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border bg-card shadow-lg max-h-[92dvh] flex flex-col overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-sm">Profile & security</h2>
              <p className="text-xs text-muted-foreground">
                {user.isSuperAdmin ? "Platform Admin" : "Organisation User"} · {user.email}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { id: "profile",  label: "Profile",  icon: User       },
            { id: "security", label: "Security", icon: ShieldCheck },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null); setSuccess(null); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {tab === "profile" ? (
            <>
              {/* Avatar preview + URL */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={fullName}
                      className="w-16 h-16 rounded-full object-cover border-2 border-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-primary text-2xl font-bold">
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card">
                    <Camera className="w-3 h-3 text-primary-foreground" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <label htmlFor="editprofilemodal-avatar-url" className="block text-xs font-medium text-muted-foreground mb-1.5">Avatar URL</label>
                  <input id="editprofilemodal-avatar-url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Full name */}
              <div>
                <label htmlFor="editprofilemodal-full-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Full name <span className="text-destructive">*</span></label>
                <input id="editprofilemodal-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary" />
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email <span className="text-muted-foreground/70">(read-only)</span></label>
                <div className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm text-muted-foreground font-mono">
                  {user.email}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-start gap-3">
                <KeyRound className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Choose a strong password you don&apos;t use elsewhere. After changing it,
                  other devices will be signed out automatically.
                </p>
              </div>

              <div>
                <label htmlFor="editprofilemodal-current-password" className="block text-xs font-medium text-muted-foreground mb-1.5">Current password</label>
                <input id="editprofilemodal-current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Your current password"
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label htmlFor="editprofilemodal-new-password" className="block text-xs font-medium text-muted-foreground mb-1.5">New password</label>
                <input id="editprofilemodal-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label htmlFor="editprofilemodal-confirm-new-password" className="block text-xs font-medium text-muted-foreground mb-1.5">Confirm new password</label>
                <input id="editprofilemodal-confirm-new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  className={`w-full bg-background border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none ${
                    confirmPassword && confirmPassword !== newPassword
                      ? "border-destructive/50"
                      : "border-input focus:border-primary"
                  }`} />
              </div>

              <Link_hint />
            </>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-sm text-emerald-600 bg-emerald-500/10 rounded-xl px-3 py-2">{success}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
          {tab === "profile" ? (
            <Button onClick={handleSaveProfile} disabled={saving || !fullName.trim()} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : (
            <Button
              onClick={handleChangePassword}
              disabled={saving || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
              className="gap-2">
              <Lock className="w-4 h-4" />
              {saving ? "Changing…" : "Change password"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small helper shown on the security tab. */
function Link_hint() {
  return (
    <p className="text-[11px] text-muted-foreground/70">
      Forgot your current password? Use{" "}
      <a href="/login/forgot" className="text-primary hover:text-primary/80">the reset link</a>{" "}
      from the sign-in page instead.
    </p>
  );
}
