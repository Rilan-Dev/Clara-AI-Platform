#!/usr/bin/env bash
# validate-phase3-control-docs.sh — Phase 3 validation suite (developer-executed, read-only)
# Validates the Cross-Chat ChatGPT Continuity system (CHAT_CONTINUITY.md + phase-state reconciliation)
# Covers the 18 required Phase 3 validation checks (plan/architect handoff "Required validation").
# Usage: bash /home/z/my-project/scripts/validate-phase3-control-docs.sh
set -u
REPO="/home/z/my-project/.worktrees/vc"
cd "$REPO" || exit 2
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS: $1"; }
bad(){ FAIL=$((FAIL+1)); echo "FAIL: $1"; }

CC="docs/project-control/CHAT_CONTINUITY.md"
ZH="docs/project-control/ZAI_HANDOFF.md"

echo "=== 1. CHAT_CONTINUITY.md exists ==="
[ -f "$CC" ] && ok "CHAT_CONTINUITY.md exists at docs/project-control/" || bad "CHAT_CONTINUITY.md missing"

echo "=== 2. Required sections exist (§1–§15) ==="
for s in '## 1. Purpose, authority, and applicability' \
         '## 2. Prime rule — repository truth over conversational memory' \
         '## 3. Fresh-session capability requirements' \
         '## 4. Fresh-session read order (deterministic)' \
         '## 5. Fresh-session recovery procedure (exact)' \
         '## 6. Fresh-session recovery report (required output)' \
         '## 7. Broken-chat recovery' \
         '## 8. State-inconsistency handling (BLOCKED rule)' \
         '## 9. Architect authority recovery' \
         '## 10. Z.AI authorization rules (recovery determination)' \
         '## 11. Copy/paste initialization prompt (reusable)' \
         '## 12. Recovery scenarios (deterministic handling)' \
         '## 13. Validation of the continuity system' \
         '## 14. Review boundary' \
         '## 15. References'; do
  rg -q -F "$s" "$CC" && ok "section: $s" || bad "section missing: $s"
done
# §3: all 17 capability determinations
for r in '| 1 | repository |' '| 2 | branch |' '| 3 | current commit |' '| 4 | current phase |' \
         '| 5 | phase status |' '| 6 | completed phases |' '| 7 | current objective |' \
         '| 8 | active Z.AI handoff |' '| 9 | latest architect-verified commit |' \
         '| 10 | open issues |' '| 11 | active risks |' '| 12 | pending decisions |' \
         '| 13 | current next action |' '| 14 | whether Z.AI is allowed to work |' \
         '| 15 | what ChatGPT must independently verify |' '| 16 | whether the project is blocked |' \
         '| 17 | what the next architect action is |'; do
  rg -q -F "$r" "$CC" && ok "capability determination: $r" || bad "capability determination missing: $r"
done
# §14 review boundary verbatim
rg -q -F 'Developer completion does NOT equal phase completion.' "$CC" && ok "review-boundary statement 1" || bad "review-boundary statement 1 missing"
rg -q -F 'Only ChatGPT/project-owner architect review can close the phase.' "$CC" && ok "review-boundary statement 2" || bad "review-boundary statement 2 missing"

echo "=== 3. Read order explicit (mandatory / conditional / historical) ==="
for s in '### 4.1 Mandatory reads (in this exact order)' \
         '### 4.2 Conditional reads (read when the condition holds)' \
         '### 4.3 Historical evidence (read as needed; never current state)'; do
  rg -q -F "$s" "$CC" && ok "read-order class: $s" || bad "read-order class missing: $s"
done
for i in '1. **Repository agent instructions:**' '2. `README.md`' '3. `docs/project-control/PROJECT_STATE.md`' \
         '4. `docs/project-control/CURRENT_PHASE.md`' '5. `docs/project-control/NEXT_ACTION.md`' \
         '6. `docs/project-control/ZAI_HANDOFF.md`' '7. `docs/project-control/VERIFICATION_STATE.md`' \
         '8. `docs/project-control/DECISIONS.md`' '9. `docs/project-control/ISSUES.md`' \
         '10. `docs/project-control/RISKS.md`'; do
  rg -q -F "$i" "$CC" && ok "mandatory read item: $i" || bad "mandatory read item missing: $i"
done
rg -q -F 'Relevant superpowers specification/plan' "$CC" && ok "conditional read: superpowers spec/plan" || bad "conditional superpowers read missing"
rg -q -F 'Doable-source governance documents when the active phase touches Doable-derived material' "$CC" && ok "conditional read: Doable-source governance" || bad "conditional Doable read missing"

