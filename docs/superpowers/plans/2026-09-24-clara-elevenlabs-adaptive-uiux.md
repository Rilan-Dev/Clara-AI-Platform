# Clara AI ElevenLabs-Adaptive UI/UX Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Clara agent workspace to a single left-sidebar navigation model, move agent branch/version/draft/publish controls into the global top navbar, and deliver a reference-driven ElevenLabs-adaptive Preview and Published conversation experience with realtime voice fully integrated inside the chat window.

**Architecture:** Keep the existing Clara conversation engine and provider abstraction. Refactor presentation around one shared conversation shell, with authenticated Preview resolving draft configuration + current/live KB and public Published resolving published configuration + published KB state. Treat the supplied ElevenLabs screenshots as the primary functional UX benchmark for spatial hierarchy, controls, transitions, and interaction behavior, while applying Clara branding and components rather than copying ElevenLabs branding.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Tailwind CSS, lucide-react, existing Clara admin UI/context APIs, existing `useAgentConversation`/voice client, existing Qdrant/RAG APIs, browser MediaDevices APIs, existing test/build tooling.

**Spec:** This plan is based on the user-provided “Master UI/UX Revamp Prompt: Clara AI Platform (ElevenLabs Adaptive Style)” and its five screenshot states.

## Global Constraints

- Reference images are functional/layout references: `pasted_image_1790169728678.png`, `pasted_image_1790169687747.png`, `pasted_image_1790169802320.png`, `pasted_image_1790170695981.png`, `pasted_image_1790170491254.png`.
- ElevenLabs is the UX benchmark; do not intentionally invent a different information architecture where the reference already establishes a useful interaction.
- Clara must retain its own branding, colors, typography, icons, copy, and animation identity.
- Agent navigation remains in the left sidebar; do not create a second agent sidebar or move the agent menu into the content area.
- When an agent is selected, sidebar sections are exactly Overview, Main, FAQ, Knowledge, Tools, Branches, Publish.
- When no agent is selected, the sidebar shows the available agents without nested agent-section navigation.
- The username must not be displayed as navbar text; identity remains behind the profile avatar.
- Branch/version/draft/publish controls belong in the top navbar beside the profile area.
- Preview is authenticated-only and uses draft configuration plus the current/live KB.
- Published is public/anonymous and uses published configuration plus published KB state only.
- Voice mode is inside the existing conversation window; it must not become a separate page, sidebar, or disconnected modal.
- User-speaking and agent-speaking realtime visuals must be visually distinct and transition immediately.
- Voice sessions must return to the normal conversation UI and fold completed voice turns into the same message history.
- Clara remains responsible for KB/RAG behavior; provider selection remains configurable and existing OpenAI, ElevenLabs, Gemini, and Sarvam paths must not be removed.
- Existing provider/model separation for chat, pipeline voice, and realtime voice must remain intact.
- All new interaction states must be keyboard accessible and meet WCAG AA contrast requirements.
- Existing working functionality must be preserved unless this plan explicitly changes its presentation or placement.

## Review Focus

- **Agent route without a selected agent:** expect only agent browsing/navigation, never stale nested sections from the previous agent; test agents index navigation.
- **Draft edited after the current version:** expect the navbar to expose Draft changes and enable the publish flow; test a draft mutation against version/deployment state.
- **Published page while an unpublished draft exists:** expect anonymous users to see only the last published state; test draft-leak isolation.
- **Realtime session during an agent interruption:** expect user-speaking state to replace agent-speaking state immediately without duplicate responses; test interruption and rapid state transitions.
- **Microphone/session teardown:** expect no active tracks or stale visualizer after End Session or route change; test permission denial, disconnect, and unmount cleanup.

---

## Task 1: Establish the ElevenLabs-to-Clara Reference Contract

**Files:**
- Create: `docs/superpowers/specs/2026-09-24-clara-elevenlabs-adaptive-uiux.md`
- Reference: the five supplied screenshot filenames in the project prompt; use attached/source screenshot binaries when available during implementation review.
- Modify: none

**Interfaces:**
- Produces the canonical UI state/element mapping consumed by all later tasks.
- Defines required states without coupling them to a particular CSS implementation.

- [ ] **Step 1: Record the five reference states**

Create a table in the spec with exactly these rows:

| Reference | Clara state |
|---|---|
| `pasted_image_1790169728678.png` | Preview entry |
| `pasted_image_1790169687747.png` | Preview chat |
| `pasted_image_1790169802320.png` | Preview realtime starting |
| `pasted_image_1790170695981.png` | Published realtime |
| `pasted_image_1790170491254.png` | Published chat |

