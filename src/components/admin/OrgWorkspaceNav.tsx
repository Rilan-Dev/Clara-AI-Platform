"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Bot, Users, CreditCard, Settings2,
} from "lucide-react";

/**
 * OrgWorkspaceNav — the organisation workspace navbar.
 *
 * Gives every org page a consistent, goal-oriented tab structure:
 *   Overview (monitor) · Agents (build) · Members (team) · Billing (plan) · Settings
 *
 * "Less user thinking": each tab answers one question the user already has,
 * in the order they typically need it — monitor → build → team → money → config.
 */
export function OrgWorkspaceNav({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/orgs/${orgId}`;

  const tabs = [
    { href: base,                   label: "Overview", icon: LayoutDashboard, exact: true  },
    { href: `${base}/agents`,       label: "Agents",    icon: Bot,            exact: false },
    { href: `${base}/members`,      label: "Members",   icon: Users,          exact: false },
    { href: `${base}/billing`,      label: "Billing",   icon: CreditCard,     exact: false },
    { href: `${base}/settings`,     label: "Settings",  icon: Settings2,      exact: false },
  ];

  return (
    <nav
      aria-label="Organisation sections"
      className="sticky top-16 z-20 -mx-6 lg:-mx-8 px-6 lg:px-8 mb-6 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/[0.06]"
    >
      <div className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                active
                  ? "text-indigo-300 border-indigo-400"
                  : "text-white/45 border-transparent hover:text-white/80 hover:border-white/20"
              }`}
            >
              <tab.icon className={`w-4 h-4 shrink-0 ${active ? "text-indigo-400" : "text-white/30"}`} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
