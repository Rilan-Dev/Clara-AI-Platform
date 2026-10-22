"use client";

/**
 * /orgs/[id]/agents/[agentId]/tools — the agent's runtime tools/capabilities.
 * These are REAL per-agent toggles (voice chat, realtime voice, public embed)
 * stored in the version configuration — no placeholder features.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchAgentAIOptions,
  fetchAgentDraft,
  putAgentDraft,
  type AgentDraftDTO,
  type AgentAIOptionsDTO,
  type AICapability,
} from "@/modules/admin-ui/ai-platform-api";
import { useAgentWorkspaceContext } from "@/features/admin/screens/agent-workspace/workspace-shell";
import { VersionBadge } from "@/components/admin/ai-platform/shared";
import { useAuth } from "@/modules/admin-ui/hooks";
import { cn } from "@/lib/utils";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

export default function AgentToolsScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.isSuperAdmin ?? false;
  const features = usePlatformFeatures();
  const { refetch: refetchCtx } = useAgentWorkspaceContext(agentId);

  const [draft, setDraft] = useState<AgentDraftDTO | null>(null);
  const [options, setOptions] = useState<Partial<Record<AICapability, AgentAIOptionsDTO | null>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    void Promise.all([
      fetchAgentDraft(agentId),
      fetchAgentAIOptions(agentId, "voice_chat").catch(() => null),
      fetchAgentAIOptions(agentId, "realtime_voice").catch(() => null),
    ])
      .then(([draftResult, voice, realtime]) => {
        setDraft(draftResult);
        setOptions({ voice_chat: voice, realtime_voice: realtime });
      })
      .catch(() => setDraft(null));
  }, [agentId]);

  const save = useCallback(
    async (runtime: NonNullable<AgentDraftDTO["configuration"]["runtime"]>) => {
      if (!draft) return;
      setBusy(true);
      try {
        const saved = await putAgentDraft(agentId, { ...draft.configuration, runtime });
        setDraft(saved);
        setMessage(`Saved to draft ${new Date().toLocaleTimeString()}`);
        void refetchCtx();
      } finally {
        setBusy(false);
      }
    },
    [draft, agentId, refetchCtx],
  );

  const runtime = draft?.configuration.runtime ?? { enableVoice: true, enableRealtime: true, enablePublicEmbed: true };
  const voiceOptions = options.voice_chat;
  const realtimeOptions = options.realtime_voice;

  return (
    <div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Capabilities</h2>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Runtime capabilities for this agent. Availability comes from the platform and your plan —
          you never have to cross-check other screens.
        </p>

        <ul className="mt-4 space-y-3">
          <ToolRow
            title="Voice chat"
            blurb="Turn-based speech: visitors speak, Clara thinks, then answers aloud."
            available={voiceOptions?.entitlement.capabilityEnabled !== false}
            availableLabel={
              voiceOptions?.entitlement.planName
                ? voiceOptions.entitlement.capabilityEnabled
                  ? `Included in ${voiceOptions.entitlement.planName}`
                  : `Not included in ${voiceOptions.entitlement.planName}`
                : null
            }
            enabled={runtime.enableVoice}
            disabled={isAdmin || busy || !draft}
            onToggle={(next) => void save({ ...runtime, enableVoice: next })}
          />
          <ToolRow
            title="Realtime voice"
            blurb="Continuous low-latency conversation with a realtime voice provider."
            available={realtimeOptions?.entitlement.capabilityEnabled !== false && (realtimeOptions?.available.length ?? 0) > 0}
            availableLabel={
              realtimeOptions?.entitlement.planName
                ? realtimeOptions.entitlement.capabilityEnabled && (realtimeOptions?.available.length ?? 0) > 0
                  ? `Included in ${realtimeOptions.entitlement.planName}`
                  : "No realtime provider currently available"
                : null
            }
            enabled={runtime.enableRealtime}
            disabled={isAdmin || busy || !draft}
            onToggle={(next) => void save({ ...runtime, enableRealtime: next })}
          />
          {features.embeddableWidget && <ToolRow
            title="Public embed"
            blurb="Allow the chat widget on external websites (embed keys are managed separately)."
            available
            availableLabel="Embed key required"
            enabled={runtime.enablePublicEmbed}
            disabled={isAdmin || busy || !draft}
            onToggle={(next) => void save({ ...runtime, enablePublicEmbed: next })}
          />}
        </ul>

        {message && <p className="mt-4 text-xs text-primary">{message}</p>}
      </section>
    </div>
  );
}

function ToolRow({
  title,
  blurb,
  available,
  availableLabel,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  blurb: string;
  available: boolean;
  availableLabel: string | null;
  enabled: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground/90">
          {title}
          {availableLabel && <VersionBadge tone={available ? "success" : "muted"}>{availableLabel}</VersionBadge>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{blurb}</p>
      </div>
      <button
        type="button"
        aria-label={`Toggle ${title}`}
        disabled={disabled || !available}
        onClick={() => onToggle(!enabled)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          enabled && available ? "bg-primary" : "bg-muted",
        )}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", enabled ? "left-[1.4rem]" : "left-0.5")} />
      </button>
    </li>
  );
}
