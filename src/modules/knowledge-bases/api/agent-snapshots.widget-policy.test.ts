import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  getAgentById: vi.fn(),
  getAssistantConfigByAgent: vi.fn(),
  putAssistantConfig: vi.fn(),
  getSnapshot: vi.fn(),
  snapshotConfig: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth, requireAgentPermission: mocks.requireAgentPermission,
}));
vi.mock("@/modules/organisations/core/db", () => ({ getAgentById: mocks.getAgentById }));
vi.mock("../core/db", () => ({
  getAssistantConfigByAgent: mocks.getAssistantConfigByAgent,
  putAssistantConfig: mocks.putAssistantConfig,
}));
vi.mock("../core/snapshots-db", () => ({
  listSnapshots: vi.fn(),
  getSnapshot: mocks.getSnapshot,
  snapshotConfig: mocks.snapshotConfig,
}));

import { restoreSnapshotHandler } from "./agent-snapshots";

const agentId = "agent-1";
const current = {
  assistantName: "Current assistant",
  welcomeMessage: "Current message",
  systemPrompt: "Current prompt",
  primaryColour: "#102030",
  widgetTheme: "dark",
  customInjectJs: "window.previousStyle = true",
  voiceBtnSize: 44,
};
const savedVersion = {
  assistantName: "Older assistant",
  welcomeMessage: "Older message",
  systemPrompt: "Older prompt",
  primaryColour: "#ffffff",
  widgetTheme: "light",
  customInjectJs: "window.staleWidget = true",
  voiceBtnSize: 64,
};
const request = () => new NextRequest(
  "https://clara.example.test/api/agents/agent-1/config/snapshots/snapshot-1/restore",
  { method: "POST" },
);

afterEach(() => vi.unstubAllEnvs());

describe("shared agent snapshot restoration with optional widget disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "false");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAgentPermission.mockResolvedValue(undefined);
    mocks.getAgentById.mockResolvedValue({ id: agentId, orgId: "org-1" });
    mocks.getSnapshot.mockResolvedValue({ snapshot: savedVersion });
    mocks.getAssistantConfigByAgent.mockResolvedValue(current);
    mocks.snapshotConfig.mockResolvedValue({ id: "pre-restore" });
    mocks.putAssistantConfig.mockImplementation(async (_id, input) => input);
  });

  it("restores ordinary assistant fields while keeping existing widget appearance unchanged", async () => {
    const res = await restoreSnapshotHandler(request(), agentId, "snapshot-1");
    expect(res.status).toBe(200);
    expect((await res.json()).restored).toBe(true);
    expect(mocks.putAssistantConfig).toHaveBeenCalledOnce();
    const input = mocks.putAssistantConfig.mock.calls[0]?.[1];
    expect(input).toMatchObject({
      assistantName: "Older assistant",
      systemPrompt: "Older prompt",
      welcomeMessage: "Older message",
      primaryColour: "#102030",
      widgetTheme: "dark",
      customInjectJs: "window.previousStyle = true",
      voiceBtnSize: 44,
    });
    expect(mocks.snapshotConfig).toHaveBeenCalledWith(current, "user-1", "Pre-restore backup");
  });

  it("restores the full saved widget design when development feature is enabled", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "true");
    const res = await restoreSnapshotHandler(request(), agentId, "snapshot-1");
    expect(res.status).toBe(200);
    expect(mocks.putAssistantConfig.mock.calls[0]?.[1]).toMatchObject(savedVersion);
  });

  it("does not restore stale styling or create a pre-restore backup without a live baseline", async () => {
    mocks.getAssistantConfigByAgent.mockResolvedValueOnce(null);
    const res = await restoreSnapshotHandler(request(), agentId, "snapshot-1");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.snapshotConfig).not.toHaveBeenCalled();
    expect(mocks.putAssistantConfig).not.toHaveBeenCalled();
  });

  it("does not create a backup when the requested snapshot is missing", async () => {
    mocks.getSnapshot.mockResolvedValueOnce(null);
    const res = await restoreSnapshotHandler(request(), agentId, "missing");
    expect(res.status).toBe(404);
    expect(mocks.getAssistantConfigByAgent).not.toHaveBeenCalled();
    expect(mocks.snapshotConfig).not.toHaveBeenCalled();
    expect(mocks.putAssistantConfig).not.toHaveBeenCalled();
  });

  it("preserves agent RBAC as the first permission barrier", async () => {
    mocks.requireAgentPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await restoreSnapshotHandler(request(), agentId, "snapshot-1");
    expect(res.status).toBe(403);
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.putAssistantConfig).not.toHaveBeenCalled();
  });
});
