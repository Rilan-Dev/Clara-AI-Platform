# RISKS.md — Durable Risk Register

> Active architectural/operational risks carried forward from Phase 0 reconnaissance (PHASE-0-RECONNAISSANCE.md §9) — nothing invented, no unsupported ratings.
> Risk statuses: `open` · `mitigation-in-progress` (mitigation partially in place) · `mitigated` (mitigation complete, monitoring) · `closed` (no longer relevant, with dated evidence).
> **Likelihood/consequence ratings are intentionally not assigned** — no rating convention exists in this repository yet; introducing one would be unsupported invention. A future phase may define a rating convention and backfill.

## R-1 — Control documents drift from repository truth (undated state)

| Field | Value |
|---|---|
| Status | mitigation-in-progress |
| Description | Any control document that paraphrases branch/PR/commit state in undated prose will drift exactly the way chat memory did |
| Impact | A fresh session acting on stale state continues from the wrong phase/commit — the specific failure mode the control system exists to prevent |
| Materialized evidence | Phase 0: the reconnaissance report recorded a stale HEAD and ahead-count (snapshot taken before its own commit); caught by architect review (`CORRECTION_REQUIRED`), corrected in `bcc1769d` (issue I-002) |
| Mitigation | D-014: all state in control documents is dated and paired with recovery commands (`git rev-parse`, `git fetch --prune`); Phase 1 created the durable state layer; full mitigation completes with Phases 2–4 (handoff, continuity, worklog) |
| Owner | ChatGPT (review) / Z.AI (convention compliance) |
| Phase | identified Phase 0; mitigation spans Phases 1–4 |
| Evidence / reference | PHASE-0-RECONNAISSANCE.md §9 R-1 and "Snapshot correction" note; ISSUES.md I-002, I-004 |

## R-2 — No enforced branch protection on production branches

| Field | Value |
|---|---|
| Status | open |
| Description | GitHub Free private repository — branch protection requires Pro/public, so `Vercel-Prod` and `Vercel-Preview` are protected only by convention (PR discipline); accidental direct pushes are possible |
| Impact | Accidental or malicious direct push to a production branch deploys without review |
| Mitigation | PR-discipline convention (D-008); Phase 7 codifies deployment gates; the control system's stopping boundaries discourage direct production work |
| Owner | ChatGPT / project owner |
| Phase | identified Phase 0; gates arrive Phase 7 |
| Evidence / reference | PHASE-0-RECONNAISSANCE.md §6/§8.7; GitHub branch-protection endpoint returned "requires Pro/public" |

## R-3 — Vercel `ignoreCommand` × `deploymentEnabled` semantics unproven

| Field | Value |
|---|---|
| Status | open |
| Description | `vercel.json` sets `git.deploymentEnabled` only for `Vercel-Preview`/`Vercel-Prod` and an `ignoreCommand` that exits 1 for those two refs — yet Preview-environment deployments were observed for feature-branch commits on 2026-09-30; the precise runtime interaction is not fully proven |
| Impact | Deployment gates designed on unverified semantics (Phase 7) could over- or under-trigger preview deployments |
| Mitigation | Operational confirmation by the deployment controller before Phase 7 codifies gates (D-P4) |
| Owner | ChatGPT (deployment controller) |
| Phase | identified Phase 0; confirmation required before Phase 7 |
| Evidence / reference | PHASE-0-RECONNAISSANCE.md §6 (GitHub deployments API observation, 2026-10-01); `vercel.json` |

## R-4 — Migrations auto-apply against the shared cloud database on deploy

| Field | Value |
|---|---|
| Status | open |
| Description | `runMigrationsOnStartup()` applies numbered migrations at server boot, and the Vercel build command runs `npm run db:migrate` before `next build` — any branch deployed to Vercel runs its migrations against the shared cloud database |
| Impact | A branch with unreviewed migrations mutates production schema on deploy |
| Mitigation | Migration sequencing is an architect/controller responsibility per the spec; Phase 8 defines the Supabase operations gate with independent verification |
| Owner | ChatGPT (database operations authority) |
| Phase | identified Phase 0; gate arrives Phase 8 |
| Evidence / reference | PHASE-0-RECONNAISSANCE.md §7; `vercel.json` buildCommand; `src/lib/db/migrate.ts` |

## R-5 — Exposed Vercel token documented in the deployment doc

| Field | Value |
|---|---|
| Status | open |
| Description | A Vercel token documented in `docs/deployment/VERCEL-VPS-CLOUD.md` was previously exposed and must be treated as compromised |
| Impact | Token abuse potential until rotated |
| Mitigation | Rotation is a deployment-controller task (ChatGPT). **This token is never reproduced in any control document** (plan Global Constraints; verified by the Phase 1 secret scan) |
| Owner | ChatGPT (deployment controller) |
| Phase | identified Phase 0 |
| Evidence / reference | PHASE-0-RECONNAISSANCE.md §6/§9 R-5; `docs/deployment/VERCEL-VPS-CLOUD.md` |
