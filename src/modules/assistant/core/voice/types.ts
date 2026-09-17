import { Source } from "../models";
import { LanguagePreferences } from "../config";

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";
export type TurnStatus = "pending" | "speaking" | "done";

export type VoiceTurn = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  status: TurnStatus;
};

export type VoiceClientOptions = {
  documentId?: string | null;
  kbId?: string | null;
  documentOverview?: string;
  voiceGreeting?: string;
  language?: LanguagePreferences;
  /**
   * Public embed API key (real `clr_...` value — never a bypass token). When
   * present, the underlying session/RAG requests route to the public
   * /api/embed/* endpoints with this key instead of the protected endpoints
   * + platform JWT. Used only by the public embed voice widget.
   */
  embedApiKey?: string;
  onStatusChange?: (status: VoiceStatus) => void;
  onError?: (error: string | null) => void;
  onHistoryChange?: (history: VoiceTurn[]) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onRemoteStreamChange?: (stream: MediaStream | null) => void;
};

export interface VoiceAdapter {
  connect(options: VoiceClientOptions): Promise<void>;
  disconnect(): void;
  interrupt(): void;
  sendText(text: string): void;
}
