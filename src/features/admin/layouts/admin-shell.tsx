"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain, LayoutDashboard, CreditCard,
  Settings, LogOut, ChevronRight, ChevronDown, BarChart3,
  UserRound, Bot, KeyRound, Mail, Activity, Users, FileText,
  MoreHorizontal, X, Palette,
  Plus, Rocket, BookOpen, Wrench, GitBranch, MessageCircleQuestion,
} from "lucide-react";
import { useAgents, useAuth } from "@/modules/admin-ui/hooks";
import { ProfileMenu } from "@/components/admin/ProfileMenu";
import { OrganizationStatusBanner } from "@/components/admin/OrganizationStatusBanner";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  fetchAgentWorkspaceContextCached,
} from "@/features/admin/screens/agent-workspace/context-cache";
import {
  AgentTopbarCluster,
  AgentTopbarProvider,
  TopbarContextLabel,
} from "@/features/admin/layouts/agent-topbar";

// ── Route configurations ───────────────────────────────────────────────────────

// Platform admins see counts + billing only — organisation content
// (orgs, agents, KBs, AI configuration) is org-managed.
const ADMIN_NAV = [
  { href: "/dashboard",     icon: LayoutDashboard, label: "Dashboard"     },
  { href: "/subscriptions", icon: CreditCard,      label: "Subscriptions" },
  { href: "/analytics",     icon: BarChart3,       label: "Analytics"     },
  { href: "/system-status", icon: Activity,        label: "System Status" },
];

// Settings sub-sections rendered as a dropdown group in the sidebar.
// Mirrors SETTINGS_SECTIONS in the settings screen — keep labels in sync.
// Platform admins: AI Configuration holds the platform DEFAULT assistant
// persona (Identity / Behaviour / Language / Voice) for newly onboarding
// agents and knowledge bases.
const SETTINGS_NAV = [
  { href: "/settings/account",  icon: UserRound, label: "Account"          },
  { href: "/settings/appearance", icon: Palette, label: "Appearance"       },
  { href: "/settings/ai",       icon: Bot,       label: "AI Configuration" },
  { href: "/settings/embed",    icon: KeyRound,  label: "Embed Key"        },
  { href: "/settings/payments", icon: CreditCard, label: "Payments"         },
  { href: "/settings/email",    icon: Mail,      label: "Email Delivery"   },
  { href: "/settings/templates", icon: FileText,  label: "Email Templates"  },
  { href: "/settings/announcements", icon: Rocket, label: "Announcements" },
];

// Org users have no AI Configuration section any more — assistant persona
// settings are platform-level defaults; orgs tune their own agents and
// knowledge bases. Their settings = personal account only (rendered as a
// plain link, not a one-item dropdown).
const ORG_SETTINGS_NAV = [
  { href: "/settings/account", icon: UserRound, label: "Account" },
];

// Organisation workspace sections — org users navigate to each of these
// directly from the sidebar (they used to be horizontal tabs; moving them
// into the rail keeps every screen focused on one job: monitor → build →
// team → money). "Settings" stays personal (account) in its own group.
function orgWorkspaceNav(orgId: string) {
  const base = `/orgs/${orgId}`;
  return [
    { href: base,              icon: LayoutDashboard, label: "Dashboard", exact: true  },
    { href: `${base}/agents`,  icon: Bot,             label: "Agents",    exact: false },
    { href: `${base}/members`, icon: Users,           label: "Members",   exact: false },
    { href: `${base}/billing`, icon: CreditCard,      label: "Billing",   exact: false },
  ];
}

/** Agent workspace sections — restored in the SIDEBAR under the "Agents >"
 * group (they briefly lived in a one-bar workspace navbar). The rail shows
 * them whenever an agent is open; on the agents index the rail lists the
 * org's agents themselves instead. */
function agentSectionNav(orgId: string, agentId: string) {
  const base = `/orgs/${orgId}/agents/${agentId}`;
  return [
    { href: base,                icon: LayoutDashboard,        label: "Overview", exact: true  },
    { href: `${base}/config`,    icon: Bot,                    label: "Agent",   exact: false },
    { href: `${base}/faq`,       icon: MessageCircleQuestion,  label: "FAQ",      exact: false },
    { href: `${base}/knowledge`, icon: BookOpen,               label: "Knowledge", exact: false },
    { href: `${base}/tools`,     icon: Wrench,                 label: "Tools",    exact: false },
    { href: `${base}/versions`,  icon: GitBranch,              label: "Branches", exact: false },
    { href: `${base}/publish`,   icon: Rocket,                 label: "Publish",  exact: false },
  ];
}

