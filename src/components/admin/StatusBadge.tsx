"use client";
/**
 * StatusBadge — document processing status indicator
 */
import { cn } from "@/lib/utils";

type Status = "pending" | "processing" | "ready" | "failed" | "active" | "archived";

const CONFIG: Record<Status, { label: string; classes: string; dot: string }> = {
  pending:    { label: "Pending",    classes: "bg-muted text-muted-foreground border-muted",               dot: "bg-muted-foreground animate-pulse" },
  processing: { label: "Processing", classes: "bg-warning/15 text-warning border-warning/40",               dot: "bg-warning animate-pulse" },
  ready:      { label: "Ready",      classes: "bg-success/15 text-success border-success/40",               dot: "bg-success" },
  failed:     { label: "Failed",     classes: "bg-destructive/15 text-destructive border-destructive/40",   dot: "bg-destructive" },
  active:     { label: "Active",     classes: "bg-success/15 text-success border-success/40",               dot: "bg-success" },
  archived:   { label: "Archived",   classes: "bg-muted/50 text-muted-foreground border-muted/50",          dot: "bg-muted-foreground" },
};

type Props = { status: Status; className?: string };

export function StatusBadge({ status, className }: Props) {
  const c = CONFIG[status] ?? CONFIG.pending;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
      c.classes, className
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", c.dot)} />
      {c.label}
    </span>
  );
}
