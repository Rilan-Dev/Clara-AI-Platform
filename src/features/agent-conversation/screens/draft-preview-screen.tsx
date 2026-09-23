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
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Cpu,
  ExternalLink,
  GitBranch,
  Globe2,
  History,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Workflow,
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

function langLabel(code: string) {
  return LANG_LABELS[code] ?? code.toUpperCase();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
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

  const orgId = data?.agent.orgId ?? "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-background to-background">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/orgs/${orgId}/agents/${agentId}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Back to the agent workspace"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-foreground">
                {data?.agent.name ?? "Agent"}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600">
                <History className="h-3 w-3" />
                Draft preview
              </span>
              {configSourceBadge && (
                <span className={cn("hidden rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex", configSourceBadge.tone)}>
                  {configSourceBadge.label}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {data?.draft
                ? `${data.draft.branchName} · draft saved ${timeAgo(data.draft.updatedAt)}${
                    data.draft.parentVersionNumber ? ` · based on v${data.draft.parentVersionNumber}` : ""
                  }`
                : "Testing the current configuration"}
            </p>
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
              href={`/orgs/${orgId}/agents/${agentId}`}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open workspace
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
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
                href={`/orgs/${orgId}/agents/${agentId}`}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
              >
                Back to workspace
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
            {/* Chat window — voice chat integrated inside it. */}
            <div className="min-h-[34rem]">
              <ConversationChatWindow
                assistantName={assistantName}
                avatarUrl={data?.assistant?.avatarUrl ?? null}
                primaryColour={primaryColour}
                accentColour={accentColour}
                headerBadge={
                  data?.kb ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
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
              />
            </div>

            {/* ── Testing facts sidebar ─────────────────────────────────── */}
            <aside className="space-y-4">
              <section className="rounded-2xl border border-border/70 bg-card p-4">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  What you&apos;re testing
                </h2>
                <dl className="space-y-2.5 text-sm">
                  <FactRow label="Configuration" value={configSourceBadge?.label ?? "—"} />
                  <FactRow
                    label="Knowledge base"
                    value={data?.kb ? data.kb.name : "None"}
                    icon={<BookOpen className="h-3.5 w-3.5 text-emerald-500" />}
                  />
                  <FactRow
                    label="Chat model"
                    value={data?.ai?.chatModel ?? data?.ai?.provider ?? "Platform default"}
                    icon={<Cpu className="h-3.5 w-3.5 text-primary/70" />}
                  />
                  <FactRow
                    label="Voice provider"
                    value={
                      availability?.voiceProvider
                        ? availability.voiceProvider
                        : data?.ai?.realtimeVoiceProvider ?? data?.ai?.voiceProvider ?? "Inherited"
                    }
                    icon={<Mic className="h-3.5 w-3.5 text-violet-500" />}
                  />
                  <FactRow
                    label="Realtime"
                    value={runtimeRealtimeOn ? "Enabled" : "Disabled"}
                    icon={<Workflow className="h-3.5 w-3.5 text-sky-500" />}
                  />
                </dl>
                <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Draft edits (persona, models, toggles) apply here immediately — reload after
                  saving to pick up the latest draft.
                </p>
              </section>

              <section className="rounded-2xl border border-border/70 bg-card p-4">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  Published state
                </h2>
                {data?.deployment ? (
                  <dl className="space-y-2.5 text-sm">
                    <FactRow label="Live version" value={`v${data.deployment.versionNumber} · ${data.deployment.branchName}`} />
                    <FactRow label="Published" value={timeAgo(data.deployment.publishedAt)} />
                    <FactRow label="Access" value={data.deployment.publicAccess ? "Public" : "Private"} />
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not published yet — everything you test here comes from the working draft.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-border/70 bg-card p-4">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Globe2 className="h-3.5 w-3.5" />
                  Languages
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {(data?.assistant?.allowedLanguages ?? ["en"]).map((code) => (
                    <span
                      key={code}
                      className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {langLabel(code)}
                    </span>
                  ))}
                </div>
                {data?.assistant?.alwaysRespondIn && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Always responds in {langLabel(data.assistant.alwaysRespondIn)}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-border/70 bg-card p-4">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Brain className="h-3.5 w-3.5" />
                  AI runtime
                </h2>
                <dl className="space-y-2.5 text-sm">
                  <FactRow label="Brain" value={data?.ai?.provider ?? "Platform default"} />
                  <FactRow label="Voice chat" value={data?.ai?.voiceProvider ?? "Inherited"} />
                  <FactRow label="Realtime voice" value={data?.ai?.realtimeVoiceProvider ?? "Inherited"} />
                  {data?.assistant?.voiceId && (
                    <FactRow label="Voice ID" value={data.assistant.voiceId} />
                  )}
                </dl>
              </section>

              <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Authenticated preview — only organisation members can open this page. It tests
                draft changes and never exposes them publicly.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function FactRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="max-w-[55%] truncate text-xs font-medium text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}
