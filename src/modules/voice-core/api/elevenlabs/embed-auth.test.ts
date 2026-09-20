import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedVoiceGuard, resolveEmbedVoiceKey } from "./embed-auth";
import { NextRequest } from "next/server";

/**
 * Regression tests for the Mode A embed guard. The documented contract:
 * ONLY clr_ bearer tokens are validated — platform JWT / anonymous requests
 * pass straight through (null) and keep the routes' historical behaviour.
 * A regression once made the guard 403 every JWT-authenticated session,
 * breaking the in-app floating assistant and workspace voice modal.
 */

vi.mock("@/modules/embed/core/api-keys-db", () => ({
  validateApiKey: vi.fn(async (rawKey: string) =>
    rawKey === "clr_valid" ? { kbId: "kb-1", orgId: "org-1", allowedOrigins: [] } : null),
}));
vi.mock("@/modules/embed/core/validate-embed", () => ({
  isOriginAllowedForEmbed: vi.fn(() => true),
}));

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/voice/sarvam/tts", {
    method: "POST",
    headers,
  });
}

describe("embedVoiceGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PASSES platform JWT requests through (null) — the documented contract", async () => {
    const guard = await embedVoiceGuard(
      makeRequest({ authorization: "Bearer eyJhbGciOi..." }),
      "kb-1",
    );
    expect(guard).toBeNull();
  });

  it("PASSES anonymous requests through (null)", async () => {
    const guard = await embedVoiceGuard(makeRequest({}), "kb-1");
    expect(guard).toBeNull();
  });

  it("rejects invalid clr_ keys with 403", async () => {
    const guard = await embedVoiceGuard(
      makeRequest({ authorization: "Bearer clr_bogus" }),
      "kb-1",
    );
    expect(guard).not.toBeNull();
    expect(guard!.status).toBe(403);
  });

  it("rejects a valid clr_ key scoped to a different KB", async () => {
    const guard = await embedVoiceGuard(
      makeRequest({ authorization: "Bearer clr_valid" }),
      "kb-other",
    );
    expect(guard).not.toBeNull();
    expect(guard!.status).toBe(403);
  });

  it("accepts a valid clr_ key scoped to the requested KB", async () => {
    const guard = await embedVoiceGuard(
      makeRequest({ authorization: "Bearer clr_valid" }),
      "kb-1",
    );
    expect(guard).toBeNull();
  });

  it("resolveEmbedVoiceKey returns null for JWT credentials", async () => {
    const key = await resolveEmbedVoiceKey(
      makeRequest({ authorization: "Bearer eyJhbGciOi..." }),
    );
    expect(key).toBeNull();
  });
});
