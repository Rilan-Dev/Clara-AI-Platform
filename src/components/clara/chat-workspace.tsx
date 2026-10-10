"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, readError, useClara } from "@/lib/store";
import { QuotaBanner, UsageBar } from "@/components/clara/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Square,
  RotateCcw,
  Copy,
  Check,
  Lock,
  Bot,
  User,
  Zap,
  Loader2,
} from "lucide-react";

type Agent = {
  id: string;
  orgId: string;
  name: string;
  modelId: string;
};
type ModelInfo = { id: string; displayName: string; tier: number };
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "pending";
  content: string;
  truncated?: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    firstTokenMs?: number;
    model: string;
  };
};

const TIER_LABEL = ["Free", "Starter", "Pro", "Enterprise"];

export function ChatWorkspace({
  userId,
  orgId,
  agents,
  models,
  planMaxTier,
  onUsageChange,
}: {
  userId: string;
  orgId: string;
  agents: Agent[];
  models: ModelInfo[];
  planMaxTier: number;
  onUsageChange: () => void;
}) {
  const { openUpgradeSheet, showToast } = useClara();
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [quota, setQuota] = useState<{
    requestsToday: number;
    requestsTodayLimit: number;
    requestsMonth: number;
    requestsMonthLimit: number;
  } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const agent = agents.find((a) => a.id === agentId);
  const agentModel = models.find((m) => m.id === agent?.modelId);
  const modelLocked = (agentModel?.tier ?? 0) > planMaxTier;

  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setWarning(null);
  }, [agentId, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleRefusal = useCallback(
    async (res: Response) => {
      const err = await readError(res);
      openUpgradeSheet({
        code: err.code,
        message: err.message,
        plan: err.upgrade?.plan,
        planName: err.upgrade?.planName,
        reason: err.upgrade?.reason,
      });
    },
    [openUpgradeSheet]
  );

  /** Consume the SSE stream from a /api/chat* response. */
  const consumeStream = useCallback(
    async (res: Response, kind: "send" | "regenerate") => {
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
        await handleRefusal(res);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      setStreaming(true);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const evLine = part.split("\n").find((l) => l.startsWith("event:"));
            const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            let data: Record<string, unknown> = {};
            try {
              data = JSON.parse(dataLine.slice(5).trim());
            } catch {
              continue;
            }
            if (event === "start") {
              setConversationId((data.conversationId as string) ?? null);
              setQuota({
                requestsToday: (data.quota as any)?.requestsToday ?? 0,
                requestsTodayLimit: (data.quota as any)?.requestsTodayLimit ?? 0,
                requestsMonth: (data.quota as any)?.requestsMonth ?? 0,
                requestsMonthLimit: (data.quota as any)?.requestsMonthLimit ?? 0,
              });
              setMessages((prev) => [
                ...prev,
                { id: `pending-${Date.now()}`, role: "pending", content: "" },
              ]);
            } else if (event === "quota_warning") {
              setWarning(data.message as string);
            } else if (event === "token") {
              acc += (data.text as string) ?? "";
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "pending") {
                  next[next.length - 1] = { ...last, content: acc };
                }
                return next;
              });
            } else if (event === "done") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "pending") {
                  next[next.length - 1] = {
                    ...last,
                    id: (data.messageId as string) ?? last.id,
                    role: "assistant",
                    content: acc,
                    truncated: !!data.truncated,
                    usage: data.usage as ChatMessage["usage"],
                  };
                }
                return next;
              });
              onUsageChange();
            } else if (event === "error") {
              showToast((data.message as string) ?? "Provider error", "error");
              setMessages((prev) => prev.filter((m) => m.role !== "pending"));
            }
          }
        }
      } finally {
        setStreaming(false);
        setRegenerating(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.role === "pending"
              ? { ...m, role: "assistant", content: m.content || "(no output)", truncated: true }
              : m
          )
        );
        onUsageChange();
      }
      void kind;
    },
    [handleRefusal, onUsageChange, showToast]
  );

  const send = useCallback(async () => {
    if (!input.trim() || !agentId || streaming) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    const idem = `chat-${userId}-${Date.now()}`;
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await api("/api/chat", userId, {
        method: "POST",
        body: JSON.stringify({
          agentId,
          conversationId,
          message: text,
          idempotencyKey: idem,
        }),
        signal: ac.signal,
      });
      await consumeStream(res, "send");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        showToast("Generation stopped — partial answer kept", "info");
      } else {
        showToast("Network error — please retry", "error");
      }
      setStreaming(false);
    }
  }, [input, agentId, streaming, userId, conversationId, consumeStream, showToast]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(async () => {
    if (!conversationId || streaming) return;
    setRegenerating(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: "↺ Regenerate last prompt" },
    ]);
    try {
      const res = await api("/api/chat/regenerate", userId, {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      await consumeStream(res, "regenerate");
    } catch {
      showToast("Network error — please retry", "error");
      setRegenerating(false);
    }
  }, [conversationId, streaming, userId, consumeStream, showToast]);

  const copyMessage = async (m: ChatMessage) => {
    await navigator.clipboard.writeText(m.content);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header: agent selector + model gate + live quota */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="h-9 w-[210px]" aria-label="Select agent">
            <SelectValue placeholder="Select agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {agentModel && (
          <Badge
            variant={modelLocked ? "destructive" : "outline"}
            className="gap-1"
            title={
              modelLocked
                ? `${agentModel.displayName} requires ${TIER_LABEL[agentModel.tier]} or above — upgrade to use it`
                : `${agentModel.displayName} · included in your plan`
            }
          >
            {modelLocked && <Lock className="h-3 w-3" />}
            {agentModel.displayName}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-3">
          {quota && (
            <div className="hidden w-52 sm:block">
              <UsageBar
                used={quota.requestsToday}
                limit={quota.requestsTodayLimit}
                label="Requests today"
                compact
              />
            </div>
          )}
          <Button
            size="sm"
            variant={modelLocked ? "default" : "outline"}
            className="gap-1"
            onClick={() => {
              if (modelLocked) {
                openUpgradeSheet({
                  code: "MODEL_NOT_IN_PLAN",
                  message: `${agentModel?.displayName} is not available on your plan. The API refuses it too — hiding in the UI is never the only gate.`,
                  plan: "pro",
                  planName: "Pro",
                  reason: `model:${agentModel?.id}`,
                });
              } else {
                showToast(
                  "Model gates are enforced server-side on every request",
                  "info"
                );
              }
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            {modelLocked ? "Unlock model" : "Enforced"}
          </Button>
        </div>
      </div>

      {warning && <QuotaBanner message={warning} onDismiss={() => setWarning(null)} />}

      {/* messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        role="log"
        aria-label="Conversation"
      >
        {messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <Bot className="mx-auto mb-3 h-10 w-10 text-emerald-600" aria-hidden />
            <h2 className="text-lg font-semibold">Ask Clara anything</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every turn is metered, quota-checked and audit-logged — streaming
              over server-sent events with stop, regenerate and copy controls.
            </p>
            <div className="mt-4 grid gap-2 text-left">
              {[
                "What does our refund policy say about partial refunds?",
                "Summarise the confidentiality clause in the NDA template",
                "How do I escalate a priority ticket to tier 3?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-lg border p-3 text-sm text-muted-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
          >
            {m.role !== "user" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Bot className="h-4 w-4" aria-hidden />
              </div>
            )}
            <div
              className={`group max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card"
              } ${m.role === "pending" ? "animate-pulse" : ""}`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : (
                <div className="prose prose-sm max-w-none [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_code]:text-[0.85em]">
                  <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                {m.truncated && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    truncated
                  </Badge>
                )}
                {m.usage && (
                  <span className="tabular-nums">
                    {m.usage.model} · {m.usage.promptTokens}+{m.usage.completionTokens} tok ·{" "}
                    {(m.usage.latencyMs / 1000).toFixed(1)}s
                    {m.usage.firstTokenMs
                      ? ` · first tok ${m.usage.firstTokenMs}ms`
                      : ""}
                  </span>
                )}
                {m.role === "assistant" && m.usage && (
                  <button
                    onClick={() => copyMessage(m)}
                    className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label="Copy message"
                  >
                    {copiedId === m.id ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedId === m.id ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>
            {m.role === "user" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" aria-hidden />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* composer */}
      <div className="border-t p-3">
        {messages.some((m) => m.role === "assistant" && m.usage) && !streaming && (
          <div className="mb-2 flex justify-center">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-muted-foreground"
              onClick={regenerate}
              disabled={regenerating}
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Regenerate (billed as a new turn)
            </Button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your knowledge base…"
            aria-label="Message"
            className="h-11 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            disabled={streaming}
          />
          {streaming ? (
            <Button
              type="button"
              variant="destructive"
              onClick={stop}
              className="h-11 gap-1"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button type="submit" className="h-11 gap-1" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          )}
        </form>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Every prompt & answer is recorded in the tamper-evident audit chain ·
          requests are quota-checked server-side before the model is called
        </p>
      </div>
    </div>
  );
}
