## 2026-10-30 — Fix latency diagnostic 403 reason label

- Owner executed `node --test scripts/rag-latency-path-check.test.mjs` after the auth-only preflight change: **6/7 tests passed**. The sole failing test was a console-format assertion: output correctly classified missing draft KB edit permission as `KB draft edit permission missing` but omitted the expected `reason:` prefix. This was not a change in authorization semantics or production retrieval.
- Updated `scripts/rag-latency-path-check.mjs` to output ` | reason: <allowlisted category>` consistently with the `--auth-only` display, preserving all status checks, fail-fast semantics, response redaction, credentials, and request count. No production application code was modified.
- Re-fetched current GitHub branch and changed the single output-format anchor. **Owner rerun of tests still pending**: `git pull --ff-only origin feature/ai-core-from-doable-source && node --test scripts/rag-latency-path-check.test.mjs`, then `node scripts/rag-latency-path-check.mjs --auth-only` to classify the real HTTP 403 without RAG quota consumption.

## 2026-10-30 — Diagnose RAG latency probe HTTP 403 without weakening authorization

- Operator ran `scripts/rag-latency-path-check.mjs` from an interactive shell with a hidden token. First public HTTPS request returned HTTP 403 after 5,271 ms and the script correctly stopped without sending the remaining seven retrieval requests. This is an **authorization or proxy denial**, not evidence of increased grounding latency. Exact source of 403 remains unverified because the first script did not classify returned error responses.
- Reviewed `src/modules/auth/core/tokens.ts`, `src/modules/auth/core/rbac.ts`, `src/app/api/rag/search/route.ts`, and `src/modules/auth/api/auth.ts`: session token can be sent as `Authorization: Bearer <token>`; `GET /api/auth/me` checks the session; draft RAG requires `kb:read` **and** `kb:update`, and non-superadmin POST requests may be blocked by email verification/onboarding entitlements. Unrecognized 403 could also originate from the reverse proxy/WAF.
- Extended the *diagnostic only* `scripts/rag-latency-path-check.mjs` with `--auth-only`, which makes one `GET /api/auth/me` request to each public and loopback origin, prints only HTTP code, client latency, safe reason category, and session-valid indication. It requires no KB/question and consumes no RAG quota. Normal latency comparison remains unchanged and stops on 401/403. Normalizes Bearer casing and detects malformed cookie-as-token input.
- Added safe allowlisted reason classification for `kb:read`, `kb:update`, onboarding, subscription, email verification, suspended accounts, invalid sessions and non-JSON denials. Never echo response bodies, credentials, session/user IDs or tenant metadata.
- Added three regression tests for auth-only success, mixed public/local authorization failure with privacy checks, and a draft `kb:update` 403 with fail-fast/no-local-query semantics. Existing four diagnostic tests preserved.
- No changes to `requireAuth`, `requireKbPermission`, subscription enforcement, API routes, Docker, index state, or token handling. Changes committed and re-read for static inspection via GitHub; execution of the new Node tests still requires the owner's checkout. Do not assume the user's token is expired or that Cloudflare blocked the request without the new preflight results.
- Next: operator runs `git pull --ff-only origin feature/ai-core-from-doable-source && node --test scripts/rag-latency-path-check.test.mjs`, then `node scripts/rag-latency-path-check.mjs --auth-only` using a fresh, unexposed session token at the hidden prompt. If /api/auth/me succeeds at both origins but draft RAG is 403, inspect the now-redacted classification and the signed-in account's KB draft permissions/POST onboarding gate. Only continue performance measurements after authorization passes.

## 2026-10-30 — Secure RAG public-vs-local latency diagnostic

- Operator attempted the ad-hoc root-level `rag-latency-path-check.cjs` but received `CLARA_DEBUG_TOKEN is missing` because the access token was set only in a previous interactive shell. This is an operator-session/diagnostic UX issue, not a RAG runtime regression; the earlier live probe and five-request warm benchmark were successful.
- Added tracked `scripts/rag-latency-path-check.mjs` with a secure TTY prompt if `CLARA_DEBUG_TOKEN` is absent (works with bash and fish). It enters raw no-echo mode **before** showing the prompt to avoid exposing fast-pasted tokens, and restores the terminal on return/cancel. Tokens are never command-line arguments or written to files.
- Compares the same KB query against the public HTTPS origin and loopback backend using the same authentication; collects **client HTTP round-trip** versus **grounding-only backend** times and stage hints; prints HTTP status, source counts and grounded status but never body, document snippets, token, IDs or raw query. Alternates request order, separates warmups, reports p50/p95. Restricts non-HTTPS URLs to loopback and stops on 401/403. Calls consume quota/audit events.
- Added four Node tests for authenticated paired paths, privacy, absent-token non-TTY handling, unsafe URL/token arguments, and fail-fast on auth denial.
- Verification: local isolated equivalent implementation passed four Node mock-HTTP tests; a manual Linux PTY check confirmed hidden token input cannot be echoed after prompt activation. The two tracked scripts were re-fetched from GitHub for structural checks. **The new committed test file has not been run on the operator checkout**, so do not claim its tests are green yet. Runtime API code, Docker, KB indexes and production providers were not changed.
- Operator commands: `git pull --ff-only origin feature/ai-core-from-doable-source && node --test scripts/rag-latency-path-check.test.mjs`; then run `node scripts/rag-latency-path-check.mjs --kb-id ab69cf61-970b-4844-8986-8f772daabae7 --question "List all requirements of control DO.4.2" --scope draft --warmup 1 --repeat 3`. Enter a rotated, active token at the hidden prompt. Keep the old untracked root script separate from the committed script.

## 2026-10-30 — RAG multilingual model guard after per-question timeout diagnosis

- Operator provided an anonymized per-question breakdown from the completed same-image controlled A/B. Q01 EN / Q05 AR exact references skipped (3/3 each). Q02 EN applied 2/3, timed out 1/3 (model median 5350 ms, top1 unchanged); Q03 EN applied 3/3 (median 3110 ms, top1 changed); Q04 EN applied 3/3 (median 2793 ms, top1 changed). Q06/Q07/Q08 AR each timed out 3/3 (model median 6001/6002/6002 ms, top1 unchanged), explaining 9/10 total TEI timeouts. Q05/Q06/Q07 Arabic translation median ~2500 ms, Q08 ~420 ms, with possible overlap of retrieval stages.
- Implemented a conservative **operator-opt-in** `RAG_RERANK_LANGUAGE_POLICY=latin-only` model-script restriction in `src/modules/rag/rerank.ts`: when set, the cross-encoder is skipped before any HTTP call if the *original query* OR any of the candidate source excerpts contains non-Latin letters. Exact references, embedding, translation, tenant/KB scoping and fail-open fallback remain unchanged. Report remains `rerankStatus=skipped` and ~0 rerank ms. This is script recognition rather than true language detection (romanized non-English text may still pass). Default `all` preserves existing multilingual-model behavior, and an unknown nonempty policy fails closed by skipping.
- Added 4 focused unit regressions in `rerank.test.ts`: Arabic/mixed-script/CJK query skips; English query + Arabic source skips; accented Latin eligible; explicit `all` multilingual override; unknown policy fails closed. Updated the controlled benchmark runner to use `RAG_AB_LANGUAGE_POLICY=latin-only` by default for the tested English-only CPU model, with opt-in `all` override for a verified multilingual model. Documented the restriction and scope in the RAG A/B runbook.
- Commits: `39028773e76f2f707b601c6c2f392c2503720b51` (regressions), `fd99490be4fa6ce0b34a0d8c6309c0ad4fc09df1` (script gate), `31e62333d714a17f357bc3b22f21cc9c2e289832` (operator runner), `6aa405a6fb31a08bcc5cd4997b9c7047d56d60ac` (runbook).
- Verification: re-fetched committed source/test/script and statically checked guard placement, Unicode property regex, env propagation and query/evidence tests. **New code has not been run through Vitest, type-check, Docker or a live KB in this connector-only environment.** Owner's previous 39/39, 9/9, TypeScript PASS were before this change. Next checkout verification: `npx vitest run src/modules/rag/rerank.test.ts src/modules/rag/grounding.test.ts && node --test scripts/benchmark-rag-ab.test.mjs && npm run type-check`.
- Keep production reranking disabled: the CPU model had 10/18 attempted inference timeouts, >8-second retrieval p95, no proved relevance improvement on changed Q03/Q04, and no applied Arabic rerank. For new staging A/B output use a new `RAG_AB_PREFIX` (old result paths intentionally refuse overwrite); budget each default A/B at 64 quota-consuming retrieval requests and do not post private result JSON. The Latin-only gate should remove Arabic TEI timeouts but does **not** remove unrelated cross-lingual translation cost or the English Q02 timeout.

---

## 2026-10-30 — Controlled reranker A/B v2: 10 of 18 attempted model calls timed out

- Operator ran `scripts/run-rag-ab-controlled.sh` successfully on the actual host, with both disposable backend arms healthy at the SAME localhost origin `http://127.0.0.1:4001`, the SAME backend Docker image, reranker `mixedbread-ai/mxbai-rerank-base-v1` on CPU, `RAG_RERANK_TIMEOUT_MS=6000`, `RAG_RERANK_MAX_CANDIDATES=8`, 8 fixed draft KB questions (4 English / 4 Arabic), `--top-k 6 --repeat 3 --warmup 1 --gap-ms 250`. The candidate model smoke probe PASSED. Both arms completed 24/24 measured requests with grounded results for 8/8 questions and an A/B report was written privately; no production redeploy.
- Arm A (disabled): server latency p50/p95 **184/512 ms**, client RTT **218/542 ms**, retrieval **32/479 ms**, rerank **0/0 ms**, outcomes **applied=0 skipped=24 timeout=0 fallback=0 unavailable=0**.
- Arm B (enabled): server latency p50/p95 **4121/8504 ms** (+3937/+7992 ms), client RTT **4158/8544 ms** (+3940/+8002 ms), retrieval **4068/8503 ms** (+4036/+8024 ms), rerank **4054/6003 ms** (including zero-duration skips), outcomes **applied=8 skipped=6 timeout=10 fallback=0 unavailable=0**. Thus **10/18 attempted TEI calls timed out** (55.6%) while baseline ranked evidence was preserved on timeout; 6/24 skipped requests agree with the two exact-clause control queries repeated 3x.
- Relevance proxy: top-1 source changed for only **2/8** questions; assembled context changed for **3/8**; mean overlap@k **0.9375**, mean top3 overlap **0.875**, rank tau **0.85**; both arms grounded all questions. Mean common-source Qdrant score drift **0.000007**, so materially stable comparisons. Top-1 improvements remain unverified because raw source excerpts were not reviewed.
- The result **fails the production enablement gate** on latency and timeout/fallback efficacy. Do NOT permanently enable TEI on the current CPU/English-only model, especially for Arabic/cross-lingual KBs. The exact query-specific distribution of `applied` and `timeout` can be inspected safely from the private `rag-ab-v2-on.json` using `perQuestion[].rerankOutcomes`; do not share full query text, source metadata, tokens, or raw benchmark JSON. Investigate the English Q03/Q04 changed-source correctness before claiming an accuracy benefit.
- Next work: per-question anonymized outcome/latency breakdown; select a model that is explicitly multilingual and supported on the target TEI hardware/runtime or move reranking to GPU; controlled relevance adjudication plus rerun on a broader multilingual real-query set. Consider smaller candidate count/text bounds only as a measured, non-production opt-in experiment; smaller context may reduce accuracy. Avoid raising the 6s timeout for the current model because that will further degrade latency.

---

## 2026-10-30 — Controlled RAG benchmark startup reset and operator runner

- Operator attempted the documented disposable-backend same-origin A/B via a pasted inline Bash heredoc. The optional TEI started, but Arm A's initial `curl -fsS --retry 30 --retry-delay 2 --retry-connrefused http://127.0.0.1:4001/api/health` failed with `curl: (56) Recv failure: Connection reset by peer`. `set -e` aborted before either A/B arm ran. The error alone does **not** prove an application crash; an early Next.js startup connection reset is plausible, and `curl --retry-connrefused` does not reliably retry all reset conditions. The pasted multiline command was also visibly garbled around its end.
- Added **`scripts/run-rag-ab-controlled.sh`** (commit `b4edae6538df2cb56cbd8a20b6e2dfc0d974f02d`) to avoid repeated fragile heredocs. Requires `RAG_AB_KB_ID` and a securely exported auth environment variable; refuses existing benchmark output files or an existing named test backend. Runs two sequential disposable backends at the **same loopback API origin and identical Docker image**, first with rerank off, then on; skips migrations, ingestion poller and local init on both instances; probes TEI before candidate requests; preserves the 8-query, 3-repeat, 1-warmup, 250-ms-gap shape and privacy-conscious output.
- Replaced single curl startup gate with explicit bounded polling, including connection reset/refused cases; when health cannot recover, script reports container state and last 70 startup log lines instead of silently failing. EXIT trap cleans the owned backend and stops TEI only if it was not running before the benchmark. Script does not change production Compose env or recreate the production backend.
- Verified a matching shell script locally with `bash -n` and its `--help` entry point; fetched GitHub committed script and statically checked its readiness loop, common-image guard, cleanup, diagnostic logging and escaped-variable integrity. **No Docker or remote server startup test executed in this assistant environment**. Next operator steps: `git pull --ff-only origin feature/ai-core-from-doable-source`, `docker compose build clara-backend` (does not restart production), then `RAG_AB_KB_ID=<KB> bash scripts/run-rag-ab-controlled.sh` from backend root with a fresh exported token. If health still fails, inspect script-printed startup logs before attempting further RAG requests. Token cleanup must run in the **parent shell** after the script exits; unsetting inside a Bash child does not unset the parent's exported variable.

---

## 2026-10-30 — Repair failing Sarvam retrieval-only regression fixture

- Owner ran `npx vitest run src/modules/ai-governance/core/resolver.test.ts src/modules/rag/grounding.test.ts`: **42/43 tests passed**, with the sole failure in the newly added Sarvam retrieval-health test at `resolver.test.ts:288`. `npm run type-check` had no reported errors.
- Exact cause: the provider-health check correctly stopped the ordinary chat call, but retrieval-only correctly continued to `resolvePlanAIEntitlements`, where the test's initial mock returned `null`. The resulting `Cannot read properties of null (reading 'capabilities')` was a defective test fixture, not a demonstrated production regression.
- Supplied an explicit entitled Pro plan fixture for the healthy retrieval-only scenario. The existing assertions still prove ordinary chat is blocked when the provider is unhealthy, retrieval-only resolution succeeds with valid entitlements, disabled providers stay blocked, and plan restrictions stay enforced.
- Also mocked `@/modules/ai-governance/core/live-catalog` at its real import path. The old test mocked a non-imported export on `registry-db`, allowing test-time vendor catalogue syncing and expected `DATABASE_URL is required` warnings despite no actual database dependency for the isolated resolver contract.
- Only `src/modules/ai-governance/core/resolver.test.ts` changed, plus this worklog entry. Runtime implementation, database, tokens, embedding model, KB vectors, chat/voice behavior and deployment were left untouched. GitHub static inspection confirms the mock and fixture; remote unit execution remains **unverified**.
- Next operator verification: `git pull --ff-only origin feature/ai-core-from-doable-source && npx vitest run src/modules/ai-governance/core/resolver.test.ts src/modules/rag/grounding.test.ts && npm run type-check`. Once green, rebuild only `clara-backend`, then run one authenticated DO.4.2 RAG probe before rerunning the latency benchmark.

## 2026-10-30 — RAG 500 when unrelated Sarvam chat provider is unhealthy

- Operator ran six authenticated retrieval-only benchmark requests against one draft knowledge base; all returned HTTP 500. The backend exception was `AIConfigResolutionError: Provider Sarvam AI is currently unhealthy.` PostgreSQL and Qdrant containers were healthy; earlier exact-clause retrieval had passed. This is a config resolution failure, not evidence of corrupt vectors or missing indexes.
- Root cause: `resolveAIConfig({surface:"rag-embedding"})` still applied the chat-generation provider health gate, even though the RAG path queries a separately pinned embedding model (previously confirmed OpenAI ada-002 in the same collection). As a result an unhealthy Sarvam generation provider blocked unrelated KB search.
- Fixed the runtime gate with an explicit, scoped `ignoreHealthForRetrieval` parameter that affects ONLY the provider-health check. Calling `resolveAIConfig` on `rag-embedding` sets this parameter in both the platform-provider fallback and final chat-provider gate; ordinary chat/realtime selection, platform enabled/configured/capability checks, plan capability/provider/model entitlements, tenant RBAC and Qdrant KB filters are unchanged. No forced provider switch or re-embedding.
- Added regression tests proving: unhealthy Sarvam remains blocked for chat while retrieval-only resolution passes; disabled Sarvam remains blocked; plan-provider and plan-capability restrictions still apply in the retrieval-only case.
- Verification boundary: code and tests committed through GitHub integration and statically inspected. No checkout or backend runtime available here; do NOT claim the new tests pass or production has recovered. Operator to run `npx vitest run src/modules/ai-governance/core/resolver.test.ts src/modules/rag/grounding.test.ts && npm run type-check` and rebuild only `clara-backend` after success, then smoke-probe one authenticated DO.4.2 query before rerunning A/B.
- Independent issues seen in server logs: OpenAI embedding call took 8.4s on a cold query, Qwen DNS failed because optional qwen container is not running, and Resend credentials were rejected; none explain the repeated Sarvam configuration exception. Refrain from changing unrelated services in this fix.

