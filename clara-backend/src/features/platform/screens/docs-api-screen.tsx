"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Copy, Check } from "lucide-react";

const BASE = "https://{your-org}.clara.ai";

type Param = { name: string; type: string; required: boolean; desc: string };
type Endpoint = {
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  summary: string;
  auth: boolean;
  body?: Param[];
  response: string;
};

const SECTIONS: { id: string; title: string; endpoints: Endpoint[] }[] = [
  {
    id: "kbs",
    title: "Knowledge Bases",
    endpoints: [
      {
        method: "GET", path: "/api/kbs", summary: "List all knowledge bases for your org", auth: true,
        response: `{ "kbs": [{ "id": "kb_xxx", "name": "Support Docs", "doc_count": 42 }] }`,
      },
      {
        method: "POST", path: "/api/kbs", summary: "Create a new knowledge base", auth: true,
        body: [
          { name: "name", type: "string", required: true, desc: "Human-readable name" },
          { name: "description", type: "string", required: false, desc: "Optional description" },
        ],
        response: `{ "kb": { "id": "kb_xxx", "name": "Support Docs", "created_at": "2025-01-01T00:00:00Z" } }`,
      },
      {
        method: "DELETE", path: "/api/kbs/:id", summary: "Delete a knowledge base and all its documents", auth: true,
        response: `{ "success": true }`,
      },
    ],
  },
  {
    id: "docs",
    title: "Documents & Ingestion",
    endpoints: [
      {
        method: "GET", path: "/api/kbs/:id/documents", summary: "List documents in a knowledge base", auth: true,
        response: `{ "documents": [{ "id": "doc_xxx", "filename": "policy.pdf", "status": "ready", "chunk_count": 24 }] }`,
      },
      {
        method: "POST", path: "/api/ingest/upload", summary: "Upload a file for ingestion (multipart/form-data)", auth: true,
        body: [
          { name: "file", type: "File", required: true, desc: "PDF, DOCX, TXT, or MD file" },
          { name: "kb_id", type: "string", required: true, desc: "Target knowledge base ID" },
        ],
        response: `{ "document": { "id": "doc_xxx", "status": "processing" } }`,
      },
      {
        method: "POST", path: "/api/ingest/url", summary: "Ingest content from a URL", auth: true,
        body: [
          { name: "url", type: "string", required: true, desc: "Public URL to crawl and ingest" },
          { name: "kb_id", type: "string", required: true, desc: "Target knowledge base ID" },
        ],
        response: `{ "document": { "id": "doc_xxx", "status": "processing" } }`,
      },
    ],
  },
  {
    id: "search",
    title: "RAG Search & Chat",
    endpoints: [
      {
        method: "POST", path: "/api/rag/search", summary: "Run a RAG query against a knowledge base", auth: true,
        body: [
          { name: "query", type: "string", required: true, desc: "The user's question" },
          { name: "kb_id", type: "string", required: true, desc: "Knowledge base to search" },
          { name: "top_k", type: "number", required: false, desc: "Number of chunks to retrieve (default: 5)" },
          { name: "stream", type: "boolean", required: false, desc: "Stream response via SSE (default: false)" },
        ],
        response: `{ "answer": "Yes, burst pipes are covered...", "citations": [{ "doc_id": "doc_xxx", "score": 0.92 }] }`,
      },
      {
        method: "POST", path: "/api/rag/chat", summary: "Multi-turn chat with memory (session-based)", auth: true,
        body: [
          { name: "message", type: "string", required: true, desc: "User message" },
          { name: "kb_id", type: "string", required: true, desc: "Knowledge base ID" },
          { name: "session_id", type: "string", required: false, desc: "Conversation session ID for memory" },
        ],
        response: `{ "response": "...", "session_id": "sess_xxx", "citations": [] }`,
      },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  POST: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
  DELETE: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
  PATCH: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="text-white/30 hover:text-white/70 transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function DocsApiScreen() {
  return (
    <div className="min-h-screen px-6 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-white/30 mb-10">
          <Link href="/docs" className="hover:text-white/60 transition-colors">Docs</Link>
          <span>/</span>
          <span className="text-white/60">API Reference</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
          API{" "}
          <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Reference</span>
        </h1>
        <p className="text-white/50 text-lg mb-6 leading-relaxed">
          REST API for Clara AI. All endpoints require an API key unless marked otherwise.
        </p>

        <div id="auth" className="border border-indigo-500/30 bg-indigo-600/10 rounded-xl p-5 mb-14 scroll-mt-24">
          <div className="text-sm font-bold text-indigo-300 mb-2">Authentication</div>
          <p className="text-sm text-white/60 mb-3">
            Pass your API key in the <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded">x-api-key</code> header on every request.
          </p>
          <div className="flex items-center justify-between bg-[#0d0d18] rounded-lg px-4 py-2.5 font-mono text-xs text-emerald-300 gap-3">
            <span className="overflow-x-auto">curl -H &quot;x-api-key: YOUR_API_KEY&quot; {BASE}/api/kbs</span>
            <CopyButton text={`curl -H "x-api-key: YOUR_API_KEY" ${BASE}/api/kbs`} />
          </div>
        </div>

        {SECTIONS.map(sec => (
          <div key={sec.id} id={sec.id} className="mb-14 scroll-mt-24">
            <h2 className="text-xl font-bold text-white mb-6 pb-3 border-b border-white/[0.08]">{sec.title}</h2>
            <div className="space-y-5">
              {sec.endpoints.map(ep => (
                <div key={ep.path} className="border border-white/[0.08] bg-white/[0.03] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md font-mono ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
                    <code className="text-sm text-white/80 font-mono">{ep.path}</code>
                    {ep.auth && <span className="ml-auto text-xs text-white/30 border border-white/10 rounded px-2 py-0.5">Auth required</span>}
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    <p className="text-sm text-white/60">{ep.summary}</p>
                    {ep.body && ep.body.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Request body</div>
                        <div className="rounded-lg overflow-hidden border border-white/[0.06]">
                          {ep.body.map((p, i) => (
                            <div key={p.name} className={`flex items-start gap-3 px-4 py-2.5 text-xs ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                              <code className="text-indigo-300 font-mono shrink-0 w-28">{p.name}</code>
                              <span className="text-white/30 shrink-0 w-16">{p.type}</span>
                              {p.required
                                ? <span className="text-rose-400 shrink-0 text-[10px] font-bold uppercase">required</span>
                                : <span className="text-white/20 shrink-0 text-[10px] uppercase">optional</span>}
                              <span className="text-white/50 leading-relaxed">{p.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Response</div>
                      <div className="flex items-start justify-between bg-[#0d0d18] rounded-lg px-4 py-3 font-mono text-xs text-emerald-300 gap-3">
                        <pre className="overflow-x-auto flex-1">{ep.response}</pre>
                        <CopyButton text={ep.response} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between mt-8 border-t border-white/[0.06] pt-8">
          <Link href="/docs/getting-started" className="text-sm text-white/40 hover:text-white transition-colors">← Getting Started</Link>
          <Link href="/docs/sdk" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            SDK & Integrations <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
