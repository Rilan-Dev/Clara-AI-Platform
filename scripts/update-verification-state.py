#!/usr/bin/env python3
"""Update VERIFICATION_STATE.md for the Phase 7-A implementation stage."""

PATH = "/home/z/my-project/.worktrees/vc/docs/project-control/VERIFICATION_STATE.md"
text = open(PATH, encoding="utf-8").read()

ok = True

def replace_once(old, new, label):
    global text, ok
    if old not in text:
        print(f"FAIL [{label}]: anchor not found")
        ok = False
        return
    if text.count(old) != 1:
        print(f"FAIL [{label}]: anchor not unique ({text.count(old)}x)")
        ok = False
        return
    text = text.replace(old, new, 1)
    print(f"applied [{label}]")

# ── 1. Section title + intro blockquote ──────────────────────────────────────
replace_once(
    "## Phase 7 — AI Platform Core Foundation — planning package — `PLANNED`",
    "## Phase 7 — AI Platform Core Foundation — `IN_PROGRESS` (sub-phase 7-A — Host Contracts / Adapter Foundation — implemented `[developer-reported]`; architect review of the actual diff PENDING; 7-B/7-C NOT authorized)",
    "section-title",
)

old_intro_start = "> Phase 7 **planning/baseline handoff issued by ChatGPT on 2026-10-02**"
old_intro = text[text.index(old_intro_start):]
old_intro = old_intro[: old_intro.index("\n\n| Field | Value |")]
new_intro = (
    "> Phase 7 **planning/baseline handoff issued by ChatGPT on 2026-10-02** [architect-verified workflow action] "
    "(baseline `3657035a`). The planning package was produced and submitted by the developer on 2026-10-02 "
    "(`PHASE-7-PLAN.md`) — all `[developer-reported]` proposals. **The architect reviewed the planning package — "
    "outcome `PASS` (2026-10-02, as communicated in the Phase 7-A implementation authorization handoff) and issued "
    "the explicit Phase 7-A implementation authorization (sub-phase 7-A ONLY)** [architect-verified — as "
    "communicated in the 7-A handoff]: Phase 7-A — Host Contracts / Adapter Foundation; 7-B/7-C/MCP/integrations/"
    "agent runtime/memory/skills/attachments/image generation/marketplace/templates/automation/collaboration/"
    "DB-schema/deployment/Phase 8 all remain unauthorized; D-P3 ratified (D-021); the phase-ladder reconciliation "
    "ratified (D-022); I-014 explicitly remains OPEN; Gate E `NOT_APPLICABLE` for 7-A unless persistence "
    "unexpectedly surfaces; Gate F not executed (D-P4 pending). The developer executed the 7-A authorization on "
    "2026-10-02: the feature worktree was synchronized to the authoritative remote tip `ac06ca72` (verified "
    "fast-forward from the stale local `31ffd6f4`; 35 documentation/governance-only commits); the baseline was "
    "re-verified; the 7-A foundation was implemented under `src/modules/ai-platform-core/**`; validation ran with "
    "recorded results; one focused implementation commit was created — **all `[developer-reported]`; the "
    "implementation report is developer evidence until the architect reviews the actual diff; no `PASS`, no "
    "approval, no closure claimed for Phase 7**. The planning-stage records below are preserved as the historical "
    "planning evidence; the 7-A implementation records follow them."
)
replace_once(old_intro, new_intro, "intro")

# ── 2. Insert the 7-A subsections after the planning validation block ─────────
anchor = "The planning-stage aggregate evidence (harness + report) is persisted outside the repository (`/home/z/my-project/scripts/verify-doable-extraction-in-clara-layout.sh` + `phase7-planning-verification-report.json`), per the Phase 3/4/5/6 convention. Running any check is never itself evidence of phase completion (the contract above)."
if anchor not in text:
    print("FAIL [7a-insert]: anchor not found")
    ok = False
