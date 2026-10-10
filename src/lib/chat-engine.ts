import ZAI from "z-ai-web-dev-sdk";

/**
 * WS-1.5 Streaming responses (plan §3.5): chat answers stream token-by-token
 * from the provider through the API route to the client over server-sent
 * events. The engine supports provider-side cancellation (stop button) and
 * reports token usage on completion so the caller can meter honestly.
 *
 * The SDK is created per-turn (stateless provider call); the selected model
 * id from the platform's catalogue is recorded on every usage event and
 * audit row regardless of the sandbox provider mapping.
 */

export type StreamResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  cancelled: boolean;
  firstTokenMs: number;
};

type TokenSink = (chunk: string) => void | Promise<void>;

export async function streamChat(opts: {
  systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  onToken: TokenSink;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const started = Date.now();
  let firstTokenMs = 0;
  let text = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cancelled = false;

  const zai = await ZAI.create();
  const messages = [
    { role: "system" as const, content: opts.systemPrompt },
    ...opts.history,
    { role: "user" as const, content: opts.userMessage },
  ];

  // Rough estimator used when the provider does not return usage.
  promptTokens = Math.ceil(
    messages.reduce((s, m) => s + m.content.length, 0) / 4
  );

  const completion = await zai.chat.completions.create({
    messages,
    stream: true,
    thinking: { type: "disabled" },
  });

  // The SDK returns the raw ReadableStream when stream: true.
  const body = completion as unknown as ReadableStream<Uint8Array> | {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        if (opts.signal?.aborted) {
          cancelled = true;
          await reader.cancel().catch(() => {});
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            const delta: string | undefined =
              evt?.choices?.[0]?.delta?.content ??
              evt?.choices?.[0]?.message?.content;
            if (delta) {
              if (!firstTokenMs) firstTokenMs = Date.now() - started;
              text += delta;
              await opts.onToken(delta);
            }
            if (evt?.usage) {
              if (evt.usage.prompt_tokens)
                promptTokens = evt.usage.prompt_tokens;
              if (evt.usage.completion_tokens)
                completionTokens = evt.usage.completion_tokens;
            }
          } catch {
            // ignore malformed keep-alive chunks
          }
        }
      }
    } catch (err) {
      if (opts.signal?.aborted || (err as Error)?.name === "AbortError") {
        cancelled = true;
      } else {
        throw err;
      }
    }
  } else if (body && typeof body === "object") {
    // Non-streaming fallback (provider decided not to stream).
    const content = body.choices?.[0]?.message?.content ?? "";
    if (content) {
      firstTokenMs = Date.now() - started;
      text = content;
      // emit in word chunks so the client still sees streaming behaviour
      const words = content.split(/(\s+)/);
      for (const w of words) {
        if (opts.signal?.aborted) {
          cancelled = true;
          break;
        }
        await opts.onToken(w);
      }
    }
    if (body.usage) {
      promptTokens = body.usage.prompt_tokens ?? promptTokens;
      completionTokens = body.usage.completion_tokens ?? 0;
    }
  }

  if (!completionTokens) completionTokens = Math.ceil(text.length / 4);

  return {
    text,
    promptTokens,
    completionTokens,
    latencyMs: Date.now() - started,
    cancelled,
    firstTokenMs,
  };
}
