import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AgentVersionConfig } from "../core/types";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  ensureAgentVersioning: vi.fn(),
  saveAgentDraft: vi.fn(),
  getDraft: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireAgentPermission: mocks.requireAgentPermission,
}));
vi.mock("../core/db", () => ({
  AgentVersioningError: class AgentVersioningError extends Error {
    code = "DRAFT_NOT_FOUND";
  },
  getDraft: mocks.getDraft,
  getBranch: vi.fn(),
}));
vi.mock("../core/service", () => ({
  applyPlatformDefaultUpdate: vi.fn(),
  archiveAgentBranch: vi.fn(),
  changeTagsForVersion: vi.fn(),
  createBranchFromVersion: vi.fn(),
  diffAgentVersionConfigs: vi.fn(),
  ensureAgentVersioning: mocks.ensureAgentVersioning,
  executeMergeToMain: vi.fn(),
  getAgentWorkspaceContext: vi.fn(),
  getPublishContext: vi.fn(),
  listAgentBranches: vi.fn(),
  listAgentVersions: vi.fn(),
  publishVersion: vi.fn(),
  restoreVersion: vi.fn(),
  reviewMerge: vi.fn(),
  rollbackToVersion: vi.fn(),
  saveAgentDraft: mocks.saveAgentDraft,
  saveVersionFromDraft: vi.fn(),
}));

import { putDraftHandler } from "./handlers";

function config(embed: boolean, voice = true): AgentVersionConfig {
  return {
    assistant: { assistantName: "Clara" } as AgentVersionConfig["assistant"],
    ai: null,
    runtime: { enableVoice: voice, enableRealtime: true, enablePublicEmbed: embed },
  };
}
const req = (configuration: AgentVersionConfig, branchId?: string) =>
  new NextRequest("https://clara.example.test/api/agents/agent-1/draft", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ configuration, ...(branchId ? { branchId } : {}) }),
  });

afterEach(() => vi.unstubAllEnvs());

describe("disabled public-embed preference on shared agent draft API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "production");
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAgentPermission.mockResolvedValue(undefined);
    mocks.ensureAgentVersioning.mockResolvedValue({
      main: { id: "main-1" },
      draft: { configuration: config(true) },
    });
    mocks.getDraft.mockResolvedValue({ configuration: config(false) });
    mocks.saveAgentDraft.mockImplementation(async (_id, branchId, configuration) => ({
      branchId,
      configuration,
    }));
  });

  it("rejects toggling public embed through the shared PUT even with a valid agent permission", async () => {
    const response = await putDraftHandler(req(config(false)), "agent-1");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.requireAgentPermission).toHaveBeenCalledWith(
      expect.anything(), "agent-1", "project:update",
    );
    expect(mocks.saveAgentDraft).not.toHaveBeenCalled();
  });

  it("allows voice configuration changes with the existing embed preference untouched", async () => {
    const response = await putDraftHandler(req(config(true, false)), "agent-1");
    expect(response.status).toBe(200);
    expect(mocks.saveAgentDraft).toHaveBeenCalledWith(
      "agent-1", "main-1",
      expect.objectContaining({ runtime: expect.objectContaining({ enableVoice: false, enablePublicEmbed: true }) }),
      "user-1",
    );
  });

  it("does not use Main's embed preference for edits to a separate agent branch", async () => {
    const blocked = await putDraftHandler(req(config(true), "branch-2"), "agent-1");
    expect(blocked.status).toBe(404);
    expect(mocks.getDraft).toHaveBeenCalledWith("agent-1", "branch-2");
    expect(mocks.saveAgentDraft).not.toHaveBeenCalled();
  });

  it("keeps the feature fully writable for authorized development agents", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    const response = await putDraftHandler(req(config(false)), "agent-1");
    expect(response.status).toBe(200);
    expect(mocks.saveAgentDraft).toHaveBeenCalledOnce();
  });

  it("rejects a version draft that changes widget styling while production widget is off", async () => {
    const incoming = config(true);
    incoming.assistant.widgetTheme = "dark";
    incoming.assistant.customInjectJs = "window.untrusted = true";
    const response = await putDraftHandler(req(incoming), "agent-1");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.saveAgentDraft).not.toHaveBeenCalled();
  });

  it("does not reject core edits when the submitted widget values equal the stored ones", async () => {
    const existing = config(true);
    existing.assistant.widgetTheme = "dark";
    existing.assistant.customInjectJs = "window.saved = true";
    mocks.ensureAgentVersioning.mockResolvedValueOnce({
      main: { id: "main-1" }, draft: { configuration: existing },
    });
    const incoming = config(true, false);
    incoming.assistant.widgetTheme = "dark";
    incoming.assistant.customInjectJs = "window.saved = true";
    const response = await putDraftHandler(req(incoming), "agent-1");
    expect(response.status).toBe(200);
    expect(mocks.saveAgentDraft).toHaveBeenCalledOnce();
  });

  it("compares widget values with the selected branch, never the Main draft", async () => {
    const branch = config(false);
    branch.assistant.widgetTheme = "light";
    mocks.getDraft.mockResolvedValueOnce({ configuration: branch });
    const incoming = config(false);
    incoming.assistant.widgetTheme = "dark";
    const response = await putDraftHandler(req(incoming, "branch-2"), "agent-1");
    expect(response.status).toBe(404);
    expect(mocks.saveAgentDraft).not.toHaveBeenCalled();
  });

  it("allows explicit widget design changes for enabled development", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    const incoming = config(true);
    incoming.assistant.widgetTheme = "dark";
    incoming.assistant.customInjectJs = "window.dev = true";
    const response = await putDraftHandler(req(incoming), "agent-1");
    expect(response.status).toBe(200);
    expect(mocks.saveAgentDraft).toHaveBeenCalledOnce();
  });

  it("retains the existing authorization barrier before any feature decision", async () => {
    mocks.requireAgentPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await putDraftHandler(req(config(false)), "agent-1");
    expect(response.status).toBe(403);
    expect(mocks.ensureAgentVersioning).not.toHaveBeenCalled();
    expect(mocks.saveAgentDraft).not.toHaveBeenCalled();
  });
});
