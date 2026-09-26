import { describe, expect, it, vi } from "vitest";

const processCrawlJobData = vi.fn(async (...args: unknown[]) => void args);
vi.mock("./process-crawl", () => ({ processCrawlJobData: (...a: unknown[]) => processCrawlJobData(...a) }));
const processRetryJobData = vi.fn(async (...args: unknown[]) => void args);
vi.mock("./process-retry", () => ({ processRetryJobData: (...a: unknown[]) => processRetryJobData(...a) }));

import { handleCrawlMessage, handleRetryMessage, unwrapPayload } from "./handlers";

describe("cloud job handlers", () => {
  it("unwrap the { jobId, kind, payload } envelope the queue publishes", async () => {
    const payload = { sessionId: "s1", url: "https://x.test", maxDepth: 1, maxUrls: 5, requestDelayMs: 0, scopeToInputPath: true };
    await handleCrawlMessage({ jobId: "s1", kind: "crawl", payload });
    expect(processCrawlJobData).toHaveBeenCalledWith(payload);
  });

  it("still accept bare messages queued before the envelope fix", async () => {
    const bare = { retryRecordId: "r1", scrapeUrlId: "u1", sessionId: "s1", kbId: "k1", url: "https://x.test", attemptNumber: 1 };
    await handleRetryMessage(bare);
    expect(processRetryJobData).toHaveBeenCalledWith(bare);
    expect(unwrapPayload({ a: 1 })).toEqual({ a: 1 });
  });

  it("reject messages without the required fields", async () => {
    await expect(handleCrawlMessage({ jobId: "x", kind: "crawl", payload: {} })).rejects.toThrow("Invalid crawl queue message");
  });
});