For each state document: shell, identity area, conversation area, composer, voice controls, status indicators, navigation, version controls, and mobile behavior.

- [ ] **Step 2: Define the adaptive rule**

Document this exact rule: “Reuse the reference interaction hierarchy and useful spatial relationships; rebuild the visuals as Clara components and styling.”

- [ ] **Step 3: Define prohibited regressions**

Record the non-negotiables: no second sidebar, no standalone voice page, no public draft UI, no public admin navigation, no separate voice conversation implementation, no provider removal.

- [ ] **Step 4: Review the spec against the user prompt**

Verify every requested screenshot filename and every requested UI region is represented before implementation starts.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-24-clara-elevenlabs-adaptive-uiux.md
git commit -m "docs: define Clara ElevenLabs-adaptive UI contract"
```

---

## Task 2: Correct the Agent Workspace Sidebar

**Files:**
- Modify: `src/features/admin/layouts/admin-shell.tsx`
- Test: existing frontend test suite; add focused navigation tests wherever the repository's current UI test conventions place them.

**Interfaces:**
- Consumes `primaryOrgId`, pathname, `useAgents`, and existing workspace routes.
- Produces one sidebar with agent browsing and nested agent-section navigation.

- [ ] **Step 1: Add navigation assertions**

Test these route states:
`/orgs/:orgId/agents` shows agents without nested sections.
`/orgs/:orgId/agents/:agentId` shows Agents > Overview/Main/FAQ/Knowledge/Tools/Branches/Publish.
A direct navigation to each section highlights only its section.
No horizontal content-level agent navigation is rendered.

- [ ] **Step 2: Remove any duplicate agent navigation**

Search the layout tree for agent section tabs/top-level workspace nav and keep the sidebar as the sole persistent agent navigation surface.

- [ ] **Step 3: Refine the sidebar hierarchy**

Keep the existing `agentSectionNav()` route definitions but present them as one nested hierarchy:

```text
Agents >
  [agent identity]
  Overview
  Main
  FAQ
  Knowledge
  Tools
  Branches
  Publish
```

The active agent identity must remain compact so the rail does not consume unnecessary workspace width.

- [ ] **Step 4: Preserve the non-agent sidebar**

Keep Dashboard, Members, Billing, Settings, and platform-admin navigation according to the existing role model. Do not accidentally expose organisation content to platform admins.

- [ ] **Step 5: Verify responsive behavior**

Desktop/tablet: fixed left rail.
Mobile: existing bottom navigation/more sheet remains; do not create a second mobile agent sidebar.

- [ ] **Step 6: Run focused tests**

Run the repository's frontend test command and TypeScript check. Expected: navigation assertions pass and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/layouts/admin-shell.tsx
git commit -m "feat: restore nested agent sidebar navigation"
```

---

## Task 3: Rebuild the Global Agent Topbar Cluster

**Files:**
- Modify: `src/features/admin/layouts/agent-topbar.tsx`
- Modify: `src/features/admin/layouts/admin-shell.tsx`
- Test: focused topbar/version tests

**Interfaces:**
- Consumes `AgentWorkspaceContextDTO`, `fetchAgentDiff`, `saveAgentVersion`, `publishAgentVersion`.
- Produces a compact topbar cluster containing branch/version, draft status, published version, saved time, Preview, and Publish update.

- [ ] **Step 1: Define the topbar contract test**

Assert that an open agent renders:
`Main`, `v{currentVersion}`, `Draft changes` when applicable, `Published v{deploymentVersion}` when applicable, draft-saved age, `Preview`, and `Publish update`.

Assert the user name is not rendered in the topbar.

- [ ] **Step 2: Refine branch/version control**

Use a single compact control representing branch and version:

```text
Main  ·  v8
```

It must be interactive and ready to support additional branches without hard-coding the current branch as the only conceptual option.

- [ ] **Step 3: Refine draft status**

When draft content differs from the current version, render `Draft changes` as the entry point to the diff viewer.

When there are no changes, do not display a misleading pending-change state.

- [ ] **Step 4: Refine published state**

Render `Published v8` as a status/control that exposes the public deployment action/link without exposing internal draft information.

- [ ] **Step 5: Keep Preview and Publish update adjacent**

Preview must navigate to the authenticated Preview route. Publish update must use the existing save-version-then-publish behavior and refresh the shared context.

