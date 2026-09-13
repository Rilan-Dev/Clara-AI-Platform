import Link from "next/link";
import {
  Brain, Mic, Shield, Globe, Palette, BarChart3,
  Key, Building2, FileText, Zap, Lock, RefreshCw,
  CheckCircle, ChevronRight
} from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "RAG-Powered Answers",
    description: "Every response is grounded in your actual documents — no hallucinations. Clara cites exactly which paragraph it's drawing from, with source references like [S1] and [S2].",
    bullets: ["Vector semantic search", "Multi-hop reasoning", "Source citations on every answer", "Hybrid BM25 + dense retrieval"],
    color: "from-violet-500 to-indigo-500",
    badge: "Core",
  },
  {
    icon: Mic,
    title: "Real-Time Voice AI",
    description: "Full voice conversations powered by OpenAI Realtime API. Your customers speak naturally — Clara understands context, interruptions, and responds with low latency.",
    bullets: ["WebRTC audio streaming", "40+ languages supported", "Interrupt detection", "Custom voice personas"],
    color: "from-cyan-500 to-blue-500",
    badge: "Starter+",
  },
  {
    icon: FileText,
    title: "Any Document Type",
    description: "Upload PDFs, Word docs, Excel spreadsheets, or paste a URL. Clara extracts, chunks, and indexes everything automatically using an advanced ingestion pipeline.",
    bullets: ["PDF, DOCX, TXT, CSV", "URL / web scraping", "Automatic re-indexing", "50MB per file limit"],
    color: "from-emerald-500 to-teal-500",
    badge: "All Plans",
  },
  {
    icon: Globe,
    title: "Multilingual",
    description: "Clara understands queries in 50+ languages and responds in the language your customer prefers — even if your source documents are all in English.",
    bullets: ["Auto language detection", "Cross-lingual retrieval", "50+ supported languages", "Consistent citation quality"],
    color: "from-orange-500 to-rose-500",
    badge: "All Plans",
  },
  {
    icon: Palette,
    title: "Fully Branded",
    description: "Customise the assistant's name, avatar, colours, and personality to exactly match your brand. Embed as an iFrame or floating widget on any website.",
    bullets: ["Custom assistant name", "Colour + logo theming", "System prompt control", "Tone configuration"],
    color: "from-pink-500 to-fuchsia-500",
    badge: "Pro+",
  },
  {
    icon: BarChart3,
    title: "Deep Analytics",
    description: "See exactly what your customers are asking, how fast Clara responds, and where your knowledge base has gaps. Turn every query into a product insight.",
    bullets: ["30-day query charts", "Top query analysis", "Latency tracking", "Per-KB breakdown"],
    color: "from-amber-500 to-yellow-500",
    badge: "Starter+",
  },
  {
    icon: Key,
    title: "API Access & Embed",
    description: "Generate API keys with per-origin restrictions and rate limits. Embed Clara on any website with a single iFrame snippet or JavaScript loader.",
    bullets: ["API key management", "CORS origin allowlisting", "Rate limiting per key", "Embed snippet generator"],
    color: "from-blue-500 to-cyan-500",
    badge: "Starter+",
  },
  {
    icon: Building2,
    title: "Multi-Tenant Architecture",
    description: "One Clara deployment serves unlimited organisations, each with completely isolated data, their own knowledge bases, users, branding, and subscription tier.",
    bullets: ["Full data isolation", "Per-org Qdrant namespace", "Role-based access control", "Org-level audit logs"],
    color: "from-slate-400 to-slate-600",
    badge: "All Plans",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Production-grade security built in from day one. JWT authentication, bcrypt password hashing, parameterised queries, MIME validation, and CORS protection.",
    bullets: ["JWT + httpOnly cookies", "bcrypt password hashing", "SQL injection prevention", "File type validation"],
    color: "from-red-500 to-rose-600",
    badge: "All Plans",
  },
  {
    icon: Zap,
    title: "Streaming Responses",
    description: "Chat responses stream token-by-token via NDJSON so users see text appearing immediately — not waiting for the full answer to generate.",
    bullets: ["NDJSON token streaming", "< 300ms first token", "Graceful error recovery", "Connection keep-alive"],
    color: "from-yellow-400 to-amber-500",
    badge: "All Plans",
  },
  {
    icon: Lock,
    title: "SSO / SAML",
    description: "Enterprise customers can integrate their existing identity providers — Azure AD, Okta, Google Workspace — for seamless single sign-on.",
    bullets: ["SAML 2.0 support", "Azure AD / Okta", "Google Workspace", "Just-in-time provisioning"],
    color: "from-violet-600 to-purple-700",
    badge: "Enterprise",
  },
  {
    icon: RefreshCw,
    title: "Automatic Re-Indexing",
    description: "When you update a document, Clara automatically detects the change, re-processes the updated content, and updates the vector index without any manual steps.",
    bullets: ["Change detection", "Background processing", "Zero downtime updates", "Processing status tracking"],
    color: "from-teal-500 to-emerald-600",
    badge: "All Plans",
  },
];

