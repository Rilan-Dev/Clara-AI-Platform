#!/usr/bin/env bash
# validate-phase5-p0-correction.sh — read-only validation of the Phase 5 P0-closure-policy
# correction (architect CORRECTION_REQUIRED cycle; corrective handoff 2026-10-01).
#
# Covers the corrective handoff's §5 acceptance criteria (1–12) plus §6 verification:
#   1–2.  Canonical P0 policy: P0 prevents phase closure; explicitly no P0 exception path.
#   3.    No current Phase 5 control document suggests an architect can authorize closure
#         despite P0 (the contradictory clause and its P0/P1-exception phrasing removed).
#   4.    P1 exception mechanism intact.
#   5.    Deterministic closure test: 8/8, exit 0; P0 case still FAIL (also P1 cases).
#   6.    No unrelated governance rules change (outcomes/gates/R-rules/meta-rules intact).
#   7.    No product/DB/deployment/immutable-source changes; no secrets.
#   8.    Evidence correctly classified (CORRECTION_REQUIRED = architect-verified; the
#         correction itself = developer-reported; no architect approval claimed).
#   9–10. Phase 5 remains IN_PROGRESS; Phase 6 remains NOT STARTED.
#   11.   Final State Contract consistent (5 members + latest worklog phase entry).
#   12.   Worklog/session history corrected only via the append-only mechanism.
#   +     Changed-path set exactly the 5 declared correction paths; commit message/parent
#         (HEAD mode); clean tree + local/remote sync (HEAD mode); model-config.
#
# Modes: "staged" (pre-commit; HEAD must equal the correction baseline f9ce6a83)
#        "HEAD"   (post-commit/post-push; HEAD must be the immediate child of f9ce6a83)
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

CORRBASE='f9ce6a833bc67205384e17bb92433c78967f4363'   # the Phase 5 implementation commit = correction baseline
IMPL='5febaacd5dcc55268904d1371038bbe8ff372040'       # latest architect-verified implementation (unchanged)
EXT='b65725e55ed13503b70136ffde6a5a7f269d92e2'
BRANCH='feature/ai-core-from-doable-source'
CORRMSG='docs: correct phase 5 p0 closure policy'
PC='docs/project-control'
CKL="$PC/VERIFICATION_CHECKLIST.md"
VST="$PC/VERIFICATION_STATE.md"
CUR="$PC/CURRENT_PHASE.md"
TESTSH="$PC/verification/phase-closure-eligibility-test.sh"
ALLOWED='docs/project-control/CURRENT_PHASE.md docs/project-control/VERIFICATION_CHECKLIST.md docs/project-control/VERIFICATION_STATE.md docs/project-control/sessions/SESSION-006.md worklog.md '

echo "== Mode: $MODE | repo: $REPO | correction baseline: $CORRBASE =="

# ---------- 1–2. Canonical P0 policy: prevents closure + no exception path ----------
pos "$VST" 'P0 prevents phase closure — always. There is no P0 exception path.' "1a. contract canonical: P0 prevents phase closure — always; no P0 exception path"
pos "$VST" 'An architect decision may document acknowledgement, remediation, escalation, or other operational handling of a recorded P0' "1b. contract: architect decisions may document operational handling of a P0"
pos "$VST" 'must **not** authorize phase closure while the P0 remains recorded' "1c. contract: architect decision must not authorize closure while P0 recorded"
pos "$VST" 'no architect decision, closure record, or other mechanism can ever make a verification state with a recorded P0 closure-eligible' "2a. contract: no mechanism can ever make a P0-affected state closure-eligible"
pos "$CKL" 'P0 prevents phase closure — always; there is no P0 exception path.' "2b. checklist §6 P0 summary matches the canonical rule"
pos "$CKL" 'must **not** authorize phase closure while the P0 remains recorded' "2c. checklist: architect decision must not authorize closure while P0 recorded"
pos "$CUR" 'prevents phase closure — always; there is no P0 exception path.' "2d. CURRENT_PHASE P0 rule matches the canonical rule"
pos "$CUR" 'must **not** authorize phase closure while the P0 remains recorded' "2e. CURRENT_PHASE: architect decision must not authorize closure while P0 recorded"

# ---------- 3. Contradictory P0 wording removed from every control document ----------
neg "$PC" 'proceed despite' "3a. no control document contains the removed 'proceed despite' clause"
neg worklog.md 'proceed despite' "3b. worklog contains no 'proceed despite' clause"
neg "$PC" 'P0/P1 exception' "3c. no control document implies a P0-exception category ('P0/P1 exception' removed)"
neg worklog.md 'P0/P1 exception' "3d. worklog implies no P0-exception category"
neg "$PC" 'separately-committed' "3e. no control document contains the removed 'separately-committed' mechanism"
neg "$PC" 'separately committed' "3f. no control document contains the unhyphenated variant"
neg "$VST" 'This contract defines no P0 exception path' "3g. contract: old P0 sentence replaced (not merely appended to)"
neg "$CUR" 'no P0 exception path is defined' "3h. CURRENT_PHASE: old P0 phrasing replaced"

