import type { Message, StreamEvent } from "@/modules/assistant/core";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type StreamChatOptions = {
  overview?: string;
  suggestions?: string[];
  signal?: AbortSignal;
  endpoint?: string;
  fetcher?: FetchLike;
  assistantLanguage?: string;
  customerLanguages?: string[];
  /** KB mode: when set, the server uses kbId-scoped RAG instead of documentId */
  kbId?: string;
  /** Conversation id — links the logged query event to its chat session */
  sessionId?: string;
  /**
   * Embed (public) surface: switches the default endpoint to /api/embed/chat
   * and authenticates with the clr_ API key instead of the platform JWT.
   * An explicit `endpoint` still wins.
   */
  embedApiKey?: string;
  /** Realtime voice path: selects the configured Sarvam conversational model and latency settings. */
  realtimeVoice?: boolean;
  /**
   * Draft-preview mode (authenticated agent preview): the KB-mode payload
   * carries scope:"draft" so the server resolves the CURRENT Main-branch
   * draft instead of the immutable published version.
   */
  draftScope?: boolean;
};

const DEFAULT_CHAT_ENDPOINT = apiUrl("/api/chat");
const DEFAULT_EMBED_CHAT_ENDPOINT = apiUrl("/api/embed/chat");

export async function streamChatCompletion(
  documentOrKbId: string,
  messages: Pick<Message, "role" | "content">[],
  onEvent: (event: StreamEvent) => void,
  options?: StreamChatOptions,
): Promise<void> {
  const payload = options?.kbId
    ? {
        // KB mode: server uses kbId-scoped RAG
        kbId: options.kbId,
        messages,
        sessionId: options?.sessionId,
        assistantLanguage: options?.assistantLanguage,
        customerLanguages: options?.customerLanguages,
        realtimeVoice: options?.realtimeVoice === true,
        ...(options?.draftScope ? { scope: "draft" } : {}),
      }
    : {
        // Legacy document mode
        documentId: documentOrKbId,
        messages,
        sessionId: options?.sessionId,
        overview: options?.overview,
        suggestedPrompts: options?.suggestions?.slice(0, 5),
        assistantLanguage: options?.assistantLanguage,
        customerLanguages: options?.customerLanguages,
      };

  const fetcher = options?.fetcher ?? fetch;
  const endpoint = options?.endpoint
    ?? (options?.embedApiKey ? DEFAULT_EMBED_CHAT_ENDPOINT : DEFAULT_CHAT_ENDPOINT);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options?.embedApiKey) {
    headers.Authorization = `Bearer ${options.embedApiKey}`;
  } else {
    Object.assign(headers, withAuthHeaders());
  }

  const response = await fetcher(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    // Prefer the structured message from a plan-limit / validation error body
    // ({ error, code, message }) over the raw JSON string.
    let message = errorText || `Chat request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(errorText) as { message?: string; error?: string };
      if (parsed?.message)      message = parsed.message;
      else if (parsed?.error)   message = String(parsed.error);
    } catch {
      // raw text body — keep as is
    }
    throw new Error(message);
  }

  // Retrieval stage timings the server put in Server-Timing (rag-*, pre-llm)
  // — surfaced so voice hooks can log where each turn's time went.
  const serverTiming = parseServerTiming(response.headers.get("server-timing"));
  if (serverTiming) onEvent({ type: "timing", payload: serverTiming });

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseEvent(line);
      // Dispatch OUTSIDE the parse guard: an error thrown by the handler
      // (e.g. a server "error" event) must reach the caller, not be
      // swallowed as a parse error.
      if (event) onEvent(event);
    }
  }

  const trailing = parseEvent(buffer);
  if (trailing) onEvent(trailing);
}

function parseEvent(line: string): StreamEvent | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return null; // partial / malformed line
  }
}

/** `rag-retrieval;dur=312, pre-llm;dur=640` → { "rag-retrieval": 312, "pre-llm": 640 }. */
export function parseServerTiming(header: string | null): Record<string, number> | null {
  if (!header) return null;
  const out: Record<string, number> = {};
  for (const part of header.split(",")) {
    const [name, ...params] = part.trim().split(";");
    const dur = params.map((p) => p.trim()).find((p) => p.startsWith("dur="));
    const value = dur ? Number(dur.slice(4)) : NaN;
    if (name && Number.isFinite(value)) out[name.trim()] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}
