#!/usr/bin/env python3
"""
Phase 3 patcher — threads `draftMode` from the preview surface through the
client voice stack so every provider hook requests the DRAFT configuration:

  1. voice/types.ts            VoiceClientOptions.draftMode
  2. useVoiceClient.ts         sharedOpts + provider lookup body
  3. useOpenAIRealtime.ts      session + rag_search bodies
  4. useGeminiLive.ts          session + rag_search bodies
  5. useElevenLabsVoice.ts     session + tts + transcribe + chat stream
  6. useElevenLabsConvAI.ts    agent-session body
  7. useElevenLabsClaraStream  session + chat stream
  8. useElevenLabsSpeechEngine session body
  9. useSarvamVoice.ts         session + tts + transcribe + chat stream
 10. client/stream.ts          StreamChatOptions.draftScope → scope:"draft"

Each patch is assert-exactly-once; any mismatch aborts before writing.
"""
import io

ROOT = "/home/z/my-project/.worktrees/vc/"

def patch(path, pairs):
    p = ROOT + path
    s = io.open(p, newline="").read()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{path}: expected 1 occurrence of {old[:70]!r}, found {n}"
        s = s.replace(old, new)
    io.open(p, "w", newline="").write(s)
    print(f"patched {path} ({len(pairs)} edit(s))")

SCOPE = '...(DRAFT ? { scope: "draft" } : {})'

# 1. VoiceClientOptions — add draftMode
patch("src/modules/assistant/core/voice/types.ts", [(
    """  embedApiKey?: string;
  onStatusChange?: (status: VoiceStatus) => void;""",
    """  embedApiKey?: string;
  /**
   * Draft-preview mode (authenticated agent preview, /preview/agents/:id):
   * session/bootstrap, RAG and chat requests carry scope:"draft" so the
   * server resolves the CURRENT Main-branch draft (persona, models, voice
   * providers, LIVE KB collection) instead of the published version.
   * Mutually exclusive with embedApiKey (public pages never preview drafts).
   */
  draftMode?: boolean;
  onStatusChange?: (status: VoiceStatus) => void;"""
)])

# 2. useVoiceClient — sharedOpts + provider lookup
patch("src/modules/assistant/core/hooks/useVoiceClient.ts", [(
    """  const sharedOpts = {
    documentId:       options.documentId,
    kbId:             options.kbId,
    documentOverview: options.documentOverview,
    voiceGreeting:    options.voiceGreeting,
    language:         options.language,
    embedApiKey:      options.embedApiKey,
  };""",
    """  const sharedOpts = {
    documentId:       options.documentId,
    kbId:             options.kbId,
    documentOverview: options.documentOverview,
    voiceGreeting:    options.voiceGreeting,
    language:         options.language,
    embedApiKey:      options.embedApiKey,
    draftMode:        options.draftMode,
  };"""
), (
    """      body: JSON.stringify({ kbId: options.kbId }),
    });""",
    """      body: JSON.stringify({
        kbId: options.kbId,
        ...(options.draftMode ? { scope: "draft" } : {}),
      }),
    });"""
)])

# 3. useOpenAIRealtime — Options type + session + 2 rag bodies
patch("src/modules/assistant/core/hooks/useOpenAIRealtime.ts", [(
    """  embedApiKey?: string;
};

type TurnStatus = "pending" | "speaking" | "done";""",
    """  embedApiKey?: string;
  /** Draft-preview mode (agent preview): requests carry scope:"draft". */
  draftMode?: boolean;
};

type TurnStatus = "pending" | "speaking" | "done";"""
), (
    """          kbIdVal
            ? { query, kbId: kbIdVal, language: languagePrefs.assistant } // KB mode
            : { query, documentId: docId, language: languagePrefs.assistant } // Legacy mode""",
    """          kbIdVal
            ? { query, kbId: kbIdVal, language: languagePrefs.assistant, ...(opts?.draftMode ? { scope: "draft" } : {}) } // KB mode
            : { query, documentId: docId, language: languagePrefs.assistant } // Legacy mode"""
), (
    """            kbIdVal
              ? { query: q, kbId: kbIdVal }       // KB mode
              : { query: q, documentId: docId }    // Legacy mode""",
    """            kbIdVal
              ? { query: q, kbId: kbIdVal, ...(opts?.draftMode ? { scope: "draft" } : {}) }       // KB mode
              : { query: q, documentId: docId }    // Legacy mode"""
), (
    """        body: JSON.stringify({
          language: languagePrefs.assistant,
          languages: languagePrefs.customer,
          autoDetectLanguage: true,
          ...(kbId ? { kbId } : {}),
        }),""",
    """        body: JSON.stringify({
          language: languagePrefs.assistant,
          languages: languagePrefs.customer,
          autoDetectLanguage: true,
          ...(kbId ? { kbId } : {}),
          ...(opts?.draftMode ? { scope: "draft" } : {}),
        }),"""
)])

