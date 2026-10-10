#!/usr/bin/env bash
# validate-phase5-control-docs.sh — read-only validation of the Phase 5 implementation
# (Verification and Phase-Gate System; architect handoff 2026-10-01).
#
# Covers the handoff §14's 25 required validation items plus structural-integrity checks:
#   1–3. Phase 5 documents + checklist/template + required verification fields exist.
#   4–5. All three review outcomes + P0/P1 policy exist.
#   6–10. Gates B/C/D exist; database/deployment applicability + gates exist.
#   11.   Phase-close checklist exists (22 items).
#   12–13. Deterministic test: incomplete → FAIL; complete → PASS (exit 0, 8/8).
#   14.   Developer/architect evidence separation exists.
#   15.   No competing current-state source introduced.
#   16–20. No secrets; no product/DB/vercel.json/Doable-source changes.
#   21.   Final State Contract consistent (Phase 5 IN_PROGRESS, 5 members + worklog).
#   22.   Worklog contains the Phase 5 implementation entry.
#   23.   Changed-path set exactly as declared (full diff inspected separately).
#   24–25. Clean tree + local/remote sync (HEAD mode).
#   +     Part I byte-identity; SESSION-006 twelve determinations; D-020; commit
#         message/parent; b65725e5 ancestry/vercel.json; model-config.
#
# Modes: "staged" (pre-commit; HEAD must equal the Phase 5 baseline 8d8595d0)
#        "HEAD"   (post-commit/post-push; HEAD must be the immediate child of 8d8595d0)
#
# Persisted OUTSIDE the repository per the Phase 3/4 convention. Read-only.

set -u
REPO="/home/z/my-project/.worktrees/vc"
MODE="${1:-staged}"
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); printf 'PASS: %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL: %s\n' "$1"; }
chk() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi; }

pos()   { if rg -q -F "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3"; fi; }
neg()   { if rg -q -F "$2" "$1" 2>/dev/null; then bad "$3"; else ok "$3"; fi; }
posre() { if rg -q -e "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3"; fi; }
negre() { if rg -q -e "$2" "$1" 2>/dev/null; then bad "$3"; else ok "$3"; fi; }

cd "$REPO" || { echo 'FATAL: worktree not found'; exit 1; }

BASE='8d8595d0a994510da217af6d12225e3f1d00b2fd'
IMPL='5febaacd5dcc55268904d1371038bbe8ff372040'
EXT='b65725e55ed13503b70136ffde6a5a7f269d92e2'
BRANCH='feature/ai-core-from-doable-source'
CORRMSG='docs: establish phase 5 verification and phase gates'
PC='docs/project-control'
CKL="$PC/VERIFICATION_CHECKLIST.md"
VST="$PC/VERIFICATION_STATE.md"
TESTSH="$PC/verification/phase-closure-eligibility-test.sh"
ALLOWED='docs/project-control/CURRENT_PHASE.md docs/project-control/DECISIONS.md docs/project-control/NEXT_ACTION.md docs/project-control/PROJECT_STATE.md docs/project-control/VERIFICATION_CHECKLIST.md docs/project-control/VERIFICATION_STATE.md docs/project-control/ZAI_HANDOFF.md docs/project-control/sessions/README.md docs/project-control/sessions/SESSION-006.md docs/project-control/verification/phase-closure-eligibility-test.sh worklog.md '

echo "== Mode: $MODE | repo: $REPO =="

# ---------- 1. Phase 5 required documents exist ----------
[ -f "$CKL" ] && ok "1a. VERIFICATION_CHECKLIST.md exists" || bad "1a. VERIFICATION_CHECKLIST.md missing"
[ -f "$TESTSH" ] && ok "1b. verification/phase-closure-eligibility-test.sh exists" || bad "1b. deterministic test script missing"
pos "$PC/CURRENT_PHASE.md" '# CURRENT_PHASE.md — Active-Phase Contract' "1c. CURRENT_PHASE.md contract present"

# ---------- 2. Checklist/template exists (exactly one, tracked) ----------
n=$(git ls-files -- 'docs/project-control/*' | rg -c 'VERIFICATION_CHECKLIST' || true)
if [ "$n" = "1" ]; then ok "2a. exactly one VERIFICATION_CHECKLIST.md tracked"; else bad "2a. VERIFICATION_CHECKLIST.md tracked count = ${n:-0}"; fi
pos "$CKL" 'Canonical Verification Checklist and Phase-Gate Record Template' "2b. checklist header identifies the canonical form"

