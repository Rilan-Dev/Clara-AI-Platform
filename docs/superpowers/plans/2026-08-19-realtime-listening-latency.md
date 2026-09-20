# Realtime Listening and Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Clara realtime speech capture in noisy/mobile environments and reduce measurable latency without bypassing tenant/project language, voice, model, or RAG isolation.

**Architecture:** Keep WebRTC/OpenAI Realtime as the audio transport, add a small runtime audio/VAD configuration layer, instrument the realtime state machine, and optimize the RAG critical path without creating a second response path. Project-resolved AI configuration remains authoritative.

**Tech Stack:** Next.js 15, TypeScript, WebRTC, OpenAI Realtime API, Qdrant, existing project AI-config resolver, Vitest/Jest test stack already used by the repository.

**Spec:** `docs/superpowers/specs/2026-08-19-realtime-listening-latency-design.md`

## Global Constraints

- Project `allowedLanguages` is the hard language boundary.
- Project-resolved voice/model/transcription configuration must be used; no new tenant-facing static provider values.
- Demo mode must continue using its server-side authorization path and cannot bypass project restrictions.
- One user turn must produce at most one final model response.
- Stale/cancelled RAG work must never mutate a newer turn.
- Browser audio constraints are capability-based; unsupported constraints must degrade safely.
- Do not claim latency improvement without telemetry or test evidence.

---

### Task 1: Add a project-safe realtime audio configuration helper

**Files:**
- Create: `src/modules/assistant/core/realtime/audio-config.ts`
- Test: `src/modules/assistant/core/realtime/audio-config.test.ts`

**Interfaces:**
- Consumes: optional project/runtime audio settings.
- Produces: `MediaTrackConstraints` and normalized VAD configuration objects.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildRealtimeAudioConstraints, normalizeRealtimeVad } from "./audio-config";

