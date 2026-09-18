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
  ConversationalAgentCreateParams,
  ConversationalAgentRecord,
  ConversationalAgentUpdateParams,
  ConversationHistoryItem,
  ConversationListParams,
  ElevenLabsSubscriptionInfo,
  ElevenLabsVoice,
  SignedAgentSession,
  SpeakParams,
  TranscribeParams,
  TranscribeResult,
  VoiceCloneParams,
  VoiceCloneResult,
  VoiceDesignParams,
  VoiceDesignResult,
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

/** Signed-URL TTL requested from the vendor (V4 agent sessions). */
const AGENT_SIGNED_URL_TTL_SEC = 60;

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

  // ─── Mode B: Conversational AI agents (V4) ───────────────────────────────

  private normalizeAgent(raw: Record<string, unknown>): ConversationalAgentRecord {
    const config = (raw.conversation_config ?? {}) as Record<string, unknown>;
    const tts = (config.tts ?? {}) as Record<string, unknown>;
    const agent = (config.agent ?? {}) as Record<string, unknown>;
    const prompt = (agent.prompt ?? {}) as Record<string, unknown>;
    const firstMessage = (prompt.first_message ?? {}) as Record<string, unknown>;
    const language = (agent.language ?? config.language) as unknown;
    return {
      agentId: String(raw.agent_id ?? ""),
      name: String(raw.name ?? "Unnamed agent"),
      voiceId: typeof tts.voice_id === "string" ? tts.voice_id : null,
      language: typeof language === "string" ? language : null,
      firstMessage: typeof firstMessage.text === "string" ? firstMessage.text : null,
      systemPrompt: typeof prompt.system_prompt === "string" ? prompt.system_prompt : null,
      raw,
    };
  }

  async listConversationalAgents(): Promise<ConversationalAgentRecord[]> {
    const response = await this.elevenLabsFetch("/v1/convai/agents?page_size=100");
    const data = (await response.json()) as { agents?: Record<string, unknown>[] };
    return (data.agents ?? []).map((raw) => this.normalizeAgent(raw));
  }

  async createConversationalAgent(
    params: ConversationalAgentCreateParams,
  ): Promise<ConversationalAgentRecord> {
    // The rag server-tool: every tool call is HMAC-signed with the shared
    // secret and carries the tenant ids the callback re-validates.
    const body = {
      name: params.name,
      conversation_config: {
        tts: { voice_id: params.voiceId },
        ...(params.language ? { language: params.language } : {}),
        agent: {
          prompt: {
            ...(params.systemPrompt ? { system_prompt: params.systemPrompt } : {}),
            ...(params.firstMessage ? { first_message: { text: params.firstMessage } } : {}),
          },
        },
        ...(params.twilio
          ? {
              twilio: {
                phone_numbers: params.twilio.phoneNumbers,
                attach_phone_numbers: params.twilio.attachPhoneNumbers ?? false,
              },
            }
          : {}),
      },
      tools: [
        {
          type_name: "webhook",
          name: "clara_rag_search",
          description:
            "Searches the organisation's Clara knowledge base and returns grounded answer snippets.",
          url: params.ragTool.url,
          method: "POST",
          // Vendor API accepts config passthrough for auth material.
          config: {
            secret: params.ragTool.secret,
            orgId: params.ragTool.orgId,
            agentId: params.ragTool.agentId ?? null,
            kbId: params.ragTool.kbId,
          },
        },
      ],
    };
    const response = await this.elevenLabsFetch("/v1/convai/agents/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return this.normalizeAgent(data);
  }

  async updateConversationalAgent(
    agentId: string,
    params: ConversationalAgentUpdateParams,
  ): Promise<ConversationalAgentRecord> {
    const conversationConfig: Record<string, unknown> = {};
    if (params.voiceId != null) conversationConfig.tts = { voice_id: params.voiceId };
    if (params.language != null) conversationConfig.language = params.language;
    if (params.systemPrompt !== undefined || params.firstMessage !== undefined) {
      const prompt: Record<string, unknown> = {};
      if (params.systemPrompt !== undefined) prompt.system_prompt = params.systemPrompt;
      if (params.firstMessage !== undefined) prompt.first_message = { text: params.firstMessage };
      conversationConfig.agent = { prompt };
    }
    if (params.twilio) {
      conversationConfig.twilio = {
        phone_numbers: params.twilio.phoneNumbers,
        attach_phone_numbers: params.twilio.attachPhoneNumbers ?? false,
      };
    }
    const body: Record<string, unknown> = {};
    if (params.name != null) body.name = params.name;
    if (Object.keys(conversationConfig).length > 0) body.conversation_config = conversationConfig;

    const response = await this.elevenLabsFetch(
      `/v1/convai/agents/${encodeURIComponent(agentId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await response.json()) as Record<string, unknown>;
    return this.normalizeAgent(data);
  }

  async deleteConversationalAgent(agentId: string): Promise<void> {
    await this.elevenLabsFetch(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "DELETE",
    });
  }

  async getAgentSignedUrl(agentId: string): Promise<SignedAgentSession> {
    const response = await this.elevenLabsFetch(
      `/v1/convai/agents/${encodeURIComponent(agentId)}/get-signed-url?expiry_seconds=${AGENT_SIGNED_URL_TTL_SEC}`,
    );
    const data = (await response.json()) as Record<string, unknown>;
    const signedUrl = typeof data.signed_url === "string" ? data.signed_url : "";
    if (!signedUrl) {
      throw new ElevenLabsError("Signed URL was not returned by the vendor.", 502);
    }
    return {
      signedUrl,
      agentId,
      expiresAt: Date.now() + AGENT_SIGNED_URL_TTL_SEC * 1000,
    };
  }

  // ─── Mode B: conversation history (V5) ───────────────────────────────────

  async listConversations(
    params?: ConversationListParams,
  ): Promise<ConversationHistoryItem[]> {
    const search = new URLSearchParams({ page_size: String(params?.pageSize ?? 50) });
    if (params?.agentId) search.set("agent_id", params.agentId);
    const response = await this.elevenLabsFetch(`/v1/convai/conversations?${search.toString()}`);
    const data = (await response.json()) as { conversations?: Record<string, unknown>[] };
    return (data.conversations ?? []).map((raw) => ({
      conversationId: String(raw.conversation_id ?? ""),
      agentId: typeof raw.agent_id === "string" ? raw.agent_id : null,
      status: typeof raw.status === "string" ? raw.status : null,
      startedAtUnix:
        typeof raw.started_at === "number" ? raw.started_at
          : typeof raw.started_at === "string" && !Number.isNaN(Date.parse(raw.started_at))
            ? Math.floor(Date.parse(raw.started_at) / 1000)
            : null,
      endedAtUnix:
        typeof raw.ended_at === "number" ? raw.ended_at
          : typeof raw.ended_at === "string" && !Number.isNaN(Date.parse(raw.ended_at))
            ? Math.floor(Date.parse(raw.ended_at) / 1000)
            : null,
      raw,
    }));
  }

  // ─── Voice cloning / design (V5) ─────────────────────────────────────────

  async cloneVoice(params: VoiceCloneParams): Promise<VoiceCloneResult> {
    if (params.files.length === 0) {
      throw new ElevenLabsError("At least one consented reference audio file is required.", 400);
    }
    const form = new FormData();
    form.append("name", params.name);
    if (params.description) form.append("description", params.description);
    for (const file of params.files) form.append("files", file.blob, file.filename);
    for (const [key, value] of Object.entries(params.labels ?? {})) {
      form.append("labels", JSON.stringify({ [key]: value }));
    }

    const response = await this.elevenLabsFetch("/v1/voices/add", {
      method: "POST",
      body: form,
      timeoutMs: Math.max(this.timeoutMs, 120_000),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const voiceId = typeof data.voice_id === "string" ? data.voice_id : "";
    if (!voiceId) {
      throw new ElevenLabsError("Cloning response did not include a voice id.", 502);
    }
    return {
      voiceId,
      requiresVerification: Boolean(data.requires_verification ?? false),
    };
  }

  async designVoice(params: VoiceDesignParams): Promise<VoiceDesignResult> {
    const response = await this.elevenLabsFetch("/v1/text-to-voice/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        text_description: params.textPrompt,
        ...(params.options ?? {}),
      }),
      // Design samples take longer than plain TTS calls.
      timeoutMs: Math.max(this.timeoutMs, 120_000),
    });
    const data = (await response.json()) as Record<string, unknown>;
    // Both response shapes are handled: the documented legacy {media_ids}
    // and the newer per-request {voice_id, samples}.
    const voiceId = typeof data.voice_id === "string" ? data.voice_id : "";
    if (!voiceId) {
      throw new ElevenLabsError("Voice Design response did not include a voice id.", 502);
    }
    const mediaIds = Array.isArray(data.media_ids)
      ? data.media_ids.filter((id): id is string => typeof id === "string")
      : [];
    return { voiceId, sampleMediaIds: mediaIds };
  }

  async deleteVoice(voiceId: string): Promise<void> {
    await this.elevenLabsFetch(`/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
    });
  }
}
