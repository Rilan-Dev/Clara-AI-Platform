"use client";
/**
 * EditProfileModal — lets any authenticated user update their name and avatar URL.
 * Used from the admin shell user menu and the profile page.
 *
 * RBAC: any authenticated user can edit their own profile.
 *       Super-admins see their role noted in the modal.
 */
import { useState } from "react";
import { User, Camera, X, Save } from "lucide-react";
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

export function EditProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserProfile;
  onClose: () => void;
  onSaved: (updated: UserProfile) => void;
}) {
  const [fullName,  setFullName]  = useState(user.fullName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSave() {
    if (!fullName.trim()) { setError("Name cannot be empty"); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch(apiUrl("/api/auth/me"), {
        method:  "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ fullName: fullName.trim(), avatarUrl: avatarUrl.trim() || null }),
      });
      const data = await res.json() as { user?: UserProfile; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update profile");
      onSaved(data.user!);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#13131f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-sm">Edit Profile</h2>
              <p className="text-xs text-white/40">
                {user.isSuperAdmin ? "Platform Admin" : "Organisation User"}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Avatar preview + URL */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName}
                  className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500/30 flex items-center justify-center text-indigo-300 text-2xl font-bold">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center border-2 border-[#13131f]">
                <Camera className="w-3 h-3 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-white/50 mb-1.5">Avatar URL</label>
              <input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          {/* Full name */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Full name <span className="text-rose-400">*</span></label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Email <span className="text-white/25">(read-only)</span></label>
            <div className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/40 font-mono">
              {user.email}
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.08]">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !fullName.trim()} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
