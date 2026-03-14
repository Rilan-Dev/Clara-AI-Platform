# CSP External Calls Removal Plan

## TL;DR

> **Quick Summary**: Identify and eliminate the source of blocked external analytics calls (GA/overbridgenet) while keeping CSP strict, and add test infrastructure with CSP regression coverage in clara-backend.
>
> **Deliverables**:
> - Vitest test infrastructure in `clara-backend`
> - CSP builder extraction + tests for `connect-src`
> - Diagnostics to detect external analytics domains in rendered output
> - CI update to run tests
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 7

---

## Context

### Original Request
Console reports CSP violations for requests to `https://www.google-analytics.com/mp/collect` and `https://overbridgenet.com/jsv8/offer`. Remove/block these external calls (do not relax CSP), apply globally, and add tests.

### Interview Summary
**Key Discussions**:
- User wants to block/remove external analytics calls rather than allow via CSP.
- Apply removal globally; app surface is unclear (multiple/not sure) so plan includes diagnostics across apps/environments.
- Tests are not set up; user wants test infrastructure added.

**Research Findings**:
- CSP is enforced in `clara-backend/src/middleware.ts` via headers; `connect-src` allows only `'self'`, `wss:`, `https://api.openai.com`, `https://realtime.openai.com`.
- `clara-techvision/src/server/create-server.ts` and `clara-omen-insurance/src/server/create-server.ts` disable CSP via Helmet.
- No GA measurement ID or overbridgenet references in repo; only a blocklist entry in `clara-backend/src/modules/admin/core/ingest/web-loader.ts`.
- No test framework configured; CI runs lint + type-check only.

### Metis Review
**Identified Gaps** (addressed):
- Metis consultation failed due to tool timeout; plan includes explicit diagnostics and guardrails to mitigate uncertainty about call sources.

---

## Work Objectives

### Core Objective
Eliminate CSP-blocked external analytics calls by identifying and removing their sources, while keeping CSP strict and adding regression tests to prevent reintroduction.

### Concrete Deliverables
- `clara-backend` has Vitest setup and passing tests
- CSP builder extracted and unit-tested
- Diagnostics to scan rendered output for blocked domains
- CI runs tests

### Definition of Done
- [ ] No GA/overbridgenet references in repository search (verified via script)
- [ ] CSP `connect-src` remains strict and tests pass
- [ ] Diagnostics show no outbound requests to blocked domains in app surfaces

### Must Have
- Keep CSP strict; do not add GA/overbridgenet to `connect-src`
- Remove any internal sources of GA/overbridgenet calls if found

### Must NOT Have (Guardrails)
- Do NOT relax CSP to allow GA/overbridgenet
- Do NOT add third-party analytics SDKs
- Avoid broad refactors unrelated to CSP/analytics

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (currently)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest

### QA Policy
Every task includes agent-executed QA scenarios with evidence in `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (foundation + diagnostics):
├── Task 1: Add Vitest + test scripts (quick)
├── Task 2: Add Vitest setup/types (quick)
├── Task 3: Extract CSP builder + middleware wiring (unspecified-high)
├── Task 4: CSP unit tests (quick)
└── Task 5: Diagnostics script for blocked domains (unspecified-high)

Wave 2 (integration + CI + remediation):
├── Task 6: CI update to run tests (quick)
└── Task 7: Remove internal injection sources and verify runtime (unspecified-high)

Critical Path: Task 1 → Task 3 → Task 4 → Task 7

### Dependency Matrix
- **1**: — → 3, 4, 6
- **2**: — → 4
- **3**: 1 → 4, 7
- **4**: 1,2,3 → 6,7
- **5**: — → 7
- **6**: 1,4 → 7
- **7**: 3,4,5,6 → FINAL

### Agent Dispatch Summary
- **Wave 1**: T1 quick, T2 quick, T3 unspecified-high, T4 quick, T5 unspecified-high
- **Wave 2**: T6 quick, T7 unspecified-high

---

## TODOs

- [ ] 1. Add Vitest configuration and test scripts in `clara-backend`

  **What to do**:
  - Add Vitest dev dependencies and `test`/`test:watch` scripts
  - Add `vitest.config.ts` scoped to `clara-backend`
  - Ensure `npm run test` executes in `clara-backend`

  **Must NOT do**:
  - Do not add test framework to other packages unless required

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small config changes across a couple files
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-5)
  - **Blocks**: 3,4,6
  - **Blocked By**: None

  **References**:
  - `clara-backend/package.json` - add `test` scripts and dev dependencies
  - `clara-backend/tsconfig.typecheck.json` - align Vitest TS config usage

  **Acceptance Criteria**:
  - [ ] `npm run test` in `clara-backend` runs Vitest without config errors

  **QA Scenarios**:
  ```
  Scenario: Vitest runs with empty test set
    Tool: Bash
    Preconditions: In `clara-backend` directory
    Steps:
      1. Run `npm run test -- --run`
    Expected Result: Vitest exits 0 (no config errors)
    Evidence: .sisyphus/evidence/task-1-vitest-run.txt
  ```

- [ ] 2. Add Vitest setup/types in `clara-backend`

  **What to do**:
  - Add a minimal `vitest.setup.ts` (if needed) and configure `test.setupFiles`
  - Ensure TS types for Vitest are available (e.g., `types` in `tsconfig` or `vitest.config.ts`)

  **Must NOT do**:
  - Avoid global polyfills unrelated to CSP tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, isolated test setup files
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1,3-5)
  - **Blocks**: 4
  - **Blocked By**: None

  **References**:
  - `clara-backend/tsconfig.typecheck.json` - ensure types config alignment

  **Acceptance Criteria**:
  - [ ] Vitest recognizes global `describe/it/expect` without TS errors

  **QA Scenarios**:
  ```
  Scenario: Type checking includes Vitest globals
    Tool: Bash
    Preconditions: In `clara-backend` directory
    Steps:
      1. Run `npm run type-check`
    Expected Result: Type-check passes without Vitest global errors
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

