"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, useClara, type ViewId } from "@/lib/store";
import { UpgradeSheet, Toast } from "@/components/clara/shared";
import { ChatWorkspace } from "@/components/clara/chat-workspace";
import { OrgDashboard } from "@/components/clara/org-dashboard";
import { AdminConsole } from "@/components/clara/admin-console";
import { ValidationLab } from "@/components/clara/validation-lab";
import { BillingView } from "@/components/clara/billing-view";
import { KbView } from "@/components/clara/kb-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PLANS } from "@/lib/plans";
import {
  MessageSquare,
  LayoutDashboard,
  Database,
  CreditCard,
  ShieldCheck,
  FlaskConical,
  ChevronDown,
  Loader2,
  Sparkles,
  Menu,
} from "lucide-react";

type Bootstrap = {
  user: { id: string; name: string; email: string; role: string; orgId: string | null };
  orgs: { id: string; name: string; planId: string; kbCount: number }[];
  users: { id: string; name: string; email: string; role: string; orgId: string | null }[];
  agents: { id: string; orgId: string; name: string; modelId: string }[];
  models: { id: string; displayName: string; tier: number; provider: string }[];
  needsSeed: boolean;
};

const NAV: { id: ViewId; label: string; icon: typeof MessageSquare; minRole?: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "dashboard", label: "Org Dashboard", icon: LayoutDashboard },
  { id: "knowledge", label: "Knowledge", icon: Database },
  { id: "billing", label: "Billing & Plans", icon: CreditCard },
  { id: "admin", label: "Admin Console", icon: ShieldCheck, minRole: "platform_admin" },
  { id: "validation", label: "Validation Lab", icon: FlaskConical, minRole: "platform_admin" },
];

