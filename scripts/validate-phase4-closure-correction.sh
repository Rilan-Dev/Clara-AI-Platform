#!/usr/bin/env bash
# validate-phase4-closure-correction.sh — read-only validation of the Phase 4 closure-record
# evidence-classification correction (architect corrective handoff, 2026-10-01).
#
# Covers the corrective handoff's 11 verification items plus structural-integrity checks:
#   1.  SESSION-005 no longer contains the contradictory classification.
#   2.  5febaacd consistently identified as the architect-verified Phase 4 implementation.
#   3.  16b89a94 remains the Phase 4 architect closure-record commit.
#   4.  b65725e5 remains "provenance not independently established"; ancestry + vercel.json intact.
#   5.  Phase 4 remains CLOSED across the five Final State Contract members.
#   6.  Phase 5 remains NOT STARTED.
#   7.  Final State Contract remains consistent.
#   8.  Documentation-only scope (worklog.md + docs/project-control/sessions/SESSION-005.md only).
#   9.  No secrets introduced.
#   10. Working tree clean after commit (HEAD mode).
#   11. Local branch and origin synchronized (HEAD mode).
#   +   worklog.md pure-append vs 16b89a94; SESSION-005 twelve-determination table intact;
#       explicit dated correction notes present; exact commit message and parent (HEAD mode);
#       b65725e5 identity unchanged; npm run validate:model-config (supplementary).
#
# Modes: "staged" (pre-commit; HEAD must equal the closure-record commit 16b89a94)
#        "HEAD"   (post-commit/post-push; HEAD must equal the correction commit)
#
# Persisted OUTSIDE the repository per the Phase 3/4 convention. Read-only: no repository writes.

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

IMPL='5febaacd5dcc55268904d1371038bbe8ff372040'
CLOSURE='16b89a946d0848884ff74ffb435693402fc31a52'
EXT='b65725e55ed13503b70136ffde6a5a7f269d92e2'
SESSION='docs/project-control/sessions/SESSION-005.md'
BRANCH='feature/ai-core-from-doable-source'
CORRMSG='docs: correct phase 4 closure evidence classification'
PC='docs/project-control'
ALLOWED='docs/project-control/sessions/SESSION-005.md worklog.md '

echo "== Mode: $MODE | repo: $REPO =="

# ---------- Item 1: contradictory classification removed ----------
neg "$SESSION" 'none of the three' "1.  SESSION-005 contains no occurrence of the contradictory clause"

# ---------- Item 2: 5febaacd = architect-verified Phase 4 implementation ----------
pos "$SESSION" "$IMPL" "2a. SESSION-005 references the full implementation SHA 5febaacd"
pos "$SESSION" 'architect-verified Phase 4 implementation' "2b. SESSION-005 classifies 5febaacd as the architect-verified Phase 4 implementation"
pos "$PC/PROJECT_STATE.md" 'architect-verified by the `PASS` review' "2c. PROJECT_STATE: 5febaacd architect-verified by the PASS review (authoritative)"
pos "$PC/VERIFICATION_STATE.md" 'architect-verified by the `PASS` review (2026-10-01)' "2d. VERIFICATION_STATE consistency table: latest verified commit = 5febaacd"
pos worklog.md 'architect-verified Phase 4 implementation' "2e. worklog correction note states the correct classification"
pos "$SESSION" 'Phase 3 closure-record commit' "2f. SESSION-005 classifies d12b0582 as the Phase 3 closure-record commit"

# ---------- Item 3: 16b89a94 remains the closure-record commit ----------
pos "$SESSION" "$CLOSURE" "3a. SESSION-005 references the closure-record commit SHA 16b89a94"
pos "$SESSION" 'Phase 4 architect closure-record commit' "3b. SESSION-005 classifies 16b89a94 as the Phase 4 architect closure-record commit"
pos worklog.md 'Phase 4 architect closure-record commit' "3c. worklog correction note classifies 16b89a94 as the closure-record commit"
pos "$PC/NEXT_ACTION.md" 'docs: record architect approval of phase 4' "3d. NEXT_ACTION still identifies the closure-record commit (unchanged)"

# ---------- Item 4: b65725e5 classification preserved ----------
pos "$SESSION" 'not independently established' "4a. SESSION-005 preserves the b65725e5 'not independently established' classification"
pos "$PC/PROJECT_STATE.md" 'Provenance NOT independently established' "4b. PROJECT_STATE preserves the b65725e5 classification"
pos worklog.md 'provenance not independently established' "4c. worklog correction note preserves the b65725e5 classification"
git merge-base --is-ancestor "$EXT" HEAD; chk "4d. b65725e5 ancestry intact (in history, not rewritten)" "$?"
n=$(git diff --name-only "$CLOSURE" -- vercel.json | wc -l); chk "4e. vercel.json unchanged since the closure-record commit" "$n"
extline=$(git log --format='%H %s' -1 "$EXT")
if [ "$extline" = "$EXT chore(vercel): enable AI core feature branch preview deployment" ]; then
  ok "4f. b65725e5 identity unchanged (same SHA + message)"
else
  bad "4f. b65725e5 identity check: unexpected '$extline'"
fi

# ---------- Item 5: Phase 4 remains CLOSED across the five members ----------
pos "$PC/PROJECT_STATE.md" 'Phase 4 — Worklog and Session Audit — `CLOSED`' "5a. PROJECT_STATE: Phase 4 CLOSED"
pos "$PC/CURRENT_PHASE.md" '| Status | **CLOSED**' "5b. CURRENT_PHASE: status CLOSED"
pos "$PC/NEXT_ACTION.md" 'is **`CLOSED`**' "5c. NEXT_ACTION: Phase 4 CLOSED"
pos "$PC/ZAI_HANDOFF.md" '| Current status | **CLOSED**' "5d. ZAI_HANDOFF Part II: status CLOSED"
pos "$PC/VERIFICATION_STATE.md" 'Phase 4 — Worklog and Session Audit — CLOSED' "5e. VERIFICATION_STATE: Phase 4 CLOSED"

