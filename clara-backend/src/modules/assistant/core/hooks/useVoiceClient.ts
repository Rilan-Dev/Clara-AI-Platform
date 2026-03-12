"use client";

import { useCallback, useState } from "react";
import { useOpenAIRealtime } from "./useOpenAIRealtime";
import { useGeminiLive } from "./useGeminiLive";
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

type RuntimeProvider = "openai" | "gemini";

type VoiceProviderResponse = {
  provider: RuntimeProvider;
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
 * ARCHITECTURE FIX (was: routing OpenAI through OpenAIVoiceAdapter — a
 * placeholder class that used the old broken event names and bypassed all
 * Phase 3 fixes applied to useOpenAIRealtime):
 *
 *   Old path:  VoiceChatModal → useVoiceClient → OpenAIVoiceAdapter (broken)
 *   New path:  VoiceChatModal → useVoiceClient → useOpenAIRealtime (fully fixed)
 *                                               → useGeminiLive     (fully fixed)
 *
 * Both hooks are ALWAYS called unconditionally (React rules of hooks: hooks may
 * not be called inside conditions or loops).  Only the active provider's state
 * and actions are forwarded to the caller; the inactive hook stays in "idle"
 * state and neither connects nor allocates resources until its connect() is
 * explicitly called.
 *
 * FIXES applied in this file:
 *
 *   Bug 1 (Critical): The old return value exposed `remoteStream` but
 *   VoiceChatModal's VoiceSessionState type expected `remoteAudioStream`.
 *   This caused a TypeScript compile error and meant remoteAudioStream was
 *   always undefined in GeminiVoiceModal's shell.  Renamed to remoteAudioStream.
 *
 *   Bug 2 (Critical): sendText was a permanent no-op with a TODO comment,
 *   making the suggested-prompt buttons permanently disabled.  Now delegates
 *   to active.sendText() which is implemented in both useOpenAIRealtime and
 *   useGeminiLive.
 *
 *   Bug 4 (Visual): outputAnalyserNode is forwarded from the active hook so
 *   VoiceChatModal can pass it to useAudioVisualizer for real Gemini output
 *   level display instead of the fake static sine-wave animation.
 */
export function useVoiceClient(options: VoiceClientOptions) {
  const [provider, setProvider] = useState<RuntimeProvider>(
    ACTIVE_PROVIDER === "gemini" ? "gemini" : "openai",
  );

  const sharedOpts = {
    documentId:       options.documentId,
    kbId:             options.kbId,
    documentOverview: options.documentOverview,
    voiceGreeting:    options.voiceGreeting,
    language:         options.language,
  };

  // Always called — React rules require unconditional hook calls.
  const openai  = useOpenAIRealtime(sharedOpts);
  const gemini  = useGeminiLive(sharedOpts);

  const isGemini = provider === "gemini";
  const active   = isGemini ? gemini : openai;

  const resolveProvider = useCallback(async (): Promise<RuntimeProvider> => {
    if (!options.kbId) {
      return ACTIVE_PROVIDER === "gemini" ? "gemini" : "openai";
    }

    const res = await fetch(apiUrl("/api/voice/provider"), {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
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

    return payload.provider === "gemini" ? "gemini" : "openai";
  }, [options.kbId]);

  const connect = useCallback(async () => {
    const nextProvider = await resolveProvider();
    setProvider(nextProvider);
    if (nextProvider === "gemini") {
      await gemini.connect();
      return;
    }
    await openai.connect();
  }, [gemini, openai, resolveProvider]);

  const disconnect = useCallback(() => {
    if (provider === "gemini") {
      gemini.disconnect();
      return;
    }
    openai.disconnect();
  }, [gemini, openai, provider]);

  const interrupt = useCallback(() => {
    if (provider === "gemini") {
      gemini.interrupt();
      return;
    }
    openai.interrupt();
  }, [gemini, openai, provider]);

  // FIX Bug 2: Delegate to the active hook's sendText implementation instead
  // of the old permanent no-op. Both useOpenAIRealtime and useGeminiLive now
  // expose a fully implemented sendText method.
  const sendText = useCallback((text: string) => {
    if (provider === "gemini") {
      gemini.sendText(text);
      return;
    }
    openai.sendText(text);
  }, [gemini, openai, provider]);

  return {
    provider,
    status:             active.status,
    error:              active.error,
    isSpeaking:         active.isSpeaking,
    history:            active.history,
    // FIX Bug 1: was `remoteStream` — renamed to `remoteAudioStream` to match
    // the VoiceSessionState type in VoiceChatModal and the return shape of
    // useOpenAIRealtime.  Was causing a TypeScript compile error and undefined
    // remoteAudioStream in the GeminiVoiceModal shell.
    remoteAudioStream:  active.remoteAudioStream,
    connect,
    disconnect,
    interrupt,
    sendText,
    // FIX Bug 4: forward the playback AnalyserNode (non-null only for Gemini).
    // VoiceChatModal uses this to feed real audio levels to useAudioVisualizer.
    outputAnalyserNode: active.outputAnalyserNode,
  } as const;
}
