"use client";

import Link from "next/link";
import { Brain, Menu } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV = [
  { label: "Features", href: "/features" },
  { label: "Pricing",  href: "/pricing" },
  { label: "Docs",     href: "/docs" },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Clara AI home">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground text-lg tracking-tight">Clara AI</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {NAV.map(l => (
              <Link key={l.label} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-semibold shadow-sm transition-colors">
              Get started
            </Link>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <Sheet>
              <SheetTrigger asChild>
                <button className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation</span>
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] bg-background border-border p-6">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-foreground">Clara AI</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {NAV.map((link) => (
                      <SheetClose asChild key={link.href}>
                        <Link href={link.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3">
                    <SheetClose asChild>
                      <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Sign in
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/signup" className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-semibold text-center shadow-sm transition-colors">
                        Get started
                      </Link>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
      <main className="pt-16 flex-1">{children}</main>
      <footer className="border-t border-border/70 py-8 sm:py-10 px-4 sm:px-6 bg-surface">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground/80 text-sm">Clara AI</span>
          </div>
          <div className="text-xs text-muted-foreground">© 2025 Clara AI Platform. All rights reserved.</div>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link href="/privacy"   className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms"     className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
