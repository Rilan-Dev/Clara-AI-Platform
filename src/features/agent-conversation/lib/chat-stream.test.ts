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
});