# ---------- 3. Required verification fields exist ----------
pos "$CKL" 'Planned scope' "3a. Gate A field: planned scope"
pos "$CKL" 'Actual changed paths' "3b. Gate A field: actual changed paths"
pos "$CKL" 'Immutable-source check' "3c. Gate A field: immutable-source check"
pos "$CKL" 'Implementation commit' "3d. Gate B field: implementation commit"
pos "$CKL" 'Parent commit' "3e. Gate B field: parent commit"
pos "$CKL" 'Requirement-by-requirement' "3f. Gate B field: requirement-by-requirement status"
pos "$CKL" 'Expected result' "3g. Gate C field: expected result"
pos "$CKL" 'Environment/context' "3h. Gate C field: environment/context"
pos "$CKL" 'Architect review status' "3i. Gate D field: architect review status"
pos "$CKL" 'Regression concerns' "3j. Gate D field: regression concerns"
pos "$CKL" 'Migration evidence' "3k. Gate E field: migration evidence"
pos "$CKL" 'Rollback/recovery evidence' "3l. Gate E field: rollback/recovery evidence"
pos "$CKL" 'Deployment URL' "3m. Gate F field: deployment URL"
pos "$CKL" 'Smoke verification' "3n. Gate F field: smoke verification"
pos "$VST" 'implementation commit; parent commit; expected files; actual files; implementation requirements; requirement-by-requirement status' "3o. contract records Gate B's required fields"

# ---------- 4. All three review outcomes exist ----------
for f in "$VST" "$CKL" "$PC/CURRENT_PHASE.md"; do
  pos "$f" 'PASS_WITH_FOLLOWUP' "4.  $f defines PASS_WITH_FOLLOWUP"
done
pos "$VST" 'never silently converted into `PASS`' "4x. contract: no silent PASS_WITH_FOLLOWUP->PASS conversion"

# ---------- 5. P0/P1 blocker policy exists ----------
pos "$VST" 'P0 prevents phase closure' "5a. contract: P0 prevents closure"
pos "$VST" 'P1 prevents `PASS`' "5b. contract: P1 prevents PASS"
pos "$CKL" 'P0 count = 0' "5c. checklist: P0 count item"
pos "$CKL" 'P1 count = 0 or explicitly handled by architect policy' "5d. checklist: P1 count item"
pos "$VST" 'tenant-isolation failure' "5e. P0 examples include tenant-isolation failure / false verification evidence"
pos "$VST" 'false verification/closure evidence' "5f. P0 example: false verification/closure evidence"

# ---------- 6–8. Gates B/C/D exist ----------
for g in B C D; do
  posre "$CKL" "^### Gate $g — " "6-8. checklist: Gate $g section"
  posre "$VST" "\*\*$g — " "6-8. contract: Gate $g row"
done
pos "$CKL" 'must not automatically imply phase completion' "7x. Gate C: tests-passed never implies completion"
pos "$CKL" 'satisfies Gate D' "8x. Gate D: developer self-review never satisfies it"

# ---------- 9–10. Database/deployment applicability + gates ----------
posre "$CKL" '^### Gate E — Database verification \[applicability-conditional\]' "9a. checklist: Gate E conditional section"
posre "$CKL" '^### Gate F — Deployment verification \[applicability-conditional\]' "10a. checklist: Gate F conditional section"
pos "$CKL" 'Phase 5 applicability: `NOT_APPLICABLE`' "9b. checklist: Phase 5 Gate E applicability recorded"
pos "$CKL" 'A local build must never be described as deployment verification' "10b. Gate F: local build never deployment verification"
pos "$VST" 'Gate E = `NOT_APPLICABLE`; Gate F = `NOT_APPLICABLE`' "10c. contract: docs-only phases record E/F NOT_APPLICABLE"
pos "$VST" 'never claim database verification when no database verification occurred' "9c. contract: never claim DB verification when none occurred"

# ---------- 11. Phase-close checklist exists ----------
posre "$CKL" '^## 7\. Phase-close checklist' "11a. checklist §7 heading present"
items=0
for item in 'Correct phase' 'Correct baseline' 'Correct implementation commit' 'Scope matches handoff' 'Non-scope respected' 'Required implementation gates complete' 'Required test gates complete' 'Code-review gate complete' 'Database gate assessed' 'Deployment gate assessed' 'Security reviewed' 'Tenant isolation reviewed where applicable' 'P0 count = 0' 'No unresolved blocking correction' 'Final State Contract consistent' 'Worklog updated' 'Evidence classification correct' 'Commit SHA recorded' 'Working tree clean' 'Remote synchronization verified' 'No later phase started'; do
  if rg -q -F -- "- [ ] $item" "$CKL"; then items=$((items+1)); else bad "11b. missing checklist item: $item"; fi
done
if [ "$items" -eq 21 ]; then ok "11b. phase-close checklist: all 21 probed items present (22 total: P1 item counted at 5d)"; fi
pos "$CKL" 'The checklist itself does not close a phase. Only ChatGPT' "11c. checklist meta-rule: only ChatGPT's review closes"

