"use client";

/**
 * src/features/agent-conversation/screens/draft-preview-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /preview/agents/:agentId — the DRAFT PREVIEW console.
 *
 * The authenticated testing environment for the CURRENT DRAFT: persona,
 * branding, AI selections, runtime toggles and the LIVE knowledge base —
 * exactly what the user is editing, before it is published. Referenced UI/UX
 * directions (own design, not copies):
 *   • Entering the preview  — pasted_image_1790169728678.png
 *   • While chatting        — pasted_image_1790169687747.png
 *   • Realtime voice start  — pasted_image_1790169802320.png
 *
 * Voice chat lives INSIDE the chat window (mic button in the composer); the
 * realtime voice session replaces the message area while active and folds its
 * turns back into the conversation when it ends. The page is session-gated by
 * the Edge middleware (/preview → login redirect) and every API call carries
 * the platform JWT; drafts never reach any public surface.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  History,
  RefreshCw,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { ConversationChatWindow } from "../components/conversation-chat-window";
import { useAgentConversation } from "../hooks/use-agent-conversation";

// ─── Preview payload (GET /api/agents/:agentId/preview?scope=draft) ─────────

type DraftPreviewDTO = {
  agent: { id: string; name: string; orgId: string };
  scope: "draft";
  configSource: "draft" | "live" | "published" | null;
  deployment: {
    branchName: string;
    versionNumber: number;
    publicAccess: boolean;
    publishedAt: string;
    publishedByName: string | null;
    changeSummary: string | null;
  } | null;
  draft: { branchName: string; updatedAt: string; parentVersionNumber: number | null } | null;
  assistant: {
    assistantName: string;
    avatarUrl: string | null;
    welcomeMessage: string;
    primaryColour: string;
    accentColour: string;
    defaultLanguage: string;
    allowedLanguages: string[];
    alwaysRespondIn: string | null;
    voiceId: string | null;
    strictMode: boolean;
    citeSources: boolean;
  } | null;
  ai: {
    provider: string | null;
    chatModel: string | null;
    voiceProvider: string | null;
    voiceChatVoiceId: string | null;
    realtimeVoiceProvider: string | null;
    realtimeVoiceId: string | null;
  } | null;
  runtime: { enableVoice: boolean; enableRealtime: boolean; enablePublicEmbed: boolean } | null;
  kb: { id: string; name: string } | null;
};

const LANG_LABELS: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", zh: "Chinese",
  hi: "Hindi", ar: "Arabic", ja: "Japanese", ko: "Korean", pt: "Portuguese",
  ru: "Russian", it: "Italian", ta: "Tamil", te: "Telugu", bn: "Bengali",
  ml: "Malayalam", mr: "Marathi", kn: "Kannada", gu: "Gujarati", pa: "Punjabi",
};


// ─── Skeleton ────────────────────────────────────────────────────────────────

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted/70",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-background/60 before:to-transparent",
        className,
      )}
    />
  );
}

function PreviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <Shimmer className="h-9 w-56" />
        <Shimmer className="h-9 w-36" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Shimmer className="h-[34rem] rounded-2xl" />
        <div className="space-y-4">
          <Shimmer className="h-36 rounded-2xl" />
          <Shimmer className="h-28 rounded-2xl" />
          <Shimmer className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DraftPreviewScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";

  const [data, setData] = useState<DraftPreviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/agents/${agentId}/preview?scope=draft`), {
        headers: withAuthHeaders({}),
        cache: "no-store",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Preview failed to load (HTTP ${res.status})`);
      }
      setData((await res.json()) as DraftPreviewDTO);
    } catch (err) {
      setError((err as Error).message || "Failed to load the draft preview.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kbId = data?.kb?.id ?? null;
  const assistantName = data?.assistant?.assistantName ?? data?.agent.name ?? "Assistant";
  const primaryColour = data?.assistant?.primaryColour || "#6366f1";
  const accentColour = data?.assistant?.accentColour || "#8b5cf6";

  const chatHeaders = useMemo(
    () => withAuthHeaders({ "Content-Type": "application/json" }),
    [],
  );
  const chatExtraBody = useMemo(() => ({ scope: "draft" as const }), []);

  const conversation = useAgentConversation({
    kbId,
    draftMode: true,
    assistantName,
    voiceGreeting: data?.assistant?.welcomeMessage || undefined,
    language: data?.assistant
      ? { assistant: data.assistant.defaultLanguage || "en", customer: data.assistant.allowedLanguages }
      : undefined,
    chatEndpoint: "/api/chat",
    chatHeaders,
    chatExtraBody,
  });

  const runtimeVoiceOn = data?.runtime ? data.runtime.enableVoice !== false : true;
  const runtimeRealtimeOn = data?.runtime ? data.runtime.enableRealtime !== false : true;
  const availability = conversation.voiceAvailability;

  // Fail-open on toggles, gate on the resolved provider flags when known:
  // clicking the mic with a broken provider surfaces the real error in the
  // voice stage instead of hiding the feature with no explanation.
  const voiceAvailable =
    Boolean(kbId) &&
    runtimeVoiceOn &&
    runtimeRealtimeOn &&
    (availability ? availability.voiceEnabled && availability.realtimeEnabled : true);

  const voiceUnavailableReason = !kbId
    ? "No active knowledge base — add content first."
    : !runtimeVoiceOn
      ? "Voice is disabled in the draft runtime settings."
      : !runtimeRealtimeOn
        ? "Realtime is disabled in the draft runtime settings."
        : availability && (!availability.voiceEnabled || !availability.realtimeEnabled)
          ? "The resolved provider/plan does not enable voice for this knowledge base."
          : null;

  const configSourceBadge =
    data?.configSource === "draft"
      ? { label: "Draft", tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" }
      : data?.configSource === "live"
        ? { label: "Live config", tone: "bg-sky-500/15 text-sky-600 border-sky-500/30" }
        : data?.configSource === "published"
          ? { label: "Published fallback", tone: "bg-muted text-muted-foreground border-border" }
          : null;



  // The API payload is authoritative; never build a workspace URL from an
  // empty organisation id while the preview payload is still loading.
  const orgId = data?.agent.orgId ?? "";
  const workspaceHref = orgId ? `/orgs/${orgId}/agents/${agentId}` : "/orgs";

  return (
    <div
      className="h-dvh overflow-hidden bg-background"
      style={{
        backgroundImage: `radial-gradient(55rem 30rem at 48% -8rem, ${primaryColour}18, transparent 68%), radial-gradient(42rem 28rem at 92% 100%, ${accentColour}12, transparent 70%)`,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-20 h-14 shrink-0 border-b border-border/50 bg-background/85 backdrop-blur">
        <div className="flex h-full w-full items-center gap-3 px-3 sm:px-5">
          <Link
            href={workspaceHref}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Back to the agent workspace"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-foreground">
                {data?.agent.name ?? "Agent"}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600">
                <History className="h-3 w-3" />
                Preview
              </span>
              {configSourceBadge && (
                <span className={cn("hidden rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex", configSourceBadge.tone)}>
                  {configSourceBadge.label}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">Live draft configuration</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Reload the draft configuration"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            <Link
              href={workspaceHref}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open workspace
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className={cn("w-full px-0 py-0", embedded ? "h-full" : "")}>
        {loading && !data ? (
          <PreviewSkeleton />
        ) : error ? (
          <div className="mx-auto max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-sm font-medium text-destructive">Preview unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs font-medium hover:bg-muted"
              >
                Try again
              </button>
              <Link
                href={workspaceHref}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
              >
                Back to workspace
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            <div className={cn("min-h-0 w-full overflow-hidden bg-background/45 backdrop-blur-xl", embedded ? "h-full" : "h-[calc(100dvh-3.5rem)]")} >
              <ConversationChatWindow
                assistantName={assistantName}
                avatarUrl={data?.assistant?.avatarUrl ?? null}
                primaryColour={primaryColour}
                accentColour={accentColour}
                headerBadge={
                  data?.kb ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live KB
                    </span>
                  ) : null
                }
                welcomeMessage={data?.assistant?.welcomeMessage ?? ""}
                messages={conversation.messages}
                thinking={conversation.thinking}
                chatError={conversation.chatError ?? conversation.voiceStartError}
                input={conversation.input}
                onInputChange={conversation.setInput}
                onSend={() => void conversation.sendText()}
                sendDisabled={!kbId || conversation.voiceActive}
                placeholder={kbId ? `Ask ${assistantName} anything…` : "No active knowledge base yet"}
                citeSources={data?.assistant?.citeSources !== false}
                voiceAvailable={voiceAvailable}
                voiceUnavailableReason={voiceUnavailableReason}
                onVoiceStart={() => void conversation.startVoice()}
                voiceActive={conversation.voiceActive}
                voiceSession={conversation.voiceSession}
                micLevels={conversation.micLevels}
                onVoiceEnd={conversation.endVoice}
                translation={conversation.translationLanguages.length > 1 ? { languages: conversation.translationLanguages, translate: conversation.translateMessage } : undefined}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

