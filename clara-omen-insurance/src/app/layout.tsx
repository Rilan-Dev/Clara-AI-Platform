import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omen United Insurance — AI Portal",
  description: "Intelligent insurance assistant powered by Clara AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a1628] antialiased">{children}</body>
    </html>
  );
}
