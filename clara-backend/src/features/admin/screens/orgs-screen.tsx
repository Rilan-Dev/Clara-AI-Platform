"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ExternalLink } from "lucide-react";
import { apiUrl } from "@/lib/runtime";

type Org = {
  id: string; name: string; slug: string;
  plan_id: string; sub_status: string; price_usd: number;
  kb_count: number; user_count: number; query_count: number;
  created_at: string;
};

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-slate-700/60 text-slate-300",
  starter:    "bg-cyan-900/40 text-cyan-300 border border-cyan-700/30",
  pro:        "bg-indigo-900/40 text-indigo-300 border border-indigo-700/30",
  enterprise: "bg-amber-900/40 text-amber-300 border border-amber-700/30",
};

export default function OrgsPage() {
  const [orgs, setOrgs]     = useState<Org[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const perPage = 20;

  useEffect(() => {
    fetch(apiUrl(`/api/platform/orgs?page=${page}&perPage=${perPage}`))
      .then(r => r.json())
      .then(d => { setOrgs(d.orgs ?? []); setTotal(d.total ?? 0); })
      .catch(() => {});
  }, [page]);

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Organisations</h1>
          <p className="text-white/40 text-sm mt-0.5">{total} organisations total</p>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                {["Organisation", "Plan", "Status", "KBs", "Users", "Total Queries", "Created", ""].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-white/30">No organisations found</td></tr>
              ) : filtered.map(org => (
                <tr key={org.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                        {org.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-white">{org.name}</div>
                        <div className="text-xs text-white/30">{org.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_BADGE[org.plan_id] ?? PLAN_BADGE.free}`}>
                      {(org.plan_id ?? "free").toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs ${org.sub_status === "active" ? "text-emerald-400" : "text-amber-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${org.sub_status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {org.sub_status ?? "none"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-white/60">{org.kb_count}</td>
                  <td className="px-5 py-4 text-white/60">{org.user_count}</td>
                  <td className="px-5 py-4 text-white/60">{org.query_count.toLocaleString()}</td>
                  <td className="px-5 py-4 text-white/40 text-xs">{new Date(org.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <Link href={`/admin/orgs/${org.id}`} className="text-indigo-400 hover:text-indigo-300">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
          <span className="text-xs text-white/30">Showing {filtered.length} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-xs rounded-lg border border-white/10 text-white/50 disabled:opacity-30 hover:text-white hover:border-white/20 transition-colors">
              ← Prev
            </button>
            <button disabled={page * perPage >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-xs rounded-lg border border-white/10 text-white/50 disabled:opacity-30 hover:text-white hover:border-white/20 transition-colors">
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
