import { afterEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn(async (_topic: string, _payload: unknown, options: Record<string, unknown>) => ({
  messageId: String(options.idempotencyKey),
}));
vi.mock("@vercel/queue", () => ({ send: (...args: Parameters<typeof sendMock>) => sendMock(...args) }));

const dispatchMock = vi.fn(async (...args: unknown[]) => void args);
vi.mock("./handlers", () => ({ dispatchCloudJob: (...args: unknown[]) => dispatchMock(...args) }));

import { cloudQueueTransport, enqueueCloudJob } from "./queue";

afterEach(() => {
  vi.unstubAllEnvs();
  sendMock.mockClear();
  dispatchMock.mockClear();
});

describe("cloud job queue", () => {
  it("rejects empty job ids", async () => {
    await expect(enqueueCloudJob("ingest", "  ")).rejects.toThrow("Cloud job id is required");
  });

  it("uses Vercel Queues only on Vercel unless forced", () => {
    expect(cloudQueueTransport({})).toBe("local");
    expect(cloudQueueTransport({ VERCEL: "1" })).toBe("vercel");
    expect(cloudQueueTransport({ VERCEL: "1", CLOUD_QUEUE_MODE: "local" })).toBe("local");
    expect(cloudQueueTransport({ CLOUD_QUEUE_MODE: "vercel" })).toBe("vercel");
  });

  it("publishes deterministic idempotent messages on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const result = await enqueueCloudJob("ingest", "job-123", { foo: "bar" });
    expect(result.messageId).toBe("clara:ingest:job-123");
    expect(sendMock).toHaveBeenCalledWith(
      "clara-ingest",
      { jobId: "job-123", kind: "ingest", payload: { foo: "bar" } },
      expect.objectContaining({ idempotencyKey: "clara:ingest:job-123" }),
    );
  });

  it("runs jobs in-process outside Vercel (Docker) without touching Vercel Queues", async () => {
    vi.stubEnv("VERCEL", "");
    const result = await enqueueCloudJob("crawl", "session-1", { sessionId: "session-1", url: "https://x.test" });
    expect(result.messageId).toBe("local:clara:crawl:session-1");
    expect(sendMock).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(dispatchMock).toHaveBeenCalledTimes(1));
    expect(dispatchMock).toHaveBeenCalledWith("crawl", {
      jobId: "session-1", kind: "crawl", payload: { sessionId: "session-1", url: "https://x.test" },
    });
  });

  it("does not run the same local job twice while it is in flight", async () => {
    vi.stubEnv("VERCEL", "");
    await enqueueCloudJob("ingest", "dup-1");
    await enqueueCloudJob("ingest", "dup-1");
    await vi.waitFor(() => expect(dispatchMock).toHaveBeenCalled());
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });
});
