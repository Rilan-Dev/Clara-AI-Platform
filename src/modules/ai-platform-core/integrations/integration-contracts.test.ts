import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createExecutionContext } from "../execution-context";
import type {
  IntegrationActionDefinition,
  IntegrationConnectionRef,
  IntegrationCredentialHandle,
  IntegrationExecutionRequest,
  IntegrationOAuthCallback,
  IntegrationRuntimeAdapters,
} from "./integration-contracts";

describe("integration contracts", () => {
  const context = createExecutionContext({
    orgId: "org-1",
    kbId: "kb-1",
    userId: "user-1",
    surface: "chat",
  });

  it("models connections without credential material", () => {
    const connection: IntegrationConnectionRef = {
      id: "conn-1",
      integrationId: "slack",
      scope: "user",
      userId: "user-1",
      status: "active",
      metadata: { providerAccountId: "acct-1" },
    };

    expect(connection).not.toHaveProperty("credentials");
    expect(connection).not.toHaveProperty("accessToken");
    expect(connection).not.toHaveProperty("clientSecret");
  });

  it("uses an opaque credential handle rather than decrypted credentials", () => {
    const handle: IntegrationCredentialHandle = {
      connectionId: "conn-1",
      integrationId: "slack",
      scope: "user",
    };

    expect(handle).toEqual({
      connectionId: "conn-1",
      integrationId: "slack",
      scope: "user",
    });
  });

  it("requires action schemas to be zod schemas", () => {
    const action: IntegrationActionDefinition = {
      integrationId: "slack",
      name: "send_channel_message",
      displayName: "Send channel message",
      description: "Send a message.",
      inputSchema: z.object({ channel: z.string().min(1), message: z.string().min(1) }),
      allowedSurfaces: ["chat", "realtime"],
      requiresConnection: true,
    };

    expect(action.inputSchema.safeParse({ channel: "#general", message: "hello" }).success).toBe(true);
    expect(action.inputSchema.safeParse({ channel: "", message: "hello" }).success).toBe(false);
  });

  it("keeps execution identity attached to the platform context", () => {
    const request: IntegrationExecutionRequest = {
      context,
      integrationId: "slack",
      actionName: "send_channel_message",
      input: { channel: "#general", message: "hello" },
      connection: {
        connectionId: "conn-1",
        integrationId: "slack",
        scope: "user",
      },
    };

    expect(request.context.tenantId).toBe("org-1");
    expect(request.context.kbId).toBe("kb-1");
    expect(request).not.toHaveProperty("accessToken");
    expect(request).not.toHaveProperty("clientSecret");
  });

  it("defines the OAuth callback as protocol data, not a credential store", () => {
    const callback: IntegrationOAuthCallback = {
      code: "authorization-code",
      state: "integrity-protected-state",
    };

    expect(callback.code).toBe("authorization-code");
    expect(callback.state).toBe("integrity-protected-state");
  });

  it("keeps all runtime responsibilities behind explicit adapters", () => {
    const adapters: IntegrationRuntimeAdapters = {
      catalog: {
        list: async () => [],
        get: async () => null,
      },
      connections: {
        list: async () => [],
        get: async () => null,
        connect: async () => ({
          id: "conn-1",
          integrationId: "slack",
          scope: "user",
          userId: "user-1",
          status: "active",
        }),
        disconnect: async () => undefined,
      },
      credentials: {
        getHandle: async () => null,
      },
      oauth: {
        buildAuthorizationUrl: async () => "https://example.invalid/oauth",
        exchangeCallback: async () => ({
          id: "conn-1",
          integrationId: "slack",
          scope: "user",
          userId: "user-1",
          status: "active",
        }),
      },
      egress: {
        authorize: async () => ({ allowed: false, reason: "not configured" }),
      },
      actions: {
        listActions: async () => [],
        invoke: async () => ({ ok: false, error: { code: "EXECUTION_FAILED", message: "not configured" } }),
      },
      toolBridge: {
        listToolDefinitions: async () => [],
        invokeThroughRuntime: async () => ({ ok: false, error: { code: "UNAUTHORIZED", message: "not configured" } }),
      },
    };

    expect(Object.keys(adapters)).toEqual([
      "catalog",
      "connections",
      "credentials",
      "oauth",
      "egress",
      "actions",
      "toolBridge",
    ]);
  });
});
