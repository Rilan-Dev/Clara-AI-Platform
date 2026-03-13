# High-Reliability Web Scraping (Polite Mode)

## TL;DR

> **Quick Summary**: Upgrade the current discovery -> scrape -> ingest pipeline so JavaScript-heavy sites fail far less often under a polite anti-bot boundary. The plan focuses on multi-signal extraction (DOM + XHR/JSON + hydration payloads), classified retries, domain-aware pacing, and benchmark-driven verification.
>
> **Deliverables**:
> - Multi-signal page extractor for SPA-heavy routes
> - Per-URL retry and failure-classification pipeline
> - Domain policy / circuit-breaker / session-reuse layer
> - Benchmark harness and regression coverage for target sites
> - Scrape progress + failure visibility improvements for operators
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 implementation waves + final verification
> **Critical Path**: T1 -> T2 -> T6/T7/T8 -> T11 -> T14 -> T15

---

## Context

### Original Request
Plan a way to scrape 500+ pages with much higher reliability and far fewer failures, especially for JavaScript-heavy SPA pages that currently return shell HTML and fail extraction.

### Interview Summary
**Key Discussions**:
- User wants the system to retrieve as many pages as possible, with a strong preference against page-level failures.
- Anti-bot boundary defaults to **polite only** after the user asked to proceed without choosing a more aggressive mode.
- Reliability improvements should target the scraper itself, not only the queue or UI.

**Research Findings**:
- `clara-backend/src/modules/admin/core/ingest/web-loader.ts` uses a 3-step waterfall: HTTP fetch -> Playwright load -> Playwright scroll.
- Current extraction success is determined almost entirely by rendered DOM text thresholds.
- `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts` marks URLs failed as soon as `loadWebPage()` throws, with no resilient per-URL recovery pipeline.
- Pure SPA detail pages on the target site return shell HTML (`<div id="root"></div>`) and likely hydrate via API/XHR after route load.
- The codebase currently has no explicit fallback for intercepted XHR/fetch JSON, hydration state parsing, or structured data extraction beyond breadcrumbs.

### Metis-Equivalent Review
**Identified Gaps** (addressed in this plan):
- Reliability target must be explicit; this plan defaults to **>=98% successful extraction on benchmark pages not blocked by auth/CAPTCHA**, with deterministic classification for the remainder.
- Guardrails must prevent scope creep into aggressive anti-bot circumvention.
- Acceptance criteria must measure extraction quality, not just “did not throw”.
- Edge cases must cover late-render SPA routes, soft blocks, duplicate URLs, and content hidden in JSON or API payloads.

---

## Work Objectives

### Core Objective
Make the scraping pipeline reliably ingest large SPA-heavy sites under a polite anti-bot boundary by improving extraction depth, retry behavior, session/domain handling, and observability.

### Concrete Deliverables
- Enhanced extractor in `clara-backend/src/modules/admin/core/ingest/web-loader.ts`
- Reliability support modules for extraction results, domain policy, and failure classification
- Scrape worker orchestration improvements in `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts`
- Benchmark/fixture tooling under `clara-backend/scripts/`
- Targeted regression coverage using Playwright and existing `type-check` / `lint`

### Definition of Done
- [ ] Benchmark set for target SPA routes reaches the plan SLO with classified remaining failures
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] Agent-executed browser QA demonstrates successful extraction on representative success and failure cases

### Must Have
- Multi-signal extraction that can use rendered DOM, hydration scripts, JSON-LD, and intercepted XHR/fetch payloads
- Bounded, classified retries with jittered backoff and no infinite loops
- Domain-level pacing and circuit-breaker behavior for soft-blocked sites
- Clear failure taxonomy and evidence capture for every hard failure

### Must NOT Have (Guardrails)
- No CAPTCHA-solving vendor integration
- No stealth-plugin escalation, fingerprint spoofing arms race, or credentialed bypass without separate approval
- No “guaranteed zero-failure” claims in code or docs; remaining hard failures must be explicit and classified
- No broad crawler rewrite outside the existing discovery -> scrape -> ingest architecture

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — verification is agent-executed.

### Test Decision
- **Infrastructure exists**: Partial (`@playwright/test` installed; no standard test script yet)
- **Automated tests**: Tests-after
- **Framework**: Playwright + existing `npm run type-check` + `npm run lint`
- **Agent QA**: Mandatory for every task