## 2026-10-30 — Owner verification: rerank telemetry test suites green

- Owner pulled the feature branch and executed the focused RAG Vitest suites on their real checkout: `rerank.test.ts` 12/12 and `grounding.test.ts` 27/27, total **39/39 passing** (2 test files). Executed `node --test scripts/benchmark-rag-ab.test.mjs`: **9/9 passing**, zero failures. Ran `npm run type-check && echo "TYPECHECK PASS"`: TypeScript check **PASS**. All results are from the owner-supplied terminal output, not reproduced by this GitHub-only session.
- These results verify the instrumentation/benchmark work ending at `9adc27622a8d94baa05ad3d1bab6c6e41b28ae45`; no outstanding code-level failures are evidenced by these focused checks.
- Remains a **runtime validation**, not a unit-test problem: rebuild the backend image without touching the currently running production container; repeat both A/B arms as separate loopback-only disposable backends with identical image, local origin, query set and stage settings. Observe `rerankOutcomes` applied/skipped/timeout/fallback and `rerankMs` per-question/aggregate. Only after comparing the actual Q03/Q04 retrieved excerpts and Arabic performance can the production enablement decision be revisited. The previous mixed-origin A/B measured substantial p95 regression and did not establish a relevance gain.
- Safety constraints: keep production `RAG_RERANK_URL` unchanged and off, do not share credentials or raw private benchmark files, check VPS memory before building/starting a second app + TEI, and remember the test containers still share production DB/Qdrant and consume quota. No deployment or production changes performed in this update.

---

## 2026-10-30 — RAG reranker A/B results and content-free inference telemetry

- Operator supplied actual **same-query, two-arm** A/B evidence on one draft KB: baseline reranker OFF (24/24 measured successful, 8/8 questions grounded), candidate reranker ON in a disposable local backend (24/24 successful, 8/8 grounded, TEI smoke PASS). Both temporary candidate and TEI service were stopped after measuring; the production backend's reranker remained disabled.
- Baseline measured server response p50/p95 172/589 ms and retrieval p50/p95 27/580 ms. Candidate measured server response 3781/8212 ms and retrieval 3779/8208 ms, i.e., +3609/+7623 ms total and +3752/+7628 ms retrieval. API origins differed (production HTTPS proxy vs localhost staging); comparisons are indicative, not a definitive controlled latency attribution.
- Top-1 source changed only for **Q03 and Q04 English**, context changed for Q03/Q04 English plus Q06 Arabic; 8/8 grounding retained; two out of eight top-1 changes are NOT proof of relevance improvement. Arabic Q05/Q06/Q07/Q08 median deltas +2142/+6019/+6073/+6210 ms and **no Arabic top-1 changes**. Exact-reference Q01 and Q05 are skipped by design, so their latency differences cannot be attributed to an applied TEI model call.
- Root diagnostic gap: the original benchmark only had broad `retrievalMs` and could not distinguish a 6-second TEI timeout from successful inference or Arabic translation overhead. The configured `RAG_RERANK_TIMEOUT_MS=6000` limits the model HTTP request, not the whole RAG stage.
- Added opt-in, content-free per-call `RerankObservation` (`applied`, `skipped`, `timeout`, `fallback`, wall-clock ms, candidate count) to `src/modules/rag/rerank.ts`; observer failures are nonblocking. Exposed `timings.rerankStatus` and `timings.rerankMs` in grounding; Server-Timing only serializes numeric durations, not the string status. Existing vector/Qdrant scores, rerank ordering, exact-reference bypass and voice bypass unchanged.
- Extended A/B CLI to report TEI ms p50/p95 and applied/skipped/timeout/fallback/unavailable counts per question and run; old backend images are reported as `unavailable` rather than misdiagnosed. Extended regression tests (success, skip, HTTP fallback, timeout, safe observer exceptions, grounding timing and benchmark counts). Updated operator enablement guidance with interpretation and required same-image re-run.
- Commits: `6cf43564`, `61d05de1` (regression expectations), `ae2afb6c`, `c6f8b3de` (inference status + grounding timing), `ab2baa7b`, `af1e7815` (benchmark), `18ae0b33` (runbook).
- **Verification limits:** changes pushed via GitHub connector and files re-read for static checks. No local checkout available in this environment (GitHub DNS inaccessible from container); new Vitest, Node benchmark tests and TypeScript checks are **not yet executed**. Operator must pull and run `npx vitest run src/modules/rag/rerank.test.ts src/modules/rag/grounding.test.ts && node --test scripts/benchmark-rag-ab.test.mjs && npm run type-check` and check exit codes before rebuilding a same-image isolated test. Existing historical 49/49, 9/9 and TYPECHECK PASS were for pre-telemetry code.
- Follow-up: rebuild the test backend image and re-run both arms on disposable loopback-only containers with identical origin and KB snapshot, preferably with mix-language semantic queries in addition to exact-clause controls; inspect `rerankOutcomes`, `rerankMs`, translation and embedding timings, evidence relevance and p50/p95 under load before considering enablement. No production env change, no model change, no raw queries/results or credentials committed.

---

## 2026-10-29 — RAG A/B harness verification received; comparison validity hardening

- Owner pulled `feature/ai-core-from-doable-source` at `7ef2df95` and supplied **real execution** of `node --test scripts/benchmark-rag-ab.test.mjs` (9/9 passed, 0 failed, 2573ms) plus `npm run type-check && echo "TYPECHECK PASS"` (confirmed PASS). Prior owner-run focused RAG Vitest suites also passed 49/49.
- Continued only the **benchmark enablement gate**; no production reranker toggle, no model/KB data mutation, no Docker deployment, no live A/B queries, and no changes to chat/voice retrieval runtime.
- Fixed comparison configuration check: `--compare` now warns on mismatched `repeat`, `warmup`, `gapMs` and `baseUrlOrigin`, in addition to the existing KB/mode/scope/topK/channel checks, so incomparable latency samples cannot quietly pass as a controlled A/B.
- Fixed incomplete score-drift interpretation: comparison now records `qdrantScoreComparison.comparableQuestions/unverifiedQuestions`. When no common source scores exist, output explicitly says it **cannot verify index stability**, rather than falsely printing `(index stable)`. Partial overlap is reported as limited evidence.
- Extended `scripts/benchmark-rag-ab.test.mjs` with regression assertions for parameter-mismatch warnings and no-common-score behavior. Updated deployment runbook's validity interpretation.
- Commits: `43746c09fa45f825a505690aab6f90807bbbc792` (regressions), `0b0c72af680fbd62437ed09f48fb88d3219bf02b` (comparator), `9083b4354d7d21d371dd89a3251180bc3ae98088` (runbook).
- Verification for **new** changes: re-fetched exact committed source and confirmed code/test anchors. No Node execution or TypeScript run was available in this connector-only continuation; 9/9 owner PASS applies to the **previous** benchmark version, not these new assertions. Next local operator check: `node --test scripts/benchmark-rag-ab.test.mjs && npm run type-check`.
- Next unfinished dependency: privately run A and B against the same real KB, scope and mixed-language query set with identical settings; compare ordering/citation evidence and p50/p95; keep the optional reranker disabled for normal production users until evidence justifies enablement. Exact-reference-only questions bypass model reranking by design, so include normal semantic questions. Do not commit raw benchmark reports with user queries/source IDs.

---

## 2026-10-29 — RAG reranking benchmark follow-up: privacy and multilingual readiness

- Owner-provided checkout verification: focused RAG Vitest suites 5/5 files, 49/49 tests passed. The owner's supplied `npm run type-check` output shows invocation but not final exit status; do not misreport the process as confirmed green from that transcript alone.
- Continued from current reranker/benchmark branch: `b44f4493e3bc` had added the A/B benchmarking harness; the previous live-service worklog recorded a working ONNX CPU TEI deployment and leaving `RAG_RERANK_URL` unset.
- Corrected a consequential language-scope claim: the currently selected `mixedbread-ai/mxbai-rerank-base-v1` default's official Hugging Face model metadata is `language: [en]`. A successful English smoke probe does not establish Arabic/multilingual reranking quality; the operator runbook now requires per-language/cross-lingual A/B and a verified multilingual model before enabling for those KBs.
- Corrected A/B runbook sequence: probe previously ran before backend received `RAG_RERANK_URL` (guaranteed failure). It now starts TEI, configures the backend .env, force-recreates backend, probes from backend, then runs the candidate arm.
- Privacy correction: run/compare JSON files omit snippets/context but preserve raw questions, document titles and source/KB IDs. Removed misleading `shareable` claims, added an explicit runtime privacy warning and regression expectation. Keep reports private/redact before external sharing.
- Implementation commits: `2f1b55737c807025e3d9e27430bc784cade9183e` (test), `72c3a1dc7090ce1cc325af5b1c1940e1fda4e8bd` (CLI warning), `34af0ecd6690d4457d0068da15efafaf17ae6b25` (Compose model note), `b4a2b07316443d4eab07576a60e19cac59f05f31` (runbook).
- Verification here was scoped to reading current GitHub source and static source checks. No new Node benchmark tests, production A/B, typecheck, Docker rebuild, or live model reranking was executed in this continuation. Next checkout command: `node --test scripts/benchmark-rag-ab.test.mjs` and `npm run type-check`; then run private A/B per language and review source relevance and latency before enablement. Existing production reranking setting was not changed.

---

## 2026-10-29 — RAG reranking safety continuation

- Resumed from reranking handoff commit `0effd65cede19a30e1a465b99ac061afdcebe4bc`; scoped changes only to the opt-in second-stage reranker and its regression coverage. No production deployment or live KB was modified.
- Added three source regression cases for refusing redirected HTTP responses, gracefully handling a throwing snippet extractor, and bounding long query/snippet text before sending it to the private TEI service.
- Hardened `src/modules/rag/rerank.ts`: reranker calls now set `redirect: "error"` so retrieved KB content is not forwarded to a redirected destination; malformed snippets or extraction errors preserve original Qdrant ordering rather than crashing grounding.
- Commits: `6a32b7306a7032ef18d0102f88e17d0046ba48d6` (regressions), `bf20985bb28ac4e1e9151104b772571f20750e6d` (correction).
- Re-fetched the committed source and ran 10/10 source-level JavaScript smoke assertions using mocked fetch and a URL parser shim: model ordering, original score preservation, unscored tail, redirect refusal, candidate cap, extractor exception and null fallback, no outbound call on invalid input, disabled mode, and invalid protocol. These are limited smoke assertions from type-erased source, NOT an npm/Vitest run, full TypeScript type-check, Docker/TEI handshake, or production benchmark.
- **Remaining checkout verification:** `npx vitest run src/modules/rag/rerank.test.ts src/modules/rag/diversify.test.ts src/modules/rag/grounding.test.ts src/modules/rag/reference-evidence.test.ts src/modules/rag/reference-recovery.test.ts` and `npm run type-check`. No CI/Vercel gating or polling needed.
- **Remaining deployment/quality gate:** confirm free memory before starting the optional `rerank` profile, configure private `RAG_RERANK_URL`, run `docker compose exec clara-backend node scripts/probe-rag-reranker.mjs`, then compare before/after ranked evidence, citation correctness, p50/p95 retrieval latency and fallback rate. Keep the service opt-in until live validation. Sparse BM25/SPLADE + dense/sparse fusion is separate unimplemented work, not part of this reranker correction.

---

## 2026-10-29 — RAG model-based reranking and verification

- Added an optional self-hosted Hugging Face TEI-compatible cross-encoder reranker in `src/modules/rag/rerank.ts`. Its request uses only already KB-filtered candidate snippets; it preserves Qdrant cosine scores, validates complete unique model ranks, caps model inputs to 12 candidates by default, and retains unscored tail hits. Disabled/unavailable/malformed endpoints fall back to original retrieval.
- Wired the new stage into the authenticated KB grounding path and embeddable search, retaining source-order exact-reference recovery and the realtime voice fast path. Existing `diversifyByDocument` remains responsible for cross-document coverage, using ordering rather than mixing model and cosine score scales.
- Added regression sources: `src/modules/rag/rerank.test.ts`, `src/modules/rag/diversify.test.ts`, and a grounding integration test. Added opt-in `clara-reranker` Docker Compose profile, an operator-only .env example, and `scripts/probe-rag-reranker.mjs` to verify a real TEI service.
- Source-level executable JS smoke checks (TypeScript annotations erased from fetched GitHub sources) returned 12/12 assertions passing for model order, Qdrant score preservation, candidate cap, tail availability, malformed/error/disabled fallbacks, fairness, and Compose/probe presence; additional exact-identifier filtering checks passed. This is NOT a real Vitest execution or live Qdrant/TEI test. No production stack, model service, npm typecheck, or Docker runtime was accessed. Do not claim deployment/production verification.
- Implementation commits: `8c5b7ba9768d6121edac3f13e3e0897e312f0ca1`, `d84f2de5246ede7d6480221bea4c28f252362659`, `fbb7de00fc3496aead11b2eb35b10ef215115839`, `1ffce48af46d3051b2f0ea3611ac693b65730207`.
- Next: run `npx vitest run src/modules/rag/rerank.test.ts src/modules/rag/diversify.test.ts src/modules/rag/grounding.test.ts src/modules/rag/reference-evidence.test.ts src/modules/rag/reference-recovery.test.ts` and `npm run type-check` on the checkout. Start the optional `rerank` profile only after checking memory availability, configure the private RAG_RERANK_URL, recreate backend and execute the smoke probe, then evaluate benchmarked ranking/citation relevance and latency. Actual BM25/SPLADE sparse indexing + dense/sparse fusion remains independent pending work; do not label GraphRAG hybrid mode as completed dense/sparse fusion.

---

## 2026-10-09 — Shared integration capability policy

- Extracted the duplicated platform/org/agent/plan/connection checks into `src/modules/ai-platform-core/integrations/integration-policy.ts`.
- The I-4 bridge and `integration-action-tool.ts` now reuse the same fail-closed policy; database authorization failures are normalized without leaking driver details.
- AI availability lists only resolvable actions and reports expired/error/revoked state. Tool failures preserve runner error code/retryability metadata.
- Added focused regression source for identity requirements, authorization DB failure sanitization, expired status, unavailable action packages and error taxonomy.
- Representative commits: `55306cc3f1fe62b0295c51089462018fb98eba7b`, `80642166654c16b6c533917783f80c50832d73ee`, `af97578a8557b92064210748760def6be7b49425`, `1df63308197e42351ba2ddb4efc90d20ed8bff71`, `0f51346861e4f2e61b2a8bd863dc70ce17ec37d6`, `5b2c476669b6cb9845cf20e20bdcc012b09293c9`.
- Tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider flow were not run or awaited.
- Next: continue typed action safety and idempotency/approval hooks through the existing Unified Tool Runtime.

---

## 2026-10-09 — Unified integration readiness consistency

- Added explicit identity preconditions to integration availability, integration action execution, and the I-4 bridge capability-discovery boundary.
- Removed the fake placeholder agent UUID fallback from AI availability.
- Exposed safe connection readiness states and targeted recovery guidance to AI agents without credentials or provider response data.
- Added regression source for missing identity and expired connection guidance.
- Commits: `fa5b81f6e60c453986d165b2425bbe0d299ef943`, `38dbb5b4707b4acb41f5b61d527fe2dae1f2e9c6`, `c50313256116ac7f59b34d83d2950e68df37695d`, `55932b645d4e7bb54de4a59e54447f561972de88`, `1e5f3033fa13465e5fbbd5587468cabbe3acecea`, `732eae44fec8a7aa4401fb810bd91f0fcf3d49cf`, `8fd1ab08ed89bcccc9d8f30a1bdb7e8b8e0a930a`, `e74e0de0b68f19f45b12a46629e2a035b5f3761f`, `481988f4b3febf1eefbe4aea6c86a80700d0e3fb`.
- Tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent were not run or awaited.
- Next: continue OAuth callback/token-refresh/disconnect source review and safe runtime error taxonomy.

---

## 2026-10-09 — Connection health and scoped recovery

- Scoped organisation health summaries to the authenticated user's connections plus shared organisation credentials.
- Added explicit disconnect UI with confirmation and narrowed the delete query to the exact agent scope, preventing a missing agent ID from deleting all agent-scoped connections.
- Added regression source for exact disconnect scope.
- Commits: `6472dae88f4b1a835839f22c1d2bf9aa5a27da4f`, `bf8f6c0706ca0df432e5ddf3c75a15152585846e`, `d9442aa0b0311a9623b8f21916b053174260e843`, `5e1cd4a9399d3ccf05c0726dc70bf36ff1bb02b1`, `e4f94669d9a1cf8a832cb15dc33b38430a442374`.
- Tests/build/Docker/CI/Vercel/Gates/deployment/live OAuth provider flow were not run or awaited.
- Next: inspect integration capability/readiness discovery and invocation through the existing Unified Tool Runtime.

---

## 2026-10-09 — Server-side integration credential validation

