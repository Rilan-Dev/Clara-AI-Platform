import type { Metadata } from "next";
import { AppProviders } from "@/providers/AppProviders";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "TechVision Solutions",
    template: "%s | TechVision Solutions",
  },
  description: "AI knowledge portal for TechVision Solutions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0f172a] antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
