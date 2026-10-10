#!/usr/bin/env bash
# validate-phase6-p2p3-correction.sh — read-only validation of the Phase 6 P2/P3
# closure-policy correction (architect CORRECTION_REQUIRED cycle; corrective handoff
# CH-001 / issue I-013; correction baseline c0cca964064286c25dcf22c8f86038baaacd7ebe).
#
# Covers the corrective handoff's §18 acceptance criteria (1–22) plus §10–§12 verification:
#   1.    P0 remains unconditionally closure-blocking.
#   2.    P1 retains the existing Phase 5 exception mechanism.
#   3–5.  P2/P3 do not automatically block closure; acceptance-violating P2/P3 are
#         closure-blocking while unresolved; NO P2/P3 exception mechanism exists.
#   6.    R6 remains authoritative for unresolved blocking corrections.
#   7.    The Phase 6 issue-control system does not contradict Phase 5.
#   8–10. The deterministic test proves: non-acceptance-violating P2/P3 non-blocking;
#         acceptance-violating P2/P3 blocking; rejection of an unresolved
#         acceptance-violating P2/P3 with an alleged exception.
#   11.   The Phase 5 regression remains 8/8 (P0 present -> FAIL).
#   12.   No unrelated lifecycle semantics changed.
#   13.   No unrelated project-control documents modified (exact 10-path set).
#   14.   No product/DB/deployment/immutable-source changes; no secrets.
#   15.   Evidence classified correctly (CORRECTION_REQUIRED = architect-verified as
#         communicated; the correction itself = developer-reported; re-review PENDING).
#   16–17. Phase 6 remains IN_PROGRESS; the architect re-review remains PENDING.
#   18.   The correction recorded in the issue-control system (I-013 + CH-001).
#   19.   Worklog history append-only (pure append vs the correction baseline).
#   20.   Final State Contract consistent (5 members + latest worklog phase entry).
#   21–22. Clean tree + local/remote sync (HEAD mode); commit message/parent/child.
#
# Modes: "staged" (pre-commit; HEAD must equal the correction baseline c0cca964)
#        "HEAD"   (post-commit/post-push; HEAD must be the immediate child of c0cca964)
#
# Persisted OUTSIDE the repository per the Phase 3/4/5 convention. Read-only.

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

CORRBASE='c0cca964064286c25dcf22c8f86038baaacd7ebe'   # the Phase 6 implementation commit = correction baseline
IMPL='fb4ad5f59b5661dc2bc7f38039805fc6294d58ef'       # latest architect-verified implementation (unchanged)
EXT='b65725e55ed13503b70136ffde6a5a7f269d92e2'
BRANCH='feature/ai-core-from-doable-source'
CORRMSG='docs: correct phase 6 p2 p3 closure policy'
PC='docs/project-control'
ISS="$PC/ISSUES.md"
VST="$PC/VERIFICATION_STATE.md"
CUR="$PC/CURRENT_PHASE.md"
TESTSH="$PC/verification/correction-cycle-test.sh"
P5SH="$PC/verification/phase-closure-eligibility-test.sh"
ALLOWED='docs/project-control/CURRENT_PHASE.md docs/project-control/ISSUES.md docs/project-control/NEXT_ACTION.md docs/project-control/PROJECT_STATE.md docs/project-control/VERIFICATION_STATE.md docs/project-control/ZAI_HANDOFF.md docs/project-control/sessions/README.md docs/project-control/sessions/SESSION-009.md docs/project-control/verification/correction-cycle-test.sh worklog.md '

echo "== Mode: $MODE | repo: $REPO | correction baseline: $CORRBASE | correction: CH-001 / issue I-013 =="

