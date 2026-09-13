"use client";

/**
 * Agent editor screen — ElevenLabs-style configuration UI.
 * Tabs: Overview · Prompt · Voice · Language · Model · Projects.
 * Edits are collected in a draft and saved with one PATCH; the header shows
 * unsaved-changes state. All copy is written for non-technical users.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Bot, ArrowLeft, Save, Sparkles, MessageSquareText, Mic, Languages, Cpu,
  FolderKanban, Plus, Check, ChevronRight, Info, Trash2, Link2, Unlink,
} from "lucide-react";
import { useAgent } from "@/modules/admin-ui/hooks";
import type { Agent, AgentStatus, UpdateAgentInput } from "@/modules/admin-ui/hooks";
import { assignProjectAgent } from "@/modules/admin-ui/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview",   icon: Sparkles },
  { key: "prompt",   label: "Prompt",     icon: MessageSquareText },
  { key: "voice",    label: "Voice",      icon: Mic },
  { key: "language", label: "Language",   icon: Languages },
  { key: "model",    label: "Model",      icon: Cpu },
  { key: "projects", label: "Projects",   icon: FolderKanban },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];

const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "si", name: "Sinhala" },
  { code: "ta", name: "Tamil" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "tr", name: "Turkish" },
];

const STATUS_OPTIONS: { value: AgentStatus; label: string; hint: string }[] = [
  { value: "draft",     label: "Draft",     hint: "Only your team can see it — safe to experiment" },
  { value: "published", label: "Published", hint: "Ready to use in projects and customer chats" },
  { value: "archived",  label: "Archived",  hint: "Hidden from lists, kept for your records" },
];

const STATUS_STYLES: Record<AgentStatus, { dot: string; label: string; cls: string }> = {
  draft:     { dot: "bg-amber-400",   label: "Draft",     cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  published: { dot: "bg-emerald-400", label: "Published", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  archived:  { dot: "bg-zinc-400",    label: "Archived",  cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" },
};

// ── Small shared pieces ───────────────────────────────────────────────────────

function Field({
  label, hint, children, htmlFor,
}: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/80 mb-1.5" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="text-xs text-white/30 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SectionCard({
  icon: Icon, title, description, children,
}: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 lg:p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2.5 shrink-0">
          <Icon className="w-4 h-4 text-indigo-300" />
        </div>
        <div>
          <h2 className="font-semibold text-white text-[15px]">{title}</h2>
          <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Toggle({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-left hover:border-indigo-500/20 transition-all"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white/80">{label}</p>
        {hint && <p className="text-xs text-white/30 mt-0.5">{hint}</p>}
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-white/10"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

function AgentAvatar({ name }: { name: string }) {
  const initials = (name || "A").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 font-semibold text-white text-sm">
      {initials || <Bot className="w-5 h-5" />}
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AgentEditorScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { agent, loading, error, save, refetch } = useAgent(agentId);

  const [tab, setTab] = useState<TabKey>("overview");
  const [draft, setDraft] = useState<UpdateAgentInput>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Reset the draft whenever a different agent loads
  useEffect(() => {
    setDraft({});
  }, [agentId]);

  function set<K extends keyof UpdateAgentInput>(key: K, value: UpdateAgentInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaveError(null);
  }

  // Current view of a field: draft value if edited, otherwise the loaded value
  const cur = useMemo(() => ({ ...(agent ?? {}), ...draft } as Agent), [agent, draft]);
  const dirty = Object.keys(draft).length > 0;

  async function persist(payload?: UpdateAgentInput) {
    const body = payload ?? draft;
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await save(body);
      setDraft({});
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function quickPublish() {
    const next: AgentStatus = cur.status === "published" ? "draft" : "published";
    await persist({ ...draft, status: next });
  }

  // ── Projects tab helpers ────────────────────────────────────────────────────
  const [assignProjectId, setAssignProjectId] = useState("");
  const [projectBusy, setProjectBusy] = useState<string | null>(null);

  async function handleAssign() {
    if (!assignProjectId || !agent) return;
    setProjectBusy(assignProjectId);
    try {
      await assignProjectAgent(assignProjectId, agent.id);
      setAssignProjectId("");
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProjectBusy(null);
    }
  }

  async function handleDisconnect(projectId: string) {
    setProjectBusy(projectId);
    try {
      await assignProjectAgent(projectId, null);
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProjectBusy(null);
    }
  }

  // ── States ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div className="h-16 rounded-2xl bg-white/[0.03] animate-pulse" />
        <div className="h-11 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-72 rounded-2xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-8 text-center">
          <p className="text-sm text-red-300">{error ?? "Agent not found"}</p>
          <Link href="/agents" className="inline-flex items-center gap-2 mt-4 text-sm text-indigo-300 hover:text-indigo-200">
            <ArrowLeft className="w-4 h-4" /> Back to agents
          </Link>
        </div>
      </div>
    );
  }

  const rules: string[] = Array.isArray(cur.rules) ? cur.rules : [];
  const allowedLanguages: string[] = Array.isArray(cur.allowedLanguages) ? cur.allowedLanguages : ["en"];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 pb-24">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-[#12152a] via-[#0f1224] to-[#0b0d18] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <AgentAvatar name={cur.assistantName || cur.name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-semibold text-white text-lg truncate">{cur.name}</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[cur.status]?.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[cur.status]?.dot}`} />
                  {STATUS_STYLES[cur.status]?.label}
                </span>
              </div>
              <p className="text-sm text-white/40 mt-0.5 truncate">
                Speaks as <span className="text-white/70">{cur.assistantName}</span>
                {agent.orgName ? ` · ${agent.orgName}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/agents"
              className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/80 transition-colors px-2"
            >
              <ArrowLeft className="w-4 h-4" /> Agents
            </Link>
            {cur.status !== "archived" && (
              <Button
                variant="outline"
                onClick={quickPublish}
                disabled={saving}
                className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
              >
                {cur.status === "published" ? "Back to draft" : "Publish"}
              </Button>
            )}
            <Button
              onClick={() => persist()}
              disabled={!dirty || saving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Status line */}
        <div className="mt-4 h-5 text-xs">
          {saveError ? (
            <span className="text-red-400">{saveError}</span>
          ) : saving ? (
            <span className="text-white/40">Saving your changes...</span>
          ) : dirty ? (
            <span className="text-amber-300/90">You have unsaved changes</span>
          ) : savedAt ? (
            <span className="text-emerald-300/80">All changes saved at {savedAt}</span>
          ) : (
            <span className="text-white/25">Changes are saved when you press Save</span>
          )}
        </div>
      </div>

      {/* ── Tabs (desktop) / pills (mobile) ───────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-1.5">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Agent configuration sections">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-all ${
                  active
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-white/40 hover:text-white/80 border border-transparent"
                }`}
              >
                <t.icon className="w-4 h-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}

      {tab === "overview" && (
        <SectionCard
          icon={Sparkles}
          title="The basics"
          description="Who this agent is, what it is called, and where you can use it."
        >
          <Field label="Agent name" htmlFor="f-name" hint="Only you and your team see this name.">
            <Input id="f-name" value={cur.name ?? ""} onChange={(e) => set("name", e.target.value)} className="bg-white/[0.03] border-white/[0.08]" />
          </Field>
          <Field label="What is this agent for?" htmlFor="f-desc" hint="A short note to help you remember its purpose, e.g. 'Answers insurance policy questions'.">
            <Textarea id="f-desc" value={cur.description ?? ""} onChange={(e) => set("description", e.target.value)} className="bg-white/[0.03] border-white/[0.08] min-h-[70px] resize-none" />
          </Field>
          <Field label="Assistant name" htmlFor="f-assistant" hint="The name customers see in the chat — this is how the agent introduces itself.">
            <Input id="f-assistant" value={cur.assistantName ?? ""} onChange={(e) => set("assistantName", e.target.value)} className="bg-white/[0.03] border-white/[0.08]" />
          </Field>
          <Field label="Avatar link (optional)" htmlFor="f-avatar" hint="A web address (URL) of a picture shown in the chat header. Leave empty to use the default look.">
            <Input id="f-avatar" value={cur.avatarUrl ?? ""} onChange={(e) => set("avatarUrl", e.target.value)} placeholder="https://example.com/logo.png" className="bg-white/[0.03] border-white/[0.08]" />
          </Field>
          <Field label="Status" htmlFor="f-status" hint="Control who can use this agent right now.">
            <select
              id="f-status"
              value={cur.status ?? "draft"}
              onChange={(e) => set("status", e.target.value as AgentStatus)}
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value} className="bg-[#0d0d1a]">{s.label} — {s.hint}</option>
              ))}
            </select>
          </Field>
        </SectionCard>
      )}

      {tab === "prompt" && (
        <SectionCard
          icon={MessageSquareText}
          title="How your agent talks"
          description="Set its personality, its opening line, and what it says when it doesn't know an answer."
        >
          <Field
            label="Personality & instructions"
            htmlFor="f-prompt"
            hint="Describe how the agent should behave — its tone, what it should help with, and anything it should avoid. Example: 'You are a warm, professional insurance guide. Explain policies in simple words and always suggest booking a call for complex claims.'"
          >
            <Textarea
              id="f-prompt"
              value={cur.systemPrompt ?? ""}
              onChange={(e) => set("systemPrompt", e.target.value)}
              className="bg-white/[0.03] border-white/[0.08] min-h-[140px] font-mono text-[13px] leading-relaxed"
            />
          </Field>
          <Field
            label="First message"
            htmlFor="f-welcome"
            hint="The very first message customers see when the chat opens. Keep it friendly and short."
          >
            <Textarea
              id="f-welcome"
              value={cur.welcomeMessage ?? ""}
              onChange={(e) => set("welcomeMessage", e.target.value)}
              className="bg-white/[0.03] border-white/[0.08] min-h-[70px] resize-none"
            />
          </Field>
          <Field
            label="Reply when something is off-topic"
            htmlFor="f-oos"
            hint="What the agent says when asked about something it has no knowledge of. Example: 'I'm sorry, I can only help with our insurance plans.'"
          >
            <Input
              id="f-oos"
              value={cur.outOfScopeReply ?? ""}
              onChange={(e) => set("outOfScopeReply", e.target.value)}
              className="bg-white/[0.03] border-white/[0.08]"
            />
          </Field>

          {/* Rules editor */}
          <div>
            <p className="text-sm font-medium text-white/80 mb-1.5">Extra rules (optional)</p>
            <p className="text-xs text-white/30 mb-3 leading-relaxed">
              Things the agent must always do. Example: &apos;Always mention our 24/7 support hotline.&apos;
            </p>
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-medium text-indigo-300">
                    {i + 1}
                  </span>
                  <Input
                    value={rule}
                    onChange={(e) => {
                      const next = [...rules];
                      next[i] = e.target.value;
                      set("rules", next);
                    }}
                    placeholder="A rule the agent always follows"
                    className="bg-white/[0.03] border-white/[0.08]"
                  />
                  <button
                    onClick={() => set("rules", rules.filter((_, idx) => idx !== i))}
                    className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    aria-label={`Remove rule ${i + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => set("rules", [...rules, ""])}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add a rule
            </button>
          </div>
        </SectionCard>
      )}

      {tab === "voice" && (
        <SectionCard
          icon={Mic}
          title="Voice"
          description="Choose how your agent sounds when it speaks out loud."
        >
          <Field label="Voice provider" htmlFor="f-vp" hint="The company that makes the voice. Leave on 'Use default' to follow your organisation's settings.">
            <select
              id="f-vp"
              value={cur.voiceProvider ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set("voiceProvider", v === "" ? null : (v as "openai" | "gemini"));
                if (v !== "openai") set("voiceId", null);
              }}
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              <option value="" className="bg-[#0d0d1a]">Use organisation default</option>
              <option value="openai" className="bg-[#0d0d1a]">OpenAI voices</option>
              <option value="gemini" className="bg-[#0d0d1a]">Google Gemini voices</option>
            </select>
          </Field>

          <Field
            label="Voice"
            htmlFor="f-voice"
            hint={
              cur.voiceProvider === "openai"
                ? "Pick a ready-made voice. Try a few — each has its own character."
                : cur.voiceProvider === "gemini"
                  ? "Type the Gemini voice name your organisation uses."
                  : "Choose a provider first — or keep the default."
            }
          >
            {cur.voiceProvider === "openai" ? (
              <select
                id="f-voice"
                value={cur.voiceId ?? ""}
                onChange={(e) => set("voiceId", e.target.value || null)}
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              >
                <option value="" className="bg-[#0d0d1a]">Use organisation default</option>
                {OPENAI_VOICES.map((v) => (
                  <option key={v} value={v} className="bg-[#0d0d1a]">{v}</option>
                ))}
              </select>
            ) : (
              <Input
                id="f-voice"
                value={cur.voiceId ?? ""}
                onChange={(e) => set("voiceId", e.target.value || null)}
                disabled={!cur.voiceProvider}
                placeholder={cur.voiceProvider === "gemini" ? "e.g. Kore" : "Pick a provider first"}
                className="bg-white/[0.03] border-white/[0.08]"
              />
            )}
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white/80" htmlFor="f-speed">Speaking speed</label>
              <span className="text-xs text-white/50 tabular-nums">{(cur.speed ?? 1).toFixed(2)}×</span>
            </div>
            <input
              id="f-speed"
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={cur.speed ?? 1}
              onChange={(e) => set("speed", Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[11px] text-white/25 mt-1">
              <span>Slower & clearer</span>
              <span>Normal</span>
              <span>Faster</span>
            </div>
          </div>
        </SectionCard>
      )}

      {tab === "language" && (
        <SectionCard
          icon={Languages}
          title="Languages"
          description="Choose the languages your agent can use with customers."
        >
          <Field label="Main language" htmlFor="f-lang" hint="The language the agent uses by default.">
            <select
              id="f-lang"
              value={cur.defaultLanguage ?? "en"}
              onChange={(e) => set("defaultLanguage", e.target.value)}
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#0d0d1a]">{l.name}</option>
              ))}
            </select>
          </Field>

          <div>
            <p className="text-sm font-medium text-white/80 mb-1.5">All supported languages</p>
            <p className="text-xs text-white/30 mb-3 leading-relaxed">
              Customers can chat in any of these. The agent only answers in languages you switch on here.
            </p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => {
                const on = allowedLanguages.includes(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? allowedLanguages.filter((c) => c !== l.code)
                        : [...allowedLanguages, l.code];
                      set("allowedLanguages", next.length > 0 ? next : allowedLanguages);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                      on
                        ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                        : "text-white/40 border-white/[0.08] hover:text-white/70"
                    }`}
                    aria-pressed={on}
                  >
                    {on && <Check className="w-3 h-3" />}
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Always reply in one language? (optional)" htmlFor="f-always" hint="Force the agent to always answer in this language, even if the customer writes in another.">
            <select
              id="f-always"
              value={cur.alwaysRespondIn ?? ""}
              onChange={(e) => set("alwaysRespondIn", e.target.value || null)}
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              <option value="" className="bg-[#0d0d1a]">No — reply in the customer&apos;s language</option>
              {LANGUAGES.filter((l) => allowedLanguages.includes(l.code)).map((l) => (
                <option key={l.code} value={l.code} className="bg-[#0d0d1a]">Always reply in {l.name}</option>
              ))}
            </select>
          </Field>
        </SectionCard>
      )}

      {tab === "model" && (
        <SectionCard
          icon={Cpu}
          title="How smart and how long"
          description="Fine-tune how the agent thinks and how long its answers are. Defaults are good for most uses."
        >
          <Field
            label="AI model (optional)"
            htmlFor="f-model"
            hint="Leave empty to use your organisation's default model. Only change this if you know which model you need."
          >
            <Input
              id="f-model"
              value={cur.chatModel ?? ""}
              onChange={(e) => set("chatModel", e.target.value || null)}
              placeholder="Organisation default"
              className="bg-white/[0.03] border-white/[0.08]"
            />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white/80" htmlFor="f-temp">Creativity</label>
              <span className="text-xs text-white/50 tabular-nums">{(cur.temperature ?? 0.7).toFixed(2)}</span>
            </div>
            <input
              id="f-temp"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={cur.temperature ?? 0.7}
              onChange={(e) => set("temperature", Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[11px] text-white/25 mt-1">
              <span>Precise & factual</span>
              <span>Balanced</span>
              <span>More varied</span>
            </div>
          </div>

          <Field label="Maximum reply length" htmlFor="f-tokens" hint="The longest a single answer can be, in words. Around 500 suits most chats.">
            <Input
              id="f-tokens"
              type="number"
              min={50}
              max={4000}
              value={cur.maxTokens ?? 500}
              onChange={(e) => set("maxTokens", Math.max(50, Math.min(4000, Number(e.target.value) || 500)))}
              className="bg-white/[0.03] border-white/[0.08]"
            />
          </Field>

          <Toggle
            checked={cur.citeSources ?? true}
            onChange={(v) => set("citeSources", v)}
            label="Show where answers come from"
            hint="Adds small source references like [S1] so customers can trust the answer."
          />
          <Toggle
            checked={cur.strictMode ?? true}
            onChange={(v) => set("strictMode", v)}
            label="Stay strictly on topic"
            hint="The agent only answers using your uploaded documents — it never guesses."
          />
        </SectionCard>
      )}

      {tab === "projects" && (
        <SectionCard
          icon={FolderKanban}
          title="Projects using this agent"
          description="Connect this agent to a project so it powers that project's assistant."
        >
          {/* Active assignments */}
          <div className="space-y-2">
            {agent.projects.filter((p) => p.isActive).length === 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
                <p className="text-sm text-white/40">This agent isn&apos;t connected to any project yet.</p>
                <p className="text-xs text-white/25 mt-1">Pick a project below to put it to work.</p>
              </div>
            )}
            {agent.projects.filter((p) => p.isActive).map((p) => (
              <div
                key={p.projectId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Link2 className="w-4 h-4 text-indigo-300 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.projectName}</p>
                    <p className="text-[11px] text-white/30">
                      Connected {new Date(p.assignedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium px-2 py-0.5 shrink-0">
                    Active
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={projectBusy === p.projectId}
                  onClick={() => handleDisconnect(p.projectId)}
                  className="border-white/[0.1] text-white/60 hover:border-red-500/30 hover:text-red-300"
                >
                  <Unlink className="w-3.5 h-3.5 mr-1" /> Disconnect
                </Button>
              </div>
            ))}
          </div>

          {/* Past assignments */}
          {agent.projects.some((p) => !p.isActive) && (
            <div>
              <p className="text-xs font-medium text-white/50 mb-2">Previously connected</p>
              <div className="space-y-1.5">
                {agent.projects.filter((p) => !p.isActive).map((p) => (
                  <div key={p.projectId} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-2.5 text-sm text-white/40">
                    <ChevronRight className="w-3.5 h-3.5 text-white/20" />
                    {p.projectName}
                    <span className="text-[11px] text-white/25 ml-auto">
                      until {new Date(p.assignedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign control */}
          {agent.orgProjects.length > 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-white/80 mb-1.5">Connect to a project</p>
              <p className="text-xs text-white/30 mb-3">Each project has one agent at a time — connecting a new one replaces the old agent for that project.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={assignProjectId}
                  onChange={(e) => setAssignProjectId(e.target.value)}
                  className="flex-1 rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
                  aria-label="Choose a project"
                >
                  <option value="" className="bg-[#0d0d1a]">Choose a project...</option>
                  {agent.orgProjects
                    .filter((op) => !agent.projects.some((p) => p.isActive && p.projectId === op.id))
                    .map((op) => (
                      <option key={op.id} value={op.id} className="bg-[#0d0d1a]">{op.name}</option>
                    ))}
                </select>
                <Button
                  onClick={handleAssign}
                  disabled={!assignProjectId || projectBusy === assignProjectId}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  {projectBusy === assignProjectId ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
              <Info className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
              <p className="text-xs text-white/40 leading-relaxed">
                This organisation has no projects yet. Create a project first, then connect this agent to it.
              </p>
            </div>
          )}

          {/* Explainer */}
          <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
            <Info className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
            <p className="text-xs text-white/40 leading-relaxed">
              The agent takes effect on the project&apos;s assistant immediately after connecting — its name, voice, languages and instructions become the ones customers experience.
            </p>
          </div>
        </SectionCard>
      )}

      {/* ── Sticky mobile save bar ───────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 inset-x-0 md:hidden z-40 border-t border-white/[0.08] bg-[#0d0d1a]/95 backdrop-blur px-4 py-3 transition-transform ${
          dirty ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <span className="text-xs text-amber-300/90">Unsaved changes</span>
          <Button
            onClick={() => persist()}
            disabled={saving}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
