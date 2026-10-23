import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  getAgentWorkspaceContext: vi.fn(),
  ensureAgentVersioning: vi.fn(),
  getBranch: vi.fn(),
  getDraft: vi.fn(),
  saveAgentDraft: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireAgentPermission: mocks.requireAgentPermission,
}));

vi.mock("../core/db", () => ({
  AgentVersioningError: class AgentVersioningError extends Error {
    constructor(message: string, public readonly code = "AGENT_VERSIONING_ERROR") {
      super(message);
    }
  },
  getBranch: mocks.getBranch,
  getDraft: mocks.getDraft,
}));

vi.mock("../core/service", () => ({
  applyPlatformDefaultUpdate: vi.fn(),
  archiveAgentBranch: vi.fn(),
  changeTagsForVersion: vi.fn(),
  createBranchFromVersion: vi.fn(),
  diffAgentVersionConfigs: vi.fn(),
  ensureAgentVersioning: mocks.ensureAgentVersioning,
  executeMergeToMain: vi.fn(),
  getAgentWorkspaceContext: mocks.getAgentWorkspaceContext,
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

import { getWorkspaceContextHandler, getDraftHandler, putDraftHandler } from "./handlers";
import { AgentVersioningError } from "../core/db";

const getRequest = () => new NextRequest("https://clara.example.test/api/agents/agent-1/draft");
const putRequest = () => new NextRequest("https://clara.example.test/api/agents/agent-1/draft", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    configuration: {
      assistant: { assistantName: "Clara" },
      ai: null,
      runtime: { enableVoice: true, enableRealtime: true, enablePublicEmbed: true },
    },
  }),
});

describe("tenant-safe agent-versioning failure responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "development");
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAgentPermission.mockResolvedValue(undefined);
    mocks.getAgentWorkspaceContext.mockResolvedValue({ agentId: "agent-1" });
    mocks.ensureAgentVersioning.mockResolvedValue({
      main: { id: "main-1" },
      draft: { configuration: { assistant: { assistantName: "Clara" } } },
    });
    mocks.saveAgentDraft.mockResolvedValue({ id: "draft-1" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("never sends unexpected database error strings back to an authorised agent user", async () => {
    const internal = new Error("PG_URL=postgres://admin:secret@db.local:5432/tenant?sslmode=require");
    mocks.getAgentWorkspaceContext.mockRejectedValueOnce(internal);

    const response = await getWorkspaceContextHandler(getRequest(), "agent-1");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Versioning operation failed");
    for (const privateValue of ["PG_URL", "postgres://", "secret", "db.local", "tenant"]) {
      expect(text).not.toContain(privateValue);
    }
    expect(console.error).toHaveBeenCalledWith("[agent-versioning]", internal);
  });

  it("also redacts unexpected failures of draft retrieval", async () => {
    mocks.ensureAgentVersioning.mockRejectedValueOnce(
      new Error('SELECT agent_drafts ... violated constraint "tenant_internal_key"'),
    );
    const response = await getDraftHandler(getRequest(), "agent-1");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Versioning operation failed" });
  });

  it("also redacts unexpected failures of draft persistence", async () => {
    mocks.saveAgentDraft.mockRejectedValueOnce(
      new Error("provider 429 RESOURCE_EXHAUSTED https://internal.vendor.example/key=private"),
    );
    const response = await putDraftHandler(putRequest(), "agent-1");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Versioning operation failed");
    expect(text).not.toContain("private");
    expect(text).not.toContain("RESOURCE_EXHAUSTED");
  });

  it("preserves known user-actionable versioning codes and appropriate status codes", async () => {
    mocks.ensureAgentVersioning.mockRejectedValueOnce(
      new AgentVersioningError("Branch not found.", "BRANCH_NOT_FOUND"),
    );
    const response = await getDraftHandler(getRequest(), "agent-1");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Branch not found.", code: "BRANCH_NOT_FOUND" });
  });

  it("maps missing draft resources to 404, not malformed-input 400", async () => {
    mocks.ensureAgentVersioning.mockRejectedValueOnce(
      new AgentVersioningError("Branch has no draft.", "DRAFT_NOT_FOUND"),
    );
    const response = await getDraftHandler(getRequest(), "agent-1");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Branch has no draft.", code: "DRAFT_NOT_FOUND",
    });
  });

  it.each([
    "MAIN_CREATE_FAILED",
    "BRANCH_CREATE_FAILED",
    "VERSION_CREATE_FAILED",
    "DRAFT_SAVE_FAILED",
    "DEPLOYMENT_CREATE_FAILED",
  ])("treats internal persistence failure %s as a sanitized 500", async (code) => {
    const internal = new AgentVersioningError("Failed to save draft.", code);
    mocks.ensureAgentVersioning.mockRejectedValueOnce(internal);
    const response = await getDraftHandler(getRequest(), "agent-1");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Versioning operation failed" });
    expect(console.error).toHaveBeenCalledWith("[agent-versioning]", internal);
  });

  it("preserves explicit authentication or authorization response status", async () => {
    mocks.requireAgentPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await getDraftHandler(getRequest(), "agent-1");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(mocks.ensureAgentVersioning).not.toHaveBeenCalled();
  });
});
