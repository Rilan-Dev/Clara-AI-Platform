"use client";
import { Brain, Zap, Globe, Shield, MessageSquare, Star, ArrowRight, Cpu } from "lucide-react";

export default function DemoWebsite() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-white/[0.06] backdrop-blur-xl bg-[#0a0e1a]/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">TechVision</span>
          </div>
          <div className="hidden md:flex items-center gap-7 text-sm text-white/50">
            <a href="#" className="hover:text-white transition-colors">Products</a>
            <a href="#" className="hover:text-white transition-colors">Docs</a>
            <a href="#" className="hover:text-white transition-colors">Pricing</a>
            <a href="#" className="hover:text-white transition-colors">Company</a>
          </div>
          <button className="bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-20 px-6 text-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/3 w-80 h-80 bg-sky-600/15 rounded-full blur-[100px]" />
          <div className="absolute top-20 right-1/4 w-60 h-60 bg-blue-600/10 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 border border-sky-500/20 bg-sky-500/5 rounded-full px-4 py-1.5 text-xs text-sky-300 mb-8">
            <Zap className="w-3 h-3" /> Version 3.0 is now available
          </div>
          <h1 className="text-5xl md:text-6xl font-black leading-tight mb-5">
            The developer platform<br />
            <span className="bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">
              built for scale
            </span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
            Ship faster with TechVision&apos;s unified API platform. Scalable infrastructure, real-time observability, and developer-first tooling.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-7 py-3.5 rounded-xl text-base transition-all hover:scale-105">
              Start building free <ArrowRight className="w-4 h-4" />
            </button>
            <button className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/80 font-semibold px-7 py-3.5 rounded-xl text-base transition-all">
              View documentation
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-6 border-y border-white/[0.05]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[["99.99%","Uptime SLA"],["< 50ms","API latency"],["10B+","API calls/month"],["40,000+","Developers"]].map(([v,l])=>(
            <div key={l}><div className="text-3xl font-black bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent mb-1">{v}</div><div className="text-xs text-white/40">{l}</div></div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black text-white mb-3">Everything you need to build</h2>
            <p className="text-white/40 max-w-xl mx-auto">One platform for APIs, observability, auth, and AI integrations.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon:Zap,     title:"Real-time APIs",      desc:"Sub-50ms latency globally. WebSocket support for live data.", color:"from-sky-500 to-blue-500" },
              { icon:Shield,  title:"Enterprise Security", desc:"OAuth 2.0, SAML SSO, IP allowlisting, audit logs.", color:"from-indigo-500 to-violet-500" },
              { icon:Globe,   title:"Edge Distribution",   desc:"200+ PoPs worldwide. Auto-scaling with zero config.", color:"from-emerald-500 to-teal-500" },
              { icon:Brain,   title:"AI Integration",      desc:"Built-in LLM routing, embeddings, and RAG pipelines.", color:"from-pink-500 to-rose-500" },
              { icon:Cpu,     title:"Developer SDK",       desc:"TypeScript-first SDK with full type safety and auto-complete.", color:"from-amber-500 to-orange-500" },
              { icon:MessageSquare, title:"24/7 Support",  desc:"Engineering team support with P0 SLA under 15 minutes.", color:"from-violet-500 to-purple-500" },
            ].map(f => (
              <div key={f.title} className="border border-white/[0.07] bg-white/[0.02] rounded-2xl p-6 hover:bg-white/[0.05] transition-all group">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-black text-white text-center mb-12">Loved by engineering teams</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name:"Yuki Tanaka", role:"CTO @ NovaPay", text:"Migrated our entire payment processing to TechVision in a weekend. The API docs are genuinely the best I've seen." },
              { name:"Amir Hassan", role:"Lead Eng @ Orbit", text:"TechVision's observability tools caught a latency regression before our users even noticed. Incredible." },
              { name:"Sofia Reyes", role:"Head of Dev @ Forma", text:"The SDK is so well-typed it feels like TechVision wrote our codebase with us. 10/10." },
            ].map(t => (
              <div key={t.name} className="border border-white/[0.07] bg-white/[0.02] rounded-2xl p-6">
                <div className="flex mb-3">{[...Array(5)].map((_,i)=><Star key={i} className="w-4 h-4 text-amber-400 fill-current"/>)}</div>
                <p className="text-white/65 text-sm mb-4">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500/40 to-blue-600/40 flex items-center justify-center text-xs font-bold text-sky-300">{t.name[0]}</div>
                  <div><div className="text-sm font-semibold text-white">{t.name}</div><div className="text-xs text-white/35">{t.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto border border-white/[0.07] bg-white/[0.02] rounded-3xl p-10">
          <h2 className="text-3xl font-black text-white mb-4">Ready to ship faster?</h2>
          <p className="text-white/45 mb-8">Join 40,000 developers building on TechVision.</p>
          <button className="bg-sky-500 hover:bg-sky-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors">
            Start for free — no credit card
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center"><Cpu className="w-3 h-3 text-white"/></div>
            <span className="font-bold text-white/70 text-sm">TechVision Solutions</span>
          </div>
          <div className="text-xs text-white/25">© 2025 TechVision Solutions · Powered by Clara AI</div>
          <div className="flex gap-5 text-xs text-white/35">
            <a href="#" className="hover:text-white/60 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/60 transition-colors">Terms</a>
            <a href="/dashboard" className="hover:text-white/60 transition-colors">Portal</a>
          </div>
        </div>
      </footer>

      {/* Note about floating button */}
      <div className="fixed bottom-24 right-6 z-30 pointer-events-none">
        <div className="bg-[#0c1929] border border-sky-500/30 rounded-xl px-3 py-2 text-xs text-sky-300 shadow-lg animate-bounce">
          👆 Click the blue button!
        </div>
      </div>
    </div>
  );
}
