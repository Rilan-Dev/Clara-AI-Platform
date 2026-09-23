"use client";

/**
 * src/features/admin/screens/agent-workspace/published-preview-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * /preview/agents/:agentId — the DEDICATED published-agent preview page.
 *
 * Opened in a new tab from the agent workspace header ("Preview"). Shows the
 * currently PUBLISHED version only — drafts never leak here.
 *
 * Design constraints (deliberate):
 *   • Session-authenticated surface (/api/agents/:id/preview + /api/chat) —
 *     it NEVER mints, reads or touches the embed (Deploy) API key. That key
 *     is reserved for real site deployments and stays completely separate.
 *   • NOT the embed widget design — its own dedicated layout, ready to grow
 *     into a richer preview experience later.
 *   • The chat is functional: it answers from the agent's published
 *     knowledge base through the internal authenticated chat API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Globe,
  Lock,
  Mic,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { cn } from "@/lib/utils";

// ─── Preview payload (GET /api/agents/:agentId/preview) ──────────────────────

type PreviewDTO = {
  agent: { id: string; name: string; orgId: string };
  deployment: {
    branchName: string;
    versionNumber: number;
    publicAccess: boolean;
    publishedAt: string;
    publishedByName: string | null;
    changeSummary: string | null;
  } | null;
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

// ─── Chat stream types (internal authenticated /api/chat, NDJSON) ────────────

type ChatSource = { title: string; snippet: string; index: number };
type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources?: ChatSource[] };

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

// ─── Shimmer skeleton ────────────────────────────────────────────────────────

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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Shimmer className="h-[32rem] rounded-2xl" />
        <div className="space-y-4">
          <Shimmer className="h-40 rounded-2xl" />
          <Shimmer className="h-28 rounded-2xl" />
          <Shimmer className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PublishedPreviewScreen() {
  const { agentId = "" } = useParams<{ agentId: string }>();

  const [data, setData] = useState<PreviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/agents/${agentId}/preview`), {
        headers: withAuthHeaders({}),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as PreviewDTO & { error?: string };
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setData(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const primary = data?.assistant?.primaryColour || "#6366f1";
  const accent = data?.assistant?.accentColour || "#a5b4fc";

  // ── Functional chat: internal authenticated API, kbId-scoped. The embed
  //    (Deploy) API key is NEVER involved in this surface.
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking || !data?.kb) return;
    setChatError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    const history = [...messages, { role: "user" as const, content: text }].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setThinking(true);
    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ kbId: data.kb.id, messages: history }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      let answer = "";
      let sources: ChatSource[] | undefined;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; payload?: unknown };
          if (event.type === "sources") {
            sources = event.payload as ChatSource[];
          } else if (event.type === "token") {
            answer += String(event.payload ?? "");
          } else if (event.type === "error") {
            throw new Error(String(event.payload ?? "The assistant could not answer."));
          }
        }
      }
      setMessages((prev) => [...prev, { role: "assistant", content: answer || "(no answer)", sources }]);
    } catch (err) {
      setChatError((err as Error).message);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, data?.kb, messages]);

  const workspaceHref = data ? `/orgs/${data.agent.orgId}/agents/${data.agent.id}` : "#";

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <PreviewSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
            <ShieldCheck className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Preview unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
          >
            <ArrowLeft className="h-4 w-4" /> Back to workspace
          </Link>
        </div>
      </div>
    );
  }

  if (!data?.deployment || !data.assistant) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-background to-muted/40 px-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {data?.agent.name ?? "This agent"} isn&apos;t published yet
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The preview always shows the published version — nothing else. Publish this agent from its
            workspace and come back to explore it here.
          </p>
          {data?.agent && (
            <Link
              href={workspaceHref}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open the agent workspace <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    );
  }

  const a = data.assistant;
  const deployment = data.deployment;
  const languages = Array.from(new Set([a.defaultLanguage, ...a.allowedLanguages])).filter(Boolean);

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-muted/30"
      style={{ ["--preview-primary" as string]: primary, ["--preview-accent" as string]: accent }}
    >
      {/* ── Top bar: dedicated preview identity + back to workspace ────────── */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={workspaceHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              title="Back to the agent workspace"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{a.assistantName}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: `${primary}1a`, color: primary }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primary }} />
                  Published preview
                </span>
                <span className="truncate">
                  {deployment.branchName} · v{deployment.versionNumber}
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              title="Reload the published state"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <Link
              href={workspaceHref}
              className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:flex"
            >
              Open workspace <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-8">
        {/* ── The preview stage: chat exactly as published ─────────────────── */}
        <section className="flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/[0.04]">
          {/* Chat header — the published identity, styled with its colours */}
          <div
            className="flex items-center gap-3 border-b border-border/70 px-5 py-4"
            style={{ background: `linear-gradient(135deg, ${primary}14, ${accent}0d)` }}
          >
            {a.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.avatarUrl}
                alt={a.assistantName}
                className="h-10 w-10 rounded-full border border-border object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: primary, color: "#fff" }}
              >
                {(a.assistantName || "A").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{a.assistantName}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {data.kb ? `Answers from “${data.kb.name}”` : "No knowledge base attached"}
              </p>
            </div>
            <span
              className="hidden rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex"
              style={{ backgroundColor: `${accent}26`, color: primary }}
            >
              v{deployment.versionNumber}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
            {a.welcomeMessage && (
              <div className="flex gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ backgroundColor: `${primary}1f`, color: primary }}
                >
                  {(a.assistantName || "A").charAt(0).toUpperCase()}
                </div>
                <div
                  className="max-w-[80%] rounded-2xl rounded-tl-md border border-border/60 bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground"
                >
                  {a.welcomeMessage}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div
                    className="max-w-[80%] rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed text-white shadow-sm"
                    style={{ backgroundColor: primary }}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: `${primary}1f`, color: primary }}
                  >
                    {(a.assistantName || "A").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 max-w-[80%] space-y-2">
                    <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border/60 bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">
                      {m.content}
                    </div>
                    {a.citeSources && m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.sources.slice(0, 4).map((s) => (
                          <span
                            key={s.index}
                            className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                            title={s.title}
                          >
                            <BookOpen className="h-3 w-3 shrink-0" /> {s.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

            {thinking && (
              <div className="flex gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ backgroundColor: `${primary}1f`, color: primary }}
                >
                  {(a.assistantName || "A").charAt(0).toUpperCase()}
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border/60 bg-muted/40 px-4 py-3.5">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full"
                      style={{ backgroundColor: primary, animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {messages.length === 0 && !a.welcomeMessage && (
              <div className="flex h-full items-center justify-center text-center">
                <div className="max-w-xs space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Ask anything</p>
                  <p className="text-xs text-muted-foreground">
                    This preview answers exactly like the published agent does.
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-border/70 bg-card/80 px-4 py-3.5">
            {chatError && (
              <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {chatError}
              </p>
            )}
            {data.kb ? (
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={`Message ${a.assistantName}…`}
                  disabled={thinking}
                  className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={thinking || !input.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
                  style={{ backgroundColor: primary }}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
                Chat is disabled — this agent has no active knowledge base.
              </p>
            )}
          </div>
        </section>

        {/* ── Published facts — everything immutable about this deployment ── */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Rocket className="h-3.5 w-3.5" /> Deployment
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">Version</dt>
                <dd className="font-medium text-foreground">
                  {deployment.branchName} · v{deployment.versionNumber}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">Published</dt>
                <dd className="text-right font-medium text-foreground">
                  {timeAgo(deployment.publishedAt)}
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    by {deployment.publishedByName ?? "System"}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">Access</dt>
                <dd className="flex items-center gap-1.5 font-medium text-foreground">
                  {deployment.publicAccess ? (
                    <>
                      <Globe className="h-3.5 w-3.5 text-emerald-500" /> Public
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5 text-amber-500" /> Private
                    </>
                  )}
                </dd>
              </div>
              {deployment.changeSummary && (
                <div>
                  <dt className="text-xs text-muted-foreground">Change summary</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-foreground/80">
                    {deployment.changeSummary}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> Languages
            </h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {languages.map((code) => (
                <span
                  key={code}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                    code === a.defaultLanguage
                      ? "border font-medium"
                      : "border border-border/70 bg-muted/40 text-muted-foreground",
                  )}
                  style={
                    code === a.defaultLanguage
                      ? { backgroundColor: `${primary}14`, color: primary, borderColor: `${primary}40` }
                      : undefined
                  }
                >
                  {code === a.defaultLanguage && <Check className="h-3 w-3" />}
                  {langLabel(code)}
                </span>
              ))}
            </div>
            {a.alwaysRespondIn && (
              <p className="mt-2.5 text-[11px] text-muted-foreground">
                Always responds in {langLabel(a.alwaysRespondIn)}.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Mic className="h-3.5 w-3.5" /> Voice & AI
            </h2>
            <ul className="mt-3 space-y-2 text-xs">
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Chat</span>
                <span className="font-medium text-foreground">
                  {data.ai?.chatModel ?? data.ai?.provider ?? "Platform default"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Realtime provider</span>
                <span className="font-medium text-foreground">
                  {data.ai?.realtimeVoiceProvider ?? data.ai?.voiceProvider ?? "Platform default"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Voice</span>
                <span className="font-medium text-foreground">
                  {data.ai?.realtimeVoiceId ?? a.voiceId ?? "Platform default"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Realtime</span>
                <span className="font-medium text-foreground">
                  {data.runtime?.enableRealtime === false ? "Off" : "Enabled"}
                </span>
              </li>
            </ul>
          </section>

          <p className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Authenticated preview — separate from the deploy embed key, which is never used or exposed here.
          </p>
        </aside>
      </div>
    </div>
  );
}
