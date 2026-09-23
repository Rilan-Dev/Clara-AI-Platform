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
import { Sparkles } from "lucide-react";
import { useAuth, useKbs } from "@/modules/admin-ui/hooks";
import {
  fetchAgentAIOptions,
  fetchAgentDraft,
  putAgentDraft,
  saveAgentVersion,
  type AgentAIOptionsDTO,
  type AgentDraftDTO,
  type AICapability,
} from "@/modules/admin-ui/ai-platform-api";
import type { AssistantConfig } from "@/modules/admin-ui/api";
import { toast } from "@/components/ui/sonner";
import { ConfigEditor, type ProviderVoiceCatalog } from "@/components/admin/ConfigEditor";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";
import { useAgentWorkspaceContext } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { AutoSaveChip, WorkspaceButton, VersionBadge, timeAgo } from "@/components/admin/ai-platform/shared";
import { useAutoSave } from "@/hooks/use-auto-save";

export default function AgentAssistantAIScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, loading: ctxLoading, refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [draft, setDraft] = useState<AgentDraftDTO | null>(null);
  const [options, setOptions] = useState<Partial<Record<AICapability, AgentAIOptionsDTO | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionSummary, setVersionSummary] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);
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

  const { kbs } = useKbs(agentId);
  const previewKb = kbs[0];

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const [draftResult, chat, voice, realtime] = await Promise.all([
        fetchAgentDraft(agentId),
        fetchAgentAIOptions(agentId, "chat").catch(() => null),
        fetchAgentAIOptions(agentId, "voice_chat").catch(() => null),
        fetchAgentAIOptions(agentId, "realtime_voice").catch(() => null),
      ]);
      setDraft(draftResult);
      draftRef.current = draftResult;
      setOptions({ chat, voice_chat: voice, realtime_voice: realtime });
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
        void refetchCtx();
        return { ...configValue, ...data };
      });
    },
    [configValue, agentId, refetchCtx, enqueueDraftSave],
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
        void refetchCtx();
      });
    },
    [agentId, refetchCtx, enqueueDraftSave],
  );

  const saveVersion = useCallback(async () => {
    setSavingVersion(true);
    try {
      await saveAgentVersion(agentId, versionSummary.trim() || null);
      setVersionSummary("");
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingVersion(false);
    }
  }, [agentId, versionSummary, refetchCtx]);

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

  // ── Provider-synced voice catalog for the ConfigEditor Voices card ──────
  // Mirrors the organisation's selected Realtime Voice provider (the lift in
  // pickProvider keeps this live before the draft is even saved).
  const voiceCatalog = useMemo<ProviderVoiceCatalog | null>(() => {
    const realtime = options.realtime_voice;
    if (!realtime) return null; // options not loaded yet → OpenAI fallback inside the editor
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

      {/* Explicit draft state (§24) — edits auto-save; versions/publishing
          remain explicit actions (Save version / one-click Publish). */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Draft
            {draft?.parentVersionNumber != null && (
              <VersionBadge tone="muted">based on v{draft.parentVersionNumber}</VersionBadge>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {draft ? `Saved ${timeAgo(draft.updatedAt)} — edits auto-save into the draft and never touch production until you publish.` : "…"}
          </p>
        </div>
        {!isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={versionSummary}
              onChange={(e) => setVersionSummary(e.target.value)}
              placeholder="Change summary (optional)"
              className="w-52 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40"
            />
            <WorkspaceButton variant="primary" onClick={saveVersion} disabled={savingVersion || !draft}>
              Save version
            </WorkspaceButton>
            {previewKb && <VoicePreviewButton kbId={previewKb.id} kbName={previewKb.name} />}
          </div>
        )}
      </div>

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
            />
          )
        ) : (
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            Draft could not be loaded for this agent.
          </p>
        )}

        {/* AI model selection — capability resolver, no API keys, no provider
            health. Reached from the right-column LLM card. */}
        {!isAdmin && (
          <div id="ai-runtime-config" className="scroll-mt-24">
            <AISelectionCard
              draft={draft}
              options={options}
              onSave={saveAISelection}
              previewKbId={previewKb?.id}
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

// ─── AI model selection card (capability resolver driven) ─────────────────────

function AISelectionCard({
  draft,
  options,
  onSave,
  previewKbId,
  realtimeProviderId,
  onRealtimeProviderChange,
}: {
  draft: AgentDraftDTO | null;
  options: Partial<Record<AICapability, AgentAIOptionsDTO | null>>;
  onSave: (ai: AgentDraftDTO["configuration"]["ai"], runtime?: AgentDraftDTO["configuration"]["runtime"]) => Promise<void>;
  previewKbId?: string;
  /** Lifted realtime provider selection — keeps the ConfigEditor Voices card
   *  synced with the provider picked here, even before the draft is saved. */
  realtimeProviderId?: string | null;
  onRealtimeProviderChange?: (providerId: string | null) => void;
}) {
  const [ai, setAi] = useState(draft?.configuration.ai ?? null);
  const [runtime, setRuntime] = useState(draft?.configuration.runtime ?? null);
  const [surface, setSurface] = useState<AICapability>("chat");

  // ── Auto-save (no Save button): the AI selection persists ~0.8 s after a
  //    pick — these are discrete selects/sliders, so a shorter debounce than
  //    the free-text editor is right. Latest-wins, echo-guarded below.
  const selection = useMemo(
    () => ({ ai: ai ?? emptyAI(), runtime }),
    [ai, runtime],
  );

  const autoSave = useAutoSave({
    value: selection,
    save: async (value) => {
      await onSave(value.ai, value.runtime ?? undefined);
    },
    delay: 800,
    enabled: Boolean(draft),
    onError: (e) =>
      toast.error("Could not save the AI selection", { description: e.message }),
  });

  // Echo-guarded external reset — skip the parent's post-save echo so a
  // provider pick typed while a save is in flight is never reverted.
  useEffect(() => {
    const incoming = { ai: draft?.configuration.ai ?? emptyAI(), runtime: draft?.configuration.runtime ?? null };
    if (autoSave.baselineMatches(incoming)) return;
    setAi(draft?.configuration.ai ?? null);
    setRuntime(draft?.configuration.runtime ?? null);
    autoSave.resetBaseline(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.configuration.ai, draft?.configuration.runtime]);

  const chat = options.chat;
  const voiceChat = options.voice_chat;
  const realtime = options.realtime_voice;

  const pickProvider = (providerId: string | null, capability: AICapability) => {
    // Lift the realtime selection first so the ConfigEditor's Voices card
    // re-syncs to the newly selected provider immediately.
    if (capability === "realtime_voice") {
      onRealtimeProviderChange?.(providerId);
    }
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
      next.realtimeVoiceProvider = providerId as never;
      next.realtimeLlmModel = null;
      next.realtimeSttModel = null;
      next.realtimeTtsModel = null;
      next.realtimeVoiceId = null;
    }
    setAi(next);
  };

  const selectedProvider = surface === "chat"
    ? ai?.provider
    : surface === "voice_chat"
      ? ai?.voiceProvider
      : // Realtime surface follows the LIFTED selection so the provider list
        // and its model fields mirror what the Voices card is synced to.
        (realtimeProviderId ?? ai?.realtimeVoiceProvider);

  const selectedOptions =
    surface === "chat" ? chat :
    surface === "voice_chat" ? voiceChat :
    realtime;

  const selectedProviderOptions =
    selectedOptions?.available.find((p) => p.providerId === selectedProvider) ??
    selectedOptions?.available[0] ??
    null;

  const models = selectedProviderOptions?.models ?? [];
  const setAI = (patch: Partial<NonNullable<AgentDraftDTO["configuration"]["ai"]>>) =>
    setAi({ ...(ai ?? emptyAI()), ...patch });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header>
        <h3 className="text-sm font-semibold text-foreground">AI runtime configuration</h3>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Chat, Voice Chat and Realtime Voice are independent capability slots. Changing one does not change the others.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {([
          ["chat", "Chat", "LLM + RAG"],
          ["voice_chat", "Voice Chat", "STT → LLM → TTS"],
          ["realtime_voice", "Realtime Voice", "Realtime STT → LLM → TTS"],
        ] as const).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSurface(id)}
            className={`rounded-lg px-3 py-2 text-left transition-colors ${surface === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="block text-xs font-semibold">{label}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <p className="text-xs font-medium text-foreground/90">Provider</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(selectedOptions?.available ?? []).map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => pickProvider(p.providerId, surface)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${selectedProvider === p.providerId ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/25"}`}
              >
                {p.displayName}
              </button>
            ))}
            {(selectedOptions?.available ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground/70">No providers currently available.</p>
            )}
          </div>
        </div>

        {surface === "chat" && (
          <div className="grid gap-4 md:grid-cols-2">
            <ModelField label="Chat model" value={ai?.chatModel ?? ""}
              options={models.filter((m) => m.kind === "chat")}
              onChange={(value) => setAI({ chatModel: value || null })} />
            <InfoBox title="Chat only">
              This model is used by text chat and does not alter Voice Chat or Realtime Voice.
            </InfoBox>
          </div>
        )}

        {surface === "voice_chat" && (
          <div className="grid gap-4 md:grid-cols-2">
            <ModelField label="Voice Chat STT" value={ai?.voiceChatSttModel ?? ""}
              options={models.filter((m) => m.kind === "stt" || m.kind === "transcription")}
              onChange={(value) => setAI({ voiceChatSttModel: value || null })} />
            <ModelField label="Voice Chat TTS" value={ai?.voiceChatTtsModel ?? ""}
              options={models.filter((m) => m.kind === "tts")}
              onChange={(value) => setAI({ voiceChatTtsModel: value || null })} />
            <SelectField label="Voice Chat speaker" value={ai?.voiceChatVoiceId ?? ""}
              options={models.filter((m) => m.kind === "voice")}
              onChange={(value) => setAI({ voiceChatVoiceId: value || null })} />
            <InfoBox title="Turn-based voice">
              STT, TTS and speaker are stored separately from Realtime Voice.
            </InfoBox>
          </div>
        )}

        {surface === "realtime_voice" && (
          <div className="grid gap-4 md:grid-cols-2">
            <ModelField
              label={selectedProviderOptions?.providerId === "elevenlabs" ? "Realtime engine" : "Realtime LLM"}
              value={ai?.realtimeModel ?? ai?.realtimeLlmModel ?? ""}
              options={models.filter((m) =>
                selectedProviderOptions?.providerId === "elevenlabs"
                  ? m.kind === "realtime"
                  : m.kind === "realtime" || (selectedProviderOptions?.providerId === "sarvam" && m.kind === "chat"),
              )}
              onChange={(value) =>
                selectedProviderOptions?.providerId === "elevenlabs"
                  ? setAI({ realtimeModel: value || null, realtimeLlmModel: null })
                  : setAI({ realtimeLlmModel: value || null, realtimeModel: value || null })
              }
            />
            <ModelField label="Realtime STT" value={ai?.realtimeSttModel ?? ""}
              options={models.filter((m) => m.kind === "stt" || m.kind === "transcription")}
              onChange={(value) => setAI({ realtimeSttModel: value || null })} />
            <ModelField label="Realtime TTS" value={ai?.realtimeTtsModel ?? ""}
              options={models.filter((m) => m.kind === "tts")}
              onChange={(value) => setAI({ realtimeTtsModel: value || null })} />
            <SelectField label="Realtime speaker" value={ai?.realtimeVoiceId ?? ""}
              options={models.filter((m) => m.kind === "voice")}
              onChange={(value) => setAI({ realtimeVoiceId: value || null })} />
            <div className="md:col-span-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-muted-foreground/80">
              <p className="font-medium text-foreground/90">Realtime transport</p>
              <p className="mt-1">
                {selectedProviderOptions?.providerId === "elevenlabs"
                  ? "ElevenLabs Speech Engine owns realtime STT, turn-taking and TTS; Clara keeps the selected Chat provider as the LLM/RAG brain and streams response text to ElevenLabs over its authenticated Speech Engine WebSocket."
                  : "Realtime LLM, STT, TTS and speaker are persisted as their own slots. For Sarvam this maps to Saaras realtime + Sarvam conversational LLM + Bulbul."}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground/70">
          {selectedOptions?.entitlement.capabilityEnabled
            ? `✓ ${selectedOptions.entitlement.planName ? `Available on ${selectedOptions.entitlement.planName}` : "Capability available"}`
            : `Capability is not included in ${selectedOptions?.entitlement.planName ?? "the current plan"}`}
          {previewKbId ? " · Preview is available after publishing." : ""}
        </div>
      </div>

      {/* Auto-save footer — provider/model picks persist ~0.8 s after the
          change; publishing remains the explicit action in the topbar. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <p className="text-[11px] text-muted-foreground/70">
          Selections save automatically into the draft — publish from the top bar when ready.
        </p>
        <AutoSaveChip status={autoSave.status} savedAt={autoSave.savedAt} />
      </div>
    </section>
  );
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
