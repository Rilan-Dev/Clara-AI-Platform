import { describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "./execution-context";
import {
  consumeProviderToolCall,
  isProviderToolCallingEnabled,
} from "./provider-tool-calling-pilot";
import type { ToolInvocationOutcome } from "./tool-contracts";
import type { ToolRuntime } from "./tool-registry";

const context = createExecutionContext({
  orgId: "org-pilot",
  kbId: "kb-pilot",
  surface: "chat",
});

function runtime(outcome: ToolInvocationOutcome): ToolRuntime {
  return {
    registerTool: vi.fn(),
    hasTool: vi.fn(() => true),
    getTool: vi.fn(),
    listTools: vi.fn(() => []),
    invoke: vi.fn(async () => outcome),
  };
}

describe("provider tool-calling pilot", () => {
  it("is disabled unless the explicit flag is enabled", () => {
    expect(isProviderToolCallingEnabled({})).toBe(false);
    expect(isProviderToolCallingEnabled({ ENABLE_AI_PLATFORM_TOOL_CALLING: "false" })).toBe(false);
    expect(isProviderToolCallingEnabled({ ENABLE_AI_PLATFORM_TOOL_CALLING: "true" })).toBe(true);
  });

  it("does not invoke the runtime while the pilot is disabled", async () => {
    const invoke = vi.fn();
    const rt = runtime({ ok: true, toolName: "rag_search", data: { answer: "x" } });
    rt.invoke = invoke;

    const result = await consumeProviderToolCall(
      { id: "call-1", name: "rag_search", arguments: "{}" },
      context,
      rt,
      { enabled: false },
    );

    expect(result.error?.code).toBe("PILOT_DISABLED");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("translates JSON arguments and executes only through the Unified Tool Runtime", async () => {
    const expected: ToolInvocationOutcome = {
      ok: true,
      toolName: "rag_search",
      data: { result: "ok" },
    };
    const rt = runtime(expected);

    const result = await consumeProviderToolCall(
      { id: "call-2", name: "rag_search", arguments: '{"query":"hello"}' },
      context,
      rt,
      { enabled: true },
    );

    expect(result.error).toBeNull();
    expect(result.outcome).toBe(expected);
    expect(rt.invoke).toHaveBeenCalledWith(
      "rag_search",
      { query: "hello" },
      context,
    );
  });

  it("accepts already-decoded object arguments without changing them", async () => {
    const rt = runtime({ ok: true, toolName: "rag_search", data: null });

    await consumeProviderToolCall(
      { id: "call-3", name: "rag_search", arguments: { query: "hello" } },
      context,
      rt,
      { enabled: true },
    );

    expect(rt.invoke).toHaveBeenCalledWith(
      "rag_search",
      { query: "hello" },
      context,
    );
  });

  it("rejects malformed provider calls without invoking a tool", async () => {
    const rt = runtime({ ok: true, toolName: "rag_search", data: null });

    const badJson = await consumeProviderToolCall(
      { id: "call-4", name: "rag_search", arguments: "{" },
      context,
      rt,
      { enabled: true },
    );
    const missingName = await consumeProviderToolCall(
      { id: "call-5", name: "", arguments: "{}" },
      context,
      rt,
      { enabled: true },
    );

    expect(badJson.error?.code).toBe("MALFORMED_TOOL_CALL");
    expect(missingName.error?.code).toBe("MALFORMED_TOOL_CALL");
    expect(rt.invoke).not.toHaveBeenCalled();
  });

  it("rejects a forged context before the provider payload reaches the runtime", async () => {
    const rt = runtime({ ok: true, toolName: "rag_search", data: null });
    const forged = Object.freeze({ tenantId: "attacker", kbId: "attacker-kb", surface: "chat" });

    const result = await consumeProviderToolCall(
      { id: "call-forged", name: "rag_search", arguments: "{}" },
      forged as never,
      rt,
      { enabled: true },
    );

    expect(result.error?.code).toBe("MALFORMED_TOOL_CALL");
    expect(rt.invoke).not.toHaveBeenCalled();
  });

  it("preserves runtime denials instead of bypassing authorization", async () => {
    const denial: ToolInvocationOutcome = {
      ok: false,
      toolName: "rag_search",
      error: {
        code: "UNAUTHORIZED_SURFACE",
        message: "denied",
      },
    };
    const rt = runtime(denial);

    const result = await consumeProviderToolCall(
      { id: "call-6", name: "rag_search", arguments: "{}" },
      context,
      rt,
      { enabled: true },
    );

    expect(result.outcome).toBe(denial);
  });
});
