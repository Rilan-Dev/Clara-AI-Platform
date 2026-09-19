"use client";

/**
 * DemoWebsiteFrame — the Phase 4 "TechVision Solutions" demo website.
 *
 * Renders a realistic, TechVision-branded fake company landing page (hero,
 * features, testimonials, footer) and injects the REAL deployable embed
 * script (`/embed/clara.js`) exactly the way a customer website would:
 *
 *   <script src="/embed/clara.js" data-key="clr_..." data-position="bottom-right"
 *           data-theme="light" async></script>
 *
 * This demonstrates how any company adds Clara to their public website with
 * minimal effort: visitors then get the floating bottom-right Clara button,
 * streaming chat panel, and the voice popup modal.
 *
 * The API key resolution mirrors the platform landing page:
 *   1. explicit `key` prop (e.g. ?key=clr_… on /embed/landing-demo)
 *   2. fallback to /api/embed/demo-config (platform demo key)
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Check,
  Database,
  Globe2,
  Mic,
  Network,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
 * Static demo content (TechVision Solutions — slate + sky branding)
 * ───────────────────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Network,
    title: "Real-time Knowledge Graph",
    text: "Every document, ticket, and decision connected the moment it happens. Your team's knowledge compounds instead of fragmenting across tools.",
  },
  {
    icon: Database,
    title: "Zero-config RAG",
    text: "Upload PDFs, connect repos, or crawl your docs — retrieval tuning, chunking, and embeddings are handled for you out of the box.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise SSO & Audit",
    text: "SAML/OIDC single sign-on, per- workspace RBAC, and a tamper-evident audit trail your compliance team will actually enjoy reading.",
  },
  {
    icon: Globe2,
    title: "Global Edge Delivery",
    text: "Sub-50ms responses from 28 regions, with automatic failover. Your Sydney and São Paulo offices get the same speed as HQ.",
  },
] as const;

const TESTIMONIALS = [
  {
    name: "Priya Sharma",
    role: "VP Engineering, Northwind Labs",
    quote:
      "We replaced three internal tools with TechVision in one quarter. Onboarding new engineers went from six weeks to nine days.",
    initials: "PS",
  },
  {
    name: "Marcus Chen",
    role: "Head of Product, Fathom",
    quote:
      "The knowledge graph is the first feature in years that our support team asked to have back after a trial ended. That never happens.",
    initials: "MC",
  },
  {
    name: "Ana Ferreira",
    role: "CTO, Lighthouse Health",
    quote:
      "Audit and compliance signed off in a single review session. The assistant answers with sources, which made all the difference.",
    initials: "AF",
  },
] as const;

const SNIPPET_LINES = [
  '<script',
  '  src="https://your-clara-platform.com/embed/clara.js"',
  '  data-key="clr_your_kb_api_key"',
  '  data-position="bottom-right"',
  '  data-theme="light"',
  '  async',
  "></script>",
] as const;

/* ─────────────────────────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────────────────────────── */

