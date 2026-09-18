/**
 * src/modules/voice-core/providers/elevenlabs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs implementation of the VoiceProviderService interface — the
 * voice-axis counterpart of src/modules/ai-core/providers/openai.ts.
 *
 * Deliberately NO vendor SDK: plain fetch against a fixed base URL with an
 * explicit timeout (mirroring the discipline of ai-core providers — timeoutMs
 * + single-retry semantics handled by callers), so streaming endpoints never
 * turn into silent retry storms.
 *
 * Construct via VoiceProviderFactory (voice-core/factory.ts) — never
 * `new ElevenLabsVoiceProvider(...)` at call sites, exactly like LLM
 * providers are only constructed through ProviderFactory.
 */

import {
  getElevenLabsApiKey,
  getElevenLabsBaseUrl,
  getElevenLabsTimeoutMs,
} from "../model-catalog";
import type {
  ElevenLabsSubscriptionInfo,
  ElevenLabsVoice,
  SpeakParams,
  TranscribeParams,
  TranscribeResult,
  VoiceProvider,
  VoiceProviderService,
  VoiceServiceConfig,
} from "../types";

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodyText?: string,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

export class ElevenLabsVoiceProvider implements VoiceProviderService {
  private config: VoiceServiceConfig;
  private apiKey: string | undefined;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: VoiceServiceConfig) {
    this.config = config ?? { provider: "elevenlabs" };
    // Config wins, env second — same precedence discipline as
    // OpenAIProvider (config.apiKey ?? process.env.OPENAI_API_KEY). Unlike
    // OpenAIProvider, a missing key does NOT throw here: the admin status
    // endpoint intentionally constructs the service to probe a platform
    // where the key is not yet configured, and the kill switch in
    // voice-core/resolve.ts rejects billable paths first. The key check
    // fires lazily on the first request instead (503 ElevenLabsError).
    this.apiKey = this.config.apiKey ?? getElevenLabsApiKey();
    this.baseUrl = this.config.baseUrl ?? getElevenLabsBaseUrl();
    const timeout = this.config.timeoutMs ?? getElevenLabsTimeoutMs();
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000;
  }

  // ─── Transport ───────────────────────────────────────────────────────────

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new ElevenLabsError(
        "ELEVENLABS_API_KEY is not set. Add it to your environment or the platform settings page.",
        503,
      );
    }
    return this.apiKey;
  }

  private async elevenLabsFetch(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
  ): Promise<Response> {
    const { timeoutMs = this.timeoutMs, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          "xi-api-key": this.requireApiKey(),
          ...(rest.headers ?? {}),
        },
      });
      if (!response.ok) {
        // Do NOT include the response body verbatim — vendor errors can
        // echo request fragments. Keep it short + status-coded.
        throw new ElevenLabsError(
          `ElevenLabs API error (${response.status} ${response.statusText}) on ${path}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof ElevenLabsError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new ElevenLabsError(`ElevenLabs request timed out after ${timeoutMs}ms on ${path}`, 504);
      }
      throw new ElevenLabsError(`ElevenLabs request failed on ${path}: ${(error as Error).message}`, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Subscription / connection test ──────────────────────────────────────

  async getSubscriptionInfo(): Promise<ElevenLabsSubscriptionInfo> {
    const response = await this.elevenLabsFetch("/v1/user/subscription");
    const data = (await response.json()) as Record<string, unknown>;
    return {
      tier: String(data.tier ?? "unknown"),
      characterCount: Number(data.character_count ?? 0),
      characterLimit: Number(data.character_limit ?? 0),
      nextCharacterCountResetUnix:
        data.next_character_count_reset_unix != null
          ? Number(data.next_character_count_reset_unix)
          : null,
      voiceLimit: Number(data.voice_limit ?? 0),
      canUseInstantCloning: Boolean(data.can_use_instant_cloning ?? false),
    };
  }

  // ─── Voice catalog ───────────────────────────────────────────────────────

  private normalizeVoice(raw: Record<string, unknown>): ElevenLabsVoice {
    const labels: Record<string, string> = {};
    if (raw.labels && typeof raw.labels === "object" && !Array.isArray(raw.labels)) {
      for (const [key, value] of Object.entries(raw.labels as Record<string, unknown>)) {
        if (typeof value === "string") labels[key] = value;
      }
    }
    return {
      voiceId: String(raw.voice_id ?? ""),
      name: String(raw.name ?? "Unnamed voice"),
      category: typeof raw.category === "string" ? raw.category : null,
      labels,
      description: typeof raw.description === "string" ? raw.description : null,
      previewUrl: typeof raw.preview_url === "string" ? raw.preview_url : null,
    };
  }

  async listVoices(): Promise<ElevenLabsVoice[]> {
    const response = await this.elevenLabsFetch("/v1/voices?page_size=100");
    const data = (await response.json()) as { voices?: Record<string, unknown>[] };
    return (data.voices ?? []).map((raw) => this.normalizeVoice(raw));
  }

  // ─── Speech-to-text (Scribe) ─────────────────────────────────────────────

  async transcribeAudio(params: TranscribeParams): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", params.file, "audio.webm");
    form.append("model_id", params.modelId);
    if (params.languageCode) form.append("language_code", params.languageCode);
    form.append("diarize", "false");

    const response = await this.elevenLabsFetch("/v1/speech-to-text", {
      method: "POST",
      body: form,
      // Long audio legitimately needs more headroom than JSON calls.
      timeoutMs: Math.max(this.timeoutMs, 90_000),
    });

    const data = (await response.json()) as Record<string, unknown>;
    const languageProbe = data.language_code ?? data.language;
    return {
      text: String(data.text ?? ""),
      languageCode: typeof languageProbe === "string" ? languageProbe : null,
      durationSeconds:
        data.info && typeof data.info === "object"
          ? Number((data.info as Record<string, unknown>).audio_seconds ?? 0) || null
          : null,
    };
  }

  // ─── Text-to-speech ──────────────────────────────────────────────────────

  async speak(params: SpeakParams): Promise<Response> {
    // Streaming PCM/MP3 response — returned raw so the route handler can pipe
    // it through without buffering the whole clip in memory.
    return this.elevenLabsFetch(
      `/v1/text-to-speech/${encodeURIComponent(params.voiceId)}?output_format=${encodeURIComponent(params.outputFormat)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: params.text,
          model_id: params.modelId,
          ...(params.languageCode ? { language_code: params.languageCode } : {}),
          voice_settings: {
            ...(params.stability != null ? { stability: params.stability } : {}),
            ...(params.similarityBoost != null ? { similarity_boost: params.similarityBoost } : {}),
            ...(params.style != null ? { style: params.style } : {}),
            ...(params.speed != null ? { speed: params.speed } : {}),
            ...(params.speakerBoost != null ? { use_speaker_boost: params.speakerBoost } : {}),
          },
        }),
      },
    );
  }

  // ─── Identity ────────────────────────────────────────────────────────────

  getProviderName(): VoiceProvider {
    return "elevenlabs";
  }
}
