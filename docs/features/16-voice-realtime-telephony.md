# 16 — Voice AI: OpenAI Realtime, Telephony & Metering

> Clara AI Platform feature documentation · Domain: `voice-core/realtime` + `phone` + realtime routes · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

This feature is Clara's realtime voice spine: OpenAI Realtime (WebRTC browser sessions with RAG tools), Gemini realtime sessions, PSTN telephony (Vonage + Twilio answer/event webhooks with call logs), and the cross-engine operational machinery — metering, credit alerts, latency tracking, reconnect policy, failure recovery, and the realtime UI state machine shared by every engine. Its purpose is dependable interactive voice: sub-second turn handling, graceful degradation on network/vendor failure, and per-second cost control across all providers.

## 2. Business Logic

- **OpenAI realtime** — `/api/realtime/session` mints the ephemeral OpenAI session (`assistant/api/*` realtime handlers; `geminiSession.ts:45` `postGeminiSession` for the Gemini variant at `/api/gemini/session` + `/api/realtime/gemini-session`); `/api/realtime/tool` (`assistant/api/realtime-tool.ts:35`) is the vendor-callback tool endpoint (RAG search on voice turns). Dedicated realtime-purpose OpenAI keys are required (401 regression rule).
- **UI state machine** — `src/modules/voice-core/realtime/ui-state-machine.ts` formalises connect/listen/think/speak/error transitions (tested in `ui-state-machine.test.ts`); `generation-coordinator.ts` sequences audio generation; `reconnect-policy.ts` governs session re-establishment; `failure-recovery.ts` classifies and recovers vendor failures; `latency-tracker.ts` records TTFA/turn timings (all with colocated `.test.ts`).
- **Telephony** — `src/modules/phone/`: `call-handler.ts:50` `CallHandler` orchestrates a PSTN call; `elevenlabs-call.ts:35/88` binds ElevenLabs agents to calls; `core/db.ts` persists phone configs (`getPhoneConfigsByKb:28` … `deletePhoneConfig:90`), call logs (`insertCallLog:94`, `updateCallLog:133`, `getCallLogs:228`), platform env settings (`getPlatformEnvSettings:257`, `setPlatformEnvSetting:283`, `syncEnvFromDb:301`), and enablement (`checkPhoneCallsEnabled:306`). Routes: `/api/phone/session`, `/calls`, `/log`, `/vonage/answer`, `/vonage/event`, `/twilio/incoming`, plus `/api/kbs/[kbId]/phone` binding (Feature 05).
- **Metering & credits** — `src/modules/voice-core/metering.ts` records usage events per surface; `credit-alerts.ts` thresholds trigger notifications; cost tables in `pricing.ts` (Feature 14/15). Internal meters: `/api/internal/elevenlabs/realtime-meter`, `/api/internal/sarvam/realtime-meter`.
- **Voice provider route** — `/api/voice/provider` reports the effective provider selection for an agent (runtime resolution, Feature 12).
- **Identity** — `realtime/identity.ts` establishes call/session identity binding (tested).

## 3. Business Rules

- Realtime OpenAI requires a dedicated realtime-purpose key; misconfigured agents fail fast with a clear message, never silent 401 loops.
- Every realtime second is metered (per-provider cost tables) into the usage-event spine; low credit balance raises alerts before hard failure.
- Voice turns may call RAG tools (`/api/realtime/tool`) with the same grounding rules as text chat (Feature 08) — no ungrounded tool answers.
- Call logs are immutable audit records; webhook endpoints verify vendor signatures before mutating state.
- Reconnect policy caps retry storms; failure recovery distinguishes transient vs terminal vendor states for the UI state machine.

## 4. Data Model

- `011_phone_calls.sql`, `037_phone_elevenlabs_engine.sql`, `038_realtime_voice_provider.sql`, `041/045/046/057/058/064` (engine catalogs/settings — Features 14/15).

## 5. API Surface

| Route group | Files |
|---|---|
| Realtime sessions | `src/app/api/realtime/{session,gemini-session,tool}/route.ts`, `src/app/api/gemini/session/route.ts` |
| Phone | `src/app/api/phone/{session,calls,log,vonage/answer,vonage/event,twilio/incoming}/route.ts` |
| Meters | `src/app/api/internal/{elevenlabs,sarvam}/realtime-meter/route.ts` |
| Provider report | `src/app/api/voice/provider/route.ts` |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/voice-core/realtime/ui-state-machine.ts` | voice UI state machine |
| `src/modules/voice-core/realtime/{reconnect-policy,failure-recovery,latency-tracker,generation-coordinator,identity}.ts` | operational machinery (each with tests) |
| `src/modules/voice-core/metering.ts` / `credit-alerts.ts` | usage events + alerts |
| `src/modules/phone/core/call-handler.ts` | `CallHandler:50` |
| `src/modules/phone/core/db.ts` | phone config/call-log/env functions `:28-306` |
| `src/modules/phone/core/elevenlabs-call.ts` | `resolveElevenLabsCallBinding:35`, `connectCallViaElevenLabsAgent:88` |

## 7. UI Reference

- `src/app/(admin)/settings/phone/page.tsx` — phone number + provider admin.
- Voice chat UI: `src/modules/assistant/ui/voice/VoiceChatModal.tsx:50`; widget `src/app/embed/voice/page.tsx`.
- `src/app/(admin)/system-status/page.tsx` — provider availability incl. realtime.

## 8. Environment Variables

- `OPENAI_API_KEY` (realtime-purpose), Vonage/Twilio credentials, phone env DB settings (`syncEnvFromDb`), realtime model vars (Feature 12).

## 9. Tests

- `voice-core/realtime/*.test.ts` (5 suites), phone core tests, e2e `scripts/e2e-elevenlabs*.js`, benchmark `scripts/voice-benchmark/`, `scripts/loadtest-elevenlabs-tts.js`.

## 10. Cross-links

- Provider layers — **14 ElevenLabs / 15 Sarvam / 10 OpenAI core**; RAG tool grounding — **08**; metering spine — **20**; widget voice — **13**.
