/**
 * Plan Task 4.1 — regression-lock the current OpenAI Realtime behavior.
 *
 * These tests pin the EXISTING session-building and client-secret exchange
 * contracts so any future change (provider switching, Sarvam/ElevenLabs
 * realtime work) that accidentally perturbs the OpenAI baseline fails loudly.
 * The OpenAI path is the protected regression baseline (plan §1.5): do not
 * slow it down or rewrite it to make another provider conform.
 *
 * Browser-side flows (connect → mic → transcript → answer → interrupt →
 * reconnect → disconnect) run on real devices in Phase 11; the server-side
 * session contract here is what those flows depend on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
  extractOpenAIRealtimeClientSecret,
} from "./openai-realtime";

describe("buildOpenAIRealtimeSession — locked session shape", () => {
  it("builds the canonical voice session (audio modality, VAD, transcription)", () => {
    const session = buildOpenAIRealtimeSession({
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      instructions: "You are Clara.",
      tools: [{ type: "function", name: "rag_search" }],
      toolChoice: "auto",
      maxOutputTokens: 500,
      turnDetection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
        create_response: false,
      },
      transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
    });

    // Locked shape: type/model/instructions/output_modalities/audio.
    expect(session.type).toBe("realtime");
    expect(session.model).toBe("gpt-realtime-2.1-mini");
    expect(session.instructions).toBe("You are Clara.");
    expect(session.output_modalities).toEqual(["audio"]);
    expect(session.audio).toEqual({
      input: {
        transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: false,
        },
      },
      output: { voice: "marin" },
    });
    expect(session.tools).toEqual([{ type: "function", name: "rag_search" }]);
    expect(session.tool_choice).toBe("auto");
    expect(session.max_output_tokens).toBe(500);
  });

  it("drops undefined optional sections entirely (no empty audio block)", () => {
    const session = buildOpenAIRealtimeSession({ model: "m" });
    expect(session.audio).toBeUndefined();
    expect(session.tools).toBeUndefined();
    expect(session.tool_choice).toBeUndefined();
    expect(session.output_modalities).toEqual(["audio"]); // default stays
    expect(session.max_output_tokens).toBeUndefined();
  });

  it("clamps max_output_tokens into [1, 4096] and passes 'inf' through", () => {
    expect(buildOpenAIRealtimeSession({ model: "m", maxOutputTokens: 0 }).max_output_tokens).toBe(1);
    expect(buildOpenAIRealtimeSession({ model: "m", maxOutputTokens: 99999 }).max_output_tokens).toBe(4096);
    expect(buildOpenAIRealtimeSession({ model: "m", maxOutputTokens: 3.7 }).max_output_tokens).toBe(4);
    expect(buildOpenAIRealtimeSession({ model: "m", maxOutputTokens: "inf" }).max_output_tokens).toBe("inf");
    expect(buildOpenAIRealtimeSession({ model: "m", maxOutputTokens: NaN }).max_output_tokens).toBeUndefined();
  });
});

describe("extractOpenAIRealtimeClientSecret — envelope tolerance", () => {
  it("accepts client_secret.value, plain client_secret, value and ephemeralKey", () => {
    expect(extractOpenAIRealtimeClientSecret({ client_secret: { value: "k1" } })).toBe("k1");
    expect(extractOpenAIRealtimeClientSecret({ client_secret: "k2" })).toBe("k2");
    expect(extractOpenAIRealtimeClientSecret({ value: "k3" })).toBe("k3");
    expect(extractOpenAIRealtimeClientSecret({ ephemeralKey: "k4" })).toBe("k4");
  });

  it("returns null for missing/empty secrets", () => {
    expect(extractOpenAIRealtimeClientSecret({})).toBeNull();
    expect(extractOpenAIRealtimeClientSecret({ client_secret: { value: "" } })).toBeNull();
    expect(extractOpenAIRealtimeClientSecret({ client_secret: { value: 42 } })).toBeNull();
  });
});

describe("createOpenAIRealtimeClientSecret — vendor exchange contract", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs the session to /v1/realtime/client_secrets and maps the envelope", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ value: "ephemeral-abc", expires_at: 12345, session: { model: "gpt-realtime-2.1-mini" } }),
      { status: 200 },
    ));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await createOpenAIRealtimeClientSecret({
      apiKey: "sk-test",
      session: { type: "realtime", model: "gpt-realtime-2.1-mini" },
      safetyIdentifier: "org-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.value).toBe("ephemeral-abc");
    expect(result.data.client_secret).toEqual({ value: "ephemeral-abc", expires_at: 12345 });
    expect(result.data.ephemeralKey).toBe("ephemeral-abc");
    expect(result.data.model).toBe("gpt-realtime-2.1-mini");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["OpenAI-Safety-Identifier"]).toBe("org-1");
    expect(JSON.parse(String(init.body))).toEqual({ session: { type: "realtime", model: "gpt-realtime-2.1-mini" } });
  });

  it("propagates vendor failures with status and error text", async () => {
    globalThis.fetch = vi.fn(async () => new Response("invalid_api_key", { status: 401 })) as unknown as typeof fetch;
    const result = await createOpenAIRealtimeClientSecret({ apiKey: "bad", session: {} });
    expect(result).toMatchObject({ ok: false, status: 401, errorText: "invalid_api_key" });
  });

  it("maps timeout to 504 with the 15-second contract message", async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
      ) as unknown as typeof fetch;

      const pending = createOpenAIRealtimeClientSecret({ apiKey: "k", session: {} });
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await pending;
      expect(result).toMatchObject({
        ok: false,
        status: 504,
        errorText: "Timed out while contacting OpenAI Realtime after 15 seconds.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps network errors to 502", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const result = await createOpenAIRealtimeClientSecret({ apiKey: "k", session: {} });
    expect(result).toMatchObject({ ok: false, status: 502, errorText: "ECONNRESET" });
  });
});