else:
    seven_a = anchor + """

### Phase 7-A implementation (developer-executed 2026-10-02 — all `[developer-reported]`, re-runnable)

| Field | Value |
|---|---|
| Assignment | Phase 7-A implementation authorization handoff received from ChatGPT on 2026-10-02 (baseline after synchronization `ac06ca72516282bd78f8d0f37afaa46062322b53`): worktree synchronization → baseline re-verification → implement exactly the reviewed 7-A design under `src/modules/ai-platform-core/**` → focused tests → governance updates → one focused commit → the structured report → HARD STOP |
| Baseline (before implementation) | `ac06ca72` — the authoritative remote feature-branch tip; the local feature worktree was stale at `31ffd6f4` and synchronized by verified fast-forward (clean tree; remote tip re-verified after fresh fetch; `31ffd6f4` strict ancestor — 35 commits, no divergence; history preserved; no reset/force-push/rewrite; `main`/`Vercel-Prod` untouched). The 35 incoming commits verified documentation/governance-only (phase records; the architect-review/authorization records; the authorization-boundary restoration commits; the only non-docs change is the pre-existing `vercel.json` preview-deployment enablement of the historical `b65725e5` lineage). Immutable tree hashes recorded pre-implementation: `doable-source` `a42aee79` · `dependency-closure` `ee07c362` · `ui-reference` `b76b8f34` · `doable-source-extensions` `54606204`. Pre-implementation typecheck baseline: 24 pre-existing application-code errors (5 within `src/modules/ai-platform-core/clara-runtime.ts`; 19 in unrelated files — missing-optional-dependency/unrelated-route defects) + 3419 pre-existing errors in the immutable `docs/doable-source/**` reference trees |
| Implementation state | **Delivered 2026-10-02 — architect review of the actual diff PENDING.** New files: `contracts.ts` (host-neutral seam vocabulary — `PlatformExecutionContext`, `ExecutionContextInput`, `SurfaceKind`, the four 7-A adapter ports, `PlatformAdapters`, `PlatformAdapterName`; types only); `execution-context.ts` (the fail-closed `createExecutionContext` factory — mandatory tenant (`orgId`→`tenantId`) and KB bindings, no ambient fallback, unknown-key typo guard, frozen context + frozen metadata copy; `ExecutionContextError`; `isValidPlatformExecutionContext`/`assertExecutionContext` accepting only factory-produced frozen contexts; `assertTenantScope` cross-tenant guard); `adapter-registry.ts` (`createPlatformAdapterRegistry` — per-slot method-shape validation at registration, validate-then-commit atomicity, duplicate-registration rejection preserving the live binding, deterministic exact-slot lookup, unknown-adapter controlled failure, frozen committed set; `AdapterRegistrationError`/`UnknownAdapterError`/`AdaptersNotRegisteredError`); `clara-adapters.ts` (`buildClaraPlatformAdapters` — identity → the factory; provider → delegation to the incumbent `claraRuntime.resolveProvider` seam carrying the caller's tenant context unchanged; secrets → `PlatformSecretAccessError` always-fail-closed non-transfer declaration; transport → the three existing-routes-only frozen declarations; `getClaraPlatformRegistry`/`getClaraPlatformAdapter` lazily-initialized singleton registering exactly once); the three colocated test files (43 tests). Modified: `index.ts` (additive re-exports); `README.md` (the 7-A foundation documentation — incumbent boundaries preserved); `clara-runtime.ts` (the disclosed minimal behavior-preserving type-correctness fixes: corrected import paths for `resolveAIConfigCached` (`@/modules/ai-core/resolve-cache`) and `ResolvedAIConfig` (`@/modules/ai-core/config-types`); `?? undefined` nullability coercions on resolver inputs; the grounding `surface` value corrected to the valid `QuerySurface` vocabulary — "chat" → "workspace". No behavioral redesign; the incumbent `ai-core` stack untouched) |
| Implementation commit | *(this commit)* — `feat: establish phase 7-a host contracts and adapter foundation`, the immediate child of `ac06ca72` on `feature/ai-core-from-doable-source`; application changes confined to `src/modules/ai-platform-core/**` (7 new + 3 modified); documentation changes confined to the repository-root `worklog.md` and `docs/project-control/**`. A developer implementation deliverable — **not a reviewed implementation** (the latest architect-verified implementation remains `4dc8a573`), not an approval, not a closure record |
| Scope | Application: `src/modules/ai-platform-core/**` only (the authorized 7-A scope; zero new runtime dependencies; no migrations/Supabase; no routes; no `vercel.json`; no immutable-source changes; no 7-B/7-C/MCP/integrations work). Documentation: `worklog.md` + `docs/project-control/**` (D-021/D-022 appended; I-015 appended; the Part II instance replaced; `CURRENT_PHASE.md`/`PROJECT_STATE.md`/`NEXT_ACTION.md`/this register reconciled; `SESSION-012.md` + its index row). `RISKS.md` untouched; `PHASE-7-PLAN.md` untouched (the reviewed planning package stands) |
| Issues opened | **I-015** (2026-10-02 — opened by the developer during the 7-A validation per the out-of-scope-discovery rule: `package.json` declares `@vercel/functions ^3.9.9` but `package-lock.json` does not contain it, and the workspace `node_modules` is incomplete relative to `package.json` (≈106 packages absent incl. `@vercel/queue`, `@vercel/functions`, `@elevenlabs/*`) — the production `next build` is therefore not runnable in this workspace without a lockfile-rewriting install (an unauthorized dependency-graph change); the 19 unrelated pre-existing application-code typecheck errors trace to the missing modules; status `OPEN`, `[developer-reported]`, awaiting architect triage; developer-proposed P3). **I-014 remains OPEN** — explicitly reaffirmed by the 7-A authorization (no re-vendoring, no closure, no disposition change); the reconstructed blob verifier re-proves the I-014 state unchanged (771/771 present pinned blobs byte-identical; the 31 absent files confined to the `mcp-servers/` family) |
| Gate applicability (this stage) | Gate A (scope) — developer-checked: application changes within `src/modules/ai-platform-core/**`; documentation changes within `worklog.md` + `docs/project-control/**`; immutable/production/`vercel.json` untouched; no dependency changes. Gate B (implementation) — the 7-A deliverable complete per the handoff's §5 concept set (execution context; adapter registry; host seam) ([developer-reported]). Gate C (test) — the validation commands below, run and recorded (43/43 targeted; 960/960 full suite; typecheck module-clean with the baseline comparison; lint clean). Gate D (code review) — **architect-only; PENDING** (no architect review of the 7-A diff has occurred; the architect will independently inspect the actual diff before deciding on 7-B — a future review is never written as completed). Gate E (database) — **`NOT_APPLICABLE`** for 7-A as ratified by the authorization handoff (no persistence/schema change was introduced — assessed and recorded, not silently skipped; the handoff directive: if implementation had required persistence, STOP and report — it did not). Gate F (deployment) — **not executed** (no deployment performed or authorized for 7-A; D-P4 remains pending — the conditional determination stands recorded per the handoff §2) |

### Phase 7-A implementation validation (developer-executed 2026-10-02 — commands and results; all `[developer-reported]`)

| # | Check | Method / result |
|---|---|---|
| 1 | Targeted 7-A unit tests | `npx vitest run src/modules/ai-platform-core/` → **4 files / 43 tests, all pass** (execution-context 15; adapter-registry 10; clara-adapters 16; the incumbent clara-runtime seam 2 — unchanged and passing) |
| 2 | Full test suite (regression) | `npx vitest run` → **108 test files / 960 tests, all pass** — zero regressions anywhere in the application |
| 3 | Typecheck | `npm run type-check` (tsconfig.typecheck.json) → application-code errors **24 → 19**: the 5 pre-existing errors within `src/modules/ai-platform-core/clara-runtime.ts` eliminated (the module is clean); **zero new application-code errors introduced**; the remaining 19 are pre-existing in unrelated files (missing optional deps `@vercel/queue`/`@vercel/functions`/`@elevenlabs/*` + unrelated-route defects — untouched, out of 7-A scope, → I-015 context); the 3419 pre-existing errors inside the immutable `docs/doable-source/**` reference trees unchanged (never in scope) |
| 4 | Lint (module-scoped) | `npx eslint src/modules/ai-platform-core/` → **0 errors, 0 warnings** |
| 5 | Model config | `npm run validate:model-config` → **PASS** |
| 6 | Governance regressions | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` → **8/8, exit 0**; `bash docs/project-control/verification/correction-cycle-test.sh` → **exit 0 (24/24)** |
| 7 | Library integrity | `node verification/validate-library.mjs` (from `docs/doable-source/`) → **PASS** (21 capabilities · 30 edges · 0 errors · 0 warnings) |
| 8 | Immutable-source verification | `git diff 03482584 HEAD --stat -- <four immutable trees>` → **empty**; post-implementation tree hashes identical to the recorded pre-implementation baseline (`a42aee79`/`ee07c362`/`b76b8f34`/`54606204`); the reconstructed worktree blob verifier (`/home/z/my-project/scripts/verify-immutable-blobs-in-worktree.sh` — the planning session's harness was not carried over the workspace reset; this session's equivalent verifies every manifest-pinned file present in the worktree against its pinned Git blob hash) → **802 pinned · 771 present · 771/771 byte-verified · 0 mismatches · the 31 absent files all under `mcp-servers/` (the I-014 family, unchanged)**, exit 0 |
| 9 | Runtime import scan | static search of `src/**` for `doable-source` imports (`from`/`import()`/`require`) → **zero matches** |
| 10 | Secret-pattern scan | credential/token/PEM patterns across all changed paths → **no matches** |
| 11 | Production build | **not runnable in this workspace** — `next build` requires the declared-but-uninstalled modules (`@vercel/queue` etc. absent from `node_modules`); completing the install would rewrite the out-of-sync `package-lock.json` (a dependency-graph change outside 7-A authorization). Recorded as the pre-existing environmental finding **I-015** (report, do not absorb). The 7-A change introduces zero dependencies and is fully covered by checks 1–10; per D-020 a build was never sufficient closure evidence on its own |
| 12 | Changed-path scope check | `git status` / `git show --name-only` (post-commit) — application changes within `src/modules/ai-platform-core/**`; documentation changes within `worklog.md` + `docs/project-control/**`; nothing else |
| 13 | Final State Contract consistency | phase = Phase 7, status = `IN_PROGRESS` (7-A implemented, awaiting architect review; 7-B/7-C not authorized) agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), this register, and the latest `worklog.md` entry (consistency table below) |
| 14 | Git hygiene | full diff inspected; working tree clean after commit; local HEAD = origin tip after push; the 7-A commit is the immediate child of `ac06ca72` |

The 7-A validation harness is persisted outside the repository (`/home/z/my-project/scripts/verify-immutable-blobs-in-worktree.sh`), per the Phase 3/4/5/6 convention. Running any check is never itself evidence of phase completion (D-020) — Gate D architect review of the actual diff is required and PENDING.
"""
    text = text.replace(anchor, seven_a, 1)
    print("applied [7a-insert]")