### QA Policy
- Frontend/browser validation uses Playwright
- CLI/script validation uses Bash
- Scraper verification uses benchmark manifests, sampled URLs, and stored evidence under `.sisyphus/evidence/`
- Every task includes one happy-path and one failure/edge-case scenario

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately — benchmark + contracts + policy foundations):
├── Task 1: Benchmark corpus + failure taxonomy [unspecified-high]
├── Task 2: Extraction attempt/result contracts [quick]
├── Task 3: Domain policy + session state abstraction [unspecified-high]
├── Task 4: Evidence + structured metrics pipeline [quick]
└── Task 5: Regression harness + scripts [quick]

Wave 2 (After Wave 1 — extraction engine upgrades):
├── Task 6: Wait strategy hardening for SPA routes [deep]
├── Task 7: XHR/fetch interception fallback [deep]
├── Task 8: Hydration/JSON-LD/script extraction fallback [deep]
├── Task 9: Browser/session/resource tuning [unspecified-high]
└── Task 10: Classified retries + jittered backoff [deep]

Wave 3 (After Wave 2 — orchestration + operator resilience):
├── Task 11: Scrape worker retry orchestration [deep]
├── Task 12: Domain circuit breaker + adaptive concurrency [unspecified-high]
├── Task 13: Content quality gates + canonical dedupe [unspecified-high]
├── Task 14: Target-site rule pack + benchmark canary [quick]
└── Task 15: Admin visibility + failure surfacing [quick]

Wave FINAL (After all implementation — independent review):
├── Task F1: Plan compliance audit [deep]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real browser/CLI QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: T1 -> T2 -> T6 -> T7 -> T10 -> T11 -> T14 -> T15
Parallel Speedup: ~60-70% over sequential delivery
Max Concurrent: 5

### Dependency Matrix
- **T1**: blocked by none -> blocks T6, T7, T8, T10, T14
- **T2**: blocked by none -> blocks T6, T7, T8, T10, T11, T13, T15
- **T3**: blocked by none -> blocks T9, T10, T12
- **T4**: blocked by none -> blocks T11, T12, T14, T15
- **T5**: blocked by none -> blocks T14, T15, final verification
- **T6**: blocked by T1, T2 -> blocks T11, T14
- **T7**: blocked by T1, T2 -> blocks T11, T13, T14
- **T8**: blocked by T1, T2 -> blocks T11, T13, T14
- **T9**: blocked by T3 -> blocks T12, T14
- **T10**: blocked by T1, T2, T3 -> blocks T11, T12, T14
- **T11**: blocked by T2, T4, T6, T7, T8, T10 -> blocks T14, T15, final verification
- **T12**: blocked by T3, T4, T9, T10 -> blocks T14, T15, final verification
- **T13**: blocked by T2, T7, T8 -> blocks T14, T15, final verification
- **T14**: blocked by T1, T5, T6, T7, T8, T9, T10, T11, T12, T13 -> blocks T15, final verification
- **T15**: blocked by T2, T4, T5, T11, T12, T13, T14 -> blocks final verification

