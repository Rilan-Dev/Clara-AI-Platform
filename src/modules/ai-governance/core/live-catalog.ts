/**
 * Live provider catalogue synchronisation.
 *
 * The admin provider workspace and runtime resolver must use the vendor's
 * currently available catalogue, not the bootstrap rows from migration 040.
 * Bootstrap rows remain as a safe fallback when a provider is unreachable.
 *
 * Secrets never leave the server. New vendor resources are inserted into the
 * existing governance catalogue; previously discovered resources are disabled
 * when the vendor no longer advertises them.
 */

import { execute } from "@/lib/db";
import { loadRuntimeSettingsOnStartup } from "@/lib/db/migrate";
import { findChatModel, findEmbeddingModel } from "@/modules/ai-core/model-catalog";
import { qwenModelsEndpoint } from "@/modules/ai-core/providers/qwen";
import { findTTSModel, normalizeProviderBaseUrl } from "@/modules/voice-core/model-catalog";
import { recordRuntimeIncident } from "@/modules/platform-health/core/incidents";

type Provider = "openai" | "gemini" | "sarvam" | "elevenlabs" | "qwen";
type Capability = "chat" | "voice_chat" | "realtime_voice";
type Kind = "chat" | "embedding" | "realtime" | "transcription" | "tts" | "stt" | "voice" | "sts";

type CatalogItem = {
  providerId: Provider;
  capability: Capability;
  kind: Kind;
  modelId: string;
  displayName: string;
  metadata?: Record<string, unknown>;
};

const SYNC_TTL_MS = 5 * 60_000;
let lastSyncAt = 0;
let syncPromise: Promise<void> | null = null;

