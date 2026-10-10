#!/usr/bin/env bash
# validate-phase5-closure-record.sh — read-only validation of the Phase 5 closure record
# (architect approval of the corrected Phase 5 implementation; closure handoff 2026-10-01).
#
# Covers the Phase 5 closure handoff's §1–§10 verification list:
#   §1     Baseline: HEAD = fb4ad5f5 (staged) / the closure commit's parent = fb4ad5f5 (HEAD);
#          fb4ad5f5's parent = f9ce6a83 (verified relationship f9ce6a83 -> fb4ad5f5);
#          correction message 'docs: correct phase 5 p0 closure policy'; no commits after
#          the correction (staged); clean tree + local/remote sync (HEAD mode).
#   §2     Deterministic test: 8/8 determinations correct, exit 0; P0 present -> FAIL;
#          npm run validate:model-config PASS; canonical P0 rule unambiguous (no wording
#          lets an architect decision close a phase while a P0 remains recorded);
#          P1 exception mechanism intact.
#   §3/§4  The closure is based on the explicit architect approval communicated in the
#          Phase 5 closure handoff (reviewed implementation fb4ad5f5; outcome PASS;
#          architect ChatGPT) — recorded as [architect-verified — as communicated ...];
#          Z.AI did not invent/infer/self-issue approval and did not itself approve.
#   §5     Evidence classification: implementation commit (f9ce6a83) vs correction commit
#          (fb4ad5f5 = the reviewed implementation) vs closure-record commit (this commit)
#          — three distinct kinds; the closure-record SHA never replaces the
#          reviewed-implementation SHA in identifying fields.
#   §6     Final State Contract: Phase 5 CLOSED / Phase 6 NOT STARTED (next authorized
#          phase) across PROJECT_STATE, CURRENT_PHASE, NEXT_ACTION, ZAI_HANDOFF,
#          VERIFICATION_STATE, worklog; latest verified commit = fb4ad5f5.
#   §7     Worklog: append-only Phase 5 closure entry (implementation -> correction ->
#          re-review -> PASS -> CLOSED -> Phase 6 NOT STARTED); history not rewritten.
#   §8     Session audit: SESSION-007 record (twelve determinations) + README index row;
#          no fabricated architect review date.
#   §9     Scope: changed paths exactly the 8 declared documentation paths; no product/
#          DB/deployment/immutable-source changes; b65725e5 preserved + ancestry intact;
#          vercel.json unchanged; no secrets.
#   §11    Commit message 'docs: record architect approval of phase 5' (HEAD mode).
#
# Modes: "staged" (pre-commit; HEAD must equal fb4ad5f5 and the closure changes are in
#                    the working tree)
#        "HEAD"   (post-commit/post-push; HEAD must be the immediate child of fb4ad5f5)
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

REVIEWED='fb4ad5f59b5661dc2bc7f38039805fc6294d58ef'    # the corrected Phase 5 implementation = the reviewed implementation
IMPL='f9ce6a833bc67205384e17bb92433c78967f4363'        # the Phase 5 implementation commit (first review CORRECTION_REQUIRED)
BASE='8d8595d0a994510da217af6d12225e3f1d00b2fd'        # the Phase 5 handoff baseline
EXT='b65725e55ed13503b70136ffde6a5a7f269d92e2'
BRANCH='feature/ai-core-from-doable-source'
CLOSMSG='docs: record architect approval of phase 5'
CORRMSG='docs: correct phase 5 p0 closure policy'
PC='docs/project-control'
VST="$PC/VERIFICATION_STATE.md"
CUR="$PC/CURRENT_PHASE.md"
PST="$PC/PROJECT_STATE.md"
NXT="$PC/NEXT_ACTION.md"
ZH="$PC/ZAI_HANDOFF.md"
CKL="$PC/VERIFICATION_CHECKLIST.md"
TESTSH="$PC/verification/phase-closure-eligibility-test.sh"
WL='worklog.md'
S7="$PC/sessions/SESSION-007.md"
SRD="$PC/sessions/README.md"