# ---------- 1. P0 remains unconditionally closure-blocking (unchanged) ----------
pos "$ISS" 'P0 prevents phase closure — always; there is no P0 exception path.' "1a. ISSUES severity model: P0 prevents closure — always; no P0 exception path"
pos "$ISS" 'An architect decision may document acknowledgement, remediation, escalation, or other operational handling of a recorded P0, but it must not authorize phase closure while the P0 remains unresolved' "1b. ISSUES: architect decisions must not authorize closure while P0 unresolved"
pos "$VST" 'P0 prevents phase closure — always. There is no P0 exception path.' "1c. Phase 5 contract P0/P1 blocker rule unchanged (register)"
git show "$CORRBASE:$PC/VERIFICATION_STATE.md" | rg -q -F 'P0 prevents phase closure — always. There is no P0 exception path.' && ok "1d. P0 rule body byte-identical to correction baseline" || bad "1d. P0 rule body changed vs baseline"

# ---------- 2. P1 retains the existing Phase 5 exception mechanism (unchanged) ----------
pos "$ISS" 'P1 prevents `PASS`' "2a. ISSUES: P1 prevents PASS"
pos "$ISS" 'the P1 exception is the only exception mechanism (P0 and P2/P3 have none)' "2b. ISSUES: the P1 exception is the only exception mechanism (P0 and P2/P3 have none)"
pos "$ISS" 'A pending/accepted P1 **correction** is not an exception — the issue blocks until `RESOLVED`' "2c. ISSUES: a pending P1 correction is not an exception"
pos "$VST" 'P1 exception semantics remain unchanged' "2d. register correction-workflow contract: P1 exception semantics unchanged"
pos "$CUR" 'P1 prevents `PASS` unless an explicitly recorded architect-approved exception exists' "2e. CURRENT_PHASE: P1 exception rule unchanged"
pos "$VST" '**R5** — P1 count = 0, or every P1 carries an explicitly recorded architect-approved exception' "2f. R5 (the P1 exception rule) intact"

# ---------- 3–5. Corrected P2/P3 semantics: no automatic block; blocking while unresolved; NO exception ----------
pos "$ISS" 'Phase 6 introduces no P2/P3 exception mechanism' "3a. ISSUES P2 row: Phase 6 introduces no P2/P3 exception mechanism"
pos "$ISS" 'remains closure-blocking while unresolved — it must be resolved (`RESOLVED`) before the phase can close' "4a. ISSUES P2 row: acceptance-violating P2 blocks while unresolved and must be resolved"
pos "$ISS" 'no P2/P3 exception mechanism exists (resolution is the only path)' "5a. ISSUES P3 row: no P2/P3 exception mechanism; resolution only"
pos "$ISS" 'an acceptance-violating P2/P3 cannot become closure-compatible merely because an exception is recorded' "5b. ISSUES P2 row: an exception does not make an unresolved blocking P2/P3 closure-compatible"
pos "$VST" 'Phase 6 introduces no P2/P3 exception mechanism' "3b. register R6 mapping: Phase 6 introduces no P2/P3 exception mechanism"
pos "$VST" 'a recorded architect-approved exception has no clearing effect for P2/P3' "5c. register R6 mapping: an exception has no clearing effect for P2/P3"
pos "$CUR" 'Phase 6 introduces no P2/P3 exception mechanism' "3c. CURRENT_PHASE summary: Phase 6 introduces no P2/P3 exception mechanism"
pos "$CUR" 'a recorded architect-approved exception exists for P1 only and has no clearing effect for P2/P3' "5d. CURRENT_PHASE: the exception exists for P1 only"
# The old contradictory wording must be absent from the live rules. NOTE: the strings
# legitimately survive inside the I-013 record's Evidence field (a dated quotation of the
# removed defect — canonical-schema evidence, not a live rule), so the negative checks are
# scoped to the NORMATIVE region of ISSUES.md (§"Issue-control system", before "## Open"):
sed -n '1,/^## Open$/p' "$ISS" | head -n -1 > /home/z/my-project/scripts/_p6c_iss_norm.md
neg /home/z/my-project/scripts/_p6c_iss_norm.md 'cleared only by resolution (`RESOLVED`) or by an explicitly recorded architect-approved exception' "5e. ISSUES normative region: old P2 exception clause removed"
neg /home/z/my-project/scripts/_p6c_iss_norm.md 'unless resolved or covered by a recorded architect-approved exception' "5f. ISSUES normative region: old P3 exception clause removed"
neg "$VST" 'without a recorded architect-approved exception' "5g. register: old R6 qualifier removed"
neg "$CUR" 'unless resolved or covered by a recorded architect-approved exception' "5h. CURRENT_PHASE: old exception clause removed"
# The only remaining occurrences of the old semantics must be historical finding quotations
# (the I-013 evidence field, the register's corrective-cycle records, the worklog/session notes):
n=$(rg -c -F 'unless resolved or covered by a recorded architect-approved exception' "$ISS" 2>/dev/null); n="${n:-0}"
if [ "$n" -eq 1 ]; then ok "5i. the old P3 clause survives exactly once (the I-013 Evidence quotation of the removed defect)"; else bad "5i. old P3 clause occurrence count = $n (expected 1 — the evidence quotation)"; fi

