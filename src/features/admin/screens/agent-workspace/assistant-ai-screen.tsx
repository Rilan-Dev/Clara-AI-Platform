"use client";

/**
 * src/features/admin/screens/agent-workspace/assistant-ai-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /orgs/[id]/agents/[agentId]/config — the "Assistant & AI" workspace tab.
 *
 *   Assistant & AI
 *   ├── Identity / Behaviour / Language / Voice / Preview  (reused ConfigEditor)
 *   └── AI models + runtime tools fed by the CAPABILITY RESOLVER (§14/§25)
 *
 * Edits target the mutable Main DRAFT (explicit draft state). "Save version"
 * creates an immutable version; publishing is a separate action. Platform
 * admins get the same read-only view as before.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { VoicePreviewButton } from "@/components/admin/VoicePreviewModal";
import { AgentWorkspaceHeader, useAgentWorkspaceContext } from "@/components/admin/agent-workspace/AgentWorkspaceHeader";
import { WorkspaceButton, VersionBadge, timeAgo } from "@/components/admin/ai-platform/shared";

export default function AgentAssistantAIScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const { context, loading: ctxLoading, refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [draft, setDraft] = useState<AgentDraftDTO | null>(null);
  const [options, setOptions] = useState<Partial<Record<AICapability, AgentAIOptionsDTO | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [versionSummary, setVersionSummary] = useState("");

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
      setOptions({ chat, voice_chat: voice, realtime_voice: realtime });
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
      if (!draft || !configValue) throw new Error("Draft not loaded");
      const next = {
        ...draft.configuration,
        assistant: { ...draft.configuration.assistant, ...data } as AgentDraftDTO["configuration"]["assistant"],
      };
      setSaving(true);
      try {
        const saved = await putAgentDraft(agentId, next);
        setDraft(saved);
        setMessage(`Draft saved ${new Date().toLocaleTimeString()}`);
        void refetchCtx();
        return { ...configValue, ...data };
      } finally {
        setSaving(false);
      }
    },
    [draft, configValue, agentId, refetchCtx],
  );

  const saveAISelection = useCallback(
    async (ai: AgentDraftDTO["configuration"]["ai"], runtime?: AgentDraftDTO["configuration"]["runtime"]) => {
      if (!draft) return;
      setSaving(true);
      try {
        const saved = await putAgentDraft(agentId, {
          ...draft.configuration,
          ai,
          runtime: runtime ?? draft.configuration.runtime,
        });
        setDraft(saved);
        setMessage(`Draft saved ${new Date().toLocaleTimeString()}`);
        void refetchCtx();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [draft, agentId, refetchCtx],
  );

  const saveVersion = useCallback(async () => {
    setSaving(true);
    try {
      await saveAgentVersion(agentId, versionSummary.trim() || null);
      setVersionSummary("");
      setMessage(`Version created — review it in Versions, then publish.`);
      void refetchCtx();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [agentId, versionSummary, refetchCtx]);

  if (ctxLoading || loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <AgentWorkspaceHeader tab="assistant" context={null} loading />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AgentWorkspaceHeader tab="assistant" context={context} loading={ctxLoading} />

      {error && (
        <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {/* Explicit draft state (§24) */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Draft
            {draft?.parentVersionNumber != null && (
              <VersionBadge tone="muted">based on v{draft.parentVersionNumber}</VersionBadge>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {draft ? `Saved ${timeAgo(draft.updatedAt)} — edits never touch production until you save a version and publish it.` : "…"}
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
            <WorkspaceButton variant="primary" onClick={saveVersion} disabled={saving || !draft}>
              Save version
            </WorkspaceButton>
            {previewKb && <VoicePreviewButton kbId={previewKb.id} kbName={previewKb.name} />}
          </div>
        )}
      </div>

      {message && (
        <p className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-primary">{message}</p>
      )}

      <div className="space-y-6">
        {/* AI model selection — capability resolver, no API keys, no provider health. */}
        {!isAdmin && (
          <AISelectionCard
            draft={draft}
            options={options}
            onSave={saveAISelection}
            previewKbId={previewKb?.id}
          />
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

        {configValue ? (
          isAdmin ? (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
              <p className="mb-4 text-sm text-muted-foreground">
                Platform admins can view assistant behavior but cannot edit it.
              </p>
              <ConfigEditor config={configValue} contextName={context?.agent.name ?? "this agent"} onSave={async () => configValue} />
            </div>
          ) : (
            <ConfigEditor config={configValue} contextName={context?.agent.name ?? "this agent"} onSave={saveDraft} />
          )
        ) : (
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            Draft could not be loaded for this agent.
          </p>
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
}: {
  draft: AgentDraftDTO | null;
  options: Partial<Record<AICapability, AgentAIOptionsDTO | null>>;
  onSave: (ai: AgentDraftDTO["configuration"]["ai"], runtime?: AgentDraftDTO["configuration"]["runtime"]) => void;
  previewKbId?: string;
}) {
  const [ai, setAi] = useState(draft?.configuration.ai ?? null);
  const [runtime, setRuntime] = useState(draft?.configuration.runtime ?? null);

  useEffect(() => {
    setAi(draft?.configuration.ai ?? null);
    setRuntime(draft?.configuration.runtime ?? null);
  }, [draft?.configuration.ai, draft?.configuration.runtime]);

  const chat = options.chat;
  const realtime = options.realtime_voice;

  const chatProviders = chat?.available ?? [];
  const realtimeProviders = realtime?.available ?? [];

  const pickProvider = (providerId: string | null, capability: AICapability) => {
    const next = { ...(ai ?? emptyAI()) };
    if (capability === "chat") {
      next.provider = providerId as never;
      next.chatModel = null;
    } else if (capability === "voice_chat") {
      next.voiceProvider = providerId as never;
    } else {
      next.realtimeVoiceProvider = providerId as never;
    }
    setAi(next);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">AI models</h3>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Only providers your plan and this platform currently allow are shown — no API keys, no provider health.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {chat?.entitlement.planName && (
            <VersionBadge tone={chat.entitlement.capabilityEnabled ? "success" : "warning"}>
              Plan: {chat.entitlement.planName} {chat.entitlement.capabilityEnabled ? "✓ included" : "· chat not included"}
            </VersionBadge>
          )}
        </div>
      </header>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {/* Chat provider + model */}
        <div>
          <p className="text-xs font-medium text-foreground/90">Chat provider</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chatProviders.length === 0 && (
              <p className="text-xs text-muted-foreground/70">No chat providers currently available.</p>
            )}
            {chatProviders.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => pickProvider(p.providerId, "chat")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  (ai?.provider ?? null) === p.providerId
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/25"
                }`}
              >
                {p.displayName} ✓
              </button>
            ))}
          </div>
          {chat && (
            <label className="mt-3 block">
              <span className="text-xs font-medium text-foreground/90">Chat model</span>
              <select
                value={ai?.chatModel ?? ""}
                onChange={(e) => setAi({ ...(ai ?? emptyAI()), chatModel: e.target.value || null })}
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Platform default</option>
                {(chatProviders.find((p) => p.providerId === (ai?.provider ?? chatProviders[0]?.providerId))?.models ?? []).map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.displayName}
                    {m.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Realtime voice provider (§25 — resolved availability, zero cross-checking) */}
        <div>
          <p className="text-xs font-medium text-foreground/90">Realtime voice</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {realtimeProviders.length === 0 && (
              <p className="text-xs text-muted-foreground/70">
                Realtime voice is not currently available{realtime?.entitlement.planName ? ` on the ${realtime.entitlement.planName} plan` : ""}.
              </p>
            )}
            {realtimeProviders.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => pickProvider(p.providerId, "realtime_voice")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  (ai?.realtimeVoiceProvider ?? ai?.voiceProvider ?? null) === p.providerId
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/25"
                }`}
              >
                {p.displayName} ✓
              </button>
            ))}
            {realtimeProviders.length > 0 && (
              <button
                type="button"
                onClick={() => pickProvider(null, "realtime_voice")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  (ai?.realtimeVoiceProvider ?? null) === null
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/25"
                }`}
              >
                Follow voice-chat
              </button>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground/70">
            {realtime?.entitlement.capabilityEnabled
              ? `✓ Ready for this agent${previewKbId ? " — test it in Preview" : ""}`
              : `Reason: not included in the ${realtime?.entitlement.planName ?? "current"} plan`}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
        <WorkspaceButton variant="primary" onClick={() => onSave(ai, runtime)} disabled={!ai && !runtime}>
          Save AI selection to draft
        </WorkspaceButton>
      </div>
    </section>
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
    realtimeVoiceProvider: null,
  };
}