- Added `validateConnectionCredentials` and wired it into organisation integration connection creation.
- OAuth client ID/secret without an access token can no longer create an active OAuth connection. Basic auth requires username/password, secret-text/custom-auth require valid credential values, and `none` cannot be connected with credentials.
- Added regression source for accepted/rejected credential shapes and expired connection health.
- Commits: `1449d36377a14c96a34625618b39405eb9d26749`, `ff01cda2c64b0f1391321440c22ee99e0afdf351`, `675cd39bc4e831f5fdba7b4859daa4f3c921341f`.
- No tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live OAuth provider flow was run or awaited.
- Next: continue P0 connection recovery and P1 common integration capability/readiness contracts, reusing the Unified Tool Runtime.

---

## 2026-10-09 — OAuth refresh compatibility and connection health

- Persisted `authorization_method` with OAuth credentials and aligned `ensureTokenFresh` to the registry's HEADER/BODY token-auth mode; added a regression for Basic auth refresh.
- Hardened OAuth start endpoint and redirect URI validation, honored provider PKCE method, and pruned stale state rows.
- Added safe aggregate connection health fields to the organisation integrations API and surfaced expired/error/revoked status plus reconnect affordance in the admin UI.
- Added regression source for callback HEADER auth and expired connection health.
- Commits: `78e28640520922db010023a0d0804fff3c9142f7`, `fbd95c6d43b6b9bee15787785f75409111540c44`, `67abff6bb38aca66df886971a6a8f0357727e803`, `0afb5258e9d721857095078ccb2598b2a43d6d88`, `87756d3cc235ab4a356c057319e7159c8733c104`, `fcfc27207bebf75dbc1300b57a227db592fd4c47`, `a4f46d8af88a55e869f292db5ffa9cf63ed496d5`, `d84a8c1523ebcd6b7b5af04f468a01f51159648a`, `2b82214135ff5fe164eaf2fb9feafedc424f6358`.
- No tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live provider consent were run or awaited.
- Next: inspect and harden OAuth callback and organisation connection failure paths, then continue the roadmap's integration health/recovery and common capability framework.

---

## 2026-10-09 — P0 OAuth consent lifecycle source implementation

Continued the authorized Integrations & AI Enhancement Roadmap after completing I-6 source hardening.

- Added migration `066_integration_oauth_states.sql` with one-time hashed state, expiry, tenant/user/agent provenance, exact redirect binding, encrypted PKCE verifier, RLS and browser-role revocation.
- Added cryptographic state/PKCE helpers and regression source.
- Added organisation-scoped OAuth start route with platform/org/plan checks, configured redirect URI, S256 or explicitly configured plain PKCE, and stale-state pruning.
- Added OAuth callback with atomic state consumption, provider error/cancel handling, callback origin/path binding, secure token exchange (HTTPS, no redirects, timeout), HEADER/BODY client authentication, current grant/plan rechecks, and encrypted connection persistence.
- Updated organisation integrations UI to start OAuth consent and show safe callback status.
- Added focused start/callback regression source; tests were authored but not run.
- Representative commits: `bd7380f09ad4e56e30ab3c2a69ec416c9ef35652`, `28ecb76e96779ac0730b7c2ee1a8798b32b79777`, `23b99abe58cd82e9f6c9724787a066bb2304de99`, `da181a12e5e9d92798bd2d068a2f676eba62f2b4`, `df5217af0678b76eaa7983c66656ad8ad0b0a980`, `a6c471a86b7afd2f131c4f0602a397af1afc2516`, `fd0665cbfea5725794a285349bf647b82272ce86`, `c442aa3afe5757ca1bc7128d827cdee4f6d73764`.
- Tests/typecheck/build/Docker/CI/Vercel/Gates/deployment/live OAuth provider flow were not run or awaited.
- Next: source-review stored OAuth credential shape against `OAuth2TokenData` and `ensureTokenFresh`; correct mismatches and add regression source without waiting for external gates.

---

## 2026-10-09 — I-6 final async policy-snapshot hardening

Owner explicitly requested completing I-6 bounded hardening without waiting for CI/Vercel/Gates. Source review found that MCP policy was snapshotted only after awaiting the untrusted resolver. The resolver could mutate the caller-owned policy while discovery was in flight, including changing `requireUserId`.

- Updated `src/modules/ai-platform-core/mcp-tool-bridge.ts` to snapshot validated policy before resolver awaits and once at runtime-build entry.
- Added a regression to `src/modules/ai-platform-core/mcp-tool-bridge.test.ts` proving a mutation to `requireUserId` during discovery does not relax the registered authorization requirement.
- Commits: `826169686c91c5095ac5d717eb27a048c020a57a`, `6f824ce9f75e38645c6b33e06b37559977650d0a`.
- I-6 source implementation is complete. Tests/build/CI/Vercel/Gates/deployment were not run or awaited.
- Next implementation: continue the authorized Integrations & AI roadmap with the P0 OAuth connection lifecycle. The runner webpack import correction `b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd` is committed but the owner-provided local Docker build predates it.

---

## 2026-10-09 — Next.js webpack integration-runner import fix

Owner supplied Docker build output showing five unresolved modules from src/modules/integrations/runtime/runner-core.ts. Updated relative imports to extensionless specifiers for registry index, credential vault, context builder, XRay, and runner fetch. Commit: b29a5336dccd9cbc39dd5dc0e943002a07a4fbfd.

No rebuild, tests, CI, Vercel, or Gate execution was awaited. The source fix is not claimed as deployed. Next: continue the currently authorized integration roadmap and address the next concrete implementation item.

## 2026-10-09 — Integrations & AI enhancement roadmap implementation

[architect/ChatGPT] Began owner-authorized implementation with a bounded P0 reliability slice.

- Added `src/lib/db/migration-validation.ts` to centralize duplicate migration-prefix detection.
- Added `src/lib/db/migration-validation.test.ts` for unique and duplicate migration prefix behavior.
- Moved the main migration runner's preflight ahead of database connection acquisition and bootstrap queries.
- Reused the same validator in the destructive DB reset preflight.
- Commits: `e0fc892e9b94b851cde247ebf36ed7dde5db8dfe`, `8bf3b378b9fadb39e5435a4e21e7489ef32b00b7`, `e28b6ee8b8536123069eee85bb64392b5eede592`, `690730bb95ce91f8f86a8e413fff09f7f69ef619`.
- Tests/typecheck/build/CI/Vercel/live DB/deployment were not run or awaited. No claim is made that the production OAuth endpoint is fixed.
- Next: inspect existing integration connection/token persistence and OAuth contracts, then implement the smallest safe OAuth state/callback/token lifecycle slice with focused regressions.

---

## 2026-10-09 — OAuth configuration migration fail-closed guard

[architect/ChatGPT] Continued the reported Gmail OAuth application configuration failure with a bounded deployment-safety correction.

- Updated `scripts/migrate.ts` so `SKIP_DB_MIGRATIONS=1` is rejected in production and Vercel environments; the command sets a failing exit code rather than silently publishing an application with potentially missing schema.
- Commit: `176f9f26a13152f64aae505f1d04fee750f01411`.
- Existing OAuth schema migration correction remains at `065_platform_integration_oauth_apps.sql` and avoids the duplicate migration number that blocked migration startup.
- No tests, CI, Vercel build, live database query, deployment, or endpoint smoke test was run/awaited. Root cause on the live production database remains unconfirmed; deployment and migration execution are still required for runtime recovery.
- The session cookie supplied in the diagnostic curl was not copied into logs or repository content.

## 2026-10-08 — I-6 resolution-context mutation hardening

[architect/ChatGPT] Continued the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

- Source review found that the executor compared invocation identity against the caller-owned `boundContext` object. Mutating that object after registration could therefore alter the capability's recorded resolution identity.
- Corrected `src/modules/ai-platform-core/mcp-tool-bridge.ts` to snapshot the tenant/KB/agent/user/session/surface identity at registration and bind the resolver's `invoke` method at registration time.
- Added focused source regression coverage for post-registration context mutation and resolver-method replacement.
- Implementation: `7df0e6f40d20627fffc42526269c255bb9afa8b6`.
- Regression: `311ecc1711e2ed892d2e6a8ee93d6bba16291eca`.
- No MCP transport, persistence/OAuth, marketplace, production promotion, or unrelated scope was introduced.
- I-6 remains IN PROGRESS; external verification remains deliberately deferred.

## 2026-10-08 — I-6 exact MCP server/tool allowlist pairing hardening

[architect-verified] Continued the owner-authorized I-6 MCP Tool Bridge implementation without waiting for external CI, Vercel, Gate-C, or continuous verification. Source review found that independent server and tool allowlists authorized their cross-product, so a tool name permitted for one MCP server could be accepted for another permitted server. The bridge now requires an exact `serverId` + `toolName` pair in addition to the coarse server boundary and snapshots those pair identities into the executable definition.

- Implementation: `37ae1f648df78cd651bd7eecec0bcce1fd3847c0`
- Regression: `a0ac98adacadbd77d78e98cb88bd49fac49e7167`
- Control reconciliation: `0cf678537f5698122dc1cab320bbe7c87475bbc1` and subsequent I-6 state-record commits.
- I-6 remains IN PROGRESS; this is source implementation evidence, not Gate-C/Gate-D closure.
- Next bounded work: continue I-6 resolver/registration and capability-authorization edge-case review.

## 2026-10-08 — I-6 resolution-context execution binding correction

[architect/ChatGPT] Continued the owner-authorized I-6 MCP Tool Bridge implementation without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification.

- Source review found that buildMcpToolDefinition() accepted a boundContext intended to pin a resolved MCP capability to its resolution context, but the executor did not actually compare the invocation context with that bound identity.
- Corrected the executor to fail closed with TENANT_SCOPE_VIOLATION when tenant, KB, agent, user, session, or surface identity differs from the resolution context.
- Added focused regression coverage for a same-tenant caller with a different user identity.
- Implementation: 2ddb3cf94cbdf0678e36276bf389b71e064a406d; regression: 4093ac64c082bb6965edf0ba1479b1f8343d181c.
- No MCP transport, persistence, OAuth, production promotion, or unrelated implementation was introduced.

Current status: **I-6 IN PROGRESS**. External verification remains deliberately deferred.
## 2026-10-08 — I-3 redirect trace deduplication

[architect-verified] Continued the authorized I-3 Action Runner implementation without waiting for CI, Vercel, or gates.

- Found that redirect rejection emitted a trace before throwing and the outer failure catch emitted a second trace for the same request.
- Added a per-request trace-recorded guard so explicit redirect outcomes are emitted once; ordinary failures still receive the catch-generated trace.
- Implementation: `f4c827749065f679d1f79bcdace581f1c5e15903`; regression: `8cd183ed2601ac4af43fdba84661fb05f87b5924`.
- I-3 remains IN PROGRESS; no Gate-C/Gate-D PASS is inferred.

## 2026-10-08 — I-3 failed-result trace regression

[architect-verified] Added focused runner-core regression coverage for the failure-result trace propagation correction.

- Regression: `7243bd778d641e528c6f708a1ad2f4de08ecb5ba`.
- The test exercises a failed traced HTTP execution and asserts the returned `RunActionResult` retains the redacted trace entry.
- No CI, Vercel, or gate execution was awaited.

## 2026-10-08 — I-3 strict array-item schema correction

[architect-verified] Continued the authorized I-3 Action Runner implementation without waiting for CI, Vercel, or gates.

- Found that strict array validation treated null/empty primitive elements as missing values, allowing typed arrays to accept invalid elements.
- Corrected `src/modules/integrations/runtime/action-input-validation.ts` so array elements are validated as values; primitive null/empty/wrong-type items are rejected while nested object/array schemas remain recursive.
- Implementation: `6db1b45e0213bba4b53a2675c328bad0f7bdcb7c`; regression: `d12d43509463eedeba712b1b657c04cecb8475bb`.
- No I-4/I-5, MCP, OAuth transport, schema/migration, production, immutable-reference, or unrelated scope was introduced.
- I-3 remains IN PROGRESS; no Gate-C/Gate-D PASS is inferred.

## 2026-10-08 — I-3 failure-result trace propagation correction

[architect-verified] Continued the explicitly authorized I-3 Action Runner implementation without waiting for GitHub Actions, Vercel, or gates.

- Source review found that `runAction()` accumulated redacted HTTP traces during execution but returned no `httpTraces` on failure, so callers lost deterministic trace evidence precisely when an action failed.
- Corrected `src/modules/integrations/runtime/runner-core.ts` to maintain one per-run trace collection across custom/piece execution and include it in failed `RunActionResult` responses.
- Correction commit: `77b806f65d002b53bb6a7d04294ec0164dc392d5`.
- No schema, OAuth transport, MCP, I-4/I-5, production, immutable-reference, or unrelated scope was introduced.
- I-3 remains IN PROGRESS; no Gate-C/Gate-D PASS or phase closure is inferred.

## 2026-10-08 — I-3 trace secret-value hardening

[architect/ChatGPT] Continued the bounded I-3 Action Runner implementation without waiting for CI, Vercel, or gates.

- Found the generic traced-fetch error path only applied pattern-based redaction, so arbitrary provider errors could retain a known resolved secret value.
- Changed the failure-trace boundary to scrub the runner's known secret values before storing or logging the error.
- Added a focused regression proving arbitrary thrown errors do not enter the trace with the known secret.
- Commits: `d0799b370801d1b1319910876f7053e41d92f66d`, `c764fa4bea306fee7f5447ca8e025ec4c2a330d2`.
- No I-4/I-5, MCP, production promotion, or unrelated implementation was introduced.

Current status: **I-3 IN PROGRESS**. Next bounded implementation remains deterministic result propagation, strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression coverage.

## 2026-10-08 — I-3 deterministic runner result propagation

[architect/ChatGPT] Continued the bounded I-3 Action Runner implementation without waiting for CI, Vercel, or gates.

- Converted registry-approved but package-missing action lookup failures to the explicit `ACTION_NOT_ALLOWED` host error classification.
- Converted piece-action strict input rejection to the explicit `INVALID_INPUT` host error classification.
- Added focused runner regressions proving these results expose stable `errorCode`/retryability without depending on provider-message parsing.
- Commits: `d3c18c3669555f062dd0fae3613cdb9d39ef79ba`, `62ef2fea18c93225dbc2815cbde67f1da72af621`.
- No I-4/I-5, MCP, production promotion, or unrelated implementation was introduced.

Current status: **I-3 IN PROGRESS**.

## 2026-10-08 — I-3 strict schema + egress boundary continuation

[architect/ChatGPT] Continued the owner-authorized I-3 Action Runner implementation without waiting for GitHub Actions, Vercel, Gate-C, or Gate-D.

- Re-read the authoritative project-control state and confirmed I-3 remains the active bounded implementation phase; I-2 external verification remains deliberately deferred.
- Tightened the generic runner egress boundary so DNS-resolved private destinations use the host-owned `EGRESS_BLOCKED` classification instead of a generic execution error.
- Moved egress validation inside the traced request boundary so blocked outbound attempts produce a redacted failure trace without invoking the network implementation.
- Changed generic redirect rejection to the explicit `REDIRECT_BLOCKED` classification.
- Extended strict action-input validation to recursively validate array item schemas, including nested object required/type/unknown-property checks.
- Added focused regressions for typed DNS egress failure, redacted blocked-request tracing, typed redirect rejection, and strict array-item validation.
- Commits: `57f5fd9e22904eee39759a8c06891e73fc8fd513`, `99a574e60efd217463628eaa26369c6d515cdfb7`, `9e921b24a53d00fb14287db9a7e274fdf376da8b`, `ef1044273b5fcc143585ddb5fb682dceb08be1b8`, `70ba919fede3c0652a9ced5d6feee88e5119fcbb`, `5b839525bd46de4cc9d07834970e351c2ac2e06e`.
- No I-4/I-5, MCP, production promotion, or unrelated implementation was introduced.

Current status: **I-3 IN PROGRESS**. Next bounded implementation remains deterministic result propagation, strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression coverage.

## 2026-10-08 — I-3 typed authorization boundary continuation

[architect/ChatGPT] Continued the bounded I-3 Action Runner review without waiting for CI, Vercel, or gates.

- Reviewed the execution authorization boundary against the I-3 deterministic error contract.
- Found authorization and plan-resolution failures still constructed generic `Error` instances, forcing the runner to recover classifications through message heuristics.
- Corrected `execution-authorization.ts` to emit host-owned `IntegrationRunnerError` classifications: `UNKNOWN_INTEGRATION`, `AUTHORIZATION_DENIED`, and `PLAN_NOT_ENTITLED`.
- Updated focused authorization regressions to assert the stable error code/retryability contract.
- Commits: `2b986887b4f2c8964b3755b3aead5b93e871eb93`, `2002524a1ce4f9f0fef174b5b7bf4cb5dae84125`.
- No I-4/I-5/MCP/production/unrelated scope introduced.

Current status: **I-3 IN PROGRESS**. Next bounded implementation review remains strict schema coverage, egress/redirect invariants, redacted trace behavior, deterministic result propagation, and tenant-isolation regression coverage.

## 2026-10-08 — I-3 Action Runner continuation

[architect/ChatGPT] Continued the owner-authorized I-3 implementation track without waiting for GitHub Actions, Vercel, Gate-C, or Gate-D.