# ── 3. Review trail rows ─────────────────────────────────────────────────────
trail_anchor = "| 2026-10-02 | **Phase 7 planning package delivered (developer); architect review PENDING.**"
if trail_anchor in text:
    new_rows = trail_anchor + """ Z.AI executed the planning handoff: pre-flight verified; the planning package `docs/project-control/PHASE-7-PLAN.md` produced (objective determination incl. the plan-ladder reconciliation proposal; capability inventory; existing-vs-missing matrix; reuse map; A–E classification; architecture; adapter boundaries; dependency graph; risks; issue dependencies; implications; testing strategy; Gates A–F; acceptance criteria; rollback; sub-phases 7-A/7-B/7-C-optional; stopping boundary; ratification list; validation record); the control state reconciled to Phase 7 `PLANNED`; the new issue **I-014** recorded OPEN awaiting architect triage; `SESSION-011` + the append-only worklog entry recorded. No implementation performed; no approval claimed. [developer-reported — awaiting architect review] |
| 2026-10-02 | **Phase 7 planning-package review: `PASS`; Phase 7-A implementation authorization issued (sub-phase 7-A ONLY).** ChatGPT reviewed the planning package — outcome `PASS` — and issued the explicit Phase 7-A — Host Contracts / Adapter Foundation implementation authorization: exactly 7-A; 7-B/7-C/MCP/integrations/agent runtime/memory/skills/attachments/image generation/marketplace/templates/automation/collaboration/DB-schema/deployment/Phase 8 unauthorized; D-P3 ratified (→ D-021); the phase-ladder reconciliation ratified (→ D-022); I-014 remains OPEN (no re-vendoring, no closure, no disposition change); Gate E `NOT_APPLICABLE` for 7-A unless persistence surfaces (STOP-and-report if so); Gate F not executed (D-P4 pending); the feature-worktree synchronization directed (local `31ffd6f4` → remote tip `ac06ca72`); zero-new-dependency/DB/route constraints; focused fail-closed test requirements; the governance-update conventions; one focused commit; the structured report; the FINAL HARD STOP (the architect will independently inspect the actual 7-A diff before deciding whether 7-B can be authorized). [architect-verified — as communicated in the Phase 7-A implementation authorization handoff] |
| 2026-10-02 | **Phase 7-A implemented (developer); architect review of the actual diff PENDING.** Z.AI executed the 7-A authorization: worktree synchronized (verified fast-forward); baseline re-verified (incl. the recorded pre-implementation typecheck baseline); the 7-A foundation implemented under `src/modules/ai-platform-core/**` (contracts; fail-closed execution-context factory; fail-closed adapter registry; the four Clara adapter bindings; 43 focused tests; the disclosed minimal `clara-runtime.ts` type fixes); validation recorded (43/43 targeted; 960/960 full suite; typecheck module-clean with zero new errors; lint clean; governance 8/8 + 24/24; library integrity PASS; immutable source 771/771 byte-verified, I-014-only absence; import/secret scans clean; the build limitation → I-015); the governance state reconciled (D-021/D-022; I-015; the Part II instance; CURRENT_PHASE/PROJECT_STATE/NEXT_ACTION/this register; the worklog entry; SESSION-012). No 7-B/7-C/MCP work; no approval claimed. [developer-reported — awaiting architect review of the actual diff] |"""
    # Replace the original row's trailing " |" carefully: find the full original row line
    text = text.replace(trail_anchor, new_rows, 1)
    print("applied [trail-rows]")
