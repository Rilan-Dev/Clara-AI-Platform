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
import { BookOpen, Zap, Code2, Package, ChevronRight, Menu } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
    <div className="flex min-h-[calc(100vh-64px)] flex-col md:flex-row">
      <div className="md:hidden sticky top-16 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-xs font-semibold text-foreground/80">Documentation</div>
          <Sheet>
            <SheetTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Menu className="h-4 w-4" />
                Browse
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-background border-border p-5">
              <div className="space-y-6">
                {NAV.map((section) => (
                  <div key={section.title}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-2 px-1">
                      {section.title}
                    </div>
                    <ul className="space-y-1">
                      {section.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <li key={item.href}>
                            <SheetClose asChild>
                              <Link
                                href={item.href}
                                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                                  active
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                              >
                                {item.icon && (
                                  <item.icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
                                )}
                                {!item.icon && (
                                  <ChevronRight className={`w-3 h-3 shrink-0 ml-0.5 ${active ? "text-primary" : "text-muted-foreground/40"}`} />
                                )}
                                <span className="leading-tight">{item.label}</span>
                              </Link>
                            </SheetClose>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-border/70 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto pt-8 pb-12 px-5">
        {NAV.map((section) => (
          <div key={section.title} className="mb-7">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-2.5 px-2">
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
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.icon && (
                        <item.icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground/70"}`} />
                      )}
                      {!item.icon && (
                        <ChevronRight className={`w-3 h-3 shrink-0 ml-0.5 ${active ? "text-primary" : "text-muted-foreground/40"}`} />
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
        <div className="mt-auto border-t border-border/70 pt-5">
          <Link
            href="/workspace"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Open Admin Dashboard
          </Link>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
