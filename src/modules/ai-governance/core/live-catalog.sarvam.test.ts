/**
 * src/modules/ai-governance/core/live-catalog.sarvam.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sarvam catalogue sync resilience.
 *
 * Two production regressions pinned here:
 *
 *  1. "Models 0 / Voices 0" half-canvas — the Sarvam sync returned early
 *     before the API key was configured (or before DB-backed keys were
 *     hydrated), so the curated catalogue NEVER landed and the Realtime Voice
 *     canvas showed zero models and zero voices. Curated rows are
 *     vendor-independent: they must land keylessly, with defaults, and
 *     without pretending the vendor was contacted.
 *
 *  2. api.vendor.ai — the Base URL field's old placeholder example (a dead
 *     domain) leaked into live SARVAM_BASE_URL configs. Discovery used to
 *     probe it and time out; the shared normaliser must rewrite it to the
 *     official endpoint so discovery actually reaches Sarvam.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCalls: unknown[][] = [];
const incidents: Array<Record<string, unknown>> = [];
const fetchUrls: string[] = [];

vi.mock("@/lib/db", () => ({
  execute: vi.fn(async (...args: unknown[]) => {
    executeCalls.push(args);
  }),
}));

vi.mock("@/lib/db/migrate", () => ({
  loadRuntimeSettingsOnStartup: vi.fn(async () => {}),
}));

vi.mock("@/modules/platform-health/core/incidents", () => ({
  recordRuntimeIncident: vi.fn(async (check: Record<string, unknown>) => {
    incidents.push(check);
  }),
}));

vi.mock("@/modules/ai-core/model-catalog", () => ({
  findChatModel: () => null,
  findEmbeddingModel: () => null,
}));

// Real normaliser semantics (api.vendor.ai rewrite) exercised inside the sync;
// only the pricing lookup is stubbed out.
vi.mock("@/modules/voice-core/model-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/voice-core/model-catalog")>()),
  findTTSModel: () => null,
}));

/**
 * Fresh module state per test: the 5-minute sync TTL in live-catalog would
 * otherwise turn the second syncLiveProviderCatalog() call into a no-op.
 */
async function freshSync(): Promise<void> {
  vi.resetModules();
  const mod = await import("./live-catalog");
  await mod.syncLiveProviderCatalog();
}

function insertedModelRows(): Array<{ providerId: string; capability: string; kind: string; modelId: string; metadata: Record<string, unknown> }> {
  return executeCalls
    .filter((args) => String(args[0]).startsWith("INSERT INTO platform_ai_provider_models"))
    .map((args) => {
      const params = (args[1] ?? []) as unknown[];
      return {
        providerId: String(params[0]),
        capability: String(params[1]),
        kind: String(params[2]),
        modelId: String(params[3]),
        metadata: JSON.parse(String(params[5])) as Record<string, unknown>,
      };
    });
}

function disableMissingUpdates(): Array<{ providerId: string; capability: string; kind: string }> {
  return executeCalls
    .filter((args) => String(args[0]).includes("SET enabled = FALSE"))
    .map((args) => {
      const params = (args[1] ?? []) as unknown[];
      return { providerId: String(params[0]), capability: String(params[1]), kind: String(params[2]) };
    });
}

function defaultPins(): Array<{ providerId: string; capability: string; kind: string; modelId: string }> {
  return executeCalls
    .filter((args) => String(args[0]).includes("SET is_default"))
    .map((args) => {
      const params = (args[1] ?? []) as unknown[];
      return { providerId: String(params[0]), capability: String(params[1]), kind: String(params[2]), modelId: String(params[3]) };
    });
}