# ---------- 6–7. R6 authoritative; no Phase 5 contradiction ----------
pos "$VST" 'no Phase 6 rule can bypass R6 for an unresolved blocking P2/P3' "6a. register: no Phase 6 rule can bypass R6"
pos "$VST" '**R6** — no unresolved blocking correction is open' "6b. R6 text intact (authoritative)"
pos "$VST" 'Closure eligibility continues to follow R1–R7' "7a. correction workflow continues to follow R1–R7 (no second verification system)"
pos "$VST" 'no second verification system' "7b. no competing verification system"

# ---------- 8–10. Deterministic test: corrected semantics proven ----------
TESTOUT="$(bash "$TESTSH" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ]; then ok "8a. correction-cycle test exits 0"; else bad "8a. correction-cycle test exit = $rc"; fi
if printf '%s' "$TESTOUT" | rg -q '24/24 determinations correct'; then ok "8b. correction-cycle test: 24/24 correct"; else bad "8b. aggregate missing/incorrect"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p2-non-av-does-not-block.*PASS.*MATCH'; then ok "8c. P2 unresolved + non-acceptance-violating -> does NOT block (PASS)"; else bad "8c. P2 non-av case missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p3-non-av-does-not-block.*PASS.*MATCH'; then ok "8d. P3 unresolved + non-acceptance-violating -> does NOT block (PASS)"; else bad "8d. P3 non-av case missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p2-acceptance-violation-blocks.*FAIL.*MATCH'; then ok "9a. P2 unresolved + acceptance-violating -> closure FAIL"; else bad "9a. P2 av case missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p3-av-blocks.*FAIL.*MATCH'; then ok "9b. P3 unresolved + acceptance-violating -> closure FAIL"; else bad "9b. P3 av case missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p2-av-alleged-exception-rejected.*FAIL.*MATCH'; then ok "10a. acceptance-violating P2 + unresolved + alleged exception -> closure FAIL (rejected)"; else bad "10a. P2 exception-rejection case missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p3-av-alleged-exception-rejected.*FAIL.*MATCH'; then ok "10b. acceptance-violating P3 + unresolved + alleged exception -> closure FAIL (rejected)"; else bad "10b. P3 exception-rejection case missing"; fi
if printf '%s' "$TESTOUT" | rg -q 'severity-p1-deferred-with-exception.*PASS.*MATCH'; then ok "10c. P1 exception model unaltered (P1 DEFERRED + exception -> PASS)"; else bad "10c. P1 exception case changed"; fi
if printf '%s' "$TESTOUT" | rg -q 'example-d-p0-correction-submitted.*FAIL.*MATCH'; then ok "10d. P0 cases unaltered (P0 submitted -> FAIL)"; else bad "10d. P0 case changed"; fi
if printf '%s' "$TESTOUT" | rg -q 'example-d-p0-wont-fix-acknowledged.*FAIL.*MATCH'; then ok "10e. P0 WONT_FIX -> FAIL unchanged"; else bad "10e. P0 WONT_FIX case changed"; fi
pos "$TESTSH" 'exception flag never clears' "10f. test source: exception flag never clears an acceptance-violating P2/P3 (comment invariant)"

