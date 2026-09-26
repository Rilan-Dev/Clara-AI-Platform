import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAIConfig = vi.fn();
vi.mock("./resolve", () => ({ resolveAIConfig: (...a: unknown[]) => resolveAIConfig(...a) }));

import { clearResolveAIConfigCache, resolveAIConfigCached } from "./resolve-cache";

describe("resolveAIConfigCached", () => {
  beforeEach(() => {
    clearResolveAIConfigCache();
    resolveAIConfig.mockReset();
    vi.useRealTimers();
  });

  it("reuses a fresh resolution instead of re-reading the database", async () => {
    resolveAIConfig.mockResolvedValue({ provider: "openai", chatModel: "a" });
    await resolveAIConfigCached({ kbId: "kb", surface: "chat" });
    await resolveAIConfigCached({ kbId: "kb", surface: "chat" });
    expect(resolveAIConfig).toHaveBeenCalledTimes(1);
    await resolveAIConfigCached({ kbId: "kb", surface: "chat", preferDraft: true });
    expect(resolveAIConfig).toHaveBeenCalledTimes(2); // draft is a separate entry
  });

  it("serves a stale value while refreshing, so an edit lands on the next turn", async () => {
    vi.useFakeTimers();
    resolveAIConfig.mockResolvedValueOnce({ chatModel: "old" }).mockResolvedValueOnce({ chatModel: "new" });
    await resolveAIConfigCached({ kbId: "kb", surface: "chat" });
    vi.advanceTimersByTime(11_000);
    expect(await resolveAIConfigCached({ kbId: "kb", surface: "chat" })).toEqual({ chatModel: "old" });
    await vi.waitFor(() => expect(resolveAIConfig).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(await resolveAIConfigCached({ kbId: "kb", surface: "chat" })).toEqual({ chatModel: "new" });
  });

  it("evicts on a failed refresh so the next turn surfaces the error", async () => {
    vi.useFakeTimers();
    resolveAIConfig.mockResolvedValueOnce({ chatModel: "old" }).mockRejectedValueOnce(new Error("provider disabled"));
    await resolveAIConfigCached({ kbId: "kb", surface: "chat" });
    vi.advanceTimersByTime(11_000);
    await resolveAIConfigCached({ kbId: "kb", surface: "chat" });
    await vi.waitFor(() => expect(resolveAIConfig).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    resolveAIConfig.mockRejectedValueOnce(new Error("provider disabled"));
    await expect(resolveAIConfigCached({ kbId: "kb", surface: "chat" })).rejects.toThrow("provider disabled");
  });
});
