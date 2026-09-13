"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain, LayoutDashboard, Building2, CreditCard,
  Settings, LogOut, Menu, X, ChevronRight, ChevronDown, BarChart3,
  UserRound, Bot, KeyRound,
} from "lucide-react";
import { useAuth } from "@/modules/admin-ui/hooks";
import { ProfileMenu } from "@/components/admin/ProfileMenu";

// ── Route configurations ───────────────────────────────────────────────────────

// Platform admins see counts + billing only — organisation content
// (orgs, agents, KBs, AI configuration) is org-managed.
const ADMIN_NAV = [
  { href: "/dashboard",     icon: LayoutDashboard, label: "Dashboard"     },
  { href: "/subscriptions", icon: CreditCard,      label: "Subscriptions" },
  { href: "/analytics",     icon: BarChart3,       label: "Analytics"     },
];

// Settings sub-sections rendered as a dropdown group in the sidebar.
// Mirrors SETTINGS_SECTIONS in the settings screen — keep labels in sync.
// Platform admins: AI Configuration holds the platform DEFAULT assistant
// persona (Identity / Behaviour / Language / Voice) for newly onboarding
// agents and knowledge bases.
const SETTINGS_NAV = [
  { href: "/settings/account",  icon: UserRound, label: "Account"          },
  { href: "/settings/ai",       icon: Bot,       label: "AI Configuration" },
  { href: "/settings/embed",    icon: KeyRound,  label: "Embed Key"        },
  { href: "/settings/payments", icon: CreditCard, label: "Payments"         },
];

// Org users have no AI Configuration section any more — assistant persona
// settings are platform-level defaults; orgs tune their own agents and
// knowledge bases. Their settings = personal account only (rendered as a
// plain link, not a one-item dropdown).
const ORG_SETTINGS_NAV = [
  { href: "/settings/account", icon: UserRound, label: "Account" },
];

// Routes only accessible to super-admins — org users are redirected away from these
const SUPERADMIN_ONLY_PATHS = ["/dashboard", "/subscriptions", "/analytics"];

// Organisation-content routes — platform admins are redirected away from
// these because orgs manage their own agents and knowledge bases.
const SUPERADMIN_BLOCKED_PATHS = ["/orgs", "/kbs"];

function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, primaryOrgId } = useAuth();
  const pathname   = usePathname();
  const router     = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Settings dropdown state — auto-expands while on any settings page; the
  // manual toggle persists while browsing elsewhere.
  const onSettingsRoute = pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (onSettingsRoute) setSettingsOpen(true);
  }, [onSettingsRoute]);

  // ── Redirect unauthenticated users to login ─────────────────────────────────
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  // ── Redirect org users away from super-admin-only pages ────────────────────
  useEffect(() => {
    if (loading || !user) return;

    if (!user.isSuperAdmin) {
      const isAdminOnlyPage = SUPERADMIN_ONLY_PATHS.some(
        (p) => matchesPath(pathname, p) || pathname === p,
      );
      // "/orgs" list is admin-only; "/orgs/:id" is accessible to org users for their own org
      const isOrgsListPage = pathname === "/orgs";

      if (isAdminOnlyPage || isOrgsListPage) {
        const dest = primaryOrgId ? `/orgs/${primaryOrgId}` : "/settings";
        router.replace(dest);
      }
      return;
    }

    // Platform admins are locked out of organisation-content pages —
    // they only see counts on the dashboard.
    if (SUPERADMIN_BLOCKED_PATHS.some((p) => matchesPath(pathname, p))) {
      router.replace("/dashboard");
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

  // Nav items — platform admins see counts + billing only; org users see
  // their organisation (agents live on the org page) and their settings.
  const orgNav = [
    {
      href:  primaryOrgId ? `/orgs/${primaryOrgId}` : "/settings/account",
      icon:  Building2,
      label: "My Organisation",
    },
  ];
  const nav = isAdmin ? ADMIN_NAV : orgNav;
  const settingsNav = isAdmin ? SETTINGS_NAV : ORG_SETTINGS_NAV;
  // Org users only have Account left — a one-item dropdown would be noise, so
  // render their Settings as a plain link to /settings/account.
  const singleSettingsLink = settingsNav.length === 1 ? settingsNav[0] : null;

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
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
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

          {/* Settings — expandable dropdown group (admins: Account / AI
              Configuration / Embed Key / Payments). Org users see a plain
              Settings link straight to their account page. */}
          {singleSettingsLink ? (
            <Link
              href={singleSettingsLink.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                onSettingsRoute
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                  : "text-white/50 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              {onSettingsRoute && (
                <ChevronRight className="w-3 h-3 text-indigo-400" />
              )}
            </Link>
          ) : (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              aria-controls="sidebar-settings-group"
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                onSettingsRoute
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                  : "text-white/50 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 text-white/40 transition-transform duration-200 ${
                  settingsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {settingsOpen && (
              <ul
                id="sidebar-settings-group"
                className="mt-0.5 ml-3 space-y-0.5 border-l border-white/[0.08] pl-3 animate-in fade-in slide-in-from-top-1 duration-200"
              >
                {settingsNav.map((sub) => {
                  const subActive = pathname === sub.href;
                  return (
                    <li key={sub.href}>
                      <Link
                        href={sub.href}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={subActive ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
                          subActive
                            ? "bg-indigo-500/15 text-indigo-300 font-medium"
                            : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
                        }`}
                      >
                        <sub.icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            subActive ? "text-indigo-400" : "text-white/30"
                          }`}
                        />
                        {sub.label}
                        {subActive && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.06] space-y-0.5">
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
      <div className="flex-1 md:ml-60 min-h-[100dvh] overflow-x-hidden flex flex-col">
        {/* ── Topbar — page context + profile menu ──────────────────────────── */}
        <header className="sticky top-0 z-30 h-16 border-b border-white/[0.06] bg-[#0d0d14]/90 backdrop-blur flex items-center justify-between gap-4 pl-14 pr-4 md:pl-6 md:pr-6">
          {/* Context label */}
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="md:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0 hidden sm:block">
              <p className="text-sm font-semibold text-white/90 truncate leading-tight">
                {isAdmin ? "Platform Console" : user.fullName}
              </p>
              <p className="text-[11px] text-white/30 truncate leading-tight">
                {isAdmin ? "Clara AI administration" : "Clara AI workspace"}
              </p>
            </div>
          </div>

          {/* Profile avatar → menu */}
          {user && (
            <ProfileMenu
              user={user}
              onSignOut={handleSignOut}
              billingHref={!isAdmin && primaryOrgId ? `/orgs/${primaryOrgId}/billing` : null}
            />
          )}
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
