import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/shared/layouts/app-shell";
import "@/app/globals.css";
import "@/features/platform/landing-scroll-fix.css";

export const metadata: Metadata = {
  title: {
    default: "Clara AI Platform",
    template: "%s | Clara AI Platform",
  },
  description: "Clara AI platform, admin, workspace, and embed surfaces.",
};

// Mobile app feel: viewport-fit=cover lets us use the full screen and
// respect the notch / home indicator via env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <AppShell>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </AppShell>
      </body>
    </html>
  );
}