echo "=== 4. Repository authority explicit ==="
rg -q -F 'Repository state is authoritative. Chat memory is supplementary only.' "$CC" && ok "authority statement present" || bad "authority statement missing"
rg -q -F 'Repository state wins. Always.' "$CC" && ok "repository-wins rule present" || bad "repository-wins rule missing"

echo "=== 5. Stale-memory rule exists ==="
rg -q -F 'ChatGPT must never treat previous conversational memory as authoritative when repository evidence disagrees with it.' "$CC" && ok "verbatim stale-memory rule present" || bad "verbatim stale-memory rule missing"
for ex in 'an old commit SHA' 'an old phase' 'an old Z.AI task' 'an old deployment state' \
          'an old database state' 'an old branch/PR state' 'an old issue status' 'an old architecture decision'; do
  rg -q -F "$ex" "$CC" && ok "stale-memory example: $ex" || bad "stale-memory example missing: $ex"
done

echo "=== 6. Recovery-report schema exists ==="
for f in '| 1 | Repository |' '| 2 | Branch |' '| 3 | HEAD |' '| 4 | Remote HEAD |' \
         '| 5 | Current phase |' '| 6 | Phase status |' '| 7 | Latest architect-verified commit |' \
         '| 8 | Last completed phase |' '| 9 | Active objective |' '| 10 | Active Z.AI handoff |' \
         '| 11 | Open issues |' '| 12 | Active risks |' '| 13 | Pending decisions |' '| 14 | Next action |' \
         '| 15 | Blockers |' '| 16 | State-contract consistency |' '| 17 | Required architect action |'; do
  rg -q -F "$f" "$CC" && ok "report field: $f" || bad "report field missing: $f"
done
for c in '**architect-verified**' '**developer-reported**' '**unresolved/stale**' '**inferred**'; do
  rg -q -F "$c" "$CC" && ok "evidence class: $c" || bad "evidence class missing: $c"
done
rg -q -F 'only after repository verification' "$CC" && ok "inferred-only-after-verification rule" || bad "inferred-only rule missing"
# §5 recovery procedure flow steps
for s in 'REFRESH GitHub state' 'COMPARE repository state against control documents' 'CHECK Final State Contract' \
         'CHECK active phase/handoff' 'CHECK latest verified commit' 'CHECK whether Z.AI is allowed to act' \
         'RECOVER leadership state' 'ONLY THEN perform architect work'; do
  rg -q -F "$s" "$CC" && ok "recovery step: $s" || bad "recovery step missing: $s"
done

echo "=== 7. Broken-chat procedure exists ==="
for c in 'a. Previous ChatGPT conversation disappears' 'b. Previous conversation becomes inaccessible' \
         'c. Previous ChatGPT session ended midway' 'd. Z.AI completed work but ChatGPT did not review it' \
         'e. Z.AI stopped midway' 'f. Repository contains an unclean working tree' \
         'g. Branch moved after the handoff' 'h. Control documents disagree' 'i. A developer handoff is stale'; do
  rg -q -F "**$c**" "$CC" && ok "broken-chat case: $c" || bad "broken-chat case missing: $c"
done
rg -q -F 'never assume completion from the existence of a commit alone' "$CC" && ok "never-assume-completion rule present" || bad "never-assume-completion rule missing"
rg -q -F 'the commit, the diff, the control state, the verification state, the active handoff, and the stopping boundary' "$CC" && ok "six-fold inspection rule present" || bad "six-fold inspection rule missing"

echo "=== 8. State inconsistency → BLOCKED ==="
rg -q -F 'the project status is **`BLOCKED`**' "$CC" && ok "BLOCKED outcome declared" || bad "BLOCKED outcome missing"
rg -q -F 'silently choose one document' "$CC" && ok "no-silent-selection rule" || bad "no-silent-selection rule missing"
rg -q -F 'Do **not** guess' "$CC" && ok "no-guessing rule" || bad "no-guessing rule missing"
rg -q -F 'continue implementation while the state contract is inconsistent' "$CC" && ok "no-continuation rule" || bad "no-continuation rule missing"
rg -q -F 'The **Final State Contract** members — `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II Phase identity), `VERIFICATION_STATE.md` — must agree' "$CC" && ok "all five Final State Contract members listed" || bad "contract members listing incomplete"
rg -q -F 'documented exception' "$CC" && ok "documented transition exception present" || bad "transition exception missing"

echo "=== 9. Architect/developer role separation ==="
for a in 'Architect / technical lead' 'Reviewer (commit/diff/evidence review; review outcomes)' \
         'Workflow controller (handoffs, phase advancement)' 'Issue and correction controller' \
         'Vercel operations authority (where applicable)' 'Supabase operations authority (where applicable)' \
         'Phase advancement authority'; do
  rg -q -F "$a" "$CC" && ok "architect authority: $a" || bad "architect authority missing: $a"
