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
    <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-[#12152a] via-[#0f1224] to-[#0b0d18] p-6 lg:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.24),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.12),transparent_24%)]" />
      <div className="relative">
        {breadcrumbs.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-white/40">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
                {item.href ? (
                  <Link href={item.href} className="hover:text-white/80 transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-white/70">{item.label}</span>
                )}
                {index < breadcrumbs.length - 1 && <span className="text-white/20">/</span>}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Icon className="h-7 w-7 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white lg:text-3xl">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">{description}</p>
              {chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/65"
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
