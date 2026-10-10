#!/usr/bin/env bash
# validate-phase4-control-docs.sh — Phase 4 validation suite (developer-executed, read-only)
# Validates the Worklog and Session Audit layer (worklog.md + docs/project-control/sessions/
# + phase-state reconciliation to Phase 4) against the 19 required Phase 4 validation checks
# (refreshed Phase 4 handoff, 2026-10-01, "Required validation").
# Usage:
#   PRE-COMMIT : stage all changes first (git add -f worklog.md ; git add docs/project-control)
#                then: bash /home/z/my-project/scripts/validate-phase4-control-docs.sh
#   POST-COMMIT: working tree clean (right after commit / push); the script auto-detects
#                HEAD-commit mode and additionally verifies message, parent, and sync.
set -u
REPO="/home/z/my-project/.worktrees/vc"
cd "$REPO" || exit 2
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS: $1"; }
bad(){ FAIL=$((FAIL+1)); echo "FAIL: $1"; }

WL="worklog.md"
SR="docs/project-control/sessions"
PS="docs/project-control/PROJECT_STATE.md"
CP="docs/project-control/CURRENT_PHASE.md"
NA="docs/project-control/NEXT_ACTION.md"
ZH="docs/project-control/ZAI_HANDOFF.md"
VS="docs/project-control/VERIFICATION_STATE.md"

# ---- changed-file detection (staged pre-commit OR last commit post-commit) ----
STAGED=$(git diff --cached --name-only HEAD 2>/dev/null || true)
if [ -n "$STAGED" ]; then
  CHANGED="$STAGED"; MODE="staged (pre-commit)"
else
  CHANGED=$(git show --name-only --pretty=format: HEAD 2>/dev/null | sed '/^$/d')
  MODE="HEAD commit (post-commit)"
fi
echo "### validation mode: $MODE"
echo "### changed files: $(echo "$CHANGED" | wc -l) -> $(echo "$CHANGED" | tr '\n' ' ')"

echo "=== 1. worklog.md exists ==="
[ -f "$WL" ] && ok "canonical project worklog exists at the repository root" || bad "worklog.md missing at repository root"

echo "=== 2. Canonical structure verified ==="
for s in '# worklog.md — Canonical Clara Project Worklog' \
         '## 1. Authority classification (read first)' \
         '## 2. Evidence classes, status vocabulary, entry schema' \
         '## 3. Worklog conventions (binding)' \
         '## 4. Branch context before Phase 0 (recorded facts, not phase entries)'; do
  rg -q -F "$s" "$WL" && ok "structure: $s" || bad "structure missing: $s"
done
for r in '| Current phase / status / blockers / next action | `PROJECT_STATE.md` |' \
         '| Active-phase contract and stopping boundary | `CURRENT_PHASE.md` |' \
         '| Fresh-session continuation instruction | `NEXT_ACTION.md` |' \
         '| Active Z.AI handoff instance | `ZAI_HANDOFF.md` (Part II) |' \
         '| Verification evidence and review outcomes | `VERIFICATION_STATE.md` |'; do
  rg -q -F "$r" "$WL" && ok "authority-table row: $r" || bad "authority-table row missing: $r"
done
for v in '`PLANNED`' '`IN_PROGRESS`' '`BLOCKED`' '`CORRECTION_REQUIRED`' '`VERIFIED`' '`CLOSED`'; do
  rg -q -F "$v" "$WL" && ok "status value present: $v" || bad "status value missing: $v"
done
for f in '| Phase | phase number and name |' '| Status | one canonical status value |' \
         '| Date | project date (YYYY-MM-DD) plus repository-derived commit timestamps where available |' \
         '| Roles | developer / architect responsibilities for the entry'"'"'s events |' \
         '| Objective | what the phase was to accomplish |' \
         '| Implementation | what was built or changed [developer-reported] |' \
         '| Verification | validation evidence [developer-reported] |' \
         '| Review | architect review outcome [architect-verified, or explicitly NOT YET REVIEWED] |' \
         '| Commits | resulting commit SHAs with messages |' \
         '| Issues / correction | issues opened or resolved; corrections applied |' \
         '| Next action | the recorded next step at entry time |'; do
  rg -q -F "$f" "$WL" && ok "entry-schema field: $f" || bad "entry-schema field missing: $f"
