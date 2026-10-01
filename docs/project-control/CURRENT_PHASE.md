# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-02**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance — the Phase 7 planning instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence register + the durable verification and phase-gate contract + the durable correction and issue-control workflow), `VERIFICATION_CHECKLIST.md` (canonical checklist/template), `ISSUES.md` (the durable issue register + the canonical issue-control system), repository-root `worklog.md` (canonical historical audit trail), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan), **`docs/project-control/PHASE-7-PLAN.md` (the Phase 7 planning package)**.

> **Phase state (2026-10-02):** Phase 6 — Correction and Issue-Control Workflow is **`CLOSED`** (architect re-review `PASS`, 2026-10-01; reviewed correction `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; issue I-013 `RESOLVED`; closure record `3657035ac878da98decd98929fb0deb45aed1fbe`; the Phase 6 contract is preserved in Git history at `3657035a`). **Phase 7 has received its architect-issued planning handoff** (2026-10-02 — "Phase 7 — Planning, Scope Definition & Pre-Implementation Baseline") [architect-verified workflow action]. Phase 7's canonical status is **`PLANNED`**: the planning package (`PHASE-7-PLAN.md`) has been produced by the developer [developer-reported, awaiting architect review], but **Phase 7 implementation has NOT started and is NOT authorized** — the planning handoff explicitly withholds implementation authorization, and only a further explicit architect implementation-authorization handoff may start it. No phase implementation is active.

## Phase identity

| Field | Value |
|---|---|
| Phase number | **7** |
| Phase name | **AI Platform Core Foundation (Planning and Pre-Implementation Baseline stage)** — the first AI-platform capability-integration phase, per the architect's Phase 7 planning handoff (see `PHASE-7-PLAN.md` §3 for the objective determination and the proposed reconciliation with the plan's original Phase 7 "Vercel Operations Gate" ladder position — architect ratification pending) |
| Full designation | **Phase 7 — AI Platform Core Foundation** (planning stage) |
| Status | **`PLANNED`** — planning/baseline assignment received 2026-10-02 and executed (planning package delivered, `[developer-reported]`, architect review **PENDING**); implementation NOT started, NOT authorized; in the implementation sense Phase 7 remains NOT STARTED |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 7 planning handoff received from ChatGPT on 2026-10-02 (baseline `3657035ac878da98decd98929fb0deb45aed1fbe` = the Phase 6 closure-record commit = the repository tip at issuance). Scope: pre-flight verification; complete project-control state reconciliation; the Phase 7 starting-point baseline; objective determination; read-only AI-platform architecture investigation; A–E capability classification; architecture proposal; dependency graph; risk/issue reconciliation; acceptance criteria; Gates A–F design; the planning package; persistence under project-control conventions. **No implementation authorized** — the handoff's HARD RULE. Executed by Z.AI 2026-10-02 (this commit) |
| Baseline commit | `3657035ac878da98decd98929fb0deb45aed1fbe` (the Phase 6 closure-record commit — the state the Phase 7 planning handoff was issued against; verified per `ZAI_HANDOFF.md` §I.6: branch `feature/ai-core-from-doable-source`; HEAD = origin tip; clean tree; mainlines recorded — with the observed external `Vercel-Prod` movement `e0ead990` → `bae53a07` (PR #262) noted for architect awareness; `b65725e5` ancestry intact; `vercel.json` unchanged; immutable-source integrity verified incl. a scratch-harness run of the library's extraction verifier — finding I-014) |

**Only ChatGPT/project-owner review can authorize Phase 7 implementation and later close the phase.** The developer planning package is a proposal — it is not approval, and no `PASS`/`CLOSED` determination exists for Phase 7. A `CORRECTION_REQUIRED` outcome on the planning package follows `ZAI_HANDOFF.md` §I.5 / the Phase 6 correction workflow.

## Objective (this stage)

Establish the Phase 7 baseline and produce the complete pre-implementation plan, per the architect's planning handoff: verify the repository baseline; reconcile the complete project-control state; determine the actual Phase 7 objective from repository records and the original project objective (extracting and integrating reusable AI-platform capabilities from the Doable source into Clara AI Platform); investigate — without implementing — the existing Clara AI-platform architecture across the full capability spectrum; classify candidate capabilities (A Phase 7 candidate scope / B later-phase / C existing Clara capability / D Doable-source reference only / E blocked or dependency-gated) with repository evidence; propose the architecture, adapter boundaries, dependency graph, risk/issue reconciliation, acceptance criteria, Gates A–F verification design, rollback strategy, ordered sub-phases, and the explicit stopping boundary; persist the package under the project-control append-only conventions; and STOP.

## Scope (approved for this stage — documentation only)

1. `docs/project-control/PHASE-7-PLAN.md` — the Phase 7 planning package (the required 20-item deliverable).
2. `docs/project-control/CURRENT_PHASE.md` (this file) — the Phase 7 planning-stage contract.
3. `docs/project-control/ZAI_HANDOFF.md` — Part II replaced with the Phase 7 planning handoff instance (per Part I §I.12; the superseded CH-001 instance remains recoverable in Git history at `3657035a`).
4. `docs/project-control/VERIFICATION_STATE.md` — the Phase 7 planning evidence section + the state-machine consistency reconciliation.
5. `docs/project-control/PROJECT_STATE.md` and `docs/project-control/NEXT_ACTION.md` — reconciled to Phase 7 `PLANNED` (entailed by the Final State Contract consistency requirement, per the established reconciliation convention).
6. `docs/project-control/ISSUES.md` — the new issue **I-014** appended under §"Issue records (canonical schema)" (developer-reported finding: vendored Doable-source library incomplete relative to its own immutable manifest — the `mcp-servers/` family absent; plus the verifier layout incompatibility) — per the out-of-scope-discovery rule (report, do not absorb).
7. `worklog.md` — the Phase 7 planning entry (append-only).
8. `docs/project-control/sessions/SESSION-011.md` + its `sessions/README.md` index row.
9. Read-only investigation, validation runs, and the persisted out-of-repository validation harness (`/home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh`, agent workspace, per the Phase 3/4/5 convention).

## Non-scope (explicit — unchanged from the handoff's authorization boundary)

- **Do NOT** modify `src/**`, `packages/**`, `src/lib/db/migrations/**`, Supabase, `vercel.json`; do not deploy; do not begin Phase 7 implementation (no Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, attachments, image generation, marketplace, templates, automation, or UI work); do not introduce product capabilities.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `dependency-closure/**`, `ui-reference/**` — D-007 — and `doable-source-extensions/**`, immutable-by-provenance); do not modify or rewrite `b65725e5`.
- **Do NOT** resolve R-3/R-4/R-5; rotate credentials; introduce secrets or private chain-of-thought.
- **Do NOT** resolve I-001/I-007/I-014 (architect triage); do not modify `DECISIONS.md`/`RISKS.md` (no new decisions or risk facts are enacted by a planning package; the ratification list lives in `PHASE-7-PLAN.md` §23); do not rewrite historical closure/correction records (SESSION-001…010, the worklog's historical entries).
- **Do NOT** mark Phase 7 `PASS` or `CLOSED`; do not self-approve the phase; do not invent architect approval; do not start Phase 8.

## Prerequisites (all verified 2026-10-02)

1. Phase 6 `CLOSED` (architect `PASS` re-review of `4dc8a573`; closure record `3657035a`) — the baseline the planning handoff was issued against.
2. The Phase 7 planning handoff issued by ChatGPT on 2026-10-02 [architect-verified workflow action].
3. Pre-flight verification executed per the handoff §1 and `ZAI_HANDOFF.md` §I.6: branch; HEAD = `3657035a` = origin tip; clean tree; closure ancestry (`3657035a` → `4dc8a573` → `c0cca964`); mainlines (`main`/`Vite-Converted`/`Vercel-Preview` unchanged; `Vercel-Prod` externally moved — recorded); immutable-source ancestry and integrity (diff-empty since vendoring; 771/771 present pinned blobs byte-verified via the scratch harness; `mcp-servers` family absent → I-014); `vercel.json` unchanged; no product/DB/deployment changes after the Phase 6 closure — all confirmed from repository evidence, not chat memory.

## Required deliverables (this stage)

- `PHASE-7-PLAN.md` — objective determination (incl. the plan-ladder reconciliation proposal); scope/non-scope; capability inventory; existing-vs-missing matrix; Doable-source reuse map; A–E classification with evidence; architecture description + diagram; adapter boundaries; dependency graph; risk analysis; issue dependencies; database/security/multi-tenant/provider implications; testing strategy; Gates A–F design; acceptance criteria; rollback strategy; ordered sub-phases (7-A/7-B/7-C-optional); the explicit stopping boundary; the architect ratification list; the validation record.
- This contract; the `ZAI_HANDOFF.md` Part II planning instance; the `VERIFICATION_STATE.md` Phase 7 planning section; the `PROJECT_STATE.md`/`NEXT_ACTION.md` reconciliation; the I-014 issue record; the append-only worklog entry; `SESSION-011.md` + index row.
- Reconciled Final State Contract: all five members + the latest `worklog.md` entry at Phase 7 — `PLANNED` (planning delivered, implementation not authorized, architect review PENDING); baseline `3657035a`.

## Acceptance criteria (this stage — pass/fail, evaluated by the architect at review)

1. The verified baseline table is complete and evidence-backed — PASS/FAIL.
2. The Phase 7 objective determination presents both repository records (plan ladder; original objective) and the reconciliation proposal without enacting it — PASS/FAIL.
3. Every A–E classification carries repository evidence — PASS/FAIL.
4. The capability inventory covers the handoff's full AI-platform scope list and distinguishes exists/missing/partial/reuse/adapter-required/outside-immutable-boundary/not-in-Phase-7 — PASS/FAIL.
5. The architecture proposal distinguishes immutable reusable core / Clara host integration+adapters / existing Clara infrastructure / future work — PASS/FAIL.
6. The dependency graph identifies prerequisites, ordering constraints, and shared infrastructure — PASS/FAIL.
7. The risk and issue reconciliation cross-checks open issues/risks (I-001/I-007/I-013, R-1…R-5, D-P2/D-P3/D-P4) and marks dependency-gated capabilities — PASS/FAIL.
8. Acceptance criteria are measurable and categorized per the handoff's ten categories — PASS/FAIL.
9. Gates A–F are defined with applicability/evidence/PASS/FAIL/N-A rules and preserve the established governance rules (P0 always blocks; P1-only exception; no P2/P3 exception; developer claims/tree/build/deployment never substitute for review) — PASS/FAIL.
10. The stopping boundary is explicit — PASS/FAIL.
11. The package is persisted under project-control conventions (append-only; session record; index updates; no historical rewrites) — PASS/FAIL.
12. The new finding (I-014) is recorded as an OPEN issue for architect triage, not silently absorbed or resolved — PASS/FAIL.
13. No product/DB/deployment/immutable-source changes occur — PASS/FAIL.
14. No secrets/private reasoning are introduced — PASS/FAIL.
15. Phase 7 is NOT marked `PASS`/`CLOSED`; no architect approval is claimed or fabricated — PASS/FAIL.
16. Final State Contract is consistent (Phase 7 `PLANNED` across all members + worklog) — PASS/FAIL.
17. Validation passes / results are recorded — PASS/FAIL.
18. Git tree is clean after commit; branch synchronized with origin — PASS/FAIL.
19. No Phase 7 implementation and no Phase 8 work is started — PASS/FAIL.

## Verification requirements (developer, before commit — this stage)

(1) `npm run validate:model-config` — PASS (lightweight, never sufficient alone); (2) `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → 8/8, exit 0; (3) `bash docs/project-control/verification/correction-cycle-test.sh` → 24/24, exit 0; (4) `node docs/doable-source/verification/validate-library.mjs` (from the library root) → PASS; (5) the scratch-harness extraction verifier (`/home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh`) → 771/771 present pinned blobs verified, failures confined to the I-014 family; (6) complete Git diff inspection; (7) changed-path scope check (`worklog.md` + `docs/project-control/**` only); (8) immutable-source + production-branch check (incl. the observed `Vercel-Prod` movement recorded, not acted on); (9) secret-pattern scan; (10) Final State Contract consistency check. Commands and results: `VERIFICATION_STATE.md` §Phase 7 planning + `PHASE-7-PLAN.md` §24.

## Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads in any control document (the R-5 Vercel token is referenced but never reproduced).
- No fabricated timestamps; no unsupported claims; observable evidence only; evidence classes per D-012 (a future/intended architect review is never written as completed).
- The `b65725e5` provenance remains **not independently established** — never described as confirmed owner authorship.
- Documentation-only stage — no application security/tenancy surface is touched; the architecture proposal's security properties (fail-closed adapters, secrets boundaries) are design statements awaiting the architect's review.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused documentation-only planning commit: `docs: establish phase 7 planning package` — the immediate child of `3657035ac878da98decd98929fb0deb45aed1fbe` — with changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`. Push normally; if the baseline has moved unexpectedly, STOP (no rebase, no force-push) and await a refreshed handoff.
- `b65725e5` is not modified, rewritten, reverted, or amended; `vercel.json` is not touched; the baseline commit is not amended; the immutable Doable-source trees are untouched (verified).

## Stopping boundary

The planning boundary is reached with this commit. After the planning package's commit, push, and evidence report: **Z.AI STOPs at the authorization boundary**: no Phase 7 implementation (no Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, attachments, image generation, marketplace, templates, automation, or UI work), no product code/dependency/migration/Vercel changes, no deployment or database operations, no R-3/R-4/R-5 resolution, no Phase 8 — **until the architect reviews the planning package and issues the explicit Phase 7 implementation authorization handoff**. Only ChatGPT may authorize Phase 7 implementation. If the planning-package review returns `CORRECTION_REQUIRED`, Z.AI acts only on the corrective handoff (`ZAI_HANDOFF.md` §I.5; `ISSUES.md` §"Issue-control system"). A fresh ChatGPT session resuming leadership at this boundary follows `CHAT_CONTINUITY.md` §5.

## Planning-stage record (2026-10-02)

**Phase 7 planning package delivered — architect review PENDING.** The developer executed the architect's Phase 7 planning/baseline handoff (issued 2026-10-02; baseline `3657035a`): pre-flight verified (branch/HEAD/origin/tree/ancestry/mainlines/immutable-source/`vercel.json`/no-drift — with the external `Vercel-Prod` movement `e0ead990` → `bae53a07` (PR #262, fast-forward) observed and recorded for architect awareness); the complete project-control state was read and reconciled; the starting baseline table, objective determination (with the plan-ladder reconciliation proposal), capability inventory, existing-vs-missing matrix, Doable-source reuse map, A–E classification, architecture proposal, adapter boundaries, dependency graph, risk analysis, issue dependencies, Gates A–F design, acceptance criteria, rollback strategy, ordered sub-phases (7-A/7-B/7-C-optional), stopping boundary, ratification list, and validation record were produced in `docs/project-control/PHASE-7-PLAN.md` [developer-reported — a proposal, not an approval; no architect review of it has occurred]. The planning investigation discovered and recorded a new issue per the out-of-scope-discovery rule: **I-014** — the vendored Doable-source library is incomplete relative to its own immutable manifest (the `mcp-servers/` second-pass family — 31 pinned files, 8 directories — is absent from the Clara vendored copy while the capability catalog still describes those capabilities), and the library's extraction verifier cannot run in-place in the Clara layout (a scratch harness is persisted in the agent workspace for gate evidence). **Phase 7 implementation has NOT started and is NOT authorized; Phase 7 is not `PASS` and not `CLOSED`.** Z.AI STOPs at the authorization boundary, awaiting the architect's review of the planning package and the explicit implementation authorization. [developer-reported]
