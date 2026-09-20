"use client";

import { useCallback, useState } from "react";
import { useOpenAIRealtime } from "./useOpenAIRealtime";
import { useGeminiLive } from "./useGeminiLive";
import { useElevenLabsVoice } from "./useElevenLabsVoice";
import { useElevenLabsConvAI } from "./useElevenLabsConvAI";
import { useElevenLabsClaraStream } from "./useElevenLabsClaraStream";
import { useSarvamVoice } from "./useSarvamVoice";
import type { VoiceClientOptions } from "../voice/types";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ─── Provider routing ─────────────────────────────────────────────────────────
//
// NEXT_PUBLIC_AI_PROVIDER is appropriate here: it is the provider *name*
// ("openai" or "gemini"), not an API key or secret.  Knowing which provider
// is active is not a security concern.  We use a separate server-side
// AI_PROVIDER env var in factory.ts for server-only code.
const ACTIVE_PROVIDER =
  (process.env.NEXT_PUBLIC_AI_PROVIDER ?? "openai").toLowerCase();

type RuntimeProvider = "openai" | "gemini" | "elevenlabs" | "sarvam";

type VoiceProviderResponse = {
  provider: RuntimeProvider;
  voiceProvider?: RuntimeProvider;
  /** ElevenLabs mode split: "pipeline" (A) | "conversational" (B) | "clara-stream" (C). */
  mode?: "pipeline" | "conversational" | "clara-stream";
  flags?: {
    voiceEnabled?: boolean;
    realtimeEnabled?: boolean;
  };
  error?: string;
};

/**
 * useVoiceClient
 *
 * Provider-agnostic voice hook consumed by VoiceChatModal.
 *
 *   Old path:  VoiceChatModal → useVoiceClient → OpenAIVoiceAdapter (broken)
 *   New path:  VoiceChatModal → useVoiceClient → useOpenAIRealtime (fully fixed)
 *                                               → useGeminiLive     (fully fixed)
 *                                               → useElevenLabsVoice (Mode A pipeline)
 *                                               → useElevenLabsConvAI (Mode B realtime)
 *
 * All five hooks are ALWAYS called unconditionally (React rules of hooks).
 * Only the active provider's state and actions are forwarded; the inactive
 * hooks stay in "idle" state and neither connect nor allocate resources
 * until their connect() is explicitly called.
 *
 * Voice-provider routing (ElevenLabs / Sarvam integrations): the server may
 * resolve a VOICE provider that differs from the brain provider. When the
 * response carries `voiceProvider`, that wins for the voice surface; the
 * legacy `provider` field remains the fallback for older payloads. Within
 * the elevenlabs branch, `mode` selects the pipeline (Mode A) or the
 * Conversational AI realtime session (Mode B). The sarvam branch is always
 * Mode A (pipeline — optionally with the V5 realtime STT relay inside the
 * hook).
 */
