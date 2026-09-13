"use client";

/**
 * src/components/admin/ProfileMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Topbar profile avatar → dropdown menu. One click away from everything
 * a user needs about THEMSELVES:
 *
 *   • Profile & security (name, avatar, password change)
 *   • Account settings    (/settings/account)
 *   • Billing & plan      (org users — the money questions)
 *   • Sign out
 *
 * Goal-oriented ordering: identity → settings → money → exit.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown, CreditCard, KeyRound, LogOut, Settings, ShieldCheck, UserRound,
} from "lucide-react";
import { EditProfileModal } from "@/components/admin/EditProfileModal";

export type ProfileMenuUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
};

export function ProfileMenu({
  user, onSignOut, billingHref,
}: {
  user: ProfileMenuUser;
  onSignOut: () => void;
  billingHref?: string | null;
}) {
  const router       = useRouter();
  const [open, setOpen]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button — the single, obvious "me" affordance */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
        className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] pl-1.5 pr-2.5 py-1.5 hover:bg-white/[0.07] hover:border-indigo-500/30 transition-all"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
            {initials || "U"}
          </div>
        )}
        <span className="hidden md:block text-sm font-medium text-white/80 max-w-[140px] truncate">
          {user.fullName}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 w-72 rounded-2xl border border-white/[0.12] bg-[#13131f] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Identity header */}
          <div className="px-4 py-4 border-b border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/10" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold">
                  {initials || "U"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.fullName}</p>
                <p className="text-xs text-white/35 truncate">{user.email}</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border ${
              user.isSuperAdmin
                ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
            }`}>
              <ShieldCheck className="w-3 h-3" />
              {user.isSuperAdmin ? "Platform admin" : "Organisation user"}
            </span>
          </div>

          {/* Actions */}
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => { setOpen(false); setShowProfile(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-indigo-500/10 transition-all"
            >
              <UserRound className="w-4 h-4 text-white/35" /> Profile & security
            </button>

            <Link
              role="menuitem"
              href="/settings/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-indigo-500/10 transition-all"
            >
              <Settings className="w-4 h-4 text-white/35" /> Account settings
            </Link>

            {billingHref && (
              <Link
                role="menuitem"
                href={billingHref}
                onClick={() => { setOpen(false); router.prefetch?.(billingHref); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-indigo-500/10 transition-all"
              >
                <CreditCard className="w-4 h-4 text-white/35" /> Billing & plan
              </Link>
            )}

            {user.isSuperAdmin && (
              <Link
                role="menuitem"
                href="/settings/ai"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-indigo-500/10 transition-all"
              >
                <KeyRound className="w-4 h-4 text-white/35" /> Platform settings
              </Link>
            )}
          </div>

          {/* Sign out */}
          <div className="p-1.5 border-t border-white/[0.08]">
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-300/80 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* Profile editor modal (name / avatar / password) */}
      {showProfile && (
        <EditProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onSaved={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
