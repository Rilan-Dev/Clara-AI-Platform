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
  documentOverview?: string;
  voiceGreeting?: string;
  language?: LanguagePreferences;
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
