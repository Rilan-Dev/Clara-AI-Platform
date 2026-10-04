/**
 * Phase 7-C — bounded, default-off provider tool-calling loop.
 *
 * This is deliberately not a general autonomous-agent runtime. It is a
 * bounded orchestration primitive for the authorized pilot: one provider turn
 * may request tools, the Unified Tool Runtime executes them, and the loop may
 * continue only until a hard maximum is reached.
 */

import type {
  ChatMessage,
  ChatStreamEvent,
  ChatToolDefinition,
  ToolCallingLLMProvider,
} from "../ai-core/types";
import type { PlatformExecutionContext } from "./contracts";
import { consumeProviderToolCall, isProviderToolCallingEnabled } from "./provider-tool-calling-pilot";
import type { ToolRuntime } from "./tool-registry";

export const AGENT_LOOP_FLAG = "ENABLE_AI_PLATFORM_AGENT_LOOP";
export const HARD_MAX_AGENT_ITERATIONS = 8;
const DEFAULT_MAX_AGENT_ITERATIONS = 3;

export type AgenticLoopStatus =
  | "disabled"
  | "completed"
  | "max_iterations"
  | "provider_error"
  | "cancelled";

export interface AgenticLoopResult {
  readonly status: AgenticLoopStatus;
  readonly text: string;
  readonly events: readonly ChatStreamEvent[];
  readonly iterations: number;
  readonly error?: string;
}

export function isAgentLoopEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    (env[AGENT_LOOP_FLAG] ?? "").trim().toLowerCase(),
  );
}

function boundedIterations(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_AGENT_ITERATIONS;
  return Math.max(1, Math.min(HARD_MAX_AGENT_ITERATIONS, Math.floor(value as number)));
}

function serializeToolResult(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Tool result was not JSON serializable." });
  }
}

export async function runBoundedAgenticLoop(
  provider: ToolCallingLLMProvider,
  initialMessages: readonly ChatMessage[],
  tools: readonly ChatToolDefinition[],
  context: PlatformExecutionContext,
  runtime: ToolRuntime,
  options?: {
    readonly enabled?: boolean;
    readonly maxIterations?: number;
    readonly signal?: AbortSignal;
    readonly toolCallingEnabled?: boolean;
  },
): Promise<AgenticLoopResult> {
  const enabled = options?.enabled ?? isAgentLoopEnabled();
  const toolCallingEnabled = options?.toolCallingEnabled ?? isProviderToolCallingEnabled();
  if (!enabled || !toolCallingEnabled) {
    return {
      status: "disabled",
      text: "",
      events: [],
      iterations: 0,
    };
  }

  const maxIterations = boundedIterations(options?.maxIterations);
  const history: ChatMessage[] = [...initialMessages];
  const signal = options?.signal;
  const events: ChatStreamEvent[] = [];
  let text = "";

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (signal?.aborted) {
      return {
        status: "cancelled",
        text,
        events: Object.freeze([...events]),
        iterations: iteration - 1,
      };
    }
    const turnEvents: ChatStreamEvent[] = [];
    try {
      for await (const event of provider.chatStreamWithTools(history, { tools })) {
        turnEvents.push(event);
        events.push(event);
        if (event.type === "text_delta") {
          text += event.text;
        }
      }
    } catch {
      return {
        status: "provider_error",
        text,
        events: Object.freeze([...events]),
        iterations: iteration,
        error: "Provider tool-calling request failed.",
      };
    }

    if (signal?.aborted) {
      return {
        status: "cancelled",
        text,
        events: Object.freeze([...events]),
        iterations: iteration,
      };
    }

    const toolCalls = turnEvents
      .filter((event): event is Extract<ChatStreamEvent, { type: "tool_call" }> => event.type === "tool_call")
      .map((event) => event.toolCall);

    if (toolCalls.length === 0) {
      return {
        status: "completed",
        text,
        events: Object.freeze([...events]),
        iterations: iteration,
      };
    }

    history.push({
      role: "assistant",
      content: turnEvents
        .filter((event): event is Extract<ChatStreamEvent, { type: "text_delta" }> => event.type === "text_delta")
        .map((event) => event.text)
        .join(""),
      toolCalls,
    });

    for (const call of toolCalls) {
      if (signal?.aborted) {
        return {
          status: "cancelled",
          text,
          events: Object.freeze([...events]),
          iterations: iteration,
        };
      }
      const result = await consumeProviderToolCall(call, context, runtime, { enabled: toolCallingEnabled });
      const toolResultEvent: ChatStreamEvent = result.error
        ? {
            type: "tool_result",
            toolCallId: result.callId,
            toolName: call.name,
            result: result.error,
          }
        : {
            type: "tool_result",
            toolCallId: result.callId,
            toolName: call.name,
            result: result.outcome,
          };
      events.push(toolResultEvent);

      history.push({
        role: "tool",
        toolCallId: result.callId,
        toolName: call.name,
        content: serializeToolResult(result.error ?? result.outcome),
      });
    }
  }

  return {
    status: "max_iterations",
    text,
    events: Object.freeze([...events]),
    iterations: maxIterations,
  };
}
