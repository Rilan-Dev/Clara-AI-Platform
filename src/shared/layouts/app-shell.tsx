"use client";

import { usePathname } from "next/navigation";
import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbedRoute = pathname.startsWith("/embed/");
  const shellClassName = "w-full min-h-screen min-h-[100dvh] antialiased";

  if (isEmbedRoute) {
    return <main className={shellClassName}>{children}</main>;
  }

  return (
    <AssistantProvider>
      <main className={shellClassName}>{children}</main>
      <FloatingAssistant />
    </AssistantProvider>
  );
}

export default AppShell;
