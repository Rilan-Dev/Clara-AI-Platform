"use client";

import { ReactNode, useEffect } from "react";
import { Button } from "./button";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
        className="relative z-10 flex max-h-[min(90dvh,900px)] w-[min(94vw,900px)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <h3 className="min-w-0 flex-1 whitespace-normal text-sm font-semibold [overflow-wrap:anywhere] text-foreground">
            {title}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </Button>
        </div>
        <div className="min-h-0 min-w-0 overflow-auto overscroll-contain p-4 [overflow-wrap:anywhere]">
          {children}
        </div>
      </section>
    </div>
  );
}
