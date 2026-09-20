import { describe, expect, it } from "vitest";
import {
  createSessionIdentity,
  isGenerationId,
  isRealtimeId,
  isSessionId,
  isTurnId,
  mintGenerationId,
  mintSessionId,
  mintTurnId,
} from "./identity";

describe("realtime identity minting", () => {
  it("mints unique session ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) seen.add(mintSessionId());
    expect(seen.size).toBe(1_000);
  });

  it("mints unique generation ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) seen.add(mintGenerationId());
    expect(seen.size).toBe(1_000);
  });

  it("mints unique turn ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) seen.add(mintTurnId());
    expect(seen.size).toBe(1_000);
  });

  it("separates the three id namespaces", () => {
    const sessionId = mintSessionId();
    const generationId = mintGenerationId();
    const turnId = mintTurnId();
    expect(sessionId).not.toEqual(generationId);
    expect(generationId).not.toEqual(turnId);
    expect(sessionId).not.toEqual(turnId);
    expect(new Set([sessionId, generationId, turnId]).size).toBe(3);
  });

  it("validates formats per namespace and rejects everything else", () => {
    expect(isSessionId(mintSessionId())).toBe(true);
    expect(isGenerationId(mintGenerationId())).toBe(true);
    expect(isTurnId(mintTurnId())).toBe(true);

    expect(isSessionId(mintGenerationId())).toBe(false);
    expect(isSessionId(mintTurnId())).toBe(false);
    expect(isGenerationId(mintSessionId())).toBe(false);
    expect(isTurnId(mintSessionId())).toBe(false);

    // Malformed inputs.
    for (const bad of ["", "vrs", "vrs_", "vrg", "vrt_", null, undefined, "abc"]) {
      expect(isSessionId(bad as string | null | undefined)).toBe(false);
      expect(isGenerationId(bad as string | null | undefined)).toBe(false);
      expect(isTurnId(bad as string | null | undefined)).toBe(false);
      expect(isRealtimeId(bad as string | null | undefined)).toBe(false);
    }
  });
});

describe("createSessionIdentity", () => {
  it("creates a stable, well-formed identity", () => {
    const identity = createSessionIdentity({ tenantId: "org_1", agentId: "agent_9" });
    expect(isSessionId(identity.sessionId)).toBe(true);
    expect(identity.tenantId).toBe("org_1");
    expect(identity.agentId).toBe("agent_9");
    expect(identity.createdAt).toBeGreaterThan(0);
  });

  it("reuses a provided valid sessionId and regenerates malformed ones", () => {
    const good = mintSessionId();
    expect(createSessionIdentity({ sessionId: good }).sessionId).toBe(good);
    expect(createSessionIdentity({ sessionId: "not-a-session-id" }).sessionId).not.toBe(
      "not-a-session-id",
    );
    expect(isSessionId(createSessionIdentity({ sessionId: "not-a-session-id" }).sessionId)).toBe(
      true,
    );
  });

  it("defaults tenant/agent to null", () => {
    const identity = createSessionIdentity();
    expect(identity.tenantId).toBeNull();
    expect(identity.agentId).toBeNull();
  });
});