# ---------- 12–13. Deterministic test: incomplete FAIL / complete PASS ----------
TESTOUT="$(bash "$TESTSH" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ]; then ok "12a. deterministic test exits 0"; else bad "12a. deterministic test exit = $rc"; fi
if printf '%s' "$TESTOUT" | rg -q '8/8 determinations correct'; then ok "12b. deterministic test: 8/8 correct"; else bad "12b. deterministic test aggregate missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-1-incomplete-missing-gate-d.*computed=FAIL.*expected=FAIL.*MATCH'; then ok "12c. case-1 (incomplete: tests passed + developer claim, Gate D missing) -> FAIL"; else bad "12c. case-1 line mismatch"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-2-complete-applicable-gates.*computed=PASS.*expected=PASS.*MATCH'; then ok "13a. case-2 (complete, Gate D architect-verified) -> PASS"; else bad "13a. case-2 line mismatch"; fi
pos "$CKL" '| **Closure eligibility** | **FAIL**' "12d. worked Example 1 records FAIL"
pos "$CKL" '| **Closure eligibility** | **PASS**' "13b. worked Example 2 records PASS"
pos "$CKL" 'insufficient by design' "12e. Example 1: tests+claim insufficient by design"

# ---------- 14. Evidence separation ----------
for f in "$VST" "$CKL" "$PC/CURRENT_PHASE.md" "$PC/sessions/SESSION-006.md" worklog.md; do
  pos "$f" 'developer-reported' "14. $f labels developer-reported evidence"
done
pos "$VST" 'architect-verified' "14x. contract labels architect-verified evidence"
pos "$CKL" 'a future or intended review is never written as already completed' "14y. checklist: no future review written as completed"

# ---------- 15. No competing current-state source ----------
n=$(git ls-files | rg -c 'phase-closure-eligibility-test|VERIFICATION_CHECKLIST' || true)
if [ "$n" = "2" ]; then ok "15a. exactly one checklist + one deterministic test tracked"; else bad "15a. tracked count = ${n:-0}"; fi
newdocs=$(git diff --name-only --diff-filter=A "$BASE" -- "$PC" | rg -v 'VERIFICATION_CHECKLIST.md|sessions/SESSION-006.md|verification/phase-closure-eligibility-test.sh' || true)
if [ -z "$newdocs" ]; then ok "15b. no unexpected new control documents"; else bad "15b. unexpected new docs: $newdocs"; fi
pos "$CKL" 'NOT current-state authority' "15c. checklist declares not-current-state-authority"

# ---------- 16. No secrets ----------
negre 'worklog.md docs/project-control/' 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "16. no secrets/tokens in changed documents"

# ---------- 17–20. Scope: no product/DB/vercel.json/Doable-source changes ----------
n=$(git diff --name-only "$BASE" -- src packages supabase vercel.json docs/doable-source | wc -l)
chk "17-20. no src/packages/supabase/vercel.json/Doable-source changes vs baseline" "$n"
n=$(git diff --name-only "$BASE" -- 'db/*' 'supabase/*' '*migration*' | wc -l)
chk "18x. no migration/DB files changed" "$n"
git merge-base --is-ancestor "$EXT" HEAD; chk "20x. b65725e5 ancestry intact (not rewritten)" "$?"
n=$(git diff --name-only "$BASE" -- vercel.json | wc -l); chk "19x. vercel.json unchanged vs baseline" "$n"

# ---------- 21. Final State Contract consistent ----------
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE ZAI_HANDOFF; do
  pos "$PC/$f.md" 'Phase 5 — Verification and Phase-Gate System' "21. $f.md identifies Phase 5"
done
pos "$PC/PROJECT_STATE.md" '**Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`**' "21a. PROJECT_STATE current phase IN_PROGRESS"
pos "$PC/CURRENT_PHASE.md" '| Status | **IN_PROGRESS**' "21b. CURRENT_PHASE status IN_PROGRESS"
pos "$PC/NEXT_ACTION.md" '`IN_PROGRESS`' "21c. NEXT_ACTION Phase 5 IN_PROGRESS"
posre "$PC/ZAI_HANDOFF.md" '^\| Current status \| \*\*IN_PROGRESS\*\*' "21d. ZAI_HANDOFF Part II IN_PROGRESS"
posre "$VST" '^## Phase 5 — Verification and Phase-Gate System — IN_PROGRESS' "21e. VERIFICATION_STATE Phase 5 IN_PROGRESS"
posre worklog.md '^## 2026-10-01 — Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`' "21f. latest worklog phase entry = Phase 5 IN_PROGRESS"
pos "$PC/PROJECT_STATE.md" "$IMPL" "21g. latest verified commit remains 5febaacd (PROJECT_STATE)"
pos "$VST" 'latest verified commit' "21h. consistency table records latest verified commit"
pos "$PC/PROJECT_STATE.md" "$BASE" "21i. baseline 8d8595d0 recorded (PROJECT_STATE)"