function key(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

// Catalogue discovery talks to paginated, latency-sensitive vendor APIs; an
// 8s hard timeout aborted the whole ElevenLabs sync (AbortError in production
// docker logs), which left STS/voice rows undiscovered. Tunable + retried.
const AI_CATALOG_TIMEOUT_MS = (() => {
  const value = Number(process.env.AI_CATALOG_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 ? value : 20_000;
})();

async function jsonFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_CATALOG_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    return response.json();
  } catch (error) {
    // One retry for transport-level flakiness (observed: transient AbortError
    // on slow routes). HTTP errors (401 etc.) are NOT retried.
    const retryable = /abort|timeout|timed out|fetch failed|econnreset|socket hang up/i.test(
      error instanceof Error ? error.message : String(error),
    );
    if (retryable && attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return jsonFetch(url, init, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function upsertItems(items: CatalogItem[]): Promise<void> {
  if (!items.length) return Promise.resolve();
  return (async () => {
    for (const item of items) {
      await execute(
        `INSERT INTO platform_ai_provider_models
          (provider_id, capability, kind, model_id, display_name, enabled, metadata)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6::jsonb)
         ON CONFLICT (provider_id, capability, kind, model_id)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           enabled = TRUE,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [
          item.providerId,
          item.capability,
          item.kind,
          item.modelId,
          item.displayName,
          JSON.stringify({ ...(item.metadata ?? {}), catalogSource: "vendor_live", syncedAt: new Date().toISOString() }),
        ],
      );
    }
  })();
}

/** Pin the platform default model for a (provider, capability, kind) slot. */
async function setLiveDefault(provider: Provider, capability: Capability, kind: Kind, modelId: string): Promise<void> {
  await execute(
    `UPDATE platform_ai_provider_models
        SET is_default = (model_id = $4), updated_at = now()
      WHERE provider_id = $1 AND capability = $2 AND kind = $3`,
    [provider, capability, kind, modelId],
  );
}

async function disableMissing(provider: Provider, capability: Capability, kind: Kind, liveIds: Set<string>): Promise<void> {
  await execute(
    `UPDATE platform_ai_provider_models
        SET enabled = FALSE, updated_at = now(),
            metadata = metadata || jsonb_build_object('catalogSource', 'vendor_live', 'stale', TRUE, 'staleAt', now())
      WHERE provider_id = $1 AND capability = $2 AND kind = $3
        AND model_id <> ALL($4::text[])
        AND NOT (
          $3 = 'embedding' AND EXISTS (
            SELECT 1 FROM platform_ai_embedding_defaults d
             WHERE d.id IS TRUE
               AND d.provider_id = platform_ai_provider_models.provider_id
               AND d.model_id = platform_ai_provider_models.model_id
          )
        )
`,
    [provider, capability, kind, [...liveIds]],
  );
}

function classifyOpenAIModel(id: string): Array<{ capability: Capability; kind: Kind }> {
  const value = id.toLowerCase();
  if (value.includes("embedding")) return [{ capability: "chat", kind: "embedding" }];
  if (value.includes("transcribe") || value.includes("whisper")) return [{ capability: "realtime_voice", kind: "transcription" }];
  if (value.includes("realtime")) return [{ capability: "realtime_voice", kind: "realtime" }];
  if (/^(gpt-|o[1-9]|chatgpt-)/.test(value)) return [{ capability: "chat", kind: "chat" }];
  return [];
}

async function syncOpenAI(): Promise<boolean> {
  const apiKey = key("OPENAI_API_KEY");
  if (!apiKey) return false;
  const discoveredModels: Array<{ id: string; owned_by?: string }> = [];
  let after = "";
  for (let page = 0; page < 20; page += 1) {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const body = (await jsonFetch("https://api.openai.com/v1/models?" + qs, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })) as {
      data?: Array<{ id: string; owned_by?: string }>;
      has_more?: boolean;
      last_id?: string;
    };
    if (
      !body || typeof body !== "object" || !Array.isArray(body.data) ||
      typeof body.has_more !== "boolean" ||
      body.data.some((model) => !model || typeof model.id !== "string" || model.id.length === 0)
    ) {
      throw new Error("OpenAI model catalogue returned a malformed page; refusing partial reconciliation.");
    }
    const pageModels = body.data;
    discoveredModels.push(...pageModels);
    if (!body.has_more) break;
    const nextAfter = body.last_id ?? pageModels.at(-1)?.id ?? "";
    if (!nextAfter || nextAfter === after) {
      throw new Error("OpenAI model catalogue returned an invalid/repeated pagination cursor; refusing partial reconciliation.");
    }
    if (page === 19) {
      throw new Error("OpenAI model catalogue exceeded the 20-page discovery limit; refusing partial reconciliation.");
    }
    after = nextAfter;
  }
  const items: CatalogItem[] = [];
  for (const model of discoveredModels) {
    for (const slot of classifyOpenAIModel(model.id)) {
      items.push({
        providerId: "openai",
        ...slot,
        modelId: model.id,
        displayName: model.id,
        metadata: {
          ownedBy: model.owned_by ?? null,
          ...(slot.kind === "chat" ? {
            inputUsdPerMTokens: findChatModel(model.id)?.inputUsdPerMTokens ?? null,
            outputUsdPerMTokens: findChatModel(model.id)?.outputUsdPerMTokens ?? null,
            contextTokens: findChatModel(model.id)?.contextTokens ?? null,
          } : slot.kind === "embedding" ? {
            inputUsdPerMTokens: findEmbeddingModel(model.id)?.inputUsdPerMTokens ?? null,
            dimension: findEmbeddingModel(model.id)?.dimension ?? null,
          } : {}),
          ...((model.id.match(/(20\d{2}-\d{2}-\d{2})/)?.[1]) ? { releaseDate: model.id.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] } : {}),
        },
      });
    }
  }
  const groups = new Map<string, Set<string>>();
  for (const item of items) {
    const group = `${item.capability}:${item.kind}`;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group)!.add(item.modelId);
  }
  await upsertItems(items);
  // A successful /v1/models response is authoritative for each selectable
  // OpenAI model kind, including kinds with zero currently accessible models.
  for (const group of ["chat:chat", "chat:embedding", "realtime_voice:realtime", "realtime_voice:transcription"]) {
    const [capability, kind] = group.split(":") as [Capability, Kind];
    await disableMissing("openai", capability, kind, groups.get(group) ?? new Set<string>());
  }
  return true;
}

/**
 * Sync the local Qwen embeddings server (llama.cpp llama-server).
 *
 * Only runs when QWEN_EMBEDDINGS_BASE_URL is explicitly set — deployments
 * without the self-hosted service (e.g. Vercel) skip the provider entirely
 * instead of recording a DNS-failure incident every sync cycle. The server
 * exposes an OpenAI-compatible /v1/models list; every served model is an
 * embedding model (kind "embedding", capability "chat"), dimension 1024
 * (Qwen3-Embedding-0.6B contract; enriched from the static catalogue when
 * the served alias matches a known id).
 */
async function syncQwen(): Promise<boolean> {
  const baseUrl = key("QWEN_EMBEDDINGS_BASE_URL");
  if (!baseUrl) return false;
  const apiKey = key("QWEN_API_KEY");
  const body = (await jsonFetch(qwenModelsEndpoint(), {
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
  })) as { data?: Array<{ id?: string }> };
  if (!body || typeof body !== "object" || !Array.isArray(body.data)) {
    throw new Error("Qwen embeddings server returned a malformed model list.");
  }
  const served = body.data
    .map((model) => (typeof model.id === "string" ? model.id.trim() : ""))
    .filter((id) => id.length > 0);
  if (!served.length) {
    throw new Error("Qwen embeddings server advertised no models (is the server built with --embedding enabled?).");
  }
  const items: CatalogItem[] = served.map((id) => {
    const known = findEmbeddingModel(id) ?? findEmbeddingModel(id.replace(/\.gguf$/i, ""));
    return {
      providerId: "qwen",
      capability: "chat",
      kind: "embedding",
      modelId: id,
      displayName: known ? "Qwen3 Embedding 0.6B (local)" : id,
      metadata: {
        dimension: known?.dimension ?? 1024,
        inputUsdPerMTokens: 0, // self-hosted: no vendor billing
        local: true,
      },
    };
  });
  await upsertItems(items);
  const liveIds = new Set(items.map((item) => item.modelId));
  await disableMissing("qwen", "chat", "embedding", liveIds);
  return true;
}

async function syncGemini(): Promise<boolean> {
  const apiKey = key("GEMINI_API_KEY");
  if (!apiKey) return false;
  const items: CatalogItem[] = [];
  let pageToken = "";
  const seenPageTokens = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) qs.set("pageToken", pageToken);
    const body = (await jsonFetch(`https://generativelanguage.googleapis.com/v1beta/models?${qs}`, {
      headers: { "x-goog-api-key": apiKey },
    })) as {
      models?: Array<{ name?: string; displayName?: string; description?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[]; temperature?: number; topP?: number; topK?: number }>;
      nextPageToken?: string;
    };
    if (
      !body || typeof body !== "object" || !Array.isArray(body.models) ||
      (body.nextPageToken !== undefined && typeof body.nextPageToken !== "string") ||
      body.models.some((model) => !model || (model.name !== undefined && typeof model.name !== "string"))
    ) {
      throw new Error("Gemini model catalogue returned a malformed page; refusing partial reconciliation.");
    }
    for (const model of body.models) {
      const id = (model.name ?? "").replace(/^models\//, "");
      if (!id) continue;
      const methods = model.supportedGenerationMethods ?? [];
      if (methods.includes("embedContent")) {
        items.push({ providerId: "gemini", capability: "chat", kind: "embedding", modelId: id, displayName: model.displayName ?? id, metadata: { supportedGenerationMethods: methods, inputTokenLimit: model.inputTokenLimit ?? null, outputTokenLimit: model.outputTokenLimit ?? null, description: model.description ?? null, inputUsdPerMTokens: findEmbeddingModel(id)?.inputUsdPerMTokens ?? null, dimension: findEmbeddingModel(id)?.dimension ?? null, ...((id.match(/(20\d{2}-\d{2}-\d{2})/)?.[1]) ? { releaseDate: id.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] } : {}) } });
      }
      if (methods.includes("generateContent")) {
        items.push({ providerId: "gemini", capability: "chat", kind: "chat", modelId: id, displayName: model.displayName ?? id, metadata: { supportedGenerationMethods: methods, inputTokenLimit: model.inputTokenLimit ?? null, outputTokenLimit: model.outputTokenLimit ?? null, description: model.description ?? null, inputUsdPerMTokens: findChatModel(id)?.inputUsdPerMTokens ?? null, outputUsdPerMTokens: findChatModel(id)?.outputUsdPerMTokens ?? null, contextTokens: findChatModel(id)?.contextTokens ?? model.inputTokenLimit ?? null, ...((id.match(/(20\d{2}-\d{2}-\d{2})/)?.[1]) ? { releaseDate: id.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] } : {}) } });
      }
      if (methods.some((method) => /bidi/i.test(method))) {
        items.push({ providerId: "gemini", capability: "realtime_voice", kind: "realtime", modelId: id, displayName: model.displayName ?? id, metadata: { supportedGenerationMethods: methods, inputTokenLimit: model.inputTokenLimit ?? null, outputTokenLimit: model.outputTokenLimit ?? null, description: model.description ?? null } });
      }
    }
    const nextPageToken = body.nextPageToken ?? "";
    if (!nextPageToken) {
      pageToken = "";
      break;
    }
    // Never reconcile a partial catalogue as authoritative. If pagination
    // exceeds the safety bound, fail discovery before upserts or stale-row
    // disabling; the caller records a degraded incident and last-known rows
    // remain selectable.
    if (page === 19) {
      throw new Error("Gemini model catalogue exceeded the 20-page discovery limit; refusing partial reconciliation.");
    }
    if (seenPageTokens.has(nextPageToken)) {
      throw new Error("Gemini model catalogue returned a repeated page token; refusing partial reconciliation.");
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }
  const groups = new Map<string, Set<string>>();
  for (const item of items) {
    const group = `${item.capability}:${item.kind}`;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group)!.add(item.modelId);
  }
  await upsertItems(items);
  // A successful Gemini catalogue response is authoritative, including
  // empty capability groups. Disable seeded/static model rows that Google no
  // longer advertises; a failed request never reaches this reconciliation.
  for (const group of ["chat:chat", "chat:embedding", "realtime_voice:realtime"]) {
    const [capability, kind] = group.split(":") as [Capability, Kind];
    await disableMissing("gemini", capability, kind, groups.get(group) ?? new Set<string>());
  }
  return true;
}

// ── Sarvam curated catalogue ────────────────────────────────────────────────
// Sarvam's public API does not expose a discoverable catalogue for the realtime
// voice-agent stack (Saaras realtime STT, Bulbul streaming TTS, speaker voices)
// or for the voice-chat stack. Without these rows the Realtime Voice half-canvas
// shows "Models 0 / Voices 0" and the resolver can never resolve a Sarvam
// realtime model — the exact regression reported on the platform. The lists
// below mirror Sarvam's documented offerings and are refreshed on every sync
// so they stay vendor-live rows (shared by admin UI and runtime resolver).

const SARVAM_REALTIME_LLM_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: "sarvam-105b-conversations", name: "Sarvam 105B Conversations (32K)", default: true },
  { id: "sarvam-105b", name: "Sarvam 105B (128K)", default: false },
];

const SARVAM_REALTIME_STT_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: "saaras:v3-realtime", name: "Saaras v3 Realtime (live STT)", default: true },
  { id: "saaras:v4", name: "Saaras v4", default: false },
];

