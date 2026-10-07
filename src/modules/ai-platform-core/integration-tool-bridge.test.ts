import { describe, expect, it } from "vitest";
import {
  buildIntegrationActionDefinition,
  buildIntegrationToolDefinition,
  integrationToolName,
} from "./integrations/integration-tool-bridge";
import {
  FIRST_PROVIDER_ACTION,
  FIRST_PROVIDER_INTEGRATION_ID,
  isFirstProviderPilotAction,
  isIntegrationProviderPilotEnabled,
} from "./integration-provider-pilot";

describe("I-4 integration tool bridge", () => {
  it("creates deterministic ToolDefinition names within the runtime limit", () => {
    const name = integrationToolName("firecrawl", "search");
    expect(name).toBe("integration_firecrawl_search");
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it("turns runner action props into runtime input validation", () => {
    const definition = buildIntegrationActionDefinition("firecrawl", {
      name: "search",
      displayName: "Search",
      description: "Search the web",
      props: {
        query: { type: "STRING", required: true },
        limit: { type: "NUMBER", required: false },
      },
    });
    const tool = buildIntegrationToolDefinition(definition);

    expect(tool.inputSchema.safeParse({ query: "Clara" }).success).toBe(true);
    expect(tool.inputSchema.safeParse({}).success).toBe(false);
    expect(tool.inputSchema.safeParse({ query: "Clara", limit: "10" }).success).toBe(false);
    expect(tool.authorization.requireUserId).toBe(true);
    expect(tool.authorization.allowedSurfaces).toEqual(["chat", "realtime", "embed"]);
  });
});

describe("I-5 first-provider pilot", () => {
  it("is restricted to Firecrawl search", () => {
    expect(isFirstProviderPilotAction(FIRST_PROVIDER_INTEGRATION_ID, FIRST_PROVIDER_ACTION)).toBe(true);
    expect(isFirstProviderPilotAction("firecrawl", "crawl")).toBe(false);
    expect(isFirstProviderPilotAction("tavily", "search")).toBe(false);
  });

  it("keeps the provider pilot disabled unless explicitly enabled", () => {
    expect(isIntegrationProviderPilotEnabled({})).toBe(false);
    expect(isIntegrationProviderPilotEnabled({ ENABLE_INTEGRATION_PROVIDER_PILOT: "false" })).toBe(false);
    expect(isIntegrationProviderPilotEnabled({ ENABLE_INTEGRATION_PROVIDER_PILOT: "true" })).toBe(true);
  });
});
