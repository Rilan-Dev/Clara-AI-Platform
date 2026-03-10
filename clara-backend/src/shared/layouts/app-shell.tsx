import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";
import { SharedQueryProvider } from "@clara/ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SharedQueryProvider>
      <AssistantProvider>
        <main className="w-full h-full antialiased">{children}</main>
        <FloatingAssistant />
      </AssistantProvider>
    </SharedQueryProvider>
  );
}

export default AppShell;
