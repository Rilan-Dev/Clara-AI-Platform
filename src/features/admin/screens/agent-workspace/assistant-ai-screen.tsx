"use client";

/**
 * src/features/admin/screens/agent-workspace/assistant-ai-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/config — the "Assistant & AI" workspace tab.
 *
 *   Assistant & AI
 *   ├── Agent editor first (ConfigEditor, ElevenLabs "Agent" page)
 *   └── AI models + runtime tools fed by the CAPABILITY RESOLVER (§14/§25)
 *
 * VOICE SYNC: the Realtime Voice provider chosen in the AI runtime
 * configuration feeds the ConfigEditor Voices card — the speaker list
 * always mirrors the selected provider's available voices and updates the
 * moment the provider changes (even before the draft is saved).
 *
 * Edits target the mutable Main DRAFT (explicit draft state). "Save version"
 * creates an immutable version; publishing is one click from the workspace
 * header. Platform admins get the same read-only view as before.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ChevronRight, Cpu, Mic, Radio, Settings2 } from "lucide-react";
import { useAuth } from "@/modules/admin-ui/hooks";
import {
  fetchAgentAIOptions,
  fetchAgentDraft,
  generateAgentSystemPrompt,
  putAgentDraft,
  translateAgentText,
  type AgentAIOptionsDTO,
  type AgentDraftDTO,
  type AICapability,
} from "@/modules/admin-ui/ai-platform-api";
import type { AssistantConfig } from "@/modules/admin-ui/api";
import { toast } from "@/components/ui/sonner";
import { ConfigEditor, type ProviderVoiceCatalog } from "@/components/admin/ConfigEditor";
import { useAgentWorkspaceContext } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { AutoSaveChip } from "@/components/admin/ai-platform/shared";
import { cn } from "@/lib/utils";
import { useAutoSave } from "@/hooks/use-auto-save";
import { AgentRetrievalSettings } from "@/features/admin/components/retrieval-settings";

export default function AgentAssistantAIScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, loading: ctxLoading } = useAgentWorkspaceContext(agentId);

  const [draft, setDraft] = useState<AgentDraftDTO | null>(null);
  const [options, setOptions] = useState<Partial<Record<AICapability, AgentAIOptionsDTO | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lifted realtime provider selection — drives the ConfigEditor voice list so
  // picking a provider here instantly syncs the voices over there.
  const [realtimeProviderId, setRealtimeProviderId] = useState<string | null>(null);

  // ── Draft write safety ────────────────────────────────────────────────────
  // Auto-save fires from several editors on this screen (persona fields + AI
  // selection). Two guards keep them coherent:
  //   • draftRef — every save builds from the FRESHEST draft, not a stale
  //     React closure, so one save never reverts another's fields.
  //   • a serialized write queue — draft PUTs never interleave.
  const draftRef = useRef<AgentDraftDTO | null>(null);
  draftRef.current = draft;
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueDraftSave = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = saveQueueRef.current.then(fn, fn);
    saveQueueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      // Initial config load is intentionally one request. Capability catalogs
      // are loaded only when the user opens that capability's half-canvas.
      const draftResult = await fetchAgentDraft(agentId);
      setDraft(draftResult);
      draftRef.current = draftResult;
      setRealtimeProviderId((prev) => prev ?? draftResult.configuration.ai?.realtimeVoiceProvider ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);


  // The reused ConfigEditor consumes the legacy AssistantConfig shape — fed
  // from the draft's assistant section (voiceGreeting is legacy and unused by
  // the editor — carried through untouched).
  const configValue = useMemo<AssistantConfig | null>(() => {
    if (!draft || !context) return null;
    return {
      ...(draft.configuration.assistant as unknown as AssistantConfig),
      voiceGreeting: (draft.configuration.assistant as unknown as Record<string, unknown>).voiceGreeting as string | undefined ?? "",
      id: `draft:${draft.id}`,
      agentId: context.agent.id,
      createdAt: draft.updatedAt,
      updatedAt: draft.updatedAt,
    };
  }, [draft, context]);

  const saveDraft = useCallback(
    async (data: Partial<AssistantConfig>): Promise<AssistantConfig> => {
      if (!configValue) throw new Error("Draft not loaded");
      return enqueueDraftSave(async () => {
        const current = draftRef.current;
        if (!current) throw new Error("Draft not loaded");
        const next = {
          ...current.configuration,
          assistant: { ...current.configuration.assistant, ...data } as AgentDraftDTO["configuration"]["assistant"],
        };
        const saved = await putAgentDraft(agentId, next);
        draftRef.current = saved;
        setDraft(saved);
        window.dispatchEvent(new CustomEvent("agent-workspace:draft-updated", {
          detail: { agentId, draftUpdatedAt: saved.updatedAt },
        }));
        return { ...configValue, ...data };
      });
    },
    [configValue, agentId, enqueueDraftSave],
  );

  const saveAISelection = useCallback(
    async (ai: AgentDraftDTO["configuration"]["ai"], runtime?: AgentDraftDTO["configuration"]["runtime"]) => {
      return enqueueDraftSave(async () => {
        const current = draftRef.current;
        if (!current) throw new Error("Draft not loaded");
        const saved = await putAgentDraft(agentId, {
          ...current.configuration,
          ai,
          runtime: runtime ?? current.configuration.runtime,
        });
        draftRef.current = saved;
        setDraft(saved);
        window.dispatchEvent(new CustomEvent("agent-workspace:draft-updated", {
          detail: { agentId, draftUpdatedAt: saved.updatedAt },
        }));
      });
    },
    [agentId, enqueueDraftSave],
  );

  /** LLM summary for the right-column card (agent variant ConfigEditor). */
  const llmSummary = useMemo(() => {
    const ai = draft?.configuration.ai;
    if (!ai) return null;
    const parts: string[] = [];
    if (ai.provider) parts.push(String(ai.provider));
    if (ai.chatModel) parts.push(String(ai.chatModel));
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [draft?.configuration.ai]);

  /** Scroll from the LLM card to the full AI runtime configuration below. */
  const openAISettings = useCallback(() => {
    document.getElementById("ai-runtime-config")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /** Drafts a system prompt from this agent's knowledge bases (reviewed in
   *  the ConfigEditor dialog before it touches the draft). */
  const generateSystemPrompt = useCallback(
    (template: string, notes: string) => generateAgentSystemPrompt(agentId, { template, notes }),
    [agentId],
  );

  /** Translates the first message for review (first-message language menu). */
  const translateText = useCallback(
    async (text: string, targetLanguage: string) =>
      (await translateAgentText(agentId, { text, targetLanguage })).translatedText,
    [agentId],
  );

  // ── Provider-synced voice catalog for the ConfigEditor Voices card ──────
  // Mirrors the organisation's selected Realtime Voice provider (the lift in
  // pickProvider keeps this live before the draft is even saved).
  const voiceCatalog = useMemo<ProviderVoiceCatalog | null>(() => {
    const realtime = options.realtime_voice;
    if (!realtime) {
      return {
        providerId: realtimeProviderId ?? "__realtime_pending__",
        providerName: "Realtime Voice",
        voices: [],
      };
    }
    const provider =
      realtime.available.find((p) => p.providerId === realtimeProviderId) ??
      realtime.available.find((p) => p.isDefault) ??
      realtime.available[0] ??
      null;
    if (!provider) {
      return { providerId: "__none__", providerName: "Realtime Voice", voices: [] };
    }
    return {
      providerId: provider.providerId,
      providerName: provider.displayName,
      voices: provider.voices.map((v) => ({
        id: v.modelId,
        label: v.displayName,
        description: v.isDefault ? "Provider default" : undefined,
        isDefault: v.isDefault,
      })),
    };
  }, [options.realtime_voice, realtimeProviderId]);

  if (ctxLoading || loading) {
    return (
      <div>
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      </div>
    );
  }

  return (
    <div>

      {error && (
        <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-6">
        {/* Agent editor first (ElevenLabs "Agent" page): system prompt +
            first message on the left, settings cards on the right. */}
        {configValue ? (
          isAdmin ? (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
              <p className="mb-4 text-sm text-muted-foreground">
                Platform admins can view assistant behavior but cannot edit it.
              </p>
              <ConfigEditor config={configValue} contextName={context?.agent.name ?? "this agent"} onSave={async () => configValue} readOnly />
            </div>
          ) : (
            <ConfigEditor
              config={configValue}
              contextName={context?.agent.name ?? "this agent"}
              onSave={saveDraft}
              variant="agent"
              llmSummary={llmSummary ?? undefined}
              onOpenAISettings={openAISettings}
              voiceCatalog={voiceCatalog}
              onGenerateSystemPrompt={generateSystemPrompt}
              onTranslateText={translateText}
            />
          )
        ) : (
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            Draft could not be loaded for this agent.
          </p>
        )}

        {!isAdmin && <AgentRetrievalSettings agentId={agentId} />}
        {/* AI model selection — capability resolver, no API keys, no provider
            health. Reached from the right-column LLM card. */}
        {!isAdmin && (
          <div id="ai-runtime-config" className="scroll-mt-24">
            <AISelectionCard
              agentId={agentId}
              draft={draft}
              options={options}
              onSave={saveAISelection}
              onOptionsLoaded={(capability, value) => setOptions((prev) => ({ ...prev, [capability]: value }))}
              realtimeProviderId={realtimeProviderId}
              onRealtimeProviderChange={setRealtimeProviderId}
            />
          </div>
        )}
        {isAdmin && draft && (
          <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-foreground">AI models</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              {draft.configuration.ai?.provider
                ? `Chat provider: ${draft.configuration.ai.provider}${draft.configuration.ai.chatModel ? ` · ${draft.configuration.ai.chatModel}` : ""}`
                : "Using platform defaults"}
              {draft.configuration.ai?.voiceProvider ? ` · Voice: ${draft.configuration.ai.voiceProvider}` : ""}
              {draft.configuration.ai?.realtimeVoiceProvider ? ` · Realtime: ${draft.configuration.ai.realtimeVoiceProvider}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI provider selection workspace ─────────────────────────────────────────

function AISelectionCard({
  agentId,
  draft,
  options,
  onSave,
  onOptionsLoaded,
  realtimeProviderId,
  onRealtimeProviderChange,
}: {
  agentId: string;
  draft: AgentDraftDTO | null;
  options: Partial<Record<AICapability, AgentAIOptionsDTO | null>>;
  onSave: (ai: AgentDraftDTO["configuration"]["ai"], runtime?: AgentDraftDTO["configuration"]["runtime"]) => Promise<void>;
  onOptionsLoaded: (capability: AICapability, value: AgentAIOptionsDTO) => void;
  realtimeProviderId?: string | null;
  onRealtimeProviderChange?: (providerId: string | null) => void;
}) {
  const [ai, setAi] = useState(draft?.configuration.ai ?? null);
  const [runtime, setRuntime] = useState(draft?.configuration.runtime ?? null);
  const [surface, setSurface] = useState<AICapability | null>(null);
  const [loadingCapability, setLoadingCapability] = useState<AICapability | null>(null);

  const selection = useMemo(() => ({ ai: ai ?? emptyAI(), runtime }), [ai, runtime]);
  const autoSave = useAutoSave({
    value: selection,
    save: async (value) => onSave(value.ai, value.runtime ?? undefined),
    delay: 800,
    enabled: Boolean(draft),
    onError: (e) => toast.error("Could not save the AI selection", { description: e.message }),
  });

  useEffect(() => {
    const incoming = {
      ai: draft?.configuration.ai ?? emptyAI(),
      runtime: draft?.configuration.runtime ?? null,
    };
    if (autoSave.baselineMatches(incoming)) return;
    setAi(draft?.configuration.ai ?? null);
    setRuntime(draft?.configuration.runtime ?? null);
    autoSave.resetBaseline(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.configuration.ai, draft?.configuration.runtime]);

  // Local setter is kept in the component so opening one canvas does not
  // trigger a route refresh or reload unrelated sections.
  const [localOptions, setLocalOptions] = useState(options);
  useEffect(() => setLocalOptions(options), [options]);

  const loadCapability = useCallback(async (capability: AICapability) => {
    if (localOptions[capability]) {
      setSurface(capability);
      return;
    }
    if (!draft) return;
    setSurface(capability);
    setLoadingCapability(capability);
    try {
      const result = await fetchAgentAIOptions(agentId, capability);
      setLocalOptions((prev) => ({ ...prev, [capability]: result }));
      onOptionsLoaded(capability, result);
    } catch (err) {
      setSurface(null);
      toast.error("Could not load providers", { description: (err as Error).message });
    } finally {
      setLoadingCapability(null);
    }
  }, [localOptions, draft, agentId, onOptionsLoaded]);

  const pickProvider = (providerId: string | null, capability: AICapability) => {
    if (capability === "realtime_voice") onRealtimeProviderChange?.(providerId);
    const next = { ...(ai ?? emptyAI()) };
    if (capability === "chat") {
      next.provider = providerId as never;
      next.chatModel = null;
    } else if (capability === "voice_chat") {
      next.voiceProvider = providerId as never;
      next.voiceChatSttModel = null;
      next.voiceChatTtsModel = null;
      next.voiceChatVoiceId = null;
    } else {
      // Realtime Voice provider is the SPEECH transport axis. It must not
      // overwrite Clara's brain/realtime LLM selection. ElevenLabs realtime
      // therefore changes STT/TTS/voice transport only; Clara still owns RAG
      // and the response model.
      next.realtimeVoiceProvider = providerId as never;
      next.realtimeSttModel = null;
      next.realtimeTtsModel = null;
      next.realtimeVoiceId = null;
    }
    setAi(next);
  };

  const setAI = (patch: Partial<NonNullable<AgentDraftDTO["configuration"]["ai"]>>) =>
    setAi({ ...(ai ?? emptyAI()), ...patch });

  const cards: Array<{
    id: AICapability;
    label: string;
    description: string;
    provider: string | null;
    model: string | null;
    icon: typeof Cpu;
  }> = [
    {
      id: "chat",
      label: "Chat",
      description: "LLM + RAG",
      provider: ai?.provider ?? null,
      model: ai?.chatModel ?? null,
      icon: Cpu,
    },
    {
      id: "voice_chat",
      label: "Voice Chat",
      description: "STT → LLM → TTS",
      provider: ai?.voiceProvider ?? null,
      model: ai?.voiceChatTtsModel ?? ai?.voiceChatSttModel ?? null,
      icon: Mic,
    },
    {
      id: "realtime_voice",
      label: "Realtime Voice",
      description: "Realtime STT → LLM → TTS",
      provider: realtimeProviderId ?? ai?.realtimeVoiceProvider ?? null,
      model: ai?.realtimeModel ?? ai?.realtimeLlmModel ?? null,
      icon: Radio,
    },
  ];

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI configuration</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground/70">
              Choose the provider and model for each capability. Changes stay in the draft and never reload the page.
            </p>
          </div>
          <AutoSaveChip status={autoSave.status} savedAt={autoSave.savedAt} />
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const saving = autoSave.status === "saving" && surface === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => void loadCapability(card.id)}
                className={cn(
                  "group relative rounded-xl border bg-background/60 p-4 text-left transition-all",
                  "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm",
                  saving && "animate-pulse ring-2 ring-primary/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/80 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{card.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{card.description}</p>
                <div className="mt-4 rounded-lg border border-border/70 bg-card px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Provider</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-foreground">
                    {prettyProvider(card.provider)}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {card.model ?? "Platform default"}
                  </p>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  Configure <Settings2 className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {surface && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${capabilityLabel(surface)} configuration`}>
          <button type="button" aria-label="Close configuration" onClick={() => setSurface(null)}
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" />
          <aside className="absolute right-0 top-0 flex h-full w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden [overflow-wrap:anywhere] border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">AI runtime</p>
                <h2 className="mt-1 text-base font-semibold text-foreground">{capabilityLabel(surface)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a provider first, then configure only the models used by this capability.
                </p>
              </div>
              <button type="button" onClick={() => setSurface(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Close</button>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {loadingCapability === surface && !localOptions[surface] ? (
                <div className="space-y-3">
                  <div className="h-14 animate-pulse rounded-xl bg-muted/60" />
                  <div className="h-32 animate-pulse rounded-xl bg-muted/60" />
                  <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
                </div>
              ) : (
                <CapabilityEditor
                  capability={surface}
                  ai={ai ?? emptyAI()}
                  options={localOptions[surface] ?? null}
                  selectedProvider={surface === "chat" ? ai?.provider : surface === "voice_chat" ? ai?.voiceProvider : realtimeProviderId ?? ai?.realtimeVoiceProvider}
                  onProviderChange={pickProvider}
                  onAIChange={setAI}
                />
              )}
            </div>

            <div className="border-t border-border px-6 py-3">
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>Changes save automatically to the draft.</span>
                <AutoSaveChip status={autoSave.status} savedAt={autoSave.savedAt} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function CapabilityEditor({
  capability,
  ai,
  options,
  selectedProvider,
  onProviderChange,
  onAIChange,
}: {
  capability: AICapability;
  ai: NonNullable<AgentDraftDTO["configuration"]["ai"]>;
  options: AgentAIOptionsDTO | null;
  selectedProvider?: string | null;
  onProviderChange: (providerId: string | null, capability: AICapability) => void;
  onAIChange: (patch: Partial<NonNullable<AgentDraftDTO["configuration"]["ai"]>>) => void;
}) {
  const provider = options?.available.find((p) => p.providerId === selectedProvider) ?? null;
  const providers = options?.available ?? [];
  const models = provider?.models ?? [];
  // The realtime provider controls speech transport. Clara's configured chat
  // provider controls the realtime LLM, so selecting ElevenLabs must never
  // replace the brain provider or make an ElevenLabs TTS model masquerade as
  // the LLM.
  const brainProvider = options?.available.find((p) => p.providerId === ai.provider) ?? null;
  const brainRealtimeModels = brainProvider?.models.filter((m) => m.kind === "realtime" || (ai.provider === "sarvam" && m.kind === "chat")) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-foreground">Provider</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <button key={p.providerId} type="button" onClick={() => onProviderChange(p.providerId, capability)}
              className={cn("rounded-xl border px-4 py-3 text-left transition-colors",
                selectedProvider === p.providerId ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/25 hover:bg-muted/30")}>
              <p className="text-sm font-medium text-foreground">{p.displayName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{p.health}</p>
            </button>
          ))}
          {providers.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-xs text-muted-foreground">
              No enabled providers are available for this capability.
            </div>
          )}
        </div>
      </div>

      {capability === "chat" && (
        <div className="grid gap-4">
          <ModelField label="Chat LLM" value={ai.chatModel ?? ""} options={models.filter((m) => m.kind === "chat")}
            onChange={(value) => onAIChange({ chatModel: value || null })} />
          <InfoBox title="LLM used by Chat and RAG">
            This selection controls the language model used for text conversations. Knowledge retrieval remains on Clara&apos;s existing knowledge-base pipeline.
          </InfoBox>
        </div>
      )}

      {capability === "voice_chat" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField label="Voice Chat STT" value={ai.voiceChatSttModel ?? ""} options={models.filter((m) => m.kind === "stt" || m.kind === "transcription")}
            onChange={(value) => onAIChange({ voiceChatSttModel: value || null })} />
          <ModelField label="Voice Chat TTS" value={ai.voiceChatTtsModel ?? ""} options={models.filter((m) => m.kind === "tts")}
            onChange={(value) => onAIChange({ voiceChatTtsModel: value || null })} />
          <SelectField label="Voice Chat speaker" value={ai.voiceChatVoiceId ?? ""} options={models.filter((m) => m.kind === "voice")}
            onChange={(value) => onAIChange({ voiceChatVoiceId: value || null })} />
          <InfoBox title="LLM path">
            Voice Chat uses the selected Chat LLM for generation while this provider controls the turn-based speech pipeline.
          </InfoBox>
        </div>
      )}

      {capability === "realtime_voice" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField label="Clara Realtime LLM"
            value={ai.realtimeLlmModel ?? ai.realtimeModel ?? ""}
            options={brainRealtimeModels}
            onChange={(value) => onAIChange({
              realtimeLlmModel: value || null,
              realtimeModel: value || null,
            })} />
          <ModelField label="Realtime STT" value={ai.realtimeSttModel ?? ""} options={models.filter((m) => m.kind === "stt" || m.kind === "transcription")}
            onChange={(value) => onAIChange({ realtimeSttModel: value || null })} />
          <ModelField label="Realtime TTS" value={ai.realtimeTtsModel ?? ""} options={models.filter((m) => m.kind === "tts")}
            onChange={(value) => onAIChange({ realtimeTtsModel: value || null })} />
          <SelectField label="Realtime speaker" value={ai.realtimeVoiceId ?? ""} options={models.filter((m) => m.kind === "voice")}
            onChange={(value) => onAIChange({ realtimeVoiceId: value || null })} />
          <div className="sm:col-span-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-muted-foreground/80">
            {provider?.providerId === "elevenlabs"
              ? "ElevenLabs is used only for realtime speech transport (Scribe STT + Flash TTS). Clara remains responsible for the realtime LLM, Qdrant knowledge base, memory and tools."
              : "Realtime speech settings are stored independently from Chat and Voice Chat; the Clara realtime LLM remains a separate selection."}
          </div>
        </div>
      )}
    </div>
  );
}

function capabilityLabel(capability: AICapability): string {
  return capability === "chat" ? "Chat" : capability === "voice_chat" ? "Voice Chat" : "Realtime Voice";
}

function prettyProvider(providerId: string | null): string {
  if (!providerId) return "Platform default";
  return providerId.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function ModelField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Array<{ modelId: string; displayName: string; kind: string; isDefault: boolean }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground/90">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
        <option value="">Platform default</option>
        {options.map((m) => <option key={m.modelId} value={m.modelId}>{m.displayName}{m.isDefault ? " (default)" : ""}</option>)}
      </select>
    </label>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ modelId: string; displayName: string; kind: string; isDefault: boolean }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground/90">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
        <option value="">Platform default</option>
        {options.map((m) => <option key={m.modelId} value={m.modelId}>{m.displayName}{m.isDefault ? " (default)" : ""}</option>)}
      </select>
    </label>
  );
}

function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground/80">
      <p className="font-medium text-foreground/90">{title}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function emptyAI() {
  return {
    provider: null,
    chatModel: null,
    embeddingModel: null,
    realtimeModel: null,
    transcriptionModel: null,
    voiceProvider: null,
    voiceChatSttModel: null,
    voiceChatTtsModel: null,
    voiceChatVoiceId: null,
    realtimeVoiceProvider: null,
    realtimeLlmModel: null,
    realtimeSttModel: null,
    realtimeTtsModel: null,
    realtimeVoiceId: null,
  };
}
