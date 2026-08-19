/**
 * src/modules/assistant/api/realtime.ts
 * Creates an ephemeral OpenAI Realtime session.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveLanguagePreferences } from "@/modules/assistant/core/config";
import { ensureMigrated } from "@/lib/db/migrate";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { isSupportedOpenAIRealtimeVoice } from "./openai-catalog";
import { buildOpenAIRealtimeSession, createOpenAIRealtimeClientSecret } from "./openai-realtime";

const VOICE_MAX_RESPONSE_TOKENS = Number(process.env.OPENAI_REALTIME_MAX_TOKENS ?? 500);
const VOICE_VAD = {
  type: "server_vad",
  threshold: Number(process.env.OPENAI_REALTIME_VAD_THRESHOLD ?? 0.5),
  prefix_padding_ms: Number(process.env.OPENAI_REALTIME_VAD_PREFIX_MS ?? 300),
  silence_duration_ms: Number(process.env.OPENAI_REALTIME_VAD_SILENCE_MS ?? 700),
  create_response: false,
} as const;
const TRANSCRIPTION_MODEL = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";
const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini";
const DEFAULT_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";

export async function postRealtimeSession(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;
    const requestedRagMode = typeof body?.ragMode === "string" ? body.ragMode : "hybrid";

    let instructions: string;
    let voice: string;
    let maxTokens: number;
    let transcriptionModel: string;
    let transcriptionLanguage: string;
    let toolDescription: string;
    let model: string;

    if (kbId) {
      await ensureMigrated();
      const kb = await getKnowledgeBaseById(kbId);
      if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      const config = await getAssistantConfig(kbId);
      if (!config) return NextResponse.json({ error: "AssistantConfig not found for this knowledge base" }, { status: 500 });

      const resolved = await resolveAIConfig({ kbId, surface: "realtime" });
      if (resolved.provider !== "openai") {
        return NextResponse.json({ error: "Resolved voice provider is Gemini for this knowledge base.", provider: resolved.provider }, { status: 409 });
      }

      instructions = buildSystemPrompt(config, { kbName: kb.name });
      voice = resolved.voiceId ?? config.voiceId ?? DEFAULT_REALTIME_VOICE;
      if (!isSupportedOpenAIRealtimeVoice(voice)) {
        return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400 });
      }
      maxTokens = resolved.maxTokens ?? config.maxTokens;
      transcriptionModel = resolved.transcriptionModel ?? TRANSCRIPTION_MODEL;
      transcriptionLanguage = config.alwaysRespondIn ?? config.defaultLanguage;
      model = resolved.realtimeModel ?? DEFAULT_REALTIME_MODEL;
      toolDescription = `Retrieve grounded evidence from the "${kb.name}" knowledge base. Use kbId for KB-wide search, documentId only when the user explicitly scopes to one document, and pass ragMode=${requestedRagMode} so the server can use classic, hybrid, or agentic retrieval.`;
    } else {
      const languagePreferences = resolveLanguagePreferences({
        assistant: typeof body?.language === "string" ? body.language : undefined,
        customer: Array.isArray(body?.languages) ? body.languages as string[] : undefined,
      });
      instructions = process.env.OPENAI_REALTIME_INSTRUCTIONS ?? "You are Clara, a voice-first RAG assistant. Answer ONLY using the context provided by the system or rag_search outputs. If you have insufficient information, say so briefly. Be concise, warm, and professionally supportive.";
      voice = process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE;
      if (!isSupportedOpenAIRealtimeVoice(voice)) return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400 });
      maxTokens = VOICE_MAX_RESPONSE_TOKENS;
      transcriptionModel = TRANSCRIPTION_MODEL;
      transcriptionLanguage = languagePreferences.assistant;
      model = DEFAULT_REALTIME_MODEL;
      toolDescription = "Retrieve relevant snippets from the active insurance policy document. Call this whenever the user asks about coverage details, exclusions, claims, premiums, renewals, or any other policy-specific information.";
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not set on server" }, { status: 500 });

    const tools = [{
      type: "function" as const,
      name: "rag_search",
      description: toolDescription,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The user's question in natural language." },
          kbId: { type: "string", description: "Knowledge base identifier for KB-wide retrieval." },
          documentId: { type: "string", description: "Optional document identifier when search should be restricted to a single document." },
          ragMode: { type: "string", enum: ["classic", "hybrid", "agentic"], description: "Retrieval mode to request from the server." },
        },
        required: ["query"],
      },
    }];

    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      tools,
      toolChoice: "auto",
      maxOutputTokens: maxTokens,
      turnDetection: VOICE_VAD,
      transcription: { model: transcriptionModel, language: transcriptionLanguage },
    });

    const result = await createOpenAIRealtimeClientSecret({ apiKey, session: realtimeSession });
    if (!result.ok) return NextResponse.json({ error: result.errorText || "Failed to create OpenAI Realtime session" }, { status: 500 });

    return NextResponse.json({
      ...result.data,
      model,
      voice,
      turn_detection: VOICE_VAD,
      input_audio_transcription: { model: transcriptionModel, language: transcriptionLanguage },
      kbId: kbId ?? null,
      provider: "openai",
      ragMode: requestedRagMode,
    });
  } catch (error) {
    console.error("[realtime] postRealtimeSession:", error);
    if (error instanceof AIConfigResolutionError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