echo "== Mode: $MODE | repo: $REPO | reviewed (corrected) implementation: $REVIEWED =="

# ---------- 0. Mode / baseline ----------
if [ "$MODE" = 'staged' ]; then
  H=$(git rev-parse HEAD); [ "$H" = "$REVIEWED" ]; chk "0a. staged mode: HEAD = fb4ad5f5 (the reviewed implementation, unchanged)" $?
  N_AFTER=$(git rev-list --count "${REVIEWED}..HEAD"); [ "$N_AFTER" -eq 0 ]; chk "0b. staged mode: no commits after the correction commit" $?
  T=$(git status --porcelain | wc -l); [ "$T" -gt 0 ]; chk "0c. staged mode: closure changes present in the working tree" $?
  CHANGED="$(git diff --name-only "$REVIEWED"; git ls-files --others --exclude-standard | grep -v '^$' || true)"
else
  H=$(git rev-parse HEAD); P=$(git rev-parse HEAD^); [ "$P" = "$REVIEWED" ]; chk "0a. HEAD mode: the closure commit is the immediate child of fb4ad5f5" $?
  M=$(git log -1 --format=%s HEAD); [ "$M" = "$CLOSMSG" ]; chk "0b. HEAD mode: commit message = 'docs: record architect approval of phase 5'" $?
  T=$(git status --porcelain | wc -l); [ "$T" -eq 0 ]; chk "0c. HEAD mode: clean working tree" $?
  R=$(git rev-parse "origin/${BRANCH}"); [ "$R" = "$H" ]; chk "0d. HEAD mode: local = remote (origin/${BRANCH})" $?
  CHANGED="$(git diff --name-only "$REVIEWED" HEAD)"
fi
PP=$(git rev-parse "${REVIEWED}^"); [ "$PP" = "$IMPL" ]; chk "0e. verified relationship f9ce6a83 -> fb4ad5f5 (the reviewed implementation's parent)" $?
CM=$(git log -1 --format=%s "$REVIEWED"); [ "$CM" = "$CORRMSG" ]; chk "0f. the reviewed implementation carries the correction message 'docs: correct phase 5 p0 closure policy'" $?

# ---------- 9a. Changed-path set = exactly the 8 declared documentation paths ----------
EXPECTED='docs/project-control/CURRENT_PHASE.md
docs/project-control/NEXT_ACTION.md
docs/project-control/PROJECT_STATE.md
docs/project-control/VERIFICATION_STATE.md
docs/project-control/ZAI_HANDOFF.md
docs/project-control/sessions/README.md
docs/project-control/sessions/SESSION-007.md
worklog.md'
SORTED=$(printf '%s\n' "$CHANGED" | sort -u)
[ "$SORTED" = "$EXPECTED" ]; chk "9a. changed paths = exactly the 8 declared closure-record paths (worklog.md + docs/project-control/**)" $?
echo "$CHANGED" | grep -Eq '(^|/)(src|packages|supabase|migrations)/|(^|/)vercel\.json$' && bad "9b. FORBIDDEN path in the closure diff" || ok "9b. no src/packages/supabase/migrations/vercel.json changes"
git diff --name-only "$EXT" HEAD -- vercel.json | wc -l | grep -qx 0; chk "9c. vercel.json unchanged since b65725e5" $?
git merge-base --is-ancestor "$EXT" HEAD; chk "9d. b65725e5 ancestry intact" $?

