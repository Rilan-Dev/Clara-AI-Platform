import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.clearAllMocks();
    getIntegration.mockReturnValue({
      id: "example",
      displayName: "Example",
      authType: "none",
      actions: ["approved_action"],
    });
    assertIntegrationExecutionAuthorized.mockResolvedValue(undefined);
  });

  it("does not advertise unreviewed package actions when registry matching is sparse", async () => {
    loadPiece.mockResolvedValue({
      actions: [
        { name: "approved_action", displayName: "Approved", description: "approved", props: {} },
        { name: "unreviewed_piece_action", displayName: "Unreviewed", description: "must not escape", props: {} },
        { name: "another_unreviewed_action", displayName: "Another", description: "must not escape", props: {} },
      ],
    });

    const { getIntegrationActions } = await import("./runner-core.js");
    const actions = await getIntegrationActions("example");

    expect(actions.map((action) => action.name)).toContain("approved_action");
    expect(actions.map((action) => action.name)).not.toContain("unreviewed_piece_action");
    expect(actions.map((action) => action.name)).not.toContain("another_unreviewed_action");
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
    expect(result.errorCode).toBe("ACTION_NOT_ALLOWED");
    expect(result.retryable).toBe(false);
    expect(loadPiece).not.toHaveBeenCalled();
    expect(credentialGet).not.toHaveBeenCalled();
  });

  it("normalizes an unknown integration into the stable runner result contract", async () => {
    getIntegration.mockReturnValue(undefined);

    const { runAction } = await import("./runner-core.js");
    const result = await runAction({
      integrationId: "missing",
      actionName: "send",
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
    });

    expect(result).toMatchObject({
      success: false,
      output: null,
      errorCode: "UNKNOWN_INTEGRATION",
      retryable: false,
    });
    expect(result.error).toContain("Unknown integration");
    expect(loadPiece).not.toHaveBeenCalled();
    expect(credentialGet).not.toHaveBeenCalled();
  });

  it("normalizes registry-approved but package-missing actions as non-retryable action failures", async () => {
    loadPiece.mockResolvedValue({ actions: [] });

    const { runAction } = await import("./runner-core.js");
    const result = await runAction({
      integrationId: "example",
      actionName: "approved_action",
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
    });

    expect(result).toMatchObject({
      success: false,
      output: null,
      errorCode: "ACTION_NOT_ALLOWED",
      retryable: false,
    });
    expect(result.error).toContain("not found in example");
  });

  it("preserves redacted HTTP traces on failed execution results", async () => {
    loadPiece.mockResolvedValue({
      actions: [
        {
          name: "approved_action",
          displayName: "Approved",
          description: "approved",
          props: {},
          run: vi.fn(),
        },
      ],
    });

    const runnerFetch = await import("./runner-fetch.js");
    vi.mocked(runnerFetch.createTracedFetch).mockImplementationOnce((traces) => {
      traces.push({
        url: "https://example.com/run",
        method: "GET",
        requestHeaders: {},
        requestBody: null,
        statusCode: null,
        responseHeaders: {},
        durationMs: 1,
        responseBody: null,
        error: "upstream failed",
      });
      return vi.fn(async () => {
        throw new Error("upstream failed");
      });
    });
    vi.mocked(runnerFetch.fetchCtx.run).mockImplementationOnce(async (ctx) => {
      await ctx.tracedFetch("https://example.com/run");
      return undefined;
    });

    const { runAction } = await import("./runner-core.js");
    const result = await runAction({
      integrationId: "example",
      actionName: "approved_action",
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "EXECUTION_FAILED",
      retryable: false,
    });
    expect(result.httpTraces).toHaveLength(1);
    expect(result.httpTraces?.[0]?.error).toBe("upstream failed");
  });

  it("normalizes strict action-input rejection without relying on message parsing", async () => {
    loadPiece.mockResolvedValue({
      actions: [
        { name: "approved_action", displayName: "Approved", description: "approved", props: { required: { required: true, type: "STRING" } } },
      ],
    });
    const validation = await import("./action-input-validation.js");
    vi.mocked(validation.validateActionProps).mockReturnValue(["required is required"]);

    const { runAction } = await import("./runner-core.js");
    const result = await runAction({
      integrationId: "example",
      actionName: "approved_action",
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
    });

    expect(result).toMatchObject({
      success: false,
      output: null,
      errorCode: "INVALID_INPUT",
      retryable: false,
    });
  });
  it("never loads the provider package or credentials when integrations are disabled for production", async () => {
    vi.stubEnv("CLARA_ENV", "production");
    const { runAction } = await import("./runner-core.js");
    const result = await runAction({
      integrationId: "example", actionName: "approved_action", props: {},
      userId: "user-1", workspaceId: "org-1", agentId: "agent-1",
    });
    expect(result).toMatchObject({ success: false, errorCode: "ACTION_NOT_ALLOWED" });
    expect(loadPiece).not.toHaveBeenCalled();
    expect(credentialGet).not.toHaveBeenCalled();
    expect(assertIntegrationExecutionAuthorized).not.toHaveBeenCalled();
  });

});
