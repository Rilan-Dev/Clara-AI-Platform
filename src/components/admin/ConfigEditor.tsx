"use client";
/**
 * ConfigEditor — full assistant configuration editor with live preview
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { SystemPromptPreview } from "./SystemPromptPreview";
import { SUPPORTED_LANGUAGES } from "@/modules/assistant/core/config";
import type { AssistantConfig } from "@/modules/admin-ui/api";

type OpenAIVoice = { id: string; label: string; description: string; realtime: boolean };
type OpenAIModel = { id: string; object?: string; created?: number; owned_by?: string };
type OpenAICatalog = {
  realtimeModels: OpenAIModel[];
  voices: OpenAIVoice[];
  fetchedAt: string;
  voiceCatalogSource: string;
};

const LANGUAGES = SUPPORTED_LANGUAGES;

type Props = {
  config: AssistantConfig;
  contextName: string;
  onSave: (data: Partial<AssistantConfig>) => Promise<AssistantConfig>;
};

export function ConfigEditor({ config: initial, contextName, onSave }: Props) {
  const [cfg, setCfg] = useState<AssistantConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState("");
  const [activeTab, setActiveTab] = useState<"identity" | "behaviour" | "language" | "voice" | "preview">("identity");
  const [voiceCatalog, setVoiceCatalog] = useState<OpenAICatalog | null>(null);
  const [voiceCatalogLoading, setVoiceCatalogLoading] = useState(false);
  const [voiceCatalogError, setVoiceCatalogError] = useState<string | null>(null);

  useEffect(() => { setCfg(initial); }, [initial]);

  useEffect(() => {
    if (activeTab !== "voice") return;
    let cancelled = false;
    setVoiceCatalogLoading(true);
    setVoiceCatalogError(null);
    fetch("/api/ai/openai/catalog", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        return body as OpenAICatalog;
      })
      .then((catalog) => {
        if (!cancelled) setVoiceCatalog(catalog);
      })
      .catch((err) => {
        if (!cancelled) setVoiceCatalogError(err instanceof Error ? err.message : "Unable to load OpenAI voice capabilities");
      })
      .finally(() => {
        if (!cancelled) setVoiceCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  const set = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => {
    setCfg((c) => ({ ...c, [key]: value }));
    setSaved(false);
  };

  const addRule = useCallback(() => {
    const r = newRule.trim();
    if (!r) return;
    set("rules", [...cfg.rules, r]);
    setNewRule("");
  }, [newRule, cfg.rules]);

  const removeRule = (i: number) => set("rules", cfg.rules.filter((_, idx) => idx !== i));

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        assistantName: cfg.assistantName,
        systemPrompt: cfg.systemPrompt,
        welcomeMessage: cfg.welcomeMessage,
        outOfScopeReply: cfg.outOfScopeReply,
        rules: cfg.rules,
        defaultLanguage: cfg.defaultLanguage,
        allowedLanguages: cfg.allowedLanguages,
        alwaysRespondIn: cfg.alwaysRespondIn,
        voiceId: cfg.voiceId,
        speed: cfg.speed,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        citeSources: cfg.citeSources,
        strictMode: cfg.strictMode,
        primaryColour: cfg.primaryColour,
        accentColour: cfg.accentColour,
      });
      setSaved(true);
      toast.success("Saved assistant configuration", { description: `${cfg.assistantName} is ready for the next chat and voice session.` });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Could not save assistant configuration", { description: message });
    } finally {
      setSaving(false);
    }
  }, [cfg, onSave]);

  const TABS = [
    { id: "identity", label: "Identity" },
    { id: "behaviour", label: "Behaviour" },
    { id: "language", label: "Language" },
    { id: "voice", label: "Voice" },
    { id: "preview", label: "Preview" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 border border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${activeTab === t.id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "identity" && (
        <div className="space-y-5">
          <Field label="Assistant Name"><Input value={cfg.assistantName} onChange={(e) => set("assistantName", e.target.value)} placeholder="Clara" maxLength={50} /></Field>
          <Field label="System Prompt" hint="The core instructions the assistant follows on every turn."><Textarea value={cfg.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} rows={5} placeholder="You are a helpful assistant…" /></Field>
          <Field label="Welcome Message" hint="Shown when the chat first opens."><Input value={cfg.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} placeholder="Hello! How can I help you today?" /></Field>
          <Field label="Out-of-Scope Reply" hint="Returned when strict mode rejects a question."><Input value={cfg.outOfScopeReply} onChange={(e) => set("outOfScopeReply", e.target.value)} placeholder="I can only answer questions about this knowledge base." /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary Colour"><div className="flex items-center gap-3"><input type="color" value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border p-0.5" /><Input value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="font-mono text-sm" maxLength={7} /></div></Field>
            <Field label="Accent Colour"><div className="flex items-center gap-3"><input type="color" value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border p-0.5" /><Input value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="font-mono text-sm" maxLength={7} /></div></Field>
          </div>
        </div>
      )}

      {activeTab === "behaviour" && (
        <div className="space-y-5">
          <Field label="Behaviour Rules" hint="Plain-English rules the assistant follows. Listed in the system prompt.">
            <div className="space-y-2">
              {cfg.rules.map((r, i) => <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"><span className="flex-1 text-foreground">{r}</span><button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive transition-colors"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>)}
              <div className="flex gap-2"><Input value={newRule} onChange={(e) => setNewRule(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRule()} placeholder="e.g. Always end responses with a follow-up question" className="flex-1" /><Button variant="outline" size="sm" onClick={addRule} disabled={!newRule.trim()}>Add</Button></div>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-6"><SwitchField label="Strict Mode" desc="Reject off-topic questions" checked={cfg.strictMode} onChange={(v) => set("strictMode", v)} /><SwitchField label="Cite Sources" desc="Include [S1] citations in answers" checked={cfg.citeSources} onChange={(v) => set("citeSources", v)} /></div>
          <Field label="Temperature" hint={`${cfg.temperature} — controls response creativity (0 = deterministic, 1 = creative)`}><Slider min={0} max={1} step={0.05} value={[cfg.temperature]} onValueChange={([v]) => set("temperature", v)} className="w-full" /><div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Precise</span><span>Creative</span></div></Field>
          <Field label="Max Response Tokens" hint={`${cfg.maxTokens} tokens`}><Slider min={100} max={2000} step={50} value={[cfg.maxTokens]} onValueChange={([v]) => set("maxTokens", v)} className="w-full" /><div className="flex justify-between text-xs text-muted-foreground mt-1"><span>100</span><span>2000</span></div></Field>
        </div>
      )}

      {activeTab === "language" && (
        <div className="space-y-5">
          <Field label="Default Language" hint="The assistant's primary response language."><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{LANGUAGES.map((l) => <button key={l.code} onClick={() => set("defaultLanguage", l.code)} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${cfg.defaultLanguage === l.code ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-foreground hover:bg-muted/40"}`}>{l.label}</button>)}</div></Field>
          <Field label="Allowed Languages" hint="Languages users can converse in. Select all that apply."><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{LANGUAGES.map((l) => { const selected = cfg.allowedLanguages.includes(l.code); return <button key={l.code} onClick={() => { const next = selected ? cfg.allowedLanguages.filter((x) => x !== l.code) : [...cfg.allowedLanguages, l.code]; if (next.length > 0) set("allowedLanguages", next); }} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-foreground hover:bg-muted/40"}`}>{l.label}</button>; })}</div></Field>
          <Field label="Always Respond In" hint="Force a fixed output language (overrides user language). Leave blank to mirror user."><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => set("alwaysRespondIn", null)} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${!cfg.alwaysRespondIn ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-foreground hover:bg-muted/40"}`}>Auto</button>{LANGUAGES.map((l) => <button key={l.code} onClick={() => set("alwaysRespondIn", l.code)} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${cfg.alwaysRespondIn === l.code ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-foreground hover:bg-muted/40"}`}>{l.label}</button>)}</div></Field>
        </div>
      )}

      {activeTab === "voice" && (
        <div className="space-y-5">
          <Field label="OpenAI Realtime Voice" hint="Voice choices are validated against the OpenAI Realtime API contract. The model list is discovered live from your OpenAI project.">
            {voiceCatalogLoading && <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Loading OpenAI voice capabilities…</div>}
            {voiceCatalogError && <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{voiceCatalogError}</div>}
            {voiceCatalog && <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {voiceCatalog.voices.map((v) => <button key={v.id} onClick={() => set("voiceId", v.id)} className={`rounded-xl border p-4 text-left transition-all ${cfg.voiceId === v.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}><div className="flex items-center gap-2 mb-1"><div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${cfg.voiceId === v.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{v.label[0]}</div><span className="font-medium text-sm text-foreground">{v.label}</span></div><p className="text-xs text-muted-foreground">{v.description}</p></button>)}
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                <div className="text-sm font-medium text-foreground">Realtime models available to this OpenAI project</div>
                {voiceCatalog.realtimeModels.length > 0 ? <div className="flex flex-wrap gap-2">{voiceCatalog.realtimeModels.map((m) => <span key={m.id} className="rounded-md bg-background border border-border px-2 py-1 font-mono text-xs text-foreground">{m.id}</span>)}</div> : <p className="text-xs text-muted-foreground">No Realtime models were returned by the OpenAI Models API for this project.</p>}
                <p className="text-xs text-muted-foreground">Discovered {new Date(voiceCatalog.fetchedAt).toLocaleString()}.</p>
              </div>
              <p className="text-xs text-muted-foreground">OpenAI does not currently expose a public voice-list endpoint. Clara therefore discovers models live through <code>/v1/models</code> and validates the Realtime voice IDs against the documented Realtime API contract. This avoids pretending that a non-existent <code>/v1/voices</code> API exists.</p>
            </>}
          </Field>
          <Field label="Speed" hint={`${cfg.speed}× — client playback speed`}><Slider min={0.25} max={4} step={0.05} value={[cfg.speed]} onValueChange={([v]) => set("speed", v)} className="w-full" /><div className="flex justify-between text-xs text-muted-foreground mt-1"><span>0.25× (slow)</span><span>4× (fast)</span></div></Field>
        </div>
      )}

      {activeTab === "preview" && <div className="space-y-4"><p className="text-sm text-muted-foreground">This is the system prompt that will be sent to the AI on every session.</p><SystemPromptPreview config={cfg} contextName={contextName} /></div>}

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 shadow-soft"><div className="text-sm">{error && <span className="text-destructive">{error}</span>}{saved && <span className="text-success">✓ Saved successfully</span>}{!error && !saved && <span className="text-muted-foreground">Unsaved changes</span>}</div><Button onClick={save} disabled={saving} variant="default" size="default">{saving ? "Saving…" : "Save Configuration"}</Button></div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="space-y-2"><div><Label className="text-sm font-medium">{label}</Label>{hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}</div>{children}</div>; }

function SwitchField({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) { return <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3"><div><p className="text-sm font-medium text-foreground">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div>; }
