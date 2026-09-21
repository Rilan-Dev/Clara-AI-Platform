import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import Redis from "ioredis";

const PREFIX = "clara:elevenlabs:speech-engine:";
const TTL = 15 * 60;
let redis;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST ?? "redis",
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redis;
}

export async function registerElevenLabsSpeechEngineConversation(conversationId, context) {
  if (!conversationId) throw new Error("conversationId is required");
  await getRedis().setex(PREFIX + conversationId, TTL, JSON.stringify(context));
}

export async function removeElevenLabsSpeechEngineConversation(conversationId) {
  if (conversationId) await getRedis().del(PREFIX + conversationId);
}

async function getContext(conversationId) {
  const raw = await getRedis().get(PREFIX + conversationId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function toClaraMessages(transcript) {
  return transcript
    .filter((item) => item && (item.role === "user" || item.role === "agent") && typeof item.content === "string")
    .map((item) => ({
      role: item.role === "agent" ? "assistant" : "user",
      content: item.content,
    }))
    .filter((item) => item.content.trim());
}

async function* readClaraStream(response, signal, telemetry = {}) {
  const reader = response.body.getReader();
  const startedAt = Number(telemetry.startedAt ?? Date.now());
  let firstTokenLogged = false;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal.aborted) return;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "token" && typeof event.payload === "string" && event.payload) {
            if (!firstTokenLogged) {
              firstTokenLogged = true;
              console.info("[elevenlabs-speech-engine] clara.first_token", {
                conversationId: telemetry.conversationId,
                ms: Date.now() - startedAt,
              });
            }
            yield event.payload;
          }
        } catch {
          // Ignore partial SSE/JSON lines; the next chunk may complete them.
        }
      }
    }

    if (buffer.trim() && !signal.aborted) {
      try {
        const event = JSON.parse(buffer);
        if (event.type === "token" && typeof event.payload === "string" && event.payload) {
          if (!firstTokenLogged) {
            firstTokenLogged = true;
            console.info("[elevenlabs-speech-engine] clara.first_token", {
              conversationId: telemetry.conversationId,
              ms: Date.now() - startedAt,
            });
          }
          yield event.payload;
        }
      } catch {}
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

export async function attachElevenLabsSpeechEngine(httpServer) {
  const engineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!engineId || !apiKey) {
    console.warn("[elevenlabs-speech-engine] disabled: configure ELEVENLABS_SPEECH_ENGINE_ID and ELEVENLABS_API_KEY");
    return null;
  }

  const client = new ElevenLabsClient({ apiKey });
  const engine = await client.speechEngine.get(engineId);

  const attachment = await engine.attach(httpServer, "/api/voice/elevenlabs/speech-engine", {
    debug: process.env.ELEVENLABS_SPEECH_ENGINE_DEBUG === "true",
    onInit(conversationId) {
      console.info("[elevenlabs-speech-engine] initialized", { conversationId });
    },
    async onTranscript(transcript, signal, session) {
      const context = await getContext(session.conversationId);
      if (!context) {
        console.warn("[elevenlabs-speech-engine] rejected conversation without Clara context", {
          conversationId: session.conversationId,
        });
        session.close();
        return;
      }

      const messages = toClaraMessages(transcript);
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      if (!lastUser) return;

      const turnStartedAt = Date.now();
      console.info("[elevenlabs-speech-engine] turn.start", {
        conversationId: session.conversationId,
        transcriptMessages: messages.length,
        userChars: lastUser.content.length,
      });

      const endpoint = context.surface === "embed" ? "/api/embed/chat" : "/api/chat";
      const baseUrl = context.baseUrl.replace(/\/$/, "");

      const chatStartedAt = Date.now();
      const response = await fetch(baseUrl + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: context.authorization,
          "x-clara-voice-provider": "elevenlabs-speech-engine",
          "x-clara-realtime": "true",
        },
        body: JSON.stringify({
          kbId: context.kbId,
          messages,
          sessionId: session.conversationId,
          realtimeVoice: true,
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Clara chat failed: HTTP ${response.status}`);
      }

      console.info("[elevenlabs-speech-engine] clara.response_headers", {
        conversationId: session.conversationId,
        ms: Date.now() - chatStartedAt,
        status: response.status,
      });

      await session.sendResponse(readClaraStream(response, signal, {
        conversationId: session.conversationId,
        startedAt: turnStartedAt,
      }));

      console.info("[elevenlabs-speech-engine] turn.complete", {
        conversationId: session.conversationId,
        totalMs: Date.now() - turnStartedAt,
      });
    },
    onClose(session) {
      console.info("[elevenlabs-speech-engine] closed", { conversationId: session.conversationId });
      void removeElevenLabsSpeechEngineConversation(session.conversationId).catch(() => {});
    },
    onDisconnect(session) {
      console.warn("[elevenlabs-speech-engine] disconnected", { conversationId: session.conversationId });
      void removeElevenLabsSpeechEngineConversation(session.conversationId).catch(() => {});
    },
    onError(error, session) {
      console.error("[elevenlabs-speech-engine] error", {
        conversationId: session?.conversationId,
        message: error?.message,
      });
    },
  });

  console.log("[elevenlabs-speech-engine] attached", {
    engineId,
    path: "/api/voice/elevenlabs/speech-engine",
  });

  return attachment;
}
