# SESSION-011 — Sarvam benchmark session bootstrap failure

- Date: 2026-10-13
- Repository: `Rilan-Dev/Clara-AI-Platform`
- Branch: `feature/ai-core-from-doable-source`

## Evidence supplied by the user

- The Sarvam five-turn benchmark timed out waiting for input 1's completed assistant response after 90,000 ms.
- `POST /api/embed/session` returned HTTP 400 in approximately 16 ms.
- No `ragRequests`, completed turns, or observed latency events were recorded.
- `microphoneTrackState.readyState` was `live`, the track was enabled/unmuted, and the first MP3 fixture played for approximately 1.09 seconds.
- Failure diagnostics report `peerConnection: null` and `dataChannel: null`.

## Interpretation

This run failed at session bootstrap, before the voice transport was established. It is not a valid Sarvam latency measurement and does not establish that Sarvam STT, LLM, TTS, or RAG is slow.

The session endpoint has multiple possible 400 paths, including shared embed-request validation and AI/voice configuration resolution errors. The supplied report did not include the rejected response body, so choosing one of those causes would be speculation. The `_vercel/insights/script.js` and `_vercel/speed-insights/script.js` 404s are separate from the 400 session rejection on the evidence available.

## Code change

- Commit `534db5bc62cca250c461d1eb1810321d745e03c1` updates `scripts/voice-benchmark/conversation.mjs` to retain a short redacted `responseBodyPreview` for failed session bootstrap requests only. It does not record successful session payloads or change application session behavior.

## Verification

- The update was committed through the GitHub contents API after checking the expected source anchor.
- Node syntax checks, Playwright execution, local tests, production request reproduction, and a successful Sarvam turn have not been verified in this session.

## Next action

1. Pull `feature/ai-core-from-doable-source`.
2. Rerun the same Sarvam command once.
3. Inspect `requestTimings` for the `POST /api/embed/session` response's `responseBodyPreview`.
4. Fix the concrete validation/configuration error shown there.
5. Rerun the benchmark only after session bootstrap succeeds; confirm a peer connection/data channel and at least one RAG request before interpreting latency.

Do not increase the turn timeout or accept the current report as a provider benchmark result.
