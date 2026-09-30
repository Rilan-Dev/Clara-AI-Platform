# DECISIONS.md — Durable Architecture Decision Register

> Records observable project decisions only — never hidden reasoning. New decisions are appended as new rows/entries; existing decisions are never rewritten, only superseded by a new dated entry referencing the old ID.
> Format per decision: **ID · date · status · decision · authority · evidence/reference**.
> Decision statuses: `ACTIVE` (in force) · `PENDING` (recommended, awaiting architect confirmation) · `SUPERSEDED` (replaced by a later decision).

## Governing decisions (project-control architecture)

| ID | Date | Status | Decision | Authority | Evidence / reference |
|---|---|---|---|---|---|
| D-001 | 2026-10-01 | ACTIVE | GitHub repository state is authoritative; chat/conversational memory is supplementary | ChatGPT (architect) | spec §Non-Negotiable Principles #6; plan Global Constraints |
| D-002 | 2026-10-01 | ACTIVE | ChatGPT is the architect / technical lead / reviewer / workflow controller / operations owner (deployment + database where applicable) | ChatGPT | spec §Operating Roles |
| D-003 | 2026-10-01 | ACTIVE | Z.AI is the developer / implementer; it executes approved handoffs, self-verifies, records evidence, commits, and stops at phase boundaries; it must not claim architect approval or start later phases | ChatGPT | spec §Operating Roles; plan Global Constraints |
| D-004 | 2026-10-01 | ACTIVE | Vercel is the deployment/runtime operations authority, controlled by ChatGPT where applicable; developers do not deploy | ChatGPT | spec §Operating Roles; `docs/deployment/VERCEL-VPS-CLOUD.md` |
| D-005 | 2026-10-01 | ACTIVE | Supabase is the database/runtime operations authority, controlled by ChatGPT where applicable; developers do not change remote database state | ChatGPT | spec §Operating Roles; plan Phase 8 |
| D-006 | 2026-10-01 | ACTIVE | Project-control documentation is durable repository state (versioned in Git under `docs/project-control/`), not chat-carried state | ChatGPT | spec §Durable Project-Control Documents; Phase 1 handoff |
| D-007 | 2026-10-01 | ACTIVE | The immutable Doable-source boundaries must remain intact: `docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**` are never modified, reformatted, renamed, or "fixed"; host changes go through `src/` + adapters/contracts | ChatGPT | spec principle #10; `docs/doable-source/AGENTS.md`; Phase 0 report §5 |
| D-008 | 2026-10-01 | ACTIVE | Production branches (`Vercel-Prod`, `Vercel-Preview`) and mainlines (`Vite-Converted`, `main`) are never modified directly; work happens on feature branches via normal PR flow | ChatGPT | plan Global Constraints; Phase 1 handoff |
| D-009 | 2026-10-01 | ACTIVE | Only ChatGPT/project-owner review closes a phase; review outcomes are `PASS`, `PASS_WITH_FOLLOWUP`, `CORRECTION_REQUIRED`; only `PASS` closes | ChatGPT | spec §Review Contract; plan Global Constraints |

## Decisions established during Phase 0 / Phase 1 (foundation)

| ID | Date | Status | Decision | Authority | Evidence / reference |
|---|---|---|---|---|---|
| D-010 | 2026-10-01 | ACTIVE | Canonical project-control area is `docs/project-control/`; all control documents live there | ChatGPT (architect-confirmed via Phase 1 handoff: "under the canonical project-control directory established by Phase 0") | Phase 0 report §10; Phase 1 handoff §3 |
| D-011 | 2026-10-01 | ACTIVE | Canonical phase/status vocabulary: `PLANNED`, `IN_PROGRESS`, `BLOCKED`, `CORRECTION_REQUIRED`, `VERIFIED`, `CLOSED` — used by all control documents without conflicting vocabularies | ChatGPT (per plan) | plan Phase 4; Phase 1 handoff §5 |
| D-012 | 2026-10-01 | ACTIVE | Evidence is classified as **developer-reported** or **architect-verified** in every control document; architect verification is never claimed without an actual architect review action | ChatGPT | Phase 1 handoff §4; plan Global Constraints |
| D-013 | 2026-10-01 | ACTIVE | Phase 0 was closed via the correction workflow: architect review returned `CORRECTION_REQUIRED` (stale repository evidence), the correction was delivered in `bcc1769d`, and the architect closed the phase by issuing the Phase 1 handoff | ChatGPT (architect actions) | PHASE-0-RECONNAISSANCE.md "Snapshot correction"; VERIFICATION_STATE.md §Phase 0 |
| D-014 | 2026-10-01 | ACTIVE | Branch/PR state in control documents is always dated and paired with a recovery command (never undated prose) — direct mitigation of drift risk R-1, which materialized once during Phase 0 | Z.AI (developer convention, consistent with spec principle 6) | RISKS.md R-1; PHASE-0-RECONNAISSANCE.md correction note |
| D-015 | 2026-10-01 | ACTIVE | The closed Phase 0 reconnaissance report is historical evidence and is not modified by later phases | Z.AI (developer convention) | Phase 1 handoff non-scope |

## Pending decisions (awaiting architect confirmation — do not act on these)

| ID | Date | Status | Decision (recommendation only) | Authority | Evidence / reference |
|---|---|---|---|---|---|
| D-P1 | 2026-10-01 | PENDING | Canonical project worklog location: recommended repository root `worklog.md` (to be established in Phase 4 per plan, not in Phase 1) | awaiting ChatGPT | Phase 0 report §2/§10 |
| D-P2 | 2026-10-01 | PENDING | Resolve the missing `docs/AGENTS.md` (I-001): recommended thin pointer to `Doc/18-09-2026/AGENTS.md` vs. amending the spec's recovery read order | awaiting ChatGPT | Phase 0 report §8.1; ISSUES.md I-001 |
| D-P3 | 2026-10-01 | PENDING | Which AI seam (`src/modules/ai-core` incumbent vs `src/modules/ai-platform-core` Doable-derived) future feature phases target | awaiting ChatGPT | Phase 0 report §8.5; ISSUES.md I-005 |
| D-P4 | 2026-10-01 | PENDING | Vercel `ignoreCommand` × `deploymentEnabled` runtime semantics (feature-branch preview deployments observed 2026-09-30) — confirm before Phase 7 codifies deployment gates | awaiting ChatGPT | RISKS.md R-3; Phase 0 report §6 |
