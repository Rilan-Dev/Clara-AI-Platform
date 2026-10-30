import { afterEach, describe, expect, it } from "vitest";
import {
  buildMicrophoneConstraints,
  buildOpenAIClientAudioUpdate,
  getRealtimeAudioPolicy,
  hasUsableTranscript,
} from "./realtime-audio-config";

afterEach(() => {
  delete process.env.REALTIME_VAD_THRESHOLD;
  delete process.env.REALTIME_VAD_PREFIX_PADDING_MS;
  delete process.env.REALTIME_VAD_SILENCE_DURATION_MS;
  delete process.env.REALTIME_RAG_DEBOUNCE_MS;
  delete process.env.REALTIME_MIN_QUERY_LENGTH;
  delete process.env.REALTIME_NOISE_SUPPRESSION;
  delete process.env.REALTIME_ECHO_CANCELLATION;
  delete process.env.REALTIME_AUTO_GAIN_CONTROL;
});

describe("realtime audio policy", () => {
  it("uses safe defaults", () => {
    expect(getRealtimeAudioPolicy()).toEqual({
      vadThreshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 700,
      ragDebounceMs: 300,
      minQueryLength: 4,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    });
  });

  it("reads and clamps numeric environment configuration", () => {
    process.env.REALTIME_VAD_THRESHOLD = "1.5";
    process.env.REALTIME_VAD_PREFIX_PADDING_MS = "-10";
    process.env.REALTIME_VAD_SILENCE_DURATION_MS = "6000";
    expect(getRealtimeAudioPolicy()).toMatchObject({
      vadThreshold: 1,
      prefixPaddingMs: 0,
      silenceDurationMs: 5000,
    });
  });

  it("accepts boolean environment configuration", () => {
    process.env.REALTIME_NOISE_SUPPRESSION = "false";
    process.env.REALTIME_ECHO_CANCELLATION = "0";
    process.env.REALTIME_AUTO_GAIN_CONTROL = "yes";
    expect(getRealtimeAudioPolicy()).toMatchObject({
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: true,
    });
  });

  it("builds explicit mono microphone constraints for noisy environments", () => {
    const policy = getRealtimeAudioPolicy();
    expect(buildMicrophoneConstraints(policy)).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
  });

  it("honours disabled browser audio processing when explicitly configured", () => {
    process.env.REALTIME_NOISE_SUPPRESSION = "false";
    process.env.REALTIME_ECHO_CANCELLATION = "false";
    process.env.REALTIME_AUTO_GAIN_CONTROL = "false";
    expect(buildMicrophoneConstraints(getRealtimeAudioPolicy())).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    });
  });
});

describe("OpenAI client session update retains server authorization", () => {
  it("only updates audio settings, never replacing tenant prompt, tools, or output limit", () => {
    const event = buildOpenAIClientAudioUpdate({
      voice: "marin",
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 700,
      transcriptionModel: "gpt-4o-mini-transcribe",
      transcriptionLanguage: "ar",
    });
    expect(event).toMatchObject({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          output: { voice: "marin" },
          input: {
            turn_detection: { type: "server_vad", create_response: false },
            transcription: { model: "gpt-4o-mini-transcribe", language: "ar" },
          },
        },
      },
    });
    expect(Object.keys(event.session)).toEqual(["type", "audio"]);
    expect(JSON.stringify(event)).not.toMatch(/instructions|tools|tool_choice|max_output_tokens/);
  });
});

describe("transcript validation", () => {
  it("rejects empty and too-short speech", () => {
    expect(hasUsableTranscript("", 4)).toBe(false);
    expect(hasUsableTranscript("hey", 4)).toBe(false);
  });

  it("normalizes whitespace and accepts a valid utterance", () => {
    expect(hasUsableTranscript("  What   does my policy cover? ", 4)).toBe(true);
  });
});
