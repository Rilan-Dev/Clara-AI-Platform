import { describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "./execution-context";
import {
  AGENT_LOOP_FLAG,
  isAgentLoopEnabled,
  runBoundedAgenticLoop,
} from "./agentic-loop";
import type { ChatMessage, ChatStreamEvent, ToolCallingLLMProvider } from "../ai-core/types";
import type { ToolRuntime } from "./tool-registry";

const context = createExecutionContext({
  orgId: "org-agent",
  kbId: "kb-agent",
  surface: "chat",
});

function provider(events: ChatStreamEvent[]): ToolCallingLLMProvider {
  return {
    chatStream: async function* () {},
    embedText: async () => [],
    embedBatch: async () => [],
    getProviderName: () => "test",
    getModelName: () => "test",
    getEmbeddingDimension: () => 1,
    chatStreamWithTools: async function* () {
      yield* events;
    },
  };
}

function runtime(): ToolRuntime {
  return {
    registerTool: vi.fn(),
    hasTool: vi.fn(() => true),
    getTool: vi.fn(),
    listTools: vi.fn(() => []),
    invoke: vi.fn(async () => ({
      ok: true as const,
      toolName: "rag_search",
      data: { answer: "grounded" },
    })),
  };
}

describe("bounded agentic loop", () => {
  it("is default-off and uses a dedicated flag", () => {
    expect(AGENT_LOOP_FLAG).toBe("ENABLE_AI_PLATFORM_AGENT_LOOP");
    expect(isAgentLoopEnabled({})).toBe(false);
    expect(isAgentLoopEnabled({ ENABLE_AI_PLATFORM_AGENT_LOOP: "true" })).toBe(true);
  });

  it("returns without calling the provider when disabled", async () => {
    const p = provider([{ type: "text_delta", text: "should not run" }]);
    const spy = vi.spyOn(p, "chatStreamWithTools");

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "hello" }],
      [],
      context,
      runtime(),
      { enabled: false },
    );

    expect(result.status).toBe("disabled");
    expect(spy).not.toHaveBeenCalled();
  });

  it("executes a tool call through the unified runtime and returns the final answer", async () => {
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi
        .fn()
        .mockImplementationOnce(async function* () {
          yield { type: "tool_call", toolCall: { id: "call-1", name: "rag_search", arguments: '{"query":"q"}' } };
        })
        .mockImplementationOnce(async function* () {
          yield { type: "text_delta", text: "final answer" };
        }),
    };
    const rt = runtime();

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "hello" }],
      [{ name: "rag_search", description: "search", parameters: { type: "object" } }],
      context,
      rt,
      { enabled: true, maxIterations: 3 },
    );

    expect(result.status).toBe("completed");
    expect(result.text).toBe("final answer");
    expect(result.iterations).toBe(2);
    expect(rt.invoke).toHaveBeenCalledWith("rag_search", { query: "q" }, context);
    expect(result.events.some((event) => event.type === "tool_result")).toBe(true);
  });

  it("hard-clamps the loop and never exceeds eight provider iterations", async () => {
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi.fn(async function* () {
        yield { type: "tool_call", toolCall: { id: "call-loop", name: "rag_search", arguments: "{}" } };
      }),
    };
    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "loop" }],
      [{ name: "rag_search", description: "search", parameters: { type: "object" } }],
      context,
      runtime(),
      { enabled: true, maxIterations: 999 },
    );

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(8);
    expect(p.chatStreamWithTools).toHaveBeenCalledTimes(8);
  });

  it("preserves provider text deltas while collecting tool events", async () => {
    const result = await runBoundedAgenticLoop(
      provider([{ type: "text_delta", text: "hello " }, { type: "text_delta", text: "world" }]),
      [{ role: "user", content: "hello" }],
      [],
      context,
      runtime(),
      { enabled: true },
    );

    expect(result.status).toBe("completed");
    expect(result.text).toBe("hello world");
  });
});
