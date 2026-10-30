/**
 * src/features/agent-conversation/lib/chat-stream.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared NDJSON chat streaming reader for the agent conversation surfaces.
 *
 * Both the draft preview (/api/chat + platform JWT + scope:"draft") and the
 * public published page (/api/embed/chat + public session token) speak the
 * exact same line protocol:
 *
 *   {"type":"sources","payload":[{title,snippet,score},…]}
 *   {"type":"retrieval_degraded","payload":{message}} (optional — search is down,
 *   the answer is ungrounded and the UI can banner it)
 *   {"type":"quota_warning","payload":{…}}        (optional)
 *   {"type":"token","payload":"…text…"}           (many)
 *   {"type":"error","payload":"message"}          (terminal)
 *   {"type":"done"}                               (terminal)
 *
 * The caller owns the endpoint, headers and payload extras; this helper owns
 * the fetch, the reader loop and the event dispatch.
 */

import { apiUrl } from "@/lib/runtime";

export interface ChatStreamTiming {
  phase: "headers" | "first_token" | "complete";
  elapsedMs: number;
  serverTiming?: string | null;
}

export interface ChatStreamCallbacks {
  onSources: (sources: Array<{ title: string; snippet: string; index: number }>) => void;
  onToken: (token: string) => void;
  onQuotaWarning?: (warning: unknown) => void;
  /** Retrieval failed server-side; the answer arrives WITHOUT document evidence. */
  onRetrievalDegraded?: (payload: { message?: string }) => void;
  onError: (message: string) => void;
  onDone: () => void;
  /** Client-observed milestones; elapsed includes network, RAG and generation. */
  onTiming?: (timing: ChatStreamTiming) => void;
}

export interface ChatStreamOptions {
  kbId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Full API path, e.g. "/api/chat" or "/api/embed/chat". */
  endpoint: string;
  headers?: HeadersInit;
  /** Extra body fields (scope:"draft", sessionId, …). */
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}

export async function streamAgentChat(
  options: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const { kbId, messages, endpoint, extraBody, signal } = options;
  const startedAt = performance.now();
  let sawFirstToken = false;
  let serverTiming: string | null = null;
  const mark = (phase: ChatStreamTiming["phase"]) =>
    callbacks.onTiming?.({
      phase,
      elapsedMs: Math.round(performance.now() - startedAt),
      serverTiming,
    });

  const requestHeaders = new Headers({ "Content-Type": "application/json" });
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => requestHeaders.set(key, value));
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ kbId, messages, ...extraBody }),
      signal,
    });
  } catch (err) {
    // A network failure before the stream starts used to reject this
    // promise, so the caller never cleared its "thinking" state and the chat
    // stayed stuck. Report it through the same callbacks instead.
    if ((err as Error)?.name !== "AbortError") {
      callbacks.onError("Could not reach the assistant. Check your connection and try again.");
    }
    callbacks.onDone();
    return;
  }

  serverTiming = response.headers.get("server-timing");
  mark("headers");

  if (!response.ok || !response.body) {
    let message = `Chat request failed (HTTP ${response.status})`;
    try {
      const parsed = (await response.json()) as { error?: string; message?: string };
      if (parsed?.message) message = parsed.message;
      else if (parsed?.error) message = String(parsed.error);
    } catch {
      /* non-JSON body — keep the status message */
    }
    callbacks.onError(message);
    callbacks.onDone();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawError = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event: { type?: string; payload?: unknown };
        try {
          event = JSON.parse(trimmed) as { type?: string; payload?: unknown };
        } catch {
          continue;
        }
        switch (event.type) {
          case "sources": {
            const sources = Array.isArray(event.payload)
              ? (event.payload as Array<{ title?: string; snippet?: string }>).map((s, i) => ({
                  title: String(s?.title ?? "Source"),
                  snippet: String(s?.snippet ?? ""),
                  index: i + 1,
                }))
              : [];
            callbacks.onSources(sources);
            break;
          }
          case "token":
            if (typeof event.payload === "string" && event.payload) {
              if (!sawFirstToken) {
                sawFirstToken = true;
                mark("first_token");
              }
              callbacks.onToken(event.payload);
            }
            break;
          case "retrieval_degraded":
            callbacks.onRetrievalDegraded?.((event.payload ?? {}) as { message?: string });
            break;
          case "quota_warning":
            callbacks.onQuotaWarning?.(event.payload);
            break;
          case "error":
            sawError = true;
            callbacks.onError(String(event.payload ?? "The assistant could not answer."));
            break;
          case "done":
            mark("complete");
            callbacks.onDone();
            return;
          default:
            break;
        }
      }
    }
    // Stream ended without an explicit done event.
    mark("complete");
    callbacks.onDone();
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      callbacks.onDone();
      return;
    }
    callbacks.onError((err as Error)?.message ?? "The chat stream ended unexpectedly.");
    callbacks.onDone();
  }
}
