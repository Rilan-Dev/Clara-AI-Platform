/**
 * Security regression tests for POST /api/gemini/session (gap-closure Phase D).
 *
 * These lock the P0 credential-security contract:
 *   1. the browser session response contains NO Gemini API key;
 *   2. the WebSocket URL the browser builds contains no long-lived credential;
 *   3. an unauthenticated caller cannot create a Gemini session;
 *   4. rate/plan authorization runs BEFORE any vendor credential use;
 *   5. the minted relay token is bound to the requesting kb/org (tenant
 *      isolation — a token minted for one tenant cannot be re-claimed for
 *      another: the relay verifies the HMAC signature over kb+org).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const GEMINI_KEY_VALUE = "AIza-fake-DO-NOT-LEAK-0123456789";
const AUTH_SECRET_VALUE = "x".repeat(48);
const KB_ID = "kb-gemini-1";
const ORG_ID = "org-gemini-1";

// ── Mocks (mirrors realtime.test.ts discipline) ─────────────────────────────

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) =>
    kbId === KB_ID ? { id: KB_ID, name: "Gemini KB" } : null,
  ),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => [{ org_id: ORG_ID }]),
}));

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn(async () => {}),
}));

vi.mock("@/lib/plan-guard", () => ({
  planGuard: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })),
  rateLimitResponse: vi.fn(() => ({
    body: { error: "Voice session limit reached" },
    status: 429,
    headers: { "Retry-After": "60" } as Record<string, string>,
  })),
  REALTIME_SESSION_RATE: { limit: 10, windowMs: 3_600_000 },
}));

vi.mock("@/modules/ai-core/resolve", () => ({
  AIConfigResolutionError: class AIConfigResolutionError extends Error {},
  resolveAIConfig: vi.fn(async () => ({
    provider: "gemini",
    realtimeModel: "gemini-2.5-flash-native-audio-preview-12-2025",
    voiceId: "Aoede",
    assistantConfig: { voiceId: "Aoede" },
  })),
}));

vi.mock("@/modules/knowledge-bases/core/config-builder", () => ({
  buildSystemPrompt: vi.fn(() => "LOCKED GEMINI SYSTEM PROMPT"),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      throw NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return { user: { id: "user-1" }, session: { id: "sess-1" } };
  }),
}));

import { postGeminiSession } from "./geminiSession";
import { verifyGeminiRealtimeToken } from "@/modules/voice-core/api/gemini/realtime-auth";
import { buildSameOriginRelayWsUrl } from "@/modules/voice-core/realtime/relay-url";
import { planGuard } from "@/lib/plan-guard";
import { hit } from "@/lib/rate-limit";

function geminiSessionRequest(body: Record<string, unknown>, authenticated = true): NextRequest {
  return new NextRequest("http://localhost/api/gemini/session", {
    method: "POST",
    headers: authenticated
      ? { "Content-Type": "application/json", Authorization: "Bearer platform-session-token" }
      : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/gemini/session — credential security (gap-closure Phase D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planGuard).mockResolvedValue({ allowed: true } as never);
    vi.mocked(hit).mockReturnValue({ allowed: true, retryAfterSec: 0 } as never);
    process.env.GEMINI_API_KEY = GEMINI_KEY_VALUE;
    process.env.AUTH_SECRET = AUTH_SECRET_VALUE;
  });

  it("returns a relay descriptor — never a wsUrl with the vendor key", async () => {
    const res = await postGeminiSession(geminiSessionRequest({ kbId: KB_ID }));
    expect(res.status).toBe(200);

    const bodyText = JSON.stringify(await res.json());
    const body = JSON.parse(bodyText) as Record<string, unknown>;

    // (1) The long-lived key is nowhere in the response.
    expect(bodyText).not.toContain(GEMINI_KEY_VALUE);
    expect(bodyText).not.toContain("AIza");
    // The old leak vector is gone entirely.
    expect(body.wsUrl).toBeUndefined();
    expect(bodyText).not.toContain("generativelanguage.googleapis.com");

    // The relay descriptor replaces it.
    expect(body.provider).toBe("gemini");
    expect(body.realtime?.endpoint).toBe("/api/voice/gemini/realtime");
    expect(typeof body.realtime?.token).toBe("string");

    // (5) The token is a valid HMAC capability token bound to kb + org.
    const claims = verifyGeminiRealtimeToken(body.realtime.token);
    expect(claims).toMatchObject({ kbId: KB_ID, orgId: ORG_ID });
  });

  it("the client-built WebSocket URL carries only the short-lived token — no long-lived credential", async () => {
    const res = await postGeminiSession(geminiSessionRequest({ kbId: KB_ID }));
    const body = (await res.json()) as { realtime: { endpoint: string; token: string } };

    const wsUrl = buildSameOriginRelayWsUrl(body.realtime, "https://clara.example.com");

    // Same-origin relay, not the vendor host.
    expect(wsUrl.startsWith("wss://clara.example.com/api/voice/gemini/realtime?")).toBe(true);
    expect(wsUrl).not.toContain("generativelanguage.googleapis.com");
    // No vendor key in any query parameter.
    expect(wsUrl).not.toContain(GEMINI_KEY_VALUE);
    expect(wsUrl).not.toContain("AIza");
    expect(wsUrl).not.toContain("key=");
    // The only credential is the session-minted HMAC token.
    const url = new URL(wsUrl);
    expect(url.searchParams.get("token")).toBe(body.realtime.token);
    expect([...url.searchParams.keys()]).toEqual(["token"]);
    // And it is short-lived.
    const claims = verifyGeminiRealtimeToken(body.realtime.token);
    expect(claims).not.toBeNull();
    expect(claims!.expiresAtMs).toBeGreaterThan(Date.now());
    expect(claims!.expiresAtMs).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
  });

  it("rejects unauthenticated callers with 401 and mints no relay token", async () => {
    const res = await postGeminiSession(geminiSessionRequest({ kbId: KB_ID }, false));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.realtime).toBeUndefined();
    expect(body.token).toBeUndefined();
  });

  it("plan authorization runs BEFORE vendor credential use — free plans get 402 and no token", async () => {
    vi.mocked(planGuard).mockResolvedValue({
      allowed: false,
      reason: "Voice is not enabled on the Free plan",
    } as never);

    const res = await postGeminiSession(geminiSessionRequest({ kbId: KB_ID }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("voice_not_enabled");
    // No relay capability token was minted for the denied org.
    expect(body.realtime).toBeUndefined();
    expect(body.token).toBeUndefined();
    // Authorization ran at all.
    expect(planGuard).toHaveBeenCalledWith(ORG_ID, "voice");
  });

  it("rate limiting uses the shared realtime bucket and mints no token when exhausted", async () => {
    vi.mocked(hit).mockReturnValue({
      allowed: false,
      retryAfterSec: 60,
    } as never);

    const res = await postGeminiSession(geminiSessionRequest({ kbId: KB_ID }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.realtime).toBeUndefined();
    // The shared bucket key (org-scoped) — provider switching does not
    // multiply budgets.
    expect(hit).toHaveBeenCalledWith(
      `realtime:org:${ORG_ID}`,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("returns 409 when the KB's resolved provider is not Gemini", async () => {
    const { resolveAIConfig } = await import("@/modules/ai-core/resolve");
    vi.mocked(resolveAIConfig).mockResolvedValue({
      provider: "openai",
      assistantConfig: null,
    } as never);

    const res = await postGeminiSession(geminiSessionRequest({ kbId: KB_ID }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.realtime).toBeUndefined();
  });
});
