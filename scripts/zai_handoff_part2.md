## Part II — Active Handoff Instance

> **Phase 7-B F-7B-01 Architect Decision Recording — OPTION A — KEEP AUDIT-ONLY TELEMETRY (decision-record handoff DH-005)** — materialized 2026-10-04 from the architect's decision-recording handoff text, replacing the fully executed AH-004 analysis instance (superseded; recoverable in Git history at `f7327d7b2fe76dbf1bfbcae3dbfc687e69653660`, including its execution-record addendum; identified in the canonical `worklog.md`). The architect has now explicitly decided: **OPTION A — KEEP AUDIT-ONLY TELEMETRY** — the current Phase 7-B `buildClaraToolMeteringHook()` → `writeAuditLog()` implementation is kept as org-scoped tool invocation observability (not billable usage); the Phase 7-B acceptance boundary is formally redefined; F-7B-01 and I-017 are resolved as ARCHITECT ACCEPTANCE DISPOSITIONs; first-class billable tool-usage metering is deferred to a future explicitly authorized phase; **Phase 7-C remains NOT AUTHORIZED**. This instance authorized ONLY the governance recording of that decision — it does NOT authorize any application implementation, migration, schema change, `TOOL` usage kind invention, `query_events` semantics change, `rag_search` behavior change, billing redesign, phase closure, 7-C authorization, MCP, integrations, deployment, or history rewrite (no amend/rebase/squash/cherry-pick/force-push). **Provenance note:** an earlier decision-recording handoff text (2026-10-04) arrived with the architect-decision placeholder unfilled ("[INSERT EXPLICIT ARCHITECT DECISION HERE]"); the developer correctly made ZERO repository changes at that boundary and reported the blocker rather than inferring or selecting a decision — that attempt was never materialized into repository state, and no placeholder exists anywhere in repository history. This instance is the first materialization of the architect's explicit decision.

## 1. Decision-record identity

| Field | Value |
|---|---|
| Record ID | `DH-005` (first decision-recording handoff; sequential after CH-001/CH-002/CH-003/AH-004) |
| Record title | Phase 7-B F-7B-01 Architect Decision Recording — OPTION A — KEEP AUDIT-ONLY TELEMETRY |
| Current status | `EXECUTED` (the decision recorded 2026-10-04 as **D-023**; the Phase 7-B acceptance redefinition recorded; F-7B-01/I-017 resolved as ARCHITECT ACCEPTANCE DISPOSITIONs; Phase 7-B = `ACCEPTANCE REDEFINED / READY FOR ARCHITECT CLOSURE REVIEW` — awaiting the architect closure review) |
| Issued by | ChatGPT (architect / technical lead / reviewer / controller) |
| Issue date | 2026-10-04 |
| Repository | `Rilan-Dev/Clara-AI-Platform` |
| Branch | `feature/ai-core-from-doable-source` |
| Worktree | `/home/z/my-project/.worktrees/vc` |
| Baseline | `f7327d7b2fe76dbf1bfbcae3dbfc687e69653660` (the AH-004 analysis commit) — verified: HEAD == origin == `f7327d7b`; clean tree; `4413bc83` / `63bccded` / `74200bec` present, unmodified, ancestors of HEAD |

## 2. The architect's decision (as supplied — recorded verbatim in substance)

The architect explicitly decides:

1. Keep the current Phase 7-B `buildClaraToolMeteringHook()` → `writeAuditLog()` implementation.
2. Treat `tool.invoked` and `tool.denied` as **org-scoped tool invocation observability, not billable usage**.
3. Do NOT insert tool invocations into `query_events`.
4. Do NOT invent or add a `TOOL` `usage_events` kind.
5. Do NOT create a migration.
6. Do NOT create a new billing architecture.
7. Do NOT change `rag_search` accounting semantics.
8. Defer first-class billable tool-usage metering to a future explicitly authorized phase.
9. Formally redefine/clarify the Phase 7-B acceptance criteria so that the Phase 7-B deliverable is tool-invocation observability through the existing audit infrastructure, while independent usage-spine/billing metering is explicitly deferred.
10. F-7B-01 may be resolved as an **architect-authorized acceptance disposition**, not as a claim that the original usage-spine requirement was technically satisfied.
11. I-017 may be resolved consistently with that disposition.
12. Phase 7-B may proceed toward closure only after the acceptance redefinition and issue disposition are correctly recorded and independently validated.
13. **Phase 7-C remains NOT AUTHORIZED.**

"This decision is authoritative for this handoff. Do not reinterpret it. Do not broaden it. Do not select another option." — honored: recorded exactly as supplied; the developer selected nothing. [architect-verified — as communicated in the decision-recording handoff]

## 3. Related issue / phase

