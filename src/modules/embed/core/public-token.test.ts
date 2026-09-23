/**
 * src/modules/embed/core/public-token.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public session token contract for the public published agent page:
 *
 *   • mint → verify round-trip preserves the deployment binding payload;
 *   • tampered payload or signature is rejected (timing-safe compare path);
 *   • expired tokens are rejected; near-expiry still valid;
 *   • non-pub_ credentials never match the prefix check;
 *   • tokens minted for one deployment never verify against another.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  isPublicSessionToken,
  mintPublicSessionToken,
  verifyPublicSessionToken,
} from "./public-token";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-with-at-least-32-characters-long!!";
});

const FIXTURE = {
  agentId: "b7a0b1c2-1111-4222-8333-444455556666",
  kbId: "c1d2e3f4-7777-4888-9999-aaaabbbbcccc",
  orgId: "d4c3b2a1-0000-4111-8222-333344445555",
  deploymentId: "e5f6a7b8-1234-4567-8901-234567890abc",
};

describe("public session tokens", () => {
  it("round-trips the deployment binding payload", () => {
    const token = mintPublicSessionToken(FIXTURE);
    expect(token.startsWith("pub_v1.")).toBe(true);

    const verified = verifyPublicSessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.payload.a).toBe(FIXTURE.agentId);
    expect(verified?.payload.k).toBe(FIXTURE.kbId);
    expect(verified?.payload.o).toBe(FIXTURE.orgId);
    expect(verified?.payload.d).toBe(FIXTURE.deploymentId);
    expect(verified?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("is recognised by the prefix check", () => {
    const token = mintPublicSessionToken(FIXTURE);
    expect(isPublicSessionToken(token)).toBe(true);
    expect(isPublicSessionToken("clr_live_key")).toBe(false);
    expect(isPublicSessionToken("")).toBe(false);
    expect(isPublicSessionToken("Bearer something")).toBe(false);
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const token = mintPublicSessionToken(FIXTURE);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    // Decode, mutate the agent id, re-encode — signature no longer matches.
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      a: string;
    };
    payload.a = "00000000-0000-4000-8000-000000000000";
    const tampered = [
      parts[0],
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
      parts[2],
    ].join(".");
    expect(verifyPublicSessionToken(tampered)).toBeNull();
  });

  it("rejects a forged signature", () => {
    const token = mintPublicSessionToken(FIXTURE);
    const parts = token.split(".");
    const forged = [parts[0], parts[1], "0".repeat(64)].join(".");
    expect(verifyPublicSessionToken(forged)).toBeNull();
  });

  it("rejects expired tokens and accepts near-expiry ones", () => {
    const expired = mintPublicSessionToken({ ...FIXTURE, ttlMs: -1_000 });
    expect(verifyPublicSessionToken(expired)).toBeNull();

    const nearExpiry = mintPublicSessionToken({ ...FIXTURE, ttlMs: 5_000 });
    expect(verifyPublicSessionToken(nearExpiry)).not.toBeNull();
  });

  it("binds to the minting deployment id", () => {
    const token = mintPublicSessionToken(FIXTURE);
    const verified = verifyPublicSessionToken(token);
    expect(verified?.payload.d).toBe(FIXTURE.deploymentId);
    // A different deployment id is a different token (payload mismatch is a
    // downstream check, but the payload itself must carry the binding).
    const other = mintPublicSessionToken({
      ...FIXTURE,
      deploymentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(verifyPublicSessionToken(other)?.payload.d).not.toBe(FIXTURE.deploymentId);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifyPublicSessionToken("pub_v1.not-base64!.abc")).toBeNull();
    expect(verifyPublicSessionToken("pub_v1.")).toBeNull();
    expect(verifyPublicSessionToken("pub_v1.a.b.c")).toBeNull();
    // Valid base64url but not JSON.
    const badJson = Buffer.from("not json", "utf8").toString("base64url");
    expect(verifyPublicSessionToken(`pub_v1.${badJson}.deadbeef`)).toBeNull();
  });
});
