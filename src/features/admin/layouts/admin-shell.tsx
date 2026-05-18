"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain, LayoutDashboard, Building2, CreditCard,
  Settings, LogOut, Menu, X, ChevronRight, BarChart3, UserPen, Play,
} from "lucide-react";
import { useAuth } from "@/modules/admin-ui/hooks";
import { EditProfileModal } from "@/components/admin/EditProfileModal";

// ── Route configurations ───────────────────────────────────────────────────────

const ADMIN_NAV = [
  { href: "/dashboard",     icon: LayoutDashboard, label: "Dashboard"     },
  { href: "/orgs",          icon: Building2,       label: "Organisations" },
  { href: "/subscriptions", icon: CreditCard,      label: "Subscriptions" },
  { href: "/analytics",     icon: BarChart3,       label: "Analytics"     },
  { href: "/demo",          icon: Play,            label: "Demo"          },
  { href: "/settings",      icon: Settings,        label: "Settings"      },
];

// Routes only accessible to super-admins — org users are redirected away from these
const SUPERADMIN_ONLY_PATHS = ["/dashboard", "/subscriptions", "/analytics"];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, primaryOrgId } = useAuth();
  const pathname   = usePathname();
  const router     = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // ── Redirect unauthenticated users to login ─────────────────────────────────
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  // ── Redirect org users away from super-admin-only pages ────────────────────
  useEffect(() => {
    if (loading || !user || user.isSuperAdmin) return;

    const isAdminOnlyPage = SUPERADMIN_ONLY_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    // "/orgs" list is admin-only; "/orgs/:id" is accessible to org users for their own org
    const isOrgsListPage = pathname === "/orgs";

    if (isAdminOnlyPage || isOrgsListPage) {
      const dest = primaryOrgId ? `/orgs/${primaryOrgId}` : "/settings";
      router.replace(dest);
    }
  }, [loading, user, primaryOrgId, pathname, router]);

  async function handleSignOut() {
    try { await logout(); } finally { router.push("/login"); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-indigo-500/40 border-t-indigo-300 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.isSuperAdmin;

  // Nav items — admins see full platform nav; org users see only their org + settings
  const orgNav = [
    {
      href:  primaryOrgId ? `/orgs/${primaryOrgId}` : "/settings",
      icon:  Building2,
      label: "My Organisation",
    },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];
  const nav = isAdmin ? ADMIN_NAV : orgNav;

  return (
    <div className="dark min-h-[100dvh] bg-[#0a0a0f] flex">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#0d0d1a] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Brand */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-sm truncate">Clara AI</div>
            {isAdmin ? (
              <div className="text-[10px] text-indigo-400 font-medium tracking-wide uppercase">
                Platform Admin
              </div>
            ) : (
              <div className="text-[10px] text-cyan-400 font-medium tracking-wide uppercase truncate">
                {user.fullName || "Organisation"}
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-indigo-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.06] space-y-0.5">
          {/* User info pill — click to edit profile */}
          <button
            onClick={() => setShowProfile(true)}
            className="w-full text-left px-3 py-2 mb-1 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-indigo-500/30 transition-all group"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/70 truncate">{user.fullName}</p>
                <p className="text-[11px] text-white/30 truncate">{user.email}</p>
              </div>
              <UserPen className="w-3.5 h-3.5 text-white/20 group-hover:text-indigo-400 shrink-0 transition-colors" />
            </div>
          </button>
          <Link
            href="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-white/30 hover:text-white/60 transition-colors rounded-lg hover:bg-white/[0.03]"
          >
            ← View public site
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-[60] p-2 rounded-lg bg-[#0d0d1a] border border-white/[0.06] text-white shadow-lg"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex-1 md:ml-60 min-h-[100dvh] overflow-x-hidden">
        {children}
      </main>

      {/* Edit Profile modal */}
      {showProfile && (
        <EditProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onSaved={() => { setShowProfile(false); window.location.reload(); }}
        />
      )}
    </div>
  );
}
