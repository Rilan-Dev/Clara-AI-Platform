"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Brain, Mic, Shield, Zap, Globe, BarChart3, Check,
  ChevronRight, Star, ArrowRight, Sparkles, FileText,
  MessageSquare, Cpu, Building2
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "RAG-Powered Intelligence", desc: "Upload any document and your AI instantly learns from it with semantic vector search and cited responses.", color: "from-violet-500 to-indigo-500" },
  { icon: Mic, title: "Voice AI Assistant", desc: "Real-time voice conversations via OpenAI Realtime API. Natural, low-latency speech in 40+ languages.", color: "from-cyan-500 to-blue-500" },
  { icon: Shield, title: "Enterprise Security", desc: "Data isolation per tenant. API key auth, rate limiting, CORS protection. Production-ready.", color: "from-emerald-500 to-teal-500" },
  { icon: Globe, title: "Embeddable Anywhere", desc: "Drop a single iFrame on any website. Your branded AI assistant live in 60 seconds.", color: "from-orange-500 to-rose-500" },
  { icon: BarChart3, title: "Deep Analytics", desc: "Track queries, latency, citations, and satisfaction. Data-driven AI decisions.", color: "from-pink-500 to-fuchsia-500" },
  { icon: Zap, title: "Lightning Fast", desc: "Sub-second vector search, streaming responses, edge-optimised delivery.", color: "from-yellow-500 to-amber-500" },
];

const TESTIMONIALS = [
  { name: "Sarah Chen", role: "CTO at Meridian Insurance", text: "Clara AI cut our support volume by 60%. Our policies assistant handles thousands of questions daily.", avatar: "SC" },
  { name: "Marcus Webb", role: "Head of Digital, TechVision", text: "From concept to deployed AI assistant in one afternoon. The embed system is unbelievably simple.", avatar: "MW" },
  { name: "Priya Nair", role: "AI Lead, Global Bank", text: "Multi-language voice capability is extraordinary. We serve customers in 12 languages through one AI.", avatar: "PN" },
];

const STATS = [
  { value: "10M+", label: "Queries answered" },
  { value: "500+", label: "Organizations" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "< 0.3s", label: "Avg latency" },
];

type Plan = {
  id: string; name: string; description: string;
  price_usd: number; features: string[];
  voice_enabled: boolean; api_access: boolean;
};

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    fetch("/api/subscriptions/plans")
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-24 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px]" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-violet-600/15 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Now with real-time voice AI — try free</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.05] mb-6">
            Your knowledge.<br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Supercharged with AI.
            </span>
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-10">
            Deploy a custom AI assistant trained on your documents in minutes. RAG-powered, voice-enabled, embeddable anywhere.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing" className="group inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/25">
              Start free — no card needed
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/features" className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/80 font-semibold px-8 py-4 rounded-xl text-lg transition-all">
              See how it works
            </Link>
          </div>

          {/* Demo chat UI */}
          <div className="mt-20 max-w-3xl mx-auto border border-white/[0.08] bg-white/[0.03] rounded-2xl p-1 shadow-2xl shadow-indigo-500/10">
            <div className="bg-[#0d0d18] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="text-xs text-white/30 ml-2 font-mono">clara — insurance-assistant</span>
              </div>
              <div className="p-6 space-y-4 text-left">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-white/60 shrink-0">U</div>
                  <div className="bg-white/[0.05] rounded-xl px-4 py-3 text-sm text-white/80 max-w-sm">Does my policy cover water damage from burst pipes?</div>
                </div>
                <div className="flex gap-3 justify-end">
                  <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl px-4 py-3 text-sm text-indigo-200 max-w-sm">
                    Yes! Per <span className="text-indigo-300 font-medium">[S1] Section 4.2 — Water Damage</span>, burst pipe damage is covered up to £50,000 under your Platinum plan, subject to the £500 excess.
                    <div className="mt-2 text-xs text-indigo-300/60">📄 Policy-2024-Platinum.pdf · p.12</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs text-white shrink-0">C</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Clara is typing…
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="text-3xl md:text-4xl font-black bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent mb-1">{s.value}</div>
              <div className="text-sm text-white/40">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Everything for <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">production AI</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">No ML expertise required. We handle embeddings, vector search, streaming, and voice.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 hover:bg-white/[0.06] transition-all group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-black text-white mb-4">Up and running in <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">4 steps</span></h2>
          <p className="text-white/50 mb-16">From zero to live AI assistant faster than you think.</p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Building2, label: "Create org", desc: "Sign up and choose a plan" },
              { icon: FileText,   label: "Upload docs", desc: "PDFs, Word, URLs — we process everything" },
              { icon: Cpu,        label: "Configure AI", desc: "Name, persona, voice, colours" },
              { icon: MessageSquare, label: "Deploy", desc: "One line of HTML and you're live" },
            ].map((s, i) => (
              <div key={s.label} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-xl border border-indigo-500/30 bg-indigo-600/10 flex items-center justify-center mb-3">
                  <s.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-xs font-bold text-indigo-400 mb-1">Step {i + 1}</div>
                <div className="font-bold text-white mb-1">{s.label}</div>
                <div className="text-xs text-white/40">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing preview ───────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-black text-white mb-4">Simple <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">pricing</span></h2>
          <p className="text-white/50 mb-10">Start free, scale as you grow.</p>
          {plans.length === 0 ? (
            <div className="text-white/30 text-sm">Loading plans…</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map(plan => (
                <div key={plan.id} className={`rounded-2xl p-5 border text-left flex flex-col ${plan.id === "pro" ? "border-indigo-500/50 bg-indigo-600/10" : "border-white/[0.08] bg-white/[0.03]"}`}>
                  {plan.id === "pro" && <div className="text-xs font-bold text-indigo-400 mb-2">MOST POPULAR</div>}
                  <div className="text-sm font-bold text-indigo-400 mb-1">{plan.name}</div>
                  <div className="text-2xl font-black text-white mb-3">
                    {plan.price_usd === -1 ? "Custom" : plan.price_usd === 0 ? "Free" : `$${plan.price_usd}/mo`}
                  </div>
                  <ul className="space-y-1.5 flex-1 mb-4">
                    {(plan.features as unknown as string[]).slice(0, 4).map((f: string) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-white/60">
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/pricing" className={`text-center py-2 rounded-lg text-xs font-semibold transition-colors ${plan.id === "pro" ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "border border-white/10 text-white/60 hover:text-white hover:border-white/20"}`}>
                    {plan.price_usd === -1 ? "Contact sales" : "Get started"}
                  </Link>
                </div>
              ))}
            </div>
          )}
          <div className="mt-8">
            <Link href="/pricing" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              View full pricing details <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-black text-white text-center mb-12">
            Trusted by <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">forward-thinking teams</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
                <div className="flex mb-3">{[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 text-amber-400 fill-current" />)}</div>
                <p className="text-white/70 text-sm leading-relaxed mb-4">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white">{t.avatar}</div>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-white/40">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center border border-white/[0.08] bg-white/[0.03] rounded-3xl p-12">
          <h2 className="text-4xl font-black text-white mb-4">Ready to build your AI?</h2>
          <p className="text-white/50 mb-8">Join 500+ organisations. Start free, upgrade when you&apos;re ready.</p>
          <Link href="/pricing" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all hover:scale-105">
            Get started for free <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
