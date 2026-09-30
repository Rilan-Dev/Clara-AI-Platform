#!/usr/bin/env bash
# Phase 1 control-document validation suite (read-only; run from anywhere)
# Validates docs/project-control/ in the Clara worktree against the Phase 1 handoff contract.
set -u
REPO=/home/z/my-project/.worktrees/vc
PC="$REPO/docs/project-control"
cd "$REPO" || exit 1

PASS=0; FAIL=0
ok(){ echo "PASS  $1"; PASS=$((PASS+1)); }
bad(){ echo "FAIL  $1"; FAIL=$((FAIL+1)); }

echo "== [1] Required files exist =="
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION DECISIONS ISSUES RISKS VERIFICATION_STATE; do
  if [ -f "$PC/$f.md" ]; then ok "$f.md exists"; else bad "$f.md MISSING"; fi
done

echo "== [2] Required fields/headings =="
chk(){ if rg -q "$2" "$PC/$1"; then ok "$1: $3"; else bad "$1: $3 NOT FOUND"; fi; }
chki(){ if rg -qi "$2" "$PC/$1"; then ok "$1: $3"; else bad "$1: $3 NOT FOUND"; fi; }
# PROJECT_STATE required fields
chk PROJECT_STATE.md '## Current phase' 'Current phase section'
chk PROJECT_STATE.md 'Phase status' 'phase status field'
chk PROJECT_STATE.md 'status vocabulary' 'status vocabulary section'
chk PROJECT_STATE.md 'Last architect verification' 'last architect verification'
chk PROJECT_STATE.md '## Completed phases' 'completed phases'
chk PROJECT_STATE.md '## Active blockers' 'active blockers'
chk PROJECT_STATE.md '## Active issues' 'active issues'
chk PROJECT_STATE.md '## Active risks' 'active risks'
chk PROJECT_STATE.md '## Current next action' 'current next action'
chk PROJECT_STATE.md '## Roles' 'roles (developer/architect)'
chki PROJECT_STATE.md 'authoritative source of truth' 'authoritative source of truth'
chk PROJECT_STATE.md '## Control document index' 'control document index'
# CURRENT_PHASE required fields
chk CURRENT_PHASE.md 'Phase number' 'phase number'
chk CURRENT_PHASE.md 'Phase name' 'phase name'
chk CURRENT_PHASE.md 'Phase 1 — Durable Project-Control Foundation' 'full designation'
chk CURRENT_PHASE.md '\| Status \|' 'status'
chk CURRENT_PHASE.md '## Objective' 'objective'
chk CURRENT_PHASE.md '## Scope \(approved\)' 'scope'
chk CURRENT_PHASE.md '## Non-scope' 'non-scope'
chk CURRENT_PHASE.md '## Prerequisites' 'prerequisites'
chk CURRENT_PHASE.md '## Required deliverables' 'required deliverables'
chk CURRENT_PHASE.md '## Acceptance criteria' 'acceptance criteria'
chk CURRENT_PHASE.md '## Verification requirements' 'verification requirements'
chk CURRENT_PHASE.md '## Security constraints' 'security constraints'
chk CURRENT_PHASE.md '## Git/branch constraints' 'git/branch constraints'
chk CURRENT_PHASE.md '## Stopping boundary' 'stopping boundary'
chk CURRENT_PHASE.md 'Developer assignment' 'developer assignment'
chk CURRENT_PHASE.md 'Only ChatGPT/project-owner review can close the phase' 'architect-close rule'
# NEXT_ACTION six questions
chk NEXT_ACTION.md '## 1\. Active phase' 'Q1 active phase'
chk NEXT_ACTION.md '## 2\. Project state' 'Q2 project state'
chk NEXT_ACTION.md '## 3\. What must happen next' 'Q3 next action'
chk NEXT_ACTION.md '## 4\. Z\.AI active handoff status' 'Q4 handoff status'
chk NEXT_ACTION.md '## 5\. What ChatGPT must verify' 'Q5 verification prerequisites'
chk NEXT_ACTION.md '## Read this first' 'Q-doc read order'
# DECISIONS required decisions
for d in D-001 D-002 D-003 D-004 D-005 D-006 D-007 D-008 D-009; do
  chk DECISIONS.md "$d" "decision $d"
done
# ISSUES sections
chk ISSUES.md '^## Open$' 'Open section'
chk ISSUES.md '^## Resolved$' 'Resolved section'
chk ISSUES.md '^## Deferred$' 'Deferred section'
chk ISSUES.md '^## Informational' 'Informational section'
chk ISSUES.md '\| Status \|' 'status field per issue'
# RISKS register
for r in R-1 R-2 R-3 R-4 R-5; do chk RISKS.md "^## $r " "risk $r"; done
chk RISKS.md 'not.*assigned|intentionally not assigned' 'no unsupported likelihood ratings note'
# VERIFICATION_STATE separation
chk VERIFICATION_STATE.md 'developer-reported' 'developer-reported class'
chk VERIFICATION_STATE.md 'architect-verified' 'architect-verified class'
chk VERIFICATION_STATE.md 'Phase 1 is NOT verified' 'explicit non-claim for Phase 1'
chk VERIFICATION_STATE.md 'PASS` \(closes a phase\)' 'review outcome vocabulary'

