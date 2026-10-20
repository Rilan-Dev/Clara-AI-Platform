# 14 — Voice AI: ElevenLabs

> Clara AI Platform feature documentation · Domain: `voice-core` (ElevenLabs provider) + `/api/voice/elevenlabs/*` + `/api/admin/elevenlabs/*` · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

ElevenLabs is Clara's premium conversational-voice engine: realtime speech agents (STT+LLM+TTS in one vendor session), a voice library (list/sync/design/clone/preview), conversation history sync, post-call webhooks, and metered billing per minute. Its purpose is turnkey high-quality voice for agents that opt into the ElevenLabs speech engine, with platform-side credential governance and honest availability reporting when the vendor is unreachable.

## 2. Business Logic

- **Provider service** — `ElevenLabsVoiceProvider implements VoiceProviderService` (`src/modules/voice-core/providers/elevenlabs.ts:125`) with typed errors (`ElevenLabsError:49`); conversational capabilities behind `ConversationalVoiceService` (`voice-core/types.ts:167`, guard `isConversationalVoiceService:217`).
- **Availability gating** — `server-provider-availability.ts:8` `isElevenLabsEnabled`, `:16` `isElevenLabsRealtimeEnabled` decide feature visibility server-side (credential presence + admin settings).
- **Sessions** — `/api/voice/elevenlabs/session`, `/realtime-init`, `/agent-session`, `/speech-engine/session` mint signed agent sessions (`SignedAgentSession` types.ts:273) for the browser WebRTC/WebSocket client.
- **Voices** — `/api/voice/elevenlabs/voices` (+ `/sync`, `/preview`, `/design`, `/clone`) manage the voice library; `VoiceCloneParams/Result` types.ts:347/355; catalog sync follows the fail-closed partial-discovery preservation rule (Feature 11, commits `85566ede`/`dc3e3a1c`).
- **Conversations** — `/api/voice/elevenlabs/conversations` (+ `/sync`) pull vendor conversation history into platform tables; post-call webhook `/api/webhooks/elevenlabs/post-call` receives vendor callbacks.
- **TTS/STT** — `/api/voice/elevenlabs/tts` and `/transcribe` expose one-shot synthesis/recognition; pricing per `voice-core/pricing.ts` (`ttsUsdPer1kChars:15`, `sttUsdPerMinute:22`, `conversationUsdPerMinute:29`, micros conversion `:36`).
- **Admin plane** — `/api/admin/elevenlabs/{status,agents,agents/[id],webhooks}` + realtime meter `/api/internal/elevenlabs/realtime-meter` and the RAG tool bridge `/api/internal/elevenlabs/tools/rag-search` (vendor tool calling back into Clara retrieval).
- **Phone engine binding** — ElevenLabs agents can back phone calls (`phone/core/elevenlabs-call.ts:35` `resolveElevenLabsCallBinding`, `:88` `connectCallViaElevenLabsAgent`) — see Feature 16.

## 3. Business Rules

- Realtime ElevenLabs requires dedicated purpose-scoped credentials; Sarvam-configured agents must NOT fall back into OpenAI 401 loops (regression-tested, commit `610d4018` era).
- Voice catalog reconciliation is fail-closed: malformed vendor pages preserve last-known voices and record an incident (production-observed "malformed page; refusing partial reconciliation").
- Conversation minutes are metered (`conversationCostUsdMicros`) into the usage-event spine; credit alerts fire on low balance (Feature 16 metering).
- Voice design/clone are admin/entitlement-gated operations with audit.
- Availability is reported honestly in UI (enabled/disabled per credential state), never assumed.

## 4. Data Model

- `033_elevenlabs_voice.sql`, `034_elevenlabs_conversational.sql`, `037_phone_elevenlabs_engine.sql`, `046_elevenlabs_realtime_speech_engine.sql`, `057_elevenlabs_realtime_defaults.sql`, `058_elevenlabs_realtime_admin_setting.sql`.

## 5. API Surface

- Full route list in §2 (15 routes under `/api/voice/elevenlabs/**`, 4 under `/api/admin/elevenlabs/**`, 2 under `/api/internal/elevenlabs/**`, 1 webhook).

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/voice-core/providers/elevenlabs.ts` | `ElevenLabsVoiceProvider:125`, `ElevenLabsError:49` |
| `src/modules/voice-core/types.ts` | `VoiceProvider:38`, `ElevenLabsVoiceSettings:53`, `ConversationalVoiceService:167`, `SignedAgentSession:273`, `ConversationHistoryItem:335`, `VoiceCloneParams:347` |
| `src/modules/voice-core/pricing.ts` | ElevenLabs cost functions `:15-48` |
| `src/modules/voice-core/server-provider-availability.ts` | `isElevenLabsEnabled:8`, `isElevenLabsRealtimeEnabled:16` |

## 7. UI Reference

- `src/app/(admin)/settings/ai/page.tsx` (voice provider config), `src/app/(admin)/orgs/[id]/agents/[agentId]/config/page.tsx` (voice slots).
- Widget voice: `src/app/embed/voice/page.tsx`; admin voice console screens under `src/features/admin/screens/` (system-status shows ElevenLabs availability).
- `src/modules/assistant/ui/voice/VoiceChatModal.tsx:50` — in-app voice chat modal.

## 8. Environment Variables

- `ELEVENLABS_API_KEY` (+ realtime-purpose key), base URL, admin settings DB rows (058); CSP `connect-src` must allow vendor wss (src/security/csp.ts).

## 9. Tests

- `voice-core` suites: `security-validation.test.ts`, `tts-text.test.ts`, realtime `ui-state-machine.test.ts`, `failure-recovery.test.ts`, `latency-tracker.test.ts`, `generation-coordinator.test.ts`; e2e `scripts/e2e-elevenlabs*.js`.

## 10. Cross-links

- Provider abstraction & pricing — **16** (shared realtime stack); metering/credit alerts — **16**; catalog governance — **11**; phone binding — **16**; widget voice — **13**.