done
rg -q -F 'developer / implementer / self-verifier / evidence producer' "$CC" && ok "Z.AI role boundaries present" || bad "Z.AI role boundaries missing"
rg -q -F 'Z.AI must not become the authority merely because a new ChatGPT session has not yet reviewed the repository.' "$CC" && ok "no-authority-transfer rule present" || bad "no-authority-transfer rule missing"

echo "=== 10. Z.AI authorization rules exist ==="
for d in '**May work**' '**Must stop**' '**Needs a new handoff**' '**Needs a corrective handoff**' '**Awaiting architect review**'; do
  rg -q -F "$d" "$CC" && ok "authorization determination: $d" || bad "authorization determination missing: $d"
done
rg -q -F "Do not infer Z.AI's permission from Git history alone." "$CC" && ok "no-Git-history-inference rule present" || bad "no-Git-history-inference rule missing"

echo "=== 11. Copy/paste initialization prompt exists ==="
rg -q -F 'You are resuming the Clara AI Platform project as architect, technical lead, reviewer,' "$CC" && ok "init prompt present" || bad "init prompt missing"
rg -q -F 'Paste verbatim' "$CC" && ok "paste-verbatim instruction present" || bad "paste-verbatim instruction missing"
for p in 'from the repository, never from memory' 'Never treat previous conversational memory as authoritative' \
         'Developer completion does not equal phase completion' 'only PASS closes it' 'declare the' ; do
  rg -q -F "$p" "$CC" && ok "init prompt element: $p" || bad "init prompt element missing: $p"
done
rg -q -F 'depends on no prior conversation' "$CC" && ok "prompt conversation-independence declared" || bad "prompt independence not declared"

echo "=== 12. Recovery scenarios exist (A–H) ==="
for s in '**A — clean phase boundary**' '**B — Z.AI completed implementation, awaiting review**' \
         '**C — Z.AI stopped midway**' '**D — stale handoff**' '**E — state documents disagree**' \
         '**F — previous ChatGPT conversation unavailable**' \
         '**G — developer claims completion but verification missing**' \
         '**H — product implementation appears during a governance phase**'; do
  rg -q -F "$s" "$CC" && ok "scenario: $s" || bad "scenario missing: $s"
done

