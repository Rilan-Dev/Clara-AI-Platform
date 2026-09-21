import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/queue", () => ({
  send: vi.fn(async (_topic: string, _payload: unknown, options: Record<string, unknown>) => ({
    messageId: String(options.idempotencyKey),
  })),
}));

import { enqueueCloudJob } from "./queue";

describe("cloud job queue", () => {
  it("rejects empty job ids", async () => {
    await expect(enqueueCloudJob("ingest", "  ")).rejects.toThrow("Cloud job id is required");
  });

  it("publishes deterministic idempotent messages", async () => {
    const result = await enqueueCloudJob("ingest", "job-123", { foo: "bar" });
    expect(result.messageId).toBe("clara:ingest:job-123");
  });
});
