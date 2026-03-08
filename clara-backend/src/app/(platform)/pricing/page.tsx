"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

type Plan = {
  id: string; name: string; description: string;
  price_usd: number; features: string[];
  max_kbs: number; max_docs_per_kb: number; max_req_day: number;
  voice_enabled: boolean; api_access: boolean; custom_branding: boolean;
  sso_enabled: boolean; priority_support: boolean;
};

const PLAN_COLOURS: Record<string, string> = {
  free:       "border-white/[0.08]",
  starter:    "border-cyan-500/30",
  pro:        "border-indigo-500/50 bg-indigo-600/10",
  enterprise: "border-amber-500/30",
};

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscriptions/plans")
      .then(r => r.json())
      .then(d => { setPlans(d.plans ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const price = (p: Plan) => {
    if (p.price_usd === -1) return "Custom";
    if (p.price_usd === 0)  return "Free";
    const m = billing === "annual" ? Math.round(p.price_usd * 0.8) : p.price_usd;
    return `$${m}/mo`;
  };

  return (
    <div className="min-h-screen px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-white mb-4">
            Simple, transparent <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">pricing</span>
          </h1>
          <p className="text-white/50 text-lg mb-8">Start free, scale as you grow. No hidden fees.</p>
          <div className="inline-flex items-center border border-white/10 bg-white/[0.04] rounded-xl p-1 gap-1">
            {(["monthly", "annual"] as const).map(c => (
              <button key={c} onClick={() => setBilling(c)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${billing === c ? "bg-indigo-600 text-white" : "text-white/50 hover:text-white"}`}>
                {c === "monthly" ? "Monthly" : "Annual (save 20%)"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white/30">Loading plans…</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map(plan => (
              <div key={plan.id} className={`relative rounded-2xl p-6 border flex flex-col ${PLAN_COLOURS[plan.id] ?? "border-white/[0.08]"}`}>
                {plan.id === "pro" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-4">
                  <div className="text-sm font-semibold text-indigo-400 mb-1">{plan.name}</div>
                  <div className="text-3xl font-black text-white mb-1">{price(plan)}</div>
                  {billing === "annual" && plan.price_usd > 0 && (
                    <div className="text-xs text-emerald-400">Billed ${Math.round(plan.price_usd * 0.8 * 12)}/year</div>
                  )}
                  <div className="text-xs text-white/40 mt-1">{plan.description}</div>
                </div>

                {/* Limits */}
                <div className="space-y-1 mb-4 border-t border-white/[0.06] pt-4">
                  <div className="text-xs text-white/50 flex justify-between">
                    <span>Knowledge Bases</span>
                    <span className="font-semibold text-white">{plan.max_kbs === -1 ? "∞" : plan.max_kbs}</span>
                  </div>
                  <div className="text-xs text-white/50 flex justify-between">
                    <span>Docs per KB</span>
                    <span className="font-semibold text-white">{plan.max_docs_per_kb === -1 ? "∞" : plan.max_docs_per_kb}</span>
                  </div>
                  <div className="text-xs text-white/50 flex justify-between">
                    <span>Requests/day</span>
                    <span className="font-semibold text-white">{plan.max_req_day === -1 ? "∞" : plan.max_req_day.toLocaleString()}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-2 flex-1 mb-6">
                  {(plan.features as unknown as string[]).map((f: string) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/70">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />{f}
                    </li>
                  ))}
                </ul>

                <button className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${plan.id === "pro" ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "border border-white/10 text-white/60 hover:border-white/20 hover:text-white"}`}>
                  {plan.price_usd === -1 ? "Contact sales" : plan.price_usd === 0 ? "Start free" : "Get started"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-8">Frequently asked questions</h3>
          <div className="space-y-4">
            {[
              ["Can I upgrade or downgrade at any time?", "Yes. Plan changes take effect immediately. If upgrading mid-cycle, we prorate the difference."],
              ["What counts as a request?", "Each chat message (text or voice) sent to any knowledge base counts as one request."],
              ["Is the data isolated between organisations?", "Absolutely. Each organisation has its own Qdrant collection namespace, its own documents, and its own API keys."],
              ["Do you offer a free trial of Pro?", "Yes — all new orgs get a 14-day Pro trial with full voice and analytics before dropping to Free."],
            ].map(([q, a]) => (
              <div key={q} className="border border-white/[0.08] bg-white/[0.03] rounded-xl p-5">
                <div className="font-semibold text-white text-sm mb-2">{q}</div>
                <div className="text-white/50 text-sm">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