### Agent Dispatch Summary
- **Wave 1**: T1 `unspecified-high`, T2 `quick`, T3 `unspecified-high`, T4 `quick`, T5 `quick`
- **Wave 2**: T6 `deep`, T7 `deep`, T8 `deep`, T9 `unspecified-high`, T10 `deep`
- **Wave 3**: T11 `deep`, T12 `unspecified-high`, T13 `unspecified-high`, T14 `quick`, T15 `quick`
- **FINAL**: F1 `deep`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Build benchmark corpus and failure taxonomy

  **What to do**:
  - Add a benchmark manifest for representative success/failure URLs (static pages, SPA detail pages, soft-block pages, duplicate/canonical variants).
  - Define a typed failure taxonomy (`spa-shell`, `late-render`, `network-timeout`, `soft-block`, `hard-block`, `parse-empty`, `deduped`, `quality-reject`).
  - Add a benchmark runner that stores per-URL outcome JSON and evidence artifacts.

  **Must NOT do**:
  - Do not change live extraction behavior yet.
  - Do not label every failure as bot blocking.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - backend reliability and measurement design
  - **Skills**: `[]` - codebase-local task; no special skill required
  - **Skills Evaluated but Omitted**: `playwright` - QA uses Playwright later, but implementation is not browser-first

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2-T5)
  - **Blocks**: T6, T7, T8, T10, T14
  - **Blocked By**: None

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:612` - current load waterfall and hard failure path to benchmark
  - `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts:99` - where URL failures currently become terminal session data
  - `clara-backend/package.json:13` - existing script conventions for adding benchmark commands

  **Acceptance Criteria**:
  - [ ] Benchmark manifest exists and includes at least one representative SPA-shell route
  - [ ] Runner outputs per-URL status, strategy used, failure code, and evidence path
  - [ ] Hard failures are classified instead of stored as generic exceptions only

  **QA Scenarios**:
  - Happy path — Tool: Bash; run benchmark on a mixed sample manifest and confirm JSON output includes successes and classified failures. Evidence: `.sisyphus/evidence/task-1-benchmark-report.json`
  - Edge case — Tool: Bash; include one malformed URL and confirm it is classified deterministically without crashing the batch. Evidence: `.sisyphus/evidence/task-1-malformed-url.json`

  **Commit**: NO (groups with T2-T5)

- [ ] 2. Add extraction attempt and result contracts

  **What to do**:
  - Introduce typed contracts for extraction attempts, captured signals, retryability, and terminal outcomes.
  - Split “page extracted” from “page usable” so quality failures can be retried or classified separately.
  - Ensure downstream worker code can persist strategy, attempt count, and failure reason per URL.

  **Must NOT do**:
  - Do not keep relying on raw exception text as the only status model.

  **Recommended Agent Profile**:
  - **Category**: `quick` - contract/type extraction with moderate coordination value
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `context7-mcp` - no external API ambiguity here

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3-T5)
  - **Blocks**: T6, T7, T8, T10, T11, T13, T15
  - **Blocked By**: None

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:25` - current coarse `WebDocument` / `WebMetadata` model
  - `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts:134` - current single error path that needs typed reasons

  **Acceptance Criteria**:
  - [ ] Loader and worker share a typed extraction result contract
  - [ ] Retryable vs permanent failures are represented explicitly
  - [ ] Strategy metadata survives into downstream scrape session state

  **QA Scenarios**:
  - Happy path — Tool: Bash; type-check contracts and a sample serialization path. Evidence: `.sisyphus/evidence/task-2-contract-typecheck.txt`
  - Edge case — Tool: Bash; simulate a permanent failure classification and confirm it serializes without throwing. Evidence: `.sisyphus/evidence/task-2-permanent-failure.json`

  **Commit**: NO (groups with T1, T3-T5)

- [ ] 3. Create domain policy and session-state abstraction

  **What to do**:
  - Add a domain policy layer for per-host concurrency caps, request jitter, timeout hints, selector hints, and optional cookie/session reuse.
  - Make the design proxy-ready, but keep proxy use disabled by default in polite mode.
  - Add a session-state object so extraction can reuse browser context/cookies without leaking across unrelated hosts.

  **Must NOT do**:
  - Do not add CAPTCHA-solving or stealth-plugin dependencies.
  - Do not hardcode target-site policy directly into generic loader logic.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - cross-cutting backend reliability structure
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `playwright` - browser QA comes later, not needed for design-only coding

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4, T5)
  - **Blocks**: T9, T10, T12
  - **Blocked By**: None

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:153` - current per-page Playwright context creation with no policy abstraction
  - `clara-backend/src/modules/ingest/crawlers/web-crawler.ts:554` - existing request delay and robots-derived pacing
  - `clara-backend/src/modules/queue/index.ts` - current queue concurrency/backoff defaults to align with

  **Acceptance Criteria**:
  - [ ] Domain policy is configurable without editing core extractor code
  - [ ] Session reuse is scoped by host/policy and is disabled safely when unsupported
  - [ ] Proxy fields exist as optional config only, with no enabled default

  **QA Scenarios**:
  - Happy path — Tool: Bash; load two domain policies and confirm extractor config differs by host. Evidence: `.sisyphus/evidence/task-3-policy-config.json`
  - Edge case — Tool: Bash; omit policy for a host and confirm safe defaults are applied. Evidence: `.sisyphus/evidence/task-3-default-policy.json`

  **Commit**: NO (groups with T1, T2, T4-T5)

- [ ] 4. Add evidence capture and structured metrics pipeline

  **What to do**:
  - Standardize evidence output for HTML snapshot, extracted text preview, failure reason, selected strategy, and key network summary.
  - Emit structured logs/metrics per URL and per stage (HTTP, Playwright load, scroll, XHR fallback, hydration fallback, ingest).
  - Ensure evidence is bounded in size and redacts cookies/tokens/query secrets.

  **Must NOT do**:
  - Do not dump full sensitive payloads into logs.
  - Do not require external observability infrastructure to benefit from this task.

  **Recommended Agent Profile**:
  - **Category**: `quick` - instrumentation and evidence wiring
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `writing` - docs come later; this is runtime instrumentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T3, T5)
  - **Blocks**: T11, T12, T14, T15
  - **Blocked By**: None

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:672` - current success log point to extend with structured metrics
  - `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts:136` - current failure log point to enrich

  **Acceptance Criteria**:
  - [ ] Each failed URL produces structured evidence and a normalized failure code
  - [ ] Success logs include strategy and content quality metrics
  - [ ] Sensitive values are redacted from stored evidence

  **QA Scenarios**:
  - Happy path — Tool: Bash; run one successful extraction and confirm metrics/evidence files are emitted. Evidence: `.sisyphus/evidence/task-4-success-metrics.json`
  - Edge case — Tool: Bash; run one known failing URL and confirm the failure artifact exists without secrets. Evidence: `.sisyphus/evidence/task-4-failure-metrics.json`

  **Commit**: NO (groups with T1-T3, T5)

