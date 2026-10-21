"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  Brain, Mic, Shield, Zap, Globe, BarChart3, Check,
  ChevronRight, Star, ArrowRight, FileText,
  MessageSquare, Cpu, Building2, Play, ExternalLink,
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

const DemoVoiceSection = lazy(() => import("@/features/platform/components/DemoVoiceSection"));

/* ── Data ─────────────────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: Brain, title: "RAG-Powered Intelligence", desc: "Upload any document and your AI instantly learns from it with semantic vector search and cited responses.", color: "from-violet-500 to-indigo-500", glow: "shadow-violet-500/20" },
  { icon: Mic, title: "Voice AI Assistant", desc: "Real-time voice conversations via OpenAI Realtime API. Natural, low-latency speech in 40+ languages.", color: "from-cyan-500 to-blue-500", glow: "shadow-cyan-500/20" },
  { icon: Shield, title: "Enterprise Security", desc: "Data isolation per tenant. API key auth, rate limiting, CORS protection. Production-ready.", color: "from-emerald-500 to-teal-500", glow: "shadow-emerald-500/20" },
  { icon: Globe, title: "Embeddable Anywhere", desc: "Drop a single iFrame on any website. Your branded AI assistant live in 60 seconds.", color: "from-orange-500 to-rose-500", glow: "shadow-orange-500/20" },
  { icon: BarChart3, title: "Deep Analytics", desc: "Track queries, latency, citations, and satisfaction. Data-driven AI decisions.", color: "from-pink-500 to-fuchsia-500", glow: "shadow-pink-500/20" },
  { icon: Zap, title: "Lightning Fast", desc: "Sub-second vector search, streaming responses, edge-optimised delivery.", color: "from-yellow-500 to-amber-500", glow: "shadow-yellow-500/20" },
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

const STEPS = [
  { icon: Building2, label: "Create org", desc: "Sign up and choose a plan" },
  { icon: FileText, label: "Upload docs", desc: "PDFs, Word, URLs — we process everything" },
  { icon: Cpu, label: "Configure AI", desc: "Name, persona, voice, colours" },
  { icon: MessageSquare, label: "Deploy", desc: "One line of HTML and you're live" },
];

type Plan = { id: string; name: string; description: string; price_usd: number; features: string[]; voice_enabled: boolean; api_access: boolean };

/* ── Animated section wrapper ─────────────────────────────────────────────── */