| Field | Value |
|---|---|
| Issue ID | `I-017` — now **`RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION`**: F-7B-02 resolved by implementation correction (the re-reviewed corrective commit `4413bc83`); F-7B-01 resolved by architect-authorized acceptance redefinition — NOT because a hidden implementation satisfying the original requirement was discovered |
| Related phase | Phase 7 — AI Platform Core Foundation; sub-phase 7-B — Unified Tool Runtime — `ACCEPTANCE REDEFINED / READY FOR ARCHITECT CLOSURE REVIEW` (NOT `PASS`, NOT `CLOSED`) |
| Phase contract | `docs/project-control/CURRENT_PHASE.md` (the appended decision-stage record) |

## 4. The acceptance redefinition (canonical text — recorded in `VERIFICATION_STATE.md` §Phase 7-B F-7B-01 architect decision record)

```text
Phase 7-B tool metering/observability boundary:

The Phase 7-B Unified Tool Runtime provides org-scoped invocation
observability through the existing Clara audit infrastructure.

Successful and denied tool invocations may emit structured
tool.invoked / tool.denied audit records.

These records are operational observability and are NOT billable
usage_events and are NOT query_events.

Independent billable tool-usage metering is explicitly deferred
because the existing Clara usage schema does not contain a compliant
tool-event representation without changing schema/accounting semantics.

A future first-class tool-usage metering capability requires a
separate architectural design and explicit authorization.
```

**The preserved semantic distinction (binding):** ORIGINAL REQUIREMENT (per-invocation usage metering through the existing usage/analytics spine) · AH-004 FINDING (not technically satisfiable under the existing constraints — stands unrewritten) · ARCHITECT DECISION (formally redefine/defer that requirement for Phase 7-B) · CURRENT 7-B DELIVERABLE (org-scoped tool invocation observability through `audit_logs`). The repository must NOT claim "`audit_logs` satisfies the original usage-metering spine requirement"; `audit_logs` is NOT described as the usage-metering spine.

## 5. Authorized recording tasks (all executed)