# ---------- Item 6: Phase 5 remains NOT STARTED ----------
pos "$PC/PROJECT_STATE.md" 'has NOT started' "6a. PROJECT_STATE: Phase 5 NOT started"
pos "$PC/CURRENT_PHASE.md" 'has NOT started' "6b. CURRENT_PHASE: Phase 5 NOT started"
pos "$PC/NEXT_ACTION.md" 'has NOT started' "6c. NEXT_ACTION: Phase 5 NOT started"
pos "$PC/VERIFICATION_STATE.md" 'has NOT started' "6d. VERIFICATION_STATE: Phase 5 NOT started"
pos "$PC/ZAI_HANDOFF.md" 'has NOT started' "6e. ZAI_HANDOFF: Phase 5 NOT started"
pos "$SESSION" 'Phase 5 remains NOT STARTED' "6f. SESSION-005 correction note: Phase 5 remains NOT STARTED"

# ---------- Item 7: Final State Contract consistency ----------
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE ZAI_HANDOFF; do
  posre "$PC/$f.md" 'Phase 4 — Worklog and Session Audit' "7.  $f.md identifies Phase 4 (contract member agreement)"
done
pos "$PC/PROJECT_STATE.md" "$IMPL" "7x. PROJECT_STATE commit state anchors the latest architect-verified implementation"

# ---------- Item 8: documentation-only scope ----------
if [ "$MODE" = "staged" ]; then
  changed=$(git status --porcelain | awk '{print $2}' | sort | tr '\n' ' ')
else
  changed=$(git show --name-only --format= HEAD | sort | tr '\n' ' ')
fi
if [ "$changed" = "$ALLOWED" ]; then
  ok "8a. changed paths are exactly SESSION-005.md + worklog.md ($MODE)"
else
  bad "8a. unexpected changed-path set: '$changed'"
fi
n=$(git diff --name-only "$CLOSURE" -- src packages supabase vercel.json docs/doable-source 2>/dev/null | wc -l)
chk "8b. no src/packages/supabase/vercel.json/Doable-source changes vs 16b89a94" "$n"
sess=$(git diff --name-only "$CLOSURE" -- docs/project-control/sessions/ | tr '\n' ' ')
if [ "$sess" = "docs/project-control/sessions/SESSION-005.md " ]; then
  ok "8c. SESSION-001..004 untouched; only SESSION-005 changed"
else
  bad "8c. unexpected sessions-layer diff: '$sess'"
fi

# ---------- Item 9: no secrets ----------
negre 'worklog.md docs/project-control/' 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "9.  no secrets/tokens in worklog.md or docs/project-control/"

# ---------- Structural integrity ----------
n=$(git diff "$CLOSURE" -- worklog.md | grep -cE '^-[^-]')
chk "S1. worklog.md change vs 16b89a94 is pure append (no deleted content lines)" "$n"
rows=$(rg -c '^\| [0-9]+ \|' "$SESSION" 2>/dev/null)
if [ "$rows" = "12" ]; then ok "S2. SESSION-005 twelve-determination table intact (12 rows)"; else bad "S2. SESSION-005 determination rows = ${rows:-0} (expected 12)"; fi
pos "$SESSION" '> Correction (2026-10-01' "S3. SESSION-005 carries the explicit dated correction note"
pos worklog.md '> Correction (2026-10-01' "S4. worklog.md carries the explicit dated correction note (append-only convention §3.1)"

if [ "$MODE" = "staged" ]; then
  h=$(git rev-parse HEAD)
  if [ "$h" = "$CLOSURE" ]; then ok "S5. pre-commit baseline: HEAD = 16b89a94 (closure-record commit)"; else bad "S5. pre-commit baseline: HEAD = $h (expected $CLOSURE)"; fi
else
  msg=$(git log --format='%s' -1 HEAD)
  if [ "$msg" = "$CORRMSG" ]; then ok "S5. HEAD commit message exact: '$CORRMSG'"; else bad "S5. HEAD commit message: '$msg'"; fi
  par=$(git rev-parse HEAD^)
  if [ "$par" = "$CLOSURE" ]; then ok "S6. correction commit is the immediate child of 16b89a94"; else bad "S6. HEAD^ = $par (expected $CLOSURE)"; fi
  cmsg=$(git log --format='%s' -1 "$CLOSURE")
  if [ "$cmsg" = 'docs: record architect approval of phase 4' ]; then ok "S7. 16b89a94 remains the closure-record commit (message verified)"; else bad "S7. 16b89a94 message: '$cmsg'"; fi

  # ---------- Item 10: clean tree ----------
  n=$(git status --porcelain | wc -l); chk "10. working tree clean after commit" "$n"

  # ---------- Item 11: local/remote synchronized ----------
  h=$(git rev-parse HEAD); o=$(git rev-parse "origin/$BRANCH")
  if [ "$h" = "$o" ]; then ok "11. local $BRANCH and origin synchronized ($h)"; else bad "11. local $h != origin $o"; fi
  git merge-base --is-ancestor "$CLOSURE" HEAD; chk "S8. fast-forward history: 16b89a94 is an ancestor of HEAD (no force-push)" "$?"
fi

# ---------- Supplementary: lightweight repository validation ----------
if npm run --silent validate:model-config >/dev/null 2>&1; then
  ok "SUP. npm run validate:model-config exits 0"
else
  bad "SUP. npm run validate:model-config failed"
fi

echo "== RESULT: $PASS PASS / $FAIL FAIL ($MODE mode) =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
