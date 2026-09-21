"use client";
/**
 * ConfigEditor — full assistant configuration editor with live preview.
 *
 * variant="agent"  → ElevenLabs-style two-column layout: system prompt +
 *                     first message editors on the left; Voices / Language /
 *                     LLM / Agent behavior settings cards on the right.
 * variant="default" → classic tabbed layout (platform defaults, other
 *                     consumers) — unchanged.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { SystemPromptPreview } from "./SystemPromptPreview";
import { LanguageSelect, LanguageMultiSelect } from "./LanguagePicker";
import { ContextDrawer } from "./ai-platform/shared";
import type { AssistantConfig } from "@/modules/admin-ui/api";
import { cn } from "@/lib/utils";

type OpenAIVoice = { id: string; label: string; description: string; realtime: boolean };
type OpenAIModel = { id: string; object?: string; created?: number; owned_by?: string };
type OpenAICatalog = {
  realtimeModels: OpenAIModel[];
  voices: OpenAIVoice[];
  fetchedAt: string;
  voiceCatalogSource: string;
  cache?: { status: "hit" | "miss" | "refresh" | "fallback"; cachedAt: string | null; ttlSeconds: number | null };
};

type Props = {
  config: AssistantConfig;
  contextName: string;
  onSave: (data: Partial<AssistantConfig>) => Promise<AssistantConfig>;
  /** "agent" renders the ElevenLabs two-column workspace layout. */
  variant?: "default" | "agent";
  /** Chat provider · model summary for the LLM card (agent variant). */
  llmSummary?: string;
  /** Opens the AI runtime configuration surface (agent variant). */
  onOpenAISettings?: () => void;
};

