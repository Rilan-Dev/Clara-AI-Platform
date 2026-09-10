"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail, Building2, Sparkles, CheckCircle, Send, MessageSquare, Phone } from "lucide-react";

const USE_CASES = [
  { icon: Building2, label: "Insurance & Finance",  color: "text-blue-400" },
  { icon: MessageSquare, label: "Legal & Compliance",  color: "text-violet-400" },
  { icon: Sparkles, label: "Product & Engineering", color: "text-cyan-400" },
  { icon: Phone, label: "HR & Internal Tools",    color: "text-emerald-400" },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "", email: "", company: "", useCase: "", message: "", plan: "pro",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);

  function handleChange(field: string, value: string) {
    setFormData(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // In production: POST /api/contact
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen px-6 py-20">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-5xl font-black text-white mb-4">
            Get in <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">touch</span>
          </h1>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Ready to deploy AI knowledge for your organisation? Let&apos;s talk.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left — info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact options */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
              <h3 className="font-semibold text-white mb-4">Contact us</h3>
              <div className="space-y-4">
                <a href="mailto:sales@clara.ai" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Sales</div>
                    <div className="text-sm text-white group-hover:text-indigo-300 transition-colors">sales@clara.ai</div>
                  </div>
                </a>
                <a href="mailto:support@clara.ai" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/20 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Support</div>
                    <div className="text-sm text-white group-hover:text-cyan-300 transition-colors">support@clara.ai</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Use cases */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
              <h3 className="font-semibold text-white mb-4">Popular use cases</h3>
              <div className="space-y-3">
                {USE_CASES.map(u => (
                  <div key={u.label} className="flex items-center gap-3">
                    <u.icon className={`w-4 h-4 ${u.color} shrink-0`} />
                    <span className="text-sm text-white/60">{u.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Guarantees */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
              <h3 className="font-semibold text-white mb-4">What to expect</h3>
              <ul className="space-y-3">
                {[
                  "Response within 24 hours",
                  "Start on the Free plan anytime",
                  "No credit card required for Free",
                  "Onboarding call included",
                ].map(g => (
                  <li key={g} className="flex items-center gap-2 text-sm text-white/60">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />{g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3">
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-8">
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Message received!</h3>
                  <p className="text-white/50 text-sm mb-6">We&apos;ll get back to you within 24 hours.</p>
                  <Link href="/pricing"
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-xl text-sm transition-all">
                    Explore pricing plans
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <h3 className="text-lg font-bold text-white mb-1">Request a demo</h3>
                  <p className="text-white/40 text-sm mb-6">Tell us about your use case and we&apos;ll set up a live walkthrough.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Your name *</label>
                      <input required type="text" value={formData.name} onChange={e => handleChange("name", e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Work email *</label>
                      <input required type="email" value={formData.email} onChange={e => handleChange("email", e.target.value)}
                        placeholder="jane@company.com"
                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Company *</label>
                    <input required type="text" value={formData.company} onChange={e => handleChange("company", e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Interested plan</label>
                    <select value={formData.plan} onChange={e => handleChange("plan", e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors">
                      <option value="starter">Starter — $49/mo</option>
                      <option value="pro">Pro — $149/mo</option>
                      <option value="enterprise">Enterprise — Custom</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Use case / message</label>
                    <textarea rows={4} value={formData.message} onChange={e => handleChange("message", e.target.value)}
                      placeholder="Tell us what kind of documents you want to make searchable and what your team would use the AI for…"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors resize-none" />
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all">
                    {loading ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="w-4 h-4" /> Send message</>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