# ---------- 1/2. Deterministic test + model-config + P0/P1 policy ----------
TESTOUT=$(bash "$TESTSH" 2>&1); TESTEXIT=$?
echo "$TESTOUT" | grep -q '8/8 determinations correct'; chk "2a. deterministic test: 8/8 determinations correct" $?
[ "$TESTEXIT" -eq 0 ]; chk "2b. deterministic test: exit 0" $?
echo "$TESTOUT" | grep -q 'case-3-p0-blocker.*FAIL.*FAIL.*MATCH'; chk "2c. deterministic test: P0 present -> closure eligibility FAIL" $?
MDC=$(npm run validate:model-config 2>&1); echo "$MDC" | grep -q 'model configuration validation passed'; chk "2d. npm run validate:model-config -> PASS" $?
pos "$VST" 'P0 prevents phase closure — always. There is no P0 exception path.' "2e. contract canonical P0 rule: prevents closure — always; no P0 exception path"
pos "$VST" 'must **not** authorize phase closure while the P0 remains recorded' "2f. contract: an architect decision must not authorize closure while a P0 remains recorded"
pos "$VST" 'the P1 exception is the only exception mechanism this contract defines, because P0 has none' "2g. contract: P1 exception is the only exception mechanism (P0 has none)"
pos "$VST" 'unless the project-control policy explicitly records and approves a valid exception' "2h. contract: P1 exception mechanism intact"
for f in "$VST" "$CKL" "$CUR"; do neg "$f" 'proceed despite' "2i. [$f] no 'proceed despite' exception wording"; done
for f in "$VST" "$CKL" "$CUR"; do neg "$f" 'P0/P1 exception' "2j. [$f] no 'P0/P1 exception' wording"; done

# ---------- 3. Architect approval recorded as communicated (never invented) ----------
pos "$VST" 'as communicated in the Phase 5 closure handoff' "3a. VERIFICATION_STATE: approval classified [architect-verified — as communicated in the Phase 5 closure handoff]"
pos "$PST" 'Phase 5 closure handoff (ChatGPT, 2026-10-01): re-review of the corrected Phase 5 implementation' "3b. PROJECT_STATE: the PASS re-review attributed to the Phase 5 closure handoff"
pos "$S7" 'The closure is based on the explicit ChatGPT architect approval communicated in the Phase 5 closure handoff' "3c. SESSION-007: closure based on the explicit approval in the closure handoff (work order itself not treated as approval)"
pos "$S7" 'Z.AI did not invent, infer, or self-issue any approval' "3d. SESSION-007: Z.AI did not invent/infer/self-issue approval"
pos "$S7" 'Z.AI did not itself approve the phase' "3e. SESSION-007: Z.AI did not itself approve the phase"
pos "$S7" 'The architect'"'"'s re-review outcome is dated 2026-10-01 as communicated in the closure handoff; the handoff supplies no separate review timestamp, and none is fabricated' "3f. SESSION-007: no fabricated architect review date"

# ---------- 4/5. Evidence classification: three distinct commit kinds ----------
posre "$PST" '^\| Latest architect-verified product/control implementation \| `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`' "5a. PROJECT_STATE: latest architect-verified implementation = fb4ad5f5 (the corrected Phase 5 implementation)"
negre "$PST" '^\| Latest architect-verified product/control implementation \| `5febaacd' "5b. PROJECT_STATE: the latest-verified row no longer names 5febaacd"
pos "$PST" 'This is the corrected Phase 5 implementation reviewed by ChatGPT — architect-verified by the `PASS` re-review (2026-10-01)' "5c. PROJECT_STATE: the correction commit identified as the reviewed implementation"
pos "$PST" 'a closure-record commit, **not a new product/control implementation, and not the reviewed implementation itself**' "5d. PROJECT_STATE: the closure-record commit is not the reviewed implementation"
pos "$VST" 'This is the corrected Phase 5 implementation reviewed by ChatGPT — architect-verified by the `PASS` re-review (2026-10-01)**' "5e. VERIFICATION_STATE: the corrective commit identified as the reviewed implementation"
pos "$VST" 'A closure-record commit — **not a new product/control implementation, and not the reviewed implementation itself**' "5f. VERIFICATION_STATE: the closure record is not the reviewed implementation"
pos "$CUR" 'the reviewed implementation is `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`, and it is not replaced by the closure-record SHA in any field identifying the reviewed implementation' "5g. CURRENT_PHASE: the reviewed-implementation SHA is not replaced by the closure-record SHA"
pos "$ZH" 'its SHA is not replaced by the closure-record SHA in any field identifying the reviewed implementation' "5h. ZAI_HANDOFF: the reviewed-implementation SHA is not replaced by the closure-record SHA"
pos "$WL" 'documentation-only — a closure-record commit, not the reviewed implementation and not a new product/control implementation' "5i. worklog: the closure commit classified as closure record (not the reviewed implementation)"
pos "$VST" 'the implementation was corrected — not replaced — by the corrective commit below' "5j. VERIFICATION_STATE: f9ce6a83 corrected, not replaced, by fb4ad5f5"

