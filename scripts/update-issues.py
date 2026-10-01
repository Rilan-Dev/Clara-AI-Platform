#!/usr/bin/env python3
"""Append the I-015 issue record to ISSUES.md and update the next-ID note."""

PATH = "/home/z/my-project/.worktrees/vc/docs/project-control/ISSUES.md"
text = open(PATH, encoding="utf-8").read()

ok = True

def replace_once(old, new, label):
    global text, ok
    if old not in text or text.count(old) != 1:
        print(f"FAIL [{label}]: anchor not found or not unique")
        ok = False
        return
    text = text.replace(old, new, 1)
    print(f"applied [{label}]")

# 1. Update the preamble next-sequential-ID note
replace_once(
    "New issues from Phase 6 onward (next sequential ID: **I-015**) are appended here",
    "New issues from Phase 6 onward (next sequential ID: **I-016**) are appended here",
    "next-id-note",
)

# 2. Update the preamble narrative to mention I-015
replace_once(
    "**I-014** was opened 2026-10-02 by the developer during the Phase 7 planning investigation (a discovered out-of-scope finding, reported per the out-of-scope-discovery rule — not corrected, not resolved). Records appear below only when an actual finding exists — no defects are invented.",
    "**I-014** was opened 2026-10-02 by the developer during the Phase 7 planning investigation (a discovered out-of-scope finding, reported per the out-of-scope-discovery rule — not corrected, not resolved). **I-015** was opened 2026-10-02 by the developer during the Phase 7-A implementation validation (a discovered out-of-scope environmental/dependency-lockfile finding, reported per the same rule — not corrected, not resolved). Records appear below only when an actual finding exists — no defects are invented.",
    "preamble-narrative",
)