beforeEach(() => {
  executeCalls.length = 0;
  incidents.length = 0;
  fetchUrls.length = 0;
  delete process.env.SARVAM_API_KEY;
  delete process.env.SARVAM_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncSarvam keyless curated catalogue", () => {
  it("lands curated models, voices and defaults with NO credential and NO vendor contact", async () => {
    const fetchSpy = vi.fn(async (url: unknown) => {
      fetchUrls.push(String(url));
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await freshSync();

    // No vendor discovery was attempted — a keyless provider makes no network
    // claim at all.
    expect(fetchSpy).not.toHaveBeenCalled();

    const sarvamRows = insertedModelRows().filter((row) => row.providerId === "sarvam");
    const byKey = new Map(sarvamRows.map((row) => [`${row.capability}:${row.kind}:${row.modelId}`, row]));

    // Realtime Voice half-canvas: LLM models, realtime STT, streaming TTS…
    expect(byKey.get("realtime_voice:realtime:sarvam-105b-conversations")).toBeTruthy();
    expect(byKey.get("realtime_voice:stt:saaras:v3-realtime")).toBeTruthy();
    expect(byKey.get("realtime_voice:tts:bulbul:v3")).toBeTruthy();
    // …voices on BOTH speech capabilities (the half-canvas "Voices 0" symptom)…
    expect(byKey.get("realtime_voice:voice:shubh")).toBeTruthy();
    expect(byKey.get("voice_chat:voice:shubh")).toBeTruthy();
    // …turn-based Voice Chat TTS/STT and Chat rows.
    expect(byKey.get("voice_chat:tts:bulbul:v3")).toBeTruthy();
    expect(byKey.get("voice_chat:stt:saaras:v3")).toBeTruthy();
    expect(byKey.get("chat:chat:sarvam-105b-conversations")).toBeTruthy();

    // Rows count toward the workspace modelCounts / agent pickers.
    for (const row of sarvamRows) {
      expect(row.metadata.catalogSource).toBe("vendor_live");
    }

    // Curated defaults are pinned so pickers have a working selection even
    // before the first key is saved.
    const pins = defaultPins().filter((pin) => pin.providerId === "sarvam");
    expect(pins).toContainEqual(expect.objectContaining({ capability: "realtime_voice", kind: "stt", modelId: "saaras:v3-realtime" }));
    expect(pins).toContainEqual(expect.objectContaining({ capability: "voice_chat", kind: "voice", modelId: "shubh" }));

    // Keyless sync makes no vendor claim: no reconciliation against a
    // catalogue we cannot verify, and no health incident either way (the
    // "Not configured" state is surfaced by the connection test instead).
    expect(disableMissingUpdates().filter((row) => row.providerId === "sarvam")).toHaveLength(0);
    expect(incidents.find((incident) => incident.key === "ai-catalog:sarvam")).toBeUndefined();
  });
});

describe("syncSarvam base-URL normalisation", () => {
  it("probes the OFFICIAL endpoint when SARVAM_BASE_URL is the api.vendor.ai placeholder", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_BASE_URL = "https://api.vendor.ai";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        fetchUrls.push(String(url));
        const target = String(url);
        if (target.includes("/v2/models") || target.includes("/v1/models")) {
          return new Response(
            JSON.stringify({ data: [{ id: "sarvam-105b-conversations" }, { id: "sarvam-2b" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await freshSync();

    // Discovery reached the real Sarvam endpoint — the dead placeholder host
    // was rewritten before any request left the process.
    expect(fetchUrls.length).toBeGreaterThan(0);
    for (const url of fetchUrls) {
      expect(url.startsWith("https://api.sarvam.ai/")).toBe(true);
      expect(url.includes("api.vendor.ai")).toBe(false);
    }

    // Vendor-discovered chat models land alongside the curated minimum…
    const sarvamRows = insertedModelRows().filter((row) => row.providerId === "sarvam");
    const ids = new Set(sarvamRows.map((row) => `${row.capability}:${row.kind}:${row.modelId}`));
    expect(ids.has("chat:chat:sarvam-2b")).toBe(true);
    expect(ids.has("chat:chat:sarvam-105b-conversations")).toBe(true);

    // …and a successful vendor sync records the healthy catalogue incident
    // (the admin banner clears).
    const catalogIncident = incidents.find((incident) => incident.key === "ai-catalog:sarvam");
    expect(catalogIncident).toMatchObject({ healthy: true });
  });
});
