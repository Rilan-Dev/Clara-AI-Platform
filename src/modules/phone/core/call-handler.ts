/**
 * src/modules/phone/core/call-handler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The core AI bridge for live phone calls.
 *
 * Architecture (identical to voice chat but for telephony audio):
 *
 *   Phone WebSocket (Twilio/Vonage)
 *       │ raw audio (mulaw 8kHz or L16 16kHz)
 *       ↓
 *   CallHandler
 *       ├── decode + resample → PCM16 24kHz
 *       ├── forward to OpenAI Realtime API (server-side, keys never exposed)
 *       ├── on transcription → POST /api/embed/search → get KB context
 *       ├── inject context → conversation.item.create
 *       ├── response.create (create_response:false on VAD = AI waits for RAG)
 *       └── receive AI audio → resample back → send to phone
 *
 * Design decisions:
 *   - create_response: false on VAD — AI waits until RAG context is injected
 *   - RAG search happens server-side — same /api/embed/search endpoint
 *   - Full transcript is logged to phone_call_logs in real-time
 *   - Max call duration enforced server-side
 */
import WebSocket from "ws";
import {
  getAssistantConfig,
  getKnowledgeBaseById,
} from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { resolveAIConfig }   from "@/modules/ai-core/resolve";
import { insertCallLog, updateCallLog } from "./db";
import type { PhoneCallConfig, PhoneProvider } from "./types";
import {
  pcm16ToMulaw, mulawToPcm16, resample8To24kHz, resample24To8kHz,
} from "../providers/twilio";
import { resample16To24kHz, resample24To16kHz } from "../providers/vonage";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;

// ── CallHandler ────────────────────────────────────────────────────────────────

export class CallHandler {
  private phoneWs:        WebSocket;
  private openaiWs:       WebSocket | null = null;
  private logId:          string | null = null;
  private callSid:        string;
  private kbId:           string;
  private provider:       PhoneProvider;
  private audioFormat:    "mulaw_8khz" | "linear16_16khz";
  private config:         PhoneCallConfig;
  private startedAt:      Date;
  private transcript:     Array<{ speaker: "user"|"assistant"; text: string; ts: string }> = [];
  private turnCount       = 0;
  private userQuery       = "";
  private ragAbort:       AbortController | null = null;
  private callTimer:      NodeJS.Timeout | null = null;
  private toolBuf:        Record<string, string> = {};
  private activeTurnId:   string | null = null;

  constructor(
    phoneWs: WebSocket,
    callSid: string,
    kbId: string,
    provider: PhoneProvider,
    audioFormat: "mulaw_8khz" | "linear16_16khz",
    config: PhoneCallConfig,
  ) {
    this.phoneWs    = phoneWs;
    this.callSid    = callSid;
    this.kbId       = kbId;
    this.provider   = provider;
    this.audioFormat = audioFormat;
    this.config     = config;
    this.startedAt  = new Date();
  }

