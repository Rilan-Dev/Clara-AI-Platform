import { describe, expect, it } from "vitest";
import { readGroundedRagResponse } from "./rag-http-response";

describe("voice knowledge HTTP response guards", () => {
  it("preserves a valid successful grounded response", async () => {
    const data = { grounded: true, context: "S1 policy", sources: [{ id: "a" }] };
    expect(await readGroundedRagResponse(new Response(JSON.stringify(data), { status: 200 })))
      .toEqual(data);
  });
  it("never mistakes a 404, 403 or 503 for missing evidence", async () => {
    for (const code of [403, 404, 503]) {
      const r = new Response(JSON.stringify({ error: "Bearer PRIVATE-SECRET" }), { status: code });
      await expect(readGroundedRagResponse(r)).rejects.toThrow("HTTP " + code);
    }
  });
  it("refuses invalid success envelopes and unreadable JSON", async () => {
    await expect(readGroundedRagResponse(new Response("null", { status: 200 }))).rejects.toThrow("invalid response");
    await expect(readGroundedRagResponse(new Response("not JSON", { status: 200 }))).rejects.toThrow("unreadable");
    await expect(readGroundedRagResponse(new Response(JSON.stringify({ error: "hidden upstream error" }), { status: 200 })))
      .rejects.toThrow("failure");
  });
});
