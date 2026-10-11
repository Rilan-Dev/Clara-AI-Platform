# Voice Latency Benchmark — Session 006

Date: 2026-10-11  
Repository: `Rilan-Dev/Clara-AI-Platform`  
Branch: `feature/ai-core-from-doable-source`

## Completed

- Committed five compact synthetic English speech files:
  - `scripts/voice-benchmark/questions/turn-01.mp3` — “What are support hours?”
  - `scripts/voice-benchmark/questions/turn-02.mp3` — “Normal ticket response time?”
  - `scripts/voice-benchmark/questions/turn-03.mp3` — “Urgent ticket response time?”
  - `scripts/voice-benchmark/questions/turn-04.mp3` — “Can I change my email?”
  - `scripts/voice-benchmark/questions/turn-05.mp3` — “Summarize all response targets.”
- Updated `five-turns.json` so each expected scenario prompt matches the speech fixture.
- Updated `conversation.mjs` to accept MP3 files and decode them through the existing browser AudioContext microphone-injection path. WAV and gzip-compressed WAV remain supported.
- Updated README examples to use the included repository-relative fixtures.

## Verification

- Fetched all five committed files from GitHub with base64 encoding. Each has an MP3/ID3 header and a distinct blob SHA.
- Did not run browser decode, STT recognition, validator tests, or a live provider session in this environment.
- These files are low-bitrate synthetic speech intended as compact starter fixtures; verify recognition on the first test run.

## User next steps

From repository root:

```bash
npm run test:voice-benchmark
```

Then run:

```bash
node scripts/voice-benchmark/conversation.mjs \
  --url="YOUR_NON_PRODUCTION_EMBED_URL" \
  --provider=openai \
  --input-1=scripts/voice-benchmark/questions/turn-01.mp3 \
  --input-2=scripts/voice-benchmark/questions/turn-02.mp3 \
  --input-3=scripts/voice-benchmark/questions/turn-03.mp3 \
  --input-4=scripts/voice-benchmark/questions/turn-04.mp3 \
  --input-5=scripts/voice-benchmark/questions/turn-05.mp3 \
  --out=tool-results/openai-conversation.json
```

Keep credentials out of the command history where possible and never share tokens/cookies. Use a non-production test tenant and synthetic KB data.