const SARVAM_TTS_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: "bulbul:v3", name: "Bulbul v3 (streaming)", default: true },
  { id: "bulbul:v2", name: "Bulbul v2", default: false },
];

const SARVAM_BATCH_STT_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: "saaras:v3", name: "Saaras v3 (batch STT)", default: true },
  { id: "saaras:v4", name: "Saaras v4", default: false },
];

const SARVAM_VOICES = [
  "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan",
  "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun",
  "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand",
  "tanya", "tarun", "sunny", "mani", "gokul", "vijay",
];

async function syncSarvam(): Promise<boolean> {
  const apiKey = key("SARVAM_API_KEY");

  // Chat models: try the vendor discovery endpoints. Sarvam has shipped both
  // /v1/models and /v2/models depending on release; try v2 then v1 and keep
  // the first that answers. A failed discovery keeps the curated minimum.
  // Shared normaliser: the dead api.vendor.ai placeholder that the Base URL
  // field used to suggest is rewritten to the official endpoint, so discovery
  // probes the real host instead of timing out against a domain that does
  // not resolve.
  const base = normalizeProviderBaseUrl(key("SARVAM_BASE_URL"), "https://api.sarvam.ai", "Sarvam");
  let discoveredChatIds: string[] = [];
  let chatDiscoverySucceeded = false;
  let chatDiscoveryError: unknown = null;
  if (apiKey) {
    for (const modelsPath of ["/v2/models", "/v1/models"]) {
      try {
        const body = (await jsonFetch(`${base}${modelsPath}`, {
          headers: { "api-subscription-key": apiKey, Authorization: `Bearer ${apiKey}` },
        })) as { data?: Array<{ id?: string; owned_by?: string }> };
        discoveredChatIds = (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
        // A successful empty response is still authoritative. Fall back to
        // the legacy endpoint only when the preferred endpoint errors.
        chatDiscoverySucceeded = true;
        chatDiscoveryError = null;
        break;
      } catch (error) {
        chatDiscoveryError = error;
        // Try the next documented endpoint before declaring discovery failed.
      }
    }
  }

  const chatItems: CatalogItem[] = [
    ...SARVAM_REALTIME_LLM_MODELS.map((m) => ({
      providerId: "sarvam" as const,
      capability: "chat" as const,
      kind: "chat" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated" },
    })),
    ...discoveredChatIds
      .filter((id) => !SARVAM_REALTIME_LLM_MODELS.some((m) => m.id === id))
      .map((id) => ({
        providerId: "sarvam" as const,
        capability: "chat" as const,
        kind: "chat" as const,
        modelId: id,
        displayName: id,
        metadata: { source: "vendor_api" },
      })),
  ];

  const realtimeItems: CatalogItem[] = [
    ...SARVAM_REALTIME_LLM_MODELS.map((m) => ({
      providerId: "sarvam" as const,
      capability: "realtime_voice" as const,
      kind: "realtime" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated" },
    })),
    ...SARVAM_REALTIME_STT_MODELS.map((m) => ({
      providerId: "sarvam" as const,
      capability: "realtime_voice" as const,
      kind: "stt" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated", realtime: true },
    })),
    ...SARVAM_TTS_MODELS.map((m) => ({
      providerId: "sarvam" as const,
      capability: "realtime_voice" as const,
      kind: "tts" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated", streaming: true },
    })),
  ];

  const voiceChatItems: CatalogItem[] = [
    ...SARVAM_TTS_MODELS.map((m) => ({
      providerId: "sarvam" as const,
      capability: "voice_chat" as const,
      kind: "tts" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated" },
    })),
    ...SARVAM_BATCH_STT_MODELS.map((m) => ({
      providerId: "sarvam" as const,
      capability: "voice_chat" as const,
      kind: "stt" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated" },
    })),
  ];

  // The same speaker voices serve turn-based Voice Chat and Realtime Voice.
  const voiceItems: CatalogItem[] = SARVAM_VOICES.map((voiceId) => ({
    providerId: "sarvam" as const,
    capability: "voice_chat" as const,
    kind: "voice" as const,
    modelId: voiceId,
    displayName: voiceId.charAt(0).toUpperCase() + voiceId.slice(1),
    metadata: { source: "curated" },
  }));
  const realtimeVoiceItems = voiceItems.map((item) => ({ ...item, capability: "realtime_voice" as const }));

  await upsertItems([...chatItems, ...realtimeItems, ...voiceChatItems, ...voiceItems, ...realtimeVoiceItems]);

  // Reconciliation: a model disappears only when the curated list no longer
  // contains it AND vendor discovery succeeded without it. Keyless syncs make
  // no vendor claim at all — previously-discovered rows stay enabled.
  if (apiKey) {
    // Curated realtime/voice lists are platform-maintained and can be
    // reconciled independently. Vendor-discovered chat rows may only be
    // disabled after one discovery endpoint answered successfully.
    if (chatDiscoverySucceeded) {
      const authoritativeChatIds = new Set([
        ...SARVAM_REALTIME_LLM_MODELS.map((m) => m.id),
        ...discoveredChatIds,
      ]);
      await disableMissing("sarvam", "chat", "chat", authoritativeChatIds);
    }
    await disableMissing("sarvam", "realtime_voice", "realtime", new Set(SARVAM_REALTIME_LLM_MODELS.map((m) => m.id)));
    await disableMissing("sarvam", "realtime_voice", "stt", new Set(SARVAM_REALTIME_STT_MODELS.map((m) => m.id)));
    await disableMissing("sarvam", "realtime_voice", "tts", new Set(SARVAM_TTS_MODELS.map((m) => m.id)));
    await disableMissing("sarvam", "voice_chat", "tts", new Set(SARVAM_TTS_MODELS.map((m) => m.id)));
    await disableMissing("sarvam", "voice_chat", "stt", new Set(SARVAM_BATCH_STT_MODELS.map((m) => m.id)));
    await disableMissing("sarvam", "voice_chat", "voice", new Set(SARVAM_VOICES));
    await disableMissing("sarvam", "realtime_voice", "voice", new Set(SARVAM_VOICES));
  }

  await setLiveDefault("sarvam", "chat", "chat", "sarvam-105b-conversations");
  await setLiveDefault("sarvam", "realtime_voice", "realtime", "sarvam-105b-conversations");
  await setLiveDefault("sarvam", "realtime_voice", "stt", "saaras:v3-realtime");
  await setLiveDefault("sarvam", "realtime_voice", "tts", "bulbul:v3");
  await setLiveDefault("sarvam", "voice_chat", "tts", "bulbul:v3");
  await setLiveDefault("sarvam", "voice_chat", "stt", "saaras:v3");
  await setLiveDefault("sarvam", "voice_chat", "voice", "shubh");
  await setLiveDefault("sarvam", "realtime_voice", "voice", "shubh");
  if (apiKey && !chatDiscoverySucceeded) {
    throw chatDiscoveryError instanceof Error
      ? chatDiscoveryError
      : new Error("Sarvam model catalogue discovery failed for both supported endpoints.");
  }
  return Boolean(apiKey);
}

// ── ElevenLabs curated STT / STS catalogue ──────────────────────────────────
// /v1/models only advertises TTS models. The realtime voice-agent stack also
// uses Scribe (STT) and the conversational speech-to-speech (STS) models that
// power ElevenLabs Conversational AI. Without these rows the Realtime Voice
// half-canvas shows ONLY TTS models — the platform admin cannot see or select
// the STT/STS half of the pipeline. Keep the curated list aligned with the
// vendor's published Scribe / Conversational offerings.

const ELEVENLABS_REALTIME_STT_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: "scribe_v2_realtime", name: "Scribe v2 Realtime (live STT)", default: true },
];