(1) Pre-flight verification (HEAD == origin == `f7327d7b`; clean tree; the mandated control-document reading); (2) the decision recorded as **D-023** in `DECISIONS.md` (the Phase 7 section — Decision / Context / Architectural decision / Deferred capability / Explicit non-goals, per the established register format); (3) F-7B-01 resolved in `ISSUES.md` strictly as `RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION` (the resolution explanation distinguishing the original non-satisfaction, the AH-004 finding, the architect's redefinition, the accepted audit-only observability, and the deferred first-class billable tool usage); (4) I-017 resolved consistently (F-7B-02 by implementation correction; F-7B-01 by architect-authorized acceptance redefinition); (5) `CURRENT_PHASE.md` / `PROJECT_STATE.md` / `NEXT_ACTION.md` reconciled to `ACCEPTANCE REDEFINED / READY FOR ARCHITECT CLOSURE REVIEW`; (6) the architect-decision record appended to `VERIFICATION_STATE.md` (preserving the AH-004 analysis unrewritten); (7) this Part II instance replaced (no placeholder anywhere in the active state); (8) the append-only `worklog.md` entry + `SESSION-020.md` + its README index row; (9) the validation battery; (10) ONE governance-only commit + the normal push; (11) the required final report; (12) STOP at the architect closure review.

## 6. Non-negotiable constraints (all honored)

No application implementation; no migration; no schema change; no `TOOL` usage kind; no query-event semantics change; no billing redesign; no `rag_search` accounting change; no Phase 7-C; no MCP work; no integrations work; no deployment; no database access; no Phase 7-B closure claim (only ChatGPT may close 7-B); no amend/rebase/squash/cherry-pick/force-push; the decision recorded exactly as supplied — not reinterpreted, not broadened, no other option selected; the developer not represented as having selected the architecture; the architect decision / developer execution of the decision record / future authorization explicitly distinguished; the historical AH-004 analysis and the original finding preserved unrewritten.

## 7. Git requirements (all honored)

Baseline verified before starting (HEAD == origin == `f7327d7b`; clean tree); the single resulting commit is governance-only and clearly identified as a decision record (not a "fix" commit, not a closure commit) — the immediate child of `f7327d7b` on `feature/ai-core-from-doable-source`; normal (non-force) push; HEAD == origin verified after the push; history rewritten nowhere (`63bccded` / `74200bec` / `4413bc83` / `f7327d7b` all preserved unmodified).

## 8. STOP boundary

After delivering the decision record and the required final report: STOP. Z.AI performs no further work until the architect's closure-review outcome and the next explicit authorization arrive. The canonical status:

```text
Phase 7-B: ACCEPTANCE REDEFINED / READY FOR ARCHITECT CLOSURE REVIEW
F-7B-01: RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION
F-7B-02: RESOLVED
I-017: RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION
Phase 7-C: NOT AUTHORIZED
STOP: ARCHITECT CLOSURE REVIEW REQUIRED
```

Only ChatGPT may perform the architect closure review and decide whether Phase 7-B can be formally closed. The next action is explicitly: **architect re-review of the acceptance-redefined Phase 7-B state.** No implementation work is pending from this decision itself; first-class billable tool-usage metering is deferred to a future explicitly authorized design phase.

## Part II execution-record addendum — DH-005 decision record (2026-10-04)

> Dated addendum appended per the appended-record convention. This addendum records the execution of the **Phase 7-B F-7B-01 Architect Decision Recording** (DH-005). It is a decision record and acceptance-redefinition record, NOT a closure record and NOT an implementation record.

**Executed** [developer-reported — the faithful recording of the architect's decision; the developer selected nothing]:

1. **Baseline verification**: fresh `git fetch --prune origin`; branch `feature/ai-core-from-doable-source`; HEAD = origin = `f7327d7b2fe76dbf1bfbcae3dbfc687e69653660`; clean working tree; the mandated pre-edit reading completed (CURRENT_PHASE / PROJECT_STATE / NEXT_ACTION / ISSUES / VERIFICATION_STATE / ZAI_HANDOFF / DECISIONS / worklog / SESSION-019).
2. **The decision recorded**: **D-023** in `DECISIONS.md` (the Phase 7 section) — OPTION A — KEEP AUDIT-ONLY TELEMETRY; the Phase 7-B acceptance boundary formally redefined; F-7B-01 resolved as an ARCHITECT ACCEPTANCE DISPOSITION (explicitly NOT a claim of technical satisfaction of the original §19(4)/§19(19) usage-spine requirement); first-class billable tool-usage metering deferred (the future-design scope enumerated); the explicit non-goals recorded.
3. **The issue dispositions recorded** (`ISSUES.md` I-017): status → `RESOLVED` (lifecycle completed with the architect-authorized acceptance-disposition transition); the resolution evidence distinguishing F-7B-02 (implementation correction) from F-7B-01 (architect-authorized acceptance redefinition); the related-decision link to D-023; the resolution date.
4. **The verification register updated** (`VERIFICATION_STATE.md`): the §Phase 7-B F-7B-01 architect decision record section appended (the decision; the decision authority; the twelve-point decision text; the AH-004 context preserved; the canonical acceptance-redefinition text; the preserved semantic distinction; the deferred capability; the explicit non-goals; the effect block; the resulting state; the provenance note about the earlier unfilled-placeholder attempt); the two 2026-10-04 decision review-trail rows appended; the outstanding-state paragraph updated; the Phase 7 header updated; the decision-boundary reconciliation paragraph appended to the Final State Contract section. The AH-004 analysis section stands unrewritten above it.
5. **The current-state documents reconciled**: `CURRENT_PHASE.md` (the decision-stage record appended; the prior stage records preserved unrewritten); `PROJECT_STATE.md` (the snapshot date; the current-phase/phase-status/current-objective cells; the active-handoff-instance and session-records cells; the commit-state rows incl. the AH-004 durable reference + this decision-record commit; the last-architect-verification bullet; the active-blockers paragraph; the I-017 active-issues row; the current-next-action); `NEXT_ACTION.md` (the snapshot date; §1–§4).
6. **This Part II instance replaced** (the superseded AH-004 instance recoverable in Git history at `f7327d7b`); the append-only `worklog.md` entry; `SESSION-020.md` + its README index row.
7. **Validation** (see the session record and the worklog entry for the full results): the changed-files check (governance-only — `worklog.md` + `docs/project-control/**` only; zero `src/**` / migration / dependency / lockfile / immutable-source changes); the governance validators (`phase-closure-eligibility-test.sh` 8/8, exit 0; `correction-cycle-test.sh` 24/24, exit 0); `npm run validate:model-config` PASS; the immutable-source invariants re-verified (the four tree OIDs `a42aee79`/`ee07c362`/`b76b8f34`/`54606204` and `vercel.json` blob `3f26d343` identical at HEAD; the manifest blob verifier 802 pinned / 771 present / 771/771 byte-verified / 0 mismatches / 31 absent confined to `mcp-servers/`); git history not rewritten; ONE governance-only commit + the normal push; HEAD == origin verified after the push.
8. **No deployment; no database access; no migration run.**

**Canonical status after the decision recording**:

```text
Phase 7: IN_PROGRESS
Phase 7-A: PASS — CORRECTION VERIFIED — CLOSED
Phase 7-B: ACCEPTANCE REDEFINED / READY FOR ARCHITECT CLOSURE REVIEW
           (F-7B-01 RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION;
            F-7B-02 RESOLVED; I-017 RESOLVED — ARCHITECT ACCEPTANCE DISPOSITION)
Phase 7-C: NOT AUTHORIZED
STOP: ARCHITECT CLOSURE REVIEW REQUIRED
```

The decision is the architect's [architect-verified — as communicated in the decision-recording handoff]; this commit is the developer's faithful recording of it. **No `PASS` is claimed for 7-B; 7-B is NOT closed by this record — the architect closure review is the next boundary.** Z.AI STOPs at the architect-closure-review boundary. [developer-reported]