# ---------- 4. P1 exception mechanism intact ----------
pos "$VST" 'P1 prevents `PASS`' "4a. contract: P1 prevents PASS"
pos "$VST" 'unless the project-control policy explicitly records and approves a valid exception' "4b. contract: P1 exception requires recorded approval"
pos "$VST" 'any P1 exception requires an explicit architect decision' "4c. contract: P1 exception requires explicit architect decision"
pos "$VST" 'the P1 exception is the only exception mechanism this contract defines, because P0 has none' "4d. contract: P1 is the only exception mechanism (P0 has none)"
pos "$CKL" 'P1 prevents `PASS`' "4e. checklist: P1 prevents PASS"
pos "$CKL" 'any P1 exception requires an explicit architect decision' "4f. checklist: P1 exception requires explicit architect decision"
pos "$CUR" 'unless an explicitly recorded architect-approved exception exists' "4g. CURRENT_PHASE: P1 exception rule unchanged"
pos "$VST" 'Exceptions are never invented by the developer' "4h. contract: exceptions never invented by the developer"

# ---------- 5. Deterministic closure test (P0 case still FAIL; P1 cases intact) ----------
TESTOUT="$(bash "$TESTSH" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ]; then ok "5a. deterministic test exits 0"; else bad "5a. deterministic test exit = $rc"; fi
if printf '%s' "$TESTOUT" | rg -q '8/8 determinations correct'; then ok "5b. deterministic test: 8/8 correct"; else bad "5b. deterministic test aggregate missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-3-p0-blocker.*computed=FAIL.*expected=FAIL.*MATCH'; then ok "5c. P0 present -> closure eligibility FAIL (case-3)"; else bad "5c. case-3 P0 line mismatch"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-4-p1-unhandled.*computed=FAIL.*expected=FAIL.*MATCH'; then ok "5d. unhandled P1 -> FAIL (case-4)"; else bad "5d. case-4 line mismatch"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-5-p1-architect-approved-exception.*computed=PASS.*expected=PASS.*MATCH'; then ok "5e. P1 with architect-approved exception -> PASS (case-5)"; else bad "5e. case-5 line mismatch"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-1-incomplete-missing-gate-d.*computed=FAIL.*expected=FAIL.*MATCH'; then ok "5f. incomplete case-1 -> FAIL"; else bad "5f. case-1 line mismatch"; fi
if printf '%s' "$TESTOUT" | rg -q 'case-2-complete-applicable-gates.*computed=PASS.*expected=PASS.*MATCH'; then ok "5g. complete case-2 -> PASS"; else bad "5g. case-2 line mismatch"; fi
pos "$TESTSH" 'P0 unconditionally prevents closure' "5h. test R4 reasoning: P0 unconditionally prevents closure"
pos "$TESTSH" 'no exception path is defined in the contract' "5i. test R4 comment: no exception path defined"

# ---------- 6. No unrelated governance rules changed ----------
pos "$VST" 'never silently converted into `PASS`' "6a. PASS_WITH_FOLLOWUP semantics intact"
pos "$VST" '**R4** — P0 count = 0' "6b. contract closure-eligibility R4 intact"
pos "$CKL" '**R4** — P0 count = 0' "6c. checklist closure-eligibility R4 intact"
pos "$CUR" 'P0 = 0; P1 = 0 or architect-approved exceptions recorded' "6d. CURRENT_PHASE closure eligibility intact"
for f in "$VST" "$CKL" "$CUR"; do
  pos "$f" 'PASS_WITH_FOLLOWUP' "6e. $f still defines all three review outcomes"
done
pos "$VST" 'the checklist itself does not close a phase; only ChatGPT' "6f. contract meta-rule intact (only ChatGPT's review closes)"
pos "$CKL" 'The checklist itself does not close a phase. Only ChatGPT' "6g. checklist meta-rule intact"
posre "$VST" '^\| \*\*A — Scope\*\*' "6h. contract Gates A–F table intact (Gate A row)"
posre "$VST" '^\| \*\*F — Deployment\*\*' "6i. contract Gates A–F table intact (Gate F row)"
pos "$PC/DECISIONS.md" 'D-020' "6j. DECISIONS.md D-020 unchanged (not part of the correction diff)"
pos "$PC/DECISIONS.md" 'P0 unconditionally prevents closure — no exception path defined' "6k. D-020 wording already consistent with the corrected canonical rule"
pos "$VST" 'P0/P1 blocker policy exists' "6l. Phase 5 validation table (25 checks) preserved"
pos "$VST" 'rg' "6m. appendix re-runnable command block preserved"