# ---------- 6. Final State Contract: Phase 5 CLOSED / Phase 6 NOT STARTED ----------
pos "$VST" '## Phase 5 — Verification and Phase-Gate System — CLOSED' "6a. VERIFICATION_STATE: Phase 5 heading CLOSED"
pos "$VST" 'Value (2026-10-01, at the Phase 5 closure-record commit — inter-phase boundary)' "6b. VERIFICATION_STATE: consistency table dated at the closure-record commit (inter-phase boundary)"
pos "$VST" '**None.** The phase was closed by architect review — the re-review of the corrected Phase 5 implementation returned `PASS`' "6c. VERIFICATION_STATE: outstanding architect verification state for Phase 5 = None"
posre "$PST" '^\| Current phase \| \*\*Phase 5 — Verification and Phase-Gate System — `CLOSED`\*\*' "6d. PROJECT_STATE: current phase = Phase 5 CLOSED"
posre "$PST" '^\| Phase status \| \*\*CLOSED\*\*' "6e. PROJECT_STATE: phase status CLOSED"
pos "$CUR" '> **Closure state (2026-10-01):** Phase 5 is **`CLOSED`**' "6f. CURRENT_PHASE: closure-state banner"
posre "$CUR" '^\| Status \| \*\*CLOSED\*\* — architect re-review `PASS` \(2026-10-01\)' "6g. CURRENT_PHASE: status row CLOSED"
pos "$CUR" '## Closure record (2026-10-01)' "6h. CURRENT_PHASE: Closure record section present"
pos "$NXT" '**None.** Phase 5 — Verification and Phase-Gate System is **`CLOSED`**' "6i. NEXT_ACTION: active phase = none; Phase 5 CLOSED"
posre "$ZH" '^\| Current status \| \*\*CLOSED\*\* — architect re-review `PASS` \(2026-10-01\)' "6j. ZAI_HANDOFF Part II: current status CLOSED"
pos "$ZH" '### Closure record (2026-10-01)' "6k. ZAI_HANDOFF: Closure record section present"
posre "$ZH" '^\| Phase number \| \*\*5\*\*' "6l. ZAI_HANDOFF Part II is still the Phase 5 instance (no Phase 6 instance created)"
pos "$WL" '## 2026-10-01 — Phase 5 — Verification and Phase-Gate System — architect approval — `CLOSED`' "6m. worklog: append-only Phase 5 closure entry present"
for f in "$VST" "$PST" "$CUR" "$NXT" "$ZH" "$WL" "$S7"; do pos "$f" 'Phase 6' "6n. [$f] Phase 6 identified as next"; done
for f in "$VST" "$PST" "$NXT" "$WL" "$S7"; do pos "$f" 'NOT STARTED' "6o. [$f] Phase 6 NOT STARTED"; done
for f in "$CUR" "$ZH"; do pos "$f" 'NOT started' "6o. [$f] Phase 6 NOT started (banner phrasing)"; done
pos "$PST" '**Phase 6 is the next phase and the next authorized phase; it has NOT started**' "6p. PROJECT_STATE: Phase 6 = next authorized phase, NOT STARTED"
pos "$NXT" 'Only ChatGPT may authorize Phase 6' "6q. NEXT_ACTION: only ChatGPT may authorize Phase 6"
pos "$PST" 'the ChatGPT architect'"'"'s review of the Phase 5 closure record and the explicit Phase 6 handoff' "6r. PROJECT_STATE next action: await closure-record review + the Phase 6 handoff"
pos "$VST" 'Phase 5 → `CLOSED`; Phase 6 → `NOT STARTED`' "6s. VERIFICATION_STATE review trail: Phase 5 CLOSED; Phase 6 NOT STARTED transition row"

