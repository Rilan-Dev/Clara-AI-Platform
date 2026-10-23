import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  getAgentById: vi.fn(),
  getAssistantConfigByAgent: vi.fn(),
  putAssistantConfig: vi.fn(),
  patchAssistantConfig: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireAgentPermission: mocks.requireAgentPermission,
}));
vi.mock("@/modules/organisations/core/db", () => ({ getAgentById: mocks.getAgentById }));
vi.mock("../core/db", () => ({
  getAssistantConfigByAgent: mocks.getAssistantConfigByAgent,
  putAssistantConfig: mocks.putAssistantConfig,
  patchAssistantConfig: mocks.patchAssistantConfig,
}));

import { getAgentConfigHandler, putAgentConfigHandler, patchAgentConfigHandler } from "./agent-config";

const endpoint = "https://clara.example.test/api/agents/agent-1/config";
const get = () => new NextRequest(endpoint);
const request = (method: "PUT" | "PATCH", body: unknown) =>
  new NextRequest(endpoint, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validFullConfig = {
  assistantName: "Clara",
  systemPrompt: "Safe prompt",
  welcomeMessage: "Welcome",
  outOfScopeReply: "I cannot help.",
  rules: [],
  defaultLanguage: "en",
  allowedLanguages: ["en"],
  voiceId: "alloy",
  speed: 1,
  temperature: 0.3,
  maxTokens: 500,
};

describe("agent configuration API hides unexpected internal errors from organisation members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "development");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAgentPermission.mockResolvedValue(undefined);
    mocks.getAgentById.mockResolvedValue({ id: "agent-1", orgId: "org-1" });
    mocks.getAssistantConfigByAgent.mockResolvedValue({ assistantName: "Clara" });
    mocks.putAssistantConfig.mockResolvedValue({ assistantName: "Clara" });
    mocks.patchAssistantConfig.mockResolvedValue({ assistantName: "Updated Clara" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("redacts database diagnostics from GET while retaining server-side evidence", async () => {
    const failure = new Error("postgres://internal:password@db.local?tenant=private");
    mocks.getAssistantConfigByAgent.mockRejectedValueOnce(failure);
    const response = await getAgentConfigHandler(get(), "agent-1");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to load agent configuration." });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(console.error).toHaveBeenCalledWith("[agent-config] GET:", failure);
  });

  it("redacts provider/backend exception details from full PUT", async () => {
    mocks.putAssistantConfig.mockRejectedValueOnce(
      new Error("sql constraint violated: internal_schema private-token-123"),
    );
    const response = await putAgentConfigHandler(request("PUT", validFullConfig), "agent-1");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Unable to save agent configuration.");
    expect(text).not.toContain("internal_schema");
    expect(text).not.toContain("private-token-123");
    expect(mocks.putAssistantConfig).toHaveBeenCalledOnce();
  });

  it("redacts unexpected PATCH storage exceptions without hiding the failure", async () => {
    mocks.patchAssistantConfig.mockRejectedValueOnce(
      new Error("upstream http 429 at https://vendor.invalid/secret-key"),
    );
    const response = await patchAgentConfigHandler(
      request("PATCH", { assistantName: "Updated Clara" }),
      "agent-1",
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to save agent configuration." });
    expect(mocks.patchAssistantConfig).toHaveBeenCalledOnce();
  });

  it("keeps existing missing-agent 404 instead of converting it to an internal error", async () => {
    mocks.getAgentById.mockResolvedValueOnce(null);
    const response = await getAgentConfigHandler(get(), "not-found");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Agent not found" });
    expect(mocks.getAssistantConfigByAgent).not.toHaveBeenCalled();
  });

  it("keeps RBAC denial status and never reads or writes agent configuration", async () => {
    mocks.requireAgentPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await patchAgentConfigHandler(
      request("PATCH", { assistantName: "Injected" }), "agent-1",
    );
    expect(response.status).toBe(403);
    expect(mocks.getAgentById).not.toHaveBeenCalled();
    expect(mocks.patchAssistantConfig).not.toHaveBeenCalled();
  });
});