- [ ] 5. Add regression harness and verification scripts

  **What to do**:
  - Add scriptable benchmark commands and a small Playwright regression harness for representative scraper cases.
  - Wire package scripts so executors can run reliability checks consistently.
  - Add fixture conventions and instructions for canary/live test separation.

  **Must NOT do**:
  - Do not create a huge flaky end-to-end suite.
  - Do not depend on production-only URLs for every automated check.

  **Recommended Agent Profile**:
  - **Category**: `quick` - script/test scaffolding work
  - **Skills**: [`playwright`]
    - `playwright`: needed for browser-driven regression coverage
  - **Skills Evaluated but Omitted**: `context7-mcp` - Playwright usage is already established in-repo

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T4)
  - **Blocks**: T14, T15, final verification
  - **Blocked By**: None

  **References**:
  - `clara-backend/package.json:5` - existing scripts to extend
  - `clara-backend/package.json:93` - Playwright test dependency already present
  - `clara-backend/scripts/test-extract.ts` - existing extraction-oriented script pattern

  **Acceptance Criteria**:
  - [ ] Standard benchmark command exists and is documented in package scripts
  - [ ] Regression harness can run against sample fixtures without manual setup
  - [ ] Harness differentiates canary/live URLs from local fixtures

  **QA Scenarios**:
  - Happy path — Tool: Bash; run the new benchmark script and verify non-zero executed cases. Evidence: `.sisyphus/evidence/task-5-benchmark-run.txt`
  - Edge case — Tool: Bash; run harness with an empty manifest and confirm graceful exit with clear message. Evidence: `.sisyphus/evidence/task-5-empty-manifest.txt`

  **Commit**: NO (groups with T1-T4)

- [ ] 6. Harden wait strategy for SPA detail routes

  **What to do**:
  - Replace the single DOM-text threshold gate with a multi-signal wait strategy: `domcontentloaded`, bounded `networkidle`, selector hints, and route/API completion signals.
  - Introduce page-type aware waits so SPA detail routes can wait differently from broad static/list pages.
  - Keep hard timeouts bounded and evidence-rich when waits expire.

  **Must NOT do**:
  - Do not add unbounded sleeps.
  - Do not globally slow all pages to the slowest SPA case.

  **Recommended Agent Profile**:
  - **Category**: `deep` - logic-heavy reliability change to core extractor timing
  - **Skills**: [`context7-mcp`]
    - `context7-mcp`: use current Playwright guidance for supported waiting patterns
  - **Skills Evaluated but Omitted**: `playwright` - implementation is library/API oriented, not browser QA only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7-T10)
  - **Blocks**: T11, T14
  - **Blocked By**: T1, T2

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:181` - current `domcontentloaded` wait path
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:189` - current body-text threshold gate
  - `clara-backend/src/modules/ingest/crawlers/web-crawler.ts:319` - existing `networkidle` wait pattern already used elsewhere
  - Playwright docs (`/microsoft/playwright`) - response/wait guidance for SPA pages

  **Acceptance Criteria**:
  - [ ] SPA detail routes can use a stronger wait path than static pages
  - [ ] Wait decisions are explicit and evidence-backed when a page still fails
  - [ ] No wait branch can hang indefinitely

  **QA Scenarios**:
  - Happy path — Tool: Bash; run benchmark on one SPA detail page and confirm extractor waits beyond raw shell load and succeeds or classifies later-stage failure. Evidence: `.sisyphus/evidence/task-6-spa-wait.json`
  - Edge case — Tool: Bash; run against a fast static page and confirm no significant timeout regression. Evidence: `.sisyphus/evidence/task-6-static-page.json`

  **Commit**: NO (groups with T7-T10)