function Section({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ── Animated counter ─────────────────────────────────────────────────────── */

function AnimatedStat({ value, label }: { value: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    if (!inView) return;
    const numericMatch = value.match(/^([<>]?\s*)(\d+\.?\d*)(.*)/);
    if (!numericMatch) { setDisplayed(value); return; }
    const [, prefix, numStr, suffix] = numericMatch;
    const target = parseFloat(numStr);
    const duration = 1500;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      setDisplayed(`${prefix}${numStr.includes(".") ? current.toFixed(1) : Math.floor(current)}${suffix}`);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, value]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-black bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent mb-2">
        {displayed}
      </div>
      <div className="text-sm text-muted-foreground tracking-wide">{label}</div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const features = usePlatformFeatures();

  useEffect(() => {
    fetch(apiUrl("/api/subscriptions/plans"))
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .catch(() => { });
  }, []);

  return (
    <div className="overflow-x-hidden">
      {/* Cursor-reactive blurred gradient background */}
      {/* <div className="fixed inset-0 z-10 pointer-events-none">
        <InteractiveGradientBackground />
      </div> */}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-12 sm:pt-28 sm:pb-32 px-4 sm:px-6 min-h-[100dvh] flex items-center">
        <div className="relative z-10 w-full min-w-0 max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 glass-premium rounded-full px-4 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm text-primary mb-6 sm:mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse" />
            <span>Now with real-time voice AI<span className="hidden sm:inline"> — try the demo below</span></span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="min-w-0 break-words [overflow-wrap:anywhere] text-[30px] leading-[1.08] sm:text-6xl sm:leading-[1.02] md:text-8xl font-black text-foreground mb-5 sm:mb-8 tracking-tight"
          >
            Your knowledge.
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent animate-gradient text-glow">
              Supercharged with AI.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="min-w-0 break-words [overflow-wrap:anywhere] text-[15px] sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-7 sm:mb-12 leading-relaxed"
          >
            Deploy a custom AI assistant trained on your documents in minutes.
            RAG-powered, voice-enabled, embeddable anywhere.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center"
          >
            <Link href="/signup?plan=free" className="group inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-5 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg transition-all hover:scale-105 hover:shadow-2xl hover:shadow-primary/20 active:scale-[0.98]">
              Start free — no card needed
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/features" className="inline-flex items-center justify-center gap-2 glass-premium hover:bg-accent text-foreground/80 font-semibold px-5 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg transition-all hover:scale-105">
              <Play className="w-4 h-4" />
              See how it works
            </Link>
          </motion.div>

          {/* Demo chat mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="mt-8 sm:mt-20 w-full min-w-0 max-w-3xl mx-auto glass-premium rounded-3xl p-1.5 shadow-2xl shadow-primary/10"
          >
            <div className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-card dark:bg-card/90">
              <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-3.5 border-b border-border sm:px-5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="min-w-0 flex-1 break-words text-xs text-muted-foreground sm:ml-2 font-mono">clara — insurance-assistant</span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                  Connected
                </div>
              </div>
              <div className="min-w-0 max-w-full space-y-4 p-3 text-left sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs text-muted-foreground">U</div>
                  <div className="w-fit min-w-0 max-w-[calc(100%-2.75rem)] break-words [overflow-wrap:anywhere] rounded-2xl rounded-bl-md border border-border bg-muted px-3.5 py-2.5 text-[13px] text-foreground/80 sm:px-4 sm:py-3 sm:text-sm">
                    Does my policy cover water damage from burst pipes?
                  </div>
                </div>
                <div className="flex min-w-0 items-start justify-end gap-3">
                  <div className="w-fit min-w-0 max-w-[calc(100%-2.75rem)] break-words [overflow-wrap:anywhere] rounded-2xl rounded-br-md border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-[13px] text-foreground dark:border-indigo-500/20 dark:bg-indigo-600/15 dark:text-indigo-200/90 sm:px-4 sm:py-3 sm:text-sm">
                    Yes! Per <span className="text-primary dark:text-indigo-300 font-medium">[S1] Section 4.2 — Water Damage</span>, burst pipe damage is covered up to £50,000 under your Platinum plan, subject to the £500 excess.
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 break-words text-xs text-muted-foreground dark:text-indigo-300/50">
                      <FileText className="w-3 h-3" />
                      Policy-2024-Platinum.pdf · p.12
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs text-white shrink-0 shadow-lg shadow-primary/20">C</div>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Clara is typing…
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The landing demo is a widget surface, not the native voice feature. */}
      {features.embeddableWidget && (
        <Suspense fallback={<div className="h-[560px] sm:h-[760px]" />}>
          <div className="z-0">
            <DemoVoiceSection />
          </div>
        </Suspense>
      )}

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <Section className="py-10 sm:py-20 px-4 sm:px-6 border-y border-border relative z-10">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {STATS.map(s => (
            <AnimatedStat key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      </Section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <Section className="py-10 sm:py-28 px-4 sm:px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-foreground mb-3 sm:mb-4">
              Everything for{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
                production AI
              </span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No ML expertise required. We handle embeddings, vector search, streaming, and voice.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.filter((f) => features.embeddableWidget || f.title !== "Embeddable Anywhere").map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -6 }}
                className="glass-card min-w-0 rounded-2xl p-4 sm:p-6 group cursor-default [overflow-wrap:anywhere]"
              >
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 group-hover:shadow-lg ${f.glow} transition-all duration-300`}>
                  <f.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <h3 className="min-w-0 break-words [overflow-wrap:anywhere] text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors">{f.title}</h3>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <Section className="py-10 sm:py-28 px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-black text-foreground mb-3 sm:mb-4">
            Up and running in{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              4 steps
            </span>
          </h2>
          <p className="text-muted-foreground mb-10 sm:mb-16">From zero to live AI assistant faster than you think.</p>

          <div className="grid md:grid-cols-4 gap-6 relative">
            {/* Connection line */}
            <div className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-indigo-500/30" />

            {STEPS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex flex-col items-center text-center relative"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center mb-3 relative z-10 backdrop-blur-sm">
                  <s.icon className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-primary" />
                </div>
                <div className="text-xs font-bold text-primary mb-1">Step {i + 1}</div>
                <div className="font-bold text-foreground mb-1">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <Section className="py-10 sm:py-28 px-4 sm:px-6 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-black text-foreground mb-4">
            Simple{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              pricing
            </span>
          </h2>
          <p className="text-muted-foreground mb-8 sm:mb-12">Start free, scale as you grow.</p>

          {plans.length === 0 ? (
            <div className="text-muted-foreground text-sm flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Loading plans…
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl p-5 text-left flex flex-col transition-all ${plan.id === "pro"
                      ? "glass-premium border-primary/40 shadow-lg shadow-primary/10"
                      : "glass-card"
                    }`}
                >
                  {plan.id === "pro" && (
                    <div className="text-[11px] font-bold text-primary mb-2 uppercase tracking-wider">Most Popular</div>
                  )}
                  <div className="text-sm font-bold text-primary mb-1">{plan.name}</div>
                  <div className="text-3xl font-black text-foreground mb-3">
                    {plan.price_usd === -1 ? "Custom" : plan.price_usd === 0 ? "Free" : `$${plan.price_usd}/mo`}
                  </div>
                  <ul className="space-y-2 flex-1 mb-4">
                    {(plan.features as unknown as string[]).slice(0, 4).map((f: string) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.price_usd === -1 ? "/contact" : `/signup?plan=${plan.id}`}
                    className={`text-center py-2.5 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02] ${plan.id === "pro"
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-primary/20"
                        : "border border-border text-foreground/70 hover:text-foreground hover:border-primary/40 hover:bg-accent"
                      }`}
                  >
                    {plan.price_usd === -1 ? "Contact sales" : "Get started"}
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
          <div className="mt-8">
            <Link href="/pricing" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors group">
              View full pricing details
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <Section className="py-10 sm:py-28 px-4 sm:px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-black text-foreground text-center mb-8 sm:mb-12">
            Trusted by{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              forward-thinking teams
            </span>
          </h2>
          <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card rounded-2xl p-4 sm:p-6"
              >
                <div className="flex mb-3">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-500 dark:text-amber-400 fill-current" />
                  ))}
                </div>
                <p className="text-foreground/70 text-sm leading-relaxed mb-5">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-primary/20">{t.avatar}</div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <Section className="py-10 sm:py-28 px-4 sm:px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center glass-premium rounded-3xl p-6 sm:p-14 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10 pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-foreground mb-3 sm:mb-4">Ready to build your AI?</h2>
            <p className="text-muted-foreground mb-6 sm:mb-8 text-[15px] sm:text-lg">Join 500+ organisations. Start free, upgrade when you&apos;re ready.</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Link href="/signup?plan=free" className="group inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-5 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg transition-all hover:scale-105 hover:shadow-2xl hover:shadow-primary/20">
                Get started for free
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/contact" className="inline-flex items-center justify-center gap-2 glass-premium hover:bg-accent text-foreground/70 font-semibold px-5 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg transition-all">
                <ExternalLink className="w-4 h-4" />
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Demo Assistant FAB ──────────────────────────────────────────── */}
      <Suspense fallback={null}>
      </Suspense>
    </div>
  );
}