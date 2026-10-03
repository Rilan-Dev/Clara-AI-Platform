import { describe, expect, it } from "vitest";
import { normalizeOpenAIToolCallDeltas, toOpenAIToolDefinitions } from "./openai";
import type { ChatToolDefinition } from "../types";

describe("OpenAI provider tool-calling normalization", () => {
  const tools: readonly ChatToolDefinition[] = [{ name: "rag_search", description: "Search the tenant knowledge base.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } }];

  it("maps normalized tool definitions to OpenAI function tools without changing schemas", () => {
    expect(toOpenAIToolDefinitions(tools)).toEqual([{ type: "function", function: { name: "rag_search", description: "Search the tenant knowledge base.", parameters: tools[0].parameters } }]);
  });

  it("reassembles streamed tool-call deltas into provider-neutral calls", () => {
    expect(normalizeOpenAIToolCallDeltas([
      { index: 0, id: "call-1", name: "rag_search", arguments: "{\"que" },
      { index: 1, id: "call-2", name: "other_tool", arguments: "{\"x\":" },
      { index: 0, arguments: "ry\":\"hello\"}" },
      { index: 1, arguments: "1}" },
    ])).toEqual([
      { id: "call-1", name: "rag_search", arguments: "{\"query\":\"hello\"}" },
      { id: "call-2", name: "other_tool", arguments: "{\"x\":1}" },
    ]);
  });
});
