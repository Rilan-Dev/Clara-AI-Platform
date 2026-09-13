"use client";
import Link from "next/link";
import {
  BookOpen, Zap, Code2, Package, ArrowRight,
  Terminal, Globe, Brain, Shield, Mic,
} from "lucide-react";

const SECTIONS = [
  {
    icon: Zap,
    color: "from-indigo-500 to-violet-500",
    title: "Getting Started",
    description: "Set up your first Clara AI workspace and deploy an AI assistant in under 10 minutes.",
    href: "/docs/getting-started",
    links: [
      { label: "Quick-start guide", href: "/docs/getting-started#quickstart" },
      { label: "Create your first knowledge base", href: "/docs/getting-started#kb" },
      { label: "Embed the widget", href: "/docs/getting-started#embed" },
      { label: "Enable voice AI", href: "/docs/getting-started#voice" },
    ],
  },
  {
    icon: Code2,
    color: "from-cyan-500 to-blue-500",
    title: "API Reference",
    description: "Full REST API reference. Every endpoint, parameter, and response schema documented.",
    href: "/docs/api-reference",
    links: [
      { label: "Authentication & API keys", href: "/docs/api-reference#auth" },
      { label: "Knowledge Bases", href: "/docs/api-reference#kbs" },
      { label: "Documents & ingestion", href: "/docs/api-reference#docs" },
      { label: "RAG Search & chat", href: "/docs/api-reference#search" },
    ],
  },
  {
    icon: Package,
    color: "from-emerald-500 to-teal-500",
    title: "SDK & Integrations",
    description: "JavaScript SDK, iFrame embed, REST webhooks, and integration guides for popular platforms.",
    href: "/docs/sdk",
    links: [
      { label: "JavaScript / TypeScript SDK", href: "/docs/sdk#js" },
      { label: "iFrame embed reference", href: "/docs/sdk#iframe" },
      { label: "Webhooks & events", href: "/docs/sdk#webhooks" },
      { label: "React component", href: "/docs/sdk#react" },
    ],
  },
];

const POPULAR = [
  { icon: Terminal, label: "curl quick-start", href: "/docs/getting-started#quickstart" },
  { icon: Globe, label: "Embed on your website", href: "/docs/sdk#iframe" },
  { icon: Brain, label: "RAG search endpoint", href: "/docs/api-reference#search" },
  { icon: Shield, label: "Authentication guide", href: "/docs/api-reference#auth" },
  { icon: Mic, label: "Voice AI setup", href: "/docs/getting-started#voice" },
  { icon: Package, label: "JavaScript SDK install", href: "/docs/sdk#js" },
];

export default function DocsScreen() {
  return (
    <div className="min-h-screen px-4 sm:px-6 py-12 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Clara AI Documentation</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white mb-4">
            Everything you need to{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">build with Clara</span>
          </h1>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            Guides, API references, and SDK docs to help you deploy production AI assistants fast.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {SECTIONS.map(sec => (
            <div key={sec.title} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 flex flex-col hover:bg-white/[0.06] transition-all group">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${sec.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <sec.icon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">{sec.title}</h2>
              <p className="text-white/50 text-sm mb-5 leading-relaxed flex-1">{sec.description}</p>
              <ul className="space-y-2 mb-5">
                {sec.links.map(l => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors">
                      <ArrowRight className="w-3 h-3" />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={sec.href} className="mt-auto inline-flex items-center gap-2 border border-white/10 hover:border-white/20 text-white/70 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
                Browse {sec.title} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>

        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-8">
          <h2 className="text-xl font-bold text-white mb-6">Popular pages</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {POPULAR.map(p => (
              <Link key={p.label} href={p.href}
                className="flex items-center gap-3 border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.07] rounded-xl px-4 py-3 text-sm text-white/70 hover:text-white transition-all group">
                <p.icon className="w-4 h-4 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="text-center mt-12 text-white/30 text-sm">
          Something missing?{" "}
          <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Contact our team
          </Link>{" "}
          and we&apos;ll help you out.
        </div>
      </div>
    </div>
  );
}