# ---------- 11. Phase 5 regression 8/8 ----------
P5OUT="$(bash "$P5SH" 2>&1)"; rc5=$?
if [ "$rc5" -eq 0 ]; then ok "11a. phase-closure-eligibility test exits 0"; else bad "11a. phase-closure-eligibility exit = $rc5"; fi
if printf '%s' "$P5OUT" | rg -q '8/8 determinations correct'; then ok "11b. Phase 5 regression: 8/8 correct"; else bad "11b. Phase 5 regression aggregate missing"; fi
if printf '%s' "$P5OUT" | rg -q 'case-3-p0-blocker.*computed=FAIL.*expected=FAIL.*MATCH'; then ok "11c. P0 present -> closure eligibility FAIL (case-3) — no Phase 5 regression"; else bad "11c. case-3 P0 line mismatch"; fi

# ---------- 12. No unrelated lifecycle semantics changed ----------
git show "$CORRBASE:$ISS" | sed -n '/^### 2\. Issue lifecycle/,/^### 3\./p' > /home/z/my-project/scripts/_p6c_lifecycle_base.md
sed -n '/^### 2\. Issue lifecycle/,/^### 3\./p' "$ISS" > /home/z/my-project/scripts/_p6c_lifecycle_cur.md
if diff -q /home/z/my-project/scripts/_p6c_lifecycle_base.md /home/z/my-project/scripts/_p6c_lifecycle_cur.md >/dev/null; then
  ok "12a. ISSUES §2 issue lifecycle byte-identical to the correction baseline"
else
  bad "12a. ISSUES §2 issue lifecycle changed"
fi
posre "$ISS" '^OPEN$' "12b. lifecycle vocabulary preserved (OPEN present)"
posre "$ISS" '^\| `REVIEW_PENDING` \| `RESOLVED` \| \*\*architect only\*\*' "12c. architect-only resolution transition preserved (transition table row)"

# ---------- 13/18. Correction recorded in the issue-control system; exact changed-path set ----------
posre "$ISS" '^### I-013 ' "18a. issue record I-013 present (canonical schema section)"
pos "$ISS" '| Issue ID | I-013 |' "18b. I-013 record field: Issue ID"
pos "$ISS" '| Severity | P1 (architect-assigned at triage, 2026-10-01' "18c. I-013 severity P1 (architect-assigned)"
pos "$ISS" '| Status | `REVIEW_PENDING`' "18d. I-013 status REVIEW_PENDING (submission registered)"
pos "$ISS" '| Architect review status | `pending`' "18e. I-013 architect review status pending (future review not pre-claimed)"
pos "$ISS" 'c0cca964064286c25dcf22c8f86038baaacd7ebe' "18f. I-013 record references the correction baseline/affected commit"
pos "$PC/ZAI_HANDOFF.md" 'CH-001' "18g. ZAI_HANDOFF Part II carries the CH-001 corrective-handoff instance"
posre "$PC/ZAI_HANDOFF.md" '^### (1|2|3|4|5|6|7|8|9|1[0-9]|2[0-2])\. ' "18h. CH-001 instance has the numbered template sections"
pos "$VST" 'Architect review of the Phase 6 implementation — outcome `CORRECTION_REQUIRED`; corrective handoff CH-001 issued' "18i. register review trail records the CORRECTION_REQUIRED outcome + CH-001"
pos "$VST" 'architect-verified — the review outcome and corrective handoff as communicated by ChatGPT' "18j. the review outcome classified architect-verified (as communicated)"
pos "$VST" '### Phase 6 correction validation (CH-001 — developer-executed 2026-10-01' "18k. register carries the Phase 6 correction validation table"
# legacy issue entries preserved (the pre-Phase-6 register between '## Open' and the canonical-records section):
git show "$CORRBASE:$ISS" | sed -n '/^## Open$/,/^## Issue records \(canonical schema/p' | head -n -1 > /home/z/my-project/scripts/_p6c_leg_base.md
sed -n '/^## Open$/,/^## Issue records \(canonical schema/p' "$ISS" | head -n -1 > /home/z/my-project/scripts/_p6c_leg_cur.md
if diff -q /home/z/my-project/scripts/_p6c_leg_base.md /home/z/my-project/scripts/_p6c_leg_cur.md >/dev/null; then
  ok "18l. legacy register (I-001…I-012, incl. I-001/I-007 open entries) byte-identical to the correction baseline"
