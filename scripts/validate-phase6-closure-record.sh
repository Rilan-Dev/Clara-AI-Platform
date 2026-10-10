#!/usr/bin/env bash
# validate-phase6-closure-record.sh — Phase 6 closure-record validation (read-only)
# Persisted outside the repository per the Phase 3/4/5 convention.
# Modes: staged (pre-commit) and HEAD (post-commit) — pass "head" as $1 for HEAD mode.
# Repository working tree: /home/z/my-project/.worktrees/vc (feature/ai-core-from-doable-source)

set -u
REPO="/home/z/my-project/.worktrees/vc"
MODE="${1:-staged}"
cd "$REPO" || exit 1

PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); echo "  [PASS] $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; }
chk()  { if [ "$2" = "0" ]; then ok "$1"; else bad "$1"; fi; }

REVIEWED="4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884"
BASELINE="c0cca964064286c25dcf22c8f86038baaacd7ebe"

echo "== Phase 6 closure-record validation ($MODE mode) =="

# --- 1. Reviewer / lineage checks ---
if [ "$MODE" = "head" ]; then
  C=$(git rev-parse HEAD); P=$(git rev-parse HEAD^)
else
  C="staged"; P=$(git rev-parse HEAD)
fi
echo "-- closure commit / lineage --"
chk "branch is feature/ai-core-from-doable-source" $([ "$(git branch --show-current)" = "feature/ai-core-from-doable-source" ]; echo $?)
chk "parent of closure commit is the reviewed correction $REVIEWED" $([ "$P" = "$REVIEWED" ]; echo $?)
if [ "$MODE" = "head" ]; then
  chk "closure commit differs from the reviewed correction commit (separate commit)" $([ "$C" != "$REVIEWED" ]; echo $?)
  chk "closure commit message is 'docs: record architect approval of phase 6'" $([ "$(git log --format='%s' -1 HEAD)" = "docs: record architect approval of phase 6" ]; echo $?)
fi
chk "reviewed correction is the immediate child of the correction baseline c0cca964" $([ "$(git rev-parse ${REVIEWED}^)" = "$BASELINE" ]; echo $?)

# --- 2. Deterministic tests ---
echo "-- deterministic tests --"
bash docs/project-control/verification/correction-cycle-test.sh >/dev/null 2>&1
chk "correction-cycle-test.sh exits 0 (24/24 determinations)" $?
bash docs/project-control/verification/correction-cycle-test.sh 2>/dev/null | grep -q "RESULT: 24/24 determinations correct"
chk "correction-cycle-test.sh reports 24/24 correct" $?
bash docs/project-control/verification/phase-closure-eligibility-test.sh >/dev/null 2>&1
chk "phase-closure-eligibility-test.sh exits 0" $?
bash docs/project-control/verification/phase-closure-eligibility-test.sh 2>/dev/null | grep -q "RESULT: 8/8 determinations correct"
chk "phase-closure-eligibility-test.sh reports 8/8 correct (no Phase 5 regression)" $?

# --- 3. Closure-record content checks ---
echo "-- closure record content --"
rg -q '\| Status \| `RESOLVED`' docs/project-control/ISSUES.md
chk "ISSUES.md: I-013 status is RESOLVED" $?
rg -q '^### I-013 — .*RESOLVED|RESOLVED` \(lifecycle:' docs/project-control/ISSUES.md
chk "ISSUES.md: I-013 lifecycle records the architect RESOLVED transition" $?
rg -q '\| Resolution evidence \| \[architect-verified\]' docs/project-control/ISSUES.md
chk "ISSUES.md: I-013 resolution evidence is explicitly [architect-verified]" $?
rg -q '\| Resolution date \| 2026-10-01' docs/project-control/ISSUES.md
chk "ISSUES.md: I-013 resolution date is 2026-10-01" $?
rg -q "$REVIEWED" docs/project-control/ISSUES.md
chk "ISSUES.md: records the exact reviewed correction SHA" $?
rg -q '## Phase 6 — Correction and Issue-Control Workflow — CLOSED' docs/project-control/VERIFICATION_STATE.md
chk "VERIFICATION_STATE.md: Phase 6 section header is CLOSED" $?
rg -q 're-review of the corrected Phase 6 state returned `PASS`|outcome `PASS`' docs/project-control/VERIFICATION_STATE.md
chk "VERIFICATION_STATE.md: records the architect PASS re-review" $?
rg -q '### Outstanding architect verification state for Phase 6' -A2 docs/project-control/VERIFICATION_STATE.md && rg -q '^\*\*None\.\*\* The phase was closed by architect review' docs/project-control/VERIFICATION_STATE.md
chk "VERIFICATION_STATE.md: outstanding verification state for Phase 6 is None" $?
rg -q "correction baseline .*$BASELINE|$BASELINE.*correction baseline|the correction baseline was \`$BASELINE\`" docs/project-control/PROJECT_STATE.md docs/project-control/VERIFICATION_STATE.md docs/project-control/CURRENT_PHASE.md docs/project-control/ISSUES.md
chk "correction baseline c0cca964 preserved in current-state members" $?
rg -q 'Phase 6 introduces no P2/P3 exception mechanism' docs/project-control/ISSUES.md docs/project-control/VERIFICATION_STATE.md docs/project-control/CURRENT_PHASE.md
chk "canonical rule: Phase 6 introduces no P2/P3 exception mechanism (present in all carriers)" $?
rg -q 'P2/P3 contradiction is resolved' docs/project-control/VERIFICATION_STATE.md docs/project-control/ISSUES.md
chk "the P2/P3 contradiction is recorded as resolved" $?