- [ ] **Step 6: Preserve cache synchronization**

Continue using `fetchAgentWorkspaceContextCached()` for normal reads and `updateAgentWorkspaceContextCache()` after mutation. The sidebar identity and topbar must not show conflicting versions.

- [ ] **Step 7: Verify**

Test:
1. no draft changes;
2. draft changes;
3. never-published agent;
4. already-published agent;
5. save then publish;
6. publish failure.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/layouts/agent-topbar.tsx src/features/admin/layouts/admin-shell.tsx
git commit -m "feat: move agent version controls into global topbar"
```

---

## Task 4: Profile Avatar Menu and Navbar Cleanup

**Files:**
- Modify: `src/components/admin/ProfileMenu.tsx`
- Modify: `src/features/admin/layouts/admin-shell.tsx`
- Test: profile-menu interaction tests

**Interfaces:**
- Consumes existing authenticated user and organisation usage APIs.
- Produces avatar-only navbar identity with usage, workspace, settings, billing, theme, and sign-out actions.

- [ ] **Step 1: Test avatar-only identity**

Assert the navbar contains an accessible profile button but does not contain the full username text.

- [ ] **Step 2: Preserve the existing rich menu**

Keep identity, role, usage/limits, Profile & security, Account settings, Billing & plan, Platform settings where applicable, and Sign out.

- [ ] **Step 3: Add workspace/plan presentation**

For organisation users, expose current workspace and plan near usage information without moving this information back into the main navbar.

- [ ] **Step 4: Verify keyboard behavior**

Opening, Escape, outside-click, and menu navigation must work without trapping focus incorrectly.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ProfileMenu.tsx src/features/admin/layouts/admin-shell.tsx
git commit -m "feat: consolidate profile controls into avatar menu"
```

---

## Task 5: Build the Pending Changes Diff Viewer and Publish Confirmation

**Files:**
- Modify: `src/features/admin/layouts/agent-topbar.tsx`
- Inspect/reuse: `src/components/admin/ai-platform/shared`
- Test: diff and publish interaction tests

**Interfaces:**
- Consumes `fetchAgentDiff(agentId)` and `SemanticDiffDTO`.
- Produces a modal/drawer with readable field-level before/after changes and a publish confirmation action.

- [ ] **Step 1: Test diff opening**

Clicking Draft changes must load the current semantic diff and display a loading state, error state, empty state, and populated state.

- [ ] **Step 2: Present changes as before/after rows**

Represent examples such as:

```text
Expressive Mode
Off  →  On

Model ID
eleven_multilingual_v2  →  eleven_v3_conversational
```

Use semantic removal/addition styling rather than relying on color alone.

- [ ] **Step 3: Add publish confirmation**

Before publishing pending changes, show a concise confirmation with the target branch/version and public effect.

- [ ] **Step 4: Prevent accidental duplicate publishing**

Disable the publish action while a publish request is pending and use the existing mutation synchronization event after success.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/layouts/agent-topbar.tsx
git commit -m "feat: add pending changes diff and publish confirmation"
```

---

## Task 6: Normalize the Shared Conversation State Model

**Files:**
- Modify: `src/features/agent-conversation/hooks/use-agent-conversation.ts`
- Modify: `src/features/agent-conversation/components/conversation-chat-window.tsx`
- Modify: `src/features/agent-conversation/components/conversation-voice-stage.tsx`
- Modify: `src/features/agent-conversation/components/realtime-voice-orb.tsx`
- Test: conversation state tests

**Interfaces:**
- Consumes provider-neutral `useVoiceClient()`.
- Produces a single conversation state machine used by Preview and Published.

- [ ] **Step 1: Define explicit realtime states**

Use:

```ts
type RealtimeUiState =
  | "idle"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "thinking"
  | "agent-speaking"
  | "ending"
  | "error";