export default function Home() {
  const { activeUserId, setActiveUser, view, setView, showToast } = useClara();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [booting, setBooting] = useState(true);
  const [metersVersion, setMetersVersion] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      const res = await fetch("/api/bootstrap");
      if (res.ok) {
        const body: Bootstrap = await res.json();
        if (body.needsSeed) {
          showToast("Seeding demo platform data…", "info");
          const seedRes = await fetch("/api/seed", { method: "POST" });
          if (seedRes.ok) {
            showToast("Demo data seeded — 4 plan tiers ready", "success");
            const res2 = await fetch("/api/bootstrap");
            if (res2.ok) setBoot(await res2.json());
            return;
          }
        }
        setBoot(body);
      }
    } finally {
      setBooting(false);
    }
  }, [showToast]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // default identity: first org_admin
  useEffect(() => {
    if (boot && !activeUserId) {
      const first =
        boot.users.find((u) => u.role === "org_admin") ?? boot.users[0];
      if (first) setActiveUser(first.id);
    }
  }, [boot, activeUserId, setActiveUser]);

  const currentUser = useMemo(
    () => boot?.users.find((u) => u.id === activeUserId) ?? boot?.user ?? null,
    [boot, activeUserId]
  );
  const currentOrg = useMemo(
    () => boot?.orgs.find((o) => o.id === currentUser?.orgId) ?? null,
    [boot, currentUser]
  );
  const orgAgents = useMemo(
    () => (boot && currentUser?.orgId ? boot.agents.filter((a) => a.orgId === currentUser.orgId) : []),
    [boot, currentUser]
  );
  const planMaxTier = useMemo(
    () => PLANS.find((p) => p.id === currentOrg?.planId)?.maxModelTier ?? 0,
    [currentOrg]
  );

  // org members never see admin surfaces; admins landing on them get bounced
  useEffect(() => {
    if (currentUser && currentUser.role !== "platform_admin" && (view === "admin" || view === "validation")) {
      setView("chat");
    }
  }, [currentUser, view, setView]);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-muted-foreground">
            Starting Clara Phase 1 console…
          </p>
        </div>
      </div>
    );
  }

  if (!boot || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="font-medium">No demo identities found.</p>
          <Button className="mt-4" onClick={bootstrap}>
            Re-seed demo data
          </Button>
        </div>
      </div>
    );
  }

  const nav = NAV.filter(
    (n) => !n.minRole || currentUser.role === n.minRole
  );

  return (
    <div className="flex h-screen flex-col bg-background md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Clara AI</p>
            <p className="text-[11px] text-muted-foreground">
              Phase 1 · Metering & Audit
            </p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                view === n.id
                  ? "bg-emerald-50 text-emerald-900"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon className="h-4 w-4" aria-hidden />
              {n.label}
            </button>
          ))}
        </nav>
        <IdentitySwitcher boot={boot} currentUser={currentUser} onSelect={setActiveUser} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-col md:hidden" style={{ height: "100dvh" }}>
        <header className="flex items-center gap-2 border-b px-3 py-2.5">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </div>
            <span className="text-sm font-semibold">Clara AI</span>
          </div>
          <div className="ml-auto">
            <IdentitySwitcher boot={boot} currentUser={currentUser} onSelect={setActiveUser} compact />
          </div>
        </header>
        {mobileNavOpen && (
          <nav className="flex gap-1 overflow-x-auto border-b p-2" aria-label="Main">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setView(n.id);
                  setMobileNavOpen(false);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  view === n.id
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" aria-hidden />
                {n.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Main */}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {view === "chat" &&
          (currentUser.orgId ? (
            <ChatWorkspace
              key={`${currentUser.id}-${currentUser.orgId}-${metersVersion === -1}`}
              userId={currentUser.id}
              orgId={currentUser.orgId}
              agents={orgAgents}
              models={boot.models}
              planMaxTier={planMaxTier}
              onUsageChange={() => setMetersVersion((v) => v + 1)}
            />
          ) : (
            <EmptyState text="Platform admins don't chat as an organisation. Switch to an org identity below the admin console." />
          ))}
        {view === "dashboard" &&
          (currentUser.orgId ? (
            <OrgDashboard userId={currentUser.id} orgId={currentUser.orgId} />
          ) : (
            <EmptyState text="Switch to an organisation identity to see its dashboard." />
          ))}
        {view === "knowledge" &&
          (currentUser.orgId ? (
            <KbView
              userId={currentUser.id}
              orgId={currentUser.orgId}
              kbsLimit={PLANS.find((p) => p.id === currentOrg?.planId)?.kbs ?? 1}
            />
          ) : (
            <EmptyState text="Switch to an organisation identity to manage knowledge bases." />
          ))}
        {view === "billing" &&
          (currentUser.orgId ? (
            <BillingView userId={currentUser.id} orgId={currentUser.orgId} />
          ) : (
            <EmptyState text="Switch to an organisation identity to manage billing." />
          ))}
        {view === "admin" && <AdminConsole userId={currentUser.id} />}
        {view === "validation" && <ValidationLab userId={currentUser.id} />}
      </main>

      <UpgradeSheet />
      <Toast />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function IdentitySwitcher({
  boot,
  currentUser,
  onSelect,
  compact,
}: {
  boot: Bootstrap;
  currentUser: Bootstrap["user"];
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const groups = useMemo(() => {
    const byOrg = new Map<string, { org: string; plan: string; users: Bootstrap["users"] }>();
    for (const org of boot.orgs) {
      byOrg.set(org.id, {
        org: org.name,
        plan: org.planId,
        users: boot.users.filter((u) => u.orgId === org.id && u.role === "org_admin"),
      });
    }
    return [...byOrg.values()];
  }, [boot]);

  return (
    <div className={compact ? "" : "border-t p-3"}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted ${
              compact ? "max-w-[170px]" : ""
            }`}
            aria-label="Switch demo identity"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase">
              {currentUser.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{currentUser.name}</p>
              {!compact && (
                <p className="truncate text-[10px] text-muted-foreground">
                  {currentUser.role.replace("_", " ")}
                </p>
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Demo identities
          </DropdownMenuLabel>
          {groups.map((g) => (
            <DropdownMenuItem
              key={g.org}
              onClick={() => g.users[0] && onSelect(g.users[0].id)}
              className="gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{g.users[0]?.name ?? g.org}</p>
                <p className="truncate text-[11px] text-muted-foreground">{g.org}</p>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">
                {g.plan}
              </Badge>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onSelect(boot.user.id)}
            className="gap-2"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">Platform Admin</p>
              <p className="text-[11px] text-muted-foreground">
                Audit chain · validation lab
              </p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
