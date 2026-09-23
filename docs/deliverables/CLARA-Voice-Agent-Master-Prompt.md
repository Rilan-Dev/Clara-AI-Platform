# Clara AI — Voice Chat in Chat Window · Realtime Voice Agent · Draft Preview · Public Published Page

> **Master Implementation Prompt — Phase-by-Phase Workflow — v1.0 (2026-09-24)**
>
> **For agentic workers:** This document is a self-contained implementation prompt. Execute it task-by-task with `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. All tasks use checkbox (`- [ ]`) syntax for tracking. Screenshot references are identified by pasted filename + the product owner's annotation (see §2 — the pasted binaries were not persisted by the chat gateway, so the annotations below are the authoritative reference).

**Goal:** Deliver a complete conversational experience for Clara AI Platform agents: (1) voice chat embedded **inside the chat window** — not a separate modal (that was the past development mistake); (2) a full **Realtime Voice Agent session lifecycle** in the agent preview — starting → connecting → listening → thinking → speaking → completing → returning to chat — with two distinct reactive circle-motion visualizations (user speaking vs agent speaking) that switch **instantly** mid-conversation; (3) a **draft-based, login-only Preview** where authenticated users test the current settings, knowledge base and everything else against drafted changes; and (4) a separate **public Published page** — simple, crisp, rich — that serves only published settings.

**Architecture:** One shared conversation feature layer (`src/features/agent-conversation/`) powers both surfaces. The preview threads `scope: "draft"` through the existing API surface so the draft resolution layer (`preferDraft`) feeds live draft config + live KB collections to the SAME chat/voice endpoints. The published page gets a new public config API that mints short-lived signed `pub_` tokens; `validateEmbedRequest` accepts them, so the entire hardened embed stack (chat + all 7 voice provider hooks) is reused with zero client-hook changes. Published isolation comes from Stage-H resolution: production version config + KB snapshot collections (`pub_xxx`) only — draft can never leak to the public page.

**Current repository branch:** `Vite-Converted`

**Current baseline commit inspected:** `12a6a25` — voice/preview/published work shipped in `e4b1c57`, admin UI/UX structure work in `12a6a25` (full inventory in §4).

**Status (2026-09-24):** Implemented and deployed via PRs #149 / #150 / #151; PR #152 (→ Vercel-Prod) is open for product-owner review. Use this document to (a) **verify** the live implementation against §10, (b) **iterate** on any phase, or (c) **re-implement** the same behavior on a fresh environment — the phases are written imperatively so the prompt stays reusable.

---

## 1. Objectives (from the product owner)

| # | Requirement (owner's intent, near-verbatim) | Where it lands |
|---|---|---|
| O1 | "We need to implement voice chat inside the chat window" — past mistake: voice lived in a separate `VoiceChatModal` experience | `ConversationChatWindow` + in-window `ConversationVoiceStage` swap |
| O2 | "Introduce Realtime Voice Agent session starting and completing in the preview" — the full session lifecycle must exist in the preview page | `ConversationVoiceStage` lifecycle + existing `uiState` machine |
| O3 | "Have a look on the shared screenshots UI/UX style and provide our own unique best UI/UX design, not same like this" — references are style inspiration ONLY; the shipped design must be Clara's own | All new components; Clara design language; never pixel-copy references |
| O4 | "While user speaking use the embedded voice agent used that 6 like waving" (six-element circular wave motion); "while agent response use some new things, instantly switch while having conversations" | `RealtimeVoiceOrb` — full spec in §6 |
| O5 | Preview = "only the login users", "going to use drafted changes", owner tests "the current knowledge base and everything via the preview page" | `/preview/agents/[agentId]` + `scope: "draft"` threading |
| O6 | "A separate published page … simple and crisp rich page for public access, and more perfect. Published page should only use the published settings" | `/agents/[agentId]` + `pub_` token infra |
| O7 | Round-2 feedback: restore the agent section menus to the sidebar under "Agents >"; move the version cluster (`Main · vN · Draft changes · Published vN · Draft saved Xm ago · Preview · Publish update`) into the topbar next to the profile avatar and **remove the username**; "Draft changes" → "view pending changes" diff; "Published vN" → published URL controls; profile popup shows usage limits. Governing principle: **"We need to redesign the existing UI/UX, not introduce anything new."** | `admin-shell.tsx`, `agent-topbar.tsx`, `ProfileMenu.tsx` |

---

## 2. Reference screenshot registry (14 files)

### 2.1 Voice / Preview / Published experience references

| # | Filename | Owner's annotation | What it informs |
|---|---|---|---|
| R1 | `pasted_image_1790169728678.png` | "While enter into Preview" | Entry state of the preview page: how the chat window presents itself on first load (greeting, hero, where voice entry is offered, overall layout proportions) |
| R2 | `pasted_image_1790169687747.png` | "while chatting" | Active chat state: message bubbles, composer, citation presentation, general richness |
| R3 | `pasted_image_1790169802320.png` | "While starting with Realtime Voice Agent Conversations" | Voice session start state: orb placement, status pill, controls (mute / interrupt / end), transcript |
| R4 | `pasted_image_1790170695981.png` | "For real-time voice agent" — published page reference | Public realtime voice experience: minimal chrome, centered voice presence, public-friendly copy |
| R5 | `pasted_image_1790170491254.png` | "For chat: simple and crisp in richness" — published page reference | Public chat experience: clean and crisp yet rich; the bar for "simple, crisp, rich, more perfect" |

### 2.2 Admin UI/UX structure references (round-2 feedback)

| # | Filename | Shows | What it informs |
|---|---|---|---|
| R6 | `pasted_image_1790178841516.png` | The wrong state to eliminate: agent section menus rendered at the TOP of the main content area | Anti-pattern — the seven section menus must NOT live here |
| R7 | `pasted_image_1790179059322.png` | Sidebar with the agent section expanded — the restore target | Where the seven menus return to: under the "Agents >" group header |
| R8 | `pasted_image_1790179416607.png` | Sidebar with NO agent selected | Idle/plain sidebar appearance (no agent submenu, clean nav) |
| R9 | `pasted_image_1790179235085.png` | Sidebar with an agent selected | Selected-state sidebar: identity card + the 7 section tabs with icons |
| R10 | `pasted_image_1790179688782.png` | Topbar area next to the profile avatar | Destination for the version cluster; username removed from the navbar; avatar-only profile trigger |
| R11 | `pasted_image_1790179931543.png` | Publish screen | Publish UI reference; published URL controls live here and in the "Published vN" popover |
| R12 | `pasted_image_1790180026215.png` | Versioned drafts presentation | How draft/version status is surfaced (version chips, saved-age, pending-changes entry) |
| R13 | `pasted_image_1790180748312.png` | Draft diff view | The "view pending changes" experience: draft vs current version diff |
| R14 | `pasted_image_1790180948723.png` | Profile popup | Profile popup content: usage limits, plan, meters |

> ⚠️ **Binary availability note (verified 2026-09-24):** the chat gateway did not persist the pasted screenshot binaries for these filenames to workspace storage (a full filesystem search of `/tmp/my-project/upload/` and the project tree returned only older, unrelated pastes — billing / model-settings / agent-overview screens from Sept 13–14). The annotations in this registry are therefore the working reference. **When re-running this prompt in a new session, re-attach the original images next to this file** (`pasted_image_1790169728678.png`, `pasted_image_1790169687747.png`, `pasted_image_1790169802320.png`, `pasted_image_1790170695981.png`, `pasted_image_1790170491254.png`, plus R6–R14 if iterating on the admin structure) so visual comparison against the live UI is possible.

---

## 3. Non-negotiable product rules

1. **Voice lives INSIDE the chat window.** No separate voice modal. Starting a voice session swaps the chat pane to a voice stage within the same window; ending it swaps back to chat with the voice turns folded into the transcript.
2. **Two different circle motions, instant switching.** User speaking = six-element circular wave motion (the "embedded voice agent" style the owner called out). Agent speaking = a visually distinct reaction. Turn changes must switch the visual **immediately** (no crossfade lag while conversation flows).
3. **Preview is private + draft-fed.** Only authenticated (logged-in) users reach `/preview/agents/[agentId]`. It resolves DRAFT configuration and the LIVE knowledge base so the owner can test current settings end-to-end before publishing.
4. **Published page is public + published-fed.** `/agents/[agentId]` is publicly accessible, uses ONLY published settings (production version config + KB snapshot), and is simple, crisp and rich. No draft state can ever leak into it.
5. **Unique design, Clara's own.** The reference screenshots communicate direction (states, density, hierarchy), not pixels. Never replicate their exact styling, logos, or layout. Ship Clara's own design language.
6. **Redesign existing UI/UX — introduce nothing new.** Navigation, versioning, publish, profile behaviors described in O7 reuse existing platform components and patterns; they are re-arranged, not re-invented.
7. **Reuse the hardened embed stack.** Chat + all 7 voice provider hooks (`useVoiceClient` router: ElevenLabs ConvAI / Clara Stream / OpenAI Realtime / Gemini Live / Sarvam / …) are shared between preview, published page and embeds. Provider behavior must not fork per-surface.

---

## 4. Verified implementation baseline (as of 2026-09-24)

### 4.1 Source of truth

| Item | Value |
|---|---|
| Branch / commit | `Vite-Converted` @ `12a6a25` (worktree `.worktrees/vc`, clean, synced) |
| Voice + preview + published work | Commit `e4b1c57` — PR #149 → Vercel-Preview (self-merged), PR #150 → Vercel-Prod (merged by owner) |
| Sidebar / topbar / profile work | Commit `12a6a25` — PR #151 → Vercel-Preview (self-merged, branch now `3b71581`), PR #152 → Vercel-Prod (**open** for owner review) |
| Quality baseline | `tsc` 0 errors · ESLint 0 new warnings · vitest 32 failed / 694 passed = exact HEAD baseline (32 pre-existing env-dependent failures) · webpack compile OK |

### 4.2 File inventory (verified on disk)

```
src/features/agent-conversation/
  screens/draft-preview-screen.tsx        # /preview/agents/[agentId] — auth + scope=draft
  screens/published-agent-screen.tsx      # /agents/[agentId] — public, published-only
  components/conversation-chat-window.tsx # chat + in-window voice stage swap (AnimatePresence)
  components/conversation-voice-stage.tsx # lifecycle pill, live transcript, mute/interrupt/end
  components/realtime-voice-orb.tsx       # user/agent/thinking/connecting orb visuals
  hooks/use-mic-visualizer.ts             # viz-only 2nd getUserMedia (AEC) for mic levels
  hooks/use-agent-conversation.ts         # message state + voice-turn folding w/ dedupe
  lib/chat-stream.ts                      # shared NDJSON reader
  types.ts