```

Map provider status/audio events into this UI state without exposing provider-specific states to presentation components.

- [ ] **Step 2: Test state transitions**

Pin:
idle → connecting → listening;
listening → user-speaking;
user-speaking → thinking;
thinking → agent-speaking;
agent-speaking → listening;
agent-speaking → user-speaking for interruption;
any active state → ending → idle.

- [ ] **Step 3: Keep voice inside ConversationChatWindow**

The voice stage must be rendered as a mode/state of the existing chat window. Do not introduce a route or independent page.

- [ ] **Step 4: Preserve transcript folding**

On session completion, append only unfurled voice turns to the shared message list.

- [ ] **Step 5: Prevent duplicate voice turns**

Use stable turn IDs and guard against repeated provider history snapshots.

- [ ] **Step 6: Commit**

```bash
git add src/features/agent-conversation/hooks/use-agent-conversation.ts src/features/agent-conversation/components/conversation-chat-window.tsx src/features/agent-conversation/components/conversation-voice-stage.tsx src/features/agent-conversation/components/realtime-voice-orb.tsx
git commit -m "feat: normalize Clara realtime conversation states"
```

---

## Task 7: Correct the Realtime User-Speaking Visualizer

**Files:**
- Modify: `src/features/agent-conversation/components/realtime-voice-orb.tsx`
- Modify: `src/features/agent-conversation/hooks/use-mic-visualizer.ts`
- Test: visual/state behavior and browser integration tests

**Interfaces:**
- Consumes `micLevels: number[]` from the visualizer and realtime UI state.
- Produces six clearly separated reactive user-speaking elements.

- [ ] **Step 1: Test six-element rendering**

Assert exactly six user-speaking visual elements are rendered and their height/intensity responds to mic-level input.

- [ ] **Step 2: Implement stable six-element geometry**

Use six vertical/reactive elements positioned according to the reference interaction. They must remain visually centered and avoid layout shift.

- [ ] **Step 3: Tune motion**

Use approximately 200ms UI transitions for control/state changes while keeping the microphone response continuous rather than delayed.

- [ ] **Step 4: Validate microphone capture architecture**

The current hook opens a second `getUserMedia()` stream. Test whether this creates:
- a second permission request;
- duplicate microphone capture;
- feedback/echo;
- unnecessary CPU usage;
- tracks that remain alive after disconnect.

If the provider's stream can expose an analyser safely, prefer sharing that stream. If it cannot, keep the visual-only stream but ensure it is strictly lifecycle-bound and never produces audio output.

- [ ] **Step 5: Add reduced-motion behavior**

When `prefers-reduced-motion: reduce` is active, retain state indication without high-amplitude continuous animation.

- [ ] **Step 6: Commit**

```bash
git add src/features/agent-conversation/components/realtime-voice-orb.tsx src/features/agent-conversation/hooks/use-mic-visualizer.ts
git commit -m "feat: refine six-element realtime user visualizer"
```

---

## Task 8: Correct the Agent-Speaking and Thinking Visual States

**Files:**
- Modify: `src/features/agent-conversation/components/realtime-voice-orb.tsx`
- Modify: `src/features/agent-conversation/components/conversation-voice-stage.tsx`
- Test: realtime visual state tests

**Interfaces:**
- Consumes explicit `RealtimeUiState`.
- Produces distinct visual grammars for agent-speaking, thinking, connecting, and user-speaking.

- [ ] **Step 1: Test visual exclusivity**

For each state assert that only the corresponding primary visual treatment is active.

- [ ] **Step 2: Preserve a distinct agent-speaking treatment**

Use the existing Clara ripple/orbital concept as the base, but make it visibly different from the six-element user visualizer.

- [ ] **Step 3: Make state switching immediate**

Do not wait for animation completion before switching from agent-speaking to user-speaking. State changes must change the visual branch in the same render cycle as the conversation state.

- [ ] **Step 4: Keep connecting and thinking understandable**

Connecting = breathing/connection indicator.
Thinking = processing/orbit indicator.
Neither should be mistaken for microphone listening.

- [ ] **Step 5: Add text/state labels**

Expose accessible labels such as “Connecting”, “Listening”, “You’re speaking”, “Clara is thinking”, and “Clara is speaking”.

- [ ] **Step 6: Commit**

```bash
git add src/features/agent-conversation/components/realtime-voice-orb.tsx src/features/agent-conversation/components/conversation-voice-stage.tsx
git commit -m "feat: distinguish Clara realtime speaking states"
```

---

## Task 9: Rebuild the Preview Experience Around the Reference Layout

**Files:**
- Modify: `src/features/agent-conversation/screens/draft-preview-screen.tsx`
- Modify: `src/features/agent-conversation/components/conversation-chat-window.tsx`
- Test: Preview route/browser tests

**Interfaces:**
- Consumes draft preview DTO, draft scope, current/live KB, shared conversation controller.
- Produces authenticated Preview with draft indication and integrated text/realtime interaction.

- [ ] **Step 1: Verify authentication boundary**

Logged-out request to `/preview/agents/:agentId` must redirect/block. Do not rely only on visual hiding; server/API authorization must remain authoritative.

- [ ] **Step 2: Preserve draft/live-KB semantics**

Preview request must continue carrying `scope: "draft"`; KB remains Clara's current/live KB.

- [ ] **Step 3: Align entry state with the reference**

Keep agent identity and Draft Preview status prominent without consuming the conversation canvas with unnecessary admin metadata.

- [ ] **Step 4: Align chat state with the reference**

The conversation window should contain:
- agent identity/header;
- message history;
- sources where configured;
- unified composer;
- attachment/KB affordance;
- text entry;
- Voice Mode action.

- [ ] **Step 5: Align realtime start state**

Voice activation transforms the same chat interaction into realtime mode. No page navigation.

- [ ] **Step 6: End session back to chat**

End Session must restore the composer and retain transcript turns in the conversation.

- [ ] **Step 7: Test draft mutation**

Change a draft setting, refresh Preview, and assert the changed setting is visible. Then check the public page remains unchanged until publish.

- [ ] **Step 8: Commit**

```bash
git add src/features/agent-conversation/screens/draft-preview-screen.tsx src/features/agent-conversation/components/conversation-chat-window.tsx
git commit -m "feat: align authenticated Preview with Clara reference UX"
```

---

## Task 10: Rebuild the Published Public Experience

**Files:**
- Modify: `src/features/agent-conversation/screens/published-agent-screen.tsx`
- Modify: `src/features/agent-conversation/components/conversation-chat-window.tsx`
- Test: public route/browser tests

**Interfaces:**
- Consumes public published config and signed session token.
- Produces anonymous published chat/realtime experience with no workspace/admin UI.

- [ ] **Step 1: Verify anonymous access**

Published page loads without authentication when publication/public-access rules permit it.

- [ ] **Step 2: Verify published-only config**

Only `/api/public/agents/:agentId/config` data may drive public identity/runtime configuration.

- [ ] **Step 3: Remove internal workspace chrome**

No sidebar, draft badge, version editor, workspace controls, or profile menu on the public agent page.

- [ ] **Step 4: Align public chat with reference**

Center the interaction and keep the conversation visually simple, crisp, and rich. The composer must expose a clear Voice Mode switch.

- [ ] **Step 5: Align public realtime with reference**

Use the public realtime interaction pattern as the benchmark while retaining Clara-specific visual identity and accessible End Call/Switch to Text controls.

- [ ] **Step 6: Test draft isolation**

Modify draft only and assert public output remains unchanged. Publish, refresh, and assert the published state updates.

- [ ] **Step 7: Test unpublish/private state**

The page must render the existing unavailable state and public APIs must reject access when the deployment is no longer public.

- [ ] **Step 8: Commit**

```bash
git add src/features/agent-conversation/screens/published-agent-screen.tsx src/features/agent-conversation/components/conversation-chat-window.tsx
git commit -m "feat: align published agent with Clara public UX"
```

---

## Task 11: Responsive and Accessibility Pass

**Files:**
- Modify: affected Clara conversation/sidebar/topbar components from Tasks 2–10.
- Test: browser/device matrix

**Interfaces:**
- Consumes completed desktop UI.
- Produces responsive desktop/tablet/mobile behavior with accessible controls.

- [ ] **Step 1: Test desktop workspace**

Verify sidebar + topbar + workspace at 1440px and 1280px widths. Conversation content must not be compressed by unnecessary duplicated navigation.

- [ ] **Step 2: Test tablet**

Verify agent navigation remains discoverable and topbar controls do not overflow.

- [ ] **Step 3: Test mobile Preview**

Verify bottom navigation, conversation composer, voice state, End Session, and transcript remain usable within a 360px-wide viewport.

- [ ] **Step 4: Test mobile Published**

Verify anonymous chat and realtime voice have no horizontal overflow and the End Call/Switch to Text controls remain reachable.

- [ ] **Step 5: Test keyboard accessibility**

Tab through sidebar, topbar, diff modal, profile menu, composer, voice control, mute/end controls.

- [ ] **Step 6: Test reduced motion and contrast**

Verify WCAG AA contrast and reduced-motion fallback for realtime animations.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "fix: harden Clara responsive and accessible agent UX"
```

