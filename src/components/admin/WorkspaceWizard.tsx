"use client";
/**
 * src/components/admin/WorkspaceWizard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Guided workspace creation wizard for platform admins.
 * Creates an organisation, admin user, subscription (pinned plan version),
 * agent, knowledge base, and API key in one transactional call — optionally
 * pointing the public landing-page demo at the new workspace.
 *
 *  Phase 1 — Form      Org / admin / plan / agent / KB / API key inputs
 *  Phase 2 — Creating  Submitting state
 *  Phase 3 — Done       Summary with copyable credentials
 */

import { useState } from "react";
import Link from "next/link";
import { Building2, Copy, CheckCircle2, AlertCircle, Sparkles, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateWorkspace } from "@/modules/admin-ui/hooks";
import type { CreateWorkspaceResult } from "@/modules/admin-ui/hooks";

const PLAN_OPTIONS = [
  { id: "free", label: "Free" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "enterprise", label: "Enterprise" },
];

type Phase = "form" | "creating" | "done";

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
        done ? "bg-indigo-500 text-white" : active ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" : "bg-white/[0.06] text-white/30"
      }`}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
    </div>
  );
}

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="space-y-1">
      <span className="text-xs text-white/40">{label}</span>
      <div className="flex items-center gap-2">
        <code className={`flex-1 truncate rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm ${mono ? "font-mono" : ""} text-white/70 select-all`}>
          {value}
        </code>
        <button
          onClick={handleCopy}
          className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors shrink-0"
          title="Copy"
        >
          {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function WorkspaceWizard({ onCreated }: { onCreated?: (result: CreateWorkspaceResult) => void }) {
  const { create, loading } = useCreateWorkspace();
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateWorkspaceResult | null>(null);

  // Form state
  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [planId, setPlanId] = useState("enterprise");
  const [agentName, setProjectName] = useState("Default Agent");
  const [kbName, setKbName] = useState("Default Knowledge Base");
  const [apiKeyName, setApiKeyName] = useState("Default");
  const [markAsDemo, setMarkAsDemo] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canSubmit = orgName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) && adminFullName.trim().length >= 2;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setPhase("creating");
    try {
      const res = await create({
        orgName: orgName.trim(),
        adminEmail: adminEmail.trim(),
        adminFullName: adminFullName.trim(),
        planId,
        agentName: agentName.trim() || undefined,
        kbName: kbName.trim() || undefined,
        apiKeyName: apiKeyName.trim() || undefined,
        markAsDemo,
      });
      setResult(res);
      setPhase("done");
      onCreated?.(res);
    } catch (e) {
      setError((e as Error).message);
      setPhase("form");
    }
  }

  function reset() {
    setPhase("form");
    setResult(null);
    setError(null);
    setOrgName("");
    setAdminEmail("");
    setAdminFullName("");
    setPlanId("enterprise");
    setProjectName("Default Agent");
    setKbName("Default Knowledge Base");
    setApiKeyName("Default");
    setMarkAsDemo(false);
  }

  if (phase === "done" && result) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Workspace created</h2>
            <p className="text-sm text-white/40 mt-0.5">
              {result.org.name} · <span className="font-mono">/{result.org.slug}</span>
              {result.markedAsDemo && <span className="ml-2 text-amber-300">· set as public demo</span>}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <CopyField label="Admin email" value={result.admin.email} mono={false} />
          {result.admin.temporaryPassword && (
            <CopyField label="Temporary admin password" value={result.admin.temporaryPassword} />
          )}
          <CopyField label="Agent" value={result.agent.name} mono={false} />
          <CopyField label="Knowledge base" value={result.kb.name} mono={false} />
          <CopyField label="API key" value={result.apiKey.rawKey} />
          <CopyField label="Plan" value={result.planId} mono={false} />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
          <p className="text-xs text-amber-200/80">
            The API key and temporary password are shown only once — copy them now. The admin should sign in and change their password.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href={`/orgs/${result.org.id}`}>
            <Button size="sm">Open Workspace</Button>
          </Link>
          <Button size="sm" variant="outline" onClick={reset}>
            Create Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
          <Sparkles className="w-5 h-5 text-indigo-300" />
        </div>
        <div>
          <h2 className="font-semibold text-white">New Workspace</h2>
          <p className="text-sm text-white/40 mt-0.5">
            Provisions an organisation, admin user, subscription, agent, knowledge base, and API key in one step.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {phase === "creating" && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3">
          <StepDot active done={false} />
          <span className="text-sm text-white/70">Provisioning workspace — this usually takes a few seconds…</span>
        </div>
      )}

      <fieldset disabled={loading} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Organisation name</label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#12152a]">
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Admin full name</label>
            <input
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Admin email</label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="jane@acme.com"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-indigo-300 hover:text-indigo-200"
        >
          {showAdvanced ? "Hide" : "Show"} advanced options (agent, KB, API key names)
        </button>

        {showAdvanced && (
          <div className="grid gap-4 md:grid-cols-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Agent name</label>
              <input
                value={agentName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Knowledge base name</label>
              <input
                value={kbName}
                onChange={(e) => setKbName(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">API key name</label>
              <input
                value={apiKeyName}
                onChange={(e) => setApiKeyName(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={markAsDemo}
            onChange={(e) => setMarkAsDemo(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.05] text-indigo-500 focus:ring-indigo-500/40"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm text-white/80 font-medium">
              <KeyRound className="w-3.5 h-3.5 text-amber-300" /> Set as public landing-page demo
            </span>
            <span className="block text-xs text-white/40 mt-0.5">
              Points the landing page chat/voice widget at this workspace&rsquo;s knowledge base and API key. Replaces the current demo configuration.
            </span>
          </span>
        </label>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSubmit} disabled={!canSubmit || loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            {loading ? "Creating…" : "Create Workspace"}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
