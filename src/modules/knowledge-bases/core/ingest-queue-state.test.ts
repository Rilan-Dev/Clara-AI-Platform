import { describe, expect, it } from "vitest";
import { isPendingDocumentStuck } from "./ingest-queue-state";

describe("isPendingDocumentStuck", () => {
  const now = Date.parse("2026-09-03T00:00:00.000Z");

  it("reports a pending document as stuck only after 30 seconds", () => {
    expect(
      isPendingDocumentStuck(
        { status: "pending", createdAt: "2026-09-02T23:59:30.001Z" },
        now,
      ),
    ).toBe(false);

    expect(
      isPendingDocumentStuck(
        { status: "pending", createdAt: "2026-09-02T23:59:30.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("does not call an actively processing document stuck", () => {
    expect(
      isPendingDocumentStuck(
        { status: "processing", createdAt: "2026-09-02T23:58:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("does not call ready or failed documents stuck", () => {
    expect(
      isPendingDocumentStuck(
        { status: "ready", createdAt: "2026-09-02T23:50:00.000Z" },
        now,
      ),
    ).toBe(false);

    expect(
      isPendingDocumentStuck(
        { status: "failed", createdAt: "2026-09-02T23:50:00.000Z" },
        now,
      ),
    ).toBe(false);
  });
});
