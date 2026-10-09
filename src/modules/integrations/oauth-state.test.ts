import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createOAuthState,
  hashOAuthState,
  OAUTH_STATE_TTL_SECONDS,
} from "./oauth-state";

describe("OAuth state helpers", () => {
  it("creates high-entropy URL-safe state and stores only a one-way digest", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    const first = createOAuthState(now);
    const second = createOAuthState(now);

    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.stateHash).toBe(hashOAuthState(first.state));
    expect(first.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.stateHash).not.toBe(first.state);
    expect(second.state).not.toBe(first.state);
    expect(second.stateHash).not.toBe(first.stateHash);
    expect(first.expiresAt.getTime() - now.getTime()).toBe(OAUTH_STATE_TTL_SECONDS * 1000);
  });

  it("generates an S256 PKCE challenge from the verifier", () => {
    const result = createOAuthState();
    const expected = createHash("sha256")
      .update(result.codeVerifier, "ascii")
      .digest("base64url");
    expect(result.codeChallenge).toBe(expected);
    expect(result.codeChallenge).not.toBe(result.codeVerifier);
  });

  it("honors an explicitly configured plain PKCE method", () => {
    const result = createOAuthState(new Date(), "plain");
    expect(result.codeChallenge).toBe(result.codeVerifier);
  });

  it("hashes the same state deterministically without persisting raw state", () => {
    expect(hashOAuthState("example-state")).toBe(hashOAuthState("example-state"));
    expect(hashOAuthState("example-state")).not.toBe(hashOAuthState("different-state"));
  });
});
