"use client";

import { QueryProvider } from "@/providers/QueryProvider";
import { ToastRegion } from "@/components/ui/ToastRegion";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <ToastRegion />
    </QueryProvider>
  );
}
