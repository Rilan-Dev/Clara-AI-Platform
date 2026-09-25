"use client";
/**
 * ConfigEditor — full assistant configuration editor with live preview.
 *
 * variant="agent"  → ElevenLabs-style two-column layout: system prompt +
 *                     first message editors on the left; Voices / Language /
 *                     Branding / LLM / Agent behavior settings cards on the
 *                     right. Languages live ONLY in the right-side Language
 *                     card (the former centre-placed language editors were
 *                     removed — one language surface, no duplicates). Brand
 *                     colours live in the dedicated Branding colour studio
 *                     (presets, hex inputs, live mini preview).
 *                     The Voices card SYNCs with the organisation's selected
 *                     Realtime Voice provider when `voiceCatalog` is provided.
 * variant="default" → classic tabbed layout (platform defaults, other
 *                     consumers) — unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Languages,
  Palette,
  RefreshCw,
  Volume2,
  Wand2,
} from "lucide-react";
import { SystemPromptPreview } from "./SystemPromptPreview";
import { SystemPromptGenerator, type GenerateSystemPrompt } from "./SystemPromptGenerator";
import { LanguageSelect, LanguageMultiSelect } from "./LanguagePicker";
import { AutoSaveChip, ContextDrawer } from "./ai-platform/shared";
import { useAutoSave } from "@/hooks/use-auto-save";
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
  /** When set, the Voices card renders THIS provider's voices (synced with
   *  the organisation's selected Realtime Voice provider — change that
   *  provider in the AI runtime configuration and the list updates). */
  voiceCatalog?: ProviderVoiceCatalog | null;
  /** Read-only surface (platform admin viewing an org agent): mutations are
   *  ignored and the auto-save pipeline is disabled. */
  readOnly?: boolean;
  /** When set, the system prompt gets a "Generate from knowledge base"
   *  action (template picker → review → replace/append). */
  onGenerateSystemPrompt?: GenerateSystemPrompt;
};

/** Provider-synced voice catalog — supplied by the agent workspace screen. */
export type ProviderVoiceCatalog = {
  providerId: string;
  providerName: string;
  voices: Array<{ id: string; label: string; description?: string; isDefault?: boolean }>;
};

