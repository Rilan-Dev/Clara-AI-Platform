#!/usr/bin/env bash
#
# validate-phase6-control-docs.sh — aggregate read-only validation for the Phase 6
# Correction and Issue-Control Workflow implementation (Clara project-control system).
#
# Persisted outside the repository (agent workspace), per the Phase 3/4/5 convention.
# Mode: "staged" (validates the staged/indexed worktree state) or "HEAD" (validates
# the committed HEAD state). Default: staged if there are staged/working changes,
# else HEAD.
#
# Usage: bash /home/z/my-project/scripts/validate-phase6-control-docs.sh [staged|HEAD]
# Exit:  0 iff every check passes; 1 otherwise.

set -u
cd /home/z/my-project/.worktrees/vc || { echo "FATAL: worktree not found"; exit 1; }

MODE="${1:-}"
if [ -z "$MODE" ]; then
  if [ -n "$(git status --porcelain)" ]; then MODE="staged"; else MODE="HEAD"; fi
fi
BASELINE="f62326dbe1940a2a518567d66e720a4b407dbf26"

# Read file content in the selected mode
rf() {  # rf <path>
  if [ "$MODE" = "HEAD" ]; then git show "HEAD:$1" 2>/dev/null; else cat "$1" 2>/dev/null; fi
}
rf_exists() { rf "$1" | head -c1 >/dev/null 2>&1 && [ -n "$(rf "$1" | head -c1)" ] || rf "$1" >/dev/null 2>&1 && [ -s "$1" ]; }
list_changed() {
  if [ "$MODE" = "HEAD" ]; then git diff --name-only "$BASELINE".."HEAD"; else git status --porcelain | awk '{print $2}'; fi
}

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
chk() { # chk <description> <condition-exit-code>
  if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi
}

echo "== validate-phase6-control-docs.sh — mode: $MODE (baseline $BASELINE) =="
echo ""

# ---------- 1. Required documents exist ----------
echo "-- 1. Required Phase 6 documents --"
for f in docs/project-control/ISSUES.md \
         docs/project-control/CURRENT_PHASE.md \
         docs/project-control/ZAI_HANDOFF.md \
         docs/project-control/VERIFICATION_STATE.md \
         docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md \
         docs/project-control/verification/correction-cycle-test.sh \
         docs/project-control/sessions/SESSION-008.md \
         worklog.md; do
  if rf "$f" | head -c1 >/dev/null 2>&1 && [ -n "$(rf "$f" | head -c 10)" ]; then ok "exists: $f"; else bad "missing: $f"; fi
done

# ---------- 2. Issue-control system in ISSUES.md ----------
echo "-- 2. Issue-control system (ISSUES.md) --"
ISSUES="$(rf docs/project-control/ISSUES.md)"
for pat in '## Issue-control system' '### 1\. Issue severity model' '### 2\. Issue lifecycle' \
           '### 3\. Canonical issue-record schema' '### 4\. Issue status' '### 5\. Traceability requirements' \
           '### 6\. Legacy entries' '## Issue records \(canonical schema'; do
  echo "$ISSUES" | grep -Eq "$pat"; chk "ISSUES.md contains: $pat" $?
done
for state in OPEN TRIAGED CORRECTION_REQUIRED CORRECTION_IN_PROGRESS CORRECTION_SUBMITTED REVIEW_PENDING RESOLVED WONT_FIX DEFERRED BLOCKED; do
  echo "$ISSUES" | grep -q "$state"; chk "lifecycle state present: $state" $?
done
for sev in 'P0' 'P1' 'P2' 'P3'; do
  echo "$ISSUES" | grep -Eq "\| \*\*$sev\*\*"; chk "severity row present: $sev" $?
done
echo "$ISSUES" | grep -q 'P0 prevents phase closure — always; there is no P0 exception path'; chk "P0 no-exception rule present" $?
echo "$ISSUES" | grep -q 'only architect verification can establish'; chk "architect-only resolution rule present" $?
# Legacy entries preserved: I-001..I-012 headings present
for id in I-001 I-002 I-003 I-004 I-005 I-006 I-007 I-008 I-009 I-010 I-011 I-012; do
  echo "$ISSUES" | grep -q "$id"; chk "legacy entry present: $id" $?
done
# Legacy records byte-identical vs baseline (from '## Open' heading through I-012 row)
base_legacy="$(git show "$BASELINE:docs/project-control/ISSUES.md" | sed -n '/^## Open$/,/^| I-012/p')"
cur_legacy="$(rf docs/project-control/ISSUES.md | sed -n '/^## Open$/,/^| I-012/p')"
[ "$base_legacy" = "$cur_legacy" ]; chk "legacy entries I-001…I-012 byte-identical to baseline" $?

