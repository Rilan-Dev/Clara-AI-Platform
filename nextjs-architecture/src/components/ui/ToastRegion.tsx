"use client";

import { X } from "lucide-react";
import { useUIStore } from "@/store";
import { cn } from "@/utils/cn";

const toneClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function ToastRegion() {
  const toasts = useUIStore((state) => state.toasts);
  const removeToast = useUIStore((state) => state.removeToast);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:left-auto sm:w-[360px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto w-full rounded-2xl border px-4 py-3 shadow-soft",
            toneClasses[toast.tone],
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{toast.title}</p>
              {toast.description ? <p className="mt-1 text-sm opacity-90">{toast.description}</p> : null}
            </div>
            <button type="button" onClick={() => removeToast(toast.id)} className="rounded-full p-1 opacity-60 transition hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