---

## Task 12: End-to-End Regression and Reference Acceptance

**Files:**
- Modify: tests only where failures identify concrete regressions.
- Test: browser E2E suite and production build

**Interfaces:**
- Consumes all completed UI tasks.
- Produces evidence that Preview, Published, versioning, navigation, and realtime voice work together.

- [ ] **Step 1: Run the complete route matrix**

Verify:
1. logged-out Preview blocked;
2. logged-in Preview allowed;
3. agents index has no nested stale agent menu;
4. selected agent has nested sidebar;
5. topbar has version controls;
6. username absent from navbar;
7. profile avatar menu works;
8. pending changes diff opens;
9. publish confirmation works;
10. Preview uses draft;
11. Preview uses current/live KB;
12. text chat works;
13. voice starts inside chat;
14. user six-element visual responds;
15. agent visual is different;
16. interruption switches state immediately;
17. End Session returns to chat;
18. voice transcript folds into chat;
19. public page works anonymously;
20. public page uses published config only;
21. draft changes do not leak;
22. publish updates public state;
23. unpublish/private blocks public state;
24. existing provider choices remain available.

- [ ] **Step 2: Verify realtime audio lifecycle**

During browser testing:
- grant microphone once;
- start voice;
- speak;
- verify user visual;
- allow agent response;
- interrupt agent;
- end session;
- verify microphone tracks stop;
- verify no duplicate voice answer;
- verify no stale visualizer.

