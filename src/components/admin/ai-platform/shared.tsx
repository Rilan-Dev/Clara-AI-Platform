"use client";

/**
 * src/components/admin/ai-platform/shared.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable primitives for the AI Platform + agent workspaces (design-system
 * reuse per plan §28: one visual language for provider detail, default
 * assistant, version history, diffs).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { timeAgoShort } from "@/hooks/use-auto-save";
import type { DiffFieldChangeDTO, ProviderHealthStatus } from "@/modules/admin-ui/ai-platform-api";

// ─── Status primitives ────────────────────────────────────────────────────────

export function HealthDot({ status, className }: { status: ProviderHealthStatus | null; className?: string }) {
  const tone =
    status === "healthy"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : status === "down"
          ? "bg-rose-500"
          : "bg-muted-foreground/40";
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone, className)} aria-hidden />;
}

export function healthLabel(status: ProviderHealthStatus | null): string {
  return status === "healthy"
    ? "Healthy"
    : status === "degraded"
      ? "Degraded"
      : status === "down"
        ? "Down"
        : status === "unknown"
          ? "Not checked"
          : "Unknown";
}

export function VersionBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "muted";
}) {
  const tones = {
    neutral: "border-border bg-muted/50 text-muted-foreground",
    primary: "border-primary/30 bg-primary/10 text-primary",
    success: "border-emerald-600/30 bg-emerald-500/10 text-emerald-600",
    warning: "border-amber-600/30 bg-amber-500/10 text-amber-600",
    muted: "border-border/60 bg-transparent text-muted-foreground/70",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

// ─── Right-side contextual drawer (half-canvas) ───────────────────────────────

export function ContextDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "sm:w-[30rem]",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      {/* sm:max-w-none lifts the sheet variant's 384px cap so the requested
          half-canvas width is honoured; w-full keeps it edge-to-edge on mobile. */}
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-none", width)}>
        <SheetHeader className="border-b border-border bg-card/60 px-5 py-4 text-left">
          <SheetTitle className="text-base font-semibold text-foreground">{title}</SheetTitle>
          {subtitle && <p className="text-xs leading-relaxed text-muted-foreground/80">{subtitle}</p>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 border-t border-border bg-card/95 px-5 py-3.5 backdrop-blur">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Semantic diff viewer (§19.6 — field-aware, never raw JSON) ───────────────

export function DiffViewer({
  diff,
  emptyLabel = "No changes",
}: {
  diff: {
    from: { label: string };
    to: { label: string };
    sections: Array<{ key: string; title: string; changes: DiffFieldChangeDTO[] }>;
    changeCount: number;
  } | null;
  emptyLabel?: string;
}) {
  if (!diff) {
    return <p className="py-8 text-center text-sm text-muted-foreground/70">Loading diff…</p>;
  }
  const changed = diff.sections.filter((s) => s.changes.length > 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          <span className="text-foreground/80">{diff.from.label}</span>
          <span className="mx-2 text-muted-foreground/80">→</span>
          <span className="text-foreground/80">{diff.to.label}</span>
        </p>
        <VersionBadge tone={changed.length > 0 ? "primary" : "muted"}>
          {diff.changeCount} {diff.changeCount === 1 ? "change" : "changes"}
        </VersionBadge>
      </div>

      {changed.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground/70">
          {emptyLabel}
        </p>
      )}

      {changed.map((section) => (
        <section key={section.key} className="rounded-xl border border-border bg-card">
          <h4 className="border-b border-border/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
            {section.title}
          </h4>
          <ul className="divide-y divide-border/60">
            {section.changes.map((change) => (
              <li key={change.field} className="px-4 py-3">
                <p className="text-xs font-medium text-foreground/90">{change.label}</p>
                <div className="mt-1.5 space-y-1 text-xs leading-relaxed">
                  {change.kind === "toggled_on" && (
                    <p className="text-emerald-600">
                      <span className="mr-1.5 text-muted-foreground/80">Off</span>→<span className="ml-1.5 font-medium">On</span>
                    </p>
                  )}
                  {change.kind === "toggled_off" && (
                    <p className="text-amber-600">
                      <span className="mr-1.5 text-muted-foreground/80">On</span>→<span className="ml-1.5 font-medium">Off</span>
                    </p>
                  )}
                  {change.kind !== "toggled_on" && change.kind !== "toggled_off" && change.before != null && (
                    <p className="text-muted-foreground/80 line-through decoration-muted-foreground/40">{change.before}</p>
                  )}
                  {change.kind !== "toggled_on" && change.kind !== "toggled_off" && change.kind !== "removed" && change.after != null && (
                    <p className="font-medium text-foreground">{change.after}</p>
                  )}
                  {change.addedItems && change.addedItems.length > 0 && (
                    <p className="text-emerald-600">+ {change.addedItems.join(", ")}</p>
                  )}
                  {change.removedItems && change.removedItems.length > 0 && (
                    <p className="text-rose-500">− {change.removedItems.join(", ")}</p>
                  )}
                  {change.kind === "removed" && <p className="text-xs italic text-muted-foreground/80">Removed</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ─── Compact form atoms (workspace controls) ─────────────────────────────────

export function WorkspaceButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  /** Native tooltip text — explains why a button is disabled, etc. */
  title?: string;
}) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    secondary: "border border-border bg-card text-foreground hover:border-primary/30 hover:bg-muted/50",
    ghost: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
    danger: "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

// Full-width tab grids: every tab takes an equal share of the row and the
// grid wraps onto extra rows on narrow screens (mobile / half-canvas), so the
// last tab is always reachable — no horizontal scroll, no clipped tabs.
const TAB_GRID_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3",
  6: "grid-cols-2 sm:grid-cols-3",
};

export function WorkspaceTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  const compact = tabs.length > 3;
  return (
    <div
      role="tablist"
      className={cn(
        "grid auto-rows-fr gap-1 rounded-xl border border-border bg-muted/40 p-1",
        TAB_GRID_CLASS[tabs.length] ?? "grid-cols-2 sm:grid-cols-3",
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center font-medium leading-tight transition-colors",
            compact ? "text-xs sm:text-sm" : "text-sm",
            active === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="min-w-0 break-words">{tab.label}</span>
          {tab.count != null && (
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", active === tab.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/70")}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Auto-save status chip ────────────────────────────────────────────────────

/** Compact auto-save indicator (platform "no Save button" policy): renders
 *  the shared status copy — Saving… / Saved just now / Save failed — and
 *  re-renders on a slow tick so relative labels age naturally. */
export function AutoSaveChip({
  status,
  savedAt,
  className,
}: {
  status: "idle" | "pending" | "saving" | "saved" | "error";
  savedAt: Date | null;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);
  void tick;

  const label =
    status === "pending"
      ? "Unsaved edits"
      : status === "saving"
        ? "Saving…"
        : status === "saved"
          ? savedAt
            ? `Draft saved ${timeAgoShort(savedAt)}`
            : "Draft saved"
          : status === "error"
            ? "Save failed — edits kept"
            : "All changes saved";

  const tone =
    status === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "saved"
        ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-600"
        : status === "saving"
          ? "border-primary/25 bg-primary/5 text-primary"
          : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
      role="status"
    >
      {status === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "error" ? "bg-destructive" : status === "saved" ? "bg-emerald-500" : "bg-muted-foreground/50",
          )}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}