export default function DemoWebsiteFrame({ apiKey }: { apiKey: string }) {
  const [key, setKey] = useState(apiKey);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Resolve the embed API key: prop first, platform demo key as fallback.
  useEffect(() => {
    if (apiKey.trim()) {
      setKey(apiKey.trim());
      return;
    }
    let cancelled = false;
    fetch("/api/embed/demo-config", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { key?: string; error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        return data;
      })
      .then((data: { key?: string }) => {
        if (cancelled) return;
        if (data.key?.trim()) setKey(data.key.trim());
        else setKeyError("No embed API key configured. Generate one from a KB Deploy tab.");
      })
      .catch((err: Error) => {
        if (!cancelled) setKeyError(err?.message || "Unable to load the demo embed key.");
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Inject the REAL deployable script exactly like a customer website would.
  // Cleanup removes both the script tag and the widget host element so the
  // demo survives React strict-mode double mounts and route changes.
  useEffect(() => {
    if (!key) return;

    document.querySelector("script[data-clara-demo]")?.remove();
    document.getElementById("clara-widget-host")?.remove();
    document.getElementById("clara-inline-host")?.remove();

    const script = document.createElement("script");
    script.src = "/embed/clara.js";
    script.async = true;
    script.setAttribute("data-key", key);
    script.setAttribute("data-position", "bottom-right");
    script.setAttribute("data-theme", "light");
    script.setAttribute("data-clara-demo", "1");
    document.body.appendChild(script);

    return () => {
      script.remove();
      document.getElementById("clara-widget-host")?.remove();
      document.getElementById("clara-inline-host")?.remove();
    };
  }, [key]);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-sky-500/30">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25">
              <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              TechVision<span className="text-sky-600"> Solutions</span>
            </span>
          </a>
          <div className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#platform" className="transition-colors hover:text-slate-900">Platform</a>
            <a href="#assistant" className="transition-colors hover:text-slate-900">AI Assistant</a>
            <a href="#customers" className="transition-colors hover:text-slate-900">Customers</a>
            <a href="#developers" className="transition-colors hover:text-slate-900">Developers</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="#assistant" className="hidden text-sm text-slate-600 transition-colors hover:text-slate-900 sm:block">Sign in</a>
            <a
              href="#assistant"
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-400 hover:shadow-sky-400/30"
            >
              Start free
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-sky-500/15 blur-[120px]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.08),transparent_60%)]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-1.5 text-xs font-medium text-sky-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Now with a Clara AI assistant — click the button in the corner
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05 }}
              className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl"
            >
              Ship intelligent products{" "}
              <span className="bg-gradient-to-r from-sky-600 to-cyan-500 bg-clip-text text-transparent">faster</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12 }}
              className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600"
            >
              TechVision unifies your product and engineering knowledge into one live platform —
              and puts an AI assistant on top of it that answers with sources, in writing or by voice.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.18 }}
              className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              <a
                href="#assistant"
                className="rounded-xl bg-sky-500 px-7 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-500/30 transition-all hover:scale-[1.02] hover:bg-sky-400"
              >
                Start building free
              </a>
              <a
                href="#assistant"
                className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white/60 px-7 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
              >
                <Bot className="h-4 w-4 text-sky-600" />
                Try the AI assistant
              </a>
            </motion.div>
            <motion.dl
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-6 border-t border-slate-200/80 pt-10"
            >
              {[
                { value: "12,400+", label: "engineering teams" },
                { value: "99.99%", label: "uptime SLA" },
                { value: "4.9/5", label: "average rating" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-2xl font-bold text-slate-900 sm:text-3xl">{stat.value}</dt>
                  <dd className="mt-1 text-xs uppercase tracking-wider text-slate-500">{stat.label}</dd>
                </div>
              ))}
            </motion.dl>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section id="platform" className="border-t border-slate-200/80 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                One platform, your entire knowledge surface
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Everything your teams already know, made searchable, connected, and — with Clara — conversational.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <motion.article
                  key={feature.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45 }}
                  className="group rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-colors hover:border-sky-500/40"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 transition-colors group-hover:bg-sky-500/15">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{feature.text}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* ── AI Assistant / embed snippet ──────────────────────────────── */}
        <section id="assistant" className="relative overflow-hidden border-t border-slate-200/80">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center_right,rgba(14,165,233,0.1),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-1.5 text-xs font-medium text-sky-700">
                <Bot className="h-3.5 w-3.5" />
                Meet Clara — this website&apos;s AI assistant
              </div>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Your visitors get answers, not search results
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                The floating button in the bottom-right corner of this page is a real Clara instance,
                grounded in this company&apos;s knowledge bases. Ask it anything — it streams answers with cited sources.
              </p>
              <ul className="mt-7 space-y-3.5 text-sm text-slate-700">
                {[
                  "Streaming text chat grounded in your indexed documents",
                  "Voice mode — full WebRTC conversations with the same knowledge",
                  "Deployed with a single script tag, themed to your brand",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-600">
                <Mic className="h-4 w-4 shrink-0 text-sky-600" />
                Try it: click the assistant button, then the microphone icon, and just talk.
              </div>
            </div>
            <div id="developers">
              <div className="rounded-2xl border border-border bg-card shadow-lg shadow-sky-500/5 overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-slate-300" />
                    <span className="h-3 w-3 rounded-full bg-slate-300" />
                    <span className="h-3 w-3 rounded-full bg-slate-300" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">index.html</span>
                </div>
                <pre className="overflow-x-auto bg-slate-950 px-5 py-5 text-[13px] leading-relaxed">
                  <code className="font-mono">
                    {SNIPPET_LINES.map((line, index) => (
                      <span key={index} className={
                        line.includes("clara.js")
                          ? "text-sky-300"
                          : line.includes("data-key")
                            ? "text-emerald-300"
                            : "text-slate-400"
                      }>
                        {line}
                        {"\n"}
                      </span>
                    ))}
                  </code>
                </pre>
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">
                That&apos;s the entire integration. Everything else — streaming, sources, voice — is served by the platform.
              </p>
            </div>
          </div>
        </section>

        {/* ── Testimonials ──────────────────────────────────────────────── */}
        <section id="customers" className="border-t border-slate-200/80 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Loved by teams that ship
              </h2>
              <div className="mt-4 flex items-center justify-center gap-1 text-amber-500">
                {[0, 1, 2, 3, 4].map((star) => (
                  <Star key={star} className="h-4 w-4 fill-current" />
                ))}
              </div>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {TESTIMONIALS.map((testimonial) => (
                <motion.figure
                  key={testimonial.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45 }}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
                >
                  <Quote className="h-6 w-6 text-sky-500/50" />
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-700">
                    “{testimonial.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-slate-300 text-xs font-semibold text-sky-700 ring-1 ring-slate-300">
                      {testimonial.initials}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{testimonial.name}</div>
                      <div className="text-xs text-slate-500">{testimonial.role}</div>
                    </div>
                  </figcaption>
                </motion.figure>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className="border-t border-slate-200/80">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Bring your knowledge to life
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-600">
              Free for teams up to 10. No credit card, no sales call — and your AI assistant is one paste away.
            </p>
            <a
              href="#top"
              className="mt-9 inline-block rounded-xl bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-sky-500/30 transition-all hover:scale-[1.02] hover:bg-sky-400"
            >
              Start building free
            </a>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200/80 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-sky-400 to-sky-600">
              <Zap className="h-3 w-3 text-white" strokeWidth={2.5} />
            </span>
            © 2026 TechVision Solutions — a demo company website
          </div>
          <div className="flex items-center gap-5">
            <a href="#platform" className="transition-colors hover:text-slate-700">Platform</a>
            <a href="#assistant" className="transition-colors hover:text-slate-700">AI Assistant</a>
            <a href="#customers" className="transition-colors hover:text-slate-700">Customers</a>
          </div>
        </div>
      </footer>

      {/* ── No-key warning (only when the demo has no usable API key) ────── */}
      {keyError && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-center text-xs text-amber-600 backdrop-blur">
          {keyError}
        </div>
      )}
    </div>
  );
}
