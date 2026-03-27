"use client";

import { usePathname } from "next/navigation";
import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideFloatingAssistant = pathname.startsWith("/embed/");

  return (
    <AssistantProvider>
      <main className="w-full h-full antialiased">{children}</main>
      {!hideFloatingAssistant ? <FloatingAssistant /> : null}
    </AssistantProvider>
  );
}

export default AppShell;