# ---------- 3. Correction-handoff template completeness ----------
echo "-- 3. Correction-handoff template (22 sections) --"
TPL="$(rf docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md)"
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22; do
  echo "$TPL" | grep -Eq "^## $n\. "; chk "template section $n present" $?
done
echo "$TPL" | grep -q 'authorizes only the corrective scope. It does not authorize unrelated improvements or the next phase'; chk "bounded-scope statement present" $?
echo "$TPL" | grep -q 'Correction integrity rules'; chk "integrity rules section present" $?
echo "$TPL" | grep -q 'STOP → record/report it'; chk "out-of-scope-discovery STOP rule present" $?
echo "$TPL" | grep -q 'never independently closes the issue or the phase'; chk "developer-commit-never-closes rule present" $?

# ---------- 4. VERIFICATION_STATE integration (no competing system) ----------
echo "-- 4. VERIFICATION_STATE integration --"
VS="$(rf docs/project-control/VERIFICATION_STATE.md)"
echo "$VS" | grep -q '^## Correction and issue-control workflow'; chk "durable correction-workflow section present" $?
echo "$VS" | grep -q 'no second verification system'; chk "no-second-system declaration present" $?
echo "$VS" | grep -q '^## Phase 6 — Correction and Issue-Control Workflow — IN_PROGRESS'; chk "Phase 6 evidence section present" $?
echo "$VS" | grep -q 'The Phase 6 architect review is PENDING'; chk "review-pending state recorded" $?
# P0/P1 rules unchanged in the Phase 5 contract
echo "$VS" | grep -q 'P0 prevents phase closure — always; there is no P0 exception path'; chk "Phase 5 P0 rule intact" $?
echo "$VS" | grep -q 'P1 prevents `PASS`\*\* unless the project-control policy explicitly records and approves a valid exception'; chk "Phase 5 P1 rule intact" $?
# Phase 5 history not rewritten: closure record still present
echo "$VS" | grep -q 'Phase 5 — Verification and Phase-Gate System — CLOSED'; chk "Phase 5 CLOSED section preserved" $?
echo "$VS" | grep -q 'fb4ad5f59b5661dc2bc7f38039805fc6294d58ef'; chk "Phase 5 reviewed-implementation SHA preserved" $?

# ---------- 5. CURRENT_PHASE / ZAI_HANDOFF / PROJECT_STATE / NEXT_ACTION ----------
echo "-- 5. Phase 6 contract + handoff instance + state reconciliation --"
CP="$(rf docs/project-control/CURRENT_PHASE.md)"
ZH="$(rf docs/project-control/ZAI_HANDOFF.md)"
PS="$(rf docs/project-control/PROJECT_STATE.md)"
NA="$(rf docs/project-control/NEXT_ACTION.md)"
echo "$CP" | grep -q 'Phase 6 — Correction and Issue-Control Workflow'; chk "CURRENT_PHASE: Phase 6 contract" $?
echo "$CP" | grep -q '| Phase number | \*\*6\*\*'; chk "CURRENT_PHASE: phase number 6" $?
echo "$CP" | grep -Eq '\| Status \| \*\*IN_PROGRESS\*\*'; chk "CURRENT_PHASE: IN_PROGRESS" $?
echo "$CP" | grep -q 'f62326dbe1940a2a518567d66e720a4b407dbf26'; chk "CURRENT_PHASE: baseline recorded" $?
echo "$CP" | grep -q 'not an issue database'; chk "CURRENT_PHASE: not-an-issue-database statement" $?
echo "$ZH" | grep -q '^## Part II — Active Handoff Instance'; chk "ZAI_HANDOFF: Part II present" $?
echo "$ZH" | grep -q 'Phase 6 — Correction and Issue-Control Workflow'; chk "ZAI_HANDOFF: Phase 6 instance" $?
echo "$ZH" | grep -q 'docs: establish phase 6 correction and issue control'; chk "ZAI_HANDOFF: commit directive" $?
echo "$ZH" | grep -q 'CORRECTION_HANDOFF_TEMPLATE.md'; chk "ZAI_HANDOFF: template referenced" $?
echo "$PS" | grep -q 'Phase 6 — Correction and Issue-Control Workflow — `IN_PROGRESS`'; chk "PROJECT_STATE: Phase 6 IN_PROGRESS" $?
echo "$NA" | grep -q 'Phase 6 — Correction and Issue-Control Workflow — `IN_PROGRESS`'; chk "NEXT_ACTION: Phase 6 IN_PROGRESS" $?
for f in "$CP" "$ZH" "$PS" "$NA" "$VS"; do
  echo "$f" | grep -q 'IN_PROGRESS'; chk "IN_PROGRESS agreement" $?
