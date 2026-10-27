import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { AppShell } from "@/shared/layouts/app-shell";
import { getPlatformDefaultTheme } from "@/lib/theme-settings";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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
// Pinch-zoom stays enabled (WCAG 1.4.4); inputs use a 16px font on phones so
// iOS does not auto-zoom on focus.
// themeColor follows the OS colour scheme so the browser chrome matches the
// palette for visitors whose effective theme tracks their device setting.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCFD" },
    { media: "(prefers-color-scheme: dark)", color: "#08080D" },
  ],
};

// The theme is resolved per request: the platform admin's chosen default
// (Settings → Appearance, DB-backed) is injected into <html data-default-theme>
// and applied before first paint by the inline script below. Personal choices
// made with the header toggle live in localStorage and always win.
//
// force-dynamic is required for that promise: without it Next would
// prerender this layout at build time and bake whatever the setting happened
// to be that day — restarting the app to see a new default. Reading it per
// request is what makes an admin theme change live for NEW visitors with no
// restart and no redeploy.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const defaultTheme = await getPlatformDefaultTheme();
  return (
    // suppressHydrationWarning: the init script toggles the "dark" class on
    // this exact element before React hydrates — that is by design, not a bug.
    <html lang="en" data-default-theme={defaultTheme} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        {/* Blocking theme bootstrap — must stay the FIRST element in <body>
            so it runs before anything is painted. Resolves:
            personal override → platform default → light. */}
        <script
          id="clara-theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <AppShell>
          {children}
          <Toaster position="bottom-right" visibleToasts={5} richColors closeButton className="clara-responsive-toaster" />
          <ConfirmDialogHost />
          <Analytics />
          <SpeedInsights />
        </AppShell>
      </body>
    </html>
  );
}
