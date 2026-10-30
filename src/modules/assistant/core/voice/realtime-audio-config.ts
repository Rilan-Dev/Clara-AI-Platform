export type RealtimeAudioPolicy = {
  vadThreshold: number;
  prefixPaddingMs: number;
  silenceDurationMs: number;
  ragDebounceMs: number;
  minQueryLength: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
};

const numberFromEnv = (name: string, fallback: number, min: number, max: number) => {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  const value = raw == null ? fallback : Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

const booleanFromEnv = (name: string, fallback: boolean) => {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  if (raw == null) return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  return fallback;
};

/**
 * Browser-safe realtime audio policy. Server configuration can override the
 * defaults through environment variables; tenant/project configuration should
 * be applied by the session endpoint before this policy reaches the client.
 */
export function getRealtimeAudioPolicy(): RealtimeAudioPolicy {
  return {
    vadThreshold: numberFromEnv("REALTIME_VAD_THRESHOLD", 0.5, 0, 1),
    prefixPaddingMs: numberFromEnv("REALTIME_VAD_PREFIX_PADDING_MS", 300, 0, 3000),
    silenceDurationMs: numberFromEnv("REALTIME_VAD_SILENCE_DURATION_MS", 700, 100, 5000),
    ragDebounceMs: numberFromEnv("REALTIME_RAG_DEBOUNCE_MS", 300, 0, 2000),
    minQueryLength: numberFromEnv("REALTIME_MIN_QUERY_LENGTH", 4, 1, 100),
    noiseSuppression: booleanFromEnv("REALTIME_NOISE_SUPPRESSION", true),
    echoCancellation: booleanFromEnv("REALTIME_ECHO_CANCELLATION", true),
    autoGainControl: booleanFromEnv("REALTIME_AUTO_GAIN_CONTROL", true),
  };
}

/**
 * Keep browser microphone processing in one place so the realtime hook cannot
 * accidentally fall back to `{ audio: true }` and lose noise/echo handling.
 */
export function buildMicrophoneConstraints(policy: RealtimeAudioPolicy) {
  return {
    echoCancellation: policy.echoCancellation,
    noiseSuppression: policy.noiseSuppression,
    autoGainControl: policy.autoGainControl,
    channelCount: 1,
  } as const;
}

export function hasUsableTranscript(text: string, minLength: number): boolean {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < minLength) return false;
  return normalized.split(" ").filter(Boolean).length >= 1;
}

/**
 * Reconfigure only device/audio settings, NEVER the server-supplied
 * tenant-specific system instructions, tools or model output budget.
 * Re-sending a generic client prompt overwrote buildSystemPrompt() and
 * caused domain/agent behavior to disappear after the SDP connection.
 */
export function buildOpenAIClientAudioUpdate(settings: {
  voice: string;
  threshold: number;
  prefixPaddingMs: number;
  silenceDurationMs: number;
  transcriptionModel: string;
  transcriptionLanguage?: string;
}) {
  return {
    type: "session.update" as const,
    session: {
      type: "realtime" as const,
      audio: {
        output: { voice: settings.voice },
        input: {
          turn_detection: {
            type: "server_vad" as const,
            threshold: settings.threshold,
            prefix_padding_ms: settings.prefixPaddingMs,
            silence_duration_ms: settings.silenceDurationMs,
            create_response: false,
          },
          transcription: {
            model: settings.transcriptionModel,
            ...(settings.transcriptionLanguage
              ? { language: settings.transcriptionLanguage } : {}),
          },
        },
      },
    },
  };
}