done

# ---------- 6. worklog + session record ----------
echo "-- 6. worklog + session audit --"
WL="$(rf worklog.md)"
echo "$WL" | grep -q '^## 2026-10-01 — Phase 6 — Correction and Issue-Control Workflow — `IN_PROGRESS`'; chk "worklog: Phase 6 IN_PROGRESS entry" $?
echo "$WL" | grep -q 'architect review pending\|NOT YET REVIEWED'; chk "worklog: review-pending recorded" $?
echo "$WL" | grep -q '## 2026-10-01 — Phase 5 — Verification and Phase-Gate System — architect approval — `CLOSED`'; chk "worklog: Phase 5 closure entry preserved" $?
echo "$WL" | grep -q '## 2026-10-01 — Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`'; chk "worklog: Phase 5 IN_PROGRESS entry preserved" $?
SESS="$(rf docs/project-control/sessions/SESSION-008.md)"
echo "$SESS" | grep -q 'Phase 6 implementation'; chk "SESSION-008: Phase 6 implementation" $?
echo "$SESS" | grep -q 'PENDING'; chk "SESSION-008: review pending" $?
SRD="$(rf docs/project-control/sessions/README.md)"
echo "$SRD" | grep -q 'SESSION-008'; chk "sessions/README: SESSION-008 index row" $?

# ---------- 7. No competing sources of truth ----------
echo "-- 7. No competing sources --"
n_tpl=$(git ls-files | grep -c 'CORRECTION_HANDOFF_TEMPLATE' || true)
[ "$n_tpl" = "1" ]; chk "exactly one correction-handoff template" $?
n_tst=$(git ls-files | grep -c 'correction-cycle-test' || true)
[ "$n_tst" = "1" ]; chk "exactly one correction-cycle test" $?
n_iss=$(git ls-files | grep -cE '(^|/)ISSUES\.md$' || true)
[ "$n_iss" = "1" ]; chk "exactly one issue register" $?

# ---------- 8. Deterministic tests ----------
echo "-- 8. Deterministic tests --"
OUT6="$(bash docs/project-control/verification/correction-cycle-test.sh 2>&1)"; RC6=$?
echo "$OUT6" | grep -q 'RESULT: 19/19 determinations correct'; chk "correction-cycle test: 19/19 correct" $?
[ $RC6 -eq 0 ]; chk "correction-cycle test: exit 0" $?
OUT5="$(bash docs/project-control/verification/phase-closure-eligibility-test.sh 2>&1)"; RC5=$?
echo "$OUT5" | grep -q 'RESULT: 8/8 determinations correct'; chk "Phase 5 test regression: 8/8 correct" $?
[ $RC5 -eq 0 ]; chk "Phase 5 test regression: exit 0" $?
echo "$OUT5" | grep -q 'case-3-p0-blocker.*expected=FAIL.*MATCH'; chk "Phase 5 test: P0 present -> FAIL (verified)" $?
echo "$OUT6" | grep -q 'example-a-blocking-correction-open.*FAIL.*MATCH'; chk "Example A: open blocking correction -> FAIL" $?
echo "$OUT6" | grep -q 'example-b-architect-resolves.*VALID.*MATCH'; chk "Example B: architect-verified resolution VALID" $?
echo "$OUT6" | grep -q 'example-c-unrelated-path-rejected.*REJECTED.*MATCH'; chk "Example C: unrelated path REJECTED" $?
echo "$OUT6" | grep -q 'example-d-p0-correction-submitted.*FAIL.*MATCH'; chk "Example D: P0 submitted -> FAIL" $?
echo "$OUT6" | grep -q 'example-d-p0-wont-fix-acknowledged.*FAIL.*MATCH'; chk "Example D: P0 WONT_FIX -> FAIL" $?
echo "$OUT6" | grep -q 'example-d-p0-resolved-unblocks.*PASS.*MATCH'; chk "Example D: P0 RESOLVED -> PASS" $?
echo "$OUT6" | grep -q 'performs/claims NO actual architect review\|performs and claims no actual architect review\|NO actual ChatGPT architect review\|no actual ChatGPT architect review'; chk "test disclaimer: no actual architect review claimed" $?