export function ConfigEditor({
  config: initial,
  contextName,
  onSave,
  variant = "default",
  llmSummary,
  onOpenAISettings,
}: Props) {
  const [cfg, setCfg] = useState<AssistantConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState("");
  const [activeTab, setActiveTab] = useState<"agent" | "behaviour" | "voice" | "preview">("agent");
  const [voiceCatalog, setVoiceCatalog] = useState<OpenAICatalog | null>(null);
  const [voiceCatalogLoading, setVoiceCatalogLoading] = useState(false);
  const [voiceCatalogError, setVoiceCatalogError] = useState<string | null>(null);
  const [voiceCatalogRefreshing, setVoiceCatalogRefreshing] = useState(false);
  const [lockLanguageOpen, setLockLanguageOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  // Right-column card expansion (agent variant).
  const [languageOpen, setLanguageOpen] = useState(false);
  const [behaviorOpen, setBehaviorOpen] = useState(false);
  // Guards the fetch-once-per-mount behaviour of the Voice tab: the catalog
  // is served from the Redis cache server-side, so re-entering the tab must
  // not refetch; a failed load retries on the next entry.
  const voiceCatalogRequested = useRef(false);

  useEffect(() => { setCfg(initial); }, [initial]);

  // The voice catalog is needed on mount in the agent variant (right-column
  // Voices card) and on Voice-tab entry in the default variant.
  useEffect(() => {
    const shouldFetch = variant === "agent" || activeTab === "voice";
    if (!shouldFetch || voiceCatalogRequested.current) return;
    voiceCatalogRequested.current = true;
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
        voiceCatalogRequested.current = false; // allow retry on next entry
        if (!cancelled) setVoiceCatalogError(err instanceof Error ? err.message : "Unable to load OpenAI voice capabilities");
      })
      .finally(() => {
        if (!cancelled) setVoiceCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, variant]);

  const refreshVoiceCatalog = useCallback(async () => {
    setVoiceCatalogRefreshing(true);
    setVoiceCatalogError(null);
    try {
      const res = await fetch("/api/ai/openai/catalog?refresh=1", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setVoiceCatalog(body as OpenAICatalog);
      toast.success("Voice catalog refreshed", { description: "Loaded live from OpenAI and re-cached." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Refresh failed";
      setVoiceCatalogError(message);
      toast.error("Could not refresh voice catalog", { description: message });
    } finally {
      setVoiceCatalogRefreshing(false);
    }
  }, []);

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
    { id: "agent", label: "Agent" },
    { id: "behaviour", label: "Behaviour" },
    { id: "voice", label: "Voice" },
    { id: "preview", label: "Preview" },
  ] as const;

  // ── Agent variant: ElevenLabs two-column layout ─────────────────────────────
  if (variant === "agent") {
    return (
      <div className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ── Left column — the Agent editor (image 3 centre) ─────────────── */}
          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <p className="text-sm font-semibold text-foreground">Agent</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Identity, first message, system prompt and language support.
              </p>
            </div>

            <div className="space-y-6 p-5">
              <Field label="Agent name" hint="The name shown for this assistant.">
                <Input value={cfg.assistantName} onChange={(e) => set("assistantName", e.target.value)} placeholder="Clara" maxLength={50} />
              </Field>

              {/* First message — ElevenLabs-style editor container. */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">First message</Label>
                  <span className="text-[11px] text-muted-foreground/70">
                    The message the agent speaks when a conversation starts
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-background focus-within:border-primary/40">
                  <Textarea
                    value={cfg.welcomeMessage}
                    onChange={(e) => set("welcomeMessage", e.target.value)}
                    rows={3}
                    placeholder="Hi, this is Clara. How can I help you today?"
                    className="min-h-[5.5rem] resize-y border-0 bg-transparent focus-visible:ring-0"
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
                    <span className="text-[11px] text-muted-foreground/60">
                      Empty lets the agent wait for the user to start.
                    </span>
                    <button
                      type="button"
                      onClick={() => setLanguageOpen(true)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      title="Language settings"
                    >
                      <LanguageDot code={cfg.defaultLanguage} />
                      {languageLabel(cfg.defaultLanguage)}
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* System prompt — ElevenLabs-style editor container. */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">System prompt</Label>
                  <button
                    type="button"
                    onClick={() => setPromptPreviewOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    title="Preview the full prompt sent to the AI"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Preview
                  </button>
                </div>
                <div className="rounded-xl border border-border bg-background focus-within:border-primary/40">
                  <Textarea
                    value={cfg.systemPrompt}
                    onChange={(e) => set("systemPrompt", e.target.value)}
                    rows={12}
                    placeholder="You are a helpful assistant…"
                    className="resize-y border-0 bg-transparent font-mono text-[13px] leading-6 focus-visible:ring-0"
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
                    <span className="text-[11px] text-muted-foreground/60">
                      {cfg.systemPrompt.length.toLocaleString()} characters
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {timezoneLabel()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 border-t border-border pt-5 lg:grid-cols-2">
                <Field label="Default language" hint="The language the agent uses by default.">
                  <LanguageSelect
                    value={cfg.defaultLanguage}
                    onChange={(code) => {
                      if (!code) return;
                      set("defaultLanguage", code);
                      if (!cfg.allowedLanguages.includes(code)) {
                        set("allowedLanguages", [...cfg.allowedLanguages, code]);
                      }
                    }}
                  />
                </Field>

                <Field label="Allowed languages" hint="Languages the agent can use during conversations.">
                  <LanguageMultiSelect
                    value={cfg.allowedLanguages}
                    onChange={(codes) => set("allowedLanguages", codes)}
                    onBlockedMinimum={() =>
                      toast.info("At least one language is required", {
                        description: "The assistant always needs a language to chat in.",
                      })
                    }
                  />
                </Field>
              </div>

              <Collapsible open={lockLanguageOpen} onOpenChange={setLockLanguageOpen}>
                <div className="rounded-xl border border-border bg-muted/20">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span>
                      <span className="block text-sm font-medium text-foreground">Language behaviour</span>
                      <span className="block text-xs text-muted-foreground">
                        Advanced language handling and forced output language.
                      </span>
                    </span>
                    <span className={`text-xs font-medium ${cfg.alwaysRespondIn ? "text-primary" : "text-muted-foreground"}`}>
                      {cfg.alwaysRespondIn ? "Locked" : "Auto"}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-4 pb-4">
                    <Field label="Always respond in" hint="Auto mirrors the language used by the customer.">
                      <LanguageSelect
                        value={cfg.alwaysRespondIn}
                        onChange={(code) => set("alwaysRespondIn", code)}
                        autoLabel="Auto — mirror the customer"
                        autoDescription="Reply in whatever language the customer writes in."
                      />
                    </Field>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              <Collapsible>
                <div className="rounded-xl border border-border bg-muted/20">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span>
                      <span className="block text-sm font-medium text-foreground">Advanced agent settings</span>
                      <span className="block text-xs text-muted-foreground">
                        Out-of-scope response and widget colours. Existing settings are preserved here.
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">Advanced</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-5 px-4 pb-4">
                    <Field label="Out-of-scope reply" hint="Returned when strict mode rejects a question.">
                      <Input value={cfg.outOfScopeReply} onChange={(e) => set("outOfScopeReply", e.target.value)} placeholder="I can only answer questions about this knowledge base." />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Primary colour">
                        <div className="flex items-center gap-3">
                          <input type="color" value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border p-0.5" />
                          <Input value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="font-mono text-sm" maxLength={7} />
                        </div>
                      </Field>
                      <Field label="Accent colour">
                        <div className="flex items-center gap-3">
                          <input type="color" value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border p-0.5" />
                          <Input value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="font-mono text-sm" maxLength={7} />
                        </div>
                      </Field>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </section>

          {/* ── Right column — settings cards (image 3) ───────────────────────── */}
          <aside className="space-y-4">
            {/* Voices */}
            <section className="rounded-2xl border border-border bg-card shadow-sm">
              <header className="flex items-start justify-between gap-2 px-4 pb-2 pt-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground" /> Voices
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select the realtime voices used by this agent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshVoiceCatalog()}
                  disabled={voiceCatalogRefreshing}
                  title="Fetch live from OpenAI and re-cache"
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Refresh voice catalog"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${voiceCatalogRefreshing ? "animate-spin" : ""}`} />
                </button>
              </header>
              <div className="px-2 pb-2">
                {voiceCatalog && (
                  <div className="px-2 pb-1">
                    <CacheBadge catalog={voiceCatalog} />
                  </div>
                )}
                {voiceCatalogLoading && (
                  <div className="space-y-1.5 px-2 py-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/50" />)}
                  </div>
                )}
                {voiceCatalogError && (
                  <div className="m-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    {voiceCatalogError}
                    <button type="button" onClick={() => void refreshVoiceCatalog()} className="mt-2 block font-medium text-primary hover:underline">
                      Retry
                    </button>
                  </div>
                )}
                {voiceCatalog && (
                  <ul>
                    {voiceCatalog.voices.map((v) => {
                      const selected = cfg.voiceId === v.id;
                      return (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => set("voiceId", v.id)}
                            aria-pressed={selected}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                              selected ? "bg-primary/5" : "hover:bg-muted/50",
                            )}
                          >
                            <span className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                              selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                            )}>
                              {v.label[0]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{v.label}</span>
                              <span className="block truncate text-[11px] text-muted-foreground/70">{v.description}</span>
                            </span>
                            {selected && (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden>
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Speed</span>
                  <div className="flex flex-1 items-center gap-2 pl-2">
                    <Slider
                      min={0.25}
                      max={4}
                      step={0.05}
                      value={[cfg.speed]}
                      onValueChange={([v]) => set("speed", v)}
                      className="flex-1"
                    />
                    <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{cfg.speed}×</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Language */}
            <section className="rounded-2xl border border-border bg-card shadow-sm">
              <header className="px-4 pb-2 pt-4">
                <p className="text-sm font-semibold text-foreground">Language</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Default and additional languages the agent communicates in.
                </p>
              </header>
              <div className="px-2 pb-2">
                <ul>
                  <li>
                    <button
                      type="button"
                      onClick={() => setLanguageOpen((v) => !v)}
                      aria-expanded={languageOpen}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <LanguageDot code={cfg.defaultLanguage} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {languageLabel(cfg.defaultLanguage)}
                      </span>
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Default</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", languageOpen && "rotate-180")} />
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setLanguageOpen((v) => !v)}
                      aria-expanded={languageOpen}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                        {cfg.allowedLanguages.length}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {cfg.allowedLanguages.map((c) => languageLabel(c)).slice(0, 3).join(" & ")}
                        {cfg.allowedLanguages.length > 3 ? ` +${cfg.allowedLanguages.length - 3}` : ""}
                      </span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", languageOpen && "rotate-180")} />
                    </button>
                  </li>
                </ul>
                {languageOpen && (
                  <div className="space-y-4 border-t border-border/60 px-3 py-3">
                    <Field label="Default language">
                      <LanguageSelect
                        value={cfg.defaultLanguage}
                        onChange={(code) => {
                          if (!code) return;
                          set("defaultLanguage", code);
                          if (!cfg.allowedLanguages.includes(code)) {
                            set("allowedLanguages", [...cfg.allowedLanguages, code]);
                          }
                        }}
                      />
                    </Field>
                    <Field label="Allowed languages">
                      <LanguageMultiSelect
                        value={cfg.allowedLanguages}
                        onChange={(codes) => set("allowedLanguages", codes)}
                        onBlockedMinimum={() =>
                          toast.info("At least one language is required", {
                            description: "The assistant always needs a language to chat in.",
                          })
                        }
                      />
                    </Field>
                    <Field label="Always respond in" hint="Auto mirrors the customer's language.">
                      <LanguageSelect
                        value={cfg.alwaysRespondIn}
                        onChange={(code) => set("alwaysRespondIn", code)}
                        autoLabel="Auto — mirror the customer"
                        autoDescription="Reply in whatever language the customer writes in."
                      />
                    </Field>
                  </div>
                )}
              </div>
            </section>

            {/* LLM */}
            <section className="rounded-2xl border border-border bg-card shadow-sm">
              <header className="px-4 pb-2 pt-4">
                <p className="text-sm font-semibold text-foreground">LLM</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Provider and model used for chat, voice chat and realtime.
                </p>
              </header>
              <div className="px-2 pb-2">
                <button
                  type="button"
                  onClick={() => onOpenAISettings?.()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                    AI
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {llmSummary ?? "Platform default"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                </button>
              </div>
            </section>

            {/* Agent behavior */}
            <section className="rounded-2xl border border-border bg-card shadow-sm">
              <header className="px-4 pb-2 pt-4">
                <p className="text-sm font-semibold text-foreground">Agent behavior</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Personality and reply behaviour.
                </p>
              </header>
              <div className="px-2 pb-2">
                <button
                  type="button"
                  onClick={() => setBehaviorOpen((v) => !v)}
                  aria-expanded={behaviorOpen}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {cfg.strictMode ? "Strict" : "Open"} · {cfg.citeSources ? "cites sources" : "no citations"}
                  </span>
                  <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    T {cfg.temperature.toFixed(2)}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", behaviorOpen && "rotate-180")} />
                </button>
                {behaviorOpen && (
                  <div className="space-y-5 border-t border-border/60 px-3 py-3">
                    <Field label="Behaviour rules" hint="Plain-English rules listed in the system prompt.">
                      <div className="space-y-2">
                        {cfg.rules.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                            <span className="flex-1 text-foreground">{r}</span>
                            <button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Remove rule">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRule()} placeholder="e.g. Always end responses with a follow-up question" className="flex-1" />
                          <Button variant="outline" size="sm" onClick={addRule} disabled={!newRule.trim()}>Add</Button>
                        </div>
                      </div>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchField label="Strict Mode" desc="Reject off-topic questions" checked={cfg.strictMode} onChange={(v) => set("strictMode", v)} />
                      <SwitchField label="Cite Sources" desc="Include [S1] citations" checked={cfg.citeSources} onChange={(v) => set("citeSources", v)} />
                    </div>
                    <Field label="Temperature" hint={`${cfg.temperature} — response creativity`}>
                      <Slider min={0} max={1} step={0.05} value={[cfg.temperature]} onValueChange={([v]) => set("temperature", v)} className="w-full" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Precise</span><span>Creative</span></div>
                    </Field>
                    <Field label="Max response tokens" hint={`${cfg.maxTokens} tokens`}>
                      <Slider min={100} max={2000} step={50} value={[cfg.maxTokens]} onValueChange={([v]) => set("maxTokens", v)} className="w-full" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>100</span><span>2000</span></div>
                    </Field>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
          <div className="text-sm">
            {error && <span className="text-destructive">{error}</span>}
            {saved && <span className="text-emerald-600">Saved successfully</span>}
            {!error && !saved && <span className="text-muted-foreground">Unsaved changes</span>}
          </div>
          <Button onClick={save} disabled={saving} variant="default" size="default">{saving ? "Saving…" : "Save Configuration"}</Button>
        </div>

        {/* System prompt preview canvas */}
        <ContextDrawer
          open={promptPreviewOpen}
          onClose={() => setPromptPreviewOpen(false)}
          title="System prompt preview"
          subtitle="The full prompt sent to the AI on every session."
          width="sm:w-[34rem]"
        >
          <SystemPromptPreview config={cfg} contextName={contextName} />
        </ContextDrawer>
      </div>
    );
  }

  // ── Default variant: classic tabbed layout (unchanged) ──────────────────────
  return (
    <div className="space-y-6">
      {/* Compact section switcher — the primary Agent section keeps the
          ElevenLabs-style first message, system prompt and language controls together. */}
      <div className="grid auto-rows-fr grid-cols-4 gap-1 rounded-lg border border-border bg-muted/50 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-center text-xs font-medium leading-tight transition-all sm:px-3 sm:text-sm ${activeTab === t.id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "agent" && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <p className="text-sm font-semibold text-foreground">Agent</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure the agent&apos;s identity, first message, system prompt and language support.
              </p>
            </div>

            <div className="space-y-6 p-5">
              <Field label="Agent name" hint="The name shown for this assistant.">
                <Input value={cfg.assistantName} onChange={(e) => set("assistantName", e.target.value)} placeholder="Clara" maxLength={50} />
              </Field>

              <Field
                label="First message"
                hint="The first message the assistant speaks when a conversation starts."
              >
                <Textarea
                  value={cfg.welcomeMessage}
                  onChange={(e) => set("welcomeMessage", e.target.value)}
                  rows={3}
                  placeholder="Hi, this is Clara. How can I help you today?"
                />
              </Field>

              <Field
                label="System prompt"
                hint="The core instructions that guide the agent&apos;s behaviour, tasks and personality."
              >
                <Textarea
                  value={cfg.systemPrompt}
                  onChange={(e) => set("systemPrompt", e.target.value)}
                  rows={12}
                  placeholder="You are a helpful assistant…"
                  className="font-mono text-[13px] leading-6"
                />
              </Field>

              <div className="grid gap-5 border-t border-border pt-5 lg:grid-cols-2">
                <Field
                  label="Default language"
                  hint="The language the agent uses by default."
                >
                  <LanguageSelect
                    value={cfg.defaultLanguage}
                    onChange={(code) => {
                      if (!code) return;
                      set("defaultLanguage", code);
                      if (!cfg.allowedLanguages.includes(code)) {
                        set("allowedLanguages", [...cfg.allowedLanguages, code]);
                      }
                    }}
                  />
                </Field>

                <Field
                  label="Allowed languages"
                  hint="Languages the agent can use during conversations."
                >
                  <LanguageMultiSelect
                    value={cfg.allowedLanguages}
                    onChange={(codes) => set("allowedLanguages", codes)}
                    onBlockedMinimum={() =>
                      toast.info("At least one language is required", {
                        description: "The assistant always needs a language to chat in.",
                      })
                    }
                  />
                </Field>
              </div>

              <Collapsible open={lockLanguageOpen} onOpenChange={setLockLanguageOpen}>
                <div className="rounded-xl border border-border bg-muted/20">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span>
                      <span className="block text-sm font-medium text-foreground">Language behaviour</span>
                      <span className="block text-xs text-muted-foreground">
                        Advanced language handling and forced output language.
                      </span>
                    </span>
                    <span className={`text-xs font-medium ${cfg.alwaysRespondIn ? "text-primary" : "text-muted-foreground"}`}>
                      {cfg.alwaysRespondIn ? "Locked" : "Auto"}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-4 pb-4">
                    <Field
                      label="Always respond in"
                      hint="Auto mirrors the language used by the customer."
                    >
                      <LanguageSelect
                        value={cfg.alwaysRespondIn}
                        onChange={(code) => set("alwaysRespondIn", code)}
                        autoLabel="Auto — mirror the customer"
                        autoDescription="Reply in whatever language the customer writes in."
                      />
                    </Field>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              <Collapsible>
                <div className="rounded-xl border border-border bg-muted/20">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span>
                      <span className="block text-sm font-medium text-foreground">Advanced agent settings</span>
                      <span className="block text-xs text-muted-foreground">
                        Out-of-scope response and widget colours. Existing settings are preserved here.
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">Advanced</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-5 px-4 pb-4">
                    <Field label="Out-of-scope reply" hint="Returned when strict mode rejects a question.">
                      <Input value={cfg.outOfScopeReply} onChange={(e) => set("outOfScopeReply", e.target.value)} placeholder="I can only answer questions about this knowledge base." />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Primary colour">
                        <div className="flex items-center gap-3">
                          <input type="color" value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border p-0.5" />
                          <Input value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="font-mono text-sm" maxLength={7} />
                        </div>
                      </Field>
                      <Field label="Accent colour">
                        <div className="flex items-center gap-3">
                          <input type="color" value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border p-0.5" />
                          <Input value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="font-mono text-sm" maxLength={7} />
                        </div>
                      </Field>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </section>
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

      {activeTab === "voice" && (
        <div className="space-y-5">
          <Field label="OpenAI Realtime Voice" hint="Voices follow the OpenAI Realtime API contract; the model list is discovered from your OpenAI project.">
            <div className="flex items-center justify-between gap-3">
              <CacheBadge catalog={voiceCatalog} />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={refreshVoiceCatalog}
                disabled={voiceCatalogRefreshing}
                title="Fetch live from OpenAI and re-cache"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${voiceCatalogRefreshing ? "animate-spin" : ""}`} />
                {voiceCatalogRefreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
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

/** Voice catalog provenance chip — shows where the data came from and when. */
function CacheBadge({ catalog }: { catalog: OpenAICatalog | null }) {
  if (!catalog?.cache) return null;
  const { status, cachedAt } = catalog.cache;
  const label =
    status === "hit" ? (cachedAt ? `Cached · updated ${relativeTime(cachedAt)}` : "Cached")
    : status === "fallback" ? "Live · cache unavailable"
    : status === "refresh" ? "Refreshed just now"
    : "Loaded live · now cached";
  const tone = status === "hit" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${tone}`} data-cache={status}>
      {status === "hit" ? "⚡" : status === "fallback" ? "●" : "✓"} {label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Compact language chip for editor footers / settings rows. */
function LanguageDot({ code }: { code: string }) {
  const flag = languageFlag(code);
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-[10px]" aria-hidden>
      {flag}
    </span>
  );
}

function languageFlag(code: string): string {
  const region = code.split("-")[1]?.toLowerCase();
  if (region === "in") return "🇮🇳";
  if (region === "sa") return "🇸🇦";
  if (region === "ae") return "🇦🇪";
  if (region === "us" || region === "gb") return "🇬🇧";
  switch (code.split("-")[0]?.toLowerCase()) {
    case "en": return "🇬🇧";
    case "ta": return "🇮🇳";
    case "hi": return "🇮🇳";
    case "ar": return "🇸🇦";
    case "ml": return "🇮🇳";
    default: return "🌐";
  }
}

function languageLabel(code: string): string {
  try {
    const display = new Intl.DisplayNames([Intl.DateTimeFormat().resolvedOptions().locale], { type: "language" });
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}

function timezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "—";
  }
}