- [ ] 3. Extract CSP builder and wire middleware to it

  **What to do**:
  - Extract CSP string construction into a dedicated helper (e.g., `src/security/csp.ts`)
  - Update `clara-backend/src/middleware.ts` to use the helper for CSP header
  - Keep `connect-src` strict (no GA/overbridgenet)

  **Must NOT do**:
  - Do not broaden CSP directives beyond current values

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive config refactor
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1,2,4,5)
  - **Blocks**: 4,7
  - **Blocked By**: 1

  **References**:
  - `clara-backend/src/middleware.ts` - current CSP header construction

  **Acceptance Criteria**:
  - [ ] CSP header output remains equivalent to current directives

  **QA Scenarios**:
  ```
  Scenario: CSP header contains strict connect-src
    Tool: Bash
    Preconditions: Dev server running for clara-backend
    Steps:
      1. Run `curl -sI http://localhost:3000 | findstr /I "content-security-policy"`
    Expected Result: Header contains "connect-src 'self' wss: https://api.openai.com https://realtime.openai.com"
    Evidence: .sisyphus/evidence/task-3-csp-header.txt
  ```

- [ ] 4. Add CSP unit tests for `connect-src` regression

  **What to do**:
  - Add tests for the CSP builder to assert `connect-src` remains strict
  - Add regression checks for absence of `google-analytics.com` and `overbridgenet.com`

  **Must NOT do**:
  - Do not test unrelated middleware behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small unit tests around a helper function
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3,5)
  - **Blocks**: 6,7
  - **Blocked By**: 1,2,3

  **References**:
  - `clara-backend/src/middleware.ts` - expected CSP directives

  **Acceptance Criteria**:
  - [ ] `npm run test -- --run` passes CSP tests

  **QA Scenarios**:
  ```
  Scenario: CSP tests prevent blocked domains
    Tool: Bash
    Preconditions: In `clara-backend` directory
    Steps:
      1. Run `npm run test -- --run`
    Expected Result: Tests pass, including checks for absence of GA/overbridgenet
    Evidence: .sisyphus/evidence/task-4-csp-tests.txt
  ```

- [ ] 5. Add diagnostics script to scan rendered output for blocked domains

  **What to do**:
  - Add a script (e.g., `scripts/scan-blocked-domains.ts`) that fetches key routes and scans HTML for blocked domains
  - Support configurable targets via env var (e.g., `SCAN_URLS=http://localhost:3000,https://...`)
  - Add npm script to run it from `clara-backend`

  **Must NOT do**:
  - Do not add any analytics/tracking code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-surface diagnostic script with routing assumptions
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4)
  - **Blocks**: 7
  - **Blocked By**: None

  **References**:
  - `clara-backend/package.json` - location for npm script
  - `clara-backend/scripts/` - existing scripts pattern (e.g., `test-crawl.ts`)

  **Acceptance Criteria**:
  - [ ] Script runs and reports zero matches for blocked domains for provided `SCAN_URLS`

  **QA Scenarios**:
  ```
  Scenario: Blocked-domain scan passes
    Tool: Bash
    Preconditions: Relevant apps running locally; SCAN_URLS set
    Steps:
      1. Run `set SCAN_URLS=http://localhost:3000 && npm run scan-blocked-domains`
    Expected Result: Script exits 0 and reports no GA/overbridgenet matches
    Evidence: .sisyphus/evidence/task-5-scan.txt
  ```

- [ ] 6. Update CI workflows to run tests

  **What to do**:
  - Add `npm run test` to root and `clara-backend` CI workflows
  - Ensure test step runs after lint/type-check

  **Must NOT do**:
  - Do not change unrelated CI steps

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small YAML updates
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 7)
  - **Blocks**: 7
  - **Blocked By**: 1,4

  **References**:
  - `.github/workflows/ci.yml` - root CI pipeline
  - `clara-backend/.github/workflows/ci.yml` - backend CI pipeline

  **Acceptance Criteria**:
  - [ ] CI workflow files include a test step

  **QA Scenarios**:
  ```
  Scenario: CI test step executes locally
    Tool: Bash
    Preconditions: In `clara-backend` directory
    Steps:
      1. Run `npm run test -- --run`
    Expected Result: Tests pass
    Evidence: .sisyphus/evidence/task-6-ci-test.txt
  ```

- [ ] 7. Remove internal injection sources and verify runtime

  **What to do**:
  - Use the diagnostics script to identify any internal sources of GA/overbridgenet
  - If found, remove the offending script tag or fetch call in the relevant app
  - Re-run diagnostics to confirm no matches

  **Must NOT do**:
  - Do not relax CSP or add allowlist entries for GA/overbridgenet

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-surface remediation based on diagnostics
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `context7-mcp`: No external API usage needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: FINAL
  - **Blocked By**: 3,4,5,6

  **References**:
  - `clara-backend/src/middleware.ts` - ensure CSP remains strict after changes
  - `clara-backend/src/modules/admin/core/ingest/web-loader.ts` - existing analytics blocklist pattern

  **Acceptance Criteria**:
  - [ ] No GA/overbridgenet domains appear in app output or runtime scans

  **QA Scenarios**:
  ```
  Scenario: Runtime scan shows no blocked domains
    Tool: Bash
    Preconditions: Relevant apps running locally; SCAN_URLS set
    Steps:
      1. Run `set SCAN_URLS=http://localhost:3000 && npm run scan-blocked-domains`
    Expected Result: No matches; exit 0
    Evidence: .sisyphus/evidence/task-7-runtime-scan.txt

  Scenario: CSP violations absent in console
    Tool: Playwright
    Preconditions: App running locally
    Steps:
      1. Launch browser and open app
      2. Listen for console errors containing "Content Security Policy"
    Expected Result: No CSP violations for GA/overbridgenet
    Evidence: .sisyphus/evidence/task-7-console.txt
  ```

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify all tasks implemented; ensure CSP not relaxed and no GA/overbridgenet allowlist entries exist. Evidence files present in `.sisyphus/evidence/`.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run lint` + `npm run type-check` + `npm run test` in `clara-backend`.

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Execute the diagnostics scan and Playwright console check; save evidence to `.sisyphus/evidence/final-qa/`.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Confirm changes are limited to CSP/analytics removal + test infrastructure only.

---

## Commit Strategy

- **1**: `chore(test): add vitest and CSP tests`
  - Files: `clara-backend/package.json`, `clara-backend/vitest.config.ts`, `clara-backend/src/security/csp.ts`, `clara-backend/src/middleware.ts`, `clara-backend/src/**/__tests__/*`
- **2**: `chore(ci): run tests in workflows`
  - Files: `.github/workflows/ci.yml`, `clara-backend/.github/workflows/ci.yml`
- **3**: `chore(security): add CSP diagnostics`
  - Files: `clara-backend/scripts/scan-blocked-domains.ts`, `clara-backend/package.json`

---

## Success Criteria

### Verification Commands
```bash
cd clara-backend
npm run lint
npm run type-check
npm run test -- --run
npm run scan-blocked-domains
```

### Final Checklist
- [ ] No GA/overbridgenet domains appear in scans or console
- [ ] CSP `connect-src` remains strict
- [ ] Tests pass and CI includes test step
