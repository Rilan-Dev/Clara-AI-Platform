import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AssistantProvider>
      <main className="w-full h-full antialiased">{children}</main>
      <FloatingAssistant />
    </AssistantProvider>
  );
}

export default AppShell;