# ---------- 7. Scope: documentation-only; no product/DB/deployment/immutable-source; no secrets ----------
n=$(git diff --name-only "$CORRBASE" -- src packages supabase vercel.json docs/doable-source | wc -l)
chk "7a. no src/packages/supabase/vercel.json/Doable-source changes vs correction baseline" "$n"
n=$(git diff --name-only "$CORRBASE" -- 'db/*' 'supabase/*' '*migration*' | wc -l)
chk "7b. no migration/DB files changed" "$n"
n=$(git diff --name-only "$CORRBASE" -- vercel.json | wc -l); chk "7c. vercel.json unchanged" "$n"
git merge-base --is-ancestor "$EXT" HEAD; chk "7d. b65725e5 ancestry intact (not rewritten)" "$?"
extline=$(git log --format='%H %s' -1 "$EXT")
if [ "$extline" = "$EXT chore(vercel): enable AI core feature branch preview deployment" ]; then
  ok "7e. b65725e5 identity unchanged"
else
  bad "7e. b65725e5 identity check: '$extline'"
fi
negre 'worklog.md docs/project-control/' 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "7f. no secrets/tokens in changed documents"

# ---------- 8. Evidence correctly classified ----------
pos "$VST" 'Architect review of the Phase 5 implementation — outcome `CORRECTION_REQUIRED`' "8a. register records the architect review outcome"
pos "$VST" 'architect-verified — the review outcome and corrective handoff as communicated by ChatGPT' "8b. CORRECTION_REQUIRED classified architect-verified (as communicated)"
pos "$VST" 'no architect approval of Phase 5 is claimed' "8c. no architect approval claimed"
pos "$VST" 'Pending: the architect re-review of the corrected Phase 5 implementation' "8d. outstanding state: pending the architect re-review of the corrected implementation"
pos "$VST" "awaiting the architect's re-review" "8d2. register: awaiting the architect's re-review"
pos "$VST" 'Corrective cycle (2026-10-01)' "8e. corrective-cycle evidence row present"
pos "$VST" 'Corrective commit' "8f. corrective-commit row present"
neg "$VST" 'the architect review of the Phase 5 implementation has **not** occurred' "8g. stale 'review has not occurred' claim removed from the register"

# ---------- 9–10. Phase 5 IN_PROGRESS; Phase 6 NOT STARTED ----------
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE ZAI_HANDOFF; do
  pos "$PC/$f.md" 'Phase 5 — Verification and Phase-Gate System' "9. $f.md identifies Phase 5"
done
pos "$PC/PROJECT_STATE.md" '**Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`**' "9a. PROJECT_STATE current phase IN_PROGRESS"
pos "$PC/CURRENT_PHASE.md" '| Status | **IN_PROGRESS**' "9b. CURRENT_PHASE status IN_PROGRESS"
pos "$PC/NEXT_ACTION.md" '`IN_PROGRESS`' "9c. NEXT_ACTION Phase 5 IN_PROGRESS"
posre "$PC/ZAI_HANDOFF.md" '^\| Current status \| \*\*IN_PROGRESS\*\*' "9d. ZAI_HANDOFF Part II IN_PROGRESS"
posre "$VST" '^## Phase 5 — Verification and Phase-Gate System — IN_PROGRESS' "9e. VERIFICATION_STATE Phase 5 IN_PROGRESS"
posre worklog.md '^## 2026-10-01 — Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`' "9f. latest worklog phase entry = Phase 5 IN_PROGRESS"
pos "$PC/PROJECT_STATE.md" 'no Phase 6 artifacts' "10a. PROJECT_STATE: no Phase 6 artifacts (Phase 6 not started)"
pos "$PC/CURRENT_PHASE.md" 'Do not begin Phase 6' "10b. CURRENT_PHASE stopping boundary: do not begin Phase 6"
pos worklog.md 'Phase 6 remains NOT STARTED' "10c. worklog corrective note: Phase 6 remains NOT STARTED"

# ---------- 11. Final State Contract consistent ----------
pos "$PC/PROJECT_STATE.md" "$IMPL" "11a. latest verified commit remains 5febaacd (PROJECT_STATE)"
pos "$VST" 'latest verified commit' "11b. consistency table records latest verified commit"
pos "$PC/PROJECT_STATE.md" '8d8595d0' "11c. phase baseline 8d8595d0 recorded (PROJECT_STATE)"
pos "$VST" "$CORRBASE" "11d. correction baseline f9ce6a83 recorded (register)"

