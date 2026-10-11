# SESSION-007 — Welcome and inter-turn audio drain

- Date: 2026-10-12
- Repository: `Rilan-Dev/Clara-AI-Platform`
- Branch: `feature/ai-core-from-doable-source`
- Scope: reduce benchmark-induced interruption risk and preserve timing evidence.

## Evidence

The reported failed OpenAI run placed the first fixture playback about 118 ms after the welcome `response.done`. Later channel events included output-buffer clearing and conversation-item truncation. This is consistent with the benchmark injecting new microphone audio before the welcome audio has drained. It is not sufficient to prove that overlap is the only cause of the missing completed-turn telemetry.

## Changes

- `scripts/voice-benchmark/conversation.mjs`: add a 2000 ms default welcome drain before input 1.
- Set the default inter-turn drain to 1800 ms (was 800 ms).
- Add `--welcome-drain-ms` and retain `--drain-ms` as explicit controls.
- Record `playbackStartedAt` and `playbackCompletedAt` separately for each fixture.
- Include configured drain values in failure reports.
- Update `scripts/voice-benchmark/README.md` with the rationale and limitations.

## Verification state

- GitHub writes completed: harness commit `cbc382da34da686399f48da04fb7e727075a9851`; README commit `48ec64f33546b9a9aeaf2033d7b75957a2d5f5f6`.
- Not run in this session: `npm run test:voice-benchmark`, Node syntax checks, validator tests, Chromium run, non-production OpenAI session.
- The quiet periods are a conservative mitigation, not proof of remote audio completion. A five-turn report must still have all required telemetry barriers and provider match.

## Next action

Run the local script checks, then one OpenAI test against the actual non-production public embed URL. If it times out, use `dataChannelEvents`, `playedInputs`, `microphoneDiagnostics`, and observed latency events to locate the first missing lifecycle transition. Keep transcripts, raw data-channel payloads, credentials, and raw tool arguments out of diagnostic artifacts.