else:
    print("FAIL [trail-rows]: anchor not found")
    ok = False

# ── 4. Outstanding architect verification state ───────────────────────────────
old_out_start = text.index("**The planning-package review — PENDING.**")
old_out = text[old_out_start:]
old_out = old_out[: old_out.index("\n\n---\n\n## State-machine consistency")]
new_out = (
    "**The 7-A implementation review — PENDING.** No ChatGPT review of the actual 7-A diff has occurred; no "
    "`PASS`, `PASS_WITH_FOLLOWUP`, or `CORRECTION_REQUIRED` outcome exists for the 7-A implementation; Phase 7 is "
    "neither approved nor closed, and 7-B/7-C are not authorized. Pending architect actions: the independent "
    "inspection of the actual 7-A diff and evidence (against the acceptance criteria in `ZAI_HANDOFF.md` Part II "
    "and `CURRENT_PHASE.md`); the 7-B authorization decision (7-A being implemented does NOT authorize 7-B); the "
    "I-014 triage and the I-015 triage; D-P2/D-P4 dispositions. The planning-package review itself is complete "
    "(`PASS`, 2026-10-02 — recorded above). Gate E = `NOT_APPLICABLE` for 7-A (no persistence surfaced — the "
    "ratified conditional determination, recorded above); Gate F = not executed for 7-A (no deployment performed "
    "or authorized; D-P4 remains pending) — assessed and recorded, not silently skipped."
)
replace_once(old_out, new_out, "outstanding")

