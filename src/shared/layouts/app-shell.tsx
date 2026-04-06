"use client";

import { usePathname } from "next/navigation";
import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbedRoute = pathname.startsWith("/embed/");

  if (isEmbedRoute) {
    return <main className="w-full h-full antialiased">{children}</main>;
  }

  return (
    <AssistantProvider>
      <main className="w-full h-full antialiased">{children}</main>
      <FloatingAssistant />
    </AssistantProvider>
  );
}

export default AppShell;