/* ── Curated brand presets for the Branding colour studio ─────────────────── */
const COLOUR_PRESETS: Array<{ name: string; primary: string; accent: string }> = [
  { name: "Indigo", primary: "#6366f1", accent: "#a5b4fc" },
  { name: "Violet", primary: "#8b5cf6", accent: "#c4b5fd" },
  { name: "Blue", primary: "#3b82f6", accent: "#93c5fd" },
  { name: "Teal", primary: "#14b8a6", accent: "#99f6e4" },
  { name: "Emerald", primary: "#10b981", accent: "#a7f3d0" },
  { name: "Amber", primary: "#f59e0b", accent: "#fde68a" },
  { name: "Rose", primary: "#f43f5e", accent: "#fecdd3" },
  { name: "Slate", primary: "#475569", accent: "#cbd5e1" },
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function ConfigEditor({
  config: initial,
  contextName,
  onSave,
  variant = "default",
  llmSummary,
  onOpenAISettings,
  voiceCatalog: providerVoiceCatalog,
  readOnly = false,
  onGenerateSystemPrompt,
}: Props) {
  const [cfg, setCfg] = useState<AssistantConfig>(initial);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState("");
  const [activeTab, setActiveTab] = useState<"agent" | "behaviour" | "voice" | "preview">("agent");
  const [voiceCatalog, setVoiceCatalog] = useState<OpenAICatalog | null>(null);
  const [voiceCatalogLoading, setVoiceCatalogLoading] = useState(false);
  const [voiceCatalogError, setVoiceCatalogError] = useState<string | null>(null);
  const [voiceCatalogRefreshing, setVoiceCatalogRefreshing] = useState(false);
  const [lockLanguageOpen, setLockLanguageOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [promptGeneratorOpen, setPromptGeneratorOpen] = useState(false);
  // Right-column card expansion (agent variant).
  const [languageOpen, setLanguageOpen] = useState(false);
  const [behaviorOpen, setBehaviorOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  // Guards the fetch-once-per-mount behaviour of the Voice tab: the catalog
  // is served from the Redis cache server-side, so re-entering the tab must
  // not refetch; a failed load retries on the next entry.
  const voiceCatalogRequested = useRef(false);

  // ── Provider-synced voices: keep the selection valid whenever the catalog
  //    changes (provider switch). Falls back to the provider's default so the
  //    draft never points at a voice the provider cannot serve.
  const syncedVoices = providerVoiceCatalog?.voices ?? null;
  const lastSyncedProviderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!providerVoiceCatalog || !syncedVoices) {
      lastSyncedProviderRef.current = null;
      return;
    }
    const providerChanged = lastSyncedProviderRef.current !== providerVoiceCatalog.providerId;
    lastSyncedProviderRef.current = providerVoiceCatalog.providerId;
    if (!providerChanged) return;
    const currentValid = syncedVoices.some((v) => v.id === cfg.voiceId);
    if (!currentValid) {
      const next =
        syncedVoices.find((v) => v.isDefault)?.id ??
        syncedVoices[0]?.id ??
        "";
      if (next) set("voiceId", next);
    }
    // cfg.voiceId is intentionally NOT a dependency: the effect must run on
    // provider/catalog changes, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerVoiceCatalog?.providerId, syncedVoices]);

  // ── Auto-save (platform "no Save button" policy) ───────────────────────────
  // The persisted projection of the editor — the exact field list the old
  // explicit "Save Configuration" button sent. Everything else in `cfg`
  // (id, timestamps, faqItems…) is metadata the parent owns separately.
  const savePayload = useMemo<Partial<AssistantConfig>>(() => ({
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
  }), [cfg]);

  const persist = useCallback(
    async (data: Partial<AssistantConfig>) => {
      await onSave(data);
    },
    [onSave],
  );

  const autoSave = useAutoSave<Partial<AssistantConfig>>({
    value: savePayload,
    save: persist,
    delay: 1500,
    enabled: !readOnly,
    onSaved: () => setError(null),
    onError: (e) => {
      setError(e.message);
      toast.error("Could not save automatically", { description: e.message });
    },
  });

  const payloadOf = useCallback((config: AssistantConfig): Partial<AssistantConfig> => ({
    assistantName: config.assistantName,
    systemPrompt: config.systemPrompt,
    welcomeMessage: config.welcomeMessage,
    outOfScopeReply: config.outOfScopeReply,
    rules: config.rules,
    defaultLanguage: config.defaultLanguage,
    allowedLanguages: config.allowedLanguages,
    alwaysRespondIn: config.alwaysRespondIn,
    voiceId: config.voiceId,
    speed: config.speed,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    citeSources: config.citeSources,
    strictMode: config.strictMode,
    primaryColour: config.primaryColour,
    accentColour: config.accentColour,
  }), []);

  // Echo-guarded external reset: accept genuine external changes (agent
  // switch, version restore) but skip the parent's post-save echo — the
  // refetched draft matches our own last-saved payload, and resetting would
  // clobber in-flight typing (cursor jumps, lost keystrokes).
  useEffect(() => {
    if (autoSave.baselineMatches(payloadOf(initial))) return;
    setCfg(initial);
    autoSave.resetBaseline(payloadOf(initial));
    // `initial` identity is the trigger; payloadOf/autoSave are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // The voice catalog is needed on mount in the agent variant (right-column
  // Voices card) and on Voice-tab entry in the default variant.
  useEffect(() => {
    // Agent workspaces receive the selected realtime provider catalog from
    // the capability resolver. Do not also call the OpenAI catalog endpoint.
    const shouldFetch = activeTab === "voice" || (variant === "agent" && !providerVoiceCatalog);
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
  }, [activeTab, variant, providerVoiceCatalog]);

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

  const set = useCallback(<K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => {
    if (readOnly) return; // read-only viewers never mutate the draft
    setCfg((c) => ({ ...c, [key]: value }));
  }, [readOnly]);

  const addRule = useCallback(() => {
    const r = newRule.trim();
    if (!r) return;
    set("rules", [...cfg.rules, r]);
    setNewRule("");
  }, [newRule, cfg.rules, set]);

  const removeRule = (i: number) => set("rules", cfg.rules.filter((_, idx) => idx !== i));

  // "Generate from knowledge base" — offered only where a generator is wired
  // (agent workspace) and the viewer can edit.
  const canGeneratePrompt = Boolean(onGenerateSystemPrompt) && !readOnly;
  const generatePromptButton = canGeneratePrompt ? (
    <button
      type="button"
      onClick={() => setPromptGeneratorOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
      title="Draft a system prompt from this agent's knowledge base"
    >
      <Wand2 className="h-3.5 w-3.5" /> Generate from knowledge base
    </button>
  ) : null;
  const promptGeneratorDialog = canGeneratePrompt && onGenerateSystemPrompt ? (
    <SystemPromptGenerator
      open={promptGeneratorOpen}
      onOpenChange={setPromptGeneratorOpen}
      generate={onGenerateSystemPrompt}
      hasExistingPrompt={cfg.systemPrompt.trim().length > 0}
      onApply={(prompt, mode) => {
        const current = cfg.systemPrompt.trim();
        set("systemPrompt", mode === "append" && current ? `${current}\n\n${prompt}` : prompt);
        toast.success(mode === "append" ? "Generated prompt appended." : "System prompt updated from the knowledge base.");
      }}
    />
  ) : null;

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
                    <span className="text-[11px] text-muted-foreground/80">
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
                  <div className="flex items-center gap-2">
                    {generatePromptButton}
                    <button
                      type="button"
                      onClick={() => setPromptPreviewOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                      title="Preview the full prompt sent to the AI"
                    >
                      <BookOpen className="h-3.5 w-3.5" /> Preview
                    </button>
                  </div>
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
                    <span className="text-[11px] text-muted-foreground/80">
                      {cfg.systemPrompt.length.toLocaleString()} characters
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {timezoneLabel()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Language settings live ONLY in the right-side Language card —
                  the former centre-placed language editors were removed so
                  there is exactly one language surface (no duplicate designs). */}
              <p className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                <Languages className="h-3.5 w-3.5 shrink-0" />
                Language settings live in the{" "}
                <button
                  type="button"
                  onClick={() => setLanguageOpen(true)}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Language
                </button>{" "}
                card on the right.
              </p>

              <Collapsible>
                <div className="rounded-xl border border-border bg-muted/20">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span>
                      <span className="block text-sm font-medium text-foreground">Advanced agent settings</span>
                      <span className="block text-xs text-muted-foreground">
                        Out-of-scope response. Brand colours live in the right-side Branding card.
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">Advanced</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-5 px-4 pb-4">
                    <Field label="Out-of-scope reply" hint="What the assistant conveys, in the visitor's language, when a question isn't covered by the knowledge base. It is paraphrased with a pointer to what you do cover, and never used for greetings or &quot;what can you do&quot; questions.">
                      <Input value={cfg.outOfScopeReply} onChange={(e) => set("outOfScopeReply", e.target.value)} placeholder="I can only answer questions about this knowledge base." />
                    </Field>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </section>

          {/* ── Right column — settings cards (image 3) ───────────────────────── */}
          <aside className="space-y-4">
            {/* Voices — provider-synced when the agent workspace supplies a
                voiceCatalog (mirrors the organisation's selected Realtime
                Voice provider); OpenAI catalog otherwise. */}
            <section className="rounded-2xl border border-border bg-card shadow-sm">
              <header className="flex items-start justify-between gap-2 px-4 pb-2 pt-4">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {providerVoiceCatalog ? `Voices · ${providerVoiceCatalog.providerName}` : "Voices"}
                    {providerVoiceCatalog && (
                      <span className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                        Synced
                      </span>
                    )}
                    {(providerVoiceCatalog?.voices.length ?? voiceCatalog?.voices.length ?? 0) > 0 && (
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {providerVoiceCatalog?.voices.length ?? voiceCatalog?.voices.length} voices
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {providerVoiceCatalog
                      ? "Mirrors the Realtime Voice provider selected in the AI runtime configuration — switching that provider updates this list automatically."
                      : "Select the realtime voices used by this agent."}
                  </p>
                </div>
                {!providerVoiceCatalog && (
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
                )}
              </header>
              <div className="px-2 pb-2">
                {!providerVoiceCatalog && voiceCatalog && (
                  <div className="px-2 pb-1">
                    <CacheBadge catalog={voiceCatalog} />
                  </div>
                )}
                {providerVoiceCatalog ? (
                  syncedVoices && syncedVoices.length > 0 ? (
                    // Fixed height + scroll: providers with large catalogs
                    // (Sarvam exposes 20+ voices) must not blow up the card.
                    <ul className="max-h-72 overflow-y-auto overscroll-contain">
                      {syncedVoices.map((v) => {
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
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {v.label}
                                  {v.isDefault && (
                                    <span className="ml-1.5 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      Default
                                    </span>
                                  )}
                                </span>
                                {v.description && (
                                  <span className="block truncate text-[11px] text-muted-foreground/70">{v.description}</span>
                                )}
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
                  ) : (
                    <p className="m-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-[11px] text-muted-foreground/70">
                      This provider exposes no voices yet — pick another Realtime Voice provider in the AI runtime configuration.
                    </p>
                  )
                ) : (
                  <>
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
                      <ul className="max-h-72 overflow-y-auto overscroll-contain">
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
                  </>
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
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Default</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform", languageOpen && "rotate-180")} />
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setLanguageOpen((v) => !v)}
                      aria-expanded={languageOpen}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                        {cfg.allowedLanguages.length}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {cfg.allowedLanguages.map((c) => languageLabel(c)).slice(0, 3).join(" & ")}
                        {cfg.allowedLanguages.length > 3 ? ` +${cfg.allowedLanguages.length - 3}` : ""}
                      </span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform", languageOpen && "rotate-180")} />
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

            {/* Branding — the advanced colour studio (moved here from the old
                "Advanced agent settings" collapsible). Presets, hex inputs and
                a live mini preview in one dedicated card. */}
            <section className="rounded-2xl border border-border bg-card shadow-sm">
              <header className="px-4 pb-2 pt-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" /> Branding
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Brand colours for the chat widget and voice page.
                </p>
              </header>
              <div className="px-2 pb-2">
                <button
                  type="button"
                  onClick={() => setBrandingOpen((v) => !v)}
                  aria-expanded={brandingOpen}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="flex shrink-0 items-center -space-x-1">
                    <span
                      className="h-5 w-5 rounded-full border-2 border-card"
                      style={{ backgroundColor: cfg.primaryColour }}
                    />
                    <span
                      className="h-5 w-5 rounded-full border-2 border-card"
                      style={{ backgroundColor: cfg.accentColour }}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {cfg.primaryColour} · {cfg.accentColour}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform", brandingOpen && "rotate-180")} />
                </button>
                {brandingOpen && (
                  <div className="space-y-4 border-t border-border/60 px-3 py-3">
                    {/* Live mini preview */}
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">Live preview</p>
                      <div className="mt-2 space-y-2">
                        <div className="flex justify-end">
                          <span className="rounded-2xl rounded-br-sm px-3 py-1.5 text-xs text-white" style={{ backgroundColor: cfg.primaryColour }}>
                            How can I help?
                          </span>
                        </div>
                        <div className="flex justify-start">
                          <span className="rounded-2xl rounded-bl-sm border px-3 py-1.5 text-xs text-foreground" style={{ borderColor: cfg.accentColour, backgroundColor: `${cfg.accentColour}1a` }}>
                            Answer my question
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: cfg.primaryColour }}
                            aria-hidden
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Curated presets */}
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground">Presets</p>
                      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                        {COLOUR_PRESETS.map((preset) => {
                          const active =
                            cfg.primaryColour.toLowerCase() === preset.primary.toLowerCase() &&
                            cfg.accentColour.toLowerCase() === preset.accent.toLowerCase();
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => {
                                set("primaryColour", preset.primary);
                                set("accentColour", preset.accent);
                              }}
                              aria-pressed={active}
                              title={`${preset.name} — ${preset.primary} / ${preset.accent}`}
                              className={cn(
                                "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors",
                                active ? "border-primary/40 bg-primary/5 text-foreground" : "border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                              )}
                            >
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: preset.primary }} />
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: preset.accent }} />
                              <span className="truncate">{preset.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom hex + pickers */}
                    <div className="space-y-2.5">
                      <Field label="Primary colour" hint="Buttons, own bubbles and highlights.">
                        <div className="flex items-center gap-2">
                          <input type="color" value={cfg.primaryColour} onChange={(e) => set("primaryColour", e.target.value)} className="h-8 w-11 cursor-pointer rounded border border-border p-0.5" aria-label="Primary colour picker" />
                          <Input value={cfg.primaryColour} onChange={(e) => { const v = e.target.value; if (HEX_RE.test(v) || v === "#") set("primaryColour", v); }} className="font-mono text-xs" maxLength={7} placeholder="#6366f1" />
                        </div>
                      </Field>
                      <Field label="Accent colour" hint="Borders, links and soft backgrounds.">
                        <div className="flex items-center gap-2">
                          <input type="color" value={cfg.accentColour} onChange={(e) => set("accentColour", e.target.value)} className="h-8 w-11 cursor-pointer rounded border border-border p-0.5" aria-label="Accent colour picker" />
                          <Input value={cfg.accentColour} onChange={(e) => { const v = e.target.value; if (HEX_RE.test(v) || v === "#") set("accentColour", v); }} className="font-mono text-xs" maxLength={7} placeholder="#a5b4fc" />
                        </div>
                      </Field>
                    </div>
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
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                    AI
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {llmSummary ?? "Platform default"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
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
                  <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    T {cfg.temperature.toFixed(2)}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform", behaviorOpen && "rotate-180")} />
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
                      <SwitchField label="Strict Mode" desc="Answer only from the knowledge base; off-topic questions get the out-of-scope reply" checked={cfg.strictMode} onChange={(v) => set("strictMode", v)} />
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

        {/* Auto-save status bar — the draft persists itself ~1.5 s after
            edits stop (debounced, latest-wins, validated by the endpoint).
            There is no Save button: publishing from the workspace navbar
            versions + publishes the current draft in one click. */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-5 py-2.5 shadow-sm">
          <div className="min-w-0 text-xs">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              <span className="text-muted-foreground">
                Edits save automatically into the draft — publish from the header when ready.
              </span>
            )}
          </div>
          <AutoSaveChip status={autoSave.status} savedAt={autoSave.savedAt} />
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
        {promptGeneratorDialog}
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
                {generatePromptButton && <div className="mb-2 flex justify-end">{generatePromptButton}</div>}
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
                    <Field label="Out-of-scope reply" hint="What the assistant conveys, in the visitor's language, when a question isn't covered by the knowledge base. It is paraphrased with a pointer to what you do cover, and never used for greetings or &quot;what can you do&quot; questions.">
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
          <div className="grid grid-cols-2 gap-6"><SwitchField label="Strict Mode" desc="Answer only from the knowledge base; off-topic questions get the out-of-scope reply" checked={cfg.strictMode} onChange={(v) => set("strictMode", v)} /><SwitchField label="Cite Sources" desc="Include [S1] citations in answers" checked={cfg.citeSources} onChange={(v) => set("citeSources", v)} /></div>
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

      {/* Auto-save status bar (no Save button — same policy as the agent
          variant: the draft persists itself, publishing is one click). */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-5 py-2.5 shadow-soft">
        <div className="min-w-0 text-xs">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <span className="text-muted-foreground">Edits save automatically into the draft.</span>
          )}
        </div>
        <AutoSaveChip status={autoSave.status} savedAt={autoSave.savedAt} />
      </div>
      {promptGeneratorDialog}
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
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-[11px]" aria-hidden>
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
