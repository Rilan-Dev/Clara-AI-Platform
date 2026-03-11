import type { ReactNode } from "react";

/** Thin passthrough wrapper. Global CSS is imported in main.tsx. */
export function AppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default AppShell;