# ---------- 7. Worklog append-only + the closure chain ----------
git show "$REVIEWED:worklog.md" > /tmp/wl_base.md
D=$(diff /tmp/wl_base.md "$WL" | grep -c '^<'); [ "$D" -eq 0 ]; chk "7a. worklog strict-append: 0 deleted/modified lines vs fb4ad5f5" $?
A=$(diff /tmp/wl_base.md "$WL" | grep -c '^>'); [ "$A" -gt 0 ]; chk "7b. worklog strict-append: closure entry appended (+${A} lines)" $?
pos "$WL" '## 2026-10-01 — Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`' "7c. worklog: the historical Phase 5 IN_PROGRESS entry preserved unrewritten"
pos "$WL" 'implementation → correction → architect re-review → `PASS` → `CLOSED`' "7d. worklog: the closure chain implementation -> correction -> re-review -> PASS -> CLOSED"
pos "$WL" 'Phase 6 is the next phase (per the plan) and the next authorized phase; it has NOT started' "7e. worklog: Phase 6 NOT STARTED in the closure entry"

# ---------- 8. Session audit ----------
[ -f "$S7" ]; chk "8a. SESSION-007.md exists" $?
N7=$(rg -c '^\| [0-9]+ \|' "$S7" 2>/dev/null || echo 0); [ "$N7" -eq 12 ]; chk "8b. SESSION-007: twelve determinations" $?
pos "$SRD" 'SESSION-007.md' "8c. sessions/README.md: SESSION-007 index row present"
pos "$SRD" 'docs: record architect approval of phase 5` (immediate child of `fb4ad5f5`)' "8d. sessions/README.md: the closure commit identified in the index"

# ---------- 9d. Secrets + scope wording ----------
rg -q 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' worklog.md docs/project-control/ && bad "9e. secret-pattern match in changed documents" || ok "9e. no secrets/tokens in changed documents"
pos "$PST" '20 commits ahead / 0 behind (21 ahead / 0 behind including this closure-record commit)' "9f. PROJECT_STATE: Vite-Converted delta re-dated at fb4ad5f5 (20/0; 21/0 incl. the closure commit)"
VC=$(git rev-list --count "origin/Vite-Converted..HEAD"); if [ "$MODE" = 'staged' ]; then [ "$VC" -eq 20 ]; chk "9g. branch = 20 ahead of Vite-Converted at fb4ad5f5" $?; else [ "$VC" -eq 21 ]; chk "9g. branch = 21 ahead of Vite-Converted at the closure commit" $?; fi
git show "$REVIEWED:docs/project-control/ZAI_HANDOFF.md" | head -n 183 > /tmp/pi_base.md; head -n 183 "$ZH" > /tmp/pi_cur.md
cmp -s /tmp/pi_base.md /tmp/pi_cur.md; chk "9h. ZAI_HANDOFF Part I byte-identical to fb4ad5f5 (183 lines)" $?
S6N=$(rg -c '^\| [0-9]+ \|' "$PC/sessions/SESSION-006.md" 2>/dev/null || echo 0); [ "$S6N" -eq 12 ]; chk "9i. SESSION-006 untouched: twelve determinations intact" $?

# ---------- Appendix re-runnable block ----------
pos "$VST" 'validate-phase5-closure-record.sh' "10a. VERIFICATION_STATE appendix: closure-record validation block references this script"

echo
echo "== RESULT: ${PASS} PASS / ${FAIL} FAIL (mode: ${MODE}) =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