src/app/preview/agents/[agentId]/page.tsx        # re-exports draft-preview-screen
src/app/agents/[agentId]/page.tsx                # re-exports published-agent-screen
src/features/admin/layouts/agent-topbar.tsx      # version cluster next to profile avatar
src/components/admin/ProfileMenu.tsx             # avatar-only + UsageLimitsSection meters
src/app/api/orgs/[orgId]/usage-limits/route.ts   # org-member auth usage endpoint
src/modules/embed/core/public-token.ts           # pub_v1 HMAC tokens (2h TTL, deployment-bound)
src/app/api/public/agents/[agentId]/config/route.ts  # public config + pub_ token mint (rate-limited)
src/app/globals.css                             # clara-orb-breathe / -ripple / -rotate keyframes
```

### 4.3 Resolution & isolation model (already in place)

- **Draft (preview):** `preferDraft` flag threaded through `resolveAIConfig` + `resolveVoiceConfig`; `getAgentDraftConfigCached` (3s TTL + write invalidation) in `agent-versioning/db.ts`; voice cache key includes the draft axis. Draft mode prefers the **draft** config, allows KB overrides, and uses the **live** KB collection (not the snapshot). Preview route reads `?scope=draft` with fallback: draft → live projection → published.
- **Published (public page):** Stage-H resolution prefers the **production version** config + KB **snapshot** (`pub_xxx`) when a deployment is active. `/api/public/agents/[agentId]/config` checks deployment + `publicAccess` and mints a short-lived signed `pub_` token (HMAC `pub_v1`, 2h TTL, deployment-bound). `validateEmbedRequest` gains a `pub_` branch that re-checks the active deployment and `publicAccess` **per request** — the whole embed stack then works with zero hook changes. Middleware exposes `/api/public/*`.

### 4.4 Live environment checks (2026-09-24)

- `https://preview.rag.amazetechclans.com/preview/agents/acf1a110-514f-4d6b-9480-23033a0bbfef` → HTTP 302 to `vercel.com/sso-api`.
- `https://preview.rag.amazetechclans.com/agents/acf1a110-514f-4d6b-9480-23033a0bbfef` → HTTP 302 to `vercel.com/sso-api`.
- **Operational note:** the preview deployment domain currently sits behind **Vercel Deployment Protection (SSO)**, which gates even the public published route at the edge. Before public launch of a published page on this domain, either serve the public page from the production domain or disable deployment protection for that domain — the app-level public access control (`publicAccess` + `pub_` tokens) is already in place and independent of this edge setting.

---

## 5. Phase-by-phase implementation plan

> Each phase is independently verifiable and ends with acceptance criteria. Screenshot references (`R#`) point to §2. Work on the **Vite-Converted** branch in the `.worktrees/vc` worktree for every phase (see §8).

### Phase 0 — Git & environment verification (mandatory, every round)

**Goal:** never build on a stale or dirty base.

- [ ] `git fetch --all --prune` in both the main repo and `.worktrees/vc`
- [ ] Verify `Vercel-Preview`, `Vercel-Prod`, `Vite-Converted` are clean and in the expected relative order (Prod ⊆ Preview ⊆ Vite-Converted)
- [ ] Restore/reset `.worktrees/vc` to `origin/Vite-Converted` if it drifts (it has done before)
- [ ] Confirm DB migrations auto-run on deploy (e.g. migration 056 for the FAQ column) and that the environment is healthy

**Acceptance:** all three branches verified clean; worktree HEAD == `origin/Vite-Converted`.

### Phase 1 — Draft resolution layer (`preferDraft`)

**Goal:** the resolver can be asked, per request, to prefer the DRAFT config + LIVE KB instead of the production version + snapshot.

- [ ] Add `preferDraft` through `resolveAIConfig` (ai-core) and `resolveVoiceConfig` (voice-core), using conditional spreads so all existing call contracts stay intact
- [ ] Add `getAgentDraftConfigCached` to `agent-versioning/db.ts` (3s TTL + write invalidation on draft save)
- [ ] Include the draft axis in the voice config cache key
- [ ] Tests: `resolve-draft` suite (draft preferred · live KB collection · KB overrides allowed · production fallback when no draft)

**Key files:** `src/modules/ai-core/resolve.ts` · `src/modules/voice-core/resolve.ts` · `src/modules/agent-versioning/core/db.ts`
**Acceptance:** resolver unit tests green; no behavior change for existing (non-draft) callers.

### Phase 2 — Server endpoints accept `scope: "draft"`

**Goal:** the same API surface serves the draft preview without new endpoints.

- [ ] `/api/chat`, `/api/voice/provider`, Sarvam + ElevenLabs `session`/`tts`/`transcribe`, `agent-session`, `/api/realtime/session`, `/api/gemini/session`, `/api/rag/search` accept `scope:"draft"` (body / form field) and thread it to the resolver
- [ ] `/api/rag/search` grounding path honors the draft scope with conditional spread (preserve existing call shapes — a naive patch regressed `realtime.test.ts` once)
- [ ] Auth: draft scope requires the platform session (same guard as `/api/agents`)

**Key files:** the API routes above · `src/modules/rag/grounding.ts`
**Acceptance:** draft-scope requests return draft-resolved config; published/default requests unchanged.

### Phase 3 — Client hooks draft mode

**Goal:** the shared voice/chat client can run in draft mode from the preview page.

- [ ] `VoiceClientOptions.draftMode` + wire through `useVoiceClient` and all 7 provider hooks (session bodies, TTS bodies, transcribe forms, RAG searches, `streamChatCompletion` draftScope)

**Key files:** `src/modules/assistant/core/hooks/*` · `src/modules/assistant/client/stream.ts`
**Acceptance:** a preview-mounted conversation hits the same endpoints with `scope:"draft"`; no hook signature changes (zero fork).

### Phase 4 — Shared conversation UI (chat window + in-window voice stage)

**Goal:** one feature layer that both preview and published page mount; voice replaces the chat pane INSIDE the window.

**Refs:** R1 (entry state), R2 (chatting state), R3 (voice start state) — inspiration only, ship Clara's own design.

- [ ] `ConversationChatWindow`: message list (markdown, citations, suggestions), composer, and an `AnimatePresence` swap to the voice stage when a session starts
- [ ] `ConversationVoiceStage`: lifecycle status pill, live transcript, mute / interrupt / end controls, hidden audio sink
- [ ] `use-agent-conversation`: message state, voice-turn folding into transcript with folded-turn-ID dedupe
- [ ] `chat-stream.ts`: shared NDJSON reader
- [ ] Ending a voice session returns to the chat transcript — voice turns appear as folded messages

**Key files:** `src/features/agent-conversation/**`
**Acceptance (O1, O2):** voice starts inside the chat window, runs a full session, ends, and the window returns to chat with the conversation folded in. No modal anywhere in the flow.

### Phase 5 — Realtime voice orb animations

**Goal:** the reactive circle-motion visual system. Full spec in §6.

**Refs:** R3, R4 — the *behavior* (react to speech, instant switching) is the requirement; the *look* is Clara's own.

- [ ] `RealtimeVoiceOrb` with 4 states: connecting (breathing halo) · user speaking (six rotating wave rings driven by live mic bands) · thinking (orbit dots) · agent speaking (ripple bloom + glow core + output levels)
- [ ] `use-mic-visualizer`: viz-only second `getUserMedia` with AEC so the 7 provider hooks are untouched
- [ ] CSS keyframes `clara-orb-breathe` / `clara-orb-ripple` / `clara-orb-rotate` in `globals.css`, with `prefers-reduced-motion` support
- [ ] Instant state switching: drive the orb class from the `uiState` machine so turn changes swap visuals within one frame

**Key files:** `realtime-voice-orb.tsx` · `use-mic-visualizer.ts` · `src/app/globals.css`
**Acceptance (O4):** two clearly different circle motions; switching is instantaneous during live conversation.

### Phase 6 — Draft preview screen (auth-only, draft-fed)

**Goal:** the preview page the owner tests everything on.

**Refs:** R1, R2, R3.

- [ ] `/preview/agents/[agentId]` resolves `?scope=draft` with fallback draft → live projection → published
- [ ] `draft-preview-screen.tsx`: header with draft badge + facts sidebar (tests "the current knowledge base and everything")
- [ ] Mounts `ConversationChatWindow` in draft mode (chat + in-window voice)
- [ ] Route stays behind platform auth (middleware `ADMIN_PAGE_PREFIXES` already includes `/preview`)
- [ ] Delete/retire the old published-only preview implementation

**Acceptance (O5):** logged-out access is redirected to login; logged-in users get a chat + voice experience driven by DRAFT config and the LIVE KB.

### Phase 7 — Public infra: config API + `pub_` tokens

**Goal:** a safe public entry point that reuses the embed stack.

- [ ] `GET /api/public/agents/[agentId]/config`: verify active deployment + `publicAccess` → return published config + mint short-lived signed `pub_` token; rate-limit (60 req/min, 5 min window per IP)
- [ ] `public-token.ts`: `pub_v1` HMAC tokens, 2h TTL, deployment-bound
- [ ] `validateEmbedRequest` `pub_` branch: re-check active deployment + `publicAccess` **per request**; org-plan lookup for quota
- [ ] Middleware: allow `/api/public/*`

**Key files:** `src/modules/embed/core/public-token.ts` · `validate-embed.ts` · middleware
**Acceptance:** public page works with no platform cookie; revoked/unpublished agents stop serving immediately (token re-check); rate limits hold.

### Phase 8 — Published public page

**Goal:** the separate, public, "simple and crisp rich" page — published settings only.

**Refs:** R4 (realtime voice agent), R5 (chat: simple and crisp in richness).

- [ ] `/agents/[agentId]` → `published-agent-screen.tsx`: hero, chat window with in-window voice, unavailable state (no active deployment / publicAccess off), token-expiry auto-recovery
- [ ] Reuses `ConversationChatWindow` via the `pub_` credential — no forked hooks
- [ ] Publish screen gains a "Public page" link card
- [ ] Serve from a domain without edge SSO protection when going public (see §4.4 operational note)

**Acceptance (O6):** public visitors get chat + realtime voice driven ONLY by published config + KB snapshot; draft edits never appear; unpublished/revoked agents show the unavailable state.

### Phase 9 — Admin UI/UX structure (round-2 feedback)

**Goal:** restore the familiar navigation shape — "redesign the existing UI/UX, not introduce anything new."

**Refs:** R6 (anti-pattern) · R7, R8, R9 (sidebar states) · R10 (topbar cluster) · R11 (publish UI) · R12 (versioned drafts) · R13 (draft diff) · R14 (profile popup).

- [ ] Sidebar: "Agents >" group header + agent identity card (version, hover delete) + the 7 section tabs (Overview / Main / FAQ / Knowledge / Tools / Branches / Publish) with icons; plain sidebar when no agent is selected; remove the menus from the top of the main content area
- [ ] `agent-topbar.tsx`: `AgentTopbarProvider` (one cached context fetch + forced refetch on workspace refresh) · `TopbarContextLabel` (agent name + section) · `AgentTopbarCluster` = `Main · vN` chip, `Draft changes` pill → pending-changes drawer, `Published vN` pill → published-URL popover, `Draft saved Xm ago` (20s tick), `Preview` + one-click `Publish update`
- [ ] Remove the username from the navbar; avatar-only profile trigger
- [ ] "Draft changes" → `DraftChangesDrawer`: `fetchAgentDiff(a=currentVersion, b=draft)` → DiffViewer + publish shortcut
- [ ] "Published vN" → published URL controls (copy / open public page)
- [ ] `ProfileMenu` + `UsageLimitsSection`: lazy fetch on open; plan badge; meters for requests/day, storage, KBs, docs-per-KB; amber ≥80%, rose ≥100%, Unlimited(-1) · backed by `/api/orgs/[orgId]/usage-limits`
- [ ] Remove the one-navbar workspace shell entirely; add mobile horizontal agent tab strip below the topbar

**Key files:** `admin-shell.tsx` · `agent-topbar.tsx` · `ProfileMenu.tsx` · `workspace-shell.tsx` · `context-cache.ts`
**Acceptance (O7):** the seven menus live under "Agents >" in the sidebar (plain when no agent selected); the version cluster sits next to the profile avatar with no username; draft diff and URL controls work; profile popup shows live usage meters.

### Phase 10 — Tests & quality gates

- [ ] New unit tests: `public-token` (7) · `resolve-draft` (5) — keep the suite at the HEAD baseline otherwise
- [ ] `tsc` 0 errors · ESLint 0 NEW warnings · `vitest` = HEAD baseline (32 pre-existing env failures) · production/webpack build compiles (in-build tsc OOM is environmental and identical at HEAD)
- [ ] Manual UI pass against §10 checklist

### Phase 11 — Git delivery & bookkeeping

- [ ] Commit on `Vite-Converted` (single logical commit per round)
- [ ] PR `Vite-Converted → Vercel-Preview`: create **and self-merge**
- [ ] PR `Vercel-Preview → Vercel-Prod`: create, **leave open** for owner review
- [ ] Append the round to `/home/z/my-project/worklog.md`

---

## 6. Voice orb animation specification (O4 — the centerpiece)

| State | Visual | Driven by |
|---|---|---|
| Connecting | Breathing halo (`clara-orb-breathe`) — slow scale/glow pulse | session connect progress |
| **User speaking** | **Six radial wave arcs/rings rotating** (`clara-orb-rotate`) — the "embedded voice agent, 6 like waving" circular motion; amplitude follows live mic frequency bands | `use-mic-visualizer` (viz-only second `getUserMedia` with AEC; does NOT touch the 7 provider hooks' audio pipelines) |
| Thinking | Orbit dots circling the core | `uiState === 'thinking'` |
| **Agent speaking** | **Ripple rings blooming outward + glowing core + orbiting spark** (`clara-orb-ripple`) — a distinct family from the user's waves | TTS output level / `uiState === 'speaking'` |

**Switching contract:** the orb's state class is a pure function of the existing `uiState` machine (`idle | connecting | listening | thinking | speaking | error`). Turn boundaries (user → thinking → agent → listening…) swap the visual class **within one frame** — no crossfade that delays the reaction mid-conversation. `prefers-reduced-motion` replaces motion with static level indicators.

---

## 7. Security & isolation model

| Surface | Auth | Config source | KB source |
|---|---|---|---|
| Preview `/preview/agents/[agentId]` | Platform session only (login-gated; middleware prefix) | DRAFT (preferDraft; fallback live projection → published) | LIVE collections |
| Published `/agents/[agentId]` | Public; `pub_` token (HMAC, 2h TTL, deployment-bound, per-request re-check of deployment + `publicAccess`) | PRODUCTION version config | Snapshot collections (`pub_xxx`) |
| Embeds | Existing `clr_` keys via `validateEmbedRequest` | unchanged | unchanged |

**Invariants:** draft never leaks to public; revoked publication stops serving immediately (token re-check); public config API rate-limited per IP; the preview never becomes publicly accessible.

---

## 8. Git workflow (mandatory every round)

1. Verify `Vercel-Preview` / `Vercel-Prod` / `Vite-Converted` are clean and current (Phase 0).
2. All work happens on **`Vite-Converted`** (worktree `.worktrees/vc`).
3. Full test pass before committing (Phase 10 gates).
4. PR `Vite-Converted → Vercel-Preview` — create and **self-merge**.
5. PR `Vercel-Preview → Vercel-Prod` — create and **leave open**; the product owner reviews and merges.
6. Append the round to `/home/z/my-project/worklog.md`.

---

## 9. Quality gates

- `tsc` — zero errors
- ESLint — zero NEW warnings (pre-existing warnings must not grow)
- `vitest` — results must equal the HEAD baseline (32 pre-existing env-dependent failures; no new failures)
- Production build — webpack compile OK (in-build tsc OOM is environmental, identical at HEAD)
- Visual QA — §10 checklist against the live preview

---

## 10. Final acceptance checklist (mirror of the owner's asks)

- [ ] Voice chat runs **inside the chat window** — no separate modal (O1)
- [ ] Realtime Voice Agent session: **start → connect → converse → complete → return to chat**, in the preview (O2)
- [ ] UI/UX is Clara's own unique design — inspired by R1–R5, copying nothing (O3)
- [ ] User speaking → six-element circular **waving** motion; agent speaking → a **different** circle motion; **instant** switching mid-conversation (O4)
- [ ] Preview reachable **only by logged-in users**; tests current KB and settings via **drafted changes** (O5)
- [ ] Published page is **separate, public, simple/crisp/rich**, and uses **only published settings** (O6)
- [ ] Agent menus restored under "Agents >" in the sidebar; version cluster next to the profile avatar; username gone; draft diff; published URL controls; profile usage-limits popup (O7)
- [ ] All quality gates green; PRs delivered per §8

---

## Appendix A — Screenshot → Phase quick map

| Ref | Filename | Phase |
|---|---|---|
| R1 | `pasted_image_1790169728678.png` | 4, 6 |
| R2 | `pasted_image_1790169687747.png` | 4, 6 |
| R3 | `pasted_image_1790169802320.png` | 4, 5 |
| R4 | `pasted_image_1790170695981.png` | 5, 8 |
| R5 | `pasted_image_1790170491254.png` | 8 |
| R6 | `pasted_image_1790178841516.png` | 9 (anti-pattern) |
| R7 | `pasted_image_1790179059322.png` | 9 |
| R8 | `pasted_image_1790179416607.png` | 9 |
| R9 | `pasted_image_1790179235085.png` | 9 |
| R10 | `pasted_image_1790179688782.png` | 9 |
| R11 | `pasted_image_1790179931543.png` | 9 |
| R12 | `pasted_image_1790180026215.png` | 9 |
| R13 | `pasted_image_1790180748312.png` | 9 |
| R14 | `pasted_image_1790180948723.png` | 9 |

