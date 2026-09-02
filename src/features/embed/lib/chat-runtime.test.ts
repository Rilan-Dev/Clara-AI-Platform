import { describe, expect, it } from "vitest";
import { parseEmbedChatEvent, readEmbedError } from "./chat-runtime";

describe("embed chat runtime", () => {
  it("extracts a backend error from a non-2xx JSON response", async () => {
    const response = new Response(
      JSON.stringify({ error: "Knowledge-base search failed. Check embedding configuration." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );

    await expect(readEmbedError(response)).resolves.toBe(
      "Knowledge-base search failed. Check embedding configuration.",
    );
  });

  it("extracts the provider error from an NDJSON error event", () => {
    expect(parseEmbedChatEvent('{"type":"error","payload":"model_not_found"}')).toEqual({
      type: "error",
      payload: "model_not_found",
    });
  });

  it("does not treat malformed stream lines as fatal UI errors", () => {
    expect(parseEmbedChatEvent("not-json")).toBeNull();
  });
});
