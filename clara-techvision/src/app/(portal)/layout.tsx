"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, LayoutDashboard, Database, BarChart3, Globe, LogOut, Menu, X, ChevronRight } from "lucide-react";
import FloatingClaraButton from "@/components/FloatingClaraButton";
import { clearStoredToken, withAuthHeaders } from "@/lib/auth";

const NAV = [
  { href: "/dashboard",       icon: LayoutDashboard, label: "Dashboard" },
  { href: "/knowledge-bases", icon: Database,        label: "Knowledge Bases" },
  { href: "/analytics",       icon: BarChart3,       label: "Analytics" },
  { href: "/demo-website",    icon: Globe,           label: "Demo Website" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
    await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: withAuthHeaders() }).catch(() => {});
    clearStoredToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex">
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#0c1929] border-r border-white/[0.05] flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/[0.05]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">TechVision</div>
            <div className="text-[10px] text-sky-400 font-medium">Solutions Platform</div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span className="text-xs font-semibold text-sky-400">Starter Plan</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? "bg-sky-500/10 text-sky-300 border border-sky-500/20" : "text-white/50 hover:text-white hover:bg-white/[0.05]"}`}>
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Upgrade CTA */}
        <div className="px-4 pb-3">
          <a href="http://localhost:3000/pricing" target="_blank"
            className="block w-full text-center py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500/20 to-blue-600/20 border border-sky-500/20 text-sky-300 hover:border-sky-500/40 transition-colors">
            ↑ Upgrade to Pro
          </a>
        </div>

        <div className="p-3 border-t border-white/[0.05]">
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <button onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#0c1929] border border-white/[0.05] text-white">
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <main className="flex-1 lg:ml-60 min-h-screen overflow-y-auto relative">
        {children}
        {/* Floating Clara button on every portal page */}
        <FloatingClaraButton />
      </main>
    </div>
  );
}
