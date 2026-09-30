# ISSUES.md — Durable Issue Register

> Known defects, blockers, and discrepancies. Derived from Phase 0 reconnaissance findings (PHASE-0-RECONNAISSANCE.md §8) and observed project events — no defects are invented.
> Issue statuses: `open` · `resolved` (with dated evidence) · `deferred` (awaiting a later phase/decision) · `informational` (recorded fact, no action required).
> Risk-type findings (branch protection, Vercel semantics, migration auto-apply, exposed token) are tracked in RISKS.md, not duplicated here.
> Phase 0 issues are NOT silently marked resolved — every status change below carries explicit dated evidence.

## Open

### I-001 — `docs/AGENTS.md` referenced by the spec but does not exist

| Field | Value |
|---|---|
| Status | open |
| Description | The control-system spec's cross-chat recovery order begins with `docs/AGENTS.md`, but no such file exists; the real codebase agent instructions live at `Doc/18-09-2026/AGENTS.md` |
| Impact | A fresh ChatGPT session following the spec read-order literally hits a missing file at step 1 and must self-recover |
| Phase discovered | Phase 0 (report §8.1, conflict C-1) |
| Evidence / reference | `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md` §Cross-Chat Recovery; `git ls-files docs/AGENTS.md` → empty |
| Owner / next action | ChatGPT — decide D-P2 (thin pointer file vs. amend the spec read order); deliberately NOT created in Phase 1 (outside the required file set) |

### I-003 — No durable in-repo project worklog

| Field | Value |
|---|---|
| Status | open |
| Description | The only in-repo worklog is `docs/doable-source/WORKLOG.md`, which is scoped to the vendored library's own development phases. No durable project-wide worklog exists; the Z.AI agent-side worklog lives outside the repository and is not durable |
| Impact | Until Phase 4, historical audit relies on Git history + the Phase 0 report + this control-document set; chat-carried history is not authoritative |
| Phase discovered | Phase 0 (report §2/§8.2, conflict C-2) |
| Evidence / reference | Phase 0 report §2; `git ls-files | grep -i worklog` → only `docs/doable-source/WORKLOG.md` |
| Owner / next action | Phase 4 (Worklog and Session Audit) per plan; location recommendation D-P1 (root `worklog.md`) awaits architect confirmation. NOT created in Phase 1 (outside the required file set) |

### I-007 — Stale Copilot instructions reference non-existent `graphify-out/`

| Field | Value |
|---|---|
| Status | open |
| Description | `.github/copilot-instructions.md` instructs agents to use `graphify` when `graphify-out/graph.json` exists, but that path does not exist in the repository |
| Impact | Low — misleading guidance for tools that read the file; harmless otherwise |
| Phase discovered | Phase 0 (report §1/§8.9, conflict C-9; recommendation at the time: keep as-is) |
| Evidence / reference | Phase 0 report §8.9 |
| Owner / next action | ChatGPT — trivial doc fix whenever convenient; not blocking any phase |

## Resolved

### I-002 — Phase 0 report recorded stale repository-state evidence (RESOLVED 2026-10-01)

| Field | Value |
|---|---|
| Status | resolved (2026-10-01) |
| Description | The Phase 0 reconnaissance report recorded HEAD `cdcf23ce` and "6 commits ahead of Vite-Converted" because its snapshot was taken before the report's own commit (`adbc9e16`) existed |
| Impact | Repository-state evidence in the report was inaccurate until corrected; discovered by architect review (drift risk R-1 materializing) |
| Phase discovered | Phase 0 review (architect correction directive, 2026-10-01 — review outcome `CORRECTION_REQUIRED`) |
| Resolution evidence | Correction commit `bcc1769d` ("docs: correct phase 0 repository evidence") — HEAD row, ahead/behind count (7/0 at `adbc9e16`, 8/0 after correction), superset wording, and mainline SHAs all reconciled against fresh Git evidence; correction documented inside the report itself |
| Closed by | Architect issuance of the Phase 1 implementation handoff (2026-10-01), advancing the workflow past the corrected evidence |
| Traceability | finding → corrective directive → developer commit `bcc1769d` → architect advancement (the correction path the plan §Review Focus #5 requires) |

### I-004 — Stale chat-carried PR state (RESOLVED 2026-10-01)

| Field | Value |
|---|---|
| Status | resolved (2026-10-01) |
| Description | Standing chat instructions still referenced PR #191 as "open for owner review", while repository truth showed #191 merged and promotion PR #262 (`Vercel-Prod ← Vite-Converted`) open |
| Impact | Demonstrated that chat memory had already diverged from repository truth — the core problem the control system exists to fix |
| Phase discovered | Phase 0 (report §3/§8.4, conflict C-4) |
| Resolution evidence | Phase 0 report §3 records true PR state with dates; D-001 (repository state authoritative) adopted; durable control documents now carry the PR state (PROJECT_STATE.md, VERIFICATION_STATE.md — dated 2026-10-01: PR #191 merged, PR #262 open, head `5ca8ec58`) |
| Closed by | Adoption of repository-state-authoritative principle + Phase 1 durable state layer |
| Residual risk | The general drift phenomenon remains R-1 (RISKS.md) — mitigation continues through Phases 2–4 |

## Deferred

### I-005 — Dual AI stacks; future features must declare their target seam

| Field | Value |
|---|---|
| Status | deferred |
| Description | Incumbent `src/modules/ai-core` (multi-LLM abstraction) and new `src/modules/ai-platform-core` (Doable-derived host seam; production routes intentionally unchanged so far) coexist |
| Impact | Future feature specs that do not declare which seam they target risk divergent provider behavior |
| Phase discovered | Phase 0 (report §4/§8.5, conflict C-5) |
| Evidence / reference | Phase 0 report §8.5 |
| Owner / next action | ChatGPT — decision D-P3, recorded in the first feature-phase spec (plan Phase 10) |

### I-006 — Promotion PR #262 open, awaiting owner merge

| Field | Value |
|---|---|
| Status | deferred (operational, informational weight) |
| Description | PR #262 (`Vercel-Prod ← Vite-Converted`, "feat: wire AI Platform Core adapter seam into Clara", head `5ca8ec58`) is open and owner-controlled |
| Impact | None on the project-control phases; production promotion timing is an owner decision |
| Phase discovered | Phase 0 (report §3) |
| Evidence / reference | GitHub PR #262 state observed 2026-10-01 (open, not merged) |
| Owner / next action | Project owner — merge or manage via normal PR flow |

## Informational (recorded facts; no action required)

| ID | Status | Description | Evidence |
|---|---|---|---|
| I-008 | informational | `docs/doable-source/WORKLOG.md` is scoped to the library's own phases; project-wide entries must never be folded into it (scope boundary, not a defect) | Phase 0 report §8.3 |
| I-009 | informational | Two documentation roots coexist by design: `Doc/` (capitalized, dated, historical archive) and `docs/` (lowercase, active). All new control documents go under `docs/` | Phase 0 report §8.6 |
| I-010 | informational | `docs/doable-source/.github/workflows/source-closure.yml` is inert in Clara — GitHub discovers workflows only at the repository root; its CI-evidence claims apply to the source library, not Clara | Phase 0 report §8.8 |
| I-011 | informational | `docs/superpowers/agent-workspace-routing-kb-context.md` sits outside the `specs|plans|reports` naming convention; historical, left as-is | Phase 0 report §8.10 |
| I-012 | informational | Branch protection is not enforced (GitHub Free private repo) — production-branch safety is PR-discipline only; tracked as risk R-2 rather than an issue | Phase 0 report §8.7; RISKS.md R-2 |
