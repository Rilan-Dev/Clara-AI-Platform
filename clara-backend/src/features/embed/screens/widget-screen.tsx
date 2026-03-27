/**
 * /embed/widget?key=clr_xxx
 * Standalone embeddable widget page — supports full extended design config.
 */
"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/runtime";

type AssistantConfig = {
  kbId: string;
  kbName: string;
  assistantName: string;
  avatarUrl: string | null;
  welcomeMessage: string;
  primaryColour: string;
  accentColour: string;
  defaultLanguage: string;
  widgetTheme?: string;
  widgetBorderRadius?: number;
  widgetFontFamily?: string;
  widgetShowBranding?: boolean;
  customCss?: string | null;
  customThemeCss?: string | null;
  customPoweredBy?: string | null;
  customHeaderHtml?: string | null;
  customFooterHtml?: string | null;
  // Extended design fields
  headerBg?: string | null;
  headerTextColor?: string;
  headerHeight?: number;
  headerBlur?: boolean;
  showStatusDot?: boolean;
  statusDotColor?: string;
  avatarShape?: "circle" | "rounded" | "square";
  chatAreaBg?: string | null;
  userBubbleBg?: string | null;
  userBubbleText?: string;
  userBubbleRadius?: string;
  userBubblePadding?: string;
  userBubbleShadow?: string;
  botBubbleBg?: string | null;
  botBubbleText?: string | null;
  botBubbleRadius?: string;
  botBubbleBorder?: string | null;
  botBubblePadding?: string;
  botBubbleShadow?: string;
  messageGap?: number;
  messageMaxWidth?: number;
  messageFontSize?: number;
  messageLineHeight?: number;
  showTimestamps?: boolean;
  timestampColor?: string;
  timestampFontSize?: number;
  typingDotColor?: string;
  typingDotSize?: number;
  inputBg?: string | null;
  inputBorder?: string | null;
  inputBorderFocus?: string | null;
  inputRadius?: number;
  inputTextColor?: string | null;
  inputPlaceholderColor?: string | null;
  inputPadding?: string;
  inputAreaBg?: string | null;
  inputAreaBorder?: string | null;
  sendBtnBg?: string | null;
  sendBtnHoverBg?: string | null;
  sendBtnTextColor?: string;
  sendBtnRadius?: number;
  sendBtnSize?: number;
  scrollbarWidth?: number;
  scrollbarColor?: string;
  scrollbarTrackColor?: string;
  footerBg?: string | null;
  footerTextColor?: string | null;
  animationsEnabled?: boolean;
  messageAnimationStyle?: string;
  // Voice mode design
  voiceEnabled?: boolean;
  voiceProvider?: string;
  voiceBtnBg?: string | null;
  voiceBtnSize?: number;
  voiceBtnRadius?: number;
  voiceBtnActiveColor?: string;
  voicePanelBg?: string | null;
  voiceWaveColor?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; snippet: string; index: number }>;
};

type WidgetCommandMessage = {
  type?: string;
  payload?: {
    action?: "send" | "startVoice" | "stopVoice";
    text?: string;
  };
} | null;

