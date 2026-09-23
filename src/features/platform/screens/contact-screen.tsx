"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail, Building2, Sparkles, CheckCircle, Send, MessageSquare, Phone } from "lucide-react";

const USE_CASES = [
  { icon: Building2, label: "Insurance & Finance",  color: "text-blue-600" },
  { icon: MessageSquare, label: "Legal & Compliance",  color: "text-violet-600" },
  { icon: Sparkles, label: "Product & Engineering", color: "text-cyan-600" },
  { icon: Phone, label: "HR & Internal Tools",    color: "text-emerald-600" },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "", email: "", company: "", useCase: "", message: "", plan: "pro",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  // Honeypot — hidden from people, filled by bots.
  const [website, setWebsite]   = useState("");

  function handleChange(field: string, value: string) {
    setFormData(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "We couldn't send your message. Please try again.");
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-12 sm:py-20">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-14">
          <h1 className="text-3xl sm:text-5xl font-black text-foreground mb-4">
            Get in <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">touch</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Ready to deploy AI knowledge for your organisation? Let&apos;s talk.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left — info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact options */}
            <div className="border border-border bg-card rounded-2xl p-4 sm:p-6">
              <h3 className="font-semibold text-foreground mb-4">Contact us</h3>
              <div className="space-y-4">
                <a href="mailto:sales@clara.ai" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Sales</div>
                    <div className="text-sm text-foreground group-hover:text-primary transition-colors">sales@clara.ai</div>
                  </div>
                </a>
                <a href="mailto:support@clara.ai" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-cyan-600/10 border border-cyan-500/30 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Support</div>
                    <div className="text-sm text-foreground group-hover:text-cyan-600 transition-colors">support@clara.ai</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Use cases */}
            <div className="border border-border bg-card rounded-2xl p-4 sm:p-6">
              <h3 className="font-semibold text-foreground mb-4">Popular use cases</h3>
              <div className="space-y-3">
                {USE_CASES.map(u => (
                  <div key={u.label} className="flex items-center gap-3">
                    <u.icon className={`w-4 h-4 ${u.color} shrink-0`} />
                    <span className="text-sm text-muted-foreground">{u.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Guarantees */}
            <div className="border border-border bg-card rounded-2xl p-4 sm:p-6">
              <h3 className="font-semibold text-foreground mb-4">What to expect</h3>
              <ul className="space-y-3">
                {[
                  "Response within 24 hours",
                  "Start on the Free plan anytime",
                  "No credit card required for Free",
                  "Onboarding call included",
                ].map(g => (
                  <li key={g} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />{g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3">
            <div className="border border-border bg-card rounded-2xl p-4 sm:p-8">
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">Message received!</h3>
                  <p className="text-muted-foreground text-sm mb-6">We&apos;ll get back to you within 24 hours.</p>
                  <Link href="/pricing"
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 py-3 rounded-xl text-sm transition-all">
                    Explore pricing plans
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <h3 className="text-lg font-bold text-foreground mb-1">Request a demo</h3>
                  <p className="text-muted-foreground text-sm mb-6">Tell us about your use case and we&apos;ll set up a live walkthrough.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contact-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Your name *</label>
                      <input id="contact-name" required type="text" autoComplete="name" value={formData.name} onChange={e => handleChange("name", e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary transition-colors" />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Work email *</label>
                      <input id="contact-email" required type="email" autoComplete="email" value={formData.email} onChange={e => handleChange("email", e.target.value)}
                        placeholder="jane@company.com"
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-company" className="block text-xs font-medium text-muted-foreground mb-1.5">Company *</label>
                    <input id="contact-company" required type="text" autoComplete="organization" value={formData.company} onChange={e => handleChange("company", e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary transition-colors" />
                  </div>

                  <div>
                    <label htmlFor="contact-plan" className="block text-xs font-medium text-muted-foreground mb-1.5">Interested plan</label>
                    <select id="contact-plan" value={formData.plan} onChange={e => handleChange("plan", e.target.value)}
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary transition-colors">
                      <option value="starter">Starter — $49/mo</option>
                      <option value="pro">Pro — $149/mo</option>
                      <option value="enterprise">Enterprise — Custom</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="block text-xs font-medium text-muted-foreground mb-1.5">Use case / message</label>
                    <textarea id="contact-message" rows={4} value={formData.message} onChange={e => handleChange("message", e.target.value)}
                      placeholder="Tell us what kind of documents you want to make searchable and what your team would use the AI for…"
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary transition-colors resize-none" />
                  </div>

                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Website</label>
                    <input id="contact-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
                  </div>

                  {error && (
                    <div role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      {error} You can also email <a href="mailto:sales@clara.ai" className="underline">sales@clara.ai</a>.
                    </div>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold py-3 rounded-xl text-sm transition-all">
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