# ── 5. Consistency table ─────────────────────────────────────────────────────
old_cons_start = text.index("## State-machine consistency (Final State Contract, plan §Final State Contract)")
old_cons = text[old_cons_start:]
old_cons = old_cons[: old_cons.index("\n\n## Appendix — re-runnable validation commands")]
new_cons = """## State-machine consistency (Final State Contract, plan §Final State Contract)

| Field | Value (2026-10-02, at the Phase 7-A implementation commit — review boundary) | Agreement |
|---|---|---|
| `VERIFICATION_STATE.phase` | Phase 7 — AI Platform Core Foundation, **`IN_PROGRESS`** (sub-phase 7-A — Host Contracts / Adapter Foundation — implemented `[developer-reported]`; architect review of the actual diff PENDING; 7-B/7-C NOT authorized; the planning-package review itself returned `PASS` 2026-10-02 [architect-verified — as communicated in the 7-A handoff]); Phases 0–6 all `CLOSED` | ✓ (this register) |
| `PROJECT_STATE.current_phase` | Phase 7 — AI Platform Core Foundation, `IN_PROGRESS` (7-A implemented, awaiting architect review; 7-B/7-C not authorized) | ✓ (reconciled by this commit) |
| `CURRENT_PHASE.phase` | The Phase 7-A implementation-stage contract (status `IN_PROGRESS`; the implementation-stage record; the planning-stage contract is preserved in Git history at `ac06ca72`) | ✓ (reconciled by this commit) |
| `NEXT_ACTION.phase` | Phase 7 `IN_PROGRESS` — awaiting the architect's review of the actual 7-A diff and evidence, then the 7-B authorization decision (or a corrective handoff) | ✓ (reconciled by this commit) |
| `ZAI_HANDOFF.phase` | Part II Phase identity: the **Phase 7-A implementation-authorization handoff instance** (status `IN_PROGRESS` — executed, awaiting architect review; the superseded planning instance remains recoverable in Git history at `ac06ca72`) | ✓ (reconciled by this commit) |
| latest worklog phase entry | Phase 7-A — Host Contracts / Adapter Foundation — `IN_PROGRESS` (implemented `[developer-reported]`, awaiting architect review) (appended to the repository-root `worklog.md` by this commit; earlier entries preserved unrewritten, including the Phase 7 planning entry) | ✓ |
| latest verified commit | `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884` — the corrected Phase 6 state, **architect-verified by the `PASS` re-review (2026-10-01)** — remains the latest architect-verified implementation. This 7-A implementation commit is a developer deliverable — recorded, not architect-reviewed (a future review is never written as completed); `b65725e5` remains an external repository event (provenance not independently established) | ✓ |
| baseline | The Phase 7-A authorization was issued against the authoritative remote tip `ac06ca72516282bd78f8d0f37afaa46062322b53` (the stale local worktree `31ffd6f4` was synchronized to it by verified fast-forward per the handoff §3); this 7-A implementation commit is its immediate child. The next baseline will be set by the architect's 7-B authorization handoff — **not yet issued** | ✓ |

If any of these disagree at a future boundary, the phase is **BLOCKED until reconciled**. This Phase 7-A implementation commit reconciles **all five Final State Contract members and the worklog layer to Phase 7 `IN_PROGRESS` / 7-A implemented-awaiting-review** (the previous transition states — Phase 7 `PLANNED` at the planning-package commit `f2c403f1` and the restored planning-boundary state at `ac06ca72` — are preserved in Git history and in the Phase 7 section above). A fresh session finding this state must read the Phase 7 section above (the planning evidence and the 7-A implementation evidence), the actual 7-A diff (`git show` this commit), `ZAI_HANDOFF.md` Part II (the Phase 7-A instance — its acceptance criteria and STOP boundary), and `NEXT_ACTION.md` before acting; Z.AI must not proceed past the review STOP boundary without the architect's explicit next authorization. The earlier reconciliations — pending at `58856e0b` (completed by `3706b977`), pending at `d12b0582` (completed by `5febaacd`), the Phase 4 closure reconciliation at `16b89a94` (accepted with the evidence-classification correction at `8d8595d0`), the Phase 5 `IN_PROGRESS` reconciliation at `f9ce6a83` (corrected at `fb4ad5f5`), the Phase 5 closure reconciliation at `f62326db`, the Phase 6 `IN_PROGRESS` reconciliation at `c0cca964` (corrected at `4dc8a573`), the Phase 6 closure reconciliation at `3657035a`, and the Phase 7 `PLANNED` reconciliation at `f2c403f1` — are documented at those commits."""
replace_once(old_cons, new_cons, "consistency")

if ok:
    open(PATH, "w", encoding="utf-8").write(text)
    print("VERIFICATION_STATE.md updated.")
else:
    print("ABORTED — file NOT modified (failed edits above).")
