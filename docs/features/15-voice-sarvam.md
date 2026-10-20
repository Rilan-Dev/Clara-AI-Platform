# 15 — Voice AI: Sarvam Realtime

> Clara AI Platform feature documentation · Domain: `voice-core` (Sarvam provider) + `/api/voice/sarvam/*` · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

Sarvam AI is Clara's Indic-language-first voice engine: realtime streaming sessions (STT/TTS with the Sarvam realtime API), one-shot TTS/transcribe, voice preview, and a relay architecture (`scripts/sarvam-*.mjs`) that bridges browser audio to the vendor. Its purpose is high-quality Indian-language voice support (Tamil, Hindi, etc.) where ElevenLabs/OpenAI coverage is weak, with the same metered-cost model and honest availability semantics as the other engines.

## 2. Business Logic

- **Provider service** — `SarvamVoiceProvider implements VoiceProviderService` (`src/modules/voice-core/providers/sarvam.ts:145`) with `SarvamVoiceError:50`; audio envelope handling for the vendor's response framing: `extractWavDataChunk:92`, `decodeSarvamAudioEnvelope:123`.
- **Realtime sessions** — `/api/voice/sarvam/realtime-init` + `/realtime` establish the streaming session; browser audio flows through the relay bridge (`scripts/sarvam-relay.mjs`, `scripts/dev-relay.mjs`, push-to-talk in `scripts/phone-stream.mjs`); model catalog from `041_sarvam_realtime_model_catalog.sql` + settings `045_sarvam_realtime_settings.sql` + streaming `064_sarvam_realtime_streaming.sql`.
- **One-shot speech** — `/api/voice/sarvam/tts`, `/tts-realtime`, `/transcribe` for synthesis/recognition; `/voices` + `/voices/preview` list/audition voices.
- **Session minting** — `/api/voice/sarvam/session` issues widget/platform session credentials (Feature 13 voice-connect path).
- **Cost model** — `voice-core/pricing.ts`: `sarvamTtsUsdPer1kChars:56`, `sarvamSttUsdPerMinute:63`, `sarvamTtsCostUsdMicros:69`, `sarvamSttCostUsdMicros:73` — metered into the usage spine.
- **Admin plane** — `/api/admin/sarvam/status` reports credential/availability state; internal meter `/api/internal/sarvam/realtime-meter`.
- **Language integration** — Sarvam also powers the language-core translate/transliterate/identify services (`src/modules/language-core/providers/sarvam.ts:70` `SarvamLanguageProvider`) — see Feature 19.

## 3. Business Rules

- Sarvam realtime is only offered when its credentials + admin settings are present (availability gating mirrors ElevenLabs).
- Sarvam-configured agents must never silently route to OpenAI realtime (the 401 regression class — dedicated-key rule, commit `610d4018`).
- Realtime audio uses the vendor's envelope format; decode failures are explicit errors, never treated as silence.
- All TTS/STT usage is metered per the pricing table; realtime meters post to `/api/internal/sarvam/realtime-meter`.
- Voice preview routes are entitlement-gated like other voice assets.

## 4. Data Model

- `036_sarvam_provider.sql`, `041_sarvam_realtime_model_catalog.sql`, `045_sarvam_realtime_settings.sql`, `064_sarvam_realtime_streaming.sql`.

## 5. API Surface

| Route group | Files |
|---|---|
| Realtime | `src/app/api/voice/sarvam/{realtime-init,realtime,session}.ts` |
| One-shot | `src/app/api/voice/sarvam/{tts,tts-realtime,transcribe}.ts` |
| Voices | `src/app/api/voice/sarvam/{voices,voices/preview}.ts` |
| Admin/internal | `src/app/api/admin/sarvam/status/route.ts`, `src/app/api/internal/sarvam/realtime-meter/route.ts` |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/voice-core/providers/sarvam.ts` | `SarvamVoiceProvider:145`, `SarvamVoiceError:50`, `extractWavDataChunk:92`, `decodeSarvamAudioEnvelope:123` |
| `src/modules/voice-core/pricing.ts` | Sarvam cost functions `:56-73` |
| `src/modules/voice-core/types.ts` | `VoiceProvider` union incl. `"sarvam"` `:38-42` |
| Relay bridges (scripts) | `scripts/sarvam-relay.mjs`, `scripts/dev-relay.mjs`, `scripts/voice-relay.mjs`, `scripts/sarvam-tts-relay.mjs` |

## 7. UI Reference

- Voice provider pickers: `src/app/(admin)/orgs/[id]/agents/[agentId]/config/page.tsx`, `src/app/(admin)/settings/ai/page.tsx`.
- Widget voice: `src/app/embed/voice/page.tsx`; in-app modal `src/modules/assistant/ui/voice/VoiceChatModal.tsx:50`.
- Docs: `Doc/19-09-2026/SARVAM_AI_INTEGRATION*.md`, `ELEVENLABS_REALTIME_STREAMING_PLAN.md`.

## 8. Environment Variables

- `SARVAM_API_KEY`, Sarvam base/timeout vars (`language-core/model-catalog.ts:44-58` pattern), relay port configs for the bridge scripts.

## 9. Tests

- `src/modules/voice-core/realtime/*.test.ts` suite family, `scripts/e2e-sarvam.js`, `scripts/sarvam-*-probe*.mjs` harnesses; voice benchmark `scripts/voice-benchmark/run.mjs`.

## 10. Cross-links

- Shared realtime stack/metering — **16**; language services — **19**; provider catalog — **11**; widget voice — **13**.
