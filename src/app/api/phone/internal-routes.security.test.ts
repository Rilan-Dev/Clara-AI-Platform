import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  updateCallLog: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/phone/core/db", () => ({
  updateCallLog: mocks.updateCallLog,
  getPhoneConfigsByKb: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
  getAssistantConfigByKb: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/config-builder", () => ({
  buildSystemPrompt: vi.fn(),
}));
vi.mock("@/modules/ai-core/resolve", () => ({ resolveAIConfig: vi.fn() }));
vi.mock("@/modules/voice-core/resolve", () => ({ resolveVoiceConfig: vi.fn() }));
vi.mock("@/modules/voice-core/model-catalog", () => ({
  getSarvamApiKey: vi.fn(),
  getSarvamBaseUrl: vi.fn(),
  toSarvamRealtimeSttModel: vi.fn(),
  getPlatformDefaultSarvamRealtimeLlmModel: vi.fn(),
  getSarvamRealtimeTuning: vi.fn(),
}));
vi.mock("@/modules/assistant/api/openai-realtime", () => ({
  buildOpenAIRealtimeSession: vi.fn(),
  createOpenAIRealtimeClientSecret: vi.fn(),
  extractOpenAIRealtimeClientSecret: vi.fn(),
}));
vi.mock("@/modules/assistant/core/language-policy", () => ({
  policyFromResolvedConfig: vi.fn(),
  speechRecognitionLanguage: vi.fn(),
}));

import { POST as session } from "./session/route";
import { POST as log } from "./log/route";

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/phone/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("internal phone HTTP endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PHONE_INTERNAL_SECRET", "bridge-only-secret");
    vi.stubEnv("CRON_SECRET", "");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.updateCallLog.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a spoofed session internal marker before creating credentials", async () => {
    const response = await session(request("session", { kbId: "kb-private" }, {
      "x-phone-internal": "1",
    }));
    expect(response.status).toBe(403);
    expect(mocks.ensureMigrated).not.toHaveBeenCalled();
    expect(mocks.getKnowledgeBaseById).not.toHaveBeenCalled();
  });

  it("rejects spoofed loopback forwarding headers on session requests", async () => {
    const response = await session(request("session", { kbId: "kb-private" }, {
      "x-forwarded-for": "127.0.0.1",
      "x-real-ip": "::1",
    }));
    expect(response.status).toBe(403);
    expect(mocks.ensureMigrated).not.toHaveBeenCalled();
  });

  it("lets an authenticated phone bridge pass the session auth boundary", async () => {
    const response = await session(request("session", {}, {
      "x-phone-internal": "1",
      "x-phone-secret": "bridge-only-secret",
    }));
    expect(response.status).toBe(400);
    expect(mocks.ensureMigrated).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated call log updates before touching the database", async () => {
    const response = await log(request("log", { callSid: "CA123" }, {
      "x-phone-internal": "1",
    }));
    expect(response.status).toBe(403);
    expect(mocks.updateCallLog).not.toHaveBeenCalled();
  });

  it("allows authenticated phone bridge to finalize a call log", async () => {
    const response = await log(request("log", { callSid: "CA123", status: "completed" }, {
      "x-phone-internal": "1",
      "x-phone-secret": "bridge-only-secret",
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateCallLog).toHaveBeenCalledWith("CA123", expect.objectContaining({ status: "completed" }));
  });
});