- [ ] **Step 3: Capture evidence for the five reference states**

Capture fresh Clara screenshots corresponding to the five supplied reference states and label them:
- Preview entry;
- Preview chat;
- Preview realtime starting;
- Published realtime;
- Published chat.

The comparison is against the reference's functional hierarchy, not its branding.

- [ ] **Step 4: Run build and type verification**

Run the project's production build and TypeScript validation. Expected: build succeeds with runtime-only secrets not required at module import/build time, and no new type errors.

- [ ] **Step 5: Commit test fixes only**

```bash
git add tests src
git commit -m "test: verify Clara agent workspace and realtime UX"
```

---

## Final Acceptance Matrix

| Area | Acceptance condition |
|---|---|
| Sidebar | Agent navigation is in the left rail |
| No agent | Only agent browsing is shown |
| Selected agent | Overview/Main/FAQ/Knowledge/Tools/Branches/Publish nested under agent |
| Topbar | Branch/version/status/actions live beside profile |
| Username | Not displayed as navbar text |
| Profile | Avatar opens identity/usage/settings/billing/sign-out |
| Diff | Pending changes show readable before/after values |
| Publish | Confirmation prevents accidental duplicate publish |
| Preview auth | Login required |
| Preview data | Draft config + current/live KB |
| Preview voice | Inside existing chat window |
| User visual | Six reactive elements |
| Agent visual | Distinct realtime animation |
| Transition | Immediate on turn-state change |
| Session end | Returns to chat |
| Transcript | Voice turns fold into shared history |
| Public auth | Anonymous when published/public |
| Public data | Published config + published KB state only |
| Public UI | No admin/sidebar/workspace controls |
| Draft isolation | Draft never leaks publicly |
| Publish | Published state changes only after publish |
| Provider architecture | Existing provider switching preserved |
| RAG | Clara/Qdrant remains the knowledge source |
| Accessibility | Keyboard, labels, WCAG AA, reduced motion |
| Responsive | Desktop/tablet/mobile verified |
| Build | Production build and type checks pass |

## Self-Review

**Spec coverage:** All supplied screenshot states, sidebar corrections, navbar/versioning, profile menu, diff/publish flow, Preview, Published, realtime voice, voice visual states, draft/published isolation, accessibility, responsive behavior, and regression requirements are assigned to tasks.

**Placeholder scan:** No implementation step is delegated as “TODO”, “TBD”, or “implement later”; each task identifies concrete files, interfaces, tests, and commands.

**Type consistency:** The existing `AgentWorkspaceContextDTO`, `SemanticDiffDTO`, `useAgentConversation`, and `VoiceAvailability` contracts are reused. The proposed `RealtimeUiState` is explicitly introduced before dependent visual tasks.

**Review focus coverage:** All five high-risk conditions listed in Review Focus have explicit test ownership in Tasks 2, 3, 6/8, and 7/12.

**Important implementation note:** The actual screenshot PNG binaries were not available to this planning session for pixel-level inspection. The plan therefore uses the supplied screenshot filenames and the previously established reference-state requirements, while requiring fresh reference-state evidence during Task 1/Task 12 rather than claiming visual details that were not directly inspected.
