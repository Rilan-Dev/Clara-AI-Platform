"use client";

/**
 * src/features/agent-conversation/screens/published-agent-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /agents/:agentId — the PUBLIC PUBLISHED agent page.
 *
 * A standalone, publicly accessible experience serving ONLY the immutable
 * published state: branding, persona and knowledge come from the production
 * version, and every chat/voice request resolves to the deployment's frozen
 * KB snapshot — unpublished draft edits can never appear here. Referenced
 * UI/UX directions (own design, not copies):
 *   • Published chat          — pasted_image_1790170491254.png
 *   • Published realtime voice — pasted_image_1790170695981.png
 *
 * Transport: the public config endpoint mints a short-lived signed session
 * token that the existing embed stack accepts (chat via /api/embed/chat,
 * realtime voice via the embed session multiplexer) — org plan quotas, hourly
 * rate limits and the publication re-check apply on every request. If the
 * agent is unpublished or flipped private, the page renders an elegant
 * "not available" state and every API call is rejected server-side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { ConversationChatWindow } from "../components/conversation-chat-window";
import { useAgentConversation } from "../hooks/use-agent-conversation";

// ─── Public config payload (GET /api/public/agents/:agentId/config) ─────────

type PublicAgentConfig = {
  agent: { id: string; name: string };
  published: { versionNumber: number; branchName: string; publishedAt: string };
  assistant: {
    assistantName: string;
    avatarUrl: string | null;
    welcomeMessage: string;
    primaryColour: string;
    accentColour: string;
    defaultLanguage: string;
    allowedLanguages: string[];
    alwaysRespondIn: string | null;
    strictMode: boolean;
    citeSources: boolean;
  } | null;
  voice: { enabled: boolean; realtime: boolean; provider: string | null; voiceChatProvider?: string | null };
  kb: { id: string; name: string };
  sessionToken: string;
};

// Public pages must never expose provider credentials, internal provider errors,
// stack traces, endpoint details, or other backend implementation messages.
function getPublicConversationError(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  const normalized = error.toLowerCase();
  const sensitiveProviderError =
    normalized.includes("no configured credentials") ||
    normalized.includes("configured credentials") ||
    normalized.includes("api key") ||
    normalized.includes("apikey") ||
    normalized.includes("credential") ||
    normalized.includes("authorization") ||
    normalized.includes("bearer ") ||
    normalized.includes("provider") && (normalized.includes("key") || normalized.includes("secret") || normalized.includes("token"));

  if (sensitiveProviderError) {
    return "This assistant is temporarily unavailable. Please try again later.";
  }

  if (normalized.includes("expired")) {
    return "Your session has expired. Please try again.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("quota")) {
    return "This assistant is busy right now. Please try again in a moment.";
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "The assistant took too long to respond. Please try again.";
  }

  return "The assistant could not complete that request. Please try again.";
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-lg bg-white/40",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent",
        className,
      )}
    />
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center space-y-3 pt-6">
        <Shimmer className="h-16 w-16 rounded-full" />
        <Shimmer className="h-6 w-48" />
        <Shimmer className="h-4 w-72" />
      </div>
      <Shimmer className="h-[30rem] rounded-3xl" />
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PublishedAgentScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();

  const [config, setConfig] = useState<PublicAgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    try {
      const res = await fetch(apiUrl(`/api/public/agents/${agentId}/config`), {
        cache: "no-store",
      });
      if (!res.ok) {
        // 404 covers not-found, unpublished and private agents alike.
        setUnavailable(true);
        return;
      }
      const data = (await res.json()) as PublicAgentConfig;
      setConfig(data);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionToken = config?.sessionToken ?? null;
  const kbId = config?.kb.id ?? null;
  const assistantName = config?.assistant?.assistantName ?? config?.agent.name ?? "Assistant";
  const primaryColour = config?.assistant?.primaryColour || "#6366f1";
  const accentColour = config?.assistant?.accentColour || "#8b5cf6";

  const chatHeaders = useMemo(
    () =>
      sessionToken
        ? { Authorization: `Bearer ${sessionToken}` }
        : undefined,
    [sessionToken],
  );

  const conversation = useAgentConversation({
    kbId,
    embedApiKey: sessionToken ?? undefined,
    assistantName,
    voiceGreeting: config?.assistant?.welcomeMessage || undefined,
    language: config?.assistant
      ? { assistant: config.assistant.defaultLanguage || "en", customer: config.assistant.allowedLanguages }
      : undefined,
    chatEndpoint: "/api/public/chat",
    chatHeaders,
  });

  // Voice availability comes from the public config (server-side published
  // state) — the embed session multiplexer is never probed just for status.
  useEffect(() => {
    if (!config) return;
    conversation.setExternalVoiceAvailability(
      config.voice
        ? {
            provider: config.voice.provider ?? "unknown",
            voiceProvider: config.voice.provider ?? undefined,
            voiceChatProvider: config.voice.voiceChatProvider ?? undefined,
            voiceEnabled: config.voice.enabled,
            realtimeEnabled: config.voice.realtime,
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Session-token expiry recovery: silently re-mint when the chat stream
  // reports an expired public session (tokens live ~2 h).
  useEffect(() => {
    if (conversation.chatError?.toLowerCase().includes("expired")) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.chatError]);

  const publicConversationError = getPublicConversationError(conversation.chatError ?? conversation.voiceStartError);

  const voiceAvailable = Boolean(kbId) && Boolean(config?.voice.enabled && config?.voice.realtime);
  const voiceUnavailableReason = !kbId
    ? "This assistant has no knowledge base."
    : !config?.voice.enabled
      ? "Voice is disabled for this assistant."
      : !config?.voice.realtime
        ? "Realtime voice is disabled for this assistant."
        : null;

  // ── Unavailable state ───────────────────────────────────────────────────
  if (unavailable) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-md rounded-3xl border border-black/5 bg-white/80 p-10 text-center shadow-xl shadow-black/[0.03] backdrop-blur">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MessageCircleQuestion className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">This assistant isn&apos;t available</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The assistant may have been unpublished or set to private by its owner. If you believe
            this is a mistake, please reach out to them directly.
          </p>
        </div>
      </PublicShell>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading && !config) {
    return (
      <PublicShell>
        <PageSkeleton />
      </PublicShell>
    );
  }

  if (!config) {
    return (
      <PublicShell>
        <PageSkeleton />
      </PublicShell>
    );
  }

  // ── Published experience ─────────────────────────────────────────────────
  return (
    <PublicShell primaryColour={primaryColour} accentColour={accentColour}>
      <div className="h-dvh w-full overflow-hidden">
        <main className="h-dvh min-h-0 w-full">
          <div className="h-full min-h-0 w-full overflow-hidden bg-white/35 backdrop-blur-xl dark:bg-black/10">
            <ConversationChatWindow
              assistantName={assistantName}
              avatarUrl={config.assistant?.avatarUrl ?? null}
              primaryColour={primaryColour}
              accentColour={accentColour}
              welcomeMessage={config.assistant?.welcomeMessage ?? ""}
              messages={conversation.messages}
              thinking={conversation.thinking}
              chatError={publicConversationError}
              input={conversation.input}
              onInputChange={conversation.setInput}
              onSend={() => void conversation.sendText()}
              sendDisabled={!kbId || conversation.voiceActive}
              placeholder={kbId ? `Ask ${assistantName} anything…` : "Unavailable"}
              citeSources={config.assistant?.citeSources !== false}
              voiceAvailable={voiceAvailable}
              voiceUnavailableReason={voiceUnavailableReason}
              onVoiceStart={() => void conversation.startVoice()}
              voiceActive={conversation.voiceActive}
              voiceSession={conversation.voiceSession}
              micLevels={conversation.micLevels}
              onVoiceEnd={conversation.endVoice}
              translation={conversation.translationLanguages.length > 1 ? { languages: conversation.translationLanguages, translate: conversation.translateMessage } : undefined}
              voiceChat={config.voice.enabled ? conversation.voiceChat : null}
              publishedMode
            />
          </div>
        </main>
      </div>
    </PublicShell>
  );
}

// ─── Public page shell — soft branded backdrop ───────────────────────────────

function PublicShell({
  children,
  primaryColour,
  accentColour,
}: {
  children: React.ReactNode;
  primaryColour?: string;
  accentColour?: string;
}) {
  const p = primaryColour || "#6366f1";
  const a = accentColour || "#8b5cf6";
  return (
    <div className="min-h-screen bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(60rem 30rem at 50% -8rem, ${p}1a, transparent 70%), radial-gradient(40rem 24rem at 85% 110%, ${a}14, transparent 70%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