- [ ] 7. Add XHR/fetch interception fallback

  **What to do**:
  - Capture candidate JSON/XHR/fetch responses during Playwright navigation.
  - Parse route-relevant payloads into extraction candidates when DOM text stays sparse.
  - Score and merge candidates so network-derived content can win over empty DOM output.

  **Must NOT do**:
  - Do not capture every response body indiscriminately.
  - Do not ingest analytics, ads, or opaque binary payloads.

  **Recommended Agent Profile**:
  - **Category**: `deep` - non-trivial browser/network extraction logic
  - **Skills**: [`context7-mcp`]
    - `context7-mcp`: use Playwright response interception APIs correctly
  - **Skills Evaluated but Omitted**: `playwright` - QA follows, but the hard part is API integration design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T8-T10)
  - **Blocks**: T11, T13, T14
  - **Blocked By**: T1, T2

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:132` - current Playwright load function to extend with response capture
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:661` - current hard failure when no candidate reaches threshold
  - Playwright docs (`/microsoft/playwright`) - `page.waitForResponse`, response predicates, and body inspection

  **Acceptance Criteria**:
  - [ ] Loader can extract from relevant API/XHR responses when DOM text is near-zero
  - [ ] Response capture is filtered and bounded by size/type
  - [ ] Extracted network payloads participate in strategy scoring, not ad hoc hacks

  **QA Scenarios**:
  - Happy path — Tool: Bash; run a known SPA-shell page whose content arrives via API and verify network-derived extraction succeeds. Evidence: `.sisyphus/evidence/task-7-xhr-success.json`
  - Edge case — Tool: Bash; hit a page with many irrelevant background requests and confirm analytics payloads are ignored. Evidence: `.sisyphus/evidence/task-7-filtered-responses.json`

  **Commit**: NO (groups with T6, T8-T10)