# 4. useGeminiLive — Options type + session + rag body
patch("src/modules/assistant/core/hooks/useGeminiLive.ts", [(
    """  embedApiKey?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────""",
    """  embedApiKey?: string;
  /** Draft-preview mode (agent preview): requests carry scope:"draft". */
  draftMode?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────"""
), (
    """                  kbIdValue ? { query: q, kbId: kbIdValue } : { query: q, documentId: docId }""",
    """                  kbIdValue
                    ? { query: q, kbId: kbIdValue, ...(opts?.draftMode ? { scope: "draft" } : {}) }
                    : { query: q, documentId: docId }"""
), (
    """        body: JSON.stringify({
          language:  languagePrefs.assistant,
          languages: languagePrefs.customer,
          ...(kbId ? { kbId } : {}),
        }),""",
    """        body: JSON.stringify({
          language:  languagePrefs.assistant,
          languages: languagePrefs.customer,
          ...(kbId ? { kbId } : {}),
          ...(opts?.draftMode ? { scope: "draft" } : {}),
        }),"""
)])

# 5. useElevenLabsVoice (Mode A) — session + tts + transcribe + chat opts
patch("src/modules/assistant/core/hooks/useElevenLabsVoice.ts", [(
    """        body: JSON.stringify({
          kbId: session.kbId,
          text,
          model: session.tts.model,
          voiceId: session.tts.voiceId,
          language: session.stt.language,
          voiceSettings: session.tts.voiceSettings,
        }),""",
    """        body: JSON.stringify({
          kbId: session.kbId,
          text,
          model: session.tts.model,
          voiceId: session.tts.voiceId,
          language: session.stt.language,
          voiceSettings: session.tts.voiceSettings,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),"""
), (
    """        {
          kbId: session.kbId,
          signal: controller.signal,
          // The session payload is authoritative: "/api/chat" for platform
          // sessions, "/api/embed/chat" for embed-key sessions.
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,""",
    """        {
          kbId: session.kbId,
          signal: controller.signal,
          // The session payload is authoritative: "/api/chat" for platform
          // sessions, "/api/embed/chat" for embed-key sessions.
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          draftScope: options.draftMode === true,"""
), (
    """      const form = new FormData();
      form.append("kbId", session.kbId ?? "");
      form.append("audio", blob, "utterance.webm");
      form.append("language", session.stt.language ?? "en");""",
    """      const form = new FormData();
      form.append("kbId", session.kbId ?? "");
      form.append("audio", blob, "utterance.webm");
      form.append("language", session.stt.language ?? "en");
      if (options.draftMode) form.append("scope", "draft");"""
), (
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `ElevenLabs session failed (HTTP ${response.status})`);
      if (myToken !== connectTokenRef.current) return;
      sessionRef.current = payload;""",
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `ElevenLabs session failed (HTTP ${response.status})`);
      if (myToken !== connectTokenRef.current) return;
      sessionRef.current = payload;"""
)])

# 6. useElevenLabsConvAI (Mode B) — agent-session body
patch("src/modules/assistant/core/hooks/useElevenLabsConvAI.ts", [(
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as AgentSessionPayload;""",
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as AgentSessionPayload;"""
)])

# 7. useElevenLabsClaraStream (Mode C) — session + chat opts
patch("src/modules/assistant/core/hooks/useElevenLabsClaraStream.ts", [(
    """        {
          kbId: session.kbId,
          signal: controller.signal,
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
          realtimeVoice: false,
        },""",
    """        {
          kbId: session.kbId,
          signal: controller.signal,
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          draftScope: options.draftMode === true,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
          realtimeVoice: false,
        },"""
), (
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `ElevenLabs session failed (HTTP ${response.status})`);""",
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `ElevenLabs session failed (HTTP ${response.status})`);"""
)])