// Routes only accessible to super-admins — org users are redirected away from these
const SUPERADMIN_ONLY_PATHS = ["/dashboard", "/subscriptions", "/analytics", "/system-status"];

// Organisation-content routes — platform admins are redirected away from
// these because orgs manage their own agents and knowledge bases.
// The former /orgs/:id/settings exception was REMOVED with the AI
// configuration migration: organisation-level AI provider configuration no
// longer exists, and the platform admin must not have a shortcut into an
// individual organisation's settings.
const SUPERADMIN_BLOCKED_PATHS = ["/orgs", "/kbs"];

function isSuperAdminBlocked(pathname: string): boolean {
  return SUPERADMIN_BLOCKED_PATHS.some((p) => matchesPath(pathname, p));
}

function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Mobile tab-bar label — shorter than the sidebar label so five tabs fit
// on a 360px screen without truncation.
const TAB_SHORT_LABELS: Record<string, string> = {
  "/dashboard":     "Home",
  "/subscriptions": "Billing",
  "/analytics":     "Stats",
  "/system-status": "Status",
};

function tabLabel(item: { href: string; label: string; exact?: boolean }): string {
  if (item.exact) return "Home";
  return TAB_SHORT_LABELS[item.href] ?? item.label;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, primaryOrgId } = useAuth();
  const pathname   = usePathname();
  const router     = useRouter();
  const [moreOpen, setMoreOpen] = useState(false); // mobile "More" bottom sheet
  const [branchName, setBranchName] = useState("Main");

  // Settings dropdown state — auto-expands while on any settings page; the
  // manual toggle persists while browsing elsewhere.
  const onSettingsRoute = pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (onSettingsRoute) setSettingsOpen(true);
  }, [onSettingsRoute]);

  // Close the mobile sheet on navigation
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile "More" sheet is open
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [moreOpen]);

  // ── Redirect unauthenticated users to login ─────────────────────────────────
  // Skipped during an intentional sign-out: handleSignOut clears the session
  // and navigates to the public landing page — the unauthenticated state it
  // produces must not re-route the user back to /login mid-transition.
  const signingOutRef = useRef(false);
  useEffect(() => {
    if (!loading && !user && !signingOutRef.current) {
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
    // they only see counts on the dashboard. The org SETTINGS page is the
    // exception (AI provider configuration surface).
    if (isSuperAdminBlocked(pathname)) {
      router.replace("/dashboard");
    }
  }, [loading, user, primaryOrgId, pathname, router]);

  async function handleSignOut() {
    // Sign-out lands on the public landing page (not the login screen) — the
    // user has just left the product, the next natural step is the site root.
    signingOutRef.current = true;
    try { await logout(); } finally { router.push("/"); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.isSuperAdmin;

  // Organisation navigation remains the primary rail. When an agent is open,
  // its identity + configuration groups are added below in the same rail —
  // never as a second sidebar. On the agents index the rail lists the org's
  // agents themselves (ElevenLabs layout).
  const orgNav = primaryOrgId ? orgWorkspaceNav(primaryOrgId) : [];
  const agentRoute = pathname.match(/^\/orgs\/([^/]+)\/agents\/([^/]+)/);
  const activeAgentOrgId = agentRoute?.[1] ?? null;
  const activeAgentId = agentRoute?.[2] ?? null;
  const onAgentsIndex =
    !isAdmin && Boolean(primaryOrgId) && pathname === `/orgs/${primaryOrgId}/agents`;
  const nav = isAdmin ? ADMIN_NAV : orgNav;
  const settingsNav = isAdmin ? SETTINGS_NAV : ORG_SETTINGS_NAV;
  // Org users only have Account left — a one-item dropdown would be noise, so
  // render their Settings as a plain link to /settings/account.
  const singleSettingsLink = settingsNav.length === 1 ? settingsNav[0] : null;

  // Mobile bottom tab bar: the four primary destinations + "More".
  // Falls back to settings when an org user has no org yet.
  const tabs = nav.length === 4 ? nav : nav.slice(0, 3);

  const isActiveTab = (item: { href: string; exact?: boolean }) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const moreActive = moreOpen || onSettingsRoute;

  return (
    <div className="min-h-[100dvh] bg-background flex">

      {/* ── Sidebar (md+ only — phones use the bottom tab bar) ──────────────── */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-50 w-60 bg-card border-r border-border flex-col"
      >
        {/* Brand */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-foreground text-sm truncate">Clara AI</div>
            {isAdmin ? (
              <div className="text-[10px] text-primary font-medium tracking-wide uppercase">
                Platform Admin
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase truncate">
                {user.fullName || "Organisation"}
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
          {/* Org workspace group header — separates the org's own screens
              from the personal Settings group below. */}
          {!isAdmin && primaryOrgId && (
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              My Organisation
            </p>
          )}

          {/* Org user with no org yet — keep a friendly fallback link. */}
          {!isAdmin && !primaryOrgId && (
            <Link
              href="/settings/account"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Bot className="w-4 h-4 shrink-0" />
              My Organisation
            </Link>
          )}

          {nav.map((item) => {
            const active = isActiveTab(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-primary" />
                )}
              </Link>
            );
          })}

          {/* Agent workspace — one left-rail hierarchy. The root is the
              clickable "Agents >" switcher; the selected agent name is never
              rendered as a giant dropdown/header. */}
          {!isAdmin && activeAgentId && activeAgentOrgId && (
            <div className="mt-3 border-t border-border/70 pt-3">
              <AgentSidebarSwitcher
                orgId={activeAgentOrgId}
                activeAgentId={activeAgentId}
                onBranchNameChange={setBranchName}
              />

              <nav className="space-y-0.5" aria-label="Agent sections">
                {agentSectionNav(activeAgentOrgId, activeAgentId).map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <item.icon
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          active ? "text-primary" : "text-muted-foreground/70"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block leading-4">{item.label}</span>
                        {item.label === "Agent" && (
                          <span className="mt-0.5 block text-[11px] font-normal leading-3.5 text-muted-foreground/70">
                            {branchName}
                          </span>
                        )}
                      </span>
                      {active && <span className="mt-1.5 ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Agents index — the org's agents list directly in the rail. */}
          {onAgentsIndex && primaryOrgId && (
            <OrgAgentsSidebarSection orgId={primaryOrgId} />
          )}

          {/* Settings — expandable dropdown group (admins: Account / AI
              Configuration / Embed Key / Payments). Org users see a plain
              Settings link straight to their account page. */}
          {singleSettingsLink ? (
            <Link
              href={singleSettingsLink.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                onSettingsRoute
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              {onSettingsRoute && (
                <ChevronRight className="w-3 h-3 text-primary" />
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
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 ${
                  settingsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {settingsOpen && (
              <ul
                id="sidebar-settings-group"
                className="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-3 animate-in fade-in slide-in-from-top-1 duration-200"
              >
                {settingsNav.map((sub) => {
                  const subActive = pathname === sub.href;
                  return (
                    <li key={sub.href}>
                      <Link
                        href={sub.href}
                        aria-current={subActive ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
                          subActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <sub.icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            subActive ? "text-primary" : "text-muted-foreground/70"
                          }`}
                        />
                        {sub.label}
                        {subActive && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
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
        <div className="p-3 border-t border-border space-y-0.5">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-muted"
          >
            ← View public site
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 md:ml-60 min-h-[100dvh] overflow-x-hidden flex flex-col">
        {/* ── Topbar — page context + agent version cluster + profile ─────── */}
        {/* The username was removed from the navbar: the left slot shows the
            open agent / page context, and the space next to the profile avatar
            carries the agent version/deploy cluster (Main · vN, Draft changes,
            Published vN, Draft saved …, Preview, Publish update). */}
        <AgentTopbarProvider>
        <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border bg-background/85 backdrop-blur-md flex items-center justify-between gap-3 px-4 md:pl-6 md:pr-6">
          {/* Context label */}
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="md:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
              <Brain className="w-4 h-4 text-white" />
            </span>
            <TopbarContextLabel isAdmin={isAdmin} />
          </div>

          {/* Agent version cluster + theme switch + profile avatar (no name) */}
          <div className="flex items-center gap-2">
            <AgentTopbarCluster />
            <ThemeToggle />
            {user && (
              <ProfileMenu
                user={user}
                onSignOut={handleSignOut}
                billingHref={!isAdmin && primaryOrgId ? `/orgs/${primaryOrgId}/billing` : null}
                orgId={!isAdmin ? primaryOrgId : null}
              />
            )}
          </div>
        </header>
        </AgentTopbarProvider>

        {/* Bottom safe area for the tab bar */}
        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0">
          {!isAdmin && primaryOrgId && (
            <OrganizationStatusBanner orgId={primaryOrgId} />
          )}
          {children}
        </main>
      </div>

      {/* ── Mobile bottom tab bar — native app navigation ───────────────────── */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 no-select border-t border-border bg-background/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
          {tabs.map((item) => {
            const active = isActiveTab(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground active:text-foreground"
                }`}
              >
                <item.icon className={`w-[22px] h-[22px] ${active ? "drop-shadow-[0_0_10px_rgba(79,70,229,0.35)]" : ""}`} strokeWidth={active ? 2.2 : 1.8} />
                <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : ""}`}>
                  {tabLabel(item)}
                </span>
              </Link>
            );
          })}

          {/* More — settings, public site, sign out */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More options"
            aria-expanded={moreOpen}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
              moreActive ? "text-primary" : "text-muted-foreground active:text-foreground"
            }`}
          >
            <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={moreActive ? 2.2 : 1.8} />
            <span className={`text-[10px] font-medium leading-none ${moreActive ? "text-primary" : ""}`}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── Mobile "More" bottom sheet ───────────────────────────────────────── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More options">
          {/* Scrim */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card shadow-2xl animate-in slide-in-from-bottom duration-300 overscroll-contain-y">
            {/* Grabber */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-muted-foreground/25" />
            </div>
            {/* Identity */}
            <div className="px-5 pt-2 pb-4 border-b border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
                {(user.fullName.split(/\s+/).map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join("")) || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{user.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground active:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Links */}
            <div className="px-3 py-3 max-h-[60dvh] overflow-y-auto overscroll-contain-y space-y-0.5">
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Settings
              </p>
              {(singleSettingsLink ? [singleSettingsLink] : settingsNav).map((s) => {
                const active = pathname === s.href;
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm active:bg-muted transition-colors ${
                      active ? "text-primary bg-primary/10" : "text-foreground/80"
                    }`}
                  >
                    <s.icon className={`w-5 h-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="flex-1">{s.label}</span>
                    {active && <ChevronRight className="w-4 h-4 text-primary" />}
                  </Link>
                );
              })}

              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                General
              </p>
              <Link
                href="/"
                className="flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm text-foreground/80 active:bg-muted transition-colors"
              >
                <Brain className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="flex-1">View public site</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm text-destructive active:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-5 h-5 shrink-0 text-destructive/80" />
                <span className="flex-1 text-left">Sign out</span>
              </button>
            </div>

            {/* Safe-area spacer */}
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent workspace sidebar pieces (ElevenLabs layout) ───────────────────────

/**
 * Agent switcher at the top of the agent rail section. The root control is
 * intentionally only "Agents >"; the selected agent name appears only inside
 * the switcher menu. The active branch is rendered beneath the Agent menu
 * item, using the same workspace context as the topbar.
 */
function AgentSidebarSwitcher({
  orgId,
  activeAgentId,
  onBranchNameChange,
}: {
  orgId: string;
  activeAgentId: string;
  onBranchNameChange: (branchName: string) => void;
}) {
  const { agents, loading } = useAgents(orgId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeAgent = agents.find((agent) => agent.id === activeAgentId);

  useEffect(() => {
    let cancelled = false;
    onBranchNameChange("Main");
    fetchAgentWorkspaceContextCached(activeAgentId)
      .then((context) => {
        if (!cancelled) {
          onBranchNameChange(context.currentVersion?.branchName ?? context.main.name ?? "Main");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeAgentId, onBranchNameChange]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex w-full items-center gap-1 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
      >
        <span>Agents</span>
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="sr-only">
          {activeAgent ? `Current agent: ${activeAgent.name}` : "Switch agent"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch agent"
          className="absolute left-2 right-2 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {loading ? (
            <div className="space-y-1 p-1.5" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-8 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No agents available.
            </p>
          ) : (
            agents.map((agent) => {
              const selected = agent.id === activeAgentId;
              return (
                <Link
                  key={agent.id}
                  href={`/orgs/${orgId}/agents/${agent.id}`}
                  role="menuitem"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                    selected
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  {selected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function OrgAgentsSidebarSection({ orgId }: { orgId: string }) {
  const { agents, loading } = useAgents(orgId);

  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Agents
        </p>
        <button
          type="button"
          aria-label="New agent"
          title="New agent"
          onClick={() => window.dispatchEvent(new CustomEvent("clara:open-create-agent"))}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-1 px-2 pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground/70">
          No agents yet — create one to get started.
        </p>
      ) : (
        <ul className="space-y-0.5 pb-2">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/orgs/${orgId}/agents/${agent.id}`}
                title={agent.name}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              >
                <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span className="truncate">{agent.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
