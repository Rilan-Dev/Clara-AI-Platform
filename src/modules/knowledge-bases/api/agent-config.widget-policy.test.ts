import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  getAgentById: vi.fn(),
  getAssistantConfigByAgent: vi.fn(),
  putAssistantConfig: vi.fn(),
  patchAssistantConfig: vi.fn(),
  syncDraftFromLegacyPatch: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth, requireAgentPermission: mocks.requireAgentPermission,
}));
vi.mock("@/modules/organisations/core/db", () => ({ getAgentById: mocks.getAgentById }));
vi.mock("../core/db", () => ({
  getAssistantConfigByAgent: mocks.getAssistantConfigByAgent,
  putAssistantConfig: mocks.putAssistantConfig,
  patchAssistantConfig: mocks.patchAssistantConfig,
}));
vi.mock("@/modules/agent-versioning/core/projection", () => ({
  syncDraftFromLegacyPatch: mocks.syncDraftFromLegacyPatch,
}));

import { putAgentConfigHandler, patchAgentConfigHandler } from "./agent-config";

const agentId = "agent-1";
const existing = () => ({
  assistantName: "Clara",
  primaryColour: "#123456",
  widgetTheme: "dark",
  headerBg: "#141414",
  customInjectJs: "window.clara=1",
  voiceBtnSize: 44,
});

const full = (other: Record<string, unknown> = {}) => ({
  assistantName: "New name",
  systemPrompt: "Current instructions",
  welcomeMessage: "Hello",
  outOfScopeReply: "Out of scope",
  rules: [],
  defaultLanguage: "en",
  allowedLanguages: ["en"],
  voiceId: "alloy",
  speed: 1,
  temperature: 0.5,
  maxTokens: 500,
  ...other,
});
const req = (method: "PUT" | "PATCH", body: unknown) => new NextRequest(
  "https://clara.example.test/api/agents/agent-1/config",
  { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
);

afterEach(() => vi.unstubAllEnvs());

describe("disabled widget appearance at authenticated shared agent config API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "false");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAgentPermission.mockResolvedValue(undefined);
    mocks.getAgentById.mockResolvedValue({ id: agentId, orgId: "org-1" });
    mocks.getAssistantConfigByAgent.mockResolvedValue(existing());
    mocks.putAssistantConfig.mockImplementation(async (_id, input) => input);
    mocks.patchAssistantConfig.mockImplementation(async (_id, input) => input);
    mocks.syncDraftFromLegacyPatch.mockResolvedValue(undefined);
  });

  it("rejects a widget-design PATCH before the database or draft projection changes", async () => {
    const res = await patchAgentConfigHandler(req("PATCH", {
      assistantName: "Still legitimate", customInjectJs: "untrusted new JS",
    }), agentId);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.patchAssistantConfig).not.toHaveBeenCalled();
    expect(mocks.syncDraftFromLegacyPatch).not.toHaveBeenCalled();
  });

  it("allows native assistant and voice configuration PATCH while dropping redundant widget fields", async () => {
    const res = await patchAgentConfigHandler(req("PATCH", {
      assistantName: "New name", welcomeMessage: "Hello again",
      voiceId: "alloy", speed: 1.2,
      widgetTheme: "dark", primaryColour: "#123456",
    }), agentId);
    expect(res.status).toBe(200);
    expect(mocks.patchAssistantConfig).toHaveBeenCalledWith(agentId, {
      assistantName: "New name", welcomeMessage: "Hello again",
      voiceId: "alloy", speed: 1.2,
    });
    expect(mocks.syncDraftFromLegacyPatch).toHaveBeenCalledOnce();
  });

  it("does not lose stored widget customization on a core-only full PUT", async () => {
    const res = await putAgentConfigHandler(req("PUT", full({
      assistantName: "Updated identity", speed: 1.5,
    })), agentId);
    expect(res.status).toBe(200);
    expect(mocks.putAssistantConfig).toHaveBeenCalledOnce();
    const saved = mocks.putAssistantConfig.mock.calls[0]?.[1];
    expect(saved).toMatchObject({
      assistantName: "Updated identity",
      speed: 1.5,
      primaryColour: "#123456",
      widgetTheme: "dark",
      headerBg: "#141414",
      customInjectJs: "window.clara=1",
      voiceBtnSize: 44,
    });
  });

  it("rejects a full PUT that attempts to change disabled widget design", async () => {
    const res = await putAgentConfigHandler(req("PUT", full({
      widgetTheme: "light",
    })), agentId);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.putAssistantConfig).not.toHaveBeenCalled();
  });

  it("keeps widget editing fully functional when explicitly enabled in development", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "true");
    const patch = await patchAgentConfigHandler(req("PATCH", {
      widgetTheme: "light", customInjectJs: "approved dev code",
    }), agentId);
    expect(patch.status).toBe(200);
    expect(mocks.patchAssistantConfig).toHaveBeenCalledWith(agentId, {
      widgetTheme: "light", customInjectJs: "approved dev code",
    });
    const put = await putAgentConfigHandler(req("PUT", full({
      widgetTheme: "light",
    })), agentId);
    expect(put.status).toBe(200);
    expect(mocks.putAssistantConfig.mock.calls.at(-1)?.[1].widgetTheme).toBe("light");
  });

  it("does not bypass RBAC even with the widget enabled", async () => {
    mocks.requireAgentPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await patchAgentConfigHandler(req("PATCH", { widgetTheme: "dark" }), agentId);
    expect(res.status).toBe(403);
    expect(mocks.getAssistantConfigByAgent).not.toHaveBeenCalled();
    expect(mocks.patchAssistantConfig).not.toHaveBeenCalled();
  });

  it("rejects widget styling before creating a previously missing configuration", async () => {
    mocks.getAssistantConfigByAgent.mockResolvedValueOnce(null);
    const res = await putAgentConfigHandler(req("PUT", full({
      widgetTheme: "dark",
    })), agentId);
    expect(res.status).toBe(404);
    expect(mocks.putAssistantConfig).not.toHaveBeenCalled();
  });
});
