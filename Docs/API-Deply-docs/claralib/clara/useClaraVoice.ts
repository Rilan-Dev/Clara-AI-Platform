/**
 * src/lib/clara/useClaraVoice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for Clara AI voice — OpenAI Realtime (WebRTC) or Gemini Live (WebSocket).
 *
 *   const voice = useClaraVoice();
 *
 *   voice.status      — "idle" | "connecting" | "connected" | "error"
 *   voice.transcript  — live turns: [{ id, speaker, text, status }]
 *   voice.isSpeaking  — true while AI is playing audio
 *   voice.audioLevels — number[32]  0–1 bar heights for a visualizer
 *   voice.connect()   — request mic + start session
 *   voice.disconnect()
 *   voice.interrupt() — cut off AI mid-sentence
 *   voice.sendText()  — inject a text turn while voice is active
 *   voice.error       — string | null
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { CLARA_CONFIG } from "./config";

// ── Types ───────────────────────────────────────────────────────────────────

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

export type VoiceTurn = {
  id:      string;
  speaker: "user" | "assistant";
  text:    string;
  status:  "speaking" | "done";
};

export type UseClaraVoiceReturn = {
  status:      VoiceStatus;
  transcript:  VoiceTurn[];
  isSpeaking:  boolean;
  audioLevels: number[];
  connect:     () => Promise<void>;
  disconnect:  () => void;
  interrupt:   () => void;
  sendText:    (text: string) => void;
  error:       string | null;
};

// ── Internal constants ───────────────────────────────────────────────────────

const BASE = CLARA_CONFIG.baseUrl;
const AUTH = { "Authorization": `Bearer ${CLARA_CONFIG.apiKey}`, "Content-Type": "application/json" };
const SID  = "voice_" + Math.random().toString(36).slice(2, 10);
const BARS = 32;

// ── Frequency analyser → bar heights ────────────────────────────────────────

function buildLevels(analyser: AnalyserNode | null): number[] {
  if (!analyser) return Array(BARS).fill(0);
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const bucket = Math.floor(data.length / BARS);
  return Array.from({ length: BARS }, (_, i) => {
    let sum = 0;
    for (let j = 0; j < bucket; j++) sum += data[i * bucket + j]!;
    return (sum / bucket) / 255;
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useClaraVoice(): UseClaraVoiceReturn {
  const [status,      setStatus]      = useState<VoiceStatus>("idle");
  const [transcript,  setTranscript]  = useState<VoiceTurn[]>([]);
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(BARS).fill(0));
  const [error,       setError]       = useState<string | null>(null);

  const pcRef       = useRef<RTCPeerConnection | null>(null);
  const dcRef       = useRef<RTCDataChannel | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef      = useRef<number>(0);
  const providerRef = useRef<"openai" | "gemini" | null>(null);

  // ── Visualizer RAF loop ─────────────────────────────────────────────────
  const startViz = useCallback(() => {
    const tick = () => {
      setAudioLevels(buildLevels(analyserRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopViz = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setAudioLevels(Array(BARS).fill(0));
  }, []);

  // ── Transcript upsert ────────────────────────────────────────────────────
  const upsertTurn = useCallback((id: string, speaker: VoiceTurn["speaker"], text: string, st: VoiceTurn["status"]) => {
    setTranscript(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return [...prev, { id, speaker, text, status: st }];
      return prev.map((t, i) => i === idx ? { ...t, text, status: st } : t);
    });
  }, []);

  // ── RAG search — called when OpenAI Realtime fires a rag_search tool call ──
  // Streams tokens from /api/embed/chat, accumulates the answer, then sends
  // the result back to the data channel so the AI can continue speaking.
  const answerRagSearch = useCallback(async (callId: string, query: string) => {
    try {
      const res = await fetch(`${BASE}/api/embed/chat`, {
        method: "POST", headers: AUTH,
        body: JSON.stringify({ messages: [{ role: "user", content: query }], sessionId: SID + "_rag" }),
      });
      if (!res.ok || !res.body) throw new Error("RAG fetch failed");

      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let answer = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const ev = JSON.parse(line) as { type: string; payload: unknown };
            if (ev.type === "token" && typeof ev.payload === "string") answer += ev.payload;
          } catch { /* skip */ }
        }
      }

      if (dcRef.current?.readyState === "open") {
        dcRef.current.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: answer || "No relevant information found in the knowledge base.",
          },
        }));
        // Trigger AI to continue speaking with the RAG result
        dcRef.current.send(JSON.stringify({ type: "response.create" }));
      }
    } catch (e) {
      console.warn("[ClaraVoice] RAG search failed:", e);
    }
  }, []);

  // ── OpenAI Realtime event handler ─────────────────────────────────────────
  const handleOpenAIEvent = useCallback((ev: Record<string, unknown>) => {
    switch (ev.type) {

      // ── Speech detection ─────────────────────────────────────────────────
      case "input_audio_buffer.speech_started":
        setIsSpeaking(false); // user speaking, AI not
        break;

      // The server session uses create_response=false, so we must trigger
      // response.create manually. We fire it ONLY on 'committed' — which
      // always fires after speech_stopped. Firing on both causes the
      // "active response already in progress" error seen in the console.
      case "input_audio_buffer.committed":
        if (dcRef.current?.readyState === "open") {
          dcRef.current.send(JSON.stringify({ type: "response.create" }));
        }
        break;

      // ── AI audio output ──────────────────────────────────────────────────
      case "response.audio.delta":
        setIsSpeaking(true);
        break;

      case "response.audio.done":
        setIsSpeaking(false);
        break;

      // ── User speech transcription ────────────────────────────────────────
      case "conversation.item.input_audio_transcription.completed": {
        const turnId = (ev.item_id as string) ?? `u_${Date.now()}`;
        const text   = (ev.transcript as string) ?? "";
        if (text.trim()) upsertTurn(turnId, "user", text, "done");
        break;
      }

      // ── AI text transcript (streams word-by-word) ─────────────────────────
      case "response.audio_transcript.delta": {
        const turnId = (ev.response_id as string) ?? `a_${Date.now()}`;
        const delta  = (ev.delta as string) ?? "";
        setTranscript(prev => {
          const idx = prev.findIndex(t => t.id === turnId);
          if (idx === -1) return [...prev, { id: turnId, speaker: "assistant", text: delta, status: "speaking" }];
          return prev.map((t, i) => i === idx ? { ...t, text: t.text + delta, status: "speaking" } : t);
        });
        break;
      }

      case "response.audio_transcript.done": {
        const turnId = (ev.response_id as string) ?? "";
        if (turnId) setTranscript(prev => prev.map(t => t.id === turnId ? { ...t, status: "done" } : t));
        break;
      }

      // ── RAG tool call ─────────────────────────────────────────────────────
      case "response.function_call_arguments.done": {
        const callId = (ev.call_id as string) ?? "";
        try {
          const args = JSON.parse(ev.arguments as string) as { query?: string };
          if (callId && args.query) answerRagSearch(callId, args.query);
        } catch { /* ignore */ }
        break;
      }

      case "error": {
        const msg = ((ev.error as { message?: string })?.message) ?? "Unknown error";
        setError(msg); setStatus("error");
        console.error("[ClaraVoice] server error:", msg);
        break;
      }
    }
  }, [upsertTurn, answerRagSearch]);

  // ── OpenAI WebRTC connect ──────────────────────────────────────────────────
  const connectOpenAI = useCallback(async (ephemeralKey: string) => {
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = BARS * 4;
    analyserRef.current = analyser;

    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) {
        remoteAudio.srcObject = stream;
        remoteAudio.play().catch(() => {});
        const src = audioCtx.createMediaStreamSource(stream);
        src.connect(analyser);
      }
    };

    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = mic;
    mic.getAudioTracks().forEach(t => pc.addTrack(t, mic));

    const dc = pc.createDataChannel("oai-events");
    dcRef.current = dc;

    dc.onopen = () => {
      setStatus("connected");
      startViz();
      // NOTE: We do NOT send session.update here.
      // The server already configured the session with:
      //   - KB instructions (system prompt)
      //   - rag_search tool definition
      //   - turn_detection (server_vad, create_response=false)
      //   - input_audio_transcription
      //   - voice + temperature
      // Sending session.update would overwrite all of that, removing the
      // KB instructions and breaking the AI's context.
    };

    dc.onmessage = (e: MessageEvent<string>) => {
      try { handleOpenAIEvent(JSON.parse(e.data) as Record<string, unknown>); }
      catch { /* ignore malformed */ }
    };

    dc.onclose = () => { setStatus("idle"); stopViz(); };
    dc.onerror = () => { setError("Data channel error"); setStatus("error"); };

    // WebRTC SDP handshake with OpenAI
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!sdpRes.ok) throw new Error(`OpenAI WebRTC handshake failed: ${sdpRes.status}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
  }, [startViz, stopViz, handleOpenAIEvent]);

  // ── Gemini Live WebSocket connect ──────────────────────────────────────────
  const connectGemini = useCallback(async (session: {
    wsUrl: string; model: string; voice: string; instructions: string;
    inputSampleRate: number; outputSampleRate: number;
  }) => {
    const ws = new WebSocket(session.wsUrl);
    wsRef.current = ws;

    const audioCtx = new AudioContext({ sampleRate: session.inputSampleRate });
    audioCtxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = BARS * 4;
    analyserRef.current = analyser;

    ws.onopen = async () => {
      ws.send(JSON.stringify({
        setup: {
          model: session.model,
          generation_config: { response_modalities: ["AUDIO"] },
          system_instruction: { parts: [{ text: session.instructions }] },
          tools: [{
            function_declarations: [{
              name: "rag_search",
              description: "Search the knowledge base for relevant context.",
              parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
            }],
          }],
        },
      }));

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mic;
      const src = audioCtx.createMediaStreamSource(mic);
      src.connect(analyser);

      await audioCtx.audioWorklet.addModule(
        URL.createObjectURL(new Blob([PCM16_WORKLET], { type: "application/javascript" }))
      );
      const worklet = new AudioWorkletNode(audioCtx, "pcm16-encoder");
      src.connect(worklet);

      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm;rate=" + session.inputSampleRate,
                data: btoa(String.fromCharCode(...new Uint8Array(e.data))),
              }],
            },
          }));
        }
      };

      setStatus("connected");
      startViz();
    };

    ws.onmessage = async (e: MessageEvent<Blob | string>) => {
      const raw = e.data instanceof Blob ? await e.data.text() : e.data;
      try {
        const msg = JSON.parse(raw) as Record<string, unknown>;

        // Audio chunks — decode PCM16 and play
        const serverContent = msg.serverContent as { modelTurn?: { parts?: unknown[] } } | undefined;
        if (serverContent?.modelTurn) {
          for (const part of (serverContent.modelTurn.parts ?? []) as Array<Record<string, unknown>>) {
            if (part.inlineData) {
              const data  = (part.inlineData as { data: string }).data;
              const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
              const pcm   = new Int16Array(bytes.buffer);
              const float = new Float32Array(pcm.length);
              for (let i = 0; i < pcm.length; i++) float[i] = pcm[i]! / 32768;
              const buf = audioCtx.createBuffer(1, float.length, session.outputSampleRate);
              buf.copyToChannel(float, 0);
              const src2 = audioCtx.createBufferSource();
              src2.buffer = buf; src2.connect(audioCtx.destination); src2.start();
              setIsSpeaking(true); src2.onended = () => setIsSpeaking(false);
            }
            if (typeof part.text === "string" && part.text.trim()) {
              upsertTurn(`g_${Date.now()}`, "assistant", part.text, "done");
            }
          }
        }

        // Tool call — answer with RAG
        const toolCall = msg.toolCall as { functionCalls?: Array<{ id: string; args: { query?: string } }> } | undefined;
        if (toolCall?.functionCalls) {
          for (const call of toolCall.functionCalls) {
            if (call.args.query) {
              const answer = await ragText(call.args.query);
              ws.send(JSON.stringify({
                tool_response: { function_responses: [{ id: call.id, response: { output: answer } }] },
              }));
            }
          }
        }
      } catch { /* skip bad JSON */ }
    };

    ws.onerror = () => { setError("WebSocket error"); setStatus("error"); };
    ws.onclose = () => { setStatus("idle"); setIsSpeaking(false); stopViz(); };
  }, [upsertTurn, startViz, stopViz]);

  // Plain text RAG lookup for Gemini tool responses
  const ragText = async (query: string): Promise<string> => {
    try {
      const res = await fetch(`${BASE}/api/embed/chat`, {
        method: "POST", headers: AUTH,
        body: JSON.stringify({ messages: [{ role: "user", content: query }], sessionId: SID + "_g" }),
      });
      if (!res.ok || !res.body) return "No information found.";
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let answer = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const ev = JSON.parse(line) as { type: string; payload: unknown };
            if (ev.type === "token" && typeof ev.payload === "string") answer += ev.payload;
          } catch { /* skip */ }
        }
      }
      return answer || "No information found.";
    } catch { return "Search failed."; }
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (status !== "idle") return;
    setError(null); setStatus("connecting"); setTranscript([]);
    try {
      const res = await fetch(`${BASE}/api/embed/session`, {
        method: "POST", headers: AUTH, body: JSON.stringify({ sessionId: SID }),
      });
      if (!res.ok) throw new Error(`Session failed: ${res.status}`);
      const session = await res.json() as Record<string, unknown>;
      providerRef.current = (session.provider as "openai" | "gemini") ?? "openai";

      if (session.provider === "gemini") {
        await connectGemini(session as Parameters<typeof connectGemini>[0]);
      } else {
        const ephKey =
          (session.client_secret as { value: string } | undefined)?.value ??
          (session.client_secret as string | undefined) ?? "";
        if (!ephKey) throw new Error("No ephemeral key in session response");
        await connectOpenAI(ephKey);
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg); setStatus("error");
      console.error("[ClaraVoice] connect failed:", msg);
    }
  }, [status, connectOpenAI, connectGemini]);

  const disconnect = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    dcRef.current?.close(); dcRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    wsRef.current?.close(); wsRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    stopViz();
    setStatus("idle");
    setIsSpeaking(false);
  }, [stopViz]);

  const interrupt = useCallback(() => {
    if (providerRef.current === "openai" && dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "response.cancel" }));
      dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    }
    setIsSpeaking(false);
  }, []);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    if (providerRef.current === "openai" && dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      }));
      dcRef.current.send(JSON.stringify({ type: "response.create" }));
      upsertTurn(`u_${Date.now()}`, "user", text, "done");
    } else if (providerRef.current === "gemini" && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        client_content: { turns: [{ role: "user", parts: [{ text }] }], turn_complete: true },
      }));
      upsertTurn(`u_${Date.now()}`, "user", text, "done");
    }
  }, [upsertTurn]);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  return { status, transcript, isSpeaking, audioLevels, connect, disconnect, interrupt, sendText, error };
}

// ── PCM16 AudioWorklet (Gemini path only) ────────────────────────────────────
// Encodes Float32 mic samples to Int16 PCM and posts buffer to main thread.

const PCM16_WORKLET = `
class Pcm16Encoder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const pcm = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}
registerProcessor('pcm16-encoder', Pcm16Encoder);
`;
