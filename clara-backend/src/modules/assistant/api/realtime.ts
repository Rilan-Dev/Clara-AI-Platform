/**
 * src/modules/assistant/api/realtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates an ephemeral OpenAI Realtime session.
 *
 * Phase 1 update: when a kbId is provided in the request body, the session is
 * configured from the knowledge base's AssistantConfig row (DB). When no kbId
 * is provided (legacy flow), the old env-var defaults are used so existing
 * integrations continue to work without any changes.
 *
 * Request body (all optional):
 *   kbId      – knowledge base ID → loads AssistantConfig from DB
 *   language  – BCP-47 assistant language (overridden by config when kbId set)
 *   languages – array of customer BCP-47 languages
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveLanguagePreferences } from "@/modules/assistant/core/config";
import { ensureMigrated } from "@/lib/db/migrate";
import { getAssistantConfig } from "@/modules/knowledge-bases/core/db";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  buildSystemPrompt,
  buildLanguageGuidanceFromConfig,
} from "@/modules/knowledge-bases/core/config-builder";

// ── Legacy / fallback constants (used when no kbId is supplied) ───────────────

const VOICE_MAX_RESPONSE_TOKENS = Number(
  process.env.OPENAI_REALTIME_MAX_TOKENS ?? 500
);

const VOICE_VAD = {
  type: "server_vad",
  threshold:         Number(process.env.OPENAI_REALTIME_VAD_THRESHOLD ?? 0.5),
  prefix_padding_ms: Number(process.env.OPENAI_REALTIME_VAD_PREFIX_MS  ?? 300),
  silence_duration_ms: Number(process.env.OPENAI_REALTIME_VAD_SILENCE_MS ?? 700),
  /**
   * FIX V1+V2+V3: create_response:false prevents the VAD auto-trigger from
   * racing with the client's performRagAndRespond() path. See original fix notes.
   */
  create_response: false,
} as const;

const TRANSCRIPTION_MODEL =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe";

// ── Main handler ──────────────────────────────────────────────────────────────

export async function postRealtimeSession(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set on server" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : null;

    // ── Resolve configuration ─────────────────────────────────────────────────
    let instructions: string;
    let voice: string;
    let temperature: number;
    let maxTokens: number;
    let transcriptionLanguage: string;
    let toolDescription: string;

    if (kbId) {
      // ── KB-aware path: load config from DB ────────────────────────────────
      await ensureMigrated();

      const kb = await getKnowledgeBaseById(kbId);
      if (!kb) {
        return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      }

      const config = await getAssistantConfig(kbId);
      if (!config) {
        return NextResponse.json(
          { error: "AssistantConfig not found for this knowledge base" },
          { status: 500 }
        );
      }

      // Build the full system prompt from AssistantConfig
      instructions = buildSystemPrompt(config, {
        kbName: kb.name,
        // documentCount / documentTitles will be added in Phase 2 once
        // the documents table exists; for now the prompt references the KB name.
      });

      voice        = config.voiceId;
      temperature  = config.temperature;
      maxTokens    = config.maxTokens;
      transcriptionLanguage = config.alwaysRespondIn ?? config.defaultLanguage;

      // Tool description reflects the actual KB, not the legacy insurance copy
      toolDescription =
        `Retrieve relevant snippets from the "${kb.name}" knowledge base. ` +
        `Call this whenever the user asks a question that requires specific ` +
        `information from the documents.`;
    } else {
      // ── Legacy path: env-var defaults (backward compatible) ───────────────
      const languagePreferences = resolveLanguagePreferences({
        assistant: typeof body?.language  === "string" ? body.language  : undefined,
        customer:  Array.isArray(body?.languages)      ? body.languages as string[] : undefined,
      });

      instructions =
        process.env.OPENAI_REALTIME_INSTRUCTIONS ??
        "You are Clara, a voice-first RAG assistant. " +
        "Answer ONLY using the context provided by the system or rag_search outputs. " +
        "If you have insufficient information, say so briefly. " +
        "Be concise, warm, and professionally supportive.";

      voice        = process.env.OPENAI_REALTIME_VOICE ?? "alloy";
      temperature  = Number(process.env.OPENAI_REALTIME_TEMPERATURE ?? 0.8);
      maxTokens    = VOICE_MAX_RESPONSE_TOKENS;
      transcriptionLanguage = languagePreferences.assistant;

      toolDescription =
        "Retrieve relevant snippets from the active insurance policy document. " +
        "Call this whenever the user asks about coverage details, exclusions, " +
        "claims, premiums, renewals, or any other policy-specific information.";
    }

    const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-mini-realtime-preview";

    const tools = [
      {
        type: "function",
        name: "rag_search",
        description: toolDescription,
        parameters: {
          type: "object",
          properties: {
            query:      { type: "string", description: "The user's question in natural language." },
            documentId: { type: "string", description: "The ID of the document to search (or knowledge base ID)." },
          },
          required: ["query", "documentId"],
        },
      },
    ];

    // ── Call OpenAI Realtime sessions API ─────────────────────────────────────
    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta":  "realtime=v1",
      },
      body: JSON.stringify({
        model,
        voice,
        modalities:                 ["audio", "text"],
        instructions,
        tools,
        tool_choice:                "auto",
        temperature,
        max_response_output_tokens: maxTokens,
        turn_detection:             VOICE_VAD,
        input_audio_transcription: {
          model:    TRANSCRIPTION_MODEL,
          language: transcriptionLanguage,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text || "Failed to create OpenAI Realtime session" },
        { status: 500 }
      );
    }

    const session = await res.json();

    // Attach kbId to the session response so the client hook can pass it back
    // in subsequent API calls (rag/search, etc.) without additional state.
    return NextResponse.json({ ...session, kbId: kbId ?? null });
  } catch (error) {
    console.error("[realtime] postRealtimeSession:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
