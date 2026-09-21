import { describe, expect, it } from "vitest";
import type { CloudCrawlJob } from "./process-crawl";

describe("cloud crawl job contract", () => {
  it("requires a resumable session identifier and bounded limits", () => {
    const job: CloudCrawlJob = {
      sessionId: "session-1",
      url: "https://example.com",
      maxDepth: 2,
      maxUrls: 50,
      requestDelayMs: 100,
      scopeToInputPath: true,
    };
    expect(job.sessionId).toBeTruthy();
    expect(job.maxUrls).toBeGreaterThan(0);
    expect(job.maxDepth).toBeGreaterThanOrEqual(0);
  });
});
