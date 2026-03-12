import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/shared/layouts/app-shell";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Clara AI Platform",
    template: "%s | Clara AI Platform",
  },
  description: "Clara AI platform, admin, workspace, and embed surfaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </AppShell>
      </body>
    </html>
  );
}