# ---------- 9. npm validate ----------
echo "-- 9. npm run validate:model-config --"
if npm run --silent validate:model-config >/tmp/phase6-model-config.log 2>&1; then ok "validate:model-config PASS"; else bad "validate:model-config FAIL"; fi

# ---------- 10. Scope checks ----------
echo "-- 10. Scope checks (vs baseline $BASELINE) --"
CHANGED="$(list_changed)"
echo "$CHANGED" | while IFS= read -r p; do
  case "$p" in
    worklog.md|docs/project-control/*) echo "ok:$p" ;;
    *) echo "BAD:$p" ;;
  esac
done > /tmp/phase6-changed-paths.txt
if grep -q '^BAD:' /tmp/phase6-changed-paths.txt; then bad "changed paths outside approved scope: $(grep '^BAD:' /tmp/phase6-changed-paths.txt | tr '\n' ' ')"; else ok "all changed paths within worklog.md + docs/project-control/**"; fi
for forbidden in vercel.json src packages supabase migrations docs/doable-source; do
  if echo "$CHANGED" | grep -qE "(^|/)$forbidden(/|$)"; then bad "forbidden path changed: $forbidden"; else ok "no change: $forbidden"; fi
done
if git diff --quiet "$BASELINE" -- vercel.json 2>/dev/null; then ok "vercel.json unchanged vs baseline"; else bad "vercel.json changed"; fi
git merge-base --is-ancestor b65725e55ed13503b70136ffde6a5a7f269d92e2 HEAD 2>/dev/null; chk "b65725e5 ancestry intact" $?

# ---------- 11. Production-branch check ----------
echo "-- 11. Production branches --"
for b in Vercel-Prod Vercel-Preview Vite-Converted main; do
  ref=$(git rev-parse "origin/$b" 2>/dev/null || echo "n/a")
  case "$b:$ref" in
    "Vite-Converted:5ca8ec58"*|"Vercel-Preview:db6cdb48"*|"Vercel-Prod:e0ead990"*|"main:550630f5"*) ok "$b unchanged ($ref)" ;;
    *) bad "$b moved ($ref)" ;;
  esac
done
if git log --format='%H' "$BASELINE"..HEAD 2>/dev/null | wc -l | grep -qE '^[01]$'; then ok "no unexpected commits between baseline and HEAD"; else bad "unexpected commit count between baseline and HEAD"; fi

# ---------- 12. Secret-pattern scan ----------
echo "-- 12. Secret-pattern scan --"
SECPAT='ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]'
if echo "$CHANGED" | grep -q .; then
  if echo "$CHANGED" | while IFS= read -r p; do rf "$p"; done | grep -En "$SECPAT" >/tmp/phase6-secrets.txt 2>&1; then bad "secret pattern match: $(head -3 /tmp/phase6-secrets.txt)"; else ok "no secret patterns in changed paths"; fi
else
  echo "  (no changed paths to scan)"
fi

# ---------- 13. Final State Contract consistency ----------
echo "-- 13. Final State Contract --"
cnt_cp=$(echo "$CP" | grep -c 'Phase 6 — Correction and Issue-Control Workflow' || true)
[ "$cnt_cp" -ge 1 ]; chk "CURRENT_PHASE mentions Phase 6 ($cnt_cp)" $?
cnt_zh=$(echo "$ZH" | grep -c 'Phase 6 — Correction and Issue-Control Workflow' || true)
[ "$cnt_zh" -ge 1 ]; chk "ZAI_HANDOFF mentions Phase 6 ($cnt_zh)" $?
echo "$PS" | grep -q 'IN_PROGRESS'; chk "PROJECT_STATE IN_PROGRESS" $?
echo "$NA" | grep -q 'IN_PROGRESS'; chk "NEXT_ACTION IN_PROGRESS" $?
echo "$VS" | grep -q 'Phase 6 — Correction and Issue-Control Workflow, `IN_PROGRESS`'; chk "VERIFICATION_STATE consistency table: Phase 6 IN_PROGRESS" $?
echo "$WL" | grep -q '`IN_PROGRESS`'; chk "worklog latest phase entry IN_PROGRESS" $?

echo ""
echo "=================================================="
echo "RESULT: $PASS PASS / $FAIL FAIL (mode: $MODE)"
if [ "$FAIL" -eq 0 ]; then echo "All Phase 6 aggregate validation checks passed."; exit 0; else echo "FAILURES PRESENT — do not commit/close on this state."; exit 1; fi