- Re-read the mandatory repository instructions and project-control transition. Repository truth confirms I-3 is the active implementation phase; I-2 external verification remains deferred by owner control.
- Reviewed the I-3 plan acceptance criteria and current runner/error/egress/input-validation implementation.
- Found the actual feature branch's strict action-input regression test still had two `it()` blocks outside the enclosing `describe()` block despite project-control text claiming the structure was restored. Corrected the test structure in `93d5211333cc4f919981476b27dc8a782b407555`.
- Added runner-core regression coverage asserting the stable `errorCode`/`retryable` result contract for unknown integrations and allowlist rejection in `05ec7cfc9e81beb100684ddb885f84d818d79482`.
- Updated the authoritative project-control transition/current-state records to preserve cross-chat continuity.
- No I-4, I-5, MCP, production promotion, or unrelated implementation was introduced.

Current status: **I-3 IN PROGRESS**. Next bounded implementation remains the I-3 acceptance review, with focus on strict schema coverage, egress/redirect boundaries, redacted trace invariants, deterministic result propagation, and tenant-isolation regressions.

## 2026-10-06 — I-067 integration egress correction

ChatGPT continued the bounded I-2 source review without waiting for GitHub Actions or Vercel. The host egress guard was found to reject dotted IPv4-mapped IPv6 private destinations but not hexadecimal-mapped forms such as `::ffff:7f00:1`. The guard was corrected to decode both representations and apply the existing IPv4 private-range policy. Focused regression coverage was added for loopback and private mapped forms.

- Implementation: `8d176739784d2d510f20d242b533a7383ac5de98`
- Regression: `ee76381b577f5ffdeb658f4ccdc9b7dd27653cc0`
- Control records: I-067 resolved; I-2 remains IMPLEMENTED — VERIFICATION PENDING.
- No I-3/MCP/production/unrelated scope was started.


## 2026-10-06 — I-048 auth-type authority correction

[architect/ChatGPT] Continued bounded I-2 credential-lifecycle review without waiting for CI or Vercel. Found that runAction used connection.auth_type to decide OAuth refresh, even though the integration registry is the authoritative contract and the connection API accepts authType input. Corrected runAction to pass def.authType into ensureTokenFresh. Commit: 86e08f0adc542a21c18ca7a4f3b6256c6e8c0126. I-048 is architect-resolved by source review; executable Gate-C evidence remains pending.


## 2026-10-06 — I-047 direct-connection plan-limit correction

[architect/ChatGPT] Continued the bounded I-2 plan-to-implementation review without waiting for CI or Vercel. Source review found that the organisation integration connect path checked current plan entitlement but could implicitly enable a previously-disabled integration without applying max_integrations. Corrected the POST control path so connect enforces the integration-count limit only when it would consume a new organisation slot; connections to an already-enabled organisation integration remain allowed. Implementation commit: 846c8d39add3430a5014c5573b3cc4d5ad86ee37. Focused regression: 354e57f9fb658267f1667c1eec8b5dfbd63023ad. I-047 is architect-resolved by source review. Gate-C remains pending executable evidence; no I-2 PASS is claimed.


Current status: **IMPLEMENTED — VERIFICATION PENDING** because the connected GitHub integration has not exposed an Actions run for the current feature head. No PASS is claimed.


---

## 2026-10-05 — Integrations I-1 contract hardening and verification checkpoint — `IN_PROGRESS`

| Field | Content |
|---|---|
| Authorization | D-031 — host-neutral Integrations Framework contracts/test foundation only |
| Implementation | [developer/ChatGPT] I-1 contracts, focused tests, and platform-core export were implemented. Architect review identified two boundary weaknesses: generic connection metadata and generic error-detail bags could become secret-bearing surfaces, and connection-store/credential-vault operations were ambiguous for multiple connections. |
| Correction | [developer/ChatGPT] Removed generic metadata/details bags and changed connection lookup/disconnect/credential-handle operations to use concrete connection IDs. Added compile-time negative tests for the forbidden secret-bearing fields. |
| Verification | [architect-verified] Scope remains within D-031. Database/deployment gates are NOT_APPLICABLE. Focused I-1 Vitest/typecheck/lint verification was added to CI, but no Actions run is currently exposed through the connected GitHub integration, so Gate C remains MISSING. |
| Review | [architect-verified] Gate D review completed with `PASS_WITH_FOLLOWUP`: the corrected contract is architect-reviewed, but I-1 cannot close until executable verification is observed. |
| Current status | **IMPLEMENTED — VERIFICATION PENDING**. No I-2 or later integration work is authorized. |
| Next action | Obtain executable I-1 CI evidence, then perform final Gate-D closure review and either close I-1 or issue a bounded correction. |


## 2026-10-05 — Integrations I-1 threat model — verification still pending

D-031-authorized scope now includes the I-1 trust-boundary artifact `src/modules/ai-platform-core/integrations/integration-threat-model.md`. [developer/ChatGPT] The document maps credential, OAuth, tenancy, egress, tool-bridge, and telemetry boundaries and records the stopping boundary for I-1. No runtime integration, persistence, OAuth transport, outbound HTTP, deployment, or billing behavior was added. [architect-verified] I-1 remains open pending executable Gate-C evidence; I-2 remains unauthorized.


## 2026-10-05 — Integrations I-1 — I-018 correction and verification boundary

ChatGPT architect review found a concrete contract/test mismatch before I-1 closure: the test still constructed a removed generic connection `metadata` bag; the execution-result error contract still exposed generic `details`; and the test omitted the result type import. This was recorded as I-018 (P1) and corrected within D-031 scope.

Correction commits:
- `b13e74487a5874b8b070da8ade97963e3f63f0d5`
- `bfc40f671aea218def571c617f00789e15b45823`

Architect verification confirms the correction diff is limited to the two authorized I-1 contract/test files. Gate C remains MISSING because no executable Actions run is exposed for the current feature head. I-1 therefore remains IMPLEMENTED — VERIFICATION PENDING; no closure is claimed. [architect-verified]


## 2026-10-05 — Integrations I-1 current-state architect review

ChatGPT independently re-read the current I-1 contract/test/threat-model state at the feature-branch tip `d9705441`. The corrected contract at `bfc40f67` is an ancestor of the current tip and removes the previously identified generic metadata/error-detail bags; concrete connection IDs and opaque credential handles remain enforced; the Unified Tool Runtime remains the only execution bridge. **Gate D: PASS_WITH_FOLLOWUP** for the corrected contract boundary. **Gate C remains pending** because the connected GitHub Actions surface exposes no workflow run for the current feature head. No I-2 or later integration work is authorized. [architect-verified]


## 2026-10-05 — Docker/Next build boundary correction — verification pending

A user-provided local `docker compose up -d --build` run reached successful Next.js compilation but failed during the build type-check because the immutable/reference snapshot `ai-platform-core/doable-source/**` was included by the root TypeScript glob and imported `@e965/xlsx`, which is intentionally not an application dependency. Evidence: the build failed at `ai-platform-core/doable-source/services/api/src/ai/attachments.ts:20` with `Cannot find module '@e965/xlsx'`.

[architect/ChatGPT] Corrected the build boundary without modifying the immutable snapshot or adding a reference-only dependency: `tsconfig.json` and `tsconfig.typecheck.json` now explicitly exclude the two non-runtime reference trees `ai-platform-core/**` and `clara-core/**`. The active runtime implementation remains under `src/modules/**` and is unaffected. Commits: `6066131b`, `324a494d`.

Verification status: **PENDING EXECUTABLE BUILD**. The ChatGPT runtime cannot clone the GitHub repository or execute Docker because outbound GitHub network resolution is unavailable; no build PASS is inferred. The next executable check is `docker compose up -d --build` (or equivalent CI `npm run build`) from the current feature head. No immutable/reference source was changed.


## 2026-10-05 — UI test-readiness and build-boundary review

Reviewed the active agent workspace UI against the requested ElevenLabs-style experience. The branch already contains the single organisation sidebar, agent workspace sections (Overview/Assistant/FAQ/Knowledge/Tools/Branches/Publish), global version/draft/publish topbar, branch creation/merge/archive controls, Branch History half-canvas flow, pending-change review, preview/publish controls, and responsive navigation. No duplicate sidebar or UI rewrite was required.

