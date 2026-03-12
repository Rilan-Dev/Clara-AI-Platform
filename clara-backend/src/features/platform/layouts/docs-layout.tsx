"use client";
/**
 * src/features/platform/layouts/docs-layout.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared sidebar shell for all /docs/* pages.
 * Sits inside the platform-shell (topnav + footer already rendered by that).
 *
 * Sidebar:
 *   - Fixed on desktop, hidden on mobile (toggle planned)
 *   - Active link highlighted by matching pathname
 *   - Section dividers: Overview / Guides / Reference / Integrations
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Zap, Code2, Package, ChevronRight } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon?: React.ElementType;
  hash?: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Documentation home", href: "/docs", icon: BookOpen },
    ],
  },
  {
    title: "Guides",
    items: [
      { label: "Getting started",          href: "/docs/getting-started", icon: Zap },
      { label: "Create an API key",        href: "/docs/getting-started#apikey" },
      { label: "Embed on your website",    href: "/docs/getting-started#embed" },
      { label: "Enable voice AI",          href: "/docs/getting-started#voice" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { label: "API reference overview",  href: "/docs/api-reference", icon: Code2 },
      { label: "Authentication",          href: "/docs/api-reference#auth" },
      { label: "GET /embed/config",       href: "/docs/api-reference#config" },
      { label: "POST /embed/chat",        href: "/docs/api-reference#chat" },
      { label: "POST /embed/session",     href: "/docs/api-reference#session" },
      { label: "Error codes",             href: "/docs/api-reference#errors" },
    ],
  },
  {
    title: "SDK & Integrations",
    items: [
      { label: "SDK & snippets overview", href: "/docs/sdk", icon: Package },
      { label: "Script tag (HTML)",       href: "/docs/sdk#script" },
      { label: "React / Next.js",         href: "/docs/sdk#react" },
      { label: "WordPress",               href: "/docs/sdk#wordpress" },
      { label: "REST API (cURL)",         href: "/docs/sdk#curl" },
      { label: "Live playground",         href: "/docs/sdk#playground" },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    const base = href.split("#")[0]!;
    if (base === "/docs") return pathname === "/docs";
    return pathname.startsWith(base);
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-white/[0.06] sticky top-16 h-[calc(100vh-64px)] overflow-y-auto pt-8 pb-12 px-5">
        {NAV.map((section) => (
          <div key={section.title} className="mb-7">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2.5 px-2">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all group ${
                        active
                          ? "bg-indigo-500/15 text-indigo-300 font-medium"
                          : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                      }`}
                    >
                      {item.icon && (
                        <item.icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-indigo-400" : "text-white/30 group-hover:text-white/50"}`} />
                      )}
                      {!item.icon && (
                        <ChevronRight className={`w-3 h-3 shrink-0 ml-0.5 ${active ? "text-indigo-400" : "text-white/20"}`} />
                      )}
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Bottom: link to admin */}
        <div className="mt-auto border-t border-white/[0.06] pt-5">
          <Link
            href="/workspace"
            className="flex items-center gap-2 text-xs text-white/30 hover:text-indigo-300 transition-colors px-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Open Admin Dashboard
          </Link>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
