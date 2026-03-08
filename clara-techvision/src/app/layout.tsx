import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechVision Solutions — AI Portal",
  description: "AI knowledge assistant powered by Clara AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0f172a] antialiased">{children}</body>
    </html>
  );
}
