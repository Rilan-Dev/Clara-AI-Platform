"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  breadcrumbs = [],
  chips = [],
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: React.ReactNode;
  breadcrumbs?: AdminBreadcrumbItem[];
  chips?: string[];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl sm:rounded-[28px] border border-border bg-card p-4 sm:p-6 lg:p-8 shadow-sm sm:shadow-md mb-4 sm:mb-6 lg:mb-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(79,70,229,0.05),transparent_24%)]" />
      <div className="relative">
        {breadcrumbs.length > 0 && (
          <div className="mb-5 hidden md:flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
                {item.href ? (
                  <Link href={item.href} className="hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
                {index < breadcrumbs.length - 1 && <span className="text-muted-foreground/50">/</span>}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex items-start gap-3 sm:gap-4">
            {/* Mobile: compact inline icon; sm+: the original tile */}
            <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Icon className="h-7 w-7 text-primary" />
            </div>
            <div className="flex sm:hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Icon className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
              {/* Mobile: long desktop descriptions are noise — single clamped
                  line; the full text returns from sm up. */}
              <p className="mt-1 sm:mt-2 max-w-3xl text-sm leading-6 text-muted-foreground line-clamp-1 sm:line-clamp-none">{description}</p>
              {chips.length > 0 && (
                <div className="mt-4 hidden sm:flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