echo "== [3] No competing sources of truth =="
COMPETING=$(git ls-files | rg -i '(PROJECT_STATE|CURRENT_PHASE|NEXT_ACTION|ZAI_HANDOFF|VERIFICATION_STATE|CHAT_CONTINUITY|DECISIONS|ISSUES|RISKS|worklog)\.md$' | sort)
echo "$COMPETING" | sed 's/^/    /'
EXPECT3=$(printf '%s\n' "$COMPETING" | rg -v '^(docs/project-control/(PROJECT_STATE|CURRENT_PHASE|NEXT_ACTION|DECISIONS|ISSUES|RISKS|VERIFICATION_STATE)\.md|docs/doable-source/WORKLOG\.md)$' || true)
if [ -z "$EXPECT3" ]; then ok "only the 7 control docs + library-scoped WORKLOG.md"; else bad "unexpected competing docs: $EXPECT3"; fi

echo "== [4] Cross-references resolve (scope: the 7 Phase 1 documents only) =="
SEVEN="$PC/PROJECT_STATE.md $PC/CURRENT_PHASE.md $PC/NEXT_ACTION.md $PC/DECISIONS.md $PC/ISSUES.md $PC/RISKS.md $PC/VERIFICATION_STATE.md"
mapfile -t REFS < <(rg -o --no-filename '`[^`]+\.(md|yml|json|ts|mjs)`' $SEVEN | tr -d '`' | rg -v ' |\*|\{|\}|\|' | sort -u)
BROKEN=0
for r in "${REFS[@]}"; do
  [ -z "$r" ] && continue
  case "$r" in
    docs/project-control/ZAI_HANDOFF.md|ZAI_HANDOFF.md) echo "    declared-miss (planned Phase 2): $r" ;;
    docs/project-control/CHAT_CONTINUITY.md|CHAT_CONTINUITY.md) echo "    declared-miss (planned Phase 3): $r" ;;
    worklog.md) echo "    declared-miss (planned Phase 4): $r" ;;
    docs/AGENTS.md) echo "    declared-miss (I-001 deliberately missing): $r" ;;
    graphify-out/graph.json) echo "    declared-miss (I-007 deliberately missing): $r" ;;
    */*) if [ -f "$REPO/$r" ]; then echo "    OK  $r"; else echo "    BROKEN  $r"; BROKEN=1; fi ;;
    *)   if [ -f "$PC/$r" ]; then echo "    OK (control dir)  $r"
         elif [ -f "$REPO/$r" ]; then echo "    OK (repo root)  $r"
         else echo "    BROKEN  $r"; BROKEN=1; fi ;;
  esac
done
if [ "$BROKEN" = 0 ]; then ok "all asserted-existing cross-references resolve"; else bad "broken cross-references found"; fi

echo "== [5] Phase 0 evidence accuracy =="
for sha in adbc9e16 bcc1769d cdcf23ce 5ca8ec58; do
  if rg -q "$sha" "$PC/VERIFICATION_STATE.md"; then ok "SHA $sha present in VERIFICATION_STATE"; else bad "SHA $sha missing"; fi
done

echo "== [6] Evidence-class separation =="
LBL=$(rg -l 'developer-reported' "$PC"/*.md | xargs -n1 basename | tr '\n' ' ')
echo "    files using developer-reported label: $LBL"
for f in PROJECT_STATE CURRENT_PHASE VERIFICATION_STATE; do
  if rg -q 'developer-reported' "$PC/$f.md"; then ok "$f.md carries evidence-class labels"; else bad "$f.md lacks labels"; fi
done
if rg -q 'NOT YET REVIEWED' "$PC/PROJECT_STATE.md" && rg -q 'NOT YET REVIEWED' "$PC/VERIFICATION_STATE.md"; then
  ok "Phase 1 explicitly marked NOT YET REVIEWED"
else bad "Phase 1 non-claim missing"; fi
BADCLAIM=$(rg -n 'architect-verified' "$PC"/*.md | rg -i 'phase 1 (output|foundation|deliver|implementation) (is|was)? ?(verified|approved|passed)' || true)
if [ -z "$BADCLAIM" ]; then ok "no architect-verification claim on Phase 1 output"; else bad "false claim: $BADCLAIM"; fi

echo "== [7] Secret scan =="
SECRETS=$(rg -n 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "$PC" || true)
if [ -z "$SECRETS" ]; then ok "no credential material in docs/project-control/"; else echo "$SECRETS" | sed 's/^/    /'; bad "possible secret material found"; fi

echo "== [8] State-machine consistency =="
for f in PROJECT_STATE CURRENT_PHASE NEXT_ACTION VERIFICATION_STATE; do
  if rg -q 'Phase 1 — Durable Project-Control Foundation' "$PC/$f.md"; then ok "$f.md: phase designation agrees"; else bad "$f.md: phase designation MISSING/WRONG"; fi
  if rg -q 'IN_PROGRESS' "$PC/$f.md"; then ok "$f.md: status IN_PROGRESS agrees"; else bad "$f.md: status IN_PROGRESS MISSING"; fi
done
if rg -q '^\| 0 \|.*CLOSED' "$PC/PROJECT_STATE.md" && rg -q 'Phase 0.*CLOSED' "$PC/VERIFICATION_STATE.md"; then ok "Phase 0 recorded CLOSED (PROJECT_STATE completed-phases + VERIFICATION_STATE)"; else bad "Phase 0 closure state missing"; fi
if rg -q 'bcc1769d' "$PC/PROJECT_STATE.md"; then ok "baseline commit referenced in PROJECT_STATE"; else bad "baseline commit missing"; fi

echo
echo "== SUMMARY: $PASS passed, $FAIL failed =="
[ "$FAIL" = 0 ] && echo "OVERALL: PASS" || echo "OVERALL: FAIL"
exit $([ "$FAIL" = 0 ] && echo 0 || echo 1)