echo "=== 13. References resolve ==="
# Path-like backtick references only: whitespace-free, contain a slash, end in a known extension.
# Slash-less bare filenames are contextual prose references (sibling-document shorthand) and are
# out of scope for path resolution — same convention as the Phase 1/Phase 2 validations.
REFS=$(rg -o --no-filename '`[^[:space:]`]+\.(md|yml|json|ts|mjs|sql)`' docs/project-control/*.md docs/project-control/templates/*.md 2>/dev/null | tr -d '`' | rg '/' | sort -u || true)
# Declared non-existent / planned (documented in PROJECT_STATE.md index, I-001, I-007, Phase 4 plan)
PLANNED="worklog.md docs/project-control/worklog.md docs/project-control/sessions/SESSION-*.md docs/AGENTS.md graphify-out/graph.json src/lib/db/migrations/NNN_description.sql"
# Historical Phase 0 report §4 module-inventory shorthand (brace/glob forms; unchanged since Phase 1 validation)
HIST="providers/{openai,gemini,sarvam,tei}.ts src/lib/{plans,plan-guard,quota-admission,rate-limit}.ts"
MISS=0; UNRES=""
for r in $REFS; do
  case " $PLANNED $HIST " in *" $r "*) continue;; esac
  case "$r" in *YYYY-MM-DD*) continue;; esac
  case "$r" in /home/z/my-project/*) continue;; esac   # agent-workspace external paths (historical Phase 0 report: out-of-repo worklog); existence is environment-dependent, not a repository property
  case "$r" in
    *\**|*\{*)  if bash -c "ls $r" >/dev/null 2>&1 || bash -c "ls docs/doable-source/$r" >/dev/null 2>&1; then continue; fi ;;
  esac
  if [ -e "$r" ]; then continue; fi
  if [ -e "docs/doable-source/$r" ]; then continue; fi   # Phase 0 report: commands run from docs/doable-source/
  UNRES="$UNRES $r"; MISS=$((MISS+1))
done
[ "$MISS" -eq 0 ] && ok "all path-like references resolve (declared non-existent: root worklog.md, sessions/SESSION-*.md, docs/AGENTS.md, graphify-out/graph.json, migrations NNN pattern; agent-workspace external paths excluded — out-of-repo Phase 0 worklog reference; historical Phase 0 §4 shorthand unchanged since Phase 1; bare filenames excluded as contextual prose)" || bad "$MISS unresolved references:$UNRES"

echo "=== 14. No competing state source ==="
NCC=$( (git ls-files; git ls-files --others --exclude-standard) | rg -i 'CHAT_CONTINUITY' | wc -l )
[ "$NCC" -eq 1 ] && ok "exactly one CHAT_CONTINUITY.md in the working tree (docs/project-control/; tracked-or-to-be-committed)" || bad "CHAT_CONTINUITY count = $NCC"
DUP=$(git ls-files | rg -i 'handoff|project-control/templates' | rg -v '^docs/project-control/ZAI_HANDOFF.md$|^docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md$' || true)
[ -z "$DUP" ] && ok "still exactly one handoff protocol + one template; no duplicates" || bad "duplicate handoff sources: $DUP"
NW=$(git ls-files | rg -i '(^|/)worklog\.md$' | wc -l)
[ "$NW" -eq 1 ] && ok "no project worklog.md (only library-scoped docs/doable-source/WORKLOG.md)" || bad "unexpected worklog files ($NW)"
[ ! -e docs/project-control/sessions ] && ok "no sessions/ records" || bad "sessions/ exists prematurely"
rg -q -F 'Procedure, not state' "$CC" && ok "procedure-not-state declaration present" || bad "procedure-not-state declaration missing"

echo "=== 15. Secret scan ==="
SEC=$(rg -n 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' docs/project-control/ || true)
[ -z "$SEC" ] && ok "no credential material in docs/project-control/" || bad "secret-scan match: $SEC"

echo "=== 16. Final State Contract consistent ==="
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE; do
  rg -q -F 'Phase 3 — Cross-Chat ChatGPT Continuity' "docs/project-control/$f.md" && ok "$f.md names Phase 3" || bad "$f.md phase mismatch"
done
rg -q -F 'Phase 3 — Cross-Chat ChatGPT Continuity' "$ZH" && ok "ZAI_HANDOFF.md names Phase 3" || bad "ZAI_HANDOFF.md phase mismatch"
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE; do
  rg -q 'IN_PROGRESS' "docs/project-control/$f.md" && ok "$f.md status IN_PROGRESS present" || bad "$f.md IN_PROGRESS missing"
done
rg -q -F '**IN_PROGRESS** — developer implementation complete; awaiting architect review' "$ZH" && ok "ZAI_HANDOFF.md status IN_PROGRESS awaiting review" || bad "ZAI_HANDOFF.md status wrong"
rg -q -F 'Phase 2 — Z.AI Developer Handoff System — CLOSED' docs/project-control/VERIFICATION_STATE.md && ok "Phase 2 recorded CLOSED" || bad "Phase 2 closure missing"
rg -q -F 'Phase 3 — Cross-Chat ChatGPT Continuity — IN_PROGRESS (NOT VERIFIED)' docs/project-control/VERIFICATION_STATE.md && ok "Phase 3 marked NOT verified" || bad "Phase 3 NOT-verified banner missing"
rg -q -F 'Phase 3 output: NOT YET REVIEWED' docs/project-control/PROJECT_STATE.md && ok "PROJECT_STATE: Phase 3 not-yet-reviewed" || bad "PROJECT_STATE missing not-yet-reviewed"
rg -q -F 'The phase is NOT closed' docs/project-control/CURRENT_PHASE.md && ok "CURRENT_PHASE: phase not closed" || bad "CURRENT_PHASE missing not-closed"
rg -q -F 'Value (2026-10-01, at the Phase 3 implementation commit — reconciled)' docs/project-control/VERIFICATION_STATE.md && ok "consistency table reconciled to Phase 3" || bad "consistency table not reconciled"
rg -q -F '31ffd6f4330753f9b42dba231d7e02589d12eb77' docs/project-control/VERIFICATION_STATE.md && ok "latest verified commit 31ffd6f4 recorded" || bad "latest verified commit missing"
rg -q -F '58856e0be6325d0326a2d7c8cde6d6d6312b9000' docs/project-control/VERIFICATION_STATE.md && ok "Phase 2 closure commit 58856e0b recorded" || bad "closure commit missing"

echo "=== 17. Lightweight repository validation ==="
npm run validate:model-config >/tmp/p3val.log 2>&1 && ok "npm run validate:model-config PASS" || { bad "validate:model-config FAILED"; tail -5 /tmp/p3val.log; }

echo "=== 18. Diff within Phase 3 documentation scope ==="
CHANGED=$(git status --porcelain=v1 | awk '{print $2}')
UNEXPECT=$(echo "$CHANGED" | rg -v '^docs/project-control/' || true)
[ -z "$UNEXPECT" ] && ok "all changes under docs/project-control/ ($CHANGED)" || bad "out-of-scope changes: $UNEXPECT"

echo ""
echo "RESULT: $PASS PASS / $FAIL FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