const ELEVENLABS_BATCH_STT_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: "scribe_v1", name: "Scribe v1", default: true },
  { id: "scribe_v1_eu", name: "Scribe v1 (EU)", default: false },
  { id: "scribe_v2", name: "Scribe v2", default: false },
  { id: "scribe_v2_eu", name: "Scribe v2 (EU)", default: false },
];

const ELEVENLABS_STS_FALLBACK_MODEL_IDS = ["eleven_v3_conversational"];

async function syncElevenLabs(): Promise<boolean> {
  const apiKey = key("ELEVENLABS_API_KEY");
  // Shared normaliser (Sarvam + ElevenLabs read the same Base URL field
  // semantics): empty → official endpoint, bare host → https://, and the dead
  // api.vendor.ai placeholder is rewritten to the official endpoint.
  const base = normalizeProviderBaseUrl(
    key("ELEVENLABS_API_BASE_URL") ?? key("ELEVENLABS_BASE_URL"),
    "https://api.elevenlabs.io",
    "ElevenLabs",
  );
  const headers = { "xi-api-key": apiKey ?? "" };

  // Curated rows are vendor-independent and are upserted EVEN when the vendor
  // catalogue endpoints are unreachable (observed in production: an AbortError
  // on /v1/models aborted the whole sync, so the model pickers showed ONLY
  // stale TTS rows — the Scribe STT and conversational STS halves of the
  // realtime pipeline stayed invisible until the vendor came back).
  const sttItems: CatalogItem[] = [
    ...ELEVENLABS_REALTIME_STT_MODELS.map((m) => ({
      providerId: "elevenlabs" as const,
      capability: "realtime_voice" as const,
      kind: "stt" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated", realtime: true },
    })),
    ...ELEVENLABS_BATCH_STT_MODELS.map((m) => ({
      providerId: "elevenlabs" as const,
      capability: "voice_chat" as const,
      kind: "stt" as const,
      modelId: m.id,
      displayName: m.name,
      metadata: { source: "curated", batch: true },
    })),
  ];
  const stsItems: CatalogItem[] = [];
  // Vendor-discovered conversational model ids only — the curated fallback
  // below dedupes against these. (This set MUST start empty: seeding it with
  // the fallback ids made the fallback loop dead code, so the STS section
  // silently vanished whenever the vendor list omitted conversational
  // models — exactly the case the fallback exists for.)
  const stsModelIds = new Set<string>();

  // Keyless sync: curated STT/STS rows are vendor-independent — land them so
  // the Realtime Voice half-canvas never shows a bare TTS-only (or empty)
  // catalogue before the first key is saved — but make NO vendor contact, no
  // health claim, and no reconciliation against rows we cannot verify
  // without a credential.
  if (!apiKey) {
    for (const id of ELEVENLABS_STS_FALLBACK_MODEL_IDS) {
      if (stsModelIds.has(id)) continue;
      stsModelIds.add(id);
      stsItems.push({
        providerId: "elevenlabs",
        capability: "realtime_voice",
        kind: "sts",
        modelId: id,
        displayName: "Eleven v3 Conversational",
        metadata: { speechToSpeech: true, source: "curated" },
      });
    }
    await upsertItems([...sttItems, ...stsItems]);
    await setLiveDefault("elevenlabs", "realtime_voice", "stt", "scribe_v2_realtime");
    await setLiveDefault("elevenlabs", "voice_chat", "stt", "scribe_v1");
    await setLiveDefault("elevenlabs", "realtime_voice", "sts", "eleven_v3_conversational");
    return false;
  }

  // ── Vendor discovery (TTS models + workspace voices) — best effort ────────
  let vendorError: unknown = null;
  let models: Array<{
    model_id?: string;
    name?: string;
    can_do_text_to_speech?: boolean;
    can_do_voice_conversion?: boolean;
  }> = [];
  try {
    models = (await jsonFetch(`${base}/v1/models`, { headers })) as typeof models;
  } catch (error) {
    vendorError = error;
  }

  const modelItems: CatalogItem[] = [];
  if (!vendorError) {
    for (const model of models ?? []) {
      if (!model.model_id) continue;
      if (model.can_do_text_to_speech) {
        // Vendor model discovery is shared by Voice Chat and Realtime Voice.
        // The old realtime picker hardcoded eleven_flash_v2_5, even when the
        // workspace advertised newer/cheaper supported TTS models.
        for (const capability of ["voice_chat", "realtime_voice"] as const) {
          modelItems.push({
            providerId: "elevenlabs",
            capability,
            kind: "tts",
            modelId: model.model_id,
            displayName: model.name ?? model.model_id,
            metadata: {
              canDoTextToSpeech: true,
              canDoVoiceConversion: model.can_do_voice_conversion ?? false,
              modelType: model.model_id.toLowerCase().includes("flash") ? "low_latency" : "standard",
              usdPer1kChars: findTTSModel(model.model_id)?.usdPer1kChars ?? null,
            },
          });
        }
        // Conversational models are ElevenLabs' speech-to-speech realtime
        // offering (Conversational AI / Speech Engine sessions): audio in,
        // low-latency speech out with turn taking. Catalogue them under the
        // dedicated 'sts' kind so the Realtime Voice half-canvas lists them
        // separately from plain TTS.
        if (model.model_id.toLowerCase().includes("conversational")) {
          stsModelIds.add(model.model_id);
          stsItems.push({
            providerId: "elevenlabs",
            capability: "realtime_voice",
            kind: "sts",
            modelId: model.model_id,
            displayName: model.name ?? model.model_id,
            metadata: {
              speechToSpeech: true,
              canDoTextToSpeech: true,
              canDoVoiceConversion: model.can_do_voice_conversion ?? false,
              modelType: model.model_id.toLowerCase().includes("flash") ? "low_latency" : "standard",
              usdPer1kChars: findTTSModel(model.model_id)?.usdPer1kChars ?? null,
            },
          });
        }
      }
    }
  }

  // Curated STS fallback — guarantees the STS section exists even when the
  // vendor list omits conversational variants for this workspace (or the
  // vendor catalogue endpoint is unreachable: the loop above never ran and
  // stsModelIds stayed empty).
  for (const id of ELEVENLABS_STS_FALLBACK_MODEL_IDS) {
    if (stsModelIds.has(id)) continue;
    stsModelIds.add(id);
    stsItems.push({
      providerId: "elevenlabs",
      capability: "realtime_voice",
      kind: "sts",
      modelId: id,
      displayName: "Eleven v3 Conversational",
      metadata: { speechToSpeech: true, source: "curated" },
    });
  }

  const voiceItems: CatalogItem[] = [];
  if (!vendorError) {
    let nextPageToken = "";
    for (let page = 0; page < 100; page++) {
      const qs = new URLSearchParams({ page_size: "100", include_total_count: "false" });
      if (nextPageToken) qs.set("next_page_token", nextPageToken);
      const body = (await jsonFetch(`${base}/v2/voices?${qs}`, { headers })) as {
        voices?: Array<{ voice_id?: string; name?: string; category?: string; verified_languages?: unknown[] }>;
        has_more?: boolean;
        next_page_token?: string;
      };
      if (
        !body ||
        typeof body !== "object" ||
        !Array.isArray(body.voices) ||
        typeof body.has_more !== "boolean" ||
        (body.next_page_token !== undefined && typeof body.next_page_token !== "string")
      ) {
        throw new Error("ElevenLabs voice catalogue returned a malformed page; refusing partial reconciliation.");
      }
      for (const voice of body.voices) {
        if (!voice.voice_id) continue;
        voiceItems.push({
          providerId: "elevenlabs",
          capability: "voice_chat",
          kind: "voice",
          modelId: voice.voice_id,
          displayName: voice.name ?? voice.voice_id,
          metadata: { category: voice.category ?? null, verifiedLanguages: voice.verified_languages ?? [] },
        });
      }
      const discoveredNextPageToken = body.next_page_token ?? "";
      if (!body.has_more) {
        nextPageToken = "";
        break;
      }
      if (!discoveredNextPageToken) {
        throw new Error("ElevenLabs voice catalogue omitted its next-page token while more pages remain; refusing partial reconciliation.");
      }
      // Voice discovery is authoritative only when every page is accounted
      // for. Never upsert partial TTS/STS/voice results or disable last-known
      // voice rows after a repeated token or a truncated 100-page response.
      if (discoveredNextPageToken === nextPageToken) {
        throw new Error("ElevenLabs voice catalogue returned a repeated page token; refusing partial reconciliation.");
      }
      if (page === 99) {
        throw new Error("ElevenLabs voice catalogue exceeded the 100-page discovery limit; refusing partial reconciliation.");
      }
      nextPageToken = discoveredNextPageToken;
    }
  }

  // The same ElevenLabs workspace voices are valid for both turn-based
  // Voice Chat and Clara-controlled Realtime Voice. Previously we only
  // catalogued them under voice_chat, so the Realtime Voice half-canvas saw
  // zero voices even though /v2/voices returned them successfully.
  const realtimeVoiceItems = voiceItems.map((item) => ({
    ...item,
    capability: "realtime_voice" as const,
  }));

  await upsertItems([...modelItems, ...sttItems, ...stsItems, ...voiceItems, ...realtimeVoiceItems]);

  // Curated groups are authoritative regardless of vendor availability.
  await disableMissing("elevenlabs", "realtime_voice", "stt", new Set(ELEVENLABS_REALTIME_STT_MODELS.map((m) => m.id)));
  await disableMissing("elevenlabs", "voice_chat", "stt", new Set(ELEVENLABS_BATCH_STT_MODELS.map((m) => m.id)));
  await disableMissing("elevenlabs", "realtime_voice", "sts", new Set(stsModelIds));
  await setLiveDefault("elevenlabs", "realtime_voice", "stt", "scribe_v2_realtime");
  await setLiveDefault("elevenlabs", "voice_chat", "stt", "scribe_v1");
  await setLiveDefault("elevenlabs", "realtime_voice", "sts", "eleven_v3_conversational");

  if (vendorError) {
    // Curated STT/STS rows are in place and the last-known TTS/voice rows
    // stay enabled (no reconciliation against a response we never got).
    // Surface the vendor outage so the admin banner/email fires at the true
    // point of failure — runSync records the incident.
    throw vendorError;
  }

  // Vendor-authoritative reconciliation — only on a successful discovery.
  await disableMissing("elevenlabs", "voice_chat", "tts", new Set(modelItems.filter((item) => item.capability === "voice_chat").map((item) => item.modelId)));
  await disableMissing("elevenlabs", "realtime_voice", "tts", new Set(modelItems.filter((item) => item.capability === "realtime_voice").map((item) => item.modelId)));
  await disableMissing("elevenlabs", "voice_chat", "voice", new Set(voiceItems.map((item) => item.modelId)));
  await disableMissing("elevenlabs", "realtime_voice", "voice", new Set(realtimeVoiceItems.map((item) => item.modelId)));
  return true;
}