done
rg -q -F '**Append-only.**' "$WL" && ok "append-only convention declared" || bad "append-only convention missing"
rg -q -F 'append-only except for explicit corrections' "$WL" && ok "explicit-corrections exception present" || bad "explicit-corrections exception missing"
rg -q -F 'No fabricated timestamps.' "$WL" && ok "no-fabricated-timestamps policy present" || bad "no-fabricated-timestamps policy missing"
rg -q -F 'No secrets, no hidden reasoning, no unsupported claims.' "$WL" && ok "security/no-unsupported-claims policy present" || bad "security policy missing"

echo "=== 3. Phases 0-3 represented ==="
for h in '## 2026-10-01 — Phase 0 — Baseline and Control-System Reconnaissance — `CLOSED`' \
         '## 2026-10-01 — Phase 1 — Durable Project-Control Foundation — `CLOSED`' \
         '## 2026-10-01 — Phase 2 — Z.AI Developer Handoff System — `CLOSED`' \
         '## 2026-10-01 — Phase 3 — Cross-Chat ChatGPT Continuity — `CLOSED`'; do
  rg -q -F "$h" "$WL" && ok "phase entry: $h" || bad "phase entry missing: $h"
done
for c in 'adbc9e16763c3813886e1a79fff2d7d3b2a889ae' 'bcc1769d3ee0e5d75a27059e6823280cab3a1f40' \
         '3a8b8b4ef8a62c8c7843bbe30af4d046ca9b002f' '6d1c6c9d61a2f3a54a48acaa2e9fc135facb3309' \
         '31ffd6f4330753f9b42dba231d7e02589d12eb77' '58856e0be6325d0326a2d7c8cde6d6d6312b9000' \
         '3706b977099e8a1aa8b867c936149439b1f700c0' 'd12b0582f370c0192a97bad0ad1b1dc81b7f0713'; do
  rg -q -F "$c" "$WL" && ok "commit recorded in worklog: $c" || bad "commit missing from worklog: $c"
done
rg -q -F 'returned **`CORRECTION_REQUIRED`** (2026-10-01)' "$WL" && ok "Phase 0 correction cycle recorded" || bad "Phase 0 correction cycle missing"
rg -q -F 'Phase 0 was **`CLOSED` by architect advancement**' "$WL" && ok "Phase 0 closure-by-advancement recorded" || bad "Phase 0 closure missing"
for p in 'Phase 1 → `CLOSED`' 'Phase 2 → `CLOSED`' 'Phase 3 → `CLOSED`'; do
  rg -q -F "$p" "$WL" && ok "closure recorded: $p" || bad "closure missing: $p"
done
rg -q -F 'outcome **`PASS`** (2026-10-01; architect ChatGPT, developer Z.AI)' "$WL" && ok "Phase 3 PASS review recorded with roles" || bad "Phase 3 PASS review record incomplete"

echo "=== 4. b65725e5 event represented accurately ==="
rg -q -F '## 2026-10-01 — External repository event — Mid-handoff branch movement (`b65725e5`) — recorded (not a phase)' "$WL" && ok "dedicated event entry present" || bad "dedicated event entry missing"
for t in 'b65725e55ed13503b70136ffde6a5a7f269d92e2' \
         'parent chain `3706b977` → `b65725e5` → `d12b0582`' \
         'while Phase 3 closure work was in progress' \
         'adds `"feature/ai-core-from-doable-source": true` to `git.deploymentEnabled`' \
         'enabling Vercel deployment for this branch' \
         'It **caused the initial push rejection**' \
         'Z.AI **correctly applied stale-baseline protection**' \
         'Z.AI **stopped Phase 4 implementation**' \
         'determined that **Phase 4 may now continue from `d12b0582`**' \
         'These risks are not to be resolved during Phase 4 unless explicitly handed off later'; do
  rg -q -F "$t" "$WL" && ok "event fact: $t" || bad "event fact missing: $t"
done
rg -q -F 'The architect subsequently reviewed the moved baseline' "$WL" && ok "architect disposition recorded" || bad "architect disposition missing"

