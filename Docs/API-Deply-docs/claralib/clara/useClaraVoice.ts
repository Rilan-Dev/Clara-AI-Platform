/**
 * src/lib/clara/useClaraVoice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct WebRTC voice — browser ↔ OpenAI Realtime via ephemeral key.
 *
 * Three critical fixes vs previous version:
 *
 * FIX 1 — Always fire response.create (fixes "ask twice" bug)
 *   Old: word-count gate returned early without response.create → AI stuck forever
 *   New: ALWAYS fire response.create after RAG attempt, even if query is short
 *        or RAG fails. AI can respond to greetings like "Hi" without context.
 *
 * FIX 2 — Speculative RAG on transcript delta (fixes delay)
 *   Old: wait for transcription.completed → 300ms debounce → RAG → inject → speak
 *   New: start RAG search as soon as 10+ chars accumulate during streaming deltas.
 *        By the time transcription.completed fires, results are often already back.
 *        Only re-fetches if the final transcript differs significantly.
 *
 * FIX 3 — Welcome message on connect
 *   Old: no greeting after session starts
 *   New: session response includes welcomeMessage from KB config — fire greeting
 *        response.create immediately after session.update.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { CLARA_CONFIG } from "./config";

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

export type VoiceTurn = {
  id:      string;
  speaker: "user" | "assistant";
  text:    string;
  status:  "speaking" | "done";
  sources?: Array<{ index: number; title: string }>;
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

const BASE = CLARA_CONFIG.baseUrl;
const KEY  = CLARA_CONFIG.apiKey;
const BARS = 32;
// Minimum chars to start a speculative RAG search during delta streaming
const SPECULATIVE_MIN_CHARS = 12;
// How similar the speculative query must be to reuse its result (0-1)
const REUSE_THRESHOLD = 0.7;

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Simple similarity: what fraction of words in `b` appear in `a` */
function similarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (!wb.length) return 1;
  return wb.filter(w => wa.has(w)).length / wb.length;
}