async function runSync(): Promise<void> {
  // DB-configured provider credentials (Settings → AI Platform → Providers)
  // are hydrated into process.env on the first registry read — but the
  // catalogue sync can run BEFORE that (getProviderWorkspace syncs first and
  // reads the registry second, and the sync's own key lookups are env-only).
  // A cold instance therefore skipped whole providers whose keys live only
  // in the database, silently leaving "Models 0 / Voices 0" half-canvases for
  // the 5-minute sync TTL. Hydrate first so the sync always sees saved keys.
  await loadRuntimeSettingsOnStartup().catch(() => undefined);

  // A single failed provider must not prevent the others from refreshing —
  // and a failed discovery must never stay silent: an unreachable vendor or
  // rejected credential leaves the platform without vendor-live model rows,
  // which surfaces later as "No embedding model is configured for this
  // tenant". Record a runtime incident per failed provider so the admin
  // banner and email notification fire at the true point of failure.
  const tasks: Array<{ provider: Provider; run: () => Promise<boolean> }> = [
    { provider: "openai", run: syncOpenAI },
    { provider: "gemini", run: syncGemini },
    { provider: "sarvam", run: syncSarvam },
    { provider: "elevenlabs", run: syncElevenLabs },
    { provider: "qwen", run: syncQwen },
  ];
  await Promise.all(
    tasks.map(async ({ provider, run }) => {
      try {
        const vendorContacted = await run();
        if (!vendorContacted) return;
        await recordRuntimeIncident({
          key: `ai-catalog:${provider}`,
          serviceName: `${provider} model catalogue`,
          healthy: true,
          severity: "warning",
          message: "Vendor model catalogue sync succeeded.",
        });
      } catch (error) {
        console.warn(`[ai-governance] live catalogue sync failed for ${provider}:`, error);
        await recordRuntimeIncident({
          key: `ai-catalog:${provider}`,
          serviceName: `${provider} model catalogue`,
          healthy: false,
          severity: "critical",
          message:
            `Live model catalogue discovery failed for ${provider}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}. ` +
            `Model lists stay on their last known state; a rejected credential (401) also blocks embedding resolution for this provider. ` +
            `Verify the credential in Settings → AI Platform → Providers.`,
        });
      }
    }),
  );
}

export async function syncLiveProviderCatalog(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncAt < SYNC_TTL_MS) return;
  if (syncPromise) return syncPromise;
  syncPromise = runSync()
    .catch((error) => {
      console.warn("[ai-governance] live provider catalogue sync failed:", error);
    })
    .finally(() => {
      lastSyncAt = Date.now();
      syncPromise = null;
    });
  return syncPromise;
}