echo "=== 5. Evidence classification present ==="
for f in "$WL" "$SR/README.md" "$SR/SESSION-001.md" "$SR/SESSION-002.md" "$SR/SESSION-003.md" "$SR/SESSION-004.md"; do
  rg -q -F 'developer-reported' "$f" && ok "$f labels developer-reported evidence" || bad "$f missing developer-reported label"
  rg -q -F 'architect-verified' "$f" && ok "$f labels architect-verified evidence" || bad "$f missing architect-verified label"
done
rg -q -F 'developer statement is never presented as architect verification' "$WL" && ok "worklog classification rule present" || bad "worklog classification rule missing"

echo "=== 6. No unsupported provenance claim about b65725e5 ==="
for f in "$WL" "$PS" "$CP" "$ZH" "$VS" "$SR/SESSION-003.md"; do
  rg -q -F 'not independently established' "$f" && ok "$f states provenance not independently established" || bad "$f missing not-independently-established statement"
done
BADPROV=$(rg -n 'was definitely created by the project owner|is definitely created by the project owner|definitely created by the owner|confirmed to be created by the project owner|b65725e5 was authored by the project owner|provenance is established' "$WL" "$PS" "$CP" "$NA" "$ZH" "$VS" "$SR"/*.md 2>/dev/null || true)
[ -z "$BADPROV" ] && ok "no affirmative owner-authorship/provenance-established claim anywhere in the new artifacts" || bad "unsupported provenance claim: $BADPROV"
rg -q -F 'are consistent with a project-owner/deployment-authority action but remain inference (D-012)' "$WL" && ok "Git-metadata observation explicitly labeled as inference" || bad "metadata-inference labeling missing"

echo "=== 7. Session records follow the approved structure ==="
[ -f "$SR/README.md" ] && ok "sessions/README.md exists" || bad "sessions/README.md missing"
for n in 1 2 3 4; do
  [ -f "$SR/SESSION-00$n.md" ] && ok "SESSION-00$n.md exists" || bad "SESSION-00$n.md missing"
done
for r in '| 1 | Session identity |' '| 2 | Date/time |' '| 3 | Role |' '| 4 | Phase |' \
         '| 5 | Starting repository state |' '| 6 | Work performed |' '| 7 | Evidence produced |' \
         '| 8 | Decisions/actions |' '| 9 | Resulting commits |' '| 10 | Validation |' \
         '| 11 | Stopping boundary |' '| 12 | Next responsible role |'; do
  for n in 1 2 3 4; do
    rg -q -F "$r" "$SR/SESSION-00$n.md" && ok "SESSION-00$n field: $r" || bad "SESSION-00$n field missing: $r"
  done
  rg -q -F "$r" "$SR/README.md" && ok "README schema field: $r" || bad "README schema field missing: $r"
done
rg -q -F 'never fabricated' "$SR/README.md" && ok "README no-fabricated-timestamps rule present" || bad "README no-fabrication rule missing"
rg -q -F '**reconstructed**' "$SR/SESSION-001.md" && ok "SESSION-001 reconstruction basis stated" || bad "SESSION-001 reconstruction basis missing"

echo "=== 8. Worklog is historical, not current-state authority ==="
rg -q -F 'Audit/history artifact — NOT a current-state authority' "$WL" && ok "audit-not-authority banner present" || bad "audit-not-authority banner missing"
rg -q -F 'This worklog does **NOT** replace, and must never be treated as authority for:' "$WL" && ok "non-replacement declaration present" || bad "non-replacement declaration missing"
rg -q -F 'Current state remains authoritative in the project-control layer; historical events belong in this file.' "$WL" && ok "authority-allocation rule present" || bad "authority-allocation rule missing"

echo "=== 9. No duplicate current-state source ==="
NW=$(git ls-files | rg -c '^worklog\.md$' || true)
[ "$NW" = "1" ] && ok "exactly one repository-root worklog.md tracked" || bad "root worklog.md count = $NW"
DUPWL=$(git ls-files | rg -i 'worklog' | rg -v '^worklog\.md$|^docs/doable-source/WORKLOG\.md$' || true)
[ -z "$DUPWL" ] && ok "no other worklog files (library-scoped docs/doable-source/WORKLOG.md remains distinct)" || bad "duplicate worklog files: $DUPWL"
NS=$(git ls-files "$SR" | wc -l)
[ "$NS" -eq 5 ] && ok "sessions/ holds exactly README + 4 session records" || bad "sessions/ file count = $NS"
STATESRC=$(git ls-files | rg -i 'PROJECT_STATE|CURRENT_PHASE|NEXT_ACTION|ZAI_HANDOFF|VERIFICATION_STATE|CHAT_CONTINUITY' | rg -v '^docs/project-control/' || true)
[ -z "$STATESRC" ] && ok "all current-state/control documents exist only under docs/project-control/ — no competing source" || bad "competing state sources: $STATESRC"

echo "=== 10. No secrets/tokens/credentials ==="
SEC=$(rg -n 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "$WL" docs/project-control/ 2>/dev/null || true)
[ -z "$SEC" ] && ok "no credential material in worklog.md or docs/project-control/" || bad "secret-scan match: $SEC"

echo "=== 11/12/13/14. Scope: no product source, DB/migrations, vercel.json, or Doable-source changes ==="
OUTSCOPE=$(echo "$CHANGED" | rg -v '^worklog\.md$|^docs/project-control/' || true)
[ -z "$OUTSCOPE" ] && ok "all changed paths are exactly worklog.md + docs/project-control/** (no product source, no DB/migrations, no vercel.json, no Doable-source)" || bad "out-of-scope changes: $OUTSCOPE"
PROD=$(echo "$CHANGED" | rg '^src/|^packages/|^package\.json|package-lock|yarn\.lock|pnpm-lock' || true)
[ -z "$PROD" ] && ok "no product source/dependency changes" || bad "product source changed: $PROD"
DBMIG=$(echo "$CHANGED" | rg -i 'migration|^db/|migrate' || true)
[ -z "$DBMIG" ] && ok "no database/migration changes" || bad "database changes: $DBMIG"
VIN=$(git diff --cached --name-only HEAD -- vercel.json 2>/dev/null; git diff --name-only -- vercel.json 2>/dev/null)
[ -z "$VIN" ] && echo "$CHANGED" | rg -q '^vercel\.json$' && bad "vercel.json modified" || ok "vercel.json unchanged (staged and working tree)"
git merge-base --is-ancestor b65725e55ed13503b70136ffde6a5a7f269d92e2 HEAD 2>/dev/null && ok "b65725e5 remains an unmodified ancestor of HEAD (not rewritten/reverted)" || bad "b65725e5 ancestry broken"
DOABLE=$(echo "$CHANGED" | rg '^docs/doable-source/' || true)
[ -z "$DOABLE" ] && ok "immutable Doable-source trees unchanged" || bad "Doable-source changes: $DOABLE"

echo "=== 15. Lightweight repository validation ==="
npm run validate:model-config >/home/z/my-project/tool-results/p4val.log 2>&1 && ok "npm run validate:model-config PASS" || { bad "validate:model-config FAILED"; tail -5 /home/z/my-project/tool-results/p4val.log; }

echo "=== 16. Full diff inspection ==="
if [ "$MODE" = "staged (pre-commit)" ]; then
  STAT=$(git diff --cached --stat HEAD | tail -1)
else
  STAT=$(git show --stat --format= HEAD | tail -1)
fi
ok "diff inspected ($MODE): $STAT"

echo "=== 17. Final State Contract ==="
for f in "$PS" "$CP" "$NA" "$VS"; do
  rg -q -F 'Phase 4 — Worklog and Session Audit' "$f" && ok "$(basename $f) names Phase 4" || bad "$(basename $f) phase mismatch"
done
rg -q -F '**Phase 4 — Worklog and Session Audit**' "$ZH" && ok "ZAI_HANDOFF.md Part II names Phase 4" || bad "ZAI_HANDOFF.md phase mismatch"
for f in "$PS" "$CP" "$NA" "$VS"; do
  rg -q 'IN_PROGRESS' "$f" && ok "$(basename $f) status IN_PROGRESS present" || bad "$(basename $f) IN_PROGRESS missing"
done
rg -q -F '**IN_PROGRESS** — developer implementation complete; awaiting architect review' "$ZH" && ok "ZAI_HANDOFF.md status IN_PROGRESS awaiting review" || bad "ZAI_HANDOFF.md status wrong"
rg -q -F '## 2026-10-01 — Phase 4 — Worklog and Session Audit — `IN_PROGRESS`' "$WL" && ok "latest worklog phase entry = Phase 4 IN_PROGRESS" || bad "latest worklog phase entry wrong"
rg -q -F 'Phase 4 output: NOT YET REVIEWED' "$PS" && ok "PROJECT_STATE: Phase 4 not-yet-reviewed" || bad "PROJECT_STATE missing not-yet-reviewed"
rg -q -F 'The phase is NOT closed' "$CP" && ok "CURRENT_PHASE: phase not closed" || bad "CURRENT_PHASE missing not-closed"
rg -q -F 'Phase 3 — Cross-Chat ChatGPT Continuity — CLOSED' "$VS" && ok "Phase 3 recorded CLOSED in VERIFICATION_STATE" || bad "Phase 3 closure missing in VERIFICATION_STATE"
rg -q -F 'Phase 4 — Worklog and Session Audit — IN_PROGRESS (NOT VERIFIED)' "$VS" && ok "Phase 4 marked NOT verified in VERIFICATION_STATE" || bad "Phase 4 NOT-verified banner missing"
rg -q -F 'd12b0582f370c0192a97bad0ad1b1dc81b7f0713' "$PS" && ok "baseline d12b0582 recorded in PROJECT_STATE" || bad "baseline d12b0582 missing in PROJECT_STATE"
rg -q -F '3706b977099e8a1aa8b867c936149439b1f700c0' "$PS" && ok "latest verified commit 3706b977 recorded in PROJECT_STATE" || bad "latest verified commit missing in PROJECT_STATE"
rg -q -F 'Value (2026-10-01, at the Phase 4 implementation commit — reconciled)' "$VS" && ok "consistency table reconciled to Phase 4" || bad "consistency table not reconciled"
rg -q -F 'Architect review of the moved baseline' "$VS" && ok "architect moved-baseline review trail present in Phase 4 section" || bad "moved-baseline review trail missing"

echo "=== 18. Commit and push requirements ==="
rg -q -F 'docs: establish phase 4 worklog and session audit' "$ZH" && ok "commit-message directive recorded in the active handoff instance" || bad "commit-message directive missing"
if [ "$MODE" = "staged (pre-commit)" ]; then
  NCOM=$(git diff --cached --name-only HEAD | wc -l)
  [ "$NCOM" -gt 0 ] && ok "single focused implementation commit prepared ($NCOM files staged, all in scope)" || bad "nothing staged"
else
  MSG=$(git log -1 --pretty=%s HEAD)
  [ "$MSG" = "docs: establish phase 4 worklog and session audit" ] && ok "HEAD commit message matches the required directive" || bad "HEAD commit message wrong: $MSG"
  PAR=$(git rev-parse HEAD^)
  [ "$PAR" = "d12b0582f370c0192a97bad0ad1b1dc81b7f0713" ] && ok "HEAD is the immediate child of the baseline d12b0582" || bad "HEAD parent is not d12b0582: $PAR"
fi

echo "=== 19. Clean tree and local/remote synchronization ==="
if [ "$MODE" = "staged (pre-commit)" ]; then
  UNSTAGED=$(git diff --name-only; git ls-files --others --exclude-standard)
  [ -z "$UNSTAGED" ] && ok "no unstaged or stray untracked changes beyond the staged set" || bad "unstaged/stray changes: $UNSTAGED"
else
  PORC=$(git status --porcelain=v1)
  [ -z "$PORC" ] && ok "working tree clean after commit" || bad "working tree not clean: $PORC"
  LOC=$(git rev-parse HEAD); REM=$(git rev-parse origin/feature/ai-core-from-doable-source 2>/dev/null || echo none)
  [ "$LOC" = "$REM" ] && ok "local HEAD = origin/feature/ai-core-from-doable-source" || bad "local/remote divergence: local=$LOC remote=$REM"
fi

echo ""
echo "RESULT: $PASS PASS / $FAIL FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
