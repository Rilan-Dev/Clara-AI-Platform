#!/usr/bin/env python3
"""Complete the remaining PROJECT_STATE.md Phase 7-A reconciliation edits."""
import sys

PATH = "/home/z/my-project/.worktrees/vc/docs/project-control/PROJECT_STATE.md"
text = open(PATH, encoding="utf-8").read()

replacements = []

# 1. Active blockers paragraph
old_blockers = text[text.index("**None.** No `BLOCKED` state is in effect;"):]
old_blockers = old_blockers[: old_blockers.index("\n\n## Active issues")]
new_blockers = (
    "**None.** No `BLOCKED` state is in effect; the Final State Contract values across control documents agree "
    "(see VERIFICATION_STATE.md §consistency — all five members + the worklog layer reconciled to Phase 7 "
    "`IN_PROGRESS` / sub-phase 7-A implemented-awaiting-review by this commit). The correction-cycle issue "
    "**I-013** stands **`RESOLVED`** (architect-verified disposition). **I-014** is `OPEN` awaiting architect "
    "triage — not a state-machine blocker (it blocks only future `mcp-servers`-dependent capability work, none "
    "authorized). **I-015** is `OPEN` awaiting architect triage — not a state-machine blocker (it blocks only "
    "the production build in developer workspaces lacking a complete `node_modules`, not the recorded "
    "test/typecheck/lint/governance evidence). [developer-reported; the I-013 resolution architect-verified as "
    "communicated in the Phase 6 closure handoff]"
)
replacements.append((old_blockers, new_blockers))

# 2. Insert I-015 row above the I-014 summary row and update the I-014 status cell
i014_row_start = text.index("| I-014 | OPEN (2026-10-02 — developer-reported finding during the Phase 7 planning investigation;")
i014_row = text[i014_row_start:]
i014_row = i014_row[: i014_row.index("\n")]
old_i014_status = "OPEN (2026-10-02 — developer-reported finding during the Phase 7 planning investigation; awaiting architect triage; developer-proposed severity P2)"
new_i014_status = "OPEN (2026-10-02 — developer-reported finding during the Phase 7 planning investigation; awaiting architect triage; developer-proposed severity P2; explicitly reaffirmed OPEN by the Phase 7-A authorization handoff — no re-vendoring, no closure, no disposition change)"
new_i014_row = i014_row.replace(old_i014_status, new_i014_status, 1)
i015_row = (
    "| I-015 | OPEN (2026-10-02 — developer-reported finding during the Phase 7-A validation; awaiting architect "
    "triage; developer-proposed severity P3) | `package.json` declares `@vercel/functions ^3.9.9` but "
    "`package-lock.json` does not contain it (lockfile out of sync), and the developer workspace's `node_modules` "
    "is incomplete relative to `package.json` (≈106 packages absent incl. `@vercel/queue`, `@vercel/functions`, "
    "`@elevenlabs/*` — all declared). Consequence: the production `next build` cannot run in this workspace "
    "without a lockfile-rewriting install (a dependency-graph change outside developer authorization); 19 "
    "pre-existing application-code typecheck errors trace to the missing modules. Not caused by 7-A; 7-A adds "
    "zero dependencies. Full record in `ISSUES.md` §\"Issue records (canonical schema)\" |\n"
)
replacements.append((i014_row, i015_row + new_i014_row))

# 3. Current next action paragraph
na_start = text.index("**ChatGPT architect review of the Phase 7 planning package")
na_old = text[na_start:]
na_old = na_old[: na_old.index("\n\n## Roles")]
na_new = (
    "**ChatGPT architect review of the actual Phase 7-A implementation diff and evidence, then either a "
    "corrective handoff or the explicit 7-B authorization decision** (only ChatGPT may authorize 7-B — "
    "7-A being implemented does NOT authorize 7-B). The architect inspects the 7-A commit (application changes "
    "confined to `src/modules/ai-platform-core/**`: the fail-closed execution-context factory; the fail-closed "
    "adapter registry; the identity/provider/secrets/transport declarations bound to existing services; the "
    "43 focused tests; the disclosed minimal `clara-runtime.ts` type fixes) and verifies the acceptance criteria "
    "in `ZAI_HANDOFF.md` Part II and `CURRENT_PHASE.md`: fail-closed semantics throughout; the incumbent "
    "`ai-core` stack consumed, never duplicated; tenant isolation proven; zero new dependencies; no "
    "DB/persistence; no routes; immutable source byte-unchanged (771/771; I-014-only absence); no runtime import "
    "of the Doable reference; the validation evidence real and recorded (incl. the honestly-recorded build "
    "limitation → I-015); I-014 still OPEN; the governance records distinguishing `[developer-reported]` from "
    "`[architect-verified]`; Phase 7 not `PASS`/`CLOSED`; 7-B not authorized; the Final State Contract "
    "consistent; clean tree; local/remote synchronized. Z.AI is STOPped at the review boundary: no 7-B/7-C "
    "implementation (no Unified Tool Runtime, no `rag_search` migration, no provider tool calling, no agentic "
    "loop), no MCP, no integrations, no Phase 8, no database or deployment operations, no `vercel.json`/Vercel "
    "changes, no R-3/R-4/R-5 resolution, no I-001/I-007/I-014/I-015 resolution, no D-P2/D-P4 resolution — until "
    "the architect's review outcome arrives. Exact continuation instructions: "
    "`docs/project-control/NEXT_ACTION.md`; fresh-session procedure: `docs/project-control/CHAT_CONTINUITY.md`. "
    "[developer-reported]"
)
replacements.append((na_old, na_new))

for i, (old, new) in enumerate(replacements, 1):
    if old not in text:
        print(f"EDIT {i}: ANCHOR NOT FOUND — no change made")
        sys.exit(1)
    if text.count(old) != 1:
        print(f"EDIT {i}: ANCHOR NOT UNIQUE ({text.count(old)}x) — no change made")
        sys.exit(1)
    text = text.replace(old, new, 1)
    print(f"EDIT {i}: applied")

open(PATH, "w", encoding="utf-8").write(text)
print("PROJECT_STATE.md remaining edits complete.")
