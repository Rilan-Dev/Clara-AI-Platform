import Link from "next/link";
import { Brain } from "lucide-react";

const NAV = [
  { label: "Features", href: "/features" },
  { label: "Pricing",  href: "/pricing" },
  { label: "Docs",     href: "/docs" },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06]"
           style={{ background: "rgba(10,10,15,0.85)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Clara AI</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {NAV.map(l => (
              <Link key={l.label} href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-white/60 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </nav>
      <main className="pt-16">{children}</main>
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white/80 text-sm">Clara AI</span>
          </div>
          <div className="text-xs text-white/30">© 2025 Clara AI Platform. All rights reserved.</div>
          <div className="flex gap-6 text-xs text-white/40">
            <Link href="/privacy"   className="hover:text-white/70 transition-colors">Privacy</Link>
            <Link href="/terms"     className="hover:text-white/70 transition-colors">Terms</Link>
            <Link href="/dashboard" className="hover:text-white/70 transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