const COMPARISON = [
  { feature: "Knowledge Bases", free: "1", starter: "3", pro: "10", enterprise: "∞" },
  { feature: "Documents per KB", free: "10", starter: "50", pro: "200", enterprise: "∞" },
  { feature: "Requests / day", free: "100", starter: "1,000", pro: "10,000", enterprise: "∞" },
  { feature: "Voice AI", free: false, starter: true, pro: true, enterprise: true },
  { feature: "API Access", free: false, starter: true, pro: true, enterprise: true },
  { feature: "Custom Branding", free: false, starter: false, pro: true, enterprise: true },
  { feature: "Advanced Analytics", free: false, starter: false, pro: true, enterprise: true },
  { feature: "SSO / SAML", free: false, starter: false, pro: false, enterprise: true },
  { feature: "SLA Guarantee", free: false, starter: false, pro: false, enterprise: true },
  { feature: "Priority Support", free: false, starter: false, pro: true, enterprise: true },
];

export default function FeaturesPage() {
  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative pt-24 pb-12 px-4 sm:pb-16 sm:px-6 text-center">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-10 left-1/3 w-80 h-80 bg-indigo-600/15 rounded-full blur-[100px]" />
          <div className="absolute top-20 right-1/3 w-64 h-64 bg-violet-600/10 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-6">
            <Brain className="w-3.5 h-3.5" />
            <span>Built for production — not demos</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white mb-5 leading-tight">
            Everything you need<br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              to deploy AI knowledge
            </span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            Clara handles the infrastructure — embeddings, vector search, streaming, voice, analytics.
            You focus on uploading your knowledge.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/pricing"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl transition-all hover:scale-105">
              View pricing <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href="#comparison"
              className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 font-medium px-6 py-3 rounded-xl transition-all">
              Compare plans
            </Link>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-white mb-3">Core capabilities</h2>
            <p className="text-white/50">Everything ships out of the box. Nothing to build from scratch.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title}
                className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 hover:bg-white/[0.06] transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center group-hover:scale-110 transition-transform shrink-0`}>
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs text-white/30 border border-white/10 px-2 py-0.5 rounded-full">{f.badge}</span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed mb-4">{f.description}</p>
                <ul className="space-y-1.5">
                  {f.bullets.map(b => (
                    <li key={b} className="flex items-center gap-2 text-xs text-white/40">
                      <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />{b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan comparison table */}
      <section id="comparison" className="py-12 sm:py-20 px-4 sm:px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-3">Feature comparison</h2>
            <p className="text-white/50">See exactly what each plan includes</p>
          </div>
          {/* Comparison matrix — horizontally scrollable on phones */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
            <p className="md:hidden px-4 py-2.5 text-[11px] text-white/35 border-b border-white/[0.06]">
              Swipe to compare plans →
            </p>
            <div className="overflow-x-auto overscroll-contain-x">
              <div className="min-w-[680px] sm:min-w-[720px]">
                <div className="grid grid-cols-5 border-b border-white/[0.08]">
                  <div className="px-5 py-4 text-sm font-medium text-white/40">Feature</div>
                  {["Free", "Starter", "Pro", "Enterprise"].map((p, i) => (
                    <div key={p} className={`px-5 py-4 text-center ${i === 2 ? "bg-indigo-600/10" : ""}`}>
                      <div className="text-sm font-bold text-white">{p}</div>
                    </div>
                  ))}
                </div>
                {COMPARISON.map((row, i) => (
                  <div key={row.feature} className={`grid grid-cols-5 border-b border-white/[0.04] last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                    <div className="px-5 py-3.5 text-sm text-white/70">{row.feature}</div>
                    {(["free", "starter", "pro", "enterprise"] as const).map((plan, j) => (
                      <div key={plan} className={`px-5 py-3.5 text-center ${j === 2 ? "bg-indigo-600/5" : ""}`}>
                        {typeof row[plan] === "boolean" ? (
                          row[plan]
                            ? <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                            : <div className="w-4 h-0.5 bg-white/10 mx-auto" />
                        ) : (
                          <span className="text-sm font-medium text-white/70">{row[plan]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="text-center mt-8">
            <Link href="/pricing"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-all hover:scale-105">
              See pricing & get started <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