- [ ] 8. Add hydration, inline-script, and structured-data fallbacks

  **What to do**:
  - Parse supported hydration payloads (`__NEXT_DATA__`, `__NUXT__`, inline JSON state, JSON-LD beyond breadcrumbs).
  - Extract meaningful text/fields into a normalized candidate model.
  - Score these candidates alongside DOM and XHR extraction.

  **Must NOT do**:
  - Do not ingest config blobs, secrets, or unrelated app state.
  - Do not trust malformed JSON silently.

  **Recommended Agent Profile**:
  - **Category**: `deep` - parser and candidate-selection logic
  - **Skills**: [`context7-mcp`]
    - `context7-mcp`: useful for structured extraction conventions where library APIs are involved
  - **Skills Evaluated but Omitted**: `writing` - docs are secondary to extraction behavior

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T7, T9, T10)
  - **Blocks**: T11, T13, T14
  - **Blocked By**: T1, T2

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:70` - existing SPA markers already detect hydration-capable pages
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:250` - current JSON-LD handling is breadcrumb-only
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:488` - raw-text fallback entry point to augment with structured candidates

  **Acceptance Criteria**:
  - [ ] Supported hydration/script payloads can produce usable extraction candidates
  - [ ] JSON-LD extraction handles useful content types beyond breadcrumbs where present
  - [ ] Malformed scripts fail safely with classified diagnostics

  **QA Scenarios**:
  - Happy path — Tool: Bash; run extraction on a fixture with hydration JSON and verify structured fallback produces content. Evidence: `.sisyphus/evidence/task-8-hydration-success.json`
  - Edge case — Tool: Bash; run on malformed inline JSON and confirm classified fallback without crash. Evidence: `.sisyphus/evidence/task-8-malformed-json.json`

  **Commit**: NO (groups with T6, T7, T9-T10)

- [ ] 9. Tune browser/session behavior and resource blocking

  **What to do**:
  - Revisit current blocked resource types and add policy-driven exceptions for routes that require assets/scripts to render data.
  - Add cookie/session reuse across same-host pages where it improves stability.
  - Add controlled header consistency and jitter so runs look less robotic without crossing the polite boundary.

  **Must NOT do**:
  - Do not globally disable resource blocking.
  - Do not add stealth or fingerprint spoofing packages.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - browser runtime tuning with site-behavior trade-offs
  - **Skills**: [`context7-mcp`]
    - `context7-mcp`: browser/runtime API tuning relies on accurate library usage
  - **Skills Evaluated but Omitted**: `playwright` - validation comes later

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6-T8, T10)
  - **Blocks**: T12, T14
  - **Blocked By**: T3

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:169` - current resource blocking policy may be too aggressive
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:153` - current new-context-per-page behavior to evolve carefully
  - `clara-backend/src/modules/ingest/crawlers/web-crawler.ts:293` - similar browser context configuration already in crawler

  **Acceptance Criteria**:
  - [ ] Resource policy can vary by domain/page type
  - [ ] Same-host session reuse improves stability without cross-host leakage
  - [ ] No new browser tuning crosses the polite boundary

  **QA Scenarios**:
  - Happy path — Tool: Bash; compare benchmark output before/after policy tuning on known SPA detail pages. Evidence: `.sisyphus/evidence/task-9-policy-ab.json`
  - Edge case — Tool: Bash; run two different hosts in one batch and confirm cookies/session state do not leak across them. Evidence: `.sisyphus/evidence/task-9-session-isolation.json`

  **Commit**: NO (groups with T6-T8, T10)

- [ ] 10. Add classified retries and jittered backoff

  **What to do**:
  - Implement per-URL retry budgets with explicit retryability rules for timeout, navigation, transient API, soft-block, and quality-failure cases.
  - Add jittered backoff and escalation between strategies instead of immediate terminal failure.
  - Align loader-level retries with existing BullMQ/job retries so they complement rather than multiply each other blindly.

  **Must NOT do**:
  - Do not create nested infinite retries.
  - Do not retry permanent failures such as malformed URLs or unsupported auth/captcha pages indefinitely.

  **Recommended Agent Profile**:
  - **Category**: `deep` - retry classification and coordination logic is easy to get wrong
  - **Skills**: [`context7-mcp`]
    - `context7-mcp`: BullMQ backoff and progress patterns should match supported APIs
  - **Skills Evaluated but Omitted**: `playwright` - retries span more than the browser layer

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6-T9)
  - **Blocks**: T11, T12, T14
  - **Blocked By**: T1, T2, T3

  **References**:
  - `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts:134` - current immediate fail path
  - `clara-backend/src/modules/queue/index.ts` - current queue attempts/backoff defaults to reconcile with
  - BullMQ docs (`/taskforcesh/bullmq`) - attempts, exponential backoff, jitter, and progress metadata

  **Acceptance Criteria**:
  - [ ] Retry policy differentiates transient vs permanent failures
  - [ ] Jittered backoff is bounded and observable
  - [ ] Loader retries and queue retries do not multiply into runaway execution

  **QA Scenarios**:
  - Happy path — Tool: Bash; simulate a transient timeout and confirm later retry succeeds within budget. Evidence: `.sisyphus/evidence/task-10-transient-recovery.json`
  - Edge case — Tool: Bash; simulate a permanent malformed/auth-gated URL and confirm retries stop with a permanent code. Evidence: `.sisyphus/evidence/task-10-permanent-stop.json`

  **Commit**: NO (groups with T6-T9)

- [ ] 11. Integrate resilient retry orchestration into the scrape worker

  **What to do**:
  - Refactor the scrape worker so a URL only becomes terminally failed after the classified retry budget is exhausted.
  - Persist attempt count, last strategy used, and failure code into session/url state.
  - Keep SSE/progress updates accurate while retries are in flight.

  **Must NOT do**:
  - Do not hide repeated retries from progress reporting.
  - Do not break existing cancel/rollback behavior.

  **Recommended Agent Profile**:
  - **Category**: `deep` - orchestration change touches correctness, progress, and rollback state
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `context7-mcp` - the hard part here is integration, not API lookup

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential within Wave 3
  - **Blocks**: T14, T15
  - **Blocked By**: T2, T4, T6, T7, T8, T10

  **References**:
  - `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts:42` - main orchestration entry point
  - `clara-backend/src/modules/knowledge-bases/core/scrape-progress-stream.ts` - stream snapshot path that must reflect retries
  - `clara-backend/src/modules/knowledge-bases/api/scrape.ts` - current progress/status API surface

  **Acceptance Criteria**:
  - [ ] URLs are retried according to classified policy before terminal failure
  - [ ] Session progress reflects retrying URLs clearly
  - [ ] Cancel/rollback still works while retries are active

  **QA Scenarios**:
  - Happy path — Tool: Bash; run a URL that fails once then succeeds and confirm final status is success with recorded retry count. Evidence: `.sisyphus/evidence/task-11-retry-success.json`
  - Edge case — Tool: Bash; cancel a session during active retry and confirm worker stops cleanly with rollback intact. Evidence: `.sisyphus/evidence/task-11-cancel-during-retry.json`

  **Commit**: NO (groups with T12-T15)

- [ ] 12. Add domain circuit breaker and adaptive concurrency controls

  **What to do**:
  - Introduce per-domain failure-rate monitoring that can reduce concurrency, extend delays, or pause retries temporarily on soft-block spikes.
  - Distinguish soft-block patterns (`challenge`, blank-shell-with-api-failure, repeated 429/503) from hard permanent failures.
  - Surface breaker state in metrics/evidence for operators.

  **Must NOT do**:
  - Do not globally pause unrelated domains because one host degrades.
  - Do not silently drop pages when the breaker opens.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - systems behavior and operational resilience
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `writing` - operator docs come later

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T13, T15; after T10/T11 interfaces stabilize)
  - **Blocks**: T14, T15
  - **Blocked By**: T3, T4, T9, T10

  **References**:
  - `clara-backend/src/modules/ingest/crawlers/web-crawler.ts:554` - existing delay logic to evolve into adaptive pacing
  - `clara-backend/src/modules/queue/index.ts` - queue concurrency and rate-limiting context
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:663` - current generic “site may block bots” hard-fail message to replace with taxonomy-aware logic

  **Acceptance Criteria**:
  - [ ] Per-domain breaker opens only on configured soft-block/error conditions
  - [ ] Concurrency/delay adaptation is observable and bounded
  - [ ] Pages are deferred/retried with classification, not silently lost

  **QA Scenarios**:
  - Happy path — Tool: Bash; simulate repeated transient 429/503 responses and confirm concurrency drops with eventual recovery. Evidence: `.sisyphus/evidence/task-12-breaker-recovery.json`
  - Edge case — Tool: Bash; run mixed-domain batch and confirm one degraded domain does not throttle unrelated hosts. Evidence: `.sisyphus/evidence/task-12-domain-isolation.json`

  **Commit**: NO (groups with T11, T13-T15)