else
  bad "18l. legacy register changed vs baseline"
fi

# ---------- 14. Scope: documentation-only; no product/DB/deployment/immutable-source; no secrets ----------
n=$(git diff --name-only "$CORRBASE" -- src packages supabase vercel.json docs/doable-source 2>/dev/null | wc -l)
chk "14a. no src/packages/supabase/vercel.json/Doable-source changes vs correction baseline" "$n"
n=$(git diff --name-only "$CORRBASE" -- vercel.json 2>/dev/null | wc -l); chk "14b. vercel.json unchanged" "$n"
git merge-base --is-ancestor "$EXT" HEAD; chk "14c. b65725e5 ancestry intact (not rewritten)" "$?"
extline=$(git log --format='%H %s' -1 "$EXT")
if [ "$extline" = "$EXT chore(vercel): enable AI core feature branch preview deployment" ]; then
  ok "14d. b65725e5 identity unchanged"
else
  bad "14d. b65725e5 identity check: '$extline'"
fi
negre 'worklog.md docs/project-control/' 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "14e. no secrets/tokens in the changed documents"

# ---------- 15. Evidence classified correctly ----------
pos "$VST" 'no repository commands are claimed on ChatGPT' "15a. no repository commands claimed on ChatGPT's behalf"
pos "$VST" 'delivered (developer-reported)' "15b. the correction itself classified developer-reported"
negre "$VST" 'correction is architect-verified|architect-approved correction|architect (has |)accepted the correction|ChatGPT (has |)accepted the correction' "15c. no architect verification/acceptance of the correction claimed in the register"
pos "$VST" 'not yet re-reviewed' "15d. the correction explicitly not yet re-reviewed"

# ---------- 16–17. Phase 6 IN_PROGRESS; architect re-review PENDING ----------
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE ZAI_HANDOFF; do
  pos "$PC/$f.md" 'Phase 6 — Correction and Issue-Control Workflow' "16. $f.md identifies Phase 6"
done
posre "$VST" '^## Phase 6 — Correction and Issue-Control Workflow — IN_PROGRESS' "16a. register Phase 6 section IN_PROGRESS"
posre "$PC/ZAI_HANDOFF.md" '^\| Current status \| `REVIEW_PENDING`' "16b. ZAI_HANDOFF Part II CH-001 status REVIEW_PENDING"
posre worklog.md '^## 2026-10-01 — Phase 6 — Correction and Issue-Control Workflow — `IN_PROGRESS`' "16c. worklog Phase 6 entry IN_PROGRESS (implementation entry unrewritten)"
pos "$PC/CURRENT_PHASE.md" 'the architect re-review is PENDING' "17a. CURRENT_PHASE: architect re-review PENDING"
pos "$VST" 'Pending: the architect re-review of the corrected Phase 6 implementation' "17b. register outstanding state: pending the architect re-review"
pos "$PC/NEXT_ACTION.md" 're-review of the correction is PENDING' "17c. NEXT_ACTION: re-review PENDING"

# ---------- 19. Worklog append-only ----------
n=$(git diff "$CORRBASE" -- worklog.md | grep -cE '^-[^-]' || true)
chk "19a. worklog change is pure append (0 deleted lines)" "$n"
pos worklog.md '> Correction (2026-10-01): the architect' "19b. worklog corrective-cycle note present (dated, appended)"
pos worklog.md 'this note is appended per §3.1' "19c. worklog note cites the §3.1 append-only convention"
n=$(git diff "$CORRBASE" -- "$PC/sessions/SESSION-008.md" | wc -l)
chk "19d. SESSION-008 (historical) untouched" "$n"

# ---------- 20. Final State Contract consistent ----------
pos "$PC/PROJECT_STATE.md" "$IMPL" "20a. latest verified commit remains fb4ad5f5 (PROJECT_STATE)"
pos "$PC/PROJECT_STATE.md" "$CORRBASE" "20b. the Phase 6 implementation commit c0cca964 recorded (PROJECT_STATE)"
pos "$VST" "$CORRBASE" "20c. the correction baseline c0cca964 recorded (register)"
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE ZAI_HANDOFF; do
  pos "$PC/$f.md" 'IN_PROGRESS' "20d. $f.md status IN_PROGRESS"
