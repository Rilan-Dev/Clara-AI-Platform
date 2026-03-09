"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { useUIStore } from "@/store";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Users" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const mobileNavOpen = useUIStore((state) => state.mobileNavOpen);
  const toggleMobileNav = useUIStore((state) => state.toggleMobileNav);
  const closeMobileNav = useUIStore((state) => state.closeMobileNav);

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" onClick={closeMobileNav}>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-soft">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Northstar</p>
            <p className="text-base font-semibold text-slate-950">State Architecture Kit</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Production blueprint
          </div>
        </div>

        <Button variant="secondary" size="sm" className="md:hidden" onClick={toggleMobileNav}>
          {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
      </div>

      {mobileNavOpen ? (
        <div className="border-t border-slate-200/80 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobileNav}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </header>
  );
}