- [ ] 13. Add content quality gates and canonical dedupe rules

  **What to do**:
  - Add quality gates so low-value boilerplate, empty shells, and near-duplicate content are rejected or retried intelligently.
  - Strengthen canonical URL normalization and duplicate detection by URL and content hash.
  - Distinguish “extracted but low-value” from “failed to extract” in reports.

  **Must NOT do**:
  - Do not reject valid short pages like contact/legal pages by mistake.
  - Do not dedupe distinct localized pages into one record accidentally.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - content heuristics and dedupe tuning
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `context7-mcp` - this is app-specific heuristics work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T12, T15)
  - **Blocks**: T14, T15
  - **Blocked By**: T2, T7, T8

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:441` - current content-root and raw-text heuristics to refine
  - `clara-backend/src/modules/ingest/crawlers/web-crawler.ts:133` - existing URL normalization logic to align with
  - `clara-backend/src/modules/knowledge-bases/worker/scrape-worker.ts:102` - current empty-text failure gate

  **Acceptance Criteria**:
  - [ ] Quality rejects are classified separately from hard extraction failures
  - [ ] Duplicate/canonical variants are identified without suppressing distinct content
  - [ ] Quality heuristics are benchmarked against representative short and long pages

  **QA Scenarios**:
  - Happy path — Tool: Bash; run two duplicate URL variants and confirm one canonical result is kept. Evidence: `.sisyphus/evidence/task-13-dedupe.json`
  - Edge case — Tool: Bash; run a short but valid contact page and confirm it is retained, not quality-rejected. Evidence: `.sisyphus/evidence/task-13-short-page.json`

  **Commit**: NO (groups with T11, T12, T14-T15)

- [ ] 14. Add target-site rule pack and live canary workflow

  **What to do**:
  - Add configurable site rules for Exceliya-like Vite/React routes: selector hints, expected API patterns, route classes, and benchmark sampling.
  - Create a canary flow that runs a small live subset before full 500+ page execution.
  - Use canary output to validate wait rules, XHR fallback, and quality thresholds before broad rollout.

  **Must NOT do**:
  - Do not hardwire a single-site hack into the generic extractor without policy boundaries.
  - Do not run full-site canaries by default.

  **Recommended Agent Profile**:
  - **Category**: `quick` - targeted config/policy and benchmark assembly
  - **Skills**: `[]` - codebase-local task
  - **Skills Evaluated but Omitted**: `playwright` - browser QA already covered in harness/canary execution

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential late Wave 3
  - **Blocks**: T15, final verification
  - **Blocked By**: T1, T5, T6, T7, T8, T9, T10, T11, T12, T13

  **References**:
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts:132` - extraction engine receiving site-policy hints
  - `clara-backend/src/modules/ingest/crawlers/web-crawler.ts:514` - discovery output feeding target-site canary subsets
  - User-provided production logs for `/courses/<uuid>` failures - benchmark source for target-site rules

  **Acceptance Criteria**:
  - [ ] Target-site policy is configuration-driven and benchmark-backed
  - [ ] Canary run exists and gates full-site rollout
  - [ ] Exceliya-like SPA detail routes show measurable improvement on the benchmark set

  **QA Scenarios**:
  - Happy path — Tool: Bash; run canary subset on target-site detail pages and confirm improved success rate versus baseline. Evidence: `.sisyphus/evidence/task-14-canary-report.json`
  - Edge case — Tool: Bash; disable target-site policy and confirm generic extractor still behaves safely, even if less accurate. Evidence: `.sisyphus/evidence/task-14-policy-off.json`

  **Commit**: NO (groups with T15)

