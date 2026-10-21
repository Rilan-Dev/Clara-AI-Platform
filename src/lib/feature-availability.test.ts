import { describe, expect, it } from "vitest";
import { featureForPath, resolveFeatureAvailability } from "./feature-availability";

describe("deployment-local optional feature switches", () => {
  it("defaults both features off for an existing production deployment", () => {
    expect(resolveFeatureAvailability({ NODE_ENV: "production" })).toEqual({
      embeddableWidget: false, integrations: false,
    });
    expect(resolveFeatureAvailability({})).toEqual({
      embeddableWidget: false, integrations: false,
    });
  });

  it("defaults both on for an isolated development deployment", () => {
    expect(resolveFeatureAvailability({ CLARA_ENV: "development", NODE_ENV: "production" })).toEqual({
      embeddableWidget: true, integrations: true,
    });
    expect(resolveFeatureAvailability({ NODE_ENV: "development" })).toEqual({
      embeddableWidget: true, integrations: true,
    });
  });

  it("honors explicit production context even when NODE_ENV is development", () => {
    expect(resolveFeatureAvailability({ CLARA_ENV: "production", NODE_ENV: "development" }))
      .toEqual({ embeddableWidget: false, integrations: false });
  });

  it("separates independent per-deployment overrides with no shared state", () => {
    const dev = { CLARA_ENV: "development", CLARA_FEATURE_EMBEDDABLE_WIDGET: "false", CLARA_FEATURE_INTEGRATIONS: "true" };
    const prod = { CLARA_ENV: "production", CLARA_FEATURE_EMBEDDABLE_WIDGET: "true", CLARA_FEATURE_INTEGRATIONS: "false" };
    expect(resolveFeatureAvailability(dev)).toEqual({ embeddableWidget: false, integrations: true });
    expect(resolveFeatureAvailability(prod)).toEqual({ embeddableWidget: true, integrations: false });
    expect(resolveFeatureAvailability(dev)).toEqual({ embeddableWidget: false, integrations: true });
  });

  it("fails closed on unknown flag text in either environment", () => {
    expect(resolveFeatureAvailability({
      CLARA_ENV: "development", CLARA_FEATURE_EMBEDDABLE_WIDGET: "eventually",
      CLARA_FEATURE_INTEGRATIONS: "some-value",
    })).toEqual({ embeddableWidget: false, integrations: false });
  });
});

describe("feature route ownership", () => {
  it.each([
    ["/api/embed/chat", "embeddableWidget"], ["/api/embed/session", "embeddableWidget"],
    ["/embed/widget", "embeddableWidget"], ["/embed/clara.js", "embeddableWidget"],
    ["/embed/landing-demo", "embeddableWidget"], ["/settings/embed", "embeddableWidget"],
    ["/api/kbs/kb-1/api-keys/key-1", "embeddableWidget"],
    ["/api/platform/demo-config", "embeddableWidget"],
    ["/api/orgs/org-1/mcp/connections", "integrations"],
    ["/api/orgs/org-1/mcp-servers", "integrations"],
    ["/api/orgs/org-1/integrations", "integrations"],
    ["/api/orgs/org-1/agents/agent-1/mcp-tools", "integrations"],
    ["/api/orgs/org-1/agents/agent-1/messaging/connection", "integrations"],
    ["/api/platform/integrations/catalog", "integrations"],
    ["/api/platform/mcp-settings", "integrations"],
    ["/api/webhooks/whatsapp", "integrations"],
    ["/api/cron/whatsapp-daily-briefings", "integrations"],
    ["/api/whatsapp/oauth/callback", "integrations"],
    ["/api/integrations/oauth/callback", "integrations"],
    ["/orgs/org-1/agents/agent-1/integrations", "integrations"],
    ["/orgs/org-1/agents/agent-1/messaging", "integrations"],
    ["/settings/mcp/governance", "integrations"],
  ] as const)("gates %s as %s", (path, feature) => {
    expect(featureForPath(path)).toBe(feature);
  });

  it.each([
    "/api/chat", "/api/public/agents/a-1/config", "/api/kbs/kb-1/documents",
    "/api/agents/a-1/preview", "/api/webhooks/stripe",
    "/api/cron/ai-health", "/api/phone/session", "/orgs/org-1/agents",
    "/settings/ai", "/embed-other", "/api/embedder",
  ])("never gates shared/non-feature route %s", (path) => {
    expect(featureForPath(path)).toBeNull();
  });
});
