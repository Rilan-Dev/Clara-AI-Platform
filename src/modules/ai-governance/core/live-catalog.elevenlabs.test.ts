/**
 * src/modules/ai-governance/core/live-catalog.elevenlabs.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated-row resilience for the ElevenLabs catalogue sync.
 *
 * Production regression this pins: an AbortError / HTTP failure on the vendor
 * /v1/models call used to abort the ENTIRE sync before the curated Scribe
 * (STT) and conversational (STS) rows were inserted — so the model pickers
 * showed ONLY stale TTS rows ("9 TTS models") and the speech pipeline's
 * STT/STS halves stayed invisible until the vendor came back. The curated
 * rows are vendor-independent and must always land; the vendor outage must
 * still be recorded as an admin incident.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCalls: unknown[][] = [];
const incidents: Array<Record<string, unknown>> = [];

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

vi.mock("@/modules/voice-core/model-catalog", () => ({
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

function insertedModelRows(): Array<{ modelId: string; kind: string; capability: string; metadata: Record<string, unknown> }> {
  return executeCalls
    .filter((args) => String(args[0]).startsWith("INSERT INTO platform_ai_provider_models"))
    .map((args) => {
      // execute(sql, params[]) — the bound values arrive as ONE array argument.
      const params = (args[1] ?? []) as unknown[];
      return {
        capability: String(params[1]),
        kind: String(params[2]),
        modelId: String(params[3]),
        metadata: JSON.parse(String(params[5])) as Record<string, unknown>,
      };
    });
}

beforeEach(() => {
  executeCalls.length = 0;
  incidents.length = 0;
  process.env.ELEVENLABS_API_KEY = "test-key";
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.SARVAM_API_KEY;
});

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  vi.unstubAllGlobals();
});

describe("syncElevenLabs curated resilience", () => {
  it("upserts curated STT/STS rows even when the vendor catalogue rejects the request", async () => {
    // Non-retryable vendor failure (HTTP 401) — the vendor half of the sync
    // fails exactly like the production AbortError did.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );

    await freshSync();

    const rows = insertedModelRows();
    const byId = new Map(rows.map((row) => [`${row.kind}:${row.modelId}`, row]));

    // Curated realtime STT row…
    expect(byId.get("stt:scribe_v2_realtime")).toMatchObject({ capability: "realtime_voice" });
    // …batch STT rows for turn-based voice chat…
    expect(byId.get("stt:scribe_v1")).toMatchObject({ capability: "voice_chat" });
    // …and the curated STS fallback all land despite the vendor outage.
    expect(byId.get("sts:eleven_v3_conversational")).toMatchObject({ capability: "realtime_voice" });

    // Rows carry the vendor_live catalogSource so they count toward the
    // provider workspace modelCounts and reach the agent pickers.
    for (const row of rows) {
      expect(row.metadata.catalogSource).toBe("vendor_live");
    }

    // The vendor outage is still recorded as an admin-facing incident.
    const catalogIncident = incidents.find((incident) => incident.key === "ai-catalog:elevenlabs");
    expect(catalogIncident).toMatchObject({ healthy: false, severity: "critical" });
  });

  it("catalogues vendor conversational models as sts alongside the curated rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.includes("/v1/models")) {
          return new Response(
            JSON.stringify([
              { model_id: "eleven_multilingual_v2", name: "Multilingual v2", can_do_text_to_speech: true },
              { model_id: "eleven_v3_conversational", name: "Eleven v3 Conversational", can_do_text_to_speech: true },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (target.includes("/v2/voices")) {
          return new Response(
            JSON.stringify({ voices: [{ voice_id: "voice-1", name: "Voice One" }], has_more: false }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await freshSync();

    const rows = insertedModelRows();
    const ids = new Set(rows.map((row) => `${row.kind}:${row.modelId}`));
    // Vendor TTS rows (both capabilities)…
    expect(ids.has("tts:eleven_multilingual_v2")).toBe(true);
    // …the vendor conversational model catalogued as sts…
    expect(ids.has("sts:eleven_v3_conversational")).toBe(true);
    // …curated STT/STS rows alongside…
    expect(ids.has("stt:scribe_v2_realtime")).toBe(true);
    // …and the workspace voice for both speech capabilities.
    expect(ids.has("voice:voice-1")).toBe(true);

    // Successful sync records a healthy catalogue incident (banner clears).
    const catalogIncident = incidents.find((incident) => incident.key === "ai-catalog:elevenlabs");
    expect(catalogIncident).toMatchObject({ healthy: true });
  });
});
