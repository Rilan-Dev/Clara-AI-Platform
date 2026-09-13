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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-[min(92vw,900px)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)]/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
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
        <div className="overflow-auto overscroll-contain-y p-4">{children}</div>
      </div>
    </div>
  );
}
