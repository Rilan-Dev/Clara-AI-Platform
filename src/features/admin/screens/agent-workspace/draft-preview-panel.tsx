"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type DraftPreviewPanelProps = {
  agentId: string;
  open: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
};

export function DraftPreviewPanel({
  agentId,
  open,
  expanded,
  onExpandedChange,
  onClose,
}: DraftPreviewPanelProps) {
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      if (!detail?.agentId || detail.agentId === agentId) setFrameKey((key) => key + 1);
    };
    window.addEventListener("agent-workspace:draft-updated", refresh);
    return () => window.removeEventListener("agent-workspace:draft-updated", refresh);
  }, [agentId, open]);

  if (!open) return null;

  return (
    <section
      className={cn(
        "fixed z-[60] flex flex-col overflow-hidden border border-border bg-background shadow-2xl",
        expanded
          ? "inset-0 rounded-none"
          : "inset-y-14 right-0 w-full rounded-l-2xl sm:w-1/2",
      )}
      aria-label="Draft AI preview"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
        {expanded ? (
          <button
            type="button"
            onClick={() => onExpandedChange(false)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Back to split preview"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : (
          <span className="text-xs font-semibold text-foreground">Preview</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          Draft configuration · changes are not published
        </span>
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={expanded ? "Collapse preview" : "Expand preview"}
          title={expanded ? "Back to split preview" : "Open preview full screen"}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close preview"
          title="Close preview"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 bg-background">
        <iframe
          key={frameKey}
          title="Draft AI preview"
          src={`/preview/agents/${encodeURIComponent(agentId)}?embedded=1`}
          className="h-full w-full border-0"
          allow="microphone; autoplay"
        />
      </div>
    </section>
  );
}
