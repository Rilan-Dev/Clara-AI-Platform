"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Terminal, Globe, Brain, Mic } from "lucide-react";

const STEPS = [
  {
    id: "quickstart",
    step: "01",
    icon: Terminal,
    title: "Create your account",
    color: "from-indigo-500 to-violet-500",
    body: "Sign up at clara.ai and choose a plan. The Free plan lets you create 1 knowledge base with up to 50 documents — no credit card required.",
    code: null as string | null,
    checklist: [
      "Visit /pricing and click Get Started",
      "Enter your organisation name and email",
      "Verify your email address",
      "Log in to the admin dashboard",
    ],
  },
  {
    id: "kb",
    step: "02",
    icon: Brain,
    title: "Create a knowledge base",
    color: "from-cyan-500 to-blue-500",
    body: "A knowledge base (KB) is a collection of documents your AI will search against. Head to the admin dashboard → Knowledge Bases → New KB.",
    code: `# Or create via API\ncurl -X POST https://your-org.clara.ai/api/kbs \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "Support Docs", "description": "Customer support knowledge"}'`,
    checklist: [
      "Name your KB (e.g. 'Product Docs')",
      "Upload PDFs, Word docs, or paste URLs",
      "Wait for ingestion to complete (green badge)",
      "Test with a sample question in the Sandbox",
    ],
  },
  {
    id: "embed",
    step: "03",
    icon: Globe,
    title: "Embed on your website",
    color: "from-emerald-500 to-teal-500",
    body: "Drop a single <script> tag on any page. Your branded AI chat widget will appear in the bottom-right corner instantly.",
    code: `<!-- Add to your HTML, before </body> -->\n<script\n  src="https://your-org.clara.ai/embed/widget.js"\n  data-org="your-org-slug"\n  data-kb="your-kb-id"\n  data-theme="dark"\n  defer\n></script>`,
    checklist: [
      "Go to Admin → Workspace → Embed",
      "Copy your embed snippet",
      "Paste before </body> on your site",
      "Refresh and see the chat bubble appear",
    ],
  },
  {
    id: "voice",
    step: "04",
    icon: Mic,
    title: "Enable voice AI (optional)",
    color: "from-pink-500 to-fuchsia-500",
    body: "Starter plan and above include real-time voice. Enable it in Admin → Workspace → Settings → Voice. Users click the mic icon to speak naturally.",
    code: `<!-- Add data-voice="true" to your embed tag -->\n<script\n  src="https://your-org.clara.ai/embed/widget.js"\n  data-org="your-org-slug"\n  data-kb="your-kb-id"\n  data-voice="true"\n  defer\n></script>`,
    checklist: [
      "Upgrade to Starter or higher",
      "Enable voice in Workspace Settings",
      'Add data-voice="true" to your embed tag',
      "Test the mic button in your chat widget",
    ],
  },
];

export default function DocsGettingStartedScreen() {
  return (
    <div className="min-h-screen px-6 py-20">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-white/30 mb-10">
          <Link href="/docs" className="hover:text-white/60 transition-colors">Docs</Link>
          <span>/</span>
          <span className="text-white/60">Getting Started</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
          Getting{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Started</span>
        </h1>
        <p className="text-white/50 text-lg mb-14 leading-relaxed">
          Deploy a custom AI assistant trained on your documents in under 10 minutes. No ML expertise needed.
        </p>

        <div className="space-y-12">
          {STEPS.map((s, idx) => (
            <div key={s.id} id={s.id} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-8 scroll-mt-24">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shrink-0`}>
                  <s.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white/30 uppercase tracking-widest mb-0.5">Step {s.step}</div>
                  <h2 className="text-xl font-bold text-white">{s.title}</h2>
                </div>
              </div>
              <p className="text-white/60 leading-relaxed mb-6 text-sm">{s.body}</p>
              {s.code && (
                <pre className="bg-[#0d0d18] border border-white/[0.08] rounded-xl p-5 text-xs text-emerald-300 font-mono overflow-x-auto mb-6 leading-relaxed">
                  <code>{s.code}</code>
                </pre>
              )}
              <ul className="space-y-2">
                {s.checklist.map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-white/60">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              {idx < STEPS.length - 1 && (
                <div className="mt-6 flex justify-end">
                  <a href={`#${STEPS[idx + 1].id}`} className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    Next: {STEPS[idx + 1].title} <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-14 border-t border-white/[0.06] pt-8">
          <Link href="/docs" className="text-sm text-white/40 hover:text-white transition-colors">
            ← Back to Docs
          </Link>
          <Link href="/docs/api-reference" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            API Reference <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