- [ ] 15. Surface reliability state to operators

  **What to do**:
  - Extend API/UI progress surfaces to show strategy used, retry count, failure code, and breaker/deferred state.
  - Make remaining failures actionable instead of generic “bot blocked / fetch failed” messages.
  - Keep UI minimal: no new dashboard unless existing surfaces cannot hold the new state clearly.

  **Must NOT do**:
  - Do not build an unrelated observability product.
  - Do not expose sensitive payload snippets to the UI.

  **Recommended Agent Profile**:
  - **Category**: `quick` - mostly wiring existing metrics into operator-facing surfaces
  - **Skills**: [`playwright`]
    - `playwright`: needed to verify state transitions and messaging in the admin UI
  - **Skills Evaluated but Omitted**: `visual-engineering` - preserve the existing admin design language

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (after T11 interfaces stabilize, with T12/T13)
  - **Blocks**: final verification
  - **Blocked By**: T2, T4, T5, T11, T12, T13, T14

  **References**:
  - `clara-backend/src/modules/knowledge-bases/api/scrape.ts` - current progress API surface
  - `clara-backend/src/modules/knowledge-bases/core/scrape-progress-stream.ts` - SSE snapshot surface for live updates
  - `clara-backend/src/components/admin/ScrapeWizard.tsx` - current operator-facing scrape flow

  **Acceptance Criteria**:
  - [ ] Operators can see retry count, strategy, and failure code for problematic URLs
  - [ ] UI text differentiates transient, deferred, permanent, and quality-reject outcomes
  - [ ] No sensitive evidence is surfaced to the browser

  **QA Scenarios**:
  - Happy path — Tool: Playwright; start a scrape canary and confirm live UI state shows retries/strategy/failure codes as pages progress. Evidence: `.sisyphus/evidence/task-15-operator-ui.png`
  - Edge case — Tool: Playwright; force a classified permanent failure and confirm the UI shows actionable state without leaking payloads. Evidence: `.sisyphus/evidence/task-15-permanent-failure.png`

  **Commit**: YES
  - Message: `feat(scrape): surface reliability state and operator guidance`
  - Files: `clara-backend/src/modules/knowledge-bases/api/scrape.ts`, `clara-backend/src/components/admin/ScrapeWizard.tsx`
  - Pre-commit: `npm run type-check && npm run lint`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `deep`
  Verify each deliverable exists, extraction fallbacks are wired into the real scrape path, and no forbidden anti-bot escalation was added.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run type-check` and `npm run lint`; review changed files for dead code, unbounded waits, hidden retries, and unsafe logging of cookies/tokens.

- [ ] F3. **Real Browser/CLI QA** — `unspecified-high`
  Execute benchmark and live-canary scenarios on representative SPA pages; capture evidence under `.sisyphus/evidence/final-qa/`.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Confirm the work improved polite-mode reliability without expanding into CAPTCHA-solving, stealth plugins, or unrelated crawler rewrites.

---

## Commit Strategy

- **1**: `feat(scrape): add benchmark corpus and extraction contracts`
- **2**: `feat(scrape): add multi-signal SPA extraction fallbacks`
- **3**: `feat(scrape): add retry and domain resilience controls`
- **4**: `feat(scrape): surface reliability metrics and regression coverage`

---

## Success Criteria

### Verification Commands
```bash
npm run type-check
npm run lint
```

### Final Checklist
- [ ] Benchmark SLO met for target pages within polite-mode boundary
- [ ] Remaining failures are classified, bounded, and observable
- [ ] No unbounded retries or silent drops exist
- [ ] No forbidden anti-bot escalation shipped
