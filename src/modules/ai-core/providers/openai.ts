import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { ChatStreamEvent, ChatToolCall, ChatToolDefinition, ToolCallingChatOptions, ToolCallingLLMProvider } from "../types";
import { LLMProvider, ChatMessage, ChatOptions, EmbedOptions, ProviderConfig } from "../types";
import { netTraceUpstream } from "@/lib/net-trace";

/** Trace-row URL for a vendor endpoint on this client (baseURL is public). */
function traceUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${path}`;
}

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

function toOpenAIMessage(message: ChatMessage): ChatCompletionMessageParam {
  if (message.role === "tool") {
    if (!message.toolCallId) throw new Error("Tool messages require toolCallId.");
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: {
          name: call.name,
          arguments: call.arguments,
        },
      })),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

/**
 * GPT-5.6 reasoning models use the provider default sampling configuration.
 * Sending a custom temperature causes OpenAI to reject the request with an
 * unsupported-value error, so the field must be omitted entirely.
 */
const REASONING_MODEL_PATTERN = /^gpt-5(?:\.\d+)?(?:-(?:luna|terra|sol))?$/i;

export function toOpenAIToolDefinitions(
  tools: readonly ChatToolDefinition[],
): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export interface OpenAIToolCallDelta {
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: string;
}

export function normalizeOpenAIToolCallDeltas(
  deltas: readonly OpenAIToolCallDelta[],
): ChatToolCall[] {
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  for (const delta of deltas) {
    const current = calls.get(delta.index) ?? { id: "", name: "", arguments: "" };
    if (delta.id) current.id = delta.id;
    if (delta.name) current.name = delta.name;
    if (delta.arguments) current.arguments += delta.arguments;
    calls.set(delta.index, current);
  }
  return [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, call]) => call)
    .filter((call) => Boolean(call.id && call.name));
}

export function supportsTemperature(model: string): boolean {
  return !REASONING_MODEL_PATTERN.test(model.trim());
}

/**
 * Reasoning models (o-series, GPT-5.x Luna/Terra/Sol) reject the legacy
 * `max_tokens` parameter and require `max_completion_tokens` instead.
 */
export function usesMaxCompletionTokens(model: string): boolean {
  return REASONING_MODEL_PATTERN.test(model.trim());
}

/** Models that accept `reasoning_effort` (o-series, GPT-5.x; not the -chat variants). */
const REASONING_EFFORT_PATTERN = /^(?:o\d|gpt-5)(?!.*chat)/i;
/** Models that rejected `reasoning_effort` — never sent to them again. */
const reasoningEffortRejected = new Set<string>();

/**
 * The `reasoning_effort` to send, or undefined to leave the model default.
 * A caller asks for a fast turn with `null` (voice turns, query
 * translation); reasoning models then get "low" — the lowest effort every
 * reasoning model accepts — instead of their slower default.
 */
export function reasoningEffortFor(
  model: string,
  requested: ChatOptions["reasoningEffort"],
): "low" | "medium" | "high" | undefined {
  if (requested === undefined) return undefined;
  const id = model.trim();
  if (!REASONING_EFFORT_PATTERN.test(id) || reasoningEffortRejected.has(id)) return undefined;
  return requested ?? "low";
}

export class OpenAIProvider implements LLMProvider, ToolCallingLLMProvider {
  private config: ProviderConfig;
  private client: OpenAI;

  constructor(config?: ProviderConfig) {
    this.config = config ?? { provider: "openai" };
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your environment or provide it in the config."
      );
    }
    // Explicit timeout so unreachable networks fail in OPENAI_TIMEOUT_MS (60s
    // default) with a clear error instead of hanging for the SDK's 10-minute
    // default. SDK-level retries stay at 1 — vector-store-kb adds its own
    // backoff for embeddings, and chat streams handle retries upstream.
    const timeoutMs = (() => {
      const v = Number(process.env.OPENAI_TIMEOUT_MS ?? "60000");
      return Number.isFinite(v) && v > 0 ? v : 60_000;
    })();
    this.client = new OpenAI({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 1,
      // baseURL defaults to OPENAI_BASE_URL env (SDK behaviour) when unset.
    });
  }

  async *chatStreamWithTools(
    messages: ChatMessage[],
    options: ToolCallingChatOptions,
  ): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const model = this.config.chatModel ?? DEFAULT_CHAT_MODEL;
    const openaiMessages: ChatCompletionMessageParam[] = messages.map(toOpenAIMessage);

    const request: ChatCompletionCreateParamsStreaming = {
      model,
      messages: openaiMessages,
      tools: toOpenAIToolDefinitions(options.tools),
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.maxTokens != null) {
      if (usesMaxCompletionTokens(model)) request.max_completion_tokens = options.maxTokens;
      else request.max_tokens = options.maxTokens;
    }
    if (supportsTemperature(model)) request.temperature = options.temperature ?? 0.2;

    const effort = reasoningEffortFor(model, options.reasoningEffort);
    if (effort) request.reasoning_effort = effort;

    // [net-trace] upstream row for the server-side egress call the browser
    // Network tab can never show. Failures (401 invalid key, 429, timeouts)
    // are ALWAYS captured with their HTTP status; successes verbose-only.
    const url = traceUrl(this.client.baseURL, "chat/completions");
    const openStream = async (attempt?: number) => {
      const beganAt = Date.now();
      try {
        const stream = await this.client.chat.completions.create(request);
        netTraceUpstream({
          provider: "openai",
          url,
          status: 200,
          durationMs: Date.now() - beganAt,
          attempt,
          requestBody: request,
          responseBody: { stream: "opened" },
        });
        return stream;
      } catch (error) {
        netTraceUpstream({
          provider: "openai",
          url,
          durationMs: Date.now() - beganAt,
          attempt,
          requestBody: request,
          error,
        });
        throw error;
      }
    };
    const stream = await openStream();
    const deltas: OpenAIToolCallDelta[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text_delta", text: delta.content };
      }
      for (const toolCall of delta?.tool_calls ?? []) {
        deltas.push({
          index: toolCall.index,
          id: toolCall.id ?? undefined,
          name: toolCall.function?.name ?? undefined,
          arguments: toolCall.function?.arguments ?? undefined,
        });
      }
      if (chunk.usage) {
        options.onUsage?.({
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        });
      }
    }

    for (const toolCall of normalizeOpenAIToolCallDeltas(deltas)) {
      yield { type: "tool_call", toolCall };
    }
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown> {
    const model = this.config.chatModel ?? DEFAULT_CHAT_MODEL;

    const openaiMessages: ChatCompletionMessageParam[] = messages.map(toOpenAIMessage);

    const request: ChatCompletionCreateParamsStreaming = {
      model,
      messages: openaiMessages,
      stop: options?.stop,
      stream: true,
      // WS-1.1: the final chunk carries the authoritative token usage so the
      // usage-event spine records real numbers instead of estimates.
      stream_options: { include_usage: true },
    };

    // Reasoning models (o-series, GPT-5.x Luna/Terra/Sol) require
    // `max_completion_tokens` — the legacy `max_tokens` param is rejected.
    if (options?.maxTokens != null) {
      if (usesMaxCompletionTokens(model)) {
        request.max_completion_tokens = options.maxTokens;
      } else {
        request.max_tokens = options.maxTokens;
      }
    }

    // GPT-5.6 Luna/Terra/Sol reject custom temperature values. Omit the field
    // completely so the API applies its model default.
    if (supportsTemperature(model)) {
      request.temperature = options?.temperature ?? 0.2;
    }

    const effort = reasoningEffortFor(model, options?.reasoningEffort);
    if (effort) request.reasoning_effort = effort;

    // [net-trace] upstream rows — one per vendor call (see chatStreamWithTools).
    const url = traceUrl(this.client.baseURL, "chat/completions");
    const openStream = async (attempt?: number) => {
      const beganAt = Date.now();
      try {
        const stream = await this.client.chat.completions.create(request);
        netTraceUpstream({
          provider: "openai",
          url,
          status: 200,
          durationMs: Date.now() - beganAt,
          attempt,
          requestBody: request,
          responseBody: { stream: "opened" },
        });
        return stream;
      } catch (error) {
        netTraceUpstream({
          provider: "openai",
          url,
          durationMs: Date.now() - beganAt,
          attempt,
          requestBody: request,
          error,
        });
        throw error;
      }
    };

    let stream;
    try {
      stream = await openStream();
    } catch (error) {
      // A model that does not take reasoning_effort: remember it and retry
      // once without the field, so a fast-turn hint can never fail a turn.
      const message = (error as Error)?.message ?? "";
      if (!request.reasoning_effort || !/reasoning/i.test(message)) throw error;
      reasoningEffortRejected.add(model.trim());
      delete request.reasoning_effort;
      stream = await openStream(2);
    }

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      // The usage chunk arrives after the last token chunk (choices empty).
      if (chunk.usage) {
        options?.onUsage?.({
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        });
      }
    }
  }

  async embedText(text: string, options?: EmbedOptions): Promise<number[]> {
    const model = this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const url = traceUrl(this.client.baseURL, "embeddings");
    const requestBody = { input: text, model };
    const startedAt = Date.now();
    let response;
    try {
      response = await this.client.embeddings.create(requestBody);
    } catch (error) {
      netTraceUpstream({
        provider: "openai",
        url,
        durationMs: Date.now() - startedAt,
        requestBody,
        error,
      });
      throw error;
    }
    netTraceUpstream({
      provider: "openai",
      url,
      status: 200,
      durationMs: Date.now() - startedAt,
      requestBody,
      responseBody: {
        data: response.data?.length ?? 0,
        dimension: response.data?.[0]?.embedding?.length ?? 0,
      },
    });

    if (response.usage) {
      options?.onUsage?.({
        promptTokens: response.usage.prompt_tokens ?? 0,
        completionTokens: 0,
      });
    }

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("Failed to generate embedding for the provided text.");
    }
    return embedding;
  }

  async embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]> {
    if (texts.length === 0) return [];

    const model = this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const url = traceUrl(this.client.baseURL, "embeddings");
    const requestBody = { input: texts, model };
    const startedAt = Date.now();
    let response;
    try {
      response = await this.client.embeddings.create(requestBody);
    } catch (error) {
      netTraceUpstream({
        provider: "openai",
        url,
        durationMs: Date.now() - startedAt,
        requestBody,
        error,
      });
      throw error;
    }
    netTraceUpstream({
      provider: "openai",
      url,
      status: 200,
      durationMs: Date.now() - startedAt,
      requestBody,
      responseBody: {
        data: response.data?.length ?? 0,
        requests: texts.length,
        dimension: response.data?.[0]?.embedding?.length ?? 0,
      },
    });

    if (response.usage) {
      options?.onUsage?.({
        promptTokens: response.usage.prompt_tokens ?? 0,
        completionTokens: 0,
      });
    }

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  getProviderName(): string {
    return "openai";
  }

  getModelName(type: "chat" | "embedding"): string {
    if (type === "chat") return this.config.chatModel ?? DEFAULT_CHAT_MODEL;
    return this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  getEmbeddingDimension(): number {
    if (this.config.embeddingDimension) return this.config.embeddingDimension;
    const model = this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const envDim = process.env.OPENAI_EMBEDDING_DIMENSION;
    if (envDim) return Number(envDim);
    if (model === "text-embedding-3-large") return 3072;
    return 1536;
  }
}
