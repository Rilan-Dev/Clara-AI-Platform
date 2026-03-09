import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AppProviders } from "@/providers/AppProviders";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: {
    default: "Next.js State Architecture Kit",
    template: "%s | Next.js State Architecture Kit",
  },
  description: "Production-ready Next.js App Router scaffold with Zustand, TanStack Query, React Hook Form, and centralized endpoints.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] antialiased">
        <AppProviders>
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute left-[-10%] top-[-8%] h-72 w-72 rounded-full bg-sky-200/50 blur-3xl" />
            <div className="absolute right-[-12%] top-[18%] h-96 w-96 rounded-full bg-amber-100 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-white/60 to-transparent" />
          </div>
          <SiteHeader />
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