done
pos "$PC/PROJECT_STATE.md" 'I-013' "20e. PROJECT_STATE active-issues summary carries I-013 (REVIEW_PENDING)"

# ---------- 13. Changed-path set exactly the 10 declared correction paths ----------
if [ "$MODE" = "staged" ]; then
  changed=$(git status --porcelain | awk '{print $2}' | sort | tr '\n' ' ')
else
  changed=$(git show --name-only --format= HEAD | sort | tr '\n' ' ')
fi
if [ "$changed" = "$ALLOWED" ]; then
  ok "13. changed-path set exactly the 10 declared correction paths ($MODE)"
else
  bad "13. unexpected changed-path set: '$changed'"
fi

# ---------- Structural integrity ----------
git show "$CORRBASE:$PC/ZAI_HANDOFF.md" | head -n 183 > /home/z/my-project/scripts/_p6c_zh_base.md
head -n 183 "$PC/ZAI_HANDOFF.md" > /home/z/my-project/scripts/_p6c_zh_cur.md
if diff -q /home/z/my-project/scripts/_p6c_zh_base.md /home/z/my-project/scripts/_p6c_zh_cur.md >/dev/null; then
  ok "S1. ZAI_HANDOFF Part I byte-identical to the correction baseline (untouched)"
else
  bad "S1. ZAI_HANDOFF Part I differs from the correction baseline"
fi
n=$(git diff --name-only "$CORRBASE" -- "$PC/DECISIONS.md" "$PC/RISKS.md" "$PC/CHAT_CONTINUITY.md" "$PC/VERIFICATION_CHECKLIST.md" "$PC/templates" "$PC/PHASE-0-RECONNAISSANCE.md" "$PC/sessions/SESSION-00[1-8].md" 2>/dev/null | wc -l)
chk "S2. out-of-scope control documents untouched (DECISIONS/RISKS/CHAT_CONTINUITY/CHECKLIST/templates/PHASE-0/SESSION-001…008)" "$n"
n=$(git diff --name-only "$CORRBASE" -- "$P5SH" 2>/dev/null | wc -l)
chk "S3. Phase 5 deterministic test untouched" "$n"

if [ "$MODE" = "staged" ]; then
  h=$(git rev-parse HEAD)
  if [ "$h" = "$CORRBASE" ]; then ok "S4. pre-commit baseline: HEAD = c0cca964 (the Phase 6 implementation commit)"; else bad "S4. pre-commit HEAD = $h"; fi
else
  msg=$(git log --format='%s' -1 HEAD)
  if [ "$msg" = "$CORRMSG" ]; then ok "S4. HEAD commit message exact: '$CORRMSG'"; else bad "S4. HEAD message: '$msg'"; fi
  par=$(git rev-parse HEAD^)
  if [ "$par" = "$CORRBASE" ]; then ok "S5. correction commit is the immediate child of c0cca964"; else bad "S5. HEAD^ = $par"; fi
  # ---------- 21. Clean tree ----------
  n=$(git status --porcelain | wc -l); chk "21. working tree clean after commit" "$n"
  # ---------- 22. Local/remote synchronized ----------
  h=$(git rev-parse HEAD); o=$(git rev-parse "origin/$BRANCH")
  if [ "$h" = "$o" ]; then ok "22. local $BRANCH and origin synchronized ($h)"; else bad "22. local $h != origin $o"; fi
  git merge-base --is-ancestor "$CORRBASE" HEAD; chk "S6. fast-forward history (c0cca964 ancestor of HEAD; no force-push)" "$?"
fi

# ---------- Supplementary ----------
if npm run --silent validate:model-config >/dev/null 2>&1; then
  ok "SUP. npm run validate:model-config exits 0 (lightweight check only — NOT sufficient correction verification)"
else
  bad "SUP. npm run validate:model-config failed"
fi

echo "== RESULT: $PASS PASS / $FAIL FAIL ($MODE mode) =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
