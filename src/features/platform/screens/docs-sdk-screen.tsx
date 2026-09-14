"use client";
import Link from "next/link";
import { useState } from "react";
import { Copy, Check, Package, Code2, Globe, Webhook } from "lucide-react";

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative bg-[#0d0d18] border border-white/[0.08] rounded-xl overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
        <span className="text-xs text-white/30 font-mono">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/70 transition-colors">
          {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="p-5 text-xs text-emerald-300 font-mono overflow-x-auto leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

const EMBED_ATTRS = [
  { attr: "data-org", required: true, desc: "Your organisation slug (from Admin → Settings)" },
  { attr: "data-kb", required: true, desc: "Knowledge base ID to query" },
  { attr: "data-theme", required: false, desc: '"dark" or "light" (default: dark)' },
  { attr: "data-primary-color", required: false, desc: "Hex colour for the chat bubble and accents" },
  { attr: "data-position", required: false, desc: '"bottom-right" or "bottom-left" (default: bottom-right)' },
  { attr: "data-voice", required: false, desc: '"true" to show mic button (Starter+ only)' },
  { attr: "data-placeholder", required: false, desc: "Input placeholder text" },
];

const EVENTS = ["document.ingested", "document.failed", "kb.created", "kb.deleted", "query.completed", "subscription.changed"];

export default function DocsSdkScreen() {
  return (
    <div className="min-h-screen px-4 py-10 sm:py-20 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-white/30 mb-10">
          <Link href="/docs" className="hover:text-white/60 transition-colors">Docs</Link>
          <span>/</span>
          <span className="text-white/60">SDK & Integrations</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
          SDK &{" "}
          <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Integrations</span>
        </h1>
        <p className="text-white/50 text-lg mb-14 leading-relaxed">
          JavaScript SDK, iFrame embed, webhooks, and React component — integrate Clara AI into anything.
        </p>

        {/* JS SDK */}
        <section id="js" className="mb-8 sm:mb-16 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">JavaScript / TypeScript SDK</h2>
          </div>
          <p className="text-white/60 text-sm mb-4 leading-relaxed">
            The official clara-ai SDK works in Node.js and the browser. Install via npm or yarn.
          </p>
          <CodeBlock lang="bash" code={`npm install @clara-ai/sdk\n# or\nyarn add @clara-ai/sdk`} />
          <CodeBlock lang="typescript" code={`import { ClaraClient } from "@clara-ai/sdk";\n\nconst clara = new ClaraClient({\n  apiKey: process.env.CLARA_API_KEY!,\n  baseUrl: "https://your-org.clara.ai",\n});\n\n// Run a RAG search\nconst result = await clara.search({\n  kbId: "kb_your_id",\n  query: "What does my policy cover for water damage?",\n  topK: 5,\n});\n\nconsole.log(result.answer);\nconsole.log(result.citations);`} />
        </section>

        {/* iFrame embed */}
        <section id="iframe" className="mb-8 sm:mb-16 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">iFrame Embed Reference</h2>
          </div>
          <p className="text-white/60 text-sm mb-4 leading-relaxed">
            The simplest integration — one script tag, zero dependencies. Paste before <code className="text-indigo-300">&lt;/body&gt;</code> on any page.
          </p>
          <CodeBlock lang="html" code={`<script\n  src="https://your-org.clara.ai/embed/widget.js"\n  data-org="your-org-slug"\n  data-kb="kb_your_id"\n  data-theme="dark"\n  data-primary-color="#6366f1"\n  data-position="bottom-right"\n  data-voice="false"\n  data-placeholder="Ask a question..."\n  defer\n></script>`} />
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06] text-xs font-bold text-white/30 uppercase tracking-widest">Embed attributes</div>
            {EMBED_ATTRS.map((r, i) => (
              <div key={r.attr} className={`flex flex-col gap-2 px-4 py-2.5 text-xs sm:flex-row sm:items-start sm:gap-3 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                <code className="text-indigo-300 font-mono shrink-0 sm:w-44">{r.attr}</code>
                {r.required
                  ? <span className="text-rose-400 shrink-0 text-[10px] font-bold uppercase sm:w-16">required</span>
                  : <span className="text-white/20 shrink-0 text-[10px] uppercase sm:w-16">optional</span>}
                <span className="text-white/50 min-w-0">{r.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Webhooks */}
        <section id="webhooks" className="mb-8 sm:mb-16 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center">
              <Webhook className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Webhooks & Events</h2>
          </div>
          <p className="text-white/60 text-sm mb-4 leading-relaxed">
            Clara sends HTTP POST events to your endpoint for key lifecycle events. Configure your webhook URL in Admin → Settings → Webhooks.
          </p>
          <CodeBlock lang="json" code={`// document.ingested event payload\n{\n  "event": "document.ingested",\n  "org_id": "org_xxx",\n  "data": {\n    "document_id": "doc_xxx",\n    "kb_id": "kb_xxx",\n    "filename": "policy-2025.pdf",\n    "chunk_count": 38,\n    "status": "ready"\n  },\n  "timestamp": "2025-06-01T12:00:00Z"\n}`} />
          <div className="grid sm:grid-cols-2 gap-3">
            {EVENTS.map(ev => (
              <div key={ev} className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] rounded-lg px-4 py-2.5">
                <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                <code className="text-xs text-white/70 font-mono">{ev}</code>
              </div>
            ))}
          </div>
        </section>

        {/* React component */}
        <section id="react" className="mb-14 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">React Component</h2>
          </div>
          <p className="text-white/60 text-sm mb-4 leading-relaxed">
            Import the pre-built React chat component for full control over styling and placement.
          </p>
          <CodeBlock lang="tsx" code={`import { ClaraChat } from "@clara-ai/react";\n\nexport function SupportPage() {\n  return (\n    <div className="flex h-screen">\n      <aside className="w-80">\n        <ClaraChat\n          apiKey={process.env.NEXT_PUBLIC_CLARA_KEY}\n          kbId="kb_your_id"\n          theme="dark"\n          placeholder="Ask about your policy..."\n          onCitation={(citation) => console.log(citation)}\n        />\n      </aside>\n    </div>\n  );\n}`} />
        </section>

        <div className="flex items-center justify-between mt-8 border-t border-white/[0.06] pt-8">
          <Link href="/docs/api-reference" className="text-sm text-white/40 hover:text-white transition-colors">← API Reference</Link>
          <Link href="/pricing" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            View Pricing →
          </Link>
        </div>
      </div>
    </div>
  );
}
