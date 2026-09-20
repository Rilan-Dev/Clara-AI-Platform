import { describe, expect, it } from "vitest";
import { findBlockedAnalyticsTokens } from "../blocked-domains";

describe("blocked analytics detection", () => {
  it("detects blocked hosts and endpoint fragments", () => {
    const sample = `
      <script>
        fetch("https://www.google-analytics.com/mp/collect?cid=123");
        fetch("https://overbridgenet.com/jsv8/offer");
      </script>
    `;

    const matches = findBlockedAnalyticsTokens(sample);
    expect(matches).toEqual(
      expect.arrayContaining([
        "google-analytics.com",
        "overbridgenet.com",
        "/mp/collect",
        "/jsv8/offer",
      ]),
    );
  });

  it("returns empty when no tokens exist", () => {
    const matches = findBlockedAnalyticsTokens("<div>Hello</div>");
    expect(matches).toEqual([]);
  });
});