# ---------- 12. Append-only corrections in worklog + session record ----------
n=$(git diff "$CORRBASE" -- worklog.md | grep -cE '^-[^-]')
chk "12a. worklog change is pure append (0 deleted lines)" "$n"
n=$(git diff "$CORRBASE" -- "$PC/sessions/SESSION-006.md" | grep -cE '^-[^-]')
chk "12b. SESSION-006 change is pure append (0 deleted lines)" "$n"
pos worklog.md 'correct phase 5 p0 closure policy' "12c. worklog corrective note records the correction commit"
pos worklog.md 'this note is appended per §3.1' "12d. worklog note cites the §3.1 append-only convention"
pos "$PC/sessions/SESSION-006.md" "corrective handoff on the Phase 5 implementation" "12e. SESSION-006 dated corrective note present"
pos "$PC/sessions/SESSION-006.md" 'appended per the sessions layer' "12f. SESSION-006 note cites the sessions append-only convention"
n=$(git diff "$CORRBASE" -- "$PC/sessions/README.md" | wc -l)
chk "12g. sessions README index untouched (no new session record; continuation note per precedent)" "$n"

# ---------- 13. Changed-path set exactly the 5 declared correction paths ----------
if [ "$MODE" = "staged" ]; then
  changed=$(git status --porcelain | awk '{print $2}' | sort | tr '\n' ' ')
else
  changed=$(git show --name-only --format= HEAD | sort | tr '\n' ' ')
fi
if [ "$changed" = "$ALLOWED" ]; then
  ok "13. changed-path set exactly the 5 declared correction paths ($MODE)"
else
  bad "13. unexpected changed-path set: '$changed'"
fi

# ---------- Structural integrity ----------
git show "$CORRBASE:docs/project-control/ZAI_HANDOFF.md" | head -n 183 > /home/z/my-project/scripts/_p5c_zh_base.md
head -n 183 "$PC/ZAI_HANDOFF.md" > /home/z/my-project/scripts/_p5c_zh_cur.md
if diff -q /home/z/my-project/scripts/_p5c_zh_base.md /home/z/my-project/scripts/_p5c_zh_cur.md >/dev/null; then
  ok "S1. ZAI_HANDOFF Part I byte-identical to correction baseline (untouched)"
else
  bad "S1. ZAI_HANDOFF Part I differs from correction baseline"
fi
n=$(git diff --name-only "$CORRBASE" -- "$PC/ZAI_HANDOFF.md" | wc -l)
chk "S2. ZAI_HANDOFF.md untouched by the correction" "$n"
n=$(git diff --name-only "$CORRBASE" -- "$PC/PROJECT_STATE.md" "$PC/NEXT_ACTION.md" "$PC/DECISIONS.md" "$PC/ISSUES.md" "$PC/RISKS.md" "$PC/CHAT_CONTINUITY.md" | wc -l)
chk "S3. out-of-scope control documents untouched (PROJECT_STATE/NEXT_ACTION/DECISIONS/ISSUES/RISKS/CHAT_CONTINUITY)" "$n"
n=$(git diff --name-only "$CORRBASE" -- "$TESTSH" | wc -l)
chk "S4. deterministic test script untouched (already consistent with the canonical rule)" "$n"

if [ "$MODE" = "staged" ]; then
  h=$(git rev-parse HEAD)
  if [ "$h" = "$CORRBASE" ]; then ok "S5. pre-commit baseline: HEAD = f9ce6a83 (Phase 5 implementation commit)"; else bad "S5. pre-commit HEAD = $h"; fi
else
  msg=$(git log --format='%s' -1 HEAD)
  if [ "$msg" = "$CORRMSG" ]; then ok "S5. HEAD commit message exact: '$CORRMSG'"; else bad "S5. HEAD message: '$msg'"; fi
  par=$(git rev-parse HEAD^)
  if [ "$par" = "$CORRBASE" ]; then ok "S6. correction commit is the immediate child of f9ce6a83"; else bad "S6. HEAD^ = $par"; fi
  # ---------- 14. Clean tree ----------
  n=$(git status --porcelain | wc -l); chk "14. working tree clean after commit" "$n"
  # ---------- 15. Local/remote synchronized ----------
  h=$(git rev-parse HEAD); o=$(git rev-parse "origin/$BRANCH")
  if [ "$h" = "$o" ]; then ok "15. local $BRANCH and origin synchronized ($h)"; else bad "15. local $h != origin $o"; fi
  git merge-base --is-ancestor "$CORRBASE" HEAD; chk "S7. fast-forward history (f9ce6a83 ancestor of HEAD; no force-push)" "$?"
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
