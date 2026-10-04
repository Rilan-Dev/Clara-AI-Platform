import { describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "./execution-context";
import {
  AGENT_LOOP_FLAG,
  isAgentLoopEnabled,
  runBoundedAgenticLoop,
} from "./agentic-loop";
import type { ChatStreamEvent, ToolCallingLLMProvider } from "../ai-core/types";
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

  it("does not execute tools when the provider-tool flag is disabled", async () => {
    const p = provider([{ type: "tool_call", toolCall: { id: "call-disabled", name: "rag_search", arguments: "{}" } }]);
    const spy = vi.spyOn(p, "chatStreamWithTools");

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "hello" }],
      [],
      context,
      runtime(),
      { enabled: true, toolCallingEnabled: false },
    );

    expect(result.status).toBe("disabled");
    expect(spy).not.toHaveBeenCalled();
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
          yield { type: "tool_call", toolCall: { id: "call-1", name: "rag_search", arguments: '{"query":"q"}' } } as const;
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
      { enabled: true, toolCallingEnabled: true, maxIterations: 3 },
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
        yield { type: "tool_call", toolCall: { id: "call-loop", name: "rag_search", arguments: "{}" } } as const;
      }),
    };
    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "loop" }],
      [{ name: "rag_search", description: "search", parameters: { type: "object" } }],
      context,
      runtime(),
      { enabled: true, toolCallingEnabled: true, maxIterations: 999 },
    );

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(8);
    expect(p.chatStreamWithTools).toHaveBeenCalledTimes(8);
  });

  it("normalizes provider failures into a bounded provider_error result", async () => {
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi.fn(async function* () {
        throw new Error("provider unavailable");
      }),
    };

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "hello" }],
      [],
      context,
      runtime(),
      { enabled: true, toolCallingEnabled: true },
    );

    expect(result.status).toBe("provider_error");
    expect(result.error).toBe("Provider tool-calling request failed.");
    expect(result.iterations).toBe(1);
  });

  it("does not expose the raw provider error message", async () => {
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi.fn(async function* () {
        throw new Error("Authorization Bearer secret-token must not escape");
      }),
    };

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "hello" }],
      [],
      context,
      runtime(),
      { enabled: true, toolCallingEnabled: true },
    );

    expect(result.status).toBe("provider_error");
    expect(result.error).toBe("Provider tool-calling request failed.");
    expect(result.error).not.toContain("secret-token");
  });

  it("preserves a tool failure as a tool_result and still lets the provider finish", async () => {
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi
        .fn()
        .mockImplementationOnce(async function* () {
          yield { type: "tool_call", toolCall: { id: "call-fail", name: "rag_search", arguments: "{}" } } as const;
        })
        .mockImplementationOnce(async function* () {
          yield { type: "text_delta", text: "recovered" };
        }),
    };
    const rt: ToolRuntime = {
      ...runtime(),
      invoke: vi.fn(async () => ({
        ok: false as const,
        toolName: "rag_search",
        error: { code: "EXECUTION_FAILED" as const, message: "qdrant unavailable" },
      })),
    };

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "hello" }],
      [{ name: "rag_search", description: "search", parameters: { type: "object" } }],
      context,
      rt,
      { enabled: true, toolCallingEnabled: true },
    );

    expect(result.status).toBe("completed");
    expect(result.text).toBe("recovered");
    expect(result.events.some((event) => event.type === "tool_result" && typeof event.result === "object" && event.result !== null && "ok" in event.result && event.result.ok === false)).toBe(true);
  });

  it("does not execute a pending tool after cancellation", async () => {
    const controller = new AbortController();
    const rt: ToolRuntime = {
      ...runtime(),
      invoke: vi.fn(async () => {
        throw new Error("tool should not execute after cancellation");
      }),
    };
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi.fn(async function* () {
        yield { type: "tool_call", toolCall: { id: "call-pending", name: "rag_search", arguments: "{}" } } as const;
        controller.abort();
      }),
    };

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "cancel" }],
      [{ name: "rag_search", description: "search", parameters: { type: "object" } }],
      context,
      rt,
      { enabled: true, toolCallingEnabled: true, signal: controller.signal },
    );

    expect(result.status).toBe("cancelled");
    expect(rt.invoke).not.toHaveBeenCalled();
  });

  it("stops before another provider turn when cancellation is requested", async () => {
    const controller = new AbortController();
    const p: ToolCallingLLMProvider = {
      ...provider([]),
      chatStreamWithTools: vi.fn(async function* () {
        controller.abort();
        yield { type: "tool_call", toolCall: { id: "call-cancel", name: "rag_search", arguments: "{}" } };
      }),
    };

    const result = await runBoundedAgenticLoop(
      p,
      [{ role: "user", content: "cancel" }],
      [{ name: "rag_search", description: "search", parameters: { type: "object" } }],
      context,
      runtime(),
      { enabled: true, toolCallingEnabled: true, maxIterations: 8, signal: controller.signal },
    );

    expect(result.status).toBe("cancelled");
    expect(result.iterations).toBe(1);
    expect(p.chatStreamWithTools).toHaveBeenCalledTimes(1);
  });

  it("preserves provider text deltas while collecting tool events", async () => {
    const result = await runBoundedAgenticLoop(
      provider([{ type: "text_delta", text: "hello " }, { type: "text_delta", text: "world" }]),
      [{ role: "user", content: "hello" }],
      [],
      context,
      runtime(),
      { enabled: true, toolCallingEnabled: true },
    );

    expect(result.status).toBe("completed");
    expect(result.text).toBe("hello world");
  });
});
