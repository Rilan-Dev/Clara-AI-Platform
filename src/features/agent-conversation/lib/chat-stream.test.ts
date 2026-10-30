import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAgentChat } from "./chat-stream";

describe("streamAgentChat — never leaves the chat stuck", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports a network failure and finishes instead of rejecting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const onError = vi.fn();
    const onDone = vi.fn();
    await expect(
      streamAgentChat(
        { kbId: "kb", messages: [{ role: "user", content: "hi" }], endpoint: "/api/chat" },
        { onSources: vi.fn(), onToken: vi.fn(), onError, onDone },
      ),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Could not reach the assistant/));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("measures response headers, first token and completion while parsing fragmented NDJSON", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"token","payload":"Hel'));
        controller.enqueue(encoder.encode('lo"}\\n{"type":"token","payload":" world"}\\n'));
        controller.enqueue(encoder.encode('{"type":"done"}\\n'));
        controller.close();
      },
    }), { status: 200, headers: {
      "Content-Type": "application/x-ndjson",
      "Server-Timing": "rag-retrieval;dur=7, pre-llm;dur=21",
    } })));
    const tokens: string[] = [];
    const phases: Array<{phase:string;elapsedMs:number;serverTiming?:string|null}> = [];
    const onDone=vi.fn();
    await streamAgentChat(
      { kbId:"kb",messages:[{role:"user",content:"hi"}],endpoint:"/api/public/chat" },
      {
        onSources:vi.fn(),onToken:(t)=>tokens.push(t),onError:vi.fn(),onDone,
        onTiming:(t)=>phases.push(t),
      },
    );
    expect(tokens.join("")).toBe("Hello world");
    expect(phases.map(t=>t.phase)).toEqual(["headers","first_token","complete"]);
    expect(phases.every(t=>t.elapsedMs>=0)).toBe(true);
    expect(phases[0]?.serverTiming).toContain("rag-retrieval");
    expect(onDone).toHaveBeenCalledOnce();
  });

});
