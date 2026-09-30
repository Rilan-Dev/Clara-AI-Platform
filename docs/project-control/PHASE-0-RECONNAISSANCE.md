# Phase 0 — Baseline and Control-System Reconnaissance

Status: COMPLETE (developer self-verified; awaiting architect review)

## Repository

| Field | Value |
|---|---|
| Repository | `Rilan-Dev/Clara-AI-Platform` (private) |
| Branch | `feature/ai-core-from-doable-source` |
| HEAD SHA | `cdcf23ce8f5b00232a7e600bbe553211018f2b6e` |
| Date | 2026-10-01 |
| Developer | Z.AI (implementer) |
| Architect | ChatGPT (technical lead / reviewer / controller) |
| Working tree | Clean; tracking `origin/feature/ai-core-from-doable-source` |

Mainline refs at time of reconnaissance (from `origin` after `git fetch --prune`):

| Branch | SHA | Role |
|---|---|---|
| `Vite-Converted` | `5ca8ec58` | Development line (merge-base of the current feature branch) |
| `Vercel-Preview` | `db6cdb48` | Stable preview deployment branch (preview.rag domain) |
| `Vercel-Prod` | `e0ead990` | Production deployment branch (clara.rag domain) |
| `main` | `550630f5` | Dormant default branch (CI target only; not the active dev line) |

