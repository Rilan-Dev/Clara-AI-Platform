/**
 * src/features/agent-conversation/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared types for the agent conversation surfaces — the authenticated DRAFT
 * preview (/preview/agents/:agentId) and the public PUBLISHED page
 * (/agents/:agentId). Both surfaces reuse the same chat window, voice stage
 * and realtime orb components; only the transport (endpoints + credentials)
 * and the configuration source (draft vs published) differ.
 */

import type { useVoiceClient } from "@/modules/assistant/core/hooks/useVoiceClient";

/** Citation shown under an assistant answer. */
export type ChatSource = {
  title: string;
  snippet: string;
  index: number;
};

/** A turn in the combined text/voice conversation. */
export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  /** Marks messages that originated from a realtime voice session. */
  origin?: "text" | "voice";
};

/** The provider-agnostic voice session returned by useVoiceClient. */
export type VoiceClientSession = ReturnType<typeof useVoiceClient>;

/** Voice availability resolved for the surface (provider lookup). */
export type VoiceAvailability = {
  provider: string;
  voiceProvider?: string;
  mode?: string;
  voiceEnabled: boolean;
  realtimeEnabled: boolean;
  error?: string;
};