The user-provided Docker build exposed the immutable-reference TypeScript traversal problem. The repository already contains the correct boundary correction in tsconfig.json and tsconfig.typecheck.json, excluding ai-platform-core/** and clara-core/** from application type checking. A temporary attempt to add the reference-only @e965/xlsx dependency to the application manifest was identified as architecturally incorrect and immediately reverted; the app dependency boundary is restored.

Current status: I-1 remains IMPLEMENTED — VERIFICATION PENDING; I-019 remains VERIFICATION PENDING until an executable production build confirms the TypeScript boundary correction. No I-2, OAuth, persistence, egress, integration runtime, deployment, billing, or Phase 8 work was introduced.


## 2026-10-05 — AI Platform / Integrations I-1 UI verification surface

[developer/ChatGPT] Added the dedicated `/ai-platform` product surface and admin navigation entry. The UI exposes the active Integrations I-1 contract boundary, Unified Tool Runtime, existing provider control plane, bounded agent-loop state, and I-1 verification/stopping boundary.

The UI does not unlock OAuth, persistence, credential storage, outbound HTTP/egress, integration execution, Activepieces, billing, deployment, or I-2. Implementation is complete; browser/deployment verification remains pending because no fresh deployment or current Actions run is exposed through the connected surfaces.


## 2026-10-05 — UI/RBAC/subscription readiness and build dependency correction

Implemented directly on the feature branch:
- tightened organisation-member role UI so project managers can invite/manage day-to-day Editor/Viewer access without being offered elevated Admin/Project-manager grants;
- expanded Billing & Plan with explicit Voice, API/embed, custom branding, multilingual knowledge, SSO/SAML, priority support, analytics, and existing usage/limit visibility;
- preserved server-side RBAC as the authoritative enforcement boundary;
- reconciled the existing @e965/xlsx package declaration with package-lock.json using the published 0.20.3 integrity metadata;
- cleared the Vercel clara-backend ignored-build-step so the feature branch can produce a preview on the next pushed commit.

Commits: 298a57aa (role UI), c59678dc (plan entitlements), 63fcb501 (xlsx lockfile), 2df64eeb (governance). No production promotion performed.

Verification remains pending: executable production build, current-head CI evidence, browser verification of /ai-platform and tenant-role redirects, and final I-1 Gate-D review.

## 2026-10-05 — Preview path enabled

Opened draft PR #266 from feature/ai-core-from-doable-source to Vercel-Prod solely to obtain a preview build without merging or promoting production. Vercel project clara-backend is linked to the same repository/branch and its ignored-build-step setting has been cleared. No fresh deployment has appeared yet through the connected Vercel surface; browser verification therefore remains pending and no preview URL is claimed.

## 2026-10-05 — UI/RBAC/subscription correction checkpoint — `d0f2d5a1`

[developer/ChatGPT] Continued the user-directed UI test-readiness work from the existing feature branch. The Members surface now presents explicit role guidance and constrains project managers to Editor/Viewer grants. The server-side invitation and role-change handlers enforce the same hierarchy and reject self-role changes. Billing & Plan now exposes the complete plan-limit/entitlement set on each plan card while retaining live usage meters and existing upgrade/downgrade flows.

A source review also found that earlier governance wording overstated the existing role restriction/package state. The current records are being reconciled to the actual branch state. `@e965/xlsx@0.20.3` is now declared and locked with published integrity metadata; no immutable/reference material was modified.

Current status: **IMPLEMENTED — VERIFICATION PENDING**. Required next evidence is a current-head production build, current-head CI, browser verification, and exact-head immutable/runtime-import/secret/governance checks. No I-2, OAuth, persistence, egress, MCP runtime, or production promotion is authorized.


## 2026-10-05 — UI / RBAC / Subscription verification checkpoint
- Organisation Team UI exposes the four existing roles: Admin, Project manager, Editor, Viewer.
- Added an explicit permission matrix to the Members screen; it is explanatory UI only and server-side RBAC remains authoritative.
- Billing UI exposes plan limits/capabilities including knowledge bases, documents per KB, rolling request quota, storage, Voice, API, Branding, and SSO.
- Secure spreadsheet parser dependency `@e965/xlsx@0.20.3` is present in package.json and package-lock.json, addressing the Docker build failure reported from the previous branch build.
- Server RBAC remains fail-closed: tenant scope rejects platform-admin access to tenant resources, and org/agent/KB permissions are checked server-side.
- Subscription enforcement remains server-side through `planGuard`; inactive subscriptions fall back to Free limits.
- UI testing is authorized once a fresh branch preview reaches READY; the previously observed Vercel deployment was cancelled and is not treated as a valid test target.


## 2026-10-05 — Role/Subscription UI enablement
- Added client-only organisation capability matrix aligned to server RBAC: org_admin, project_manager, kb_editor, kb_viewer.
- Updated existing sidebar/workspace navigation to hide unavailable member/billing/edit/publish surfaces; direct foreign-org and unauthorized section routes redirect to the caller's own workspace while server RBAC remains authoritative.
- Added role capability contract tests and a focused CI UI verification job.
- Fixed subscription plan management to use the current versioned platform-plan API instead of absent legacy endpoints.
- Exposed/configured TTS character, STT seconds, and translation-character daily limits in public/admin plan reads, version creation, and plan editor UI.
- Fixed plan-guard fallback resolution so those three limits remain effective when a subscription falls back to base/free plan limits.
- Existing dashboard/billing usage meters and member permission matrix remain the primary user-facing plan/RBAC surfaces.
- No schema/migration changes, immutable Doable source changes, MCP changes, or D-023 billable tool metering changes.

- Extended organisation Billing UI and `/api/orgs/subscription` to expose TTS/STT/translation limits alongside existing quotas; current plan-guard fallback and versioned plan APIs are aligned.


## 2026-10-05 — Role assignment UI correction

[developer/ChatGPT] Corrected the organisation Members role selector so an org_admin is offered all four defined roles, including Project manager. Project managers remain restricted to Editor/Viewer grants in the UI and server-side handlers; self-role changes remain rejected. No schema, permission-definition, or billing behavior changed.

Commit: 43a2d8d81dc8af555063ee5da7cc358bf2e39b82.

Verification: source-level PASS; executable CI/browser verification remains pending. Vercel preview is currently blocked by the provider's free-plan daily deployment limit, so no stale preview is treated as current-head evidence.


## 2026-10-05 — Integrations I-2 owner implementation

[developer/ChatGPT] Continued directly from the closed Phase 7 baseline under new authorization D-032. Imported the Doable integration registry families from docs/doable-source, yielding 168 integration definitions. Added platform/org/agent integration access persistence and UI, plan-based integration limits, encrypted credential storage, scoped action state, and a Clara-bound Doable/Activepieces action runner. Registered integration_availability and guarded integration_action in the existing Unified Tool Runtime so the same bounded AI loop can discover and execute permitted integrations across Chat/Realtime/Embed surfaces.

Also corrected the user-reported Docker dependency boundary by declaring and locking @e965/xlsx@0.20.3 without modifying immutable/reference source. The full Doable Activepieces package closure (529 packages) is now declared in package.json; lock synchronization remains pending because the current execution environment has no external npm/GitHub network access.

Current status: I-2 IMPLEMENTED — VERIFICATION PENDING. No PASS claimed.


## 2026-10-05 — [architect-verified] I-2 recovery/security hardening

- Recovered current repository state from GitHub and established Integrations I-2 as the active bounded work.
- Reviewed the implemented integration runner, tracing, credential-vault access, store, API boundaries, and migration 052.
- Corrected sensitive runtime observability exposure: request/response bodies, action properties, outputs, and raw errors are now redacted or omitted from integration traces/logs.
- Corrected integration-store tenant isolation: FLOW keys include organisation scope and reads/deletes require org_id.
- Corrected connection agent ownership: API validation requires the agent to belong to the target organisation and migration 061 adds a composite agent/org persistence constraint.
- Added focused tests for trace/error redaction and store tenant isolation.
- Reconciled the project-control state to I-2 IMPLEMENTED / VERIFICATION PENDING with Z.AI STOPPED.
- I-2 remains open: executable Gate-C evidence, database Gate-E evidence, connector/browser verification, and final Gate-D review are still required.
\n\n## 2026-10-05 — [architect-verified] I-2 migration sequence correction\n\n- Inspected the actual feature-branch migration directory rather than relying on the database list alone.\n- Found a real build blocker: 052_integrations_control_plane.sql duplicated the existing 052_platform_announcements.sql. A later Vercel deployment also independently showed the migration runner failing on duplicate migration number 052, confirming this class of failure is real.\n- Corrected the repository sequence without changing migration SQL semantics: integration control plane is now 060, integration tenant hardening remains 061, Data API hardening remains 062, and the pre-existing Sarvam 060 migration is now 064.\n- Updated migration file headers to match their final filenames.\n- Enumerated the repository migration directory after correction: no duplicate migration numbers remain.\n- Existing Supabase state retains the historical 052_integrations_control_plane.sql application record; no destructive rollback was performed.\n\nVerification status remains IMPLEMENTED — VERIFICATION PENDING because executable Gate-C/build/test/typecheck/lint and runtime/browser/connector evidence is still required.\n

## 2026-10-05 — [architect-verified] I-2 current execution-path reconciliation

- Reconciled the repository control documents against the authoritative feature branch tip `4200b0cf5180c607406b8f60fbe2a99376b0bcb1`.
- Confirmed Gate-E is materially evidenced for the I-2 database surface; corrected stale control text that still described Gate-E as missing.
- Confirmed `.github/workflows/ci.yml` now runs only for Vercel-Prod push/PR events, so the historical feature-branch GitHub Actions failures cannot serve as current-head CI evidence.
- Started a genuine Vercel build for exact head `4200b0c`. It cloned the correct branch/commit, processed .vercelignore, and entered `npm install --legacy-peer-deps --include=dev`. No completion event appeared after extended observation, so the deployment was canceled rather than left consuming build resources.
- No build/test/typecheck/lint PASS was inferred. I-2 remains IMPLEMENTED — VERIFICATION PENDING.

## 2026-10-05 — I-2 authoritative implementation/plan reconciliation

[architect-verified] Rechecked the active I-2 plan, D-032 authorization, current GitHub branch tip, implementation tree, database migrations, and verification records. Confirmed that the delivered I-2 scope is authorized by D-032: persistence, platform/org/agent access, encrypted credentials, Doable/Activepieces runner, and AI-tool exposure. Confirmed the immutable `docs/doable-source/**` reference remains separate from runtime imports.

Completed corrections verified in repository state: integration HTTP trace/error redaction, organisation-scoped FLOW-store keys and access, agent/org ownership enforcement, migration sequencing (060/061/062 with no duplicate migration numbers), and Data API/RLS hardening. Supabase Gate-E evidence remains valid.

Newly re-confirmed blocker: `package.json` declares the large `@activepieces/*` dependency closure, while the current `package-lock.json` root dependency set does not contain those Activepieces entries. An executable npm install is therefore still required before the dependency/build gate can be accepted.

Vercel build evidence was also rechecked: deployment `dpl_5xj73TsgNcZNMD2Lu5aEYE9hqcvU` for commit `abf119cb` is still BUILDING and has progressed through npm installation with dependency deprecation warnings; it is not a PASS. The current feature tip `56f6be45` differs from `abf119cb` by governance-document commits only, but strict current-head executable evidence is still not claimed.

Control-document headers were reconciled to the same current I-2 state. No new feature scope was started. Z.AI remains STOPPED and ChatGPT remains implementation owner.

## 2026-10-05 — I-2 credential-vault tenant hardening

[architect-verified] Re-audited the implemented I-2 plan against the runtime. Found a secondary tenant-boundary gap: credential-vault `decrypt` and `updateStatus` were connection-ID-only operations, unlike the normal tenant-scoped connection lookup.

[implemented] Corrected `credential-vault.ts` so both operations require `connectionId + orgId` and apply an explicit `org_id` predicate. Updated OAuth token inspection in `runner-helpers.ts` and its `runner-core.ts` call site to propagate the organisation scope.

[scope] Correction stays inside the already-authorized I-2 credential/security boundary. No OAuth transport, new provider, MCP, I-3, or production work was started.

[verification] Code-level call-site review confirms the changed helper is invoked from the runner with `params.workspaceId`, which is the I-2 runtime's organisation/tenant context. Executable tests remain unavailable, so no Gate-C PASS is claimed.


## 2026-10-06 — I-2 redirect egress hardening

[architect-verified] Following the mandatory project-control recovery read, I-2 remained the active bounded implementation/verification work. Without waiting for GitHub Actions or Vercel, ChatGPT reviewed the current integration runner and identified that native fetch redirect-following could bypass the initial host egress/SSRF check. The generic runner was corrected to use manual redirect handling and fail closed on 3xx responses; a fetch-injection seam and focused regression tests cover private and public redirect responses. Recorded as I-036. No OAuth transport, MCP, billing, migration, production promotion, or unrelated scope was added. Control docs were reconciled to the correction. Current feature tip after the bounded correction is `ec399b7d3e3e1e2ab9ff429eaa9775087c21e122`; executable Gate-C evidence remains pending and I-2 is not closed.


## 2026-10-06 — I-2 owner continuation: project/agent scope correction

- ChatGPT re-ran the mandatory project-control recovery path and confirmed I-2 remains the active bounded work: IMPLEMENTED / VERIFICATION PENDING; Phase 7 is CLOSED; Z.AI is STOPPED.
- Plan-to-implementation source review found that `credentialVault.get()` expects an optional agent scope, but `runAction()` passed `projectId` into that position. This conflated distinct identities and could prevent agent-scoped connections from resolving correctly.
- Corrected `RunActionParams` with an explicit `agentId?: string` and changed both custom-action and piece-action credential lookups to pass `params.agentId`.
- Correction commits: `8cad5e6759e79dfe54729257b68bc719319e7161`, `54fa672ce7e1df29d97cc2fbc5589403c5682ab0`.
- Control documents updated: I-037 recorded as resolved by architect source review; Gate-C remains missing because executable current-head build/test/typecheck/lint evidence has not been produced.
- No I-3, MCP expansion, production promotion, OAuth transport expansion, or unrelated implementation was started.

## 2026-10-06 — I-2 known-secret trace redaction hardening

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work, with Z.AI STOPPED and no I-3/MCP/production authorization.

[architect-verified] Plan-to-implementation review identified I-038: HTTP trace body redaction recognized sensitive field names and common token patterns, but did not scrub exact credential values already resolved by the integration connection. A provider response could echo a credential under a non-sensitive field name or plain text.

[implemented] Extended `redactBody()` to accept known secret values and scrub exact matches before truncation; passed resolved auth secret values into both custom-action and piece-action traced-fetch wrappers.

[implemented] Added focused regression coverage for plain-text credential echo and a credential value nested under a non-sensitive JSON field.

Correction commits:
- `d288975526e40a67e4c22cdc402760f1ca6649af`
- `1a19b95d10c03b9b4e8128628846827cf2b1676f`
- `750e5da08150c1f09be0fb8db232413df23df25b`

Control records:
- I-038 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- No executable GitHub Actions/Vercel result was awaited or inferred.


## 2026-10-06 — I-2 OAuth refresh redirect hardening

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work.

[architect-verified] Plan-to-implementation review found that `ensureTokenFresh()` checked the configured OAuth token endpoint with the integration egress policy, but native fetch could automatically follow a 3xx response to another destination.

[implemented] OAuth refresh now uses manual redirect handling and fails closed on every 3xx response. This keeps the credential-bearing refresh request inside the existing host-owned egress boundary without adding OAuth callback/transport scope.

Correction commit:
- `fddf00ca3c5cea63daa5c4146ae212908deb205a`

Control records:
- I-039 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- No executable GitHub Actions/Vercel result was awaited or inferred.


## 2026-10-06 — I-041 post-refresh credential scope correction

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work. Source review found one remaining credential-scope inconsistency after I-037/I-040: the post-OAuth-refresh `freshConnection` lookup in `runAction()` still passed `projectId` to the agent-scoped credential-vault parameter.

[implemented] Changed the post-refresh lookup to pass the explicit `agentId`.

Correction commit: `1001819239fcba146061be84c35254a8a9fb30cb`.

I-041 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No executable CI/Vercel result was awaited or inferred. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-042 Unified Tool Runtime project-scope correction

[architect-verified] Source review found that the integration_action Unified Tool Runtime bridge passed `projectId: context.agentId` even though PlatformExecutionContext has no project identity. This fabricated a project scope from the agent identity.

[implemented] Removed the projectId assignment. The bridge now passes the explicit tenant and agent identities only; runAction retains projectId as an optional field for hosts that actually possess a project identity.

Correction commit: `3305c9027ddcef4fff0520d941dfebc73f9ef94a`.

I-042 is resolved by source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No executable CI/Vercel result was awaited or inferred. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-043 AI tool tenant-boundary correction

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work and no executable CI/Vercel result is being awaited for source-level corrections.

[architect-verified] Source review found that the Unified Tool Runtime `integration_action` bridge checked `agent_integrations` by agent_id/integration_id but did not bind the grant lookup to the execution tenant. The connection lookup was already tenant-scoped, but the AI-visible tool boundary should fail closed on an agent that does not belong to the current tenant.

[implemented] The agent grant query now joins `agents` and requires `agents.org_id = context.tenantId`. Focused regression coverage now verifies that `runAction` receives explicit `agentId` without inventing `projectId`, and rejects a cross-tenant agent before execution.

Correction commits:
- `870ac568d050a8a6f54c347684a1b6e4fe9015ca`
- `b5a744cc57135e2e8f1037f7396c56ed57bc3656`
- `26f0f5fd00d47641598854e0cbb813ac049b7459`
- control record: `f95328888a153af07f2e82e5d2cdc11bbed181b8`

I-043 is resolved by architect source review. Gate-C remains MISSING and Gate-D remains IN_PROGRESS. No executable GitHub Actions/Vercel result was awaited or inferred. No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-045 organisation integration downgrade-unwind correction

[architect-verified] Mandatory project-control recovery confirmed I-2 remains the active bounded work. Source review found that the organisation integration POST route evaluated current plan entitlement before branching on the requested action, so a downgraded organisation could be blocked from disabling an integration it was no longer entitled to use.

[implemented] Made plan enforcement action-sensitive: `enable` and `connect` require current plan entitlement; `disable` and `disconnect` remain available without plan-limit resolution so tenants can unwind access after downgrade.

[implemented] Added focused route regression coverage for successful downgrade-disable without plan-limit resolution and for plan-entitlement rejection when enabling.

Correction/test commits:
- `4c653b18c488661a9000f21f73344ce90d669b1a`
- `289bb2a9dc8d40532479c62980f0ab110a600849`

Control records:
- I-045 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- Current feature tip after this bounded correction/control update: `d9331f8b019d18bb826854a86f56da09c9ff7331`.
- No executable GitHub Actions/Vercel result was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.


## 2026-10-06 — I-046 AI availability plan-entitlement correction

[architect-verified] I-2 source review found that the AI-visible `integration_availability` tool did not apply the organisation's current plan allowlist, even though the execution tool already enforced plan entitlement. This could expose a capability to the model that execution would immediately reject after a downgrade.

[implemented] Availability now resolves the current organisation plan and filters enabled agent integrations against platform `allowed_plans`, including wildcard `*`. Added focused regression coverage for denied and entitled plans.

Correction/test commits:
- `48a55826f4c45fe71c891bd68f71075fc363f8fc`
- `b3d090a1644d1982e1709d095458db9c593a5d42`

Control records:
- I-046 resolved by architect source review.
- Gate-C remains MISSING.
- Gate-D remains IN_PROGRESS.
- No executable GitHub Actions/Vercel result was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-049 atomic organisation integration mutation correction

[architect-verified] Mandatory project-control recovery was performed before continuing. CHAT_CONTINUITY.md, NEXT_ACTION.md, PROJECT_STATE.md, CURRENT_PHASE.md, VERIFICATION_STATE.md, DECISIONS.md, ISSUES.md, and the I-2 planning/authorization boundary were re-read. GitHub branch truth is feature/ai-core-from-doable-source; I-2 remains IMPLEMENTED — VERIFICATION PENDING; Z.AI remains STOPPED.

[architect-verified] Source review found a P1 I-2 correctness/concurrency defect in src/app/api/orgs/[orgId]/integrations/route.ts: max-integrations count checks and subsequent organisation-grant/connection mutations were separate pool operations. Concurrent enable/connect requests could both consume the same slot, and a failed connection insert could leave the organisation integration enabled without a usable connection.

[implemented] Moved bounded enable and connect mutations into withTransaction(). Added a transaction-scoped PostgreSQL advisory lock keyed by organisation to serialize integration-slot mutations. Direct connect now atomically commits the implicit organisation enablement with the encrypted connection insert, so a failed insert rolls the grant back with the transaction.

[implemented] Extended src/app/api/orgs/[orgId]/integrations/route.test.ts with focused coverage for transactional direct-connect limit enforcement and connection-insert failure handling.

Implementation commits:
- 0f55d11dfc612b293fcf9046cb6d99c25451cdf9
- cd35659c8b286dd89d6ba325307ce734cfe0b2dc
- regression ccd1fb2d7ba0b06d1ebace779aea7854e9e034df

Control records:
- I-049 resolved by architect source review.
- Gate-C remains MISSING; executable current-head tests/typecheck/lint/build are not claimed.
- Gate-D remains IN_PROGRESS.
- No GitHub Actions/Vercel success was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-050 AI availability tenant-binding correction

[architect-verified] Continued the bounded I-2 source review without waiting for GitHub Actions or Vercel. The AI-visible integration availability query was compared against the already-corrected integration_action tenant boundary.

[architect-verified] Found that integration_availability filtered agent_integrations by agent_id but did not bind that agent to context.tenantId through the authoritative agents.org_id relationship. This could expose cross-tenant capability metadata.

[implemented] Added the agents join with a.org_id = context.tenantId and added focused regression coverage proving a cross-tenant agent identity returns no available integrations.

Implementation commits:
- c9f71d7e776e0127d587d08e03132579c5ac9fad
- regression c122dfab4a1deee1d3b40614cc8cb993f7812d56

Control records:
- I-050 resolved by architect source review.
- Gate-C remains MISSING; executable current-head tests/typecheck/lint/build are not claimed.
- Gate-D remains IN_PROGRESS.
- No GitHub Actions/Vercel success was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.


## 2026-10-06 — I-2 owner continuation: telemetry schema + entitlement fail-closed corrections

[architect-verified] Continued the bounded I-2 implementation review without waiting for CI/Vercel.

- I-052: corrected integration usage telemetry to use the existing `integration_usage_log.org_id` and `agent_id` schema; runner call sites now pass explicit agent scope.
- Added focused regression coverage for the tenant/agent telemetry SQL contract.
- I-053: corrected plan entitlement enforcement so malformed/null `allowed_plans` values fail closed on AI execution, organisation enable/connect, and agent enable.
- Added focused regressions for malformed allowlist denial across all three boundaries.
- No schema/migration changes, billing changes, OAuth transport expansion, MCP, production promotion, or unrelated implementation.
- I-2 remains IMPLEMENTED — VERIFICATION PENDING; Gate-C remains open/missing and Gate-D remains in progress.


## 2026-10-06 — I-055 cross-integration credential authorization correction

[architect-verified] Continued the bounded I-2 source review without waiting for GitHub Actions or Vercel. The Activepieces `DoableConnectionsManager` was found to retrieve credentials for an arbitrary integration key directly from the credential vault without re-checking the authoritative execution authorization contract.

[implemented] Added the same fail-closed platform enablement, plan entitlement, organisation grant, explicit agent scope, and agent-to-organisation checks used by direct integration execution before any cross-integration credential read. Unauthorized lookup now fails before `credentialVault.get()` is reached.

Implementation/regression commits:
- `3a17c31cb16bfa54cb79a48a13a757ae16486971`
- `4f86976b505487906d18e526b6433be360e97a8b`

Control records:
- I-055 resolved by architect source review.
- Gate-C remains MISSING; executable current-head tests/typecheck/lint/build are not claimed.
- Gate-D remains IN_PROGRESS.
- No GitHub Actions/Vercel success was awaited or inferred.
- No I-3, MCP expansion, production promotion, or unrelated implementation was started.

## 2026-10-06 — I-056 plan-entitlement fail-closed correction

- [architect-verified] Reviewed the current I-2 execution authorization boundary after I-055. `getOrgPlanLimits()` was found to catch plan-resolution/database failures and return free-plan limits, which is unsafe for an authorization boundary because a free-plan-allowed integration could execute without proving current entitlement.
- [architect-verified] Corrected `src/modules/integrations/runtime/execution-authorization.ts` to use `resolveOrgPlanLimits()` directly and deny execution when entitlement resolution fails. Added focused regression coverage for the failure path.
- [architect-verified] Implementation commits: `96873f410d4eb4f4dc0ae18ba92d6170e7dc0825`, `9ac86755c94132a86afbde804a7ca3b927e0e83b`; regression `220d1a66fe7279bb55296d31d5f9d5c3133b78ef`.
- [architect-verified] Recorded I-056 as RESOLVED in `docs/project-control/ISSUES.md`; refreshed `PROJECT_STATE.md`, `NEXT_ACTION.md`, and `VERIFICATION_STATE.md`.
- [architect-verified] I-2 remains IMPLEMENTED — VERIFICATION PENDING. No Gate-C PASS or Gate-D PASS is claimed. No I-3/MCP/production/unrelated scope started.

## 2026-10-06 — I-061 custom Management credential authorization correction

- Source audit identified a secondary credential boundary: custom `supabase.execute_sql` read `supabase-mgmt` credentials directly without re-checking that integration's platform/plan/org/agent authorization.
- Corrected in `5f6d044a2ec1d8ddacaf9bde553f17576c14732e`.
- Added denial-before-read regression in `3ebbbf7113e851a427d310aee2d3a057a6b8ba83`.
- Scope remains I-2 credential/connection authorization; no I-3/MCP/production work.

## 2026-10-08 — I-3 Action Runner implementation authorized and started

[architect-verified] Owner explicitly authorized moving implementation beyond the I-2 verification boundary without waiting for CI, Vercel, or gates. I-2 remains verification-deferred, not PASS/CLOSED. I-3 is now the active bounded implementation track.

Implemented:
- stable `IntegrationErrorCode` + `NormalizedIntegrationError` contract;
- deterministic classification of authorization, entitlement, input, egress, redirect, upstream, and execution failures;
- `RunActionResult.errorCode` and `retryable` metadata;
- runner catch-boundary propagation of normalized error metadata;
- regression coverage for deterministic classifications;
- corrected matcher ordering so egress/redirect errors are not misclassified as generic “not allowed” errors.

Commits: `77e7c31`, `48c364d`, `ab31558`, `e01a6f4`, `e1477cb`, `bf58cdd`, `301b589`.

No CI/Vercel execution was awaited. No I-4/I-5/MCP/production/unrelated work was started.

## 2026-10-08 — I-3 strict action-input boundary

[architect-verified] Continued I-3 Action Runner implementation. The existing validator allowed undeclared properties, which did not satisfy the I-3 strict pre-execution validation requirement. Added opt-in strict validation and enabled it at both custom-action and Activepieces action execution boundaries. Nested object schemas inherit strict mode.

- Implementation: `68d06ae`, `12b1153`, `80b9c18`
- Regression: `373242a`
- Default non-strict validation remains available for compatibility; the runner is strict.
- No CI, Vercel, Gate-C, or Gate-D execution was awaited.
- No I-4/I-5/MCP/production/unrelated work was started.


## 2026-10-08 — I-4/I-5 Unified Tool Runtime bridge + first-provider pilot

[architect-verified] Owner explicitly authorized continued implementation through I-4 and I-5 without waiting for GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification. I-2 remains external-verification-deferred. I-3 prerequisite implementation is treated as complete for continuation; external verification remains deferred.

[implemented] I-4 created `src/modules/ai-platform-core/integrations/integration-tool-bridge.ts`. Connected integration actions are converted into Clara-owned `ToolDefinition` objects, strict action-property validation is reused through Zod refinement, deterministic bounded tool names are generated, and platform/plan/org/agent/connection readiness is checked before exposure. Invocation uses the existing Unified Tool Runtime and delegates to the existing I-3 `runAction()`; no parallel executor or credential-bearing tool metadata is introduced.

[implemented] I-5 created `src/modules/ai-platform-core/integration-provider-pilot.ts`. The first provider pilot is Firecrawl `search`, chosen as a read-oriented bounded action. It is exact-allowlisted and default-off behind `ENABLE_INTEGRATION_PROVIDER_PILOT`. The existing I-2 connection lifecycle remains authoritative for connect/disconnect.

[implemented] Added focused regression coverage for deterministic bridge naming, strict action-input schema enforcement, exact Firecrawl/search allowlisting, and default-off flag behavior.

[implemented] Added `docs/superpowers/plans/2026-10-08-integrations-i4-i5.md` and reconciled the active project-control records plus SESSION-059.

Implementation commits:
- `f44caf5`, `a86ffd5`, `6be5dd5`, `9d746ed`, `8927e2c`
- `829667e`, `b5f9640`, `92c611a`
- plan/control/session: `e753938`, `bf15cece`, `5a878a47`, `5cad82a`, `ef5b600`, `2fa421a`, `13fd739`

Verification disposition:
- No CI/Vercel/Gate-C/Gate-D execution was awaited.
- Source-level implementation review remains the current evidence class.
- No MCP expansion, broad provider rollout, production promotion, billing redesign, or unrelated implementation was started.

## 2026-10-08 — I-4/I-5 final source-review corrections and completion

[architect-verified] Final source review found that tenant-specific integration ToolDefinitions must not be placed in the global Clara Tool Runtime singleton because tool discovery itself is tenant-sensitive. I-4 now builds context-local instances of the existing Unified Tool Runtime for dynamic connected integrations; no second executor was introduced.

[architect-verified] The Firecrawl pilot now obtains its ToolDefinition through the I-4 bridge, requires the connected/readiness boundary, and uses a context-local existing Unified Tool Runtime instance when enabled. It remains exact-allowlisted and default-off.

[architect-verified] Corrected generated literal-newline source artifacts and stale action-definition references. Focused regression source remains aligned with the final bridge/pilot boundaries.

Final correction commits:
- `19edcdad3cbdbe369141028376b632ea2a6421f0`
- `3f9479cd88af01e4cee14f74a85df2ace77a0767`
- `ab9a2623eab210ab1166a6b6022abe822aa1e98d`
- `ee4103ab831a46b1740f220ce6e2fe75b3580b4f`
- `2b7ea16d67ecfd0e86810938d993c673ac9ce410`

Disposition:
- I-4 implementation: COMPLETE at source level.
- I-5 implementation: COMPLETE at source level.
- External CI/Vercel/Gate-C/Gate-D: deliberately deferred; no PASS inferred.
- No MCP expansion, broad provider rollout, production promotion, billing redesign, or unrelated work.


## 2026-10-08 — I-3 malformed action-props boundary correction

[architect-verified] ChatGPT continued the owner-authorized Integrations I-3 Action Runner implementation. Source review found that the compile-time Record<string, unknown> contract did not protect runtime callers from null or array props. The validator now rejects those malformed top-level values before schema traversal and the focused regression covers both cases.

- Implementation: 7aa1ebc8521c377684c711d97710e0614f66b4e3
- Regression: 8ac329d38af49a6c3acba22ac25935fb8b151c3c
- I-3 remains IN PROGRESS; no CI/Vercel/Gate-C/Gate-D result was awaited.
- Next bounded work: strict schema edge cases, deterministic result propagation, egress/redirect boundaries, redacted trace invariants, and tenant-isolation regression coverage.


## 2026-10-08 — I-6 MCP binding hardening

- [architect-verified] Recovered the current project-control state from GitHub. I-3 and I-4/I-5 are already implementation-complete for the owner's continuation boundary; I-6 is the active bounded capability. External CI/Vercel/Gate-C/Gate-D remain intentionally deferred.
- [architect-verified] Source review identified a mutation-boundary defect in `src/modules/ai-platform-core/mcp-tool-bridge.ts`: caller-owned policy arrays and MCP descriptor objects were captured live by the executable closure. TypeScript readonly did not provide runtime immutability.
- [architect-verified] Corrected with `ff64b9b95e11e90f078646379a322d28e589e700`: policy/identity/surface values are snapshot-bound and frozen; invocation uses the bound descriptor.
- [architect-verified] Corrected normalized-name collision handling with `12815df1d0caa27da3937fd7a9d7abba4411c434`: distinct MCP identities that converge on one runtime name fail closed instead of silently skipping the later capability.
- [architect-verified] Added focused regression `d90cddbe1b90e2b00d1c3f6a49e844a670d5a548` proving post-registration policy/descriptor mutation cannot redirect the bound capability.
- [architect-verified] Recorded I-089 as RESOLVED and reconciled PROJECT_STATE/CURRENT_PHASE/NEXT_ACTION to the I-6 continuation. No gate was closed and no external execution was awaited.

## 2026-10-08 — PDF ingestion runtime compatibility correction

- Current-head local startup exposed a pre-existing dependency/API mismatch: pdf-parse is pinned to 2.4.x while src/modules/ingest/parsers/pdf.ts still imported the removed v1 internal path pdf-parse/lib/pdf-parse.js.
- Corrected the parser to use the supported PDFParse v2 API, preserving metadata extraction where available and guaranteed parser cleanup.
- Correction commit: e77ba3748285840af36d98c8c23475f58588f95a.
- This is a bounded runtime-compatibility correction only; I-6 scope and external verification/deployment gates remain unchanged.


## 2026-10-08 — I-3 bounded Action Runner continuation
[architect-verified] Without waiting for GitHub Actions, Vercel, Gate-C, or Gate-D, ChatGPT continued the active I-3 Action Runner source acceptance track. Two concrete defects were corrected: (1) redirect validation now preserves typed EGRESS_BLOCKED failures for private/loopback redirect targets instead of relabeling them REDIRECT_BLOCKED (`42527f0a2c83e8b7d3d6baa5fd70c8d1c2dd7d78`, regression `e74b9f6f1e82102474ccb53c56da3931fde3fdd6`); (2) strict action validation now rejects supplied props when no usable action schema exists, while preserving empty-props and non-strict compatibility (`d6bdaa4238b9694430a4a484af2eb480f28fa5eb`, regression `d90a314df428bd13d18a6655a81bd498945d549e`). I-3 remains IN PROGRESS; external execution evidence is deferred by owner instruction. Next bounded work remains deterministic result propagation, remaining strict schema edge cases, egress/redirect invariants, redacted trace invariants, and tenant-isolation regression review.


## 2026-10-10 — FIX-01 canonical OAuth callback setup

- **Symptom:** Platform Admin → Integrations → OAuth setup showed `https://your-domain/api/.../callback` and instructed the administrator to register a URI that was not actionable.
- **Root cause:** The UI exposed a generic editable placeholder rather than deriving the deployment origin plus the existing shared callback path `/api/integrations/oauth/callback`. Its warning text was stale: OAuth start/callback, one-time state handling, token exchange and encrypted connection persistence already exist in source.
- **Doable reference:** The Doable integration documentation describes platform-managed OAuth credentials, environment fallback, clear distinction between sign-in OAuth and integration OAuth, exact callback registration, source/status badges and a Connect Test. Clara's existing source uses a shared callback endpoint, so this correction preserves that architecture rather than copying Doable's different per-integration callback URL scheme. References: https://docs.doable.me/setup/integrations/ and https://docs.doable.me/for-platform-admins/first-time-setup/.
- **Correction:** `src/features/admin/screens/platform-integrations-screen.tsx` derives `window.location.origin + /api/integrations/oauth/callback` when no saved URI exists, displays it read-only with copy affordance, and replaces stale warning copy with ordered setup steps and honest save-vs-connect semantics.
- **Server validation:** `src/modules/integrations/oauth-app-validation.ts` now requires the canonical callback path and rejects query strings/placeholders while preserving HTTPS requirements and local loopback HTTP for non-production. `oauth-app-validation.test.ts` has focused regression cases.
- **Commits:** UI `8c64ed818fdfb1185472ec62f74d3f9e1d79ae25`; validation `c12071271a9c79870b93093ce78375ddab96b4bd`; regression source `3bb395bef2069d39dd4cf80b9261b73400a99c52`.
- **Failed approaches / prevention:** Do not use generic host/path placeholders or claim the OAuth lifecycle is unimplemented when the routes exist. Callback generation must stay aligned with the server route and server validation must independently enforce the same contract.
- **Evidence class:** Source inspection + committed source/regression changes. No tests, typecheck, build, browser, live OAuth consent/token exchange, deployment, or runtime verification was run. No PASS inferred.
- **Next action:** Continue bounded OAuth configuration UX against actual Doable source when the repo source path can be inspected; consider registry-backed provider-console links and source-derived scopes. Route schema/deployment failures to OPS-01; do not wait for DEV-01/CI/Vercel.


### FIX-01 Doable source-library comparison — 2026-10-10
- Follow-up source inspection succeeded in `Rilan-Dev/Doable`: `services/api/src/integrations/oauth2.ts`, `services/api/src/routes/integrations-oauth.ts`, and `services/api/src/routes/integrations-admin.ts`.
- Doable derives its public API origin separately from its internal API URL, documents the exact OAuth callback and Google console setup, supports `INTEGRATIONS_OAUTH_REDIRECT_URI` for reverse proxies/tunnels, resolves credentials in DB → per-integration env → shared Google/GitHub env order, strips secrets from admin responses, and distinguishes global/workspace/env-configured app sources.
- Clara adaptation in this bounded fix: use the browser-visible deployment origin for the callback shown in platform UI, keep the shared Clara callback route, validate the same route server-side, and clearly separate saving credentials from end-user consent. No Doable implementation was copied byte-for-byte because its route and database architecture differ.
- Remaining gap vs Doable: Clara's admin screen still does not surface credential source badges/env fallback or a platform-admin Connect Test; these are follow-up scope items, not claimed implemented.


## 2026-10-10 — FIX-01 OAuth provider guidance and credential readiness follow-up

- Added official provider-console links and provider-specific callback/scope setup notes in `src/modules/integrations/oauth-setup-guides.ts`; unknown provider IDs return `null` rather than a fabricated console link. UI helper extracted from the admin screen and covered by `oauth-setup-guides.test.ts`.
- OAuth-app GET now reports a safe `credentialSource` (`database` / `unconfigured`) and `secretConfigured` boolean. No encrypted secret value is read or returned by the GET handler. UI refreshes these indicators after a successful save.
- Decision: keep environment fallback out of scope for now. The active platform OAuth app implementation is encrypted-database based; a fallback would create a second credential authority and requires explicit precedence, rotation, audit, and operations design first.
- Commits: `7fb942255f2dd3daf13e9a9e32270d70ff02938c`, `f1ebf20ef6242204ccb144b570f0ace5a874e052`, `9652855d4408737f3a6930f02caced07002eb65f`, `3a0a3e8864f0497facd85626b22e537a8225e1df`, `c55294c100647b9d3287503a7909197aa0960c85`, `f97140906cc4c63e7840d007e2a5d3c5b42ba986`.
- Tests were authored but not run. This session has no local checkout and `git ls-remote` failed because outbound GitHub DNS resolution is unavailable; do not record this as a test failure. No lint, typecheck, build, browser, live OAuth, deployment, or runtime verification was performed.
- Next: run focused OAuth tests in a checked-out workspace; then test real provider consent/callback/token exchange and route deployment/schema issues to OPS-01. I-096 stays OPEN.

- Additional commit `427383ea8f0f4c13b1c38991da5e24b9ed28a1dd` adds explicit scope guidance for integrations whose registry default scopes are empty. Verify provider-specific permission requirements before live authorization.

## 2026-10-11 — Agent integrations page UX correction (platform filter + MCP tool density)

- Owner-reported UI defects on /orgs/:orgId/agents/:agentId/integrations: the full integration catalogue (171 entries, all platform-disabled) rendered as cards, all 39 n8n MCP tools rendered flat with the page becoming an endless scroll, and every row badged "Organisation grant required" without distinguishing platform enablement, plan entitlement, organisation connection, or organisation tool grants.
- Corrected `src/app/api/orgs/[orgId]/agents/[agentId]/integrations/route.ts` GET: catalogue is now filtered to platform-enabled integrations, with organisation- or agent-granted items retained so stale access stays visible and revocable; response now carries `platformEnabled`, `planAllowed`, and `plan.id` for accurate UI gating.
- Corrected the same route's PATCH to allow grant revocation after platform/organisation disablement (mirrors the MCP route's `enablingAccess` boundary); enablement still requires platform + organisation + plan.
- Rebuilt `agent-mcp-tools-panel.tsx`: collapsible server cards (collapsed by default — connection status, tool count, agent-grant count chips), readiness gate chips (Platform / plan / connection / org grants), blocking-cause banner with a link to Organisation → Integrations, tool search, `max-h-[26rem]` bounded tool list, per-tool agent-grant switches with reason tooltips, and bulk Grant-all-available / Revoke-all.
- Rebuilt `agent-integrations-screen.tsx`: tiered-model explainer, loading/empty states, per-card status that names the exact failing gate (platform disabled, plan not entitled, org enablement required, credentials not connected) with actionable guidance, and an enabled-agent counter.
- Verification at current head (local, no CI/Vercel awaited): vitest — 10/10 agent-integrations route tests (4 pre-existing entitlement tests, 6 new: catalogue filter, revoke-under-disable, enable rejection, plan-allowed flag, cross-org rejection; plus fixing a pre-existing mock-shape failure where requireAuth was mocked without `user.id`), 7/7 mcp-servers route tests; tsc typecheck clean for all touched files (78 pre-existing unrelated errors remain in the worktree); eslint CLI is broken worktree-wide (typescript-eslint vs TS 7.0.2) — pre-existing, not introduced.
- Added `scripts/render-check-agent-integrations.cjs` (tsx + happy-dom) which mounts both screens with an n8n-like 39-tool payload: 24/24 structural render checks pass, including collapsed card showing zero tool rows, expanded card showing all 39 tools with 39 switches, gate chips, search, bulk actions, and guidance copy for every status tier.
- Worktree env note: `@tailwindcss/postcss` and `vite@7` were missing from local node_modules (vitest could not boot); installed with `npm install --no-save` to run the suite. `package.json`/lockfile unchanged and uncommitted.
- Implementation commit: `072aa460`. No CI/Vercel/Gate execution was awaited; no unrelated scope started.

## 2026-10-11 — Organisation portal integration flow consolidation (org screen retirement, separate MCP screen, direct connect)

- Owner-directed flow change: the organisation portal must NOT host a standalone organisation-wide integrations screen (org users do not want to browse the available-integration catalogue or platform-disabled states there). Integration access for plan-covered integrations now flows entirely through each agent's Integrations screen.
- Retired `/orgs/:orgId/integrations`: the page now server-side redirects to `/orgs/:orgId/agents` (bookmarks survive); deleted `org-integrations-screen.tsx`, `org-mcp-servers-panel.tsx`, and `agent-mcp-tools-panel.tsx` (all functionality relocated, no remaining importers).
- Rebuilt `agent-integrations-screen.tsx` as the single connection surface: organisation admins connect credentials directly on the agent screen (credential dialog with custom fields + OAuth reference, or interactive OAuth consent via `oauth/start?agentId=`), reconnect expired/error accounts, and disconnect (clears both org-wide and agent-scoped connections). Enabling an agent grant implicitly creates the organisation grant first (POST enable → PATCH agent), so no separate organisation screen is ever required.
- Plan-blocked or platform-disabled integrations now show exactly "This integration is not available for your plan." instead of the previous credential/organisation nag chain; previously granted items remain listed so access stays revocable.
- New separate MCP screen: `/orgs/:orgId/agents/:agentId/mcp` (`agent-mcp-screen.tsx`, nav label "MCP Tools", Cable icon in the agent sidebar section) — the Integrations screen no longer embeds MCP content. The MCP list is deliberately minimal (icon, name, status chip, tool count, granted count — no endpoint, description, or tool rows), ChatGPT/Claude-connectors style; clicking a row opens a full detail modal with description, copyable endpoint, auth mode, readiness gates (Platform / Plan / Connection / Org tools), connection actions (Connect / Update credentials / Test connection with live probe result / Disconnect), tool search, bulk Grant-all / Revoke-all, and per-tool agent-grant switches that auto-create the organisation tool grant when missing.
- `GET /api/orgs/[orgId]/agents/[agentId]/integrations` now returns `connectionStatus` (connected/expired/error/revoked/disconnected) and `connectionUpdatedAt` per integration (aggregated the same way as the org route) so the direct-connect UX can offer reconnect instead of a dead connect button.
- OAuth callback redirects: consent flows started from an agent return to that agent's Integrations screen (`integrationReturnUrl` now takes the state's `agent_id`); org-level starts land on the agents list. The agent Integrations screen parses the `?oauth=` return parameters and surfaces connected/cancelled/error notices.
- Fixed two stale tests in `src/app/api/orgs/[orgId]/integrations/route.test.ts` that pre-existed at origin HEAD: the disable/connect flows gained org-slot advisory-lock transactions in an earlier commit, so mock sequences needed the lock call inserted and call counts corrected (disable: 3 queries; limit-rejection: 4 queries).
- Verification at current head (local, no CI/Vercel awaited): vitest — 11/11 agent-integrations route tests (10 prior + 1 new connectionStatus/recency test), 9/9 org-integrations route tests (2 stale mock-sequence fixes), 7/7 mcp-servers route tests, 5/5 OAuth callback tests (1 new agent-return redirect test); `scripts/render-check-agent-integrations.cjs` rewritten for the new screen pair — 31/31 structural checks pass (plan-blocked messaging without the credentials nag, no org-screen links, no MCP region on the Integrations screen, minimal MCP list with no endpoint/tool dump, detail modal with all 39 tools, 39 switches, gates, search, bulk actions); tsc typecheck clean for all touched files (151 pre-existing unrelated errors remain worktree-wide, including a pre-existing `mcp-tool-bridge.test.ts` `resolver` name error and 2 stale layout-primitives assertions from the earlier stylesheet-token migration).
- Worktree env note: `@tailwindcss/postcss`, `vite@^7`, and `happy-dom` remain missing from local node_modules after fresh clones; reinstalled with `npm install --no-save` to run the suite (npm prunes prior --no-save extras when a new one is added — reinstall all three together if tests fail to boot). `package.json`/lockfile unchanged and uncommitted.
- Deployment of these UI changes to clara.ai.amazetechclans.com follows the existing branch pipeline; no CI/Vercel/Gate execution was awaited and no unrelated scope was started.
- Implementation commit: `f830113d` (rebased onto 95861a63; pushed to origin/feature/ai-core-from-doable-source). No CI/Vercel/Gate execution was awaited; no unrelated scope started.

---

## 2026-10-12 — Organization-owned MCP + plan entitlements implementation START

[owner-authorized] New implementation directive: complete organization-owned MCP product, Platform Admin-configurable plan MCP entitlements, subscription validation, usage enforcement, global governance, agent permissions, Chat/realtime runtime integration, security controls, and regression tests. Branch `feature/ai-core-from-doable-source`, worktree `/home/z/my-project/.worktrees/vc`.

- Inspected: plan system (`subscription_plans`/`subscription_plan_versions`/`org_subscriptions`, plan-guard resolver), integrations control plane (migrations 060-068), auth RBAC, MCP tool bridge (`ENABLE_MCP` flag), SSRF egress policy (`assertSafeEgressUrl`), chat/realtime tool surfaces, admin shell navigation, settings nav, subscriptions plan editor.
- Implementation starting with centralized entitlement module + migration, then platform admin configuration, org-owned MCP APIs/UI, runtime integration, metering, tests, docs.

## 2026-10-12 — Organization-owned MCP + plan entitlements — implementation complete at source level

[owner-authorized] Executed the full 2026-10-12 directive on `feature/ai-core-from-doable-source` (worktree `/home/z/my-project/.worktrees/vc`).

Work log:
- Inspected plan/subscription architecture (plan-guard resolver semantics), integrations control plane (060–068), auth RBAC, Unified Tool Runtime, chat/realtime tool surfaces, SSRF egress policy, admin shell navigation, plan editor.
- Added migration `069_mcp_organization_owned_endpoints.sql` (additive): `mcp_entitlements` JSONB on plans + versions, `mcp_platform_settings` singleton, `org_mcp_connections`, `org_mcp_tools`, `org_mcp_agent_grants`, `mcp_tool_usage_log`, `org_mcp_overrides`, `org_mcp_audit_log`, `mcp_platform_audit_log`.
- Created `src/modules/mcp/`: `entitlements.ts` (centralized schema + authoritative resolver: global ∩ plan ∩ subscription ∩ overrides, fail-closed, system safety maxima), `client.ts` (Streamable HTTP JSON-RPC handshake/discovery/invocation; HTTPS + SSRF per-hop + bounded redirects/timeouts; implemented auth methods only), `metering.ts` (period quota + per-minute rate limit with advisory-lock admission), `audit.ts` (sanitized projections), `service.ts` (full lifecycle with per-operation entitlement enforcement + invocation-time reauthorization).
- Platform admin APIs: `/api/platform/mcp-settings` (typed confirmations for disable/emergency), plan MCP entitlements in `/api/platform/subscription-plans` (validated centrally, audited, `DISABLE-PLAN-MCP` confirmation), `/api/platform/orgs/[orgId]/mcp-override` (reason + expiry, audited).
- Org APIs: `/api/orgs/[orgId]/mcp/overview|connections|connections/[id](+test|tools|credentials|activity|agents)` and `/api/orgs/[orgId]/agents/[agentId]/mcp-tools` — org-scoped, entitlement-enforced.
- UI: reworked org Integrations hub (quota stats, search/filter/sort cards, actions, denial/empty/loading/error states; catalog connect flow preserved under collapsed section with OAuth callback banner restored); 5-step Add-MCP-server wizard; connection detail (5 tabs); agent MCP tools screen; billing MCP usage card; plan editor MCP section; platform MCP governance screen; billing-drawer MCP entitlements + override panel; nav links (org Integrations, agent MCP Tools).
- Runtime: `mcp_availability`/`mcp_tool` registered on `buildClaraToolRuntime`; chat + realtime advertise them only while `ENABLE_MCP` is on; realtime allowlist extended; invocation re-authorizes entitlement/connection/approval/grant + quota/rate-limit and meters both outcomes.
- Tests: 91 new focused tests (all passing) across entitlement validation/resolution, metering, client transport, org/platform APIs, runtime reauthorization, governance guards. Full suite: 1334 passed / 50 failed == pre-change baseline (stash-diff verified; zero new failures; the one interim layout-contract regression was fixed in-session).
- Docs: `docs/plans/mcp-organization-owned-endpoints.md` created; PROJECT_STATE / NEXT_ACTION / VERIFICATION_STATE / worklog updated.

Stage summary:
- All directive sections implemented at source level except items requiring live infrastructure (migration application on a deployed database, live MCP handshake over the network, live chat/voice execution) — explicitly recorded as unverified, not claimed as PASS.
- `ENABLE_MCP` remains OFF; enabling requires the evidence list in the plan doc §9.
- No destructive operations, no secrets exposed, no mocks substituted for real functionality; catalog functionality preserved.

---

## 2026-10-12 — PR #291 reconciliation (Super Z)

- Reconciled PR head `7b5274d0` with target `bb51d091` (merge base `5b66f54b`) on `feat/mcp-org-owned-directive`; 13 textual conflicts resolved semantically.
- Migration renumbered to `073_mcp_organization_owned_endpoints.sql` (duplicate-number runner hard-fail avoided; RLS + role revokes added to match 069 conventions).
- Runtime unified: removed the global `mcp_availability`/`mcp_tool` meta-tool registration; org-owned tools now advertised and executed through the request-scoped Unified Tool Runtime via `OrgMcpToolResolver` + composite resolver (`src/modules/mcp/runtime-resolver.ts`); chat/realtime/realtime-tool share one authorization and metering path with the platform catalog.
- UI reconciled: `/settings/mcp` = catalog servers (target), `/settings/mcp/governance` = governance (PR); agent MCP screen unified with both sections; org Integrations hub restored at `/orgs/:id/integrations`; agent integrations screen/route kept the target's superset versions.
- Docs: plan doc, NEXT_ACTION, VERIFICATION_STATE merged with both histories plus reconciliation entries.

---
Task ID: 2
Agent: main (Super Z)
Task: Fix all remaining docker-log errors — relay CONNECTING-close noise, brain provider failures not reaching platform admin, broken email delivery invisible (branch feature/ai-core-from-doable-source)

Work Log:
- Verified prior fixes live and working: the user's quoted "re-index started automatically" message confirms embedding self-heal (e481935c) fires in production; 7952f147 catalogues + ai-health cron confirmed present.
- Root-caused [sarvam-tts-relay] upstream error from ws@8.18.3 source: close() AND terminate() on a CONNECTING socket both call abortHandshake() → synthetic "WebSocket was closed before the connection was established" error on nextTick. Every teardown racing a pending vendor handshake logged it; a hung handshake (user's api.vendor.ai proxy) also parked silently in CONNECTING.
- NEW scripts/ws-lifecycle.mjs (shared): closeUpstreamSocket (terminate + __relaySelfClosed marking for CONNECTING/CLOSING, clean close for OPEN), safeWsHost, armHandshakeTimeout (10s fail-fast, actionable host in browser error), isSelfClosedSocket/isHandshakeTimedOut filters.
- Hardened all relay legs: sarvam-tts-relay + elevenlabs-relay TTS (handshake timeout, quiet filters, CONNECTING-safe interrupt, host-bearing errors, bounded reconnect preserved), elevenlabs-relay STT + sarvam-relay (CONNECTING-safe closeBoth + quiet error filters). voice-relay already safe (OPEN-guarded closes).
- Closed the "issue was not captured" gap for the ANSWER ENGINE: incidents.ts adds recordBrainRuntimeFailure (classifies 401/403 → critical credential guidance, 429 → recharge, model-not-found, network/timeout; aborts never recorded) + noteBrainRequestSucceeded auto-recovery. Wired into assistant chat (KB + document modes) and embed widget chat catch/finally paths with provider/model context. health-alerts routes ai-brain:* → Settings → AI Platform.
- Email-delivery meta-monitoring: notifyAdmins records email-delivery:{provider} incident on failed sends WITHOUT emailing about it (opts.notify=false on recordRuntimeIncident/syncSingleHealthIncident — no recursion; loop-safety verified by test), auto-resolves on next delivered email; banner routes to Settings → Email Delivery. Fixes the invisible broken Resend key.
- OAuth callback origin mismatch: code does NOT exist in this repo/branch (grep for state-bound/redirect URI handling = empty) — comes from the user's local env or an external service; cannot be fixed here (noted to user).
- Fixed test-stub breakage: embed/chat used provider.getProviderName() (stub lacks it) → switched to resolved.provider.
- Validation: node --check all relays; 23 new tests pass (ws-lifecycle semantics 9, brain incidents 8 incl. no-recursion email guard, metering 6); full-suite normalized diff vs baseline = ZERO new failures; tsc diff vs stashed baseline = ZERO new errors. Staged via untracked fix-stage/ + re-runnable apply.sh (sandbox resets to main between tool calls).

Stage Summary:
- Commit 6ce57a51 pushed to origin/feature/ai-core-from-doable-source (10 files, +740/−92).
- After pulling + docker compose up -d --build: relay log noise gone; hung Sarvam base URLs fail fast with "Sarvam TTS endpoint (api.vendor.ai) is not responding — check the provider base URL"; ANY brain 401/429 now drives the super-admin banner + email within minutes (rate-limited); broken email channel surfaces as its own incident.
- User action items (env, not code): fix RESEND_API_KEY or switch to SMTP (Settings → Email Delivery); fix or replace the dead OpenAI key for chat/brain (or switch brain provider); switch SARVAM_BASE_URL off the api.vendor.ai proxy to https://api.sarvam.ai if TTS WS is unreachable; the OAuth callback origin error is not from this repo — check the external integration service.

---
Task ID: 3
Agent: Super Z (main agent)
Task: Post-79130557 docker logs: Gemini embedding still failing ("fetch failed"), re-index still building with gemini-embedding-001 instead of the promised gemini-embedding-2-preview, /api/chat 502 dead-end while the backbone is down — fix all on feature/ai-core-from-doable-source.

Work Log:
- Diagnosed against the branch tree (sandbox flaps between a main-view and a feature-view; every command re-checks out the branch defensively; learned the tool-output renderer eats "[m"-style sequences, so grep -c NUMBERS are the only trusted display).
- Root causes found: (a) egress dispatcher had no explicit autoSelectFamily — on runtimes without the Node 20+ happy-eyeballs default an IPv6 blackhole becomes a 10-20s connect timeout that looks exactly like "Gemini down" while api.openai.com works; (b) targetForIndex resolved the re-index target through the tenant-level embeddingCandidate chain, so a stale org/version pin (gemini-embedding-001) beat the platform embedding default the self-heal notice names; (c) /api/chat threw ChatRetrievalError → 502 on every turn while /api/embed/chat already degraded gracefully — inconsistent surfaces; (d) [vs-kb] retry logs printed only "fetch failed" with no cause-chain detail.
- Implemented (scripts/apply_fixes_batch2*.py, all assertion-anchored, re-runnable):
  - egress.ts: dual-stack connect (autoSelectFamily: true, 500ms attempt window) on BOTH the direct Agent and EnvHttpProxyAgent; log line now states dual-stack.
  - GeminiProvider: GEMINI_BASE_URL relay (httpOptions.baseUrl via @google/genai 2.28) for networks that cannot reach generativelanguage.googleapis.com; invalid values warn-and-ignore.
  - vector-store-kb.ts: embeddingFailureDetail() unwraps undici cause chains (describeNetworkError) — retry log + final error + document error_messages now name the host/failure mode and the HTTPS_PROXY / GEMINI_BASE_URL remediation.
  - embedding-index.ts targetForIndex: NEW standard indexes realign to the platform embedding default model when its provider matches (console.warn on realignment); tenant pins keep effect only when no platform default is set.
  - chat.ts: retrieval failure degrades — incident recorded, audit row kept alive, ungrounded answer, model-facing system notice, retrieval_degraded stream event; CHAT_STRICT_RETRIEVAL=1 restores the 502. embed/chat's silent degradation now records an incident.
  - chat-stream.ts: onRetrievalDegraded callback + retrieval_degraded case (unknown events remain no-ops for older surfaces).
  - NEW retrieval-degradation.ts (+4 tests), egress-dispatcher.test.ts (+3), gemini-embedding-2.test.ts +2 (GEMINI_BASE_URL), reindex.test.ts +2 (realignment, no-default fallback).
- Verified: npm run type-check GREEN; targeted suites 18+26+32 pass; full suite 19 failing files == the documented pre-existing baseline (zero new failures).
- Committed 304e6fbb and pushed to origin/feature/ai-core-from-doable-source only. Fresh-clone verification from GitHub (numeric grep assertions) confirms every fix landed; docs/project-control/NEXT_ACTION.md updated with the batch entry.

Stage Summary:
- Deliverable: commit 304e6fbb "fix(rag): embedding reachability knobs + platform-default index alignment + chat retrieval degradation" (13 files, +409/−22).
- Expected user-side behavior after pull + docker compose up -d --build:
  1. If the Gemini timeouts were an IPv6 blackhole, embedding starts working with no env change (happy-eyeballs now explicit).
  2. If the network is genuinely blocked, /api/chat now ANSWERS (ungrounded, with a visible notice) instead of 502, and [vs-kb] logs name the exact unreachable host + remediation (set HTTPS_PROXY, or GEMINI_BASE_URL to a reachable relay).
  3. Any NEW re-index builds with the platform default gemini-embedding-2-preview — notice and index can no longer disagree.
  4. Quickest full recovery is still env-side: fix the OpenAI key (the live collection is OpenAI-built; retrieval resumes instantly) or give Gemini a reachable route.
- Remaining known items (not this batch): RESEND_API_KEY invalid (admin emails; in-app incidents still work), Sarvam base URL api.vendor.ai → https://api.sarvam.ai, Sarvam half-canvas Models 0 / Voices 0, ElevenLabs STT/STS realtime model listing.

---
Task ID: 4
Agent: Super Z (main agent)
Task: User pulled 304e6fbb ("Already up to date", nothing new on GitHub) — confirm push state, then fix the remaining log-error classes on feature/ai-core-from-doable-source.

Work Log:
- Verified push state: local feature branch == origin == 304e6fbb (commits 79130557 + 304e6fbb from 2026-10-14 were the last pushes; the previous session ended right after, so "no changes on GitHub" was expected). Answered the user accordingly.
- Cleaned sandbox git state: resolved the stuck mid-merge worklog.md on local main (local-only commit, NOT pushed), restored the 906-line worklog on the feature branch, backed it up as worklog.backup.md (untracked).
- Root-caused four remaining code-side gaps: (a) /api/chat Mode B (document chat) threw ChatRetrievalError → 502 on embedQuery/searchSimilarDocuments failure — no degradation, unlike Mode A; (b) resolver.ts realtime_voice modelKinds omitted 'sts' so STS rows never reached agent pickers; (c) live-catalog syncElevenLabs aborted ENTIRELY on vendor fetch failure (curated STT/STS rows never landed) AND the curated STS fallback was dead code (stsModelIds pre-seeded with fallback ids) AND runSync read env keys before DB-settings hydration (cold-start "Models 0 / Voices 0"); (d) ai-health cron Gemini probe hardcoded generativelanguage.googleapis.com (ignored GEMINI_BASE_URL relays) and its 10s timeout could abort before a raised EGRESS_CONNECT_TIMEOUT_MS (false "backbone down" incidents).
- Implemented: Mode B graceful degradation (ungrounded answer + retrieval_degraded event + system notice + incident + strict-mode opt-out); resolver 'sts' kind; live-catalog env hydration before sync + vendor-failure-resilient curated rows + live STS fallback fix; new shared embedding-probe module (geminiEmbeddingBaseUrl + embeddingCheckTimeoutMs) used by the ai-health route.
- Tests: new embedding-probe.test.ts (8), live-catalog.elevenlabs.test.ts (2 — the second one caught the dead STS-fallback bug), resolver.test.ts +1 sts case; targeted 26/26 pass; adjacent sweep (ai-governance + assistant + egress + ai-settings-options) 171/172 with the single failure (realtime-tool) verified pre-existing on stashed HEAD. npm run type-check GREEN (one interim t0-scope error in Mode B fixed). Installed @tailwindcss/postcss --no-save to boot vitest (per prior session notes).

Stage Summary:
- Deliverable: this batch's commit on feature/ai-core-from-doable-source only.
- Expected user-side behavior after pull + rebuild: (1) document-mode chat ANSWERS instead of 502 while the embedding backbone is down; (2) realtime voice model pickers list ElevenLabs STT (Scribe) + STS (conversational) models — and they appear even while api.elevenlabs.io is unreachable; (3) Sarvam/ElevenLabs half-canvases populate for DB-configured keys on a cold container; (4) the 15-minute ai-health monitor probes GEMINI_BASE_URL relays and no longer false-alarms on slow routes.
- Embedding backbone recovery itself remains env-side on the user's host (network to generativelanguage.googleapis.com blocked): fix/replace the dead OpenAI key (api.openai.com IS reachable — fastest path), or set HTTPS_PROXY / GEMINI_BASE_URL, or raise EGRESS_CONNECT_TIMEOUT_MS. RESEND_API_KEY is still invalid (emails fail; in-app incidents + banner work).

---
Task ID: 5
Agent: Super Z (main agent)
Task: Remaining items from the user's list: Sarvam api.vendor.ai → api.sarvam.ai, Sarvam Models/Voices half-canvas resilience, ElevenLabs STT/STS listing verification — all on feature/ai-core-from-doable-source.

Work Log:
- Verified batch 3 (26304c95) already delivered the catalogue side of the user's items: resolver modelKinds include 'sts' (agent pickers), curated Scribe STT + STS rows land even on vendor outage, DB-key hydration before sync. This batch closes the remaining root causes instead of redoing that work.
- Root-caused api.vendor.ai: it is the ProvidersWorkspace Base URL field's old PLACEHOLDER example — a dead domain (NXDOMAIN verified; api.sarvam.ai resolves) that leaked into live SARVAM_BASE_URL configs and silently broke Sarvam chat/TTS-REST/TTS-WS/STT/catalogue discovery with connect timeouts reading as "Sarvam down".
- voice-core/model-catalog.ts: NEW shared normalizeProviderBaseUrl (unset/blank → official endpoint, bare host → https:// prefix, exact api.vendor.ai host → official endpoint + loud warning; junk passes through for loud debuggability) + isPlaceholderProviderBaseUrl + PROVIDER_BASE_URL_PLACEHOLDER_HOST. getSarvamBaseUrl and getElevenLabsBaseUrl route through it.
- language-core/model-catalog.ts getSarvamLanguageBaseUrl + ai-governance live-catalog syncSarvam/syncElevenLabs reuse the same normaliser — env, DB rows, relays (cfg.baseUrl from realtime-init) and discovery all agree. The user's live env heals with zero env changes after rebuild.
- Save-boundary guards: providers.ts credential handler + platform env route reject the placeholder value with actionable 400 BASE_URL_PLACEHOLDER. ProvidersWorkspace placeholder is now provider-aware (api.sarvam.ai / api.elevenlabs.io) + "leave empty for official endpoint" hint; PlatformEnvPanel SARVAM_BASE_URL hint names the dead placeholder.
- Keyless curated canvases: syncSarvam + syncElevenLabs land curated rows + defaults even with NO API key (no fetch, no reconciliation, no false ai-catalog incident — runSync now skips the incident when a provider reports no vendor contact; openai/gemini keyless no longer record a false "succeeded" incident either).
- Tests: model-catalog.test.ts +6 (placeholder rewrite incl. bare-host/trailing-slash shapes, ElevenLabs rewrite, passthrough semantics, save-guard detection incl. lookalike-host negative), NEW live-catalog.sarvam.test.ts (2: keyless curated canvas — models/voices/defaults land, zero fetch, zero incidents; discovery probes api.sarvam.ai despite api.vendor.ai env), live-catalog.elevenlabs.test.ts +1 keyless case (mock updated to spread the real voice-core module so the shared normaliser stays real).
- Validation: npm run type-check GREEN; targeted 46/46; consumer sweep 21/21; full suite 1604 passed / 30 failed in 19 files — JSON-reporter failing-file list byte-identical to the stashed-baseline run (the only delta is this batch's own new test file failing on stashed source by design): ZERO new failures.

Stage Summary:
- Deliverable: this batch's commit on feature/ai-core-from-doable-source only (10 files: 6 source, 3 test, 1 new test + docs).
- Expected user-side behaviour after pull + docker compose up -d --build: (1) the existing SARVAM_BASE_URL=https://api.vendor.ai env stops mattering — every Sarvam call (chat, TTS REST+WS, STT, catalogue discovery, connection test) goes to https://api.sarvam.ai with a one-line console warning naming the fix; (2) Sarvam half-canvas shows Models AND Voices (curated, keyless-safe) and ElevenLabs realtime canvas lists Scribe STT + STS rows even before any key is saved; (3) saving the placeholder URL anywhere gets an actionable rejection instead of a silently dead endpoint.
- Still env-side on the user's host (unchanged): remove/fix SARVAM_BASE_URL in .env to silence the warning (optional now), fix RESEND_API_KEY or switch SMTP, fix/replace the dead OpenAI key, and give the Gemini embedding backbone a reachable route (HTTPS_PROXY or GEMINI_BASE_URL) — /api/chat degrades gracefully meanwhile.

---
Task ID: 6
Agent: Super Z (main agent)
Task: Validate the pushed RAG reranking continuation (fbb7de00..7ff67ef5) on a real checkout: real Vitest, full type-check, correct discovered regressions, then live Docker TEI deployment with measured latency evidence before any production enablement.

Work Log:
- Real verification (the prior session ran only source-level smoke assertions): focused suite FAILED to even load grounding.test.ts — grounding.ts:486 used an `as` type assertion on a NEW LINE after the closing brace. TypeScript grammar forbids a line terminator before `as`; tsc (TS1005), esbuild/vite and therefore vitest all reject it, and the production `next build` SWC parse would fail the Docker image build (the host had been deployed at 0effd65c, which contains this latent build-breaker — it only ran because the already-built image predated the bad commit). Fixed by moving `as` onto the closing-brace line; repo-wide scan confirmed it was the only instance.
- rerank.ts carried 11x TS2322 (unconstrained generic T not assignable to Reranked<T> = T & { rerankScore?: number }): fallback/tail now carry explicit assertions documenting the optional-marker invariant. Docker builds skip tsc (CLARA_SKIP_TYPECHECK=1), so these would have rotted silently.
- Evidence: focused 49/49 (rerank 10, grounding 25, reference-evidence 5, reference-recovery 5, diversify 4); full sandbox suite 2181 passed / 40 failed in 21 files, failure set byte-identical to the pre-reranking baseline 17e20c1f (2135/40 in the same 21 files — all pre-existing sandbox env debt: partial node_modules, pdf-parse v1.1.1 vs ^2.4.5, parent-project module leakage) — ZERO new failures, +46 new tests all green; rag module now 0 type errors (remaining 40 are in untouched files).
- Committed 11c013c7, pushed, deployed to the host: backend+worker rebuilt and recreated, /api/health 200.
- Live TEI deployment (memory gate: 5.3GB available > 2560M limit; 6 cores): the compose DEFAULT model Alibaba-NLP/gte-multilingual-reranker-base CANNOT be served by text-embeddings-inference:cpu-1.9 — the repo ships no ONNX weights (ORT backend errors), and the candle fallback crash-loops without ever binding port 80 (RestartCount 13+, "Could not find a Sentence Transformers config" then silent death). Probed ONNX availability across candidates; switched to mixedbread-ai/mxbai-rerank-base-v1 (multilingual, ONNX, Apache-2.0): TEI reached Ready in ~2min, ~1.22GiB resident / 2.5GiB limit, 1.3GB model cache.
- Live inference verified: official in-network probe scripts/probe-rag-reranker.mjs PASS ("endpoint responded, scores complete, relevant evidence ranked first"). Fallback bounds measured from inside the backend: dead port -> ECONNREFUSED fallback in 80ms; unroutable IP -> TimeoutError at 1502ms, exactly the code's 1500ms default clamp.
- Measured CPU latency (6-core host, 2-CPU container cap, ORT, single 12-candidate batch): ~130-char snippets p50 1484ms / p95 1572ms; realistic ~900-char chunks p50 3878ms / p95 4729ms; 30-candidate maximum p50 10015ms / p95 11615ms. CONCLUSION: the 1500ms default RAG_RERANK_TIMEOUT_MS only suits short snippets — with defaults the stage would silently no-op on real chunks. Operators must set RAG_RERANK_TIMEOUT_MS=6000 (+ consider RAG_RERANK_MAX_CANDIDATES=8) or use the GPU image; measurements persisted in the compose comment.
- Two deployability regressions fixed from live findings: (1) compose default model swapped to the verified-working ONNX model + container_name: clara-reranker for platform naming consistency + measured-latency/enablement runbook in the operator comment; (2) Dockerfile standalone copy list omitted scripts/probe-rag-reranker.mjs, so the documented in-container probe procedure crashed with "Cannot find module" — probe now copied into the image.
- Reranker left STOPPED after testing (RAG_RERANK_URL unset in .env — chat/voice retrieval path unchanged in production); TEI image + 1.3GB model cache remain on the host for one-command enablement.

Stage Summary:
- Deliverable: 11c013c7 (syntax + generic-type fixes) plus this batch's compose/Dockerfile/probe fixes on feature/ai-core-from-doable-source; host deployed and healthy at the verified tip.
- Production behavior UNCHANGED for end users (reranking is env-gated off); the branch tip is now actually buildable, type-clean in rag, and its documented deployment recipe actually works end-to-end.
- Remaining before production enablement (deliberately deferred): relevance/citation A/B benchmark on real KB queries with reranking wired via .env, p50/p95 re-measure under production traffic shape, and the dense/sparse hybrid search phase (BM25/SPLADE + fusion) planned separately.

---
Task ID: 7
Agent: Super Z (main agent)
Task: Build the deferred reranker production-enablement gate: an A/B benchmark that measures relevance/citation changes and p50/p95 latency on real KB queries with reranking wired via .env, executable by the operator on the host (sandbox has no docker/SSH to the host in this session).

Work Log:
- NEW scripts/benchmark-rag-ab.mjs (zero-dependency, conventions identical to debug-rag-retrieval.mjs): RUN mode drives the exact authenticated production grounding route POST /api/rag/search -> postRagSearch -> groundClaraContext over a fixed query set (--queries FILE {"questions":[...]} or repeatable --question; exact duplicates removed with a notice). Separates a cache-priming --warmup pass (reported as first-seen latency: cold embedding + config resolution) from --repeat measured passes (percentiles p50/p95 via linear interpolation over latencyMs plus every GroundingTimings stage: metadata/admission/config/translation/retrieval/graph/total). Records per-question source identity (Qdrant point id, documentId, pageNumber, title, Qdrant score), within-run source/context stability across attempts, grounded flag, context length + 16-hex SHA-256 digest. Output files are shareable by design: no snippets, no assembled AI context, no credentials; auth is env-only (CLARA_DEBUG_TOKEN / CLARA_DEBUG_COOKIE, bare-cookie rejection identical to the probe); output written with flag wx mode 600 and refuses to overwrite. Planned request count (each consumes embedding quota + a RAG audit event) is printed BEFORE the first request; --preflight-auth checks /api/auth/me first; 401/403 aborts the run after one request; <50% measured success or zero grounded questions exits 2 with the first failure diagnostic (status + request-id headers only, never gateway HTML bodies).
- COMPARE mode (--compare baseline.json candidate.json [--out report.json]) aligns runs by exact question text and computes per question: common/onlyBaseline/onlyCandidate sources, overlap@k, jaccard, top1Changed, top3Overlap, Kendall tau over the common-set orderings, mean rank delta, mean |Qdrant score drift| on common sources (validity signal — reranking must NOT change citation scores; drift > 0.005 prints a re-run-both-arms warning because the index/backbone changed), grounded flips, context-hash changes, per-run latency/stage stats. Config mismatch (kbId/topK/mode/scope/channel) is warned so latency deltas are not misattributed. Decision hints printed from the data: identical ordering + latency up; changed top-1 count with a pointer to spot-check each via scripts/debug-rag-retrieval.mjs; retrieval p95 growth vs the RAG_RERANK_TIMEOUT_MS budget.
- Bug-fixed during test bring-up: --compare CLI parsed the flag text instead of the first path; Kendall tau compared the baseline ordering against itself (orderB now derives from the candidate list); attempts rollup crashed on failed requests (sources?.length ?? 0); validity failures now surface the first request diagnostic.
- NEW docs/deployment/rag-reranker-ab-benchmark.md operator runbook: query-set construction from GET /api/analytics/queries top real questions + hand-picked edge cases (exact-clause questions that bypass reranking by design, out-of-scope questions); arm A = default RAG_RERANK_URL-unset state; arm B = compose --profile rerank up + probe-rag-reranker.mjs smoke PASS + .env values consistent with the measured compose comment (RAG_RERANK_URL, RAG_RERANK_ENABLED=true, RAG_RERANK_TIMEOUT_MS=6000, RAG_RERANK_MAX_CANDIDATES=8); identical run knobs across arms; metric interpretation table (top1ChangeRate, overlap/jaccard, tau, contextChangeRate, latency + retrieval-stage deltas, score-drift validity, groundedRate); mandatory top-1 spot-checks with the debug probe before enablement; rollback (unset env, recreate backend, stop TEI — image + model cache stay).
- Verification ACTUALLY RUN this session: node --test scripts/benchmark-rag-ab.test.mjs = 9/9 pass (run-mode contract incl. 6-request plan + auth header + request body shape + warmup separation + percentile/stability fields + shareable-output assertions + overwrite refusal; compare-mode math on hand-built runs incl. tau=1/3 reordering case and 2/3 jaccard new-source case + drift/config-mismatch warnings + non-run-file rejection; 401 single-request abort; 502 -> exit 2 with diagnostics and no HTML/token leak; zero-grounded -> exit 2; bare-cookie rejection; preflight order). Regression sweep: node --test scripts/debug-rag-retrieval.test.mjs 4/4 pass; node scripts/check-feature-docs.mjs OK; focused vitest (sandbox config) rerank.test.ts + grounding.test.ts 35/35 pass. No src/ file was modified in this batch; no build/type-check/CI/Vercel/Gate was run or awaited; the on-host baseline/candidate executions themselves remain operator steps per the runbook.

Stage Summary:
- Deliverable: benchmark harness + self-tests + operator runbook on feature/ai-core-from-doable-source only; production behavior unchanged (nothing shipped touches runtime paths).
- This closes the tooling half of the deferred enablement gate: the relevance/citation A/B and the p50/p95 re-measure under production traffic shape are now executable as a documented two-arm procedure with validity guards (score-drift, config-match, warmup/first-seen separation, stability flags).
- Remaining (unchanged, still deferred): execute the two arms on the host against a real KB and read the report (operator, per runbook), then the enablement decision; the dense/sparse hybrid search phase (BM25/SPLADE + fusion) stays planned separately.
