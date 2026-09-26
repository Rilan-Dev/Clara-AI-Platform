"use client";

import { usePathname } from "next/navigation";
import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";

// Public, pre-authentication marketing / auth routes (the "(platform)"
// route group's landing, marketing and sign-up pages, plus the top-level
// /login pages). The floating assistant widget must never appear here —
// it should only render on authenticated dashboard/workspace screens
// (i.e. after the user has logged in).
const PUBLIC_ROUTE_PREFIXES = [
  "/features",
  "/pricing",
  "/docs",
  "/contact",
  "/terms",
  "/privacy",
  "/signup",
  "/login",
  "/checkout",
];

function isPublicRoute(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Bare chrome routes: /embed/* (public widget/voice surfaces) and the
  // DEDICATED published-agent preview page. The preview is its own immersive
  // surface — the floating workspace assistant must never stack on top of the
  // agent being previewed.
  const isBareRoute = pathname.startsWith("/embed/") || pathname.startsWith("/preview/") || pathname.startsWith("/agents/");
  // The workspace assistant is intentionally an organisation-workspace feature.
  // It must not stack over public published agents or the platform-admin portal.
  const isPlatformAdminRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/subscriptions") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/system-status") ||
    pathname.startsWith("/settings");
  const showFloatingAssistant = !isBareRoute && !isPublicRoute(pathname) && !isPlatformAdminRoute;
  const shellClassName = "w-full min-h-screen min-h-[100dvh] antialiased";

  if (isBareRoute) {
    return <main className={shellClassName}>{children}</main>;
  }

  return (
    <AssistantProvider>
      <main className={shellClassName}>{children}</main>
      {showFloatingAssistant && <FloatingAssistant />}
    </AssistantProvider>
  );
}

export default AppShell;