# 3. Append the I-015 record after the I-014 record (the file's last section)
i014_tail_anchor = "| Related worklog/session | `worklog.md` Phase 7 planning entry (2026-10-02); `docs/project-control/sessions/SESSION-011.md` (the Phase 7 planning session); `docs/project-control/PHASE-7-PLAN.md` §2 (baseline), §11 (risks), §12 (issue dependencies), §23 (ratification list); `VERIFICATION_STATE.md` §Phase 7 planning (validation row 5) |"
i015_record = i014_tail_anchor + """

### I-015 — `package.json`/`package-lock.json` out of sync (`@vercel/functions` declared but unlocked) and the developer workspace `node_modules` incomplete — the production build cannot run in this workspace without an unauthorized dependency-graph change

| Field | Value |
|---|---|
| Issue ID | I-015 |
| Title | `package.json` declares `@vercel/functions ^3.9.9` but `package-lock.json` does not contain it (lockfile out of sync with the manifest), and the developer workspace's `node_modules` is incomplete relative to `package.json` (≈106 declared packages absent) — consequently the production `next build` cannot run in the developer workspace without an install that would rewrite the lockfile (a dependency-graph change outside developer authorization) |
| Phase | Phase 7 — AI Platform Core Foundation (sub-phase 7-A — discovered during the implementation validation, at the production-build attempt); the desync itself predates the program (present at the vendoring-era dependency state; not introduced by any project-control commit) |
| Severity | not yet assigned — awaiting architect triage (developer-proposed: **P3** — a real but bounded tooling/environment gap: it blocks only build-attempt evidence in developer workspaces, not the recorded test/typecheck/lint/governance evidence; the repository's declared dependency graph is untouched by Phase 7-A) |
| Status | `OPEN` (lifecycle: `OPEN` [developer-reported finding, 2026-10-02] — awaiting architect triage) |
| Date identified | 2026-10-02 |
| Reporter / role | Z.AI — developer self-discovery during the Phase 7-A validation (the handoff §11 "build if applicable" requirement) |
| Finding | (1) `package.json` declares `@vercel/functions ^3.9.9` (used by `src/app/api/voice/sarvam/realtime/route.ts` and `src/app/api/voice/sarvam/tts-realtime/route.ts`) but `package-lock.json` contains no `node_modules/@vercel/functions` entry — the lockfile is out of sync with the manifest (an `npm install` in the workspace reports "added 106 packages, removed 8 packages, and changed 844 packages" — it would rewrite the lockfile). (2) The developer workspace's `node_modules` is incomplete relative to `package.json`: `@vercel/queue`, `@vercel/functions`, `@vercel/analytics`, `@vercel/speed-insights`, `@elevenlabs/client`, `@elevenlabs/elevenlabs-js` (all declared in `package.json`) are absent from the installed tree. (3) Consequences: the production `next build` cannot run in this workspace (webpack module resolution of the declared-but-uninstalled imports fails); 19 of the 24 pre-existing application-code typecheck errors at the 7-A baseline trace to the missing modules (TS2307 "Cannot find module"); `npm ci` cannot complete either (it requires manifest/lockfile sync). None of this affects the vitest suite (108 files / 960 tests pass), the module-scoped lint, the model-config validation, or the governance validators |
| Evidence | [developer-reported, re-runnable] `node -e "require('./package.json')"` → `@vercel/functions ^3.9.9` declared; `node -e "require('./package-lock.json')"` → no `node_modules/@vercel/functions` entry (lockfile v3); `ls node_modules/@vercel/ node_modules/@elevenlabs/` → absent; `npm install --dry-run` → "added 106 packages, removed 8 packages, and changed 844 packages" (lockfile-rewriting); `npm run type-check` at the pre-implementation baseline `ac06ca72` → 24 application-code errors (19 in files importing the missing modules; 5 in `src/modules/ai-platform-core/clara-runtime.ts` — fixed within the 7-A module scope); `npx vitest run` → 108 files / 960 tests all pass (the test suite does not exercise the missing modules) |
| Affected commit | the desync is present in the dependency state inherited at the program baseline (visible at `ac06ca72`; not introduced by any project-control commit — all program commits are documentation-only; the 7-A implementation commit changes no dependency file) |
| Affected files/areas | `package.json` / `package-lock.json` (manifest ↔ lockfile desync — the lockfile lacks `@vercel/functions`); the developer workspace `node_modules` (incomplete install); the build-attempt capability of any developer workspace without a complete install (`next build`); 19 pre-existing application-code typecheck errors in unrelated route/component files |
| Acceptance criterion affected | none of the 7-A acceptance criteria — the 7-A deliverable adds zero dependencies and requires no build to function; the finding blocks only the optional "build if applicable" evidence item (handoff §11 D), which is recorded as not-runnable with this pre-existing cause. It may affect future phases' build-evidence expectations (Gate F runtime/build verification would need a synchronized install — an architect-controlled dependency-graph decision) |
| Security / tenancy impact | none — a tooling/environmental finding; no application security surface; no secrets involved; the repository's declared dependency graph is unchanged by the finding's discovery |
| Correction required | none yet — awaiting architect triage (the developer does not self-assign corrections, and the correction itself — regenerating/synchronizing the lockfile or completing the workspace install — is a dependency-graph operation outside the 7-A authorization) |
| Correction scope | none yet — awaiting architect triage |
| Explicit non-scope | the Phase 7-A session performed no correction: no `npm install` (lockfile-neutral or otherwise), no `npm ci`, no `package.json`/`package-lock.json` modification, no dependency addition or removal; the 7-A implementation ships with zero dependency changes (verified by the changed-path scope check) |
| Expected verification | for whichever triage option the architect directs: (a) synchronize the lockfile to the manifest (`npm install` committed by an authorized operator) — then `node -e` confirms the `@vercel/functions` lockfile entry exists and `npm ci` completes; (b) accept the documented gap — build evidence remains unavailable in developer workspaces and Gate F build/runtime verification relies on the deployment controller (D-004); either way the 7-A validation record (tests/typecheck/lint/governance/immutable-source) stands as recorded |
| Developer correction commit | none yet — awaiting architect triage |
| Architect review status | pending — no architect review or triage of this issue has occurred |
| Resolution evidence | — (filled only at `RESOLVED`) |
| Resolution date | — |
| Related decision | none yet (a triage decision may later be recorded in `DECISIONS.md` by the architect; interacts with D-004/D-005 operations authority for build/deployment verification) |
| Related worklog/session | `worklog.md` Phase 7-A implementation entry (2026-10-02); `docs/project-control/sessions/SESSION-012.md` (the Phase 7-A implementation session); `VERIFICATION_STATE.md` §Phase 7-A implementation (validation row 11); `ZAI_HANDOFF.md` Part II (the 7-A instance — testing-requirements row 11) |"""
replace_once(i014_tail_anchor, i015_record, "i015-record")

if ok:
    open(PATH, "w", encoding="utf-8").write(text)
    print("ISSUES.md updated.")
else:
    print("ABORTED — file NOT modified.")