export function useVoiceClient(options: VoiceClientOptions) {
  const [provider, setProvider] = useState<RuntimeProvider>(
    ACTIVE_PROVIDER === "gemini" ? "gemini" : "openai",
  );
  const [elevenlabsMode, setElevenlabsMode] = useState<
    "pipeline" | "conversational" | "clara-stream"
  >("pipeline");

  const sharedOpts = {
    documentId:       options.documentId,
    kbId:             options.kbId,
    documentOverview: options.documentOverview,
    voiceGreeting:    options.voiceGreeting,
    language:         options.language,
    embedApiKey:      options.embedApiKey,
  };

  // Always called — React rules require unconditional hook calls.
  const openai      = useOpenAIRealtime(sharedOpts);
  const gemini      = useGeminiLive(sharedOpts);
  const elevenlabs  = useElevenLabsVoice(sharedOpts);
  const elevenlabsConvAI = useElevenLabsConvAI(sharedOpts);
  const elevenlabsClaraStream = useElevenLabsClaraStream(sharedOpts);
  const sarvam      = useSarvamVoice(sharedOpts);

  const active =
    provider === "elevenlabs"
      ? elevenlabsMode === "conversational"
        ? elevenlabsConvAI
        : elevenlabsMode === "clara-stream"
          ? elevenlabsClaraStream
          : elevenlabs
      : provider === "sarvam"
        ? sarvam
        : provider === "gemini" ? gemini : openai;

  const resolveProvider = useCallback(async (): Promise<{
    provider: RuntimeProvider;
    mode: "pipeline" | "conversational" | "clara-stream";
  }> => {
    if (!options.kbId) {
      return {
        provider: ACTIVE_PROVIDER === "gemini" ? "gemini" : "openai",
        mode: "pipeline" as const,
      };
    }

    const endpoint = options.embedApiKey ? "/api/embed/session" : "/api/voice/provider";
    const headers = options.embedApiKey
      ? { "Content-Type": "application/json", Authorization: `Bearer ${options.embedApiKey}` }
      : withAuthHeaders({ "Content-Type": "application/json" });

    const res = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({ kbId: options.kbId }),
    });

    const payload = (await res.json().catch(() => ({}))) as VoiceProviderResponse;
    if (!res.ok) {
      throw new Error(payload.error ?? `Voice provider lookup failed: HTTP ${res.status}`);
    }

    if (payload.flags?.voiceEnabled === false) {
      throw new Error("Voice is disabled for this knowledge base.");
    }
    if (payload.flags?.realtimeEnabled === false) {
      throw new Error("Realtime is disabled for this organisation.");
    }

    // Voice-provider axis first (ElevenLabs / Sarvam), legacy brain provider
    // second.
    const resolved = payload.voiceProvider ?? payload.provider;
    if (resolved === "elevenlabs") {
      // Tri-mode split (plan Task 6.1): Mode B realtime only for platform
      // sessions — embed API keys never resolve a conversational mode (the
      // server refuses them too); Mode C (clara-stream) is flag-gated
      // server-side and allowed for embed sessions (the relay token is
      // capability-scoped, never a vendor credential).
      const mode: "pipeline" | "conversational" | "clara-stream" =
        payload.mode === "conversational" && !options.embedApiKey
          ? "conversational"
          : payload.mode === "clara-stream"
            ? "clara-stream"
            : "pipeline";
      setElevenlabsMode(mode);
      return { provider: "elevenlabs" as const, mode };
    }
    if (resolved === "sarvam") {
      // Sarvam is pipeline-only (no Mode B — Samvaad is a hosted no-code
      // platform, not an embeddable runtime). The V5 realtime STT relay is
      // negotiated INSIDE useSarvamVoice via the session payload.
      const mode = "pipeline" as const;
      return { provider: "sarvam" as const, mode };
    }
    const mode = "pipeline" as const;
    return { provider: resolved === "gemini" ? ("gemini" as const) : ("openai" as const), mode };
  }, [options.kbId, options.embedApiKey]);

  const connect = useCallback(async () => {
    const next = await resolveProvider();
    setProvider(next.provider);
    if (next.provider === "elevenlabs") {
      // Mode B realtime session; falls back to the Mode A pipeline when the
      // agent-session route refuses (flag off / no binding / no ack).
      if (next.mode === "conversational") {
        try {
          await elevenlabsConvAI.connect();
          return;
        } catch (err) {
          console.warn("[voice] Mode-B session refused, falling back to the hybrid pipeline:", (err as Error).message);
          setElevenlabsMode("pipeline");
        }
      }
      // Mode C Clara realtime; falls back to the Mode A pipeline when the
      // session bootstrap refuses (flag raced off / no realtime descriptor).
      if (next.mode === "clara-stream") {
        try {
          await elevenlabsClaraStream.connect();
          return;
        } catch (err) {
          console.warn("[voice] Mode-C session refused, falling back to the hybrid pipeline:", (err as Error).message);
          setElevenlabsMode("pipeline");
        }
      }
      await elevenlabs.connect();
      return;
    }
    if (next.provider === "sarvam") {
      await sarvam.connect();
      return;
    }
    if (next.provider === "gemini") {
      await gemini.connect();
      return;
    }
    await openai.connect();
  }, [elevenlabs, elevenlabsClaraStream, elevenlabsConvAI, gemini, openai, resolveProvider, sarvam]);

  const disconnect = useCallback(() => {
    if (provider === "elevenlabs") {
      if (elevenlabsMode === "conversational") elevenlabsConvAI.disconnect();
      else if (elevenlabsMode === "clara-stream") elevenlabsClaraStream.disconnect();
      else elevenlabs.disconnect();
      return;
    }
    if (provider === "sarvam") {
      sarvam.disconnect();
      return;
    }
    if (provider === "gemini") {
      gemini.disconnect();
      return;
    }
    openai.disconnect();
  }, [elevenlabs, elevenlabsClaraStream, elevenlabsConvAI, elevenlabsMode, gemini, openai, provider, sarvam]);

  const interrupt = useCallback(() => {
    if (provider === "elevenlabs") {
      if (elevenlabsMode === "conversational") elevenlabsConvAI.interrupt();
      else if (elevenlabsMode === "clara-stream") elevenlabsClaraStream.interrupt();
      else elevenlabs.interrupt();
      return;
    }
    if (provider === "sarvam") {
      sarvam.interrupt();
      return;
    }
    if (provider === "gemini") {
      gemini.interrupt();
      return;
    }
    openai.interrupt();
  }, [elevenlabs, elevenlabsClaraStream, elevenlabsConvAI, elevenlabsMode, gemini, openai, provider, sarvam]);

  const sendText = useCallback((text: string) => {
    if (provider === "elevenlabs") {
      if (elevenlabsMode === "conversational") elevenlabsConvAI.sendText(text);
      else if (elevenlabsMode === "clara-stream") elevenlabsClaraStream.sendText(text);
      else elevenlabs.sendText(text);
      return;
    }
    if (provider === "sarvam") {
      sarvam.sendText(text);
      return;
    }
    if (provider === "gemini") {
      gemini.sendText(text);
      return;
    }
    openai.sendText(text);
  }, [elevenlabs, elevenlabsClaraStream, elevenlabsConvAI, elevenlabsMode, gemini, openai, provider, sarvam]);

  return {
    provider,
    status:             active.status,
    error:              active.error,
    isSpeaking:         active.isSpeaking,
    history:            active.history,
    remoteAudioStream:  active.remoteAudioStream,
    connect,
    disconnect,
    interrupt,
    sendText,
    // Playback AnalyserNode — real output levels for useAudioVisualizer.
    outputAnalyserNode: active.outputAnalyserNode,
  } as const;
}
