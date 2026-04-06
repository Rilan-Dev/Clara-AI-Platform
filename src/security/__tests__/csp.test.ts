import { describe, expect, it } from "vitest";
import { CSP_HEADER_VALUE } from "../csp";

describe("CSP header", () => {
  it("keeps connect-src strict", () => {
    expect(CSP_HEADER_VALUE).toContain(
      "connect-src 'self' wss: https://api.openai.com https://realtime.openai.com",
    );
  });

  it("includes CSP violation reporting", () => {
    expect(CSP_HEADER_VALUE).toContain("report-uri /api/csp-report");
  });

  it("does not allow blocked analytics domains", () => {
    expect(CSP_HEADER_VALUE).not.toContain("google-analytics.com");
    expect(CSP_HEADER_VALUE).not.toContain("overbridgenet.com");
  });
});
