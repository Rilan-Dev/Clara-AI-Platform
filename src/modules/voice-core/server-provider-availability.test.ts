/**
 * src/modules/voice-core/server-provider-availability.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-backed ElevenLabs availability gates.
 *
 * The provider toggle lives in the platform_ai_providers registry and is the
 * ONLY platform-level on/off control; the API key is a credential
 * prerequisite — BOTH must be present for the provider to be available.
 *
 * Also pins isElevenLabsRealtimeEnabled: the registry gate AND the explicit
 * realtime feature flag.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ queryOne: vi.fn(async () => null) }));

import { queryOne } from "@/lib/db";
import { isElevenLabsEnabled, isElevenLabsRealtimeEnabled } from "./server-provider-availability";

const queryOneMock = vi.mocked(queryOne);

function registryRow(enabled: boolean) {
  queryOneMock.mockResolvedValue({ enabled } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_REALTIME_ENABLED;
  queryOneMock.mockResolvedValue(null as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isElevenLabsEnabled", () => {
  it("is off when the registry has no row for elevenlabs", async () => {
    queryOneMock.mockResolvedValue(null as never);
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    await expect(isElevenLabsEnabled()).resolves.toBe(false);
  });

  it("is off when the registry row is disabled — even with a key", async () => {
    registryRow(false);
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    await expect(isElevenLabsEnabled()).resolves.toBe(false);
  });

  it("is off when the registry is enabled but the key is missing", async () => {
    registryRow(true);
    await expect(isElevenLabsEnabled()).resolves.toBe(false);
  });

  it("is on only when the registry is enabled AND a key is present", async () => {
    registryRow(true);
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    await expect(isElevenLabsEnabled()).resolves.toBe(true);
  });

  it("reads the elevenlabs registry row", async () => {
    registryRow(true);
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    await isElevenLabsEnabled();
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("platform_ai_providers"),
      ["elevenlabs"],
    );
  });
});

describe("isElevenLabsRealtimeEnabled", () => {
  it("requires the provider gate AND the realtime feature flag", async () => {
    registryRow(true);
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");

    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(false); // flag off
    vi.stubEnv("ELEVENLABS_REALTIME_ENABLED", "true");
    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(true);
  });

  it("stays off when the provider gate is off, flag or not", async () => {
    registryRow(false);
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    vi.stubEnv("ELEVENLABS_REALTIME_ENABLED", "true");
    await expect(isElevenLabsRealtimeEnabled()).resolves.toBe(false);
  });
});
