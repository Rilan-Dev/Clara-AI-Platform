import { describe, expect, it } from "vitest";
import { runIngestPollerCycle } from "./ingest-poller";

describe("runIngestPollerCycle", () => {
  it("delegates one cycle to the queue processor", async () => {
    const expected = { status: "idle" as const };
    let calls = 0;

    const result = await runIngestPollerCycle(async () => {
      calls += 1;
      return expected;
    });

    expect(result).toEqual(expected);
    expect(calls).toBe(1);
  });
});