# 8. useElevenLabsSpeechEngine — session body
patch("src/modules/assistant/core/hooks/useElevenLabsSpeechEngine.ts", [(
    """        body: JSON.stringify({ kbId: options.kbId }),
      });""",
    """        body: JSON.stringify({
          kbId: options.kbId,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });"""
)])

# 9. useSarvamVoice — session + tts + transcribe + chat opts
patch("src/modules/assistant/core/hooks/useSarvamVoice.ts", [(
    """        body: JSON.stringify({
          kbId: session.kbId,
          text,
          model: session.tts.model,
          speaker: session.tts.speaker,
          language: session.tts.language,
        }),""",
    """        body: JSON.stringify({
          kbId: session.kbId,
          text,
          model: session.tts.model,
          speaker: session.tts.speaker,
          language: session.tts.language,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),"""
), (
    """        {
          kbId: session.kbId,
          signal: controller.signal,
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
          realtimeVoice: Boolean(session.stt.realtime),
        },""",
    """        {
          kbId: session.kbId,
          signal: controller.signal,
          endpoint: apiUrl(session.chat.endpoint),
          embedApiKey: options.embedApiKey,
          draftScope: options.draftMode === true,
          assistantLanguage: options.language?.assistant,
          customerLanguages: options.language?.customer,
          realtimeVoice: Boolean(session.stt.realtime),
        },"""
), (
    """      const form = new FormData();
      form.append("kbId", session.kbId ?? "");
      form.append("audio", blob, "utterance.webm");
      // Saaras auto-detects the language when omitted — only send a hint when
      // the session resolved a concrete BCP-47 code.
      if (session.stt.language && session.stt.language !== "en-IN") {
        form.append("language", session.stt.language);""",
    """      const form = new FormData();
      form.append("kbId", session.kbId ?? "");
      form.append("audio", blob, "utterance.webm");
      if (options.draftMode) form.append("scope", "draft");
      // Saaras auto-detects the language when omitted — only send a hint when
      // the session resolved a concrete BCP-47 code.
      if (session.stt.language && session.stt.language !== "en-IN") {
        form.append("language", session.stt.language);"""
), (
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Sarvam session failed (HTTP ${response.status})`);""",
    """        body: JSON.stringify({
          kbId: options.kbId,
          ragMode: "hybrid",
          language: options.language?.assistant,
          ...(options.draftMode ? { scope: "draft" } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Sarvam session failed (HTTP ${response.status})`);"""
)])

# 10. stream.ts — draftScope option → scope:"draft" in KB-mode payload
patch("src/modules/assistant/client/stream.ts", [(
    """  /** Realtime voice path: selects the configured Sarvam conversational model and latency settings. */
  realtimeVoice?: boolean;
};""",
    """  /** Realtime voice path: selects the configured Sarvam conversational model and latency settings. */
  realtimeVoice?: boolean;
  /**
   * Draft-preview mode (authenticated agent preview): the KB-mode payload
   * carries scope:"draft" so the server resolves the CURRENT Main-branch
   * draft instead of the immutable published version.
   */
  draftScope?: boolean;
};"""
), (
    """      const payload = options?.kbId
    ? {
        // KB mode: server uses kbId-scoped RAG
        kbId: options.kbId,
        messages,
        sessionId: options?.sessionId,
        assistantLanguage: options?.assistantLanguage,
        customerLanguages: options?.customerLanguages,
        realtimeVoice: options?.realtimeVoice === true,
      }""",
    """      const payload = options?.kbId
    ? {
        // KB mode: server uses kbId-scoped RAG
        kbId: options.kbId,
        messages,
        sessionId: options?.sessionId,
        assistantLanguage: options?.assistantLanguage,
        customerLanguages: options?.customerLanguages,
        realtimeVoice: options?.realtimeVoice === true,
        ...(options?.draftScope ? { scope: "draft" } : {}),
      }"""
)])

print("\nAll Phase 3 client-hook patches applied.")
