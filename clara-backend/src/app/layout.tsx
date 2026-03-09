import type { Metadata } from "next";
// Removed next/font/google to avoid build-time network timeouts for Geist font.
// The app will fallback to system fonts defined in globals.css.
import "./globals.css";
import { AssistantProvider } from "@/modules/assistant/core";
import { FloatingAssistant } from "@/modules/assistant/ui/components";

export const metadata: Metadata = {
  title: "Clara Knowledge Assistant",
  description:
    "Upload knowledge sources and chat with an AI assistant powered by retrieval augmented generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        <AssistantProvider>
          <main className="w-full h-full">{children}</main>
          <FloatingAssistant />
        </AssistantProvider>
      </body>
    </html>
  );
}
