# Voice Latency Benchmark — Session 005

Date: 2026-10-11  
Repository: `Rilan-Dev/Clara-AI-Platform`  
Branch: `feature/ai-core-from-doable-source`

## Work performed

- Re-read the current conversation harness, report validator and tests, scenario fixture, Node script-check workflow, implementation plan and worklog from the target branch.
- Updated `scripts/voice-benchmark/conversation.mjs` so Playwright response-finish errors pass through the existing diagnostic redactor before being written to a report. This reduces the risk that a URL or token-like string embedded in an error is persisted.
- Updated `.github/workflows/voice-benchmark-script-check.yml` so changes to `package.json` also trigger the script-check workflow.
- Appended this review and its limits to the dedicated worklog.

## Verification status

- GitHub accepted the commits. This environment has not executed `npm run test:voice-benchmark`, Node syntax checks, Playwright, or a live Clara session.
- The workflow run result was not available through the read-only workflow endpoint attempted during this session.
- No real latency results or provider pass claims are made.

## Risks and remaining work

1. Verify the Node syntax/test workflow on a checkout; a GitHub file write is not runtime verification.
2. Check whether the WAV injection path successfully drives the app's actual microphone/STT flow on a non-production deployment.
3. Confirm that each provider emits the same correlation and completion contract; currently the source-level review is strongest for OpenAI.
4. Add safe completion/finish-reason, non-empty-answer, truncation and usage metadata without logging transcript or prompt contents.
5. Add server-side duration and call-count spans for bootstrap, database, RAG/embedding/Qdrant, provider, and tool/MCP operations.
6. Run the five WAV questions sequentially for each provider and retain reports. Repeat warm-up plus measured sessions before drawing comparative conclusions.

## User action needed

- Check out the target branch and run `npm run test:voice-benchmark`.
- Prepare a dedicated test organisation/KB containing the synthetic facts in `scripts/voice-benchmark/scenarios/five-turns.json`.
- Prepare and listen to five WAV files matching the exact scenario prompts, and run the harness against a non-production embed URL.
- Share the resulting redacted JSON report and any console output if the first run fails. Never share embed keys, API keys, cookies, auth headers or customer transcripts.
