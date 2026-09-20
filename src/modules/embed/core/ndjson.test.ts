import { describe, expect, it } from "vitest";
import { collectNDJSONEvents, encodeNDJSONEvent } from "./ndjson";

describe("embed NDJSON stream contract", () => {
  it("encodes token and sources events as newline-delimited JSON", () => {
    const encoded = encodeNDJSONEvent({ type: "token", payload: "Hello" });
    expect(encoded).toBe('{"type":"token","payload":"Hello"}\n');
  });

  it("parses events even when chunks split in the middle of a JSON line", () => {
    const chunks = [
      '{"type":"sources","payload":[{"index":1,"title":"Policy"}]}\n{"type":"tok',
      'en","payload":"Hel"}\n{"type":"token","payload":"lo"}\n{"type":"done"}\n',
    ];

    expect(collectNDJSONEvents(chunks)).toEqual([
      { type: "sources", payload: [{ index: 1, title: "Policy" }] },
      { type: "token", payload: "Hel" },
      { type: "token", payload: "lo" },
      { type: "done" },
    ]);
  });
});
