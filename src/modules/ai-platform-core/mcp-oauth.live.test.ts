import { describe, expect, it } from "vitest";
// Opt-in live check (network required): run with LIVE_MCP_CHECK=1. Skipped in
// normal test runs so CI never depends on third-party availability.
import {
  fetchAuthorizationServerMetadata,
  probeMcpAuthRequirements,
} from "@/modules/ai-platform-core/mcp-oauth";

const live = process.env.LIVE_MCP_CHECK === "1";

describe.skipIf(!live)("MCP OAuth discovery (live)", { timeout: 30_000 }, () => {
  it("discovers the n8n MCP OAuth authorization server end-to-end", async () => {
    // The user's production n8n instance requires a credential on its MCP
    // endpoint AND publishes full RFC 8414 authorization-server metadata —
    // including a dynamic client registration endpoint — at the origin-level
    // well-known URL. This is the server the platform registers in OAuth mode.
    const probe = await probeMcpAuthRequirements("https://n8n.ostechnologies.in/mcp-server/http");
    expect(probe.requiresAuth).toBe(true);
    const metadata = await fetchAuthorizationServerMetadata("https://n8n.ostechnologies.in/mcp-server/http");
    expect(metadata.authorization_endpoint).toMatch(/^https:\/\/n8n\.ostechnologies\.in\//);
    expect(metadata.token_endpoint).toMatch(/^https:\/\/n8n\.ostechnologies\.in\//);
    expect(metadata.registration_endpoint).toMatch(/^https:\/\/n8n\.ostechnologies\.in\//);
  });

  it("discovers authorization-server metadata from a spec-compliant OAuth MCP endpoint", async () => {
    // Notion's hosted MCP endpoint implements MCP OAuth (401 + WWW-Authenticate
    // resource + well-known metadata via the fallback chain).
    const probe = await probeMcpAuthRequirements("https://mcp.notion.com/mcp");
    expect(probe.requiresAuth).toBe(true);
    const metadata = await fetchAuthorizationServerMetadata("https://mcp.notion.com/mcp");
    expect(metadata.authorization_endpoint).toMatch(/^https:\/\//);
    expect(metadata.token_endpoint).toMatch(/^https:\/\//);
  });
});
