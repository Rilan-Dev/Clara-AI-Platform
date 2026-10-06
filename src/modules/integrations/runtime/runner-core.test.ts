import { beforeEach, describe, expect, it, vi } from "vitest";

const getIntegration = vi.fn();
const loadPiece = vi.fn();
const credentialGet = vi.fn();
const assertIntegrationExecutionAuthorized = vi.fn();
const xrayEnd = vi.fn();
const xrayPhase = vi.fn();

vi.mock("../registry/index.js", () => ({ getIntegration }));

vi.mock("./credential-vault.js", () => ({
  credentialVault: { get: credentialGet },
}));

vi.mock("./execution-authorization.js", () => ({
  assertIntegrationExecutionAuthorized,
}));

vi.mock("./runner-fetch.js", () => ({
  fetchCtx: { run: vi.fn() },
  createTracedFetch: vi.fn(),
  redactText: (value: string | null) => value,
  redactValue: (value: unknown) => value,
}));

vi.mock("./action-input-validation.js", () => ({
  validateActionProps: vi.fn().mockReturnValue([]),
}));

vi.mock("./runner-helpers.js", () => ({
  customActions: {},
  pieceCache: new Map(),
  loadPiece,
  resolveAuth: vi.fn(),
  ensureTokenFresh: vi.fn(),
  logUsage: vi.fn(),
}));

vi.mock("./xray.js", () => ({
  xray: {
    start: vi.fn(() => ({
      phase: xrayPhase,
      end: xrayEnd,
      httpStart: vi.fn(),
      httpEnd: vi.fn(),
    })),
  },
}));

describe("integration runner action allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getIntegration.mockReturnValue({
      id: "example",
      displayName: "Example",
      authType: "none",
      actions: ["approved_action"],
    });
    assertIntegrationExecutionAuthorized.mockResolvedValue(undefined);
  });

  it("rejects a piece action that is not in Clara's registry allowlist", async () => {
    const { runAction } = await import("./runner-core.js");

    const result = await runAction({
      integrationId: "example",
      actionName: "unreviewed_piece_action",
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed for example");
    expect(result.error).toContain("approved_action");
    expect(loadPiece).not.toHaveBeenCalled();
    expect(credentialGet).not.toHaveBeenCalled();
  });
});
