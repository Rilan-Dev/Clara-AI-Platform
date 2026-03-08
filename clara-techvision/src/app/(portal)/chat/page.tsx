"use client";
import { useEffect, useState, useRef } from "react";
import { BookOpen, ChevronRight, Loader2 } from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3010";
const ORG_ID  = process.env.NEXT_PUBLIC_ORG_ID || "";

type KB = { id: string; name: string; status: string; doc_count: number };

export default function TechVisionChatPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND}/api/kbs/all?orgId=${ORG_ID}`)
      .then(r => r.json())
      .then(d => { setKbs(d.kbs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-6">
        <BookOpen className="w-8 h-8 text-sky-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-3">Chat with Your AI</h1>
      <p className="text-white/50 text-sm max-w-md mb-8">
        The Clara AI assistant is available via the floating button in the bottom-right corner of every page.
        Click it to open the chat panel and ask questions about your knowledge bases.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading knowledge bases…
        </div>
      ) : kbs.length === 0 ? (
        <div className="text-white/30 text-sm">No knowledge bases yet. Create one to start chatting.</div>
      ) : (
        <div className="w-full max-w-md space-y-2">
          <div className="text-xs font-medium text-white/40 mb-3">Available Knowledge Bases</div>
          {kbs.map(kb => (
            <div key={kb.id}
                 className="flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 hover:bg-white/[0.07] transition-all">
              <div className="text-left">
                <div className="text-sm font-medium text-white">{kb.name}</div>
                <div className="text-xs text-white/30">{kb.doc_count ?? 0} documents</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${kb.status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                <ChevronRight className="w-4 h-4 text-white/30" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 flex items-center gap-2 text-xs text-white/30 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
        Click the floating Clara button ↘ to start chatting
      </div>
    </div>
  );
}
