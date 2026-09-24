"use client";
import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { apiUrl } from "@/lib/runtime";

type Plan = {
  id: string; name: string; description: string;
  price_usd: number; features: string[];
  max_kbs: number; max_docs_per_kb: number; max_req_day: number;
  voice_enabled: boolean; api_access: boolean; custom_branding: boolean;
  sso_enabled: boolean; priority_support: boolean;
};

const PLAN_COLOURS: Record<string, string> = {
  free:       "border-border bg-card",
  starter:    "border-cyan-500/30 bg-card",
  pro:        "border-primary/50 bg-primary/5",
  enterprise: "border-amber-500/30 bg-card",
};

function ctaHref(plan: Plan): string {
  if (plan.price_usd === -1) return "/contact";
  return `/signup?plan=${plan.id}`;
}

function ctaLabel(plan: Plan): string {
  if (plan.price_usd === -1) return "Contact sales";
  if (plan.price_usd === 0)  return "Start free";
  return "Get started";
}

export default function PricingPage() {
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  // Checkout only creates monthly prices, so the page shows monthly prices
  // only — no discount the customer cannot actually be charged.
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(apiUrl("/api/subscriptions/plans"))
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ plans?: Plan[] }>;
      })
      .then(d => setPlans(d.plans ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const price = (p: Plan) => {
    if (p.price_usd === -1) return "Custom";
    if (p.price_usd === 0)  return "Free";
    return `$${p.price_usd}/mo`;
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 py-12 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-5xl font-black text-foreground mb-3 sm:mb-4">
            Simple, transparent <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">pricing</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mb-8">Start free, scale as you grow. No hidden fees.</p>
          <p className="text-sm text-muted-foreground">
            Billed monthly · cancel anytime · need annual invoicing?{" "}
            <Link href="/contact" className="text-primary hover:text-primary/80 underline-offset-4 hover:underline">Talk to sales</Link>
          </p>
        </div>

        {loading ? (
          <div role="status" className="text-center text-muted-foreground">Loading plans…</div>
        ) : error || plans.length === 0 ? (
          <div role="alert" className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
            <p className="font-semibold text-foreground">We couldn&apos;t load our plans right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">Please try again, or contact us for pricing.</p>
            <div className="mt-4 flex justify-center gap-3">
              <button type="button" onClick={load} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Try again
              </button>
              <Link href="/contact" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent">
                Contact sales
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map(plan => (
              <div key={plan.id} className={`relative rounded-2xl p-4 sm:p-6 border flex flex-col ${PLAN_COLOURS[plan.id] ?? "border-border bg-card"}`}>
                {plan.id === "pro" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-4">
                  <div className="text-sm font-semibold text-primary mb-1">{plan.name}</div>
                  <div className="text-3xl font-black text-foreground mb-1">{price(plan)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{plan.description}</div>
                </div>

                <div className="space-y-1 mb-4 border-t border-border pt-4">
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Knowledge Bases</span>
                    <span className="font-semibold text-foreground">{plan.max_kbs === -1 ? "∞" : plan.max_kbs}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Docs per KB</span>
                    <span className="font-semibold text-foreground">{plan.max_docs_per_kb === -1 ? "∞" : plan.max_docs_per_kb}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Requests/day</span>
                    <span className="font-semibold text-foreground">{plan.max_req_day === -1 ? "∞" : plan.max_req_day.toLocaleString()}</span>
                  </div>
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {(plan.features as unknown as string[]).map((f: string) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-foreground/80">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />{f}
                    </li>
                  ))}
                </ul>

                {/* CTA — now wired to /signup?plan=xxx */}
                <Link href={ctaHref(plan)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all text-center block
                    ${plan.id === "pro"
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "border border-border text-foreground/70 hover:text-foreground hover:border-primary/40 hover:bg-accent"}`}>
                  {ctaLabel(plan)}
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* FAQ */}
        <div className="mt-10 sm:mt-20 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-foreground text-center mb-8">Frequently asked questions</h3>
          <div className="space-y-4">
            {[
              ["Can I upgrade or downgrade at any time?", "Yes. Plan changes take effect immediately. If upgrading mid-cycle, we prorate the difference."],
              ["What counts as a request?", "Each chat message (text or voice) sent to any knowledge base counts as one request."],
              ["Is the data isolated between organisations?", "Absolutely. Each organisation has its own Qdrant collection namespace, its own documents, and its own API keys."],
              ["Do you offer a free trial?", "You can start on the Free plan at no cost, or contact us for a trial extension on a paid plan."],
            ].map(([q, a]) => (
              <div key={q} className="border border-border bg-card rounded-xl p-5">
                <div className="font-semibold text-foreground text-sm mb-2">{q}</div>
                <div className="text-muted-foreground text-sm">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
