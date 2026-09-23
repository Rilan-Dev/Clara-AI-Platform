/**
 * Plan Task 6.1 — preserve the existing ElevenLabs voice modes and lock the
 * tri-mode selector:
 *
 *   standard + elevenlabs                          → mode "pipeline"        (Mode A)
 *   realtime  + elevenlabs + conversational        → mode "conversational"  (Mode B)
 *   realtime  + elevenlabs + clara-stream          → mode "clara-stream"    (Mode C, new)
 *
 * Mode B precedence is locked: an existing binding wins even when the Mode C
 * flag is on (no behavior change for deployed orgs). Mode A is the default
 * and is unchanged. Mode C stays DARK until ELEVENLABS_REALTIME_ENABLED.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async (kbId: string) =>
    kbId === "kb-el-1"
      ? { id: "kb-el-1", name: "EL KB", status: "active", agent_id: "agent-el-1" }
      : null,
  ),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => [{ id: "binding-1" }]),
  // AI provider registry row — the platform-level on/off control.
  queryOne: vi.fn(async () => ({ enabled: true })),
}));

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn(async () => {}),
}));

vi.mock("@/modules/ai-core/resolve", () => ({
  getPlatformAIDefaults: vi.fn(() => ({ provider: "openai" })),
}));

vi.mock("@/modules/voice-core/resolve", () => ({
  resolveVoiceConfig: vi.fn(async () => ({
    realtimeProvider: "elevenlabs",
    voiceProvider: "elevenlabs",
    // Realtime inherits the Voice Chat pick — the tri-mode selector applies.
    realtimeSource: "voice_chat",
    brain: {
      provider: "openai",
      orgId: "org-el-1",
      agentId: "agent-el-1",
      flags: { voiceEnabled: true, realtimeEnabled: true },
    },
  })),
}));

import { postVoiceProvider } from "../provider";
import { getElevenLabsRealtimeSttModel } from "../../model-catalog";
import { isElevenLabsRealtimeEnabled } from "../../server-provider-availability";

function providerRequest(): NextRequest {
  return new NextRequest("http://localhost/api/voice/provider", {
    method: "POST",
    body: JSON.stringify({ kbId: "kb-el-1" }),
  });
}

const ENV_BACKUP: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined) {
  if (!(name in ENV_BACKUP)) ENV_BACKUP[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv("ELEVENLABS_ENABLED", "true");
  setEnv("ELEVENLABS_API_KEY", "el-test-key");
});

afterEach(() => {
  for (const [name, value] of Object.entries(ENV_BACKUP)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    delete ENV_BACKUP[name];
  }
});

describe("ElevenLabs tri-mode selector (plan Task 6.1)", () => {
  it("standard + elevenlabs (no extra flags) → Mode A pipeline (unchanged)", async () => {
    setEnv("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "false");
    setEnv("ELEVENLABS_REALTIME_ENABLED", "false");
    const response = await postVoiceProvider(providerRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.voiceProvider).toBe("elevenlabs");
    expect(payload.mode).toBe("pipeline");
  });

  it("realtime + elevenlabs + conversational → Mode B conversational", async () => {
    setEnv("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "true");
    setEnv("ELEVENLABS_REALTIME_ENABLED", "false");
    const response = await postVoiceProvider(providerRequest());
    const payload = await response.json();
    expect(payload.mode).toBe("conversational");
  });

  it("realtime + elevenlabs + clara-stream → Mode C clara-stream (flag on, no binding)", async () => {
    setEnv("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "false");
    setEnv("ELEVENLABS_REALTIME_ENABLED", "true");
    const response = await postVoiceProvider(providerRequest());
    const payload = await response.json();
    expect(payload.mode).toBe("clara-stream");
  });

  it("an existing Mode-B binding WINS over the Mode C flag (deployed orgs unchanged)", async () => {
    setEnv("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "true");
    setEnv("ELEVENLABS_REALTIME_ENABLED", "true");
    const response = await postVoiceProvider(providerRequest());
    const payload = await response.json();
    expect(payload.mode).toBe("conversational");
  });

  it("Mode C stays DARK without ELEVENLABS_REALTIME_ENABLED even with the key on", async () => {
    setEnv("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "false");
    setEnv("ELEVENLABS_REALTIME_ENABLED", undefined);
    const response = await postVoiceProvider(providerRequest());
    const payload = await response.json();
    expect(payload.mode).toBe("pipeline");
  });

  it("an explicit Realtime Voice selection always routes to Clara realtime (clara-stream)", async () => {
    setEnv("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "true");
    setEnv("ELEVENLABS_REALTIME_ENABLED", "false");
    const { resolveVoiceConfig } = await import("@/modules/voice-core/resolve");
    (resolveVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      realtimeProvider: "elevenlabs",
      voiceProvider: "elevenlabs",
      realtimeSource: "agent",
      brain: {
        provider: "openai",
        orgId: "org-el-1",
        agentId: "agent-el-1",
        flags: { voiceEnabled: true, realtimeEnabled: true },
      },
    });
    const response = await postVoiceProvider(providerRequest());
    const payload = await response.json();
    expect(payload.mode).toBe("clara-stream");
  });

  it("Mode C requires the provider registry gate AND the realtime flag", async () => {
    // Registry row is enabled (mocked @/lib/db.queryOne) and the key is set
    // in beforeEach — so the flag alone decides:
    setEnv("ELEVENLABS_REALTIME_ENABLED", "true");
    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(true);
    setEnv("ELEVENLABS_REALTIME_ENABLED", undefined);
    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(false);
    // Credential prerequisite — key missing keeps the gate closed:
    setEnv("ELEVENLABS_REALTIME_ENABLED", "true");
    setEnv("ELEVENLABS_API_KEY", undefined);
    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(false);
  });

  it("non-elevenlabs providers never receive a mode beyond pipeline", async () => {
    const { resolveVoiceConfig } = await import("@/modules/voice-core/resolve");
    (resolveVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      realtimeProvider: "openai",
      voiceProvider: "openai",
      brain: {
        provider: "openai",
        orgId: "org-el-1",
        agentId: "agent-el-1",
        flags: { voiceEnabled: true, realtimeEnabled: true },
      },
    });
    const response = await postVoiceProvider(providerRequest());
    const payload = await response.json();
    expect(payload.voiceProvider).toBe("openai");
    expect(payload.mode).toBe("pipeline");
  });

  it("defaults the realtime STT model to the documented scribe_v2_realtime id", () => {
    setEnv("ELEVENLABS_REALTIME_STT_MODEL", undefined);
    expect(getElevenLabsRealtimeSttModel()).toBe("scribe_v2_realtime");
    setEnv("ELEVENLABS_REALTIME_STT_MODEL", "scribe_v2_realtime");
    expect(getElevenLabsRealtimeSttModel()).toBe("scribe_v2_realtime");
  });
});

describe("Phase 13 rollout gates — realtime flags stay DARK by default", () => {
  it("ELEVENLABS_REALTIME_ENABLED defaults OFF (rollback is configuration-only)", async () => {
    setEnv("ELEVENLABS_REALTIME_ENABLED", undefined);
    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(false);
  });
});
