# 27 — Agent Conversation Experience (End-User Chat & Voice UI)

> Clara AI Platform feature documentation · Domain: `src/features/agent-conversation/` + `src/app/agents` + `src/app/preview/agents` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

This is the face of the product: the end-user conversation experience for talking to an agent. It covers the public published-agent page (`/agents/:agentId`), the draft preview experience for admins (`/preview/agents/:agentId`), the shared conversation chat window, the agent-markdown renderer (citations, code, tables), the realtime voice orb + composer (speech-in / speech-out), mic visualisation, the client-side NDJSON chat-stream reader, and voice turn management (greeting turns, chunked TTS). Its purpose is one polished, deployment-pinned conversation surface that serves ONLY the published state to the public and the draft state to authorised admins — the same visual language for chat and voice, with citations rendered inline.

This feature layer is the client counterpart of Feature 08 (RAG chat API) and Features 14-16 (voice engines): it consumes `/api/embed/chat` NDJSON and the embed realtime session stack, never talking to a provider directly.

## 2. Business Logic

- **Public published-agent page** — `src/app/agents/[agentId]/page.tsx` re-exports `published-agent-screen.tsx` (screen doc-comment `:6`): branding, persona and knowledge come from the agent's PRODUCTION version; every chat/voice request resolves to the deployment's frozen KB snapshot (Feature 04), so unpublished draft edits can never appear. The public config endpoint mints a short-lived signed session token the embed stack accepts; org plan quotas, hourly rate limits and publication re-check apply on every request. If the agent is unpublished or private, an elegant "not available" state renders and every API call is rejected server-side.
- **Draft preview** — `src/app/preview/agents/[agentId]/page.tsx` → `draft-preview-screen.tsx`: the same conversation surface aimed at the DRAFT state for signed-in admins (permission-checked), used from the agent workspace "published preview"/draft flows.
- **Chat window** — `ConversationChatWindow` (`conversation-chat-window.tsx:77`): message list + composer wiring, sources/citation display, streaming token rendering, error/notice events from the stream.
- **Conversation state** — `useAgentConversation` (`hooks/use-agent-conversation.ts:46`): manages turns, streaming lifecycle, session identity and message history for the screens.
- **Chat stream client** — `streamAgentChat` (`lib/chat-stream.ts:45`): the NDJSON reader for `/api/embed/chat` — parses `kb`/`sources`/`token`/`quota_warning`/`retrieval_degraded`/`error`/`done` events (the protocol defined in Feature 08 §2) into React-friendly callbacks.
- **Markdown rendering** — `AgentMarkdown` (`components/agent-markdown.tsx:274`, memoised): safe rendering of assistant markdown incl. inline `[S1, S2]` citation markers, code blocks and tables; pairs with the sanitiser in `src/features/embed/lib/sanitize-html.ts`.
- **Voice orb & composer** — `RealtimeVoiceOrb` (`realtime-voice-orb.tsx:300`) renders the live realtime-voice stage; `OrbComposer` (`orb-composer.tsx:193`) is the voice-first input composer; `conversation-voice-stage.tsx` assembles the voice layout.
- **Speech-out chunking** — `useVoiceChatSpeech` (`hooks/use-voice-chat-speech.ts:72`): speaks assistant text via TTS in bounded chunks (`chunkForSpeech:41`, provider gate `isVoiceChatProvider:36`), with dictation-limit handling.
- **Mic visualisation** — `useMicVisualizer` (`hooks/use-mic-visualizer.ts:25`): live mic level bars for the orb.
- **Voice turns** — `voice-turns.ts`: greeting-turn detection (`isGreetingTurn:48`, placeholder `GREETING_QUESTION_PLACEHOLDER:30`) so greeting messages behave correctly in voice mode.

## 3. Business Rules

- The public page is **deployment-pinned**: only the published production version + its KB snapshots are served; drafts can never leak (server-side enforcement, screen merely reflects).
- Every public request passes org plan quotas + hourly rate limits + publication re-check (Feature 24 admission; no silent bypass from the client).
- Draft preview requires an authenticated admin with agent permission — the same surface, different authorisation path.
- Citations are rendered from the `sources` event that always precedes tokens (Feature 08 rule) — the renderer never fabricates sources.
- Voice speech-out is chunked and interruptible; dictation limits surface as UI notices, not raw errors.
- Unpublished/private agents render a curated "not available" state — no internals, no stack traces.

## 4. Data Model

- No own tables; consumes embed session tokens, chat sessions and deployment snapshots (Features 04, 08, 13).

## 5. API Surface

| Route | Role |
|---|---|
| `src/app/agents/[agentId]/page.tsx` | public published-agent conversation page |
| `src/app/preview/agents/[agentId]/page.tsx` | admin draft preview page |
| `GET /api/public/agents/[agentId]/config` | published config + short-lived signed session token |
| `POST /api/embed/chat` | NDJSON chat stream consumed by `streamAgentChat` |
| embed realtime session stack | voice path (Features 13/16) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/features/agent-conversation/screens/published-agent-screen.tsx` | public screen (doc `:5`) |
| `src/features/agent-conversation/screens/draft-preview-screen.tsx` | admin draft screen |
| `src/features/agent-conversation/components/conversation-chat-window.tsx` | `ConversationChatWindow:77` |
| `src/features/agent-conversation/components/agent-markdown.tsx` | `AgentMarkdown:274` |
| `src/features/agent-conversation/components/orb-composer.tsx` | `OrbComposer:193` |
| `src/features/agent-conversation/components/realtime-voice-orb.tsx` | `RealtimeVoiceOrb:300` |
| `src/features/agent-conversation/hooks/use-agent-conversation.ts` | `useAgentConversation:46` |
| `src/features/agent-conversation/hooks/use-voice-chat-speech.ts` | `useVoiceChatSpeech:72`, `chunkForSpeech:41`, `isVoiceChatProvider:36` |
| `src/features/agent-conversation/hooks/use-mic-visualizer.ts` | `useMicVisualizer:25` |
| `src/features/agent-conversation/lib/chat-stream.ts` | `streamAgentChat:45` |
| `src/features/agent-conversation/lib/voice-turns.ts` | `isGreetingTurn:48` |

## 7. UI Reference

- `src/app/agents/[agentId]/page.tsx` and `src/app/preview/agents/[agentId]/page.tsx` are 1-line re-exports of the screens above.
- Shared pieces also used by the embed widget (Feature 13) and the admin workspace chat (`src/features/workspace`, Feature 30).

## 8. Environment Variables

- None specific; runtime config via public agent config endpoint (Feature 13 env vars apply for embed keys/origins).

## 9. Tests

- `agent-markdown.test.ts`, `orb-composer.test.ts`, `chat-stream.test.ts`, `use-voice-chat-speech.test.ts`, `voice-greeting.test.ts` (in the same directories).

## 10. Cross-links

- Consumes **08 RAG Chat & Grounding** (stream protocol) and **13 Embeddable Widget** (embed auth/session stack).
- Voice engines from **14-16**; deployment pinning from **04**; quota admission from **24**.