export function useClaraVoice(): UseClaraVoiceReturn {
  const [status,      setStatus]      = useState<VoiceStatus>("idle");
  const [transcript,  setTranscript]  = useState<VoiceTurn[]>([]);
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(BARS).fill(0));
  const [error,       setError]       = useState<string | null>(null);

  const statusRef     = useRef<VoiceStatus>("idle");
  const pcRef         = useRef<RTCPeerConnection | null>(null);
  const dcRef         = useRef<RTCDataChannel | null>(null);
  const micRef        = useRef<MediaStream | null>(null);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const rafRef        = useRef<number>(0);
  const connectTok    = useRef(0);
  const sendQueue     = useRef<string[]>([]);
  const userQuery     = useRef("");
  const ragAbort      = useRef<AbortController | null>(null);
  const activeTurn    = useRef<string | null>(null);
  const latestTurn    = useRef<string | null>(null);
  const toolBuf       = useRef<Record<string, string>>({});
  const kbIdRef       = useRef<string | null>(null);
  // Speculative RAG cache: query → {context, sources}
  const specCache     = useRef<{ query: string; context: string; sources: Array<{ index: number; title: string }> } | null>(null);
  const specAbort     = useRef<AbortController | null>(null);

  const upd = useCallback((s: VoiceStatus) => { statusRef.current = s; setStatus(s); }, []);

  // ── Visualizer ────────────────────────────────────────────────────────────
  const startViz = useCallback(() => {
    const tick = () => {
      if (!analyserRef.current) { setAudioLevels(Array(BARS).fill(0)); return; }
      const d = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(d);
      const b = Math.floor(d.length / BARS);
      setAudioLevels(Array.from({ length: BARS }, (_, i) => {
        let s = 0; for (let j = 0; j < b; j++) s += d[i * b + j]!; return (s / b) / 255;
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopViz = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setAudioLevels(Array(BARS).fill(0));
  }, []);

  // ── sendJSON ──────────────────────────────────────────────────────────────
  const sendJSON = useCallback((obj: unknown) => {
    const msg = JSON.stringify(obj);
    const dc  = dcRef.current;
    if (dc?.readyState === "open") { try { dc.send(msg); } catch { /* Skip Error Catch */ } }
    else sendQueue.current.push(msg);
  }, []);

  // ── Resolve which turn to update ──────────────────────────────────────────
  const resolveTurnId = useCallback((turns: VoiceTurn[]) => {
    if (activeTurn.current && turns.some(t => t.id === activeTurn.current)) return activeTurn.current;
    if (latestTurn.current && turns.some(t => t.id === latestTurn.current)) return latestTurn.current;
    return turns.length ? turns[turns.length - 1]!.id : null;
  }, []);

  // ── Fire RAG search (returns result, doesn't inject yet) ─────────────────
  const fetchRag = useCallback(async (query: string, signal: AbortSignal) => {
    const kbId = kbIdRef.current;
    if (!query.trim() || !kbId) return null;
    const res = await fetch(`${BASE}/api/embed/search`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), limit: 6 }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as { context?: string; sources?: Array<{ index: number; title: string }> };
    return { context: data.context ?? "", sources: data.sources ?? [] };
  }, []);

  // ── Inject context + fire response.create ─────────────────────────────────
  // FIX 1: ALWAYS fires response.create — even if query is a greeting.
  // Short greetings get no context injection but AI still responds immediately.
  const injectAndRespond = useCallback((
    query: string,
    context: string,
    sources: Array<{ index: number; title: string }>,
    assistantId: string,
  ) => {
    setTranscript(prev => prev.map(t => t.id === assistantId ? { ...t, sources } : t));

    if (context.trim()) {
      sendJSON({
        type: "conversation.item.create",
        item: { type: "message", role: "system",
          content: [{ type: "input_text",
            text: `Knowledge base context:\n\n${context.trim()}\n\nAnswer the user's question using the above context. Be concise and natural.` }] },
      });
    }

    if (query.trim()) {
      sendJSON({
        type: "conversation.item.create",
        item: { type: "message", role: "user",
          content: [{ type: "input_text", text: query.trim() }] },
      });
    }

    // FIX 1 KEY: always fire response.create — never leave AI stuck
    sendJSON({ type: "response.create", response: { tool_choice: "none" } });
    userQuery.current = "";
  }, [sendJSON]);

  // ── Full RAG → inject → respond pipeline ──────────────────────────────────
  const performRagAndRespond = useCallback(async () => {
    const query = userQuery.current.trim();
    if (!query) return;

    // Abort any in-flight speculative fetch
    specAbort.current?.abort();
    ragAbort.current?.abort();
    const ctrl = new AbortController();
    ragAbort.current = ctrl;

    // Create turn entries
    const turnId = uid();
    activeTurn.current = turnId;
    latestTurn.current = turnId;
    setTranscript(prev => [...prev, { id: turnId, speaker: "user", text: query, status: "done" }]);
    const asstId = uid();
    setTranscript(prev => [...prev, { id: asstId, speaker: "assistant", text: "", status: "speaking" }]);
    activeTurn.current = asstId;

    // FIX 2: Check if speculative cache is a good match (saves ~400ms)
    const cached = specCache.current;
    if (cached && similarity(cached.query, query) >= REUSE_THRESHOLD) {
      specCache.current = null;
      injectAndRespond(query, cached.context, cached.sources, asstId);
      return;
    }

    try {
      // FIX 1: even short greetings go through — just no KB context for them
      const result = await fetchRag(query, ctrl.signal);
      if (ragAbort.current !== ctrl) return; // superseded
      injectAndRespond(query, result?.context ?? "", result?.sources ?? [], asstId);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // RAG failed — still let AI respond (it'll say it doesn't have that info)
      injectAndRespond(query, "", [], asstId);
    } finally {
      if (ragAbort.current === ctrl) ragAbort.current = null;
    }
  }, [fetchRag, injectAndRespond]);

  // ── Speculative RAG during delta streaming ────────────────────────────────
  // FIX 2: Start search early while user is still being transcribed.
  // If the final transcript matches closely, we skip the second fetch entirely.
  const startSpeculative = useCallback((partialQuery: string) => {
    if (partialQuery.length < SPECULATIVE_MIN_CHARS || !kbIdRef.current) return;
    // Don't restart if we already have a good speculative result for this query
    const cached = specCache.current;
    if (cached && similarity(cached.query, partialQuery) >= REUSE_THRESHOLD) return;

    specAbort.current?.abort();
    const ctrl = new AbortController();
    specAbort.current = ctrl;

    fetchRag(partialQuery, ctrl.signal)
      .then(result => {
        if (result && specAbort.current === ctrl) {
          specCache.current = { query: partialQuery, context: result.context, sources: result.sources };
        }
      })
      .catch(() => {});
  }, [fetchRag]);

  // ── Data channel message handler ──────────────────────────────────────────
  const onDcMessage = useCallback((ev: MessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; } catch { return; }
    const type = typeof msg.type === "string" ? msg.type : "";

    // Speech started — reset accumulators and speculative cache
    if (type === "input_audio_buffer.speech_started") {
      userQuery.current = "";
      activeTurn.current = null;
      specCache.current = null;
      specAbort.current?.abort();
      specAbort.current = null;
    }

    // FIX 2: Streaming transcript delta — start speculative RAG early
    if (type === "conversation.item.input_audio_transcription.delta") {
      const d = typeof msg.delta === "string" ? msg.delta : "";
      if (d) {
        userQuery.current += d;
        startSpeculative(userQuery.current);
      }
    }

    // Final transcript — fire full RAG pipeline (uses cache if available)
    if (type === "conversation.item.input_audio_transcription.completed") {
      const final = typeof msg.transcript === "string" ? msg.transcript : userQuery.current;
      if (final.trim()) userQuery.current = final;
      void performRagAndRespond();
    }

    // AI transcript streaming
    if (type === "response.audio_transcript.delta" || type === "response.text.delta") {
      const d = typeof msg.delta === "string" ? msg.delta : "";
      if (d) setTranscript(prev => {
        const id = resolveTurnId(prev);
        if (!id) return prev;
        latestTurn.current = id;
        return prev.map(t => t.id === id ? { ...t, text: t.text + d, status: "speaking" } : t);
      });
    }

    if (type === "response.created") { setIsSpeaking(true); }

    if (type === "response.done") {
      setIsSpeaking(false);
      setTranscript(prev => {
        const id = resolveTurnId(prev);
        if (id) latestTurn.current = id;
        return prev.map(t => t.id === (id ?? "") ? { ...t, status: "done" } : t);
      });
      activeTurn.current = null;
    }

    // Tool call — return empty result; AI uses injected context instead
    if (type === "response.function_call_arguments.delta") {
      const cid = typeof msg.call_id === "string" ? msg.call_id : null;
      const d   = typeof msg.delta   === "string" ? msg.delta   : "";
      if (cid && d) toolBuf.current[cid] = (toolBuf.current[cid] ?? "") + d;
    }
    if (type === "response.function_call_arguments.done") {
      const cid = typeof msg.call_id === "string" ? msg.call_id : null;
      if (cid) {
        delete toolBuf.current[cid];
        sendJSON({ type: "conversation.item.create",
          item: { type: "function_call_output", call_id: cid,
            output: JSON.stringify({ info: "Context already injected. Use the system message above." }) } });
        sendJSON({ type: "response.create" });
      }
    }
  }, [performRagAndRespond, resolveTurnId, sendJSON, startSpeculative]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch { /* Skip Error Catch */ }
    try { pcRef.current?.close(); } catch { /* Skip Error Catch */ }
    dcRef.current = null; pcRef.current = null;
    micRef.current?.getTracks().forEach(t => t.stop()); micRef.current = null;
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* Skip Error Catch */ }
      audioRef.current.srcObject = null;
    }
    ragAbort.current?.abort(); ragAbort.current = null;
    specAbort.current?.abort(); specAbort.current = null;
    specCache.current = null;
    sendQueue.current = [];
    userQuery.current = "";
    activeTurn.current = null; latestTurn.current = null;
    setIsSpeaking(false);
    stopViz();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null; analyserRef.current = null;
  }, [stopViz]);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "connected") return;
    setError(null); setTranscript([]); upd("connecting");
    const tok = ++connectTok.current;

    try {
      // 1. Ephemeral key from server
      const sessRes = await fetch(`${BASE}/api/embed/session`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!sessRes.ok) throw new Error(`Session error ${sessRes.status}: ${await sessRes.text()}`);
      const session = await sessRes.json() as Record<string, unknown>;

      const ephemeralKey =
        ((session?.client_secret as Record<string, unknown>)?.value as string) ??
        (session?.client_secret as string) ?? (session?.value as string);
      if (!ephemeralKey) throw new Error("No ephemeral key in session response");

      kbIdRef.current = typeof session?.kbId === "string" ? session.kbId : null;
      const model       = typeof session?.model === "string" ? session.model : "gpt-realtime-mini";
      const voice       = typeof session?.voice === "string" ? session.voice : "alloy";
      const temperature = typeof session?.temperature === "number" ? session.temperature : 0.8;
      // FIX 3: grab welcomeMessage from session response (set in KB config)
      const welcomeMsg  = typeof session?.welcomeMessage === "string" ? session.welcomeMessage.trim() : "";

      if (tok !== connectTok.current) return;

      // 2. WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      pc.ontrack = ev => {
        (ev.streams[0] ?? new MediaStream()).getTracks().forEach(t => remoteStream.addTrack(t));
        if (!audioRef.current) {
          const el = document.createElement("audio");
          el.autoplay = true;
          document.body.appendChild(el);
          audioRef.current = el;
        }
        audioRef.current.srcObject = remoteStream;
        audioRef.current.play().catch(() => {});
        // Visualizer reads remote audio
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = BARS * 4;
        analyserRef.current = analyser;
        ctx.createMediaStreamSource(remoteStream).connect(analyser);
        startViz();
      };

      // 3. Data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = onDcMessage;
      dc.onopen = () => {
        const q = sendQueue.current; sendQueue.current = [];
        q.forEach(m => { try { dc.send(m); } catch { /* Skip Error Catch */ } });

        // Configure session — create_response:false waits for our RAG inject
        sendJSON({
          type: "session.update",
          session: {
            voice, modalities: ["audio", "text"], temperature,
            turn_detection: {
              type: "server_vad", threshold: 0.5,
              prefix_padding_ms: 300, silence_duration_ms: 600,
              create_response: false,  // AI waits for our performRagAndRespond
            },
            input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
            tools: [{
              type: "function", name: "rag_search",
              description: "Search the knowledge base for additional information.",
              parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            }],
            tool_choice: "auto",
          },
        });

        // FIX 3: Fire welcome greeting immediately after session is configured
        if (welcomeMsg) {
          const greetId = uid();
          activeTurn.current = greetId;
          latestTurn.current = greetId;
          setTranscript([{ id: greetId, speaker: "assistant", text: "", status: "speaking" }]);
          sendJSON({
            type: "response.create",
            response: {
              instructions: `Greet the user with this message exactly: "${welcomeMsg}". Be warm and natural.`,
              tool_choice: "none",
            },
          });
        }

        upd("connected");
      };

      dc.onclose = () => {
        if (tok !== connectTok.current) return;
        setError("Voice session ended. Tap the mic to reconnect.");
        upd("error"); cleanup();
      };

      // 4. Microphone
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      }).catch((e: DOMException) => {
        if (e.name === "NotAllowedError") throw new Error("Microphone access denied.");
        if (e.name === "NotFoundError")   throw new Error("No microphone found.");
        throw new Error(`Mic error: ${e.message}`);
      });
      if (tok !== connectTok.current) { mic.getTracks().forEach(t => t.stop()); return; }
      micRef.current = mic;
      pc.addTrack(mic.getAudioTracks()[0]!, mic);

      // 5. SDP offer + ICE
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== "complete") {
        await new Promise<void>(res => {
          let done = false;
          const finish = () => { if (!done) { done = true; pc.removeEventListener("icegatheringstatechange", fn); res(); } };
          const fn = () => { if (pc.iceGatheringState === "complete") finish(); };
          pc.addEventListener("icegatheringstatechange", fn);
          if (pc.iceGatheringState === "complete") finish();
          setTimeout(finish, 8000);
        });
      }

      // 6. SDP exchange with OpenAI
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp", "OpenAI-Beta": "realtime=v1" },
          body: pc.localDescription?.sdp ?? offer.sdp ?? "",
        });
      if (!sdpRes.ok) throw new Error(`SDP failed (${sdpRes.status}): ${await sdpRes.text()}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

    } catch (e) {
      upd("error"); setError((e as Error).message); cleanup();
    }
  }, [cleanup, onDcMessage, sendJSON, startViz, upd]);

  const disconnect = useCallback(() => { ++connectTok.current; cleanup(); upd("idle"); }, [cleanup, upd]);

  const interrupt = useCallback(() => {
    sendJSON({ type: "response.cancel" });
    setIsSpeaking(false);
  }, [sendJSON]);

  const sendText = useCallback((text: string) => {
    const t = text.trim(); if (!t) return;
    userQuery.current = t;
    void performRagAndRespond();
  }, [performRagAndRespond]);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  return { status, transcript, isSpeaking, audioLevels, connect, disconnect, interrupt, sendText, error };
}
