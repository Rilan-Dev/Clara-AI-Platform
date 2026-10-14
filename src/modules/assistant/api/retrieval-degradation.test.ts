import { afterEach, describe, expect, it } from "vitest";

import {
  isStrictRetrievalMode,
  retrievalDegradationEvent,
  retrievalDegradationSystemNotice,
} from "./retrieval-degradation";

describe("retrieval degradation policy", () => {
  afterEach(() => {
    delete process.env.CHAT_STRICT_RETRIEVAL;
  });

  it("defaults to graceful degradation (strict mode off)", () => {
    expect(isStrictRetrievalMode()).toBe(false);
  });

  it("enables strict mode for 1/true/yes, case-insensitive and padded", () => {
    for (const value of ["1", "true", "YES", " true "]) {
      process.env.CHAT_STRICT_RETRIEVAL = value;
      expect(isStrictRetrievalMode()).toBe(true);
    }
  });

  it("keeps degradation for unknown values instead of guessing", () => {
    for (const value of ["0", "false", "off", ""]) {
      process.env.CHAT_STRICT_RETRIEVAL = value;
      expect(isStrictRetrievalMode()).toBe(false);
    }
  });

  it("produces a model-facing notice and a public-safe event message", () => {
    const notice = retrievalDegradationSystemNotice();
    expect(notice).toContain("[System notice]");
    expect(notice).toContain("unavailable");
    expect(notice).toContain("do not fabricate");

    const event = retrievalDegradationEvent();
    expect(event.message).toContain("temporarily unavailable");
    // No provider internals (hosts, keys, regions) may reach the client.
    expect(event.message).not.toMatch(/api\.|key|http|gemini|openai/i);
  });
});