function WidgetContent() {
  const searchParams = useSearchParams();
  const apiKey       = searchParams.get("key") ?? "";
  const isPreview    = searchParams.get("preview") === "1";
  const previewKey   = searchParams.get("previewKey") ?? "";

  const [config, setConfig]           = useState<AssistantConfig | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [configLoading, setCL]        = useState(true);
  const [avatarImgErr, setAvatarImgErr] = useState(false);
  const [sendHovered, setSendHovered] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "connecting" | "listening" | "speaking">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const pendingAssistantTextRef = useRef("");
  const pendingUserTranscriptRef = useRef("");
  const voiceSendQueueRef = useRef<string[]>([]);


  // Load config from API
  useEffect(() => {
    if (isPreview) { setCL(true); return; }
    if (!apiKey)   { setError("No API key provided"); setCL(false); return; }
    fetch(apiUrl("/api/embed/config"), { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.error) { setError(data.error as string); return; }
        const cfg = data as AssistantConfig;
        setConfig(cfg);
        setMessages([{ id: "welcome", role: "assistant", content: cfg.welcomeMessage }]);
      })
      .catch(() => setError("Failed to load assistant configuration"))
      .finally(() => setCL(false));
  }, [apiKey, isPreview]);

  // Preview mode — wait for postMessage from admin panel
  useEffect(() => {
    if (!isPreview) return;
    const announceReady = () => {
      window.parent?.postMessage({ type: "clara-admin-preview-ready" }, window.location.origin);
    };

    const applyPreviewConfig = (nextConfig: AssistantConfig) => {
      setConfig(nextConfig);
      setAvatarImgErr(false);
      setMessages([{ id: "welcome", role: "assistant", content: nextConfig.welcomeMessage }]);
      setError(null);
      setCL(false);
    };

    if (previewKey) {
      try {
        const storedPreview = window.sessionStorage.getItem(previewKey);
        if (storedPreview) {
          applyPreviewConfig(JSON.parse(storedPreview) as AssistantConfig);
        }
      } catch {}
    }

    function handle(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; payload?: AssistantConfig } | null;
      if (d?.type !== "clara-admin-preview-config" || !d.payload) return;
      applyPreviewConfig(d.payload);
    }

    window.addEventListener("message", handle);
    announceReady();
    const timer = window.setInterval(() => {
      if (!config) announceReady();
    }, 300);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", handle);
    };
  }, [config, isPreview, previewKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const stopVoiceRuntime = useCallback(() => {
    try { dataChannelRef.current?.close(); } catch {}
    try { peerRef.current?.close(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { remoteStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
      }
    } catch {}
    dataChannelRef.current = null;
    peerRef.current = null;
    micStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteAudioRef.current = null;
    pendingAssistantIdRef.current = null;
    pendingAssistantTextRef.current = "";
    pendingUserTranscriptRef.current = "";
    voiceSendQueueRef.current = [];
    setVoiceActive(false);
    setVoiceState("idle");
  }, []);

  useEffect(() => stopVoiceRuntime, [stopVoiceRuntime]);

  const appendVoiceAssistantDelta = useCallback((delta: string) => {
    if (!delta) return;
    if (!pendingAssistantIdRef.current) {
      const id = `va${Date.now()}`;
      pendingAssistantIdRef.current = id;
      pendingAssistantTextRef.current = "";
      setMessages((prev) => [...prev, { id, role: "assistant", content: "" }]);
    }
    pendingAssistantTextRef.current += delta;
    const targetId = pendingAssistantIdRef.current;
    setMessages((prev) => prev.map((m) => (
      m.id === targetId ? { ...m, content: pendingAssistantTextRef.current } : m
    )));
  }, []);

  const flushVoiceAssistantTurn = useCallback(() => {
    pendingAssistantIdRef.current = null;
    pendingAssistantTextRef.current = "";
  }, []);

  const addVoiceUserTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: `vu${Date.now()}`, role: "user", content: trimmed }]);
  }, []);

  const sendVoiceJson = useCallback((payload: unknown) => {
    const dc = dataChannelRef.current;
    const msg = JSON.stringify(payload);
    if (!dc || dc.readyState !== "open") {
      voiceSendQueueRef.current.push(msg);
      return false;
    }
    try {
      dc.send(msg);
      return true;
    } catch {
      voiceSendQueueRef.current.push(msg);
      return false;
    }
  }, []);

  const runVoiceRagAndRespond = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || !apiKey) return;

    addVoiceUserTranscript(trimmed);

    try {
      const res = await fetch(apiUrl("/api/embed/search"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: trimmed, limit: 6 }),
      });

      let context = "";
      if (res.ok) {
        const payload = await res.json().catch(() => ({} as { context?: string }));
        context = typeof payload.context === "string" ? payload.context.trim() : "";
      }

      if (context) {
        sendVoiceJson({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "system",
            content: [{ type: "input_text", text: `Context from knowledge base:\n${context}` }],
          },
        });
      }

      sendVoiceJson({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `Customer question:\n${trimmed}` }],
        },
      });

      sendVoiceJson({
        type: "response.create",
        response: {
          instructions: "Answer the customer clearly and concisely using the provided knowledge base context when relevant.",
          tool_choice: "none",
        },
      });
    } catch {
      sendVoiceJson({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      });
      sendVoiceJson({
        type: "response.create",
        response: {
          instructions: "Answer the customer clearly and concisely.",
          tool_choice: "none",
        },
      });
    }
  }, [addVoiceUserTranscript, apiKey, sendVoiceJson]);

  const waitForIceGathering = useCallback((pc: RTCPeerConnection) => {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc.removeEventListener("icegatheringstatechange", onState);
        resolve();
      };
      const onState = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      pc.addEventListener("icegatheringstatechange", onState);
      window.setTimeout(finish, 8000);
    });
  }, []);

  const ensureRemoteAudio = useCallback(() => {
    if (remoteAudioRef.current) return remoteAudioRef.current;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;
    return audio;
  }, []);

  const startVoiceRuntime = useCallback(async () => {
    if (!config || !apiKey) return;
    if (config.voiceProvider && config.voiceProvider !== "openai") {
      setMessages((prev) => [...prev, {
        id: `ve${Date.now()}`,
        role: "assistant",
        content: "This widget voice runtime currently supports the configured OpenAI voice path only.",
      }]);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.RTCPeerConnection === "undefined") {
      setMessages((prev) => [...prev, {
        id: `ve${Date.now()}`,
        role: "assistant",
        content: "Voice is unavailable in this browser.",
      }]);
      return;
    }
    if (peerRef.current && dataChannelRef.current?.readyState === "open") {
      setVoiceActive(true);
      if (voiceState === "idle") setVoiceState("listening");
      return;
    }

    setVoiceState("connecting");

    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    micStreamRef.current = mic;

    const pc = new RTCPeerConnection();
    peerRef.current = pc;
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      stream.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
      });
      const audio = ensureRemoteAudio();
      audio.srcObject = remoteStream;
      audio.muted = false;
      void audio.play().catch(() => {});
    };

    const dc = pc.createDataChannel("oai-events");
    dataChannelRef.current = dc;

    dc.onopen = () => {
      try {
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: `You are ${config.assistantName || "Clara"}, a helpful voice assistant for this knowledge base. Answer naturally, briefly, and use provided knowledge base context when it is available.`,
            tools: [{
              type: "function",
              name: "rag_search",
              description: "Search the active knowledge base for relevant information.",
              parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            }],
            tool_choice: "auto",
            modalities: ["audio", "text"],
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
              create_response: false,
            },
          },
        }));
      } catch {}

      const queued = voiceSendQueueRef.current;
      voiceSendQueueRef.current = [];
      for (const msg of queued) {
        try { dc.send(msg); } catch {}
      }

      setVoiceActive(true);
      setVoiceState("listening");
    };

    dc.onclose = () => {
      stopVoiceRuntime();
    };

    dc.onmessage = (event) => {
      let msg: Record<string, unknown> | null = null;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg?.type) return;

      if (msg.type === "input_audio_buffer.speech_started") {
        if (voiceState === "speaking") {
          sendVoiceJson({ type: "response.cancel" });
        }
        pendingAssistantIdRef.current = null;
        pendingAssistantTextRef.current = "";
        pendingUserTranscriptRef.current = "";
        setVoiceState("listening");
        return;
      }

      if (msg.type === "conversation.item.input_audio_transcription.delta") {
        const delta = typeof msg.delta === "string" ? msg.delta : "";
        if (delta) pendingUserTranscriptRef.current += delta;
        return;
      }

      if (msg.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = typeof msg.transcript === "string" && msg.transcript.trim()
          ? msg.transcript.trim()
          : pendingUserTranscriptRef.current.trim();
        pendingUserTranscriptRef.current = "";
        if (transcript) void runVoiceRagAndRespond(transcript);
        return;
      }

      if (msg.type === "response.created") {
        setVoiceActive(true);
        setVoiceState("speaking");
        return;
      }

      if (msg.type === "response.audio_transcript.delta" || msg.type === "response.text.delta") {
        appendVoiceAssistantDelta(typeof msg.delta === "string" ? msg.delta : "");
        setVoiceState("speaking");
        return;
      }

      if (msg.type === "response.done") {
        flushVoiceAssistantTurn();
        setVoiceState("listening");
        return;
      }

      if (msg.type === "error") {
        setMessages((prev) => [...prev, {
          id: `ve${Date.now()}`,
          role: "assistant",
          content: typeof msg.message === "string" ? msg.message : "Voice connection failed.",
        }]);
        stopVoiceRuntime();
      }
    };

    pc.addTrack(mic.getAudioTracks()[0], mic);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);
    const sdpOffer = pc.localDescription?.sdp || offer.sdp || "";

    const res = await fetch(apiUrl("/api/embed/voice-connect"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ sdpOffer }),
    });
    const payload = await res.json().catch(() => ({} as { error?: string; sdpAnswer?: string }));
    if (!res.ok || !payload?.sdpAnswer) {
      stopVoiceRuntime();
      setMessages((prev) => [...prev, {
        id: `ve${Date.now()}`,
        role: "assistant",
        content: payload?.error || "Voice connection failed.",
      }]);
      return;
    }

    await pc.setRemoteDescription({ type: "answer", sdp: payload.sdpAnswer });

    const welcomeMessage = typeof payload.welcomeMessage === "string" ? payload.welcomeMessage.trim() : "";
    if (welcomeMessage) {
      const assistantId = `va${Date.now()}`;
      pendingAssistantIdRef.current = assistantId;
      pendingAssistantTextRef.current = "";
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
      sendVoiceJson({
        type: "response.create",
        response: {
          instructions: `Greet the user with this message verbatim: ${JSON.stringify(welcomeMessage)}`,
          tool_choice: "none",
        },
      });
    } else {
      setVoiceActive(true);
      setVoiceState("listening");
    }
  }, [apiKey, appendVoiceAssistantDelta, config, ensureRemoteAudio, flushVoiceAssistantTurn, runVoiceRagAndRespond, sendVoiceJson, stopVoiceRuntime, voiceState, waitForIceGathering]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const nextText = (overrideText ?? input).trim();
    if (!nextText || loading || !config) return;
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: nextText };
    const all = [...messages, userMsg];
    setMessages(all);
    if (overrideText === undefined) setInput("");
    setLoading(true);
    const aid = `a${Date.now()}`;
    setMessages((p) => [...p, { id: aid, role: "assistant", content: "" }]);

    if (isPreview) {
      const ans = `Preview reply to: "${userMsg.content}". All design edits are live.`;
      const chunks = ans.match(/.{1,26}(\s|$)/g) ?? [ans];
      let i = 0;
      const tick = () => {
        if (i >= chunks.length) { setLoading(false); return; }
        const token = chunks[i];   // capture BEFORE incrementing
        i++;
        setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: m.content + token } : m));
        window.setTimeout(tick, 35);
      };
      tick(); return;
    }

    try {
      const res = await fetch(apiUrl("/api/embed/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ messages: all.filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok || !res.body) {
        setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: "Sorry, an error occurred." } : m));
        return;
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
          try {
            const ev = JSON.parse(line) as { type: string; payload: unknown };
            if (ev.type === "token")
              setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: m.content + String(ev.payload) } : m));
            else if (ev.type === "sources")
              setMessages((p) => p.map((m) => m.id === aid ? { ...m, sources: ev.payload as Message["sources"] } : m));
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages((p) => p.map((m) => m.id === aid ? { ...m, content: "Network error." } : m));
    } finally { setLoading(false); }
  }, [input, loading, config, messages, apiKey, isPreview]);

  useEffect(() => {
    function handleWidgetCommand(ev: MessageEvent) {
      const data = ev.data as WidgetCommandMessage;
      if (data?.type !== "clara-widget-command" || !data.payload) return;

      if (data.payload.action === "send" && data.payload.text) {
        void sendMessage(data.payload.text);
        return;
      }

      if (data.payload.action === "startVoice") {
        void startVoiceRuntime();
        return;
      }

      if (data.payload.action === "stopVoice") {
        stopVoiceRuntime();
      }
    }

    window.addEventListener("message", handleWidgetCommand);
    return () => window.removeEventListener("message", handleWidgetCommand);
  }, [sendMessage, startVoiceRuntime, stopVoiceRuntime]);


  // ── Resolve design tokens — explicit trim guards so empty string → fallback ─
  const primary  = (config?.primaryColour  && config.primaryColour.trim())  ? config.primaryColour.trim()  : "#6366f1";
  const accent   = (config?.accentColour   && config.accentColour.trim())   ? config.accentColour.trim()   : "#818cf8";
  const dark     = config?.widgetTheme === "dark";

  const hdrBg    = (config?.headerBg       && config.headerBg.trim())       ? config.headerBg.trim()       : primary;
  const hdrTxt   = (config?.headerTextColor && config.headerTextColor.trim()) ? config.headerTextColor.trim() : "#ffffff";
  const hdrH     = config?.headerHeight    ?? 60;

  const chatBg   = (config?.chatAreaBg     && config.chatAreaBg.trim())     ? config.chatAreaBg.trim()
                   : (dark ? "#0f0f1a" : "#f8f9fd");

  const userBg   = (config?.userBubbleBg   && config.userBubbleBg.trim())   ? config.userBubbleBg.trim()   : primary;
  const userTxt  = (config?.userBubbleText  && config.userBubbleText.trim()) ? config.userBubbleText.trim() : "#ffffff";
  const userR    = config?.userBubbleRadius  || "18px 18px 4px 18px";
  const userP    = config?.userBubblePadding || "10px 14px";
  const userShadow = config?.userBubbleShadow || "0 1px 4px rgba(0,0,0,0.15)";

  const botBg    = (config?.botBubbleBg    && config.botBubbleBg.trim())    ? config.botBubbleBg.trim()
                   : (dark ? "#2a2a40" : "#f0f0f8");
  const botTxt   = (config?.botBubbleText  && config.botBubbleText.trim())  ? config.botBubbleText.trim()
                   : (dark ? "#e2e2f0" : "#1f2937");
  const botR     = config?.botBubbleRadius  || "18px 18px 18px 4px";
  const botP     = config?.botBubblePadding || "10px 14px";
  const botBorder  = (config?.botBubbleBorder && config.botBubbleBorder.trim()) ? config.botBubbleBorder.trim()
                   : `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`;
  const botShadow  = config?.botBubbleShadow || "0 1px 3px rgba(0,0,0,0.08)";

  const msgGap   = config?.messageGap      ?? 12;
  const msgMaxW  = config?.messageMaxWidth ?? 85;
  const fontSize = config?.messageFontSize ?? 13;
  const lineH    = config?.messageLineHeight ?? 1.5;

  const fontFamily  = (config?.widgetFontFamily && config.widgetFontFamily.trim())
                      ? config.widgetFontFamily.trim() : "system-ui,-apple-system,sans-serif";
  const radius      = config?.widgetBorderRadius ?? 18;

  const inputBg  = (config?.inputBg        && config.inputBg.trim())        ? config.inputBg.trim()
                   : (dark ? "#1a1a2e" : "#ffffff");
  const inputBrd = (config?.inputBorder    && config.inputBorder.trim())    ? config.inputBorder.trim()
                   : `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#e5e7eb"}`;
  const inputR   = config?.inputRadius     ?? 12;
  const inputTxt = (config?.inputTextColor && config.inputTextColor.trim()) ? config.inputTextColor.trim()
                   : (dark ? "#e2e2f0" : "#1f2937");
  const inputPh  = (config?.inputPlaceholderColor && config.inputPlaceholderColor.trim())
                   ? config.inputPlaceholderColor.trim()
                   : (dark ? "#555575" : "#9ca3af");
  const inputPad    = config?.inputPadding    || "8px 12px";
  const inputAreaBg = (config?.inputAreaBg    && config.inputAreaBg.trim())    ? config.inputAreaBg.trim()
                      : (dark ? "#0f0f1a" : "#ffffff");
  const inputAreaB  = (config?.inputAreaBorder && config.inputAreaBorder.trim()) ? config.inputAreaBorder.trim()
                      : `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`;

  const sendBg   = (config?.sendBtnBg      && config.sendBtnBg.trim())      ? config.sendBtnBg.trim()      : primary;
  const sendR    = config?.sendBtnRadius   ?? 10;
  const sendSz   = config?.sendBtnSize     ?? 36;
  const sendTxt  = (config?.sendBtnTextColor && config.sendBtnTextColor.trim()) ? config.sendBtnTextColor.trim() : "#ffffff";
  // Voice button
  const voiceBtnBg      = (config?.voiceBtnBg && config.voiceBtnBg.trim()) ? config.voiceBtnBg.trim() : (dark ? "#2a2a40" : "#e5e7eb");
  const voiceBtnSz      = config?.voiceBtnSize   ?? 36;
  const voiceBtnR       = config?.voiceBtnRadius  ?? 10;
  const voiceActive2Color = (config?.voiceBtnActiveColor && config.voiceBtnActiveColor.trim()) ? config.voiceBtnActiveColor.trim() : "#ef4444";
  const voicePanelBg    = (config?.voicePanelBg && config.voicePanelBg.trim())
    ? config.voicePanelBg.trim()
    : (dark ? "rgba(39,39,59,0.92)" : "#eef2ff");
  const voiceWaveColor  = (config?.voiceWaveColor && config.voiceWaveColor.trim()) ? config.voiceWaveColor.trim() : accent;
  const showVoice = Boolean(config?.voiceEnabled);
  const dotColor   = (config?.typingDotColor  && config.typingDotColor.trim())  ? config.typingDotColor.trim()  : "#9ca3af";
  const dotSz      = config?.typingDotSize   ?? 6;
  const scrollW    = config?.scrollbarWidth  ?? 4;
  const scrollC    = (config?.scrollbarColor && config.scrollbarColor.trim())   ? config.scrollbarColor.trim()   : "#c7d2fe";
  const scrollT    = (config?.scrollbarTrackColor && config.scrollbarTrackColor.trim()) ? config.scrollbarTrackColor.trim() : "transparent";
  const footerTxt  = (config?.footerTextColor && config.footerTextColor.trim()) ? config.footerTextColor.trim()
                     : (dark ? "#4a4a6a" : "#d1d5db");
  const footerBg2  = (config?.footerBg       && config.footerBg.trim())         ? config.footerBg.trim()         : "transparent";
  const avatarBr   = config?.avatarShape === "square" ? "4px"
                   : config?.avatarShape === "rounded" ? "8px" : "50%";
  const animStyle  = config?.messageAnimationStyle ?? "fade";
  const themeCss   = config?.customThemeCss  ?? "";
  const customCss  = config?.customCss       ?? "";

  const globalCss = `
    .cw-msgs::-webkit-scrollbar { width: ${scrollW}px; }
    .cw-msgs::-webkit-scrollbar-track { background: ${scrollT}; }
    .cw-msgs::-webkit-scrollbar-thumb { background: ${scrollC}; border-radius: 99px; }
    .cw-msg { animation: ${
      animStyle === "slide" ? "cwSlideIn 0.22s ease" :
      animStyle === "pop"   ? "cwPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1)" :
      animStyle === "none"  ? "none" :
      "cwFadeIn 0.18s ease"
    } both; }
    @keyframes cwFadeIn  { from { opacity:0; transform:translateY(6px) } }
    @keyframes cwSlideIn { from { opacity:0; transform:translateX(20px) } }
    @keyframes cwPopIn   { from { opacity:0; transform:scale(0.88) } }
    @keyframes cwBounce  { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
    textarea.clara-textarea::placeholder,
    .clara-textarea::placeholder { color: ${inputPh} !important; }
    ${themeCss}
    ${customCss}
  `;

  if (configLoading) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",
        height:"100dvh",fontFamily:"system-ui,sans-serif",color:"#9ca3af",fontSize:"14px" }}>
        {isPreview ? "Waiting for preview config…" : "Loading assistant…"}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",
        height:"100dvh",fontFamily:"system-ui,sans-serif",padding:"24px" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"32px",marginBottom:"8px" }}>⚠️</div>
          <div style={{ color:"#dc2626",fontSize:"13px" }}>{error}</div>
        </div>
      </div>
    );
  }

  const avatarLetter = config?.assistantName?.charAt(0)?.toUpperCase() ?? "A";

  return (
    <div className="clara-widget" style={{
      display:"flex",flexDirection:"column",height:"100dvh",minHeight:"100vh",
      fontFamily,background:chatBg,color:dark?"#e2e2f0":"#1f2937",
      borderRadius:radius,overflow:"hidden",
    }}>
      <style>{globalCss}</style>

      {/* Header */}
      <div className="clara-header" style={{
        display:"flex",alignItems:"center",gap:"12px",padding:"0 16px",
        height:hdrH,
        background:hdrBg,    /* explicit inline style — always wins over CSS class rules */
        color:hdrTxt,
        flexShrink:0,
        backdropFilter:       config?.headerBlur ? "blur(12px)" : undefined,
        WebkitBackdropFilter: config?.headerBlur ? "blur(12px)" : undefined,
      }}>
        {config?.avatarUrl && !avatarImgErr
          ? <img
              key={config.avatarUrl}
              src={config.avatarUrl} alt="" className="clara-avatar"
              onError={() => setAvatarImgErr(true)}
              style={{ width:32,height:32,borderRadius:avatarBr,objectFit:"cover",flexShrink:0 }} />
          : <div className="clara-avatar" style={{
              width:32,height:32,borderRadius:avatarBr,background:accent,
              color:hdrTxt,   /* use header text colour, not primary */
              display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,
              fontSize:14,flexShrink:0 }}>
              {avatarLetter}
            </div>
        }
        <div style={{ flex:1,minWidth:0 }}>
          <div className="clara-header-name" style={{ fontWeight:600,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
            {config?.assistantName}
          </div>
          {config?.showStatusDot !== false && (
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span className="clara-header-status" style={{
                width:7,height:7,borderRadius:"50%",background:config?.statusDotColor??"#4ade80",
                display:"inline-block",flexShrink:0 }} />
              <span style={{ fontSize:11,opacity:0.75 }}>Online</span>
            </div>
          )}
        </div>
        {config?.customHeaderHtml && (
          <div dangerouslySetInnerHTML={{ __html: config.customHeaderHtml }}
            style={{ display:"flex",alignItems:"center" }} />
        )}
      </div>

      {/* Messages */}
      <div className="cw-msgs clara-messages" style={{
        flex:1,overflowY:"auto",padding:"16px",
        display:"flex",flexDirection:"column",gap:msgGap,background:chatBg,
      }}>
        {messages.map((msg) => (
          <div key={msg.id} className="cw-msg" style={{
            display:"flex",
            justifyContent:msg.role==="user"?"flex-end":"flex-start",
          }}>
            <div className={msg.role==="user"?"clara-msg-user":"clara-msg-bot"}
              style={{
                maxWidth:`${msgMaxW}%`,
                borderRadius:msg.role==="user"?userR:botR,
                padding:msg.role==="user"?userP:botP,
                fontSize,lineHeight:lineH,
                background:msg.role==="user"?userBg:botBg,
                color:msg.role==="user"?userTxt:botTxt,
                border:msg.role==="user"?"none":botBorder,
                boxShadow:msg.role==="user"?userShadow:botShadow,
                wordBreak:"break-word",
              }}>
              {msg.content||<span style={{display:"flex",gap:4,alignItems:"center"}}>
                {[0,150,300].map((d)=>(
                  <span key={d} className="clara-typing-dot" style={{
                    width:dotSz,height:dotSz,borderRadius:"50%",background:dotColor,
                    display:"inline-block",animation:`cwBounce 1.2s ${d}ms infinite`,
                  }}/>
                ))}</span>}
              {msg.sources&&msg.sources.length>0&&(
                <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.1)"}}>
                  {msg.sources.slice(0,3).map((s)=>(
                    <div key={s.index} className="clara-sources" style={{fontSize:11,
                      color:msg.role==="user"?"rgba(255,255,255,0.7)":"#6b7280",marginBottom:2}}>
                      <strong style={{color:msg.role==="user"?"#fff":primary}}>[S{s.index}]</strong>{" "}{s.title}
                    </div>
                  ))}
                </div>
              )}
              {config?.showTimestamps&&(
                <div className="clara-timestamp" style={{
                  fontSize:config?.timestampFontSize??10,
                  color:config?.timestampColor??"#9ca3af",opacity:0.65,marginTop:4,
                }}>now</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="clara-input-area" style={{
        borderTop:`${inputAreaB}`,padding:"12px",
        paddingBottom:"calc(12px + env(safe-area-inset-bottom))",
        background:inputAreaBg,flexShrink:0,
      }}>
        <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
          <textarea value={input} rows={1}
            onChange={(e)=>setInput(e.target.value)}
            onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendMessage();}}}
            placeholder={`Ask ${config?.assistantName??"the assistant"}…`}
            disabled={loading}
            className="clara-textarea"
            style={{
              flex:1,resize:"none",borderRadius:inputR,border:inputBrd,
              padding:inputPad,fontSize:13,fontFamily:"inherit",
              outline:"none",lineHeight:1.5,maxHeight:100,overflowY:"auto",
              opacity:loading?0.5:1,background:inputBg,color:inputTxt,
            }}/>
          {/* Voice button — only shown when voiceEnabled is true */}
          {showVoice && (
            <button
              onClick={()=>{ if (voiceActive) stopVoiceRuntime(); else void startVoiceRuntime(); }}
              title={voiceActive ? "Stop voice" : "Start voice"}
              className="clara-voice-btn"
              style={{
                flexShrink:0,width:voiceBtnSz,height:voiceBtnSz,borderRadius:voiceBtnR,
                background: voiceActive ? voiceActive2Color : voiceBtnBg,
                color: voiceActive ? "#fff" : (dark?"#9ca3af":"#6b7280"),
                border:"none",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                transition:"background 0.18s, transform 0.1s",
                transform: voiceActive ? "scale(1.08)" : "scale(1)",
              }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                {voiceActive
                  ? <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm0 16a7 7 0 0 1-7-7H3a9 9 0 0 0 8 8.94V21h2v-2.06A9 9 0 0 0 21 10h-2a7 7 0 0 1-7 7z"/>
                  : <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 3.02-3.04 5.35-6.12 5.35S5.58 14.02 5.09 11H3.07c.52 3.85 3.65 6.83 7.43 7.18V21h3v-2.82c3.78-.35 6.91-3.33 7.43-7.18h-2.02z"/>
                }
              </svg>
            </button>
          )}
          {/* Send button */}
          <button onClick={()=>void sendMessage()}
            disabled={!input.trim()||loading}
            onMouseEnter={()=>setSendHovered(true)}
            onMouseLeave={()=>setSendHovered(false)}
            className="clara-send-btn"
            style={{
              flexShrink:0,width:sendSz,height:sendSz,borderRadius:sendR,
              background: (!input.trim()||loading)
                ? (dark?"#2a2a40":"#e5e7eb")
                : sendHovered
                  ? ((config?.sendBtnHoverBg && config.sendBtnHoverBg.trim()) ? config.sendBtnHoverBg.trim() : sendBg)
                  : sendBg,
              color:(!input.trim()||loading)?(dark?"#555":"#aaa"):sendTxt,
              border:"none",
              cursor:(!input.trim()||loading)?"not-allowed":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"background 0.18s, transform 0.1s",
              transform: sendHovered && input.trim() && !loading ? "scale(1.06)" : "scale(1)",
            }}>
            <svg className="clara-send-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        {showVoice && voiceActive && (
          <div style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: Math.max(12, voiceBtnR),
            background: voicePanelBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#f5f7ff" : "#1f2937" }}>
                Voice mode active
              </div>
              <div style={{ fontSize: 11, color: dark ? "#a5b0c5" : "#6b7280", marginTop: 2 }}>
                Voice controls render through the widget runtime.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 18 }}>
              {[8, 14, 10, 16].map((h, i) => (
                <span key={i} style={{
                  width: 4,
                  height: h,
                  borderRadius: 999,
                  background: voiceWaveColor,
                  opacity: 0.95,
                }} />
              ))}
            </div>
          </div>
        )}
        {Boolean(config?.widgetShowBranding) && (
          <div className="clara-branding" style={{textAlign:"center",marginTop:8,background:footerBg2}}>
            {config?.customFooterHtml
              ? <span dangerouslySetInnerHTML={{__html:config.customFooterHtml}}/>
              : <span style={{fontSize:10,color:footerTxt}}>
                  {(config?.customPoweredBy && config.customPoweredBy.trim())
                    ? config.customPoweredBy.trim()
                    : "Powered by Clara AI"}
                </span>
            }
          </div>
        )}
      </div>
    </div>
  );
}

export default function EmbedWidgetPage() {
  return (
    <Suspense fallback={
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",
        height:"100dvh",fontFamily:"system-ui,sans-serif",color:"#9ca3af",fontSize:"14px"}}>
        Loading…
      </div>
    }>
      <WidgetContent/>
    </Suspense>
  );
}
