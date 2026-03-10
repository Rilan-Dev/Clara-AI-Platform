import type { Metadata } from "next";
import { AppProviders } from "@/providers/AppProviders";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Omen United Insurance",
    template: "%s | Omen United Insurance",
  },
  description: "AI-powered insurance knowledge portal for Omen United.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a1628] antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
