import { describe, expect, it } from "vitest";
import { widgetDesignConfigUrl } from "./widget-design-config-url";

describe("KB widget editor agent-owned configuration route", () => {
  it("loads and saves against the existing agent config endpoint", () => {
    const endpoint = widgetDesignConfigUrl("agent-123");
    expect(endpoint).toBe("/api/agents/agent-123/config");
    expect(endpoint).not.toContain("/api/kbs/");
  });

  it("encodes the supplied agent identity as one path segment", () => {
    expect(widgetDesignConfigUrl("agent/another?debug=1"))
      .toBe("/api/agents/agent%2Fanother%3Fdebug%3D1/config");
  });

  it("does not mix knowledge-base and agent identifiers", () => {
    expect(widgetDesignConfigUrl("agent-789")).not.toContain("kb-456");
  });
});