  async start(): Promise<void> {
    // ── 1. Create call log entry ──────────────────────────────────────────────
    this.logId = await insertCallLog({
      configId: this.config.id,
      kbId: this.kbId,
      provider: this.provider,
      callSid: this.callSid,
      fromNumber: null,
      toNumber: this.config.phoneNumber,
    });

    // ── 2. Load KB config + build system prompt ───────────────────────────────
    const [kb, assistantConfig] = await Promise.all([
      getKnowledgeBaseById(this.kbId),
      getAssistantConfig(this.kbId),
    ]);
    if (!kb || !assistantConfig) {
      this.endCall("KB not found");
      return;
    }

    const resolved     = await resolveAIConfig({ kbId: this.kbId, surface: "embed" });
    const basePrompt   = buildSystemPrompt(assistantConfig, { kbName: kb.name });
    // Append phone-specific instruction — keep responses concise and avoid markdown
    const instructions = `${basePrompt}\n\nYou are answering a live phone call. Be concise, natural, and conversational. Do not use markdown formatting or bullet points.`;

    const model              = resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    const voice              = resolved.voiceId ?? assistantConfig.voiceId ?? "alloy";
    const temperature        = resolved.temperature ?? assistantConfig.temperature ?? 0.8;
    const transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    const language           = assistantConfig.alwaysRespondIn ?? assistantConfig.defaultLanguage ?? "en";
    const apiKey             = process.env.OPENAI_API_KEY!;

    // ── 3. Create OpenAI Realtime session + connect WebSocket ─────────────────
    const sessRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "OpenAI-Beta": "realtime=v1" },
      body: JSON.stringify({
        model, voice, modalities: ["audio", "text"], instructions, temperature,
        max_response_output_tokens: resolved.maxTokens ?? 500,
        turn_detection: {
          type: "server_vad", threshold: 0.5,
          prefix_padding_ms: 300, silence_duration_ms: 700,
          create_response: false, // wait for RAG inject
        },
        input_audio_transcription: { model: transcriptionModel, language },
        tools: [{
          type: "function", name: "rag_search",
          description: `Search "${kb.name}" knowledge base.`,
          parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        }],
      }),
    });
    if (!sessRes.ok) { this.endCall("OpenAI session failed"); return; }

    const session   = await sessRes.json() as Record<string, unknown>;
    const ephemeral =
      ((session?.client_secret as Record<string, unknown>)?.value as string) ??
      (session?.client_secret as string);
    if (!ephemeral) { this.endCall("No ephemeral key"); return; }

    // ── 4. Open OpenAI Realtime WebSocket (server-to-server) ─────────────────
    this.openaiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      { headers: { Authorization: `Bearer ${ephemeral}`, "OpenAI-Beta": "realtime=v1" } }
    );

    this.openaiWs.on("open", () => {
      // Mark call as answered
      updateCallLog(this.callSid, { status: "in-progress", answeredAt: new Date() }).catch(() => {});

      // Send greeting
      const greeting = this.config.greetingMessage;
      if (greeting.trim()) {
        this.sendToOpenAI({
          type: "response.create",
          response: { instructions: `Say exactly: "${greeting}"`, tool_choice: "none" },
        });
      }

      // Max duration enforcement
      this.callTimer = setTimeout(() => {
        this.sendToOpenAI({
          type: "response.create",
          response: { instructions: "Tell the user the maximum call time has been reached and say goodbye politely.", tool_choice: "none" },
        });
        setTimeout(() => this.endCall("max duration"), 10_000);
      }, this.config.maxCallDurationSec * 1000);
    });

    this.openaiWs.on("message", (data: WebSocket.RawData) => {
      this.handleOpenAIMessage(JSON.parse(data.toString()) as Record<string, unknown>);
    });

    this.openaiWs.on("close",  () => this.endCall("openai closed"));
    this.openaiWs.on("error",  () => this.endCall("openai error"));

    // ── 5. Handle phone audio → OpenAI ───────────────────────────────────────
    this.phoneWs.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) return this.handlePhoneTextMessage(data.toString());
      this.forwardAudioToOpenAI(data as Buffer);
    });

    this.phoneWs.on("close",  () => this.endCall("phone disconnected"));
    this.phoneWs.on("error",  () => this.endCall("phone error"));
  }

  // ── Public helpers called by phone-stream.mjs before start() ────────────────

  /** Called for Twilio media frames buffered before the start event */
  _forwardTwilioFrame(msg: Record<string, unknown>): void {
    const payload = (msg as { media?: { payload?: string } }).media?.payload;
    if (payload) this.forwardAudioToOpenAI(Buffer.from(payload, "base64"));
  }

  /** Called for Vonage raw binary audio frames buffered before metadata */
  _handleRawAudio(buf: Buffer): void {
    this.forwardAudioToOpenAI(buf);
  }

  // ── Forward phone audio to OpenAI ──────────────────────────────────────────
  private forwardAudioToOpenAI(rawBuf: Buffer): void {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) return;

    let pcm24k: Buffer;
    if (this.audioFormat === "mulaw_8khz") {
      const pcm8k = mulawToPcm16(rawBuf);
      pcm24k      = resample8To24kHz(pcm8k);
    } else {
      // linear16_16khz from Vonage
      pcm24k = resample16To24kHz(rawBuf);
    }

    this.sendToOpenAI({
      type: "input_audio_buffer.append",
      audio: pcm24k.toString("base64"),
    });
  }

  // ── Handle text control messages from phone provider ───────────────────────
  private handlePhoneTextMessage(text: string): void {
    try {
      const msg = JSON.parse(text) as Record<string, unknown>;
      const ev  = msg.event as string ?? msg.type as string ?? "";

      // Twilio sends JSON messages with event field
      if (ev === "connected" || ev === "start") return;
      if (ev === "stop") { this.endCall("call ended"); return; }
      if (ev === "mark")  return; // Twilio mark event — ignore

      // Vonage sends JSON at call start with metadata
      if (typeof msg.uuid === "string") return; // Vonage call info
    } catch { /* not JSON */ }
  }

  // ── Handle OpenAI Realtime events ──────────────────────────────────────────
  private handleOpenAIMessage(msg: Record<string, unknown>): void {
    const type = typeof msg.type === "string" ? msg.type : "";

    // VAD: user started speaking
    if (type === "input_audio_buffer.speech_started") {
      this.userQuery = "";
    }

    // Streaming transcription
    if (type === "conversation.item.input_audio_transcription.delta") {
      const d = typeof msg.delta === "string" ? msg.delta : "";
      if (d) this.userQuery += d;
    }

    // Transcription complete → RAG search → inject → respond
    if (type === "conversation.item.input_audio_transcription.completed") {
      const final = typeof msg.transcript === "string" ? msg.transcript : this.userQuery;
      if (final.trim()) {
        this.userQuery = final;
        this.transcript.push({ speaker: "user", text: final.trim(), ts: new Date().toISOString() });
        this.turnCount++;
        void this.ragAndRespond();
      }
    }

    // AI audio → forward to phone
    if (type === "response.audio.delta") {
      const b64 = typeof msg.delta === "string" ? msg.delta : "";
      if (b64) this.forwardAudioToPhone(Buffer.from(b64, "base64"));
    }

    // AI text transcript — append to log
    if (type === "response.audio_transcript.delta" || type === "response.text.delta") {
      const d = typeof msg.delta === "string" ? msg.delta : "";
      if (d && this.activeTurnId) {
        const turn = this.transcript.find(t => t.speaker === "assistant" && t.ts === this.activeTurnId);
        if (turn) turn.text += d;
        else {
          this.activeTurnId = new Date().toISOString();
          this.transcript.push({ speaker: "assistant", text: d, ts: this.activeTurnId });
        }
      }
    }

    if (type === "response.created") {
      this.activeTurnId = new Date().toISOString();
      this.transcript.push({ speaker: "assistant", text: "", ts: this.activeTurnId });
    }

    if (type === "response.done") {
      this.activeTurnId = null;
      updateCallLog(this.callSid, { turnCount: this.turnCount, transcript: this.transcript }).catch(() => {});
    }

    // Tool call — return empty output (we inject context proactively)
    if (type === "response.function_call_arguments.delta") {
      const cid = typeof msg.call_id === "string" ? msg.call_id : null;
      const d   = typeof msg.delta   === "string" ? msg.delta   : "";
      if (cid && d) this.toolBuf[cid] = (this.toolBuf[cid] ?? "") + d;
    }
    if (type === "response.function_call_arguments.done") {
      const cid = typeof msg.call_id === "string" ? msg.call_id : null;
      if (cid) {
        delete this.toolBuf[cid];
        this.sendToOpenAI({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: cid,
            output: JSON.stringify({ info: "Context injected via system message." }) },
        });
        this.sendToOpenAI({ type: "response.create" });
      }
    }
  }

  // ── RAG search then inject context ─────────────────────────────────────────
  private async ragAndRespond(): Promise<void> {
    const query = this.userQuery.trim();
    if (!query) return;

    this.ragAbort?.abort();
    const ctrl = new AbortController();
    this.ragAbort = ctrl;

    try {
      // Use internal API endpoint — same one used by voice chat
      const res = await fetch(`${BASE_URL}/api/embed/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json",
          // Use a special internal header — phone calls bypass embed key auth
          "x-phone-internal": "1",
          "x-kb-id": this.kbId },
        body: JSON.stringify({ query, limit: 5 }),
        signal: ctrl.signal,
      });

      const context = res.ok
        ? ((await res.json() as Record<string, unknown>).context as string ?? "")
        : "";

      if (this.ragAbort !== ctrl) return;

      if (context.trim()) {
        this.sendToOpenAI({
          type: "conversation.item.create",
          item: { type: "message", role: "system",
            content: [{ type: "input_text",
              text: `Phone call context:\n\n${context.trim()}\n\nAnswer the caller's question naturally and concisely.` }] },
        });
      }

      this.sendToOpenAI({
        type: "conversation.item.create",
        item: { type: "message", role: "user",
          content: [{ type: "input_text", text: query }] },
      });

      this.sendToOpenAI({ type: "response.create", response: { tool_choice: "none" } });
      this.userQuery = "";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // Respond without context on RAG failure
      this.sendToOpenAI({ type: "response.create", response: { tool_choice: "none" } });
    } finally {
      if (this.ragAbort === ctrl) this.ragAbort = null;
    }
  }

  // ── Forward OpenAI audio output back to phone ───────────────────────────────
  private forwardAudioToPhone(pcm24k: Buffer): void {
    if (this.phoneWs.readyState !== WebSocket.OPEN) return;

    if (this.audioFormat === "mulaw_8khz") {
      const pcm8k    = resample24To8kHz(pcm24k);
      const mulaw    = pcm16ToMulaw(pcm8k);
      const b64      = mulaw.toString("base64");
      // Twilio expects JSON with media payload
      this.phoneWs.send(JSON.stringify({
        event: "media",
        streamSid: this.callSid,
        media: { payload: b64 },
      }));
    } else {
      // Vonage expects raw binary L16 at 16kHz
      const pcm16k = resample24To16kHz(pcm24k);
      this.phoneWs.send(pcm16k);
    }
  }

  private sendToOpenAI(obj: unknown): void {
    if (this.openaiWs?.readyState === WebSocket.OPEN) {
      try { this.openaiWs.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }

  private endCall(reason: string): void {
    if (this.callTimer) { clearTimeout(this.callTimer); this.callTimer = null; }
    this.ragAbort?.abort();
    try { this.openaiWs?.close(1000); } catch { /* ignore */ }
    const ended  = new Date();
    const durSec = Math.round((ended.getTime() - this.startedAt.getTime()) / 1000);
    updateCallLog(this.callSid, {
      status:      reason === "phone disconnected" || reason === "call ended" ? "completed" : "failed",
      endedAt:     ended,
      durationSec: durSec,
      turnCount:   this.turnCount,
      transcript:  this.transcript,
      errorMessage: ["phone disconnected","call ended","max duration","openai closed"].includes(reason) ? undefined : reason,
    }).catch(() => {});
  }
}