describe("realtime audio config", () => {
  it("enables browser speech-processing constraints by default", () => {
    expect(buildRealtimeAudioConstraints()).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("does not emit invalid VAD ranges", () => {
    expect(normalizeRealtimeVad({ threshold: 9, silenceDurationMs: -10 })).toEqual(
      expect.objectContaining({ threshold: 1, silenceDurationMs: expect.any(Number) }),
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- audio-config.test.ts --run`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the minimal helper**

```ts
export function buildRealtimeAudioConstraints(overrides: Partial<MediaTrackConstraints> = {}): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...overrides,
  };
}

export function normalizeRealtimeVad(input: { threshold?: number; silenceDurationMs?: number; prefixPaddingMs?: number } = {}) {
  return {
    threshold: Math.min(1, Math.max(0, input.threshold ?? 0.5)),
    silenceDurationMs: Math.min(4000, Math.max(200, input.silenceDurationMs ?? 900)),
    prefixPaddingMs: Math.min(2000, Math.max(0, input.prefixPaddingMs ?? 300)),
  };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- audio-config.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant/core/realtime/audio-config.ts src/modules/assistant/core/realtime/audio-config.test.ts
git commit -m "feat: add safe realtime audio configuration"
```

### Task 2: Instrument realtime turn and latency stages

**Files:**
- Create: `src/modules/assistant/core/realtime/latency.ts`
- Modify: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- Test: `src/modules/assistant/core/realtime/latency.test.ts`

**Interfaces:**
- Consumes: realtime event names and turn IDs.
- Produces: a bounded per-turn timing snapshot with `timeToFirstAudioMs`, `ragLatencyMs`, and `totalTurnLatencyMs`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { createLatencyTracker } from "./latency";

describe("realtime latency tracker", () => {
  it("records first audio once and computes turn latency", () => {
    const t = createLatencyTracker(() => 1000);
    t.mark("speech_started");
    t.mark("response_created");
    t.mark("first_audio");
    t.mark("response_done");
    expect(t.snapshot().timeToFirstAudioMs).toBeGreaterThanOrEqual(0);
    expect(t.snapshot().totalTurnLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- latency.test.ts --run`
Expected: FAIL because the tracker does not exist.

- [ ] **Step 3: Implement tracker with monotonic timestamps**

```ts
type Stage = "speech_started" | "speech_stopped" | "transcription_completed" | "rag_started" | "rag_completed" | "response_created" | "first_audio" | "response_done";

export function createLatencyTracker(now = () => performance.now()) {
  const marks = new Map<Stage, number>();
  return {
    mark(stage: Stage) { if (!marks.has(stage)) marks.set(stage, now()); },
    snapshot() {
      const start = marks.get("speech_started");
      const firstAudio = marks.get("first_audio");
      const done = marks.get("response_done");
      const ragStart = marks.get("rag_started");
      const ragDone = marks.get("rag_completed");
      return {
        timeToFirstAudioMs: start !== undefined && firstAudio !== undefined ? firstAudio - start : null,
        totalTurnLatencyMs: start !== undefined && done !== undefined ? done - start : null,
        ragLatencyMs: ragStart !== undefined && ragDone !== undefined ? ragDone - ragStart : null,
      };
    },
  };
}
```

- [ ] **Step 4: Wire marks into speech, transcription, RAG, response-created, first-audio, and response-done handlers**

Use the existing `RT_EVENTS` constants; do not add fuzzy event matching.

- [ ] **Step 5: Run tests and type-check**

Run: `npm test -- latency.test.ts --run && npm run type-check`
Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/assistant/core/realtime/latency.ts src/modules/assistant/core/realtime/latency.test.ts src/modules/assistant/core/hooks/useOpenAIRealtime.ts
git commit -m "feat: instrument realtime turn latency"
```

### Task 3: Harden microphone capture and VAD initialization

**Files:**
- Modify: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- Modify: `src/app/api/embed/voice-init/route.ts`
- Test: `src/app/api/embed/voice-init/route.test.ts` or the repository's existing voice-init test location

**Interfaces:**
- Consumes: project-resolved `allowedLanguages`, `defaultLanguage`, `voice`, `realtimeModel`, and existing configuration.
- Produces: a voice-init payload that includes safe realtime turn/audio settings while preserving project isolation.

- [ ] **Step 1: Add tests asserting project language and voice remain authoritative**

```ts
it("returns project language restrictions with realtime configuration", async () => {
  const response = await invokeVoiceInitForTest();
  expect(response.allowedLanguages).toContain(response.language);
  expect(response.voice).toBeDefined();
  expect(response.projectId).toBeDefined();
});
```

- [ ] **Step 2: Add optional resolved realtime settings without hard-coded tenant overrides**

Return normalized settings from the existing resolver/config path. If no project value exists, use conservative runtime defaults.

- [ ] **Step 3: Change microphone acquisition to use the helper**

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: buildRealtimeAudioConstraints(resolvedAudioConstraints),
  video: false,
});
```

After acquisition, inspect `track.getSettings()` and log only non-sensitive capability/settings metadata when debug mode is enabled.

- [ ] **Step 4: Send VAD configuration through the session update**

Use the OpenAI-supported server VAD fields for the selected realtime model. Preserve `create_response: false` for Clara's single RAG response path.

- [ ] **Step 5: Run focused voice tests and type-check**

Run: `npm test -- voice-init --run && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/assistant/core/hooks/useOpenAIRealtime.ts src/app/api/embed/voice-init/route.ts src/app/api/embed/voice-init/route.test.ts
git commit -m "feat: harden realtime microphone and VAD setup"
```

### Task 4: Prevent stale turns and incomplete responses

**Files:**
- Modify: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- Test: `src/modules/assistant/core/hooks/useOpenAIRealtime.test.ts` or the repository's existing realtime test location

**Interfaces:**
- Consumes: active turn ID and AbortController.
- Produces: deterministic event ownership for the active turn.

- [ ] **Step 1: Add a test sequence for interruption followed by a new question**

```ts
it("does not append stale audio/transcript events to a newer turn", async () => {
  const harness = createRealtimeHarness();
  await harness.startTurn("first question");
  await harness.interrupt();
  await harness.startTurn("second question");
  harness.emitStaleResponseAudio("first question");
  harness.emitResponseAudio("second question");
  expect(harness.currentAnswer()).not.toContain("first question");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- useOpenAIRealtime.test.ts --run`
Expected: FAIL before event ownership is tightened.

- [ ] **Step 3: Associate response/transcript events with the current generation**

Increment the connection/turn generation on cleanup, interruption, and reconnect. Drop events from previous generations.

- [ ] **Step 4: Ensure response completion closes only the active turn**

Do not mark a newer pending turn as done because an older `response.done` arrived.

- [ ] **Step 5: Run realtime tests**

Run: `npm test -- useOpenAIRealtime.test.ts --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/assistant/core/hooks/useOpenAIRealtime.ts src/modules/assistant/core/hooks/useOpenAIRealtime.test.ts
git commit -m "fix: isolate realtime turns and stale events"
```

### Task 5: Reduce RAG critical-path latency

**Files:**
- Modify: `src/app/api/rag/search/route.ts`
- Modify: `src/modules/admin/core/hybrid-search.ts`
- Modify: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- Test: existing RAG search/hybrid-search test locations

**Interfaces:**
- Consumes: project AI configuration and Qdrant collection.
- Produces: bounded retrieval context with latency metadata and no cross-tenant access.

- [ ] **Step 1: Add tests proving top-K and score filtering remain bounded**

```ts
it("never retrieves more than the requested bounded topK", async () => {
  const results = await searchHybrid("collection", "query", 6);
  expect(results.length).toBeLessThanOrEqual(6);
});
```

- [ ] **Step 2: Measure current dense-search and graph-search timings separately**

Add server-side timing around embedding, vector search, graph retrieval, and context construction. Return aggregate latency only to authenticated/debug consumers; do not expose provider secrets.

- [ ] **Step 3: Parallelize independent graph/vector work**

When graph RAG is enabled, start vector and graph retrieval together after the shared embedding/config resolution step. Preserve document/project filtering.

- [ ] **Step 4: Avoid duplicate embedding work**

Ensure the request path generates the query embedding once and does not call a second provider embedding operation for the same query.

- [ ] **Step 5: Keep fallback behavior bounded**

If score-threshold search returns zero hits, perform exactly one threshold-free fallback with the same top-K cap. Do not loop retries.

- [ ] **Step 6: Run RAG tests and type-check**

Run: `npm test -- rag --run && npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/rag/search/route.ts src/modules/admin/core/hybrid-search.ts src/modules/assistant/core/hooks/useOpenAIRealtime.ts
 git commit -m "perf: reduce realtime RAG critical path latency"
```

### Task 6: Add end-to-end realtime listening regression tests

**Files:**
- Create or modify: `tests/realtime/listening-regression.test.ts`
- Create or modify: `tests/realtime/latency-regression.test.ts`

**Interfaces:**
- Consumes: deterministic realtime event fixtures and mocked RAG timings.
- Produces: regression coverage for noisy/pause-heavy turns and latency stage reporting.

- [ ] **Step 1: Add noisy-turn event fixture**

Simulate speech start, multiple transcription deltas, delayed transcription completion, a short silence, RAG completion, response creation, multiple audio deltas, and response completion.

- [ ] **Step 2: Assert exactly one response is created**

```ts
expect(responseCreateEvents).toHaveLength(1);
```

- [ ] **Step 3: Assert the final user transcript reaches RAG**

```ts
expect(ragQueries[0]).toBe("What does my insurance cover?");
```

- [ ] **Step 4: Assert first-audio and total latency are recorded**

```ts
expect(metrics.timeToFirstAudioMs).toBeGreaterThanOrEqual(0);
expect(metrics.totalTurnLatencyMs).toBeGreaterThanOrEqual(metrics.timeToFirstAudioMs!);
```

- [ ] **Step 5: Run the regression suite**

Run: `npm test -- realtime --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/realtime
git commit -m "test: add realtime listening and latency regressions"
```

### Task 7: Full production verification

**Files:**
- Modify only files required by failed verification; otherwise none.

- [ ] **Step 1: Run formatting/lint/type checks**

Run: `npm run lint && npm run type-check`
Expected: no errors.

- [ ] **Step 2: Run unit and integration tests**

Run: `npm test -- --run`
Expected: all relevant tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: successful Next.js production build.

- [ ] **Step 4: Verify no provider key or sensitive telemetry is emitted**

Search changed files for `OPENAI_API_KEY`, authorization headers, raw audio, and full user transcripts inside logs. Debug telemetry must contain timings/IDs only unless explicitly enabled in a local development environment.

- [ ] **Step 5: Commit verification fixes if needed**

```bash
git add -A
git commit -m "chore: finalize realtime listening production verification"
```