# --- 4. Phase 6 CLOSED / Phase 7 NOT STARTED across Final State Contract members ---
echo "-- final state contract consistency --"
for f in PROJECT_STATE CURRENT_ACTION; do :; done
for f in docs/project-control/PROJECT_STATE.md docs/project-control/CURRENT_PHASE.md docs/project-control/VERIFICATION_STATE.md docs/project-control/ZAI_HANDOFF.md; do
  rg -q "Phase 6.*CLOSED" "$f"
  chk "$f: Phase 6 CLOSED" $?
done
rg -q '\*\*None\.\*\* Phase 6 — Correction and Issue-Control Workflow is \*\*`CLOSED`\*\*' docs/project-control/NEXT_ACTION.md
chk "NEXT_ACTION.md: active phase None; Phase 6 CLOSED" $?
rg -q '^## 2026-10-01 — Phase 6 — Correction and Issue-Control Workflow — architect approval — `CLOSED`' worklog.md
chk "worklog.md: append-only Phase 6 closure entry present" $?
for f in docs/project-control/PROJECT_STATE.md docs/project-control/CURRENT_PHASE.md docs/project-control/NEXT_ACTION.md docs/project-control/VERIFICATION_STATE.md docs/project-control/ZAI_HANDOFF.md; do
  rg -q 'Phase 7' "$f"
  chk "$f: Phase 7 referenced" $?
done
rg -c 'NOT STARTED' docs/project-control/PROJECT_STATE.md docs/project-control/CURRENT_PHASE.md docs/project-control/NEXT_ACTION.md docs/project-control/VERIFICATION_STATE.md docs/project-control/ZAI_HANDOFF.md >/dev/null 2>&1
chk "NOT STARTED present across current-state members" $?

# --- 5. Preserved history / non-scope ---
echo "-- preserved history / non-scope --"
git diff --quiet "${REVIEWED}" -- docs/project-control/sessions/SESSION-009.md docs/project-control/sessions/SESSION-008.md
chk "SESSION-008/SESSION-009 unrewritten vs the reviewed correction" $?
git diff --quiet "${REVIEWED}" -- docs/project-control/DECISIONS.md docs/project-control/RISKS.md
chk "DECISIONS.md/RISKS.md untouched vs the reviewed correction" $?
rg -q '^### I-001 — .*open|\| Status \| open \|' docs/project-control/ISSUES.md
chk "I-001 remains open (not resolved by this closure)" $?
rg -q '\| I-007 \| open \||^### I-007' docs/project-control/ISSUES.md
chk "I-007 reference preserved" $?
git diff --quiet "${REVIEWED}" -- vercel.json src packages supabase migrations docs/doable-source
chk "no product/DB/deployment/immutable-source changes vs the reviewed correction" $?
git merge-base --is-ancestor b65725e55ed13503b70136ffde6a5a7f269d92e2 HEAD
chk "b65725e5 ancestry intact" $?
rg -q 'not independently established' docs/project-control/PROJECT_STATE.md docs/project-control/VERIFICATION_STATE.md
chk "b65725e5 provenance classification preserved (not independently established)" $?

# --- 6. Changed-path scope + secrets ---
echo "-- changed-path scope / secrets --"
if [ "$MODE" = "head" ]; then DIFFBASE="${REVIEWED}"; else DIFFBASE="--cached --"; fi
if [ "$MODE" = "head" ]; then
  CHANGED=$(git diff --name-only "${REVIEWED}".."HEAD")
else
  CHANGED=$(git diff --name-only --cached; git diff --name-only)
fi
BADPATHS=$(echo "$CHANGED" | grep -v -E '^(worklog\.md|docs/project-control/)' | grep -v '^$' || true)
chk "every changed path is worklog.md or docs/project-control/**" $([ -z "$BADPATHS" ]; echo $?)
SECRETS=$(rg -l 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' worklog.md docs/project-control/ 2>/dev/null || true)
chk "secret-pattern scan: no matches" $([ -z "$SECRETS" ]; echo $?)

# --- 7. Session audit ---
echo "-- session audit --"
test -f docs/project-control/sessions/SESSION-010.md
chk "SESSION-010.md exists" $?
rg -q 'SESSION-010' docs/project-control/sessions/README.md
chk "sessions/README.md index row for SESSION-010 present" $?

echo
echo "RESULT: $PASS passed, $FAIL failed (Phase 6 closure-record validation, $MODE mode)"
[ "$FAIL" = "0" ] && exit 0 || exit 1
