import type { Message, StreamEvent } from "@/modules/assistant/core";

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
};

const DEFAULT_CHAT_ENDPOINT = "/api/chat";

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
        assistantLanguage: options?.assistantLanguage,
        customerLanguages: options?.customerLanguages,
      }
    : {
        // Legacy document mode
        documentId: documentOrKbId,
        messages,
        overview: options?.overview,
        suggestedPrompts: options?.suggestions?.slice(0, 5),
        assistantLanguage: options?.assistantLanguage,
        customerLanguages: options?.customerLanguages,
      };

  const fetcher = options?.fetcher ?? fetch;
  const endpoint = options?.endpoint ?? DEFAULT_CHAT_ENDPOINT;

  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || `Chat request failed with status ${response.status}`);
  }

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
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as StreamEvent;
        onEvent(event);
      } catch {
        // ignore parse errors for partial lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer) as StreamEvent;
      onEvent(event);
    } catch {
      // ignore trailing parse errors
    }
  }
}
