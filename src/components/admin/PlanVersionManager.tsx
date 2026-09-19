"use client";

import { useEffect, useState } from "react";
import { Check, Edit3, Plus, Send, X } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";

type Plan = {
  id: string;
  name: string;
  description: string;
  price_usd: number;
  max_kbs: number;
  max_docs_per_kb: number;
  max_req_day: number;
  max_storage_mb: number;
  voice_enabled: boolean;
  api_access: boolean;
  custom_branding: boolean;
  sso_enabled: boolean;
  analytics_level: string;
  priority_support: boolean;
  features: string[];
  published_version_id?: string;
  published_version?: number;
  version_count?: number;
};

type Draft = {
  planId: string;
  name: string;
  description: string;
  priceUsd: string;
  maxKbs: string;
  maxDocsPerKb: string;
  maxReqDay: string;
  maxStorageMb: string;
};

export function PlanVersionManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/subscription-plans"), { headers: withAuthHeaders() });
      const data = await res.json() as { plans?: Plan[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load plan versions");
      setPlans(data.plans ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startEdit(plan: Plan) {
    setError(null);
    setMessage(null);
    setDraft({
      planId: plan.id,
      name: plan.name,
      description: plan.description,
      priceUsd: String(plan.price_usd),
      maxKbs: String(plan.max_kbs),
      maxDocsPerKb: String(plan.max_docs_per_kb),
      maxReqDay: String(plan.max_req_day),
      maxStorageMb: String(plan.max_storage_mb),
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const res = await fetch(apiUrl("/api/platform/subscription-plans"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          planId: draft.planId,
          name: draft.name.trim(),
          description: draft.description.trim(),
          priceUsd: Number(draft.priceUsd),
          maxKbs: Number(draft.maxKbs),
          maxDocsPerKb: Number(draft.maxDocsPerKb),
          maxReqDay: Number(draft.maxReqDay),
          maxStorageMb: Number(draft.maxStorageMb),
        }),
      });
      const data = await res.json() as { version?: { version?: number }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save draft");
      setMessage(`${draft.name} draft v${data.version?.version ?? ""} saved. Existing subscriptions are unchanged.`);
      setDraft(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function publish(plan: Plan) {
    if (!plan.published_version_id) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const res = await fetch(apiUrl("/api/platform/subscription-plans"), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ versionId: plan.published_version_id, action: "publish" }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to publish plan");
      setMessage(`${plan.name} version published for future subscriptions.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-border bg-card rounded-2xl p-5 space-y-4 shadow-sm">
      <div>
        <h2 className="font-semibold text-foreground">Plan Versions</h2>
        <p className="text-xs text-muted-foreground/70 mt-1">Editions are versioned. Publishing changes future subscriptions; existing customers keep their assigned version.</p>
      </div>
      {message && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">{message}</div>}
      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      {loading ? <div className="h-24 rounded-xl bg-muted animate-pulse" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map(plan => (
            <div key={plan.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{plan.price_usd < 0 ? "Custom" : `$${plan.price_usd}/mo`} · published v{plan.published_version ?? 1}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/70">{plan.version_count ?? 1} versions</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>{plan.max_kbs === -1 ? "Unlimited" : plan.max_kbs} KBs</span>
                <span>{plan.max_req_day === -1 ? "Unlimited" : plan.max_req_day.toLocaleString()} req/day</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(plan)} disabled={saving}>
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit draft
                </Button>
                <Button size="sm" onClick={() => void publish(plan)} disabled={saving || !plan.published_version_id}>
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Publish
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {draft && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Draft: {draft.name}</h3><button onClick={() => setDraft(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["name","description","priceUsd","maxKbs","maxDocsPerKb","maxReqDay","maxStorageMb"] as const).map(field => (
              <label key={field} className="text-xs text-muted-foreground">
                {field}
                <input value={draft[field]} onChange={e => setDraft({ ...draft, [field]: e.target.value })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
              </label>
            ))}
          </div>
          <div className="flex gap-2"><Button size="sm" onClick={() => void saveDraft()} disabled={saving || !draft.name.trim()}><Check className="w-3.5 h-3.5 mr-1.5" /> Save draft</Button><Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button></div>
        </div>
      )}
      {!plans.length && !loading && <Button size="sm" variant="outline" onClick={() => void load()}><Plus className="w-3.5 h-3.5 mr-1.5" /> Load plans</Button>}
    </section>
  );
}