The current feature branch is 6 commits ahead of `Vite-Converted` tip and contains **zero** changes to `src/`, `packages/`, `package.json`, or lockfiles — its commits vendor the Doable source library under `docs/doable-source/` and add the two project-control design documents. Tree-level diff `HEAD...origin/Vercel-Preview` is empty (Vercel-Preview contributes no unique content to this branch's history).

---

## 1. Existing Governance

| Path | Purpose | Authority | Keep/Extend/Replace |
|---|---|---|---|
| `README.md` | Product overview, scripts, documentation index, contributing rules (`npm run lint`, `npx tsc --noEmit`, `npm test -- --run` before push; CI green on `main`, `Vite-Converted`, `Vercel-Prod`) | Repository owner conventions | **Keep** (optionally extend with a project-control pointer in Phase 1+) |
| `Doc/18-09-2026/AGENTS.md` | Primary agent execution guidelines for the Clara codebase: architecture map (`src/app` routing-only, `src/modules/*` bounded contexts, `src/features/*` UI, `src/lib` cross-cutting, `packages/*` TS-alias-only), two job systems, DB migration rules, build/test commands, local infra, conventions | Canonical agent guidance for code work | **Keep + Extend** (add a pointer to the project-control area once Phase 1 creates it; do not duplicate content) |
| `.github/copilot-instructions.md` | graphify tool guidance for Copilot Chat (`graphify query/path/explain` when `graphify-out/graph.json` exists) | Tool-specific, low authority; `graphify-out/` does not currently exist in the repo | **Keep as-is** (stale but harmless) |
| `docs/superpowers/specs/YYYY-MM-DD-*-design.md` (8 files) | Durable architecture/design specs per feature (incl. `2026-10-01-clara-project-control-architecture-design.md` — the approved control-system spec) | Design authority | **Keep** (naming convention: date-prefixed `-design.md`) |
| `docs/superpowers/plans/YYYY-MM-DD-*.md` (16 files) | Durable implementation plans per feature (incl. `2026-10-01-clara-project-control-system.md` — the approved 13-phase plan) | Plan authority | **Keep** (naming convention: date-prefixed) |
| `docs/superpowers/reports/YYYY-MM-DD-*.md` (9 files) | Verification/baseline evidence reports (voice latency baselines, rollout runbooks, migration reports) | Evidence records | **Keep** |
| `docs/superpowers/agent-workspace-routing-kb-context.md` | Ad-hoc design note living outside the specs/plans/reports convention | Feature-specific historical | **Keep as-is** (note the convention deviation; do not replicate the pattern) |
| `docs/doable-source/AGENTS.md` (794 lines) | Agent rules for the vendored Doable source library: immutable boundaries, capability catalog (21 capabilities), host-mapping procedure, implementation/UI/security/DB/provider/MCP rules, verification protocol, definition of done, change isolation | Canonical for all doable-source usage | **Keep — never weaken** (see §5) |
| `docs/doable-source/README.md` | Human/agent entry point for the Doable source library: intended workflow, repository layout, immutable-source rule, verification commands, provenance | Canonical for library workflow | **Keep** |
| `docs/doable-source/WORKLOG.md` | Chronological worklog **scoped to the doable-source library's own development phases** (capability resolver, metadata gate, implementation index, source-closure evidence, CI observability) | Authority for library-phase history | **Keep (scoped)** — must NOT be reused as the project-wide worklog |
| `docs/deployment/VERCEL-VPS-CLOUD.md` | Deployment contract: branch↔domain mapping, Vercel variables, DNS, CSP notes, preview-authorship rule, production validation order | Deployment authority | **Keep** (inspect-only during Phase 0) |
| `docs/deliverables/CLARA-Payments-Setup-and-UIUX-Plan.md` | One-off payments setup/UI-UX plan deliverable | Historical deliverable | **Keep as-is** |
| `Doc/` (dated folders `18-09-2026/`, `19-09-2026/`, `25-09-2026/`, `intial-docs/`) | Historical design docs, integration plans, runbooks, implementation plan (docx/md), employment docs | Historical/reference (dated, effectively immutable history) | **Keep as-is** |
| `/home/z/my-project/worklog.md` (**outside the repository**) | Z.AI agent-side session worklog required by standing session instructions | Session-local only — **not durable, not in Git, invisible to GitHub/other agents** | **Replace reliance** — Phase 1 must establish the in-repo canonical worklog (see §2) |

Notable absences (verified): no root `AGENTS.md`, no `docs/AGENTS.md`, no `CONTRIBUTING.md`, no root `worklog.md`, no `PROJECT_STATE.md` / `CURRENT_PHASE.md` / `NEXT_ACTION.md` / `ZAI_HANDOFF.md` / `VERIFICATION_STATE.md` / `DECISIONS.md` / `ISSUES.md` / `RISKS.md` / `CHAT_CONTINUITY.md`, no `sessions/` records. **No competing project-control source of truth currently exists in the repository.**

## 2. Existing Worklog

Findings:

- **Canonical in-repo worklog: none exists for the Clara project.** The only worklog inside the repository is `docs/doable-source/WORKLOG.md`, which is explicitly scoped to the vendored Doable source library's own governance phases.
- Format of `docs/doable-source/WORKLOG.md`: chronological (oldest-first, appended at the end) sections headed `## YYYY-MM-DD — <title>` with `Goal` / `Completed` / `Verification` (or `Verification state`) / `Remaining` (or `Next candidate phase`) subsections. It already distinguishes completed vs. remaining vs. verification state, but defines **no formal status enum** (the `PLANNED / IN_PROGRESS / BLOCKED / CORRECTION_REQUIRED / VERIFIED / CLOSED` values arrive with the project-control plan, Phase 4).
- The standing session instructions (chat handoff) require Z.AI to append to `/home/z/my-project/worklog.md`, which lives **outside the repository** in the agent workspace. It is a session-continuity convenience, not a durable project artifact: it is not versioned, not visible on GitHub, and cannot satisfy the architecture spec's requirement that "repository state is authoritative; chat memory is supplementary."
- No other document currently serves as project state. `README.md` describes the product, not state; `docs/superpowers/reports/` holds feature evidence; PR descriptions partially record intent (e.g. open PR #262).

Decision for Phase 1 (recommendation, not created in Phase 0): create the canonical project worklog at the **repository root as `worklog.md`**, adopting the doable-source entry style (date-headed sections with goal/completed/verification/remaining), extended per plan Phase 4 with phase/role/status fields. Do **not** create a second worklog inside the repo, and do not fold project entries into `docs/doable-source/WORKLOG.md`. The out-of-repo session worklog remains a local agent convenience only and must never be cited as authoritative state.

## 3. Existing State/Handoff Systems

- **In-repo: none.** No project-state, phase, next-action, handoff, continuity, or session documents exist (verified by glob/grep for `PROJECT_STATE|CURRENT_PHASE|NEXT_ACTION|ZAI_HANDOFF|VERIFICATION_STATE|CHAT_CONTINUITY` — only the two 2026-10-01 control-system spec/plan documents mention them, as design intent).
- Handoff/continuity currently lives exclusively in chat prompts (ephemeral), which is precisely the gap the approved spec targets.
- Partial evidence trails that already exist and should be **reused, not duplicated**: `docs/superpowers/reports/` (verification evidence), `docs/superpowers/specs|plans/` (design/plan authority), PR bodies (promotional intent), GitHub deployments API (deployment evidence), CI checks (verification evidence).
- Drift evidence justifying the control system: standing instructions from earlier sessions still say "PR #191 left open for owner review," but PR #191 was **merged** by the owner and a new promotion PR **#262** (`Vercel-Prod ← Vite-Converted`, "feat: wire AI Platform Core adapter seam into Clara") is now open. Chat-carried state has already diverged from repository truth — repository state must become the single authority.

## 4. Clara Architecture Relevant to the Control System

Reconnaissance only; no product system was modified.

| Area | Location | Notes relevant to future control/feature phases |
|---|---|---|
| App skeleton | `src/app` (App Router, routing only; `(admin)`, `(platform)`, `api/` groups) | Handlers delegate to `src/modules/<domain>/api/` |
| Bounded contexts | `src/modules/*` (24 modules: `admin`, `admin-ui`, `agent-versioning`, `ai-core`, `ai-governance`, `ai-platform-core`, `assistant`, `auth`, `billing`, `cloud-jobs`, `docs`, `embed`, `events`, `graph`, `ingest`, `knowledge-bases`, `language-core`, `organisations`, `phone`, `platform-health`, `queue`, `rag`, `shared`, `voice-core`) | Most logic changes happen here |
| UI composition | `src/features/*` (`admin`, `agent-conversation`, `embed`, `platform`, `workspace`) | Page-level screens/layouts/components |
| Cross-cutting | `src/lib/` (`db.ts`, `env.ts`, `plan-guard.ts`, `plans.ts`, `quota-admission.ts`, `rate-limit.ts`, `stripe.ts`, `razorpay.ts`, `redact.ts`, `runtime-flags.ts`, …) | Billing/plan/quota guardrails live here |
| Shared packages | `packages/api-client`, `packages/types` via TS path aliases only (`@clara/api-client`, `@clara/types`); `@clara/ui` aliased but absent — do not use | No npm workspaces |
| Incumbent AI core | `src/modules/ai-core` (`factory.ts`, `resolve.ts` w/ cache, `model-catalog.ts`, `multilingual-embeddings.ts`, `providers/{openai,gemini,sarvam,tei}.ts`) | Multi-LLM abstraction; providers configurable by platform admin |
| New AI Platform Core seam | `src/modules/ai-platform-core` (`clara-runtime.ts`, `clara-runtime.test.ts`, `index.ts`, README) | First concrete host binding of the Doable extraction: wires tenant/config → provider resolver → tool-registry seam → Clara RAG → context → chat → realtime voice. **Existing production routes intentionally unchanged** in the first wiring step; new routes/features migrate to this seam incrementally |
| Vendored Doable library | `docs/doable-source/**` (immutable trees + capabilities/contracts/adapters/verification/agent-init) | See §5 — immutable boundaries |
| Agents | `src/modules/assistant` (conversation, context), `src/modules/agent-versioning` (branches/versions) | Agent Work Mode etc. = future capability program (plan Phase 10) |
| RAG | `src/modules/rag` (grounding, hybrid dense+sparse search), `knowledge-bases`, `ingest` | Qdrant is the knowledge source; Clara remains authoritative |
| Voice | `src/modules/voice-core` (`realtime/`, `providers/`, `metering.ts`, `pricing.ts`, `credit-alerts.ts`), `phone`, `embed` | Realtime WS on VPS custom server; Vercel uses `api/voice-realtime.mjs` + rewrites |
| Tenancy / RBAC | `src/modules/organisations`; DB tables `roles`, `permissions`, `role_permissions`, `memberships`; `users.is_super_admin` | Tenant isolation is application-layer |
| Auth | `src/modules/auth` (sessions) | `AUTH_SECRET`; session cookie auth |
| Usage/credits | `src/modules/billing`, `src/lib/{plans,plan-guard,quota-admission,rate-limit}.ts`, `voice-core` metering/pricing | `PLAN_GUARD_FAIL_MODE` closed/open |
| Audit | `audit_logs` table (migration 002); `src/modules/ai-governance` (Q&A audit trail, PII redaction, audited reveal) | |
| Analytics | `analytics_events` (migration 004); admin dashboards | |
| Tracing/health | `src/modules/platform-health`; `/api/platform/services-status`; `platform-health-scan.yml` (10-min GitHub cron) | Health scan runs in GitHub Actions because Vercel Hobby crons are daily-only |
| Workers | BullMQ+Redis (`clara-crawl`, `clara-retry`) + Postgres-polling `ingest_jobs`; `workers/worker-entry.ts` (Docker CMD via `Dockerfile.worker`) | Main app only enqueues; separate worker container consumes |
| Custom server | `scripts/start.mjs` (raw WS upgrade for embed/voice + phone streaming) — **must never run on Vercel** | VPS-only |
| MCP / tools / integrations / skills / memory / workspace-sandbox | **Not implemented in Clara yet** | These are the future capability-program targets sourced from `docs/doable-source/capabilities/` |

## 5. Doable-Source Constraints

Authoritative rules the future Z.AI developer must never violate (source: `docs/doable-source/AGENTS.md`, `README.md`, `verification/IMMUTABLE_PATHS.json`):

**Immutable — never modify, reformat, rename, optimize, or "fix":**

- `docs/doable-source/doable-source/**` — captured Doable implementation (exact reference source)
- `docs/doable-source/dependency-closure/**` — exact transitive source for captured capabilities
- `docs/doable-source/ui-reference/**` — captured UI/UX reference (immutable reference material even though host UI is rebuilt/adapted)

**Modifiable within the library (per `IMMUTABLE_PATHS.json`):** `docs/doable-source/adapters/**`, `contracts/**`, `verification/**`, `agent-init/**` — but changes there are library-governance work, not Clara feature work, and the library's own README-maintenance rule applies.

**Hard rules:**

1. Host-specific changes belong in `src/` (host) and connect through contracts/adapters — **never** edit the vendored trees to solve host integration problems.
2. Existing `capabilities/*/MANIFEST.md` files are authoritative and are not auto-rewritten; `CAPABILITY_MANIFEST.schema.json` is the canonical shape for *future* structured manifests.
3. `agent-init/resolve.mjs` / `plan.mjs` / `init.mjs` are read-only navigation aids — a finite closure is **never** proof of completeness. Capability completeness requires reading manifests and tracing source imports.
4. Definition of done spans the full closure: source → imports → dependencies → persistence → security → runtime → APIs/tools → UI/state → recovery → observability → tests.
5. Security: never hardcode or move secrets/credentials into the reusable source; respect tenant authorization, RBAC, path restrictions, sandbox policy, tool permissions, credential isolation, audit/usage tracking.
6. Database: never adopt Doable's schema wholesale; map identity/tenant IDs, create target migrations, preserve constraints/indexes/authorization; no second incompatible persistence model.
7. UI: preserve interaction model, state coverage (loading/empty/error/success/retry/permission/destructive-confirm), streaming/tool behavior; adapt branding/typography/layout to Clara's design system.
8. Provider rules: preserve `provider registry → credentials → discovery → validation → model selection → resolution → runtime → UI`; never hardwire one provider into a multi-provider feature; provider-specific behavior stays behind abstractions.
9. Verification split: extraction verifier proves source preservation, **not** host correctness — only Clara's own typecheck/lint/tests/build/browser checks prove host integration.

**Verification tooling (run from `docs/doable-source/`):**

- `node verification/validate-library.mjs` — executed during this Phase 0: **PASS** (21 catalog capabilities, 21 manifests, 30 graph edges, 21 index entries, 0 errors, 0 warnings).
- `node verification/verify-extraction.mjs`, `node external-dependencies/verify-external-dependencies.mjs`, `node agent-init/trace.mjs`, `node verification/validate-source-closure-report.mjs` — available for deeper evidence.
- Provenance: captured from `Rilan-Dev/Doable` ref `develop` commit `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`.
- **Inert artifact:** `docs/doable-source/.github/workflows/source-closure.yml` is nested inside the vendored library; GitHub only reads the repository root `.github/workflows/`, so it never runs in Clara. Clara's active workflows are only `ci.yml` and `platform-health-scan.yml`.

## 6. Branch and Deployment Rules

**Branch roles (per `docs/deployment/VERCEL-VPS-CLOUD.md`, the deployment authority):**

- `Vite-Converted` = development / Vercel Preview integration line.
- `Vercel-Preview` = stable preview branch, always serving the branch's most recent deployment at `https://preview.rag.amazetechclans.com`.
- `Vercel-Prod` = production at `https://clara.rag.amazetechclans.com`.
- VPS Docker deployment remains active at `https://clara.ai.amazetechclans.com` (owns long-lived voice/phone WebSockets via `scripts/start.mjs`).
- Valid hostnames are **only** the three above; the legacy hyphenated `clara-rag.amazetechclans.com` is NXDOMAIN and must never be used.
- `main` is a dormant default branch (CI target only).

**PR flow (observed from recent history #249–#262):** feature work lands on `Vite-Converted` → PR `Vite-Converted → Vercel-Preview` (self-merged by developer to publish preview) → promotion PR to `Vercel-Prod` (owner-controlled: #191 and #257 merged; **#262 currently open**, `Vercel-Prod ← Vite-Converted`). Helper sync PRs in both directions have also been used (#249). No squashing of unrelated commits.

**Branch protection:** none enforced — the repository is private on the GitHub Free plan, and branch protection requires Pro/public. "Protected production branches" are therefore **convention-only** (PR discipline). This is a recorded risk (see §9).

**Commit authorship rule (preview deploys):** Vercel Hobby plan blocks preview deployments whose commit author cannot resolve to an account with contributing access. Commits pushed to preview branches must be authored as the owner identity `RiluRaafu <65199603+Rilan-Dev@users.noreply.github.com>`. Production deployments are exempt. Recent history confirms both identities in use (`RiluRaafu` noreply and `Rilan-Dev <rilan@clara.ai>`).

**Vercel configuration (`vercel.json`):** framework nextjs; `installCommand: npm install --legacy-peer-deps --include=dev`; `buildCommand: npm run db:migrate && npm run build` (migrations run at deploy time); region `bom1`; Fluid compute enabled; three crons (`onboarding-reminders`, `services-status`, `worker/reindex`); queue/v2beta triggers for `clara-ingest|crawl|scrape|retry`; voice/phone rewrites to `api/voice-realtime.mjs` (maxDuration 300); `git.deploymentEnabled` only for `Vercel-Preview` and `Vercel-Prod`; `ignoreCommand` exits 1 when `VERCEL_GIT_COMMIT_REF` is `Vercel-Preview` or `Vercel-Prod`.

**Observational deployment evidence (GitHub deployments API, 2026-10-01):** recent Preview-environment deployments exist for `db6cdb48` (Vercel-Preview tip) and for feature-branch commits `e1e3acb7`, `39dfa266`, `03482584`, `e7a5f15c` (2026-09-30; these SHAs exist only on `feature/ai-core-from-doable-source`). The exact interaction between `ignoreCommand`, `git.deploymentEnabled`, and per-branch/per-PR preview creation should be operationally confirmed by the deployment controller before Phase 7 relies on it.

**CI (`ci.yml`):** jobs `lint`, `typecheck` (`npx tsc --noEmit`), `test` (`vitest --run`), `model-config` (`npm run validate:model-config`) on pushes to `main`/`Vite-Converted`/`Vercel-Prod` and PRs targeting those branches. Feature branches receive CI only through PRs to those bases.

**Health scan (`platform-health-scan.yml`):** 10-minute cron GitHub Action hitting `/api/platform/services-status` with `CRON_SECRET` (GitHub secret mirroring the Vercel env); exists because Vercel Hobby crons are daily-only (2026-09-22 outage lesson).

**Environment conventions:** `NEXT_PUBLIC_APP_URL` = production URL; `NEXT_PUBLIC_API_BASE_URL` must stay **empty** (compile-time bake-in would break preview CSP self-containment — `getApiBaseUrl()` falls back defensively); `NEXT_PUBLIC_VOICE_WS_BASE_URL` currently unused by code; secrets only in server env (`DATABASE_URL`, Qdrant, Upstash Redis, CloudAMQP RabbitMQ, AI/auth secrets). Cloud services: Supabase = PostgreSQL, Upstash = Redis/BullMQ, Qdrant Cloud = vector DB, CloudAMQP = RabbitMQ. A previously exposed Vercel token documented in the deployment doc must be treated as compromised and rotated (deployment-controller responsibility).

**Phase 0 compliance:** no deployment, no production-branch modification, no Vercel operation was performed during this phase.

## 7. Database Rules

- **Engine/host:** PostgreSQL through a single `DATABASE_URL`; in the cloud deployment this is **Supabase Postgres** (per deployment contract). `src/lib/db.ts` sizes its pool for Supabase session-mode poolers (`pooler.supabase.com` → 3 connections vs 10 elsewhere). `@supabase/supabase-js` (^2.76.1) is a dependency, but the core data layer is a plain `pg` pool — there are no Supabase-specific config files, migrations framework, or RLS conventions in the repository.
- **Migrations:** no ORM; plain numbered SQL files `src/lib/db/migrations/NNN_description.sql` — currently 54 files spanning `001_foundation.sql` … `060_sarvam_realtime_streaming.sql`. Auto-applied at server boot via `runMigrationsOnStartup()` (`src/lib/db/migrate.ts`, invoked from `src/instrumentation.ts`), tracked in `schema_migrations`. **Rule: never edit an already-applied migration; add the next numbered file.**
- **Deploy-time migration:** the Vercel build command runs `npm run db:migrate` before `next build`; local runs use `npm run db:migrate` (`tsx scripts/migrate.ts`).
- **Seeding:** `npm run seed` (production bootstrap, safe on any DB), `seed:dev` / `seed:reset` / `seed:clean` (demo data; guarded by explicit NODE_ENV + local DB host). Reference data (roles/permissions) is part of the schema contract and seeded idempotently inside migrations; tenant/business data lives in seed scripts only.
- **Authorization model:** **no RLS policies exist anywhere in the migrations** — authorization is entirely application-layer RBAC (`roles`, `permissions`, `role_permissions`, `memberships`, `users.is_super_admin`, plus `WORKER_SECRET`-guarded internal worker routes). Any future Supabase-operations phase must not assume RLS conventions exist.
- **Doable-source database rule:** future capability implementations must map Doable persistence to Clara's numbered-migration system and never create a second incompatible persistence model.
- **Phase 0 compliance:** no migration was added, edited, or executed against any remote database during this phase.

## 8. Conflicts / Duplicates (competing sources of truth)

1. **`docs/AGENTS.md` expected but missing.** The approved spec's cross-chat recovery order begins with "docs/AGENTS.md and repository README/agent instructions," but the real agent instructions live at `Doc/18-09-2026/AGENTS.md`. Either create a thin `docs/AGENTS.md` pointer (recommended, Phase 1) or amend the recovery order to the real path. Do not duplicate the guidance in two files (doable-source README-maintenance rule: one canonical location per audience).
2. **Out-of-repo session worklog vs. durable worklog.** `/home/z/my-project/worklog.md` (agent workspace) is required by standing instructions but is not in Git. Once the canonical in-repo `worklog.md` exists, the out-of-repo file must never be cited as authority. Resolve in Phase 1.
3. **`docs/doable-source/WORKLOG.md` scope.** Library-scoped; project-wide entries there would create a second worklog. Keep scopes strictly separated.
4. **Stale chat-carried branch/PR state.** Standing instructions still reference open PR #191; repository truth shows #191 merged and #262 open. Confirms spec principle "repository state is authoritative" — control documents must record PR state with dates, not assume chat memory.
5. **Dual AI stacks.** Incumbent `src/modules/ai-core` (multi-LLM abstraction) and new `src/modules/ai-platform-core` (Doable-derived host seam; production routes intentionally unchanged so far). Future feature specs must declare which seam they target to avoid divergent provider behavior — a decision for the architect, not the developer.
6. **Two documentation roots.** `Doc/` (capitalized, dated, historical) vs `docs/` (lowercase, active: `superpowers/`, `doable-source/`, `deployment/`, `deliverables/`). All new control documents go under `docs/`; `Doc/` remains historical archive.
7. **Branch protection not enforced.** GitHub Free private repo — production-branch safety is PR-discipline only. Recorded as risk R-2.
8. **Nested inert workflow.** `docs/doable-source/.github/workflows/source-closure.yml` cannot execute in Clara (root-only workflow discovery). Its CI-evidence artifact claims apply to the source library repository, not to Clara.
9. **Stale tool guidance.** `.github/copilot-instructions.md` references `graphify-out/` which does not exist in the repository.
10. **Minor convention drift.** `docs/superpowers/agent-workspace-routing-kb-context.md` sits outside the `specs|plans|reports` convention. Historical; leave as-is.

## 9. Risks Identified During Reconnaissance (input for future RISKS.md)

- **R-1:** Chat-instruction drift already occurred (PR #191/#262) — any control doc that paraphrases branch/PR state instead of dating it will drift the same way.
- **R-2:** No enforced branch protection on `Vercel-Prod`/`Vercel-Preview` (GitHub Free plan) — accidental direct pushes are possible; the control system's deployment gates are the mitigation.
- **R-3:** `vercel.json` `ignoreCommand`/`deploymentEnabled` semantics are documented but their precise runtime interaction (feature-branch preview deployments were observed on 2026-09-30) is not fully proven; must be operationally confirmed before Phase 7 codifies deployment gates.
- **R-4:** Migrations auto-apply on boot and at Vercel build time — any branch deployed to Vercel runs its migrations against the shared cloud database. Future database-changing phases must sequence migration PRs carefully (architect/controller responsibility per spec).
- **R-5:** Exposed Vercel token documented in the deployment doc — rotation is a deployment-controller task; never reproduce tokens in control documents.

## 10. Recommended Canonical Locations

Recommendation (creation deferred to Phase 1+ per plan; nothing below was created in Phase 0 except this report):

| Document | Recommended location | Rationale |
|---|---|---|
| `PROJECT_STATE.md` | `docs/project-control/PROJECT_STATE.md` | Focused control area; no existing document serves this purpose |
| `CURRENT_PHASE.md` | `docs/project-control/CURRENT_PHASE.md` | Same |
| `NEXT_ACTION.md` | `docs/project-control/NEXT_ACTION.md` | Same |
| `ZAI_HANDOFF.md` | `docs/project-control/ZAI_HANDOFF.md` | Same; templates under `docs/project-control/templates/` (Phase 2/6) |
| `VERIFICATION_STATE.md` | `docs/project-control/VERIFICATION_STATE.md` | Same; complements (does not duplicate) `docs/superpowers/reports/` feature evidence |
| `DECISIONS.md` | `docs/project-control/DECISIONS.md` | Same |
| `ISSUES.md` | `docs/project-control/ISSUES.md` | Same |
| `RISKS.md` | `docs/project-control/RISKS.md` | Same |
| `CHAT_CONTINUITY.md` | `docs/project-control/CHAT_CONTINUITY.md` | Same |
| Session records | `docs/project-control/sessions/SESSION-*.md` | Optional audit records per plan Phase 4 |
| Canonical worklog | **repository root `worklog.md`** | Matches the spec's plain "worklog.md" naming; maximally discoverable; mirrors the doable-source library's own root-`WORKLOG.md` convention; keeps the historical audit trail separate from the state docs. Alternative (`docs/project-control/worklog.md`) keeps everything co-located but mixes history with state. Final call belongs to Phase 1. |
| Agent-instructions pointer | `docs/AGENTS.md` (thin pointer only) | Satisfies the spec's recovery read order without duplicating `Doc/18-09-2026/AGENTS.md`; point to code conventions there and to `docs/project-control/` for governance |
| Phase 0 report (this file) | `docs/project-control/PHASE-0-RECONNAISSANCE.md` | No existing canonical location is "clearly intended for this exact purpose": `docs/superpowers/reports/` is scoped to feature verification evidence, while this report founds the control-document area that Phase 1 populates; co-locating it with that area preserves the audit trail of the control system's own construction |

## 11. Phase 0 Evidence

Commands run during reconnaissance (read-only; from `docs/doable-source/` where noted):

- `git fetch origin --prune`; `git status`; `git log`; `git rev-list --left-right --count` / `merge-base` comparisons across `Vite-Converted`, `Vercel-Preview`, `Vercel-Prod`; `git diff HEAD...origin/Vercel-Preview --stat` (empty).
- GitHub REST (read-only): PR #191 state, recent PR list (#249–#262), branch-protection endpoint (returned: requires Pro/public — none enforced), deployments list.
- `node verification/validate-library.mjs` (from `docs/doable-source/`) → **PASS, 0 errors, 0 warnings** (21/21 capabilities).
- Repository/file inspection only: README, AGENTS docs, superpowers spec/plan, doable-source library, `vercel.json`, `ci.yml`, `platform-health-scan.yml`, migrations, module tree, env template.

Scope compliance: no product code changed; no dependency changed; no migration created or executed; no deployment performed; no production branch modified; no Phase 1 document created.

## 12. Phase 0 Conclusion

**Confirmed:**

- Governance inventory complete: two AGENTS docs (codebase + doable-source), README conventions, superpowers specs/plans/reports structure, deployment contract, dated historical `Doc/` archive.
- No existing project-control or state/handoff documents exist in the repository — the Phase 1 foundation creates no duplicates.
- The only in-repo worklog is library-scoped (`docs/doable-source/WORKLOG.md`); a durable project worklog is missing and must be established (Phase 1, schema finalized Phase 4).
- Architecture, immutable doable-source boundaries, verification tooling (validator PASS), CI contract, Vercel/branch/domain rules, database/migration conventions, and authorization model (application-layer RBAC, no RLS) are mapped.
- The current feature branch is a clean superset of all mainline branches (docs-only delta).

**Remains unknown / to be resolved by the architect:**

- Final canonical worklog location (recommendation: root `worklog.md`) — Phase 1 decision.
- Whether to create the thin `docs/AGENTS.md` pointer (recommended) or amend the spec's recovery read order — Phase 1/3 decision.
- Precise Vercel `ignoreCommand` × `deploymentEnabled` runtime semantics (feature-branch preview deployments were observed) — confirm before Phase 7 codifies deployment gates.
- Which AI seam (`ai-core` vs `ai-platform-core`) future feature phases target — architect decision recorded in a future spec; not a Phase 0 matter.
- Supabase operational tooling/identity for Phase 8 (only `DATABASE_URL` and pooler-aware pooling are visible in-repo).

**Conflicts that must be resolved before Phase 1:** items §8.1 (missing `docs/AGENTS.md` vs spec read order) and §8.2 (out-of-repo worklog authority). Both have recommendations above requiring architect confirmation. §8.4 (stale PR state) is resolved by adopting repository state as authoritative (spec principle 6).

**Next phase:** Phase 1 — Durable Project-Control Foundation (per `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`): create the control document set in `docs/project-control/` per the recommended canonical locations, define the state schema, and establish the canonical worklog. Awaiting architect-issued Z.AI handoff; **no Phase 1 implementation was started during Phase 0.**