# ---------- 22. Worklog Phase 5 entry ----------
pos worklog.md '### Review' "22a. worklog Phase 5 entry has schema sections"
pos worklog.md 'NOT YET REVIEWED' "22b. worklog Phase 5 review state: NOT YET REVIEWED"
n=$(git diff "$BASE" -- worklog.md | grep -cE '^-[^-]')
chk "22c. worklog change is pure append (0 deleted lines)" "$n"

# ---------- 23. Changed-path set exactly as declared ----------
if [ "$MODE" = "staged" ]; then
  changed=$(git status --porcelain | awk '{print $2}' | sort | tr '\n' ' ')
else
  changed=$(git show --name-only --format= HEAD | sort | tr '\n' ' ')
fi
if [ "$changed" = "$ALLOWED" ]; then
  ok "23. changed-path set exactly the 11 declared paths ($MODE)"
else
  bad "23. unexpected changed-path set: '$changed'"
fi

# ---------- Structural integrity ----------
rows=$(rg -c '^\| [0-9]+ \|' "$PC/sessions/SESSION-006.md" 2>/dev/null)
if [ "$rows" = "12" ]; then ok "S1. SESSION-006 twelve-determination table intact (12 rows)"; else bad "S1. SESSION-006 rows = ${rows:-0}"; fi
pos "$PC/sessions/README.md" 'SESSION-006' "S2. sessions README index row for SESSION-006"
pos "$PC/DECISIONS.md" 'D-020' "S3. DECISIONS.md D-020 recorded"
pos "$PC/DECISIONS.md" 'Decisions established during Phase 5' "S4. D-020 in its own Phase 5 section"
git show "$BASE:docs/project-control/ZAI_HANDOFF.md" | head -n 183 > /home/z/my-project/scripts/_p1_base.md
head -n 183 "$PC/ZAI_HANDOFF.md" > /home/z/my-project/scripts/_p1_cur.md
if diff -q /home/z/my-project/scripts/_p1_base.md /home/z/my-project/scripts/_p1_cur.md >/dev/null; then
  ok "S5. ZAI_HANDOFF Part I byte-identical to baseline"
else
  bad "S5. ZAI_HANDOFF Part I differs from baseline"
fi
pos "$PC/PROJECT_STATE.md" 'Phase 4 stands `CLOSED`' "S6. PROJECT_STATE records architect-accepted Phase 4 correction (Phase 4 CLOSED preserved)"
pos "$PC/PROJECT_STATE.md" 'Provenance NOT independently established' "S7. b65725e5 classification preserved (not confirmed owner authorship)"
extline=$(git log --format='%H %s' -1 "$EXT")
if [ "$extline" = "$EXT chore(vercel): enable AI core feature branch preview deployment" ]; then
  ok "S8. b65725e5 identity unchanged"
else
  bad "S8. b65725e5 identity check: '$extline'"
fi

if [ "$MODE" = "staged" ]; then
  h=$(git rev-parse HEAD)
  if [ "$h" = "$BASE" ]; then ok "S9. pre-commit baseline: HEAD = 8d8595d0"; else bad "S9. pre-commit HEAD = $h"; fi
else
  msg=$(git log --format='%s' -1 HEAD)
  if [ "$msg" = "$CORRMSG" ]; then ok "S9. HEAD commit message exact: '$CORRMSG'"; else bad "S9. HEAD message: '$msg'"; fi
  par=$(git rev-parse HEAD^)
  if [ "$par" = "$BASE" ]; then ok "S10. implementation commit is the immediate child of 8d8595d0"; else bad "S10. HEAD^ = $par"; fi
  # ---------- 24. Clean tree ----------
  n=$(git status --porcelain | wc -l); chk "24. working tree clean after commit" "$n"
  # ---------- 25. Local/remote synchronized ----------
  h=$(git rev-parse HEAD); o=$(git rev-parse "origin/$BRANCH")
  if [ "$h" = "$o" ]; then ok "25. local $BRANCH and origin synchronized ($h)"; else bad "25. local $h != origin $o"; fi
  git merge-base --is-ancestor "$BASE" HEAD; chk "S11. fast-forward history (8d8595d0 ancestor of HEAD; no force-push)" "$?"
fi

# ---------- Supplementary ----------
if npm run --silent validate:model-config >/dev/null 2>&1; then
  ok "SUP. npm run validate:model-config exits 0 (lightweight check only — NOT sufficient phase verification)"
else
  bad "SUP. npm run validate:model-config failed"
fi

echo "== RESULT: $PASS PASS / $FAIL FAIL ($MODE mode) =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
