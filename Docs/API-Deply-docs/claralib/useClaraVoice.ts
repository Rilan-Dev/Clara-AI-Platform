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

const SPEC_MIN_CHARS = 12;
const REUSE_THRESHOLD = 0.7;

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

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


  const statusRef   = useRef<VoiceStatus>("idle");
  const pcRef       = useRef<RTCPeerConnection | null>(null);
  const dcRef       = useRef<RTCDataChannel | null>(null);
  const micRef      = useRef<MediaStream | null>(null);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef      = useRef<number>(0);
  const connectTok  = useRef(0);
  const sendQueue   = useRef<string[]>([]);
  const userQuery   = useRef("");
  const ragAbort    = useRef<AbortController | null>(null);
  const specAbort   = useRef<AbortController | null>(null);
  const specCache   = useRef<{ query: string; context: string; sources: Array<{ index: number; title: string }> } | null>(null);
  const activeTurn  = useRef<string | null>(null);
  const latestTurn  = useRef<string | null>(null);
  const toolBuf     = useRef<Record<string, string>>({});

  const upd = useCallback((s: VoiceStatus) => { statusRef.current = s; setStatus(s); }, []);


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


  const sendJSON = useCallback((obj: unknown) => {
    const msg = JSON.stringify(obj);
    const dc  = dcRef.current;
    if (dc?.readyState === "open") { try { dc.send(msg); } catch { /* skip */ } }
    else sendQueue.current.push(msg);
  }, []);


  const resolveTurnId = useCallback((turns: VoiceTurn[]) => {
    if (activeTurn.current && turns.some(t => t.id === activeTurn.current)) return activeTurn.current;
    if (latestTurn.current && turns.some(t => t.id === latestTurn.current)) return latestTurn.current;
    return turns.length ? turns[turns.length - 1]!.id : null;
  }, []);


  const fetchRag = useCallback(async (query: string, signal: AbortSignal) => {
    const res = await fetch(`${BASE}/api/embed/search`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ query: query.trim(), limit: 6 }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as { context?: string; sources?: Array<{ index: number; title: string }> };
    return { context: data.context ?? "", sources: data.sources ?? [] };
  }, []);


  const injectAndRespond = useCallback((
    query:    string,
    context:  string,
    sources:  Array<{ index: number; title: string }>,
    asstId:   string,
  ) => {
    setTranscript(prev => prev.map(t => t.id === asstId ? { ...t, sources } : t));
    if (context.trim()) {
      sendJSON({
        type: "conversation.item.create",
        item: { type: "message", role: "system",
          content: [{ type: "input_text",
            text: `Knowledge base context:\n\n${context.trim()}\n\nAnswer using the above context. Be concise and natural.` }] },
      });
    }
    if (query.trim()) {
      sendJSON({
        type: "conversation.item.create",
        item: { type: "message", role: "user",
          content: [{ type: "input_text", text: query.trim() }] },
      });
    }
    sendJSON({ type: "response.create", response: { tool_choice: "none" } });
    userQuery.current = "";
  }, [sendJSON]);


  const performRagAndRespond = useCallback(async () => {
    const query = userQuery.current.trim();
    if (!query) return;

    specAbort.current?.abort();
    ragAbort.current?.abort();
    const ctrl = new AbortController();
    ragAbort.current = ctrl;

    const turnId = uid();
    activeTurn.current = turnId;
    latestTurn.current = turnId;
    setTranscript(prev => [...prev, { id: turnId, speaker: "user", text: query, status: "done" }]);
    const asstId = uid();
    setTranscript(prev => [...prev, { id: asstId, speaker: "assistant", text: "", status: "speaking" }]);
    activeTurn.current = asstId;

  
    const cached = specCache.current;
    if (cached && similarity(cached.query, query) >= REUSE_THRESHOLD) {
      specCache.current = null;
      injectAndRespond(query, cached.context, cached.sources, asstId);
      return;
    }

    try {
      const result = await fetchRag(query, ctrl.signal);
      if (ragAbort.current !== ctrl) return;
      injectAndRespond(query, result?.context ?? "", result?.sources ?? [], asstId);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      injectAndRespond(query, "", [], asstId);
    } finally {
      if (ragAbort.current === ctrl) ragAbort.current = null;
    }
  }, [fetchRag, injectAndRespond]);


  const startSpeculative = useCallback((partial: string) => {
    if (partial.length < SPEC_MIN_CHARS) return;
    const cached = specCache.current;
    if (cached && similarity(cached.query, partial) >= REUSE_THRESHOLD) return;

    specAbort.current?.abort();
    const ctrl = new AbortController();
    specAbort.current = ctrl;

    fetchRag(partial, ctrl.signal)
      .then(r => {
        if (r && specAbort.current === ctrl)
          specCache.current = { query: partial, context: r.context, sources: r.sources };
      })
      .catch(() => {});
  }, [fetchRag]);


  const onDcMessage = useCallback((ev: MessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; } catch { return; }
    const type = typeof msg.type === "string" ? msg.type : "";

    if (type === "input_audio_buffer.speech_started") {
      userQuery.current = ""; activeTurn.current = null;
      specCache.current = null; specAbort.current?.abort(); specAbort.current = null;
    }
    if (type === "conversation.item.input_audio_transcription.delta") {
      const d = typeof msg.delta === "string" ? msg.delta : "";
      if (d) { userQuery.current += d; startSpeculative(userQuery.current); }
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const final = typeof msg.transcript === "string" ? msg.transcript : userQuery.current;
      if (final.trim()) userQuery.current = final;
      void performRagAndRespond();
    }
    if (type === "response.audio_transcript.delta" || type === "response.text.delta") {
      const d = typeof msg.delta === "string" ? msg.delta : "";
      if (d) setTranscript(prev => {
        const id = resolveTurnId(prev); if (!id) return prev;
        latestTurn.current = id;
        return prev.map(t => t.id === id ? { ...t, text: t.text + d, status: "speaking" } : t);
      });
    }
    if (type === "response.created")  setIsSpeaking(true);
    if (type === "response.done") {
      setIsSpeaking(false);
      setTranscript(prev => {
        const id = resolveTurnId(prev);
        if (id) latestTurn.current = id;
        return prev.map(t => t.id === (id ?? "") ? { ...t, status: "done" } : t);
      });
      activeTurn.current = null;
    }
  
  
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
            output: JSON.stringify({ info: "Context already injected via system message." }) } });
        sendJSON({ type: "response.create" });
      }
    }
  }, [performRagAndRespond, resolveTurnId, sendJSON, startSpeculative]);


  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch { /* skip */ }
    try { pcRef.current?.close(); } catch { /* skip */ }
    dcRef.current = null; pcRef.current = null;
    micRef.current?.getTracks().forEach(t => t.stop()); micRef.current = null;
    if (audioRef.current) { try { audioRef.current.pause(); } catch { /* skip */ } audioRef.current.srcObject = null; }
    ragAbort.current?.abort(); ragAbort.current = null;
    specAbort.current?.abort(); specAbort.current = null;
    specCache.current = null;
    sendQueue.current = []; userQuery.current = "";
    activeTurn.current = null; latestTurn.current = null;
    setIsSpeaking(false); stopViz();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null; analyserRef.current = null;
  }, [stopViz]);


  const connect = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "connected") return;
    setError(null); setTranscript([]); upd("connecting");
    const tok = ++connectTok.current;

    try {
    
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      }).catch((e: DOMException) => {
        if (e.name === "NotAllowedError") throw new Error("Microphone access denied. Allow mic and retry.");
        if (e.name === "NotFoundError")   throw new Error("No microphone found.");
        throw new Error(`Mic error: ${e.message}`);
      });
      if (tok !== connectTok.current) { mic.getTracks().forEach(t => t.stop()); return; }
      micRef.current = mic;

    
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      pc.ontrack = ev => {
        (ev.streams[0] ?? new MediaStream()).getTracks().forEach(t => remoteStream.addTrack(t));
        if (!audioRef.current) {
          const el = document.createElement("audio"); el.autoplay = true;
          document.body.appendChild(el); audioRef.current = el;
        }
        audioRef.current.srcObject = remoteStream;
        audioRef.current.play().catch(() => {});
      
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser(); analyser.fftSize = BARS * 4;
        analyserRef.current = analyser;
        ctx.createMediaStreamSource(remoteStream).connect(analyser);
        startViz();
      };

    
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = onDcMessage;
      dc.onopen = () => {
      
        const q = sendQueue.current; sendQueue.current = [];
        q.forEach(m => { try { dc.send(m); } catch { /* skip */ } });
      
        sendJSON({
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            turn_detection: {
              type: "server_vad", threshold: 0.5,
              prefix_padding_ms: 300, silence_duration_ms: 600,
              create_response: false,
            },
          },
        });
        upd("connected");
      };
      dc.onclose = () => {
        if (tok !== connectTok.current) return;
        setError("Voice session ended. Tap the mic to reconnect.");
        upd("error"); cleanup();
      };

    
      pc.addTrack(mic.getAudioTracks()[0]!, mic);

    
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
      if (tok !== connectTok.current) return;

    
    
      const sdpOffer = pc.localDescription?.sdp ?? offer.sdp ?? "";
      const connRes  = await fetch(`${BASE}/api/embed/voice-connect`, {
        method:  "POST",
        headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ sdpOffer }),
      });
      if (!connRes.ok) throw new Error(`Voice connect failed (${connRes.status}): ${await connRes.text()}`);
      const { sdpAnswer, welcomeMessage } = await connRes.json() as { sdpAnswer: string; welcomeMessage?: string };

    
      await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });

    
      if (welcomeMessage?.trim()) {
        const greetId = uid();
        activeTurn.current = greetId;
        latestTurn.current = greetId;
        setTranscript([{ id: greetId, speaker: "assistant", text: "", status: "speaking" }]);
        sendJSON({
          type: "response.create",
          response: {
            instructions: `Greet the user with this message: "${welcomeMessage.trim()}"`,
            tool_choice: "none",
          },
        });
      }

    } catch (e) {
      upd("error"); setError((e as Error).message); cleanup();
    }
  }, [cleanup, onDcMessage, sendJSON, startViz, upd]);

  const disconnect = useCallback(() => { ++connectTok.current; cleanup(); upd("idle"); }, [cleanup, upd]);
  const interrupt   = useCallback(() => { sendJSON({ type: "response.cancel" }); setIsSpeaking(false); }, [sendJSON]);
  const sendText    = useCallback((text: string) => {
    const t = text.trim(); if (!t) return;
    userQuery.current = t; void performRagAndRespond();
  }, [performRagAndRespond]);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  return { status, transcript, isSpeaking, audioLevels, connect, disconnect, interrupt, sendText, error };
}
