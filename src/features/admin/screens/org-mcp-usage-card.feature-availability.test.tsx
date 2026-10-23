import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ usePlatformFeatures: vi.fn() }));
vi.mock("@/features/admin/use-platform-features", () => ({
  usePlatformFeatures: mocks.usePlatformFeatures,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { OrgMcpUsageCard } from "./org-mcp-usage-card";

describe("organisation billing MCP surface in optional-feature deployments", () => {
  it("renders no MCP billing controls when disabled", () => {
    mocks.usePlatformFeatures.mockReturnValue({ integrations: false, embeddableWidget: true });
    expect(renderToStaticMarkup(createElement(OrgMcpUsageCard, { orgId: "org-1" }))).toBe("");
  });

  it("keeps the development MCP usage surface available", () => {
    mocks.usePlatformFeatures.mockReturnValue({ integrations: true, embeddableWidget: false });
    expect(renderToStaticMarkup(createElement(OrgMcpUsageCard, { orgId: "org-1" })))
      .toContain("Loading MCP usage");
  });
});
