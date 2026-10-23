import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

afterEach(() => vi.unstubAllEnvs());

describe("deployment feature switches at request boundary", () => {
  const request = (path: string, method = "GET") =>
    new NextRequest("https://clara.example.test" + path, {
      method,
      headers: {
        origin: "https://client.example.test",
        authorization: "Bearer never-inspected-for-a-disabled-feature",
      },
    });

  it("rejects widget POST and OPTIONS in production before CORS preflight", async () => {
    vi.stubEnv("CLARA_ENV", "production");
    const post = middleware(request("/api/embed/chat", "POST"));
    const options = middleware(request("/api/embed/session", "OPTIONS"));
    expect(post.status).toBe(404);
    expect(options.status).toBe(404);
    expect(await post.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(post.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects WhatsApp webhook and MCP configuration in production", () => {
    vi.stubEnv("CLARA_ENV", "production");
    expect(middleware(request("/api/webhooks/whatsapp", "POST")).status).toBe(404);
    expect(middleware(request("/api/orgs/o1/mcp/servers", "PATCH")).status).toBe(404);
    expect(middleware(request("/settings/embed")).status).toBe(404);
    expect(middleware(request("/orgs/o1/agents/a1/integrations")).status).toBe(404);
  });

  it("lets development routes and their preflights reach their existing handlers", () => {
    vi.stubEnv("CLARA_ENV", "development");
    expect(middleware(request("/api/embed/chat", "POST")).status).toBe(200);
    expect(middleware(request("/api/embed/chat", "OPTIONS")).status).toBe(204);
    expect(middleware(request("/api/webhooks/whatsapp", "POST")).status).toBe(200);
  });

  it("blocks org MCP override administration and its preflight in disabled production", async () => {
    vi.stubEnv("CLARA_ENV", "production");
    for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
      const response = middleware(request("/api/platform/orgs/org-1/mcp-override", method));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    }
    // Unrelated organisation management must remain independent.
    expect(middleware(request("/api/platform/orgs/org-1", "GET")).status).not.toBe(404);
  });

  it("preserves MCP override management when development integrations are enabled", () => {
    vi.stubEnv("CLARA_ENV", "development");
    expect(middleware(request("/api/platform/orgs/org-1/mcp-override", "GET")).status).not.toBe(404);
    expect(middleware(request("/api/platform/orgs/org-1/mcp-override", "PUT")).status).not.toBe(404);
    expect(middleware(request("/api/platform/orgs/org-1/mcp-override", "OPTIONS")).status).toBe(204);
  });

  it("isolates widget and integrations overrides without changing shared APIs", () => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "false");
    expect(middleware(request("/api/embed/chat", "POST")).status).toBe(404);
    expect(middleware(request("/api/webhooks/whatsapp", "POST")).status).toBe(200);
    expect(middleware(request("/api/chat", "POST")).status).not.toBe(404);
    expect(middleware(request("/api/health")).status).toBe(200);
  });
});
