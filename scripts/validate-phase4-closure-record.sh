#!/usr/bin/env bash
# validate-phase4-closure-record.sh — Phase 4 closure-record validation (developer-executed, read-only)
# Validates the Phase 4 closure record ("docs: record architect approval of phase 4") against the
# verification list of the Phase 4 closure handoff (ChatGPT, 2026-10-01, §9):
#   exact reviewed implementation SHA referenced; Phase 4 CLOSED; Phase 5 next but NOT started;
#   Final State Contract members agree; no product/DB/deployment/Doable-source changes;
#   applicable project-control validation; complete diff inspected (scope-checked);
#   clean tree; local HEAD = remote HEAD (post-commit mode).
# Usage:
#   PRE-COMMIT : stage all changes first (git add worklog.md docs/project-control)
#                then: bash /home/z/my-project/scripts/validate-phase4-closure-record.sh
#   POST-COMMIT: working tree clean (right after commit / push); the script auto-detects
#                HEAD-commit mode and additionally verifies message, parent, and sync.
set -u
REPO="/home/z/my-project/.worktrees/vc"
cd "$REPO" || exit 2
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS: $1"; }
bad(){ FAIL=$((FAIL+1)); echo "FAIL: $1"; }

WL="worklog.md"
PS="docs/project-control/PROJECT_STATE.md"
CP="docs/project-control/CURRENT_PHASE.md"
NA="docs/project-control/NEXT_ACTION.md"
ZH="docs/project-control/ZAI_HANDOFF.md"
VS="docs/project-control/VERIFICATION_STATE.md"
IS="docs/project-control/ISSUES.md"
SR="docs/project-control/sessions/README.md"
S5="docs/project-control/sessions/SESSION-005.md"
IMPL="5febaacd5dcc55268904d1371038bbe8ff372040"
BASE="d12b0582f370c0192a97bad0ad1b1dc81b7f0713"

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

# Pre-closure reference: HEAD in staged mode; HEAD^ (the reviewed implementation) in HEAD-commit mode
if [ "$MODE" = "HEAD commit (post-commit)" ]; then REF="HEAD^"; else REF="HEAD"; fi

echo "=== 1. Closure record references the exact reviewed implementation SHA ==="
rg -q -F "$IMPL" "$VS" && ok "VERIFICATION_STATE references the reviewed implementation SHA $IMPL" || bad "VERIFICATION_STATE does not reference $IMPL"
rg -q -F "$IMPL" "$PS" && ok "PROJECT_STATE references the reviewed implementation SHA" || bad "PROJECT_STATE does not reference $IMPL"
rg -q -F "$IMPL" "$CP" && ok "CURRENT_PHASE references the reviewed implementation SHA" || bad "CURRENT_PHASE does not reference $IMPL"
rg -q -F "$IMPL" "$NA" && ok "NEXT_ACTION references the reviewed implementation SHA" || bad "NEXT_ACTION does not reference $IMPL"
rg -q -F "$IMPL" "$ZH" && ok "ZAI_HANDOFF Part II references the reviewed implementation SHA" || bad "ZAI_HANDOFF does not reference $IMPL"
rg -q -F "$IMPL" "$WL" && ok "worklog closure entry references the reviewed implementation SHA" || bad "worklog does not reference $IMPL"
rg -q -F "$IMPL" "$S5" && ok "SESSION-005 references the reviewed implementation SHA" || bad "SESSION-005 does not reference $IMPL"
git rev-parse "$IMPL^" 2>/dev/null | rg -q -F "$BASE" && ok "verified relationship: parent of $IMPL is $BASE (d12b0582 -> 5febaacd)" || bad "parent of $IMPL is not $BASE"

echo "=== 2. Phase 4 is CLOSED ==="
rg -q -F "## Phase 4 — Worklog and Session Audit — CLOSED" "$VS" && ok "VERIFICATION_STATE Phase 4 section heading: CLOSED" || bad "VERIFICATION_STATE Phase 4 heading not CLOSED"
rg -q -F "Phase 4 → \`CLOSED\`" "$VS" && ok "VERIFICATION_STATE review trail records Phase 4 -> CLOSED" || bad "VERIFICATION_STATE review trail lacks Phase 4 -> CLOSED"
rg -q -F 'Phase 4 — Worklog and Session Audit — `CLOSED`' "$PS" && ok "PROJECT_STATE current phase: CLOSED" || bad "PROJECT_STATE current phase not CLOSED"
rg -q -F '— Phase 4 review: `PASS` → Phase 4 `CLOSED`.**' "$PS" && ok "PROJECT_STATE records the architect PASS review (Last architect verification)" || bad "PROJECT_STATE lacks the PASS review record"
rg -q -F "| Status | **CLOSED** — architect review \`PASS\` (2026-10-01)" "$CP" && ok "CURRENT_PHASE Phase identity status: CLOSED" || bad "CURRENT_PHASE status not CLOSED"
rg -q -F "Phase 4 — Worklog and Session Audit is **\`CLOSED\`**" "$NA" && ok "NEXT_ACTION active-phase section: CLOSED" || bad "NEXT_ACTION does not state Phase 4 CLOSED"
rg -q -F "| Current status | **CLOSED** — architect review \`PASS\` (2026-10-01)" "$ZH" && ok "ZAI_HANDOFF Part II Phase identity: CLOSED" || bad "ZAI_HANDOFF Part II status not CLOSED"
rg -q -F "## 2026-10-01 — Phase 4 — Worklog and Session Audit — architect approval — \`CLOSED\`" "$WL" && ok "worklog latest Phase 4 entry: architect approval, CLOSED" || bad "worklog closure entry heading missing"
rg -q -F '| 4 | Worklog and Session Audit | `CLOSED` |' "$PS" && ok "PROJECT_STATE completed-phases table row 4: CLOSED" || bad "PROJECT_STATE completed-phases lacks a CLOSED Phase 4 row"

echo "=== 3. Phase 5 is identified as next but NOT started ==="
for f in "$VS" "$PS" "$CP" "$NA" "$ZH" "$WL" "$S5"; do
  rg -q -F "Phase 5 — Verification and Phase-Gate System" "$f" && ok "Phase 5 (Verification and Phase-Gate System) named in $f" || bad "Phase 5 not named in $f"
done
rg -q -F "Phase 5 has NOT started" "$VS" && ok "VERIFICATION_STATE: Phase 5 has NOT started" || bad "VERIFICATION_STATE lacks 'Phase 5 has NOT started'"
rg -q -F "it has NOT started" "$PS" && ok "PROJECT_STATE: Phase 5 has NOT started" || bad "PROJECT_STATE lacks Phase 5 not-started"
rg -q -F "has NOT started" "$CP" && ok "CURRENT_PHASE: Phase 5 has NOT started" || bad "CURRENT_PHASE lacks Phase 5 not-started"
rg -q -F "has NOT started" "$NA" && ok "NEXT_ACTION: Phase 5 has NOT started" || bad "NEXT_ACTION lacks Phase 5 not-started"
rg -q -F "has NOT started" "$ZH" && ok "ZAI_HANDOFF: Phase 5 has NOT started" || bad "ZAI_HANDOFF lacks Phase 5 not-started"
rg -q -F "no product implementation has been performed" "$VS" && ok "VERIFICATION_STATE: no product implementation performed" || bad "VERIFICATION_STATE lacks no-product-implementation statement"
rg -q -F 'no product implementation performed' "$NA" && ok "NEXT_ACTION: no product implementation performed" || bad "NEXT_ACTION lacks no-product-implementation statement"
rg -q -F "no Phase 5 implementation has been performed" "$VS" && ok "VERIFICATION_STATE: no Phase 5 implementation performed" || bad "VERIFICATION_STATE lacks no-Phase-5-implementation statement"

echo "=== 4. Final State Contract members agree (Phase 4 CLOSED) ==="
rg -q -F 'Phase 4 `CLOSED` (this register); Phase 5 next, not started' "$VS" && ok "consistency table: VERIFICATION_STATE.phase = Phase 4 CLOSED" || bad "consistency table VERIFICATION_STATE row wrong"
rg -q -F "Phase 4 — Worklog and Session Audit, \`CLOSED\`; Phase 5 next, not started" "$VS" && ok "consistency table: PROJECT_STATE.current_phase agrees" || bad "consistency table PROJECT_STATE row wrong"
rg -q -F "awaiting the architect-issued Phase 5 handoff" "$VS" && ok "consistency table: NEXT_ACTION agrees" || bad "consistency table NEXT_ACTION row wrong"
rg -q -F "latest verified commit | \`$IMPL\`" "$VS" && ok "consistency table: latest verified commit = $IMPL" || bad "consistency table latest-verified-commit row wrong"
rg -q -F 'latest verified commit = `5febaacd`' "$NA" && ok "NEXT_ACTION verification item: latest verified commit = 5febaacd" || bad "NEXT_ACTION latest-verified-commit item wrong"

echo "=== 5. b65725e5 classification preserved exactly ==="
rg -q -F "not independently established" "$PS" && ok "PROJECT_STATE: provenance not independently established" || bad "PROJECT_STATE lost the not-established classification"
rg -q -F "not independently established" "$VS" && ok "VERIFICATION_STATE: provenance not independently established" || bad "VERIFICATION_STATE lost the classification"
rg -q -F "Provenance [explicitly NOT established]" "$WL" && ok "worklog b65725e5 event entry: provenance explicitly NOT established (historical entry intact)" || bad "worklog b65725e5 provenance section missing"
rg -q -F "confirmed owner authorship" "$VS" && ok "anti-owner-authorship phrasing present in VERIFICATION_STATE" || bad "anti-owner-authorship phrasing missing"
if rg -n "confirmed owner authorship of b65725e5|b65725e5 .* authored by the (project )?owner|owner-authored b65725e5" "$WL" "$PS" "$CP" "$NA" "$ZH" "$VS" "$IS" "$SR" "$S5" 2>/dev/null | rg -v "not .*(independently established|confirmed owner authorship)|never.*confirmed owner authorship|must not be described as confirmed" >/dev/null 2>&1; then
  bad "an affirmative owner-authorship claim for b65725e5 appears in the changed artifacts"
else
  ok "no affirmative owner-authorship claim for b65725e5 in the changed artifacts"
fi
git merge-base --is-ancestor b65725e55ed13503b70136ffde6a5a7f269d92e2 HEAD && ok "b65725e5 ancestry intact (not modified/rewritten)" || bad "b65725e5 ancestry broken"
[ -z "$(git diff --name-only "$REF" -- vercel.json)" ] && ok "vercel.json unchanged vs the pre-closure $REF" || bad "vercel.json changed"

echo "=== 6. Historical Phase 4 worklog entry not rewritten (append-only) ==="
OLD_N=$(git show "$REF":"$WL" 2>/dev/null | wc -l | tr -d ' ')
NEW_N=$(wc -l < "$WL" | tr -d ' ')
if [ "${NEW_N:-0}" -gt "${OLD_N:-0}" ]; then
  if diff -q <(git show "$REF":"$WL") <(head -n "$OLD_N" "$WL") >/dev/null 2>&1; then
    ok "worklog.md is a strict append vs $REF: the first $OLD_N lines are byte-identical ($NEW_N lines total)"
  else
    bad "worklog.md modified lines above the appended closure entry (historical entry rewritten?)"
  fi
else
  bad "worklog.md did not grow vs $REF (append-only closure entry missing)"
fi
rg -q -F "## 2026-10-01 — Phase 4 — Worklog and Session Audit — \`IN_PROGRESS\`" "$WL" && ok "historical Phase 4 IN_PROGRESS entry preserved" || bad "historical Phase 4 IN_PROGRESS entry missing"
rg -q -F "Append-only subsequent event" "$WL" && ok "closure entry declares itself an append-only subsequent event" || bad "closure entry lacks the append-only declaration"
rg -q -F "Correction (2026-10-01, recorded by the Phase 4 closure record)" "$VS" && ok "the 188/190 validation-aggregate erratum recorded as an explicit dated correction" || bad "dated correction note missing in VERIFICATION_STATE"

echo "=== 7. ZAI_HANDOFF Part I untouched ==="
PART1_REF=$(git show "$REF":"$ZH" | awk '/^## Part II — Active Handoff Instance$/{exit} 1')
PART1_WORK=$(awk '/^## Part II — Active Handoff Instance$/{exit} 1' "$ZH")
if [ "$PART1_REF" = "$PART1_WORK" ]; then
  ok "ZAI_HANDOFF.md Part I is byte-identical to $REF (only Part II was reconciled)"
else
  bad "ZAI_HANDOFF.md Part I differs from $REF"
fi

echo "=== 8. Session audit layer conventions ==="
[ -f "$S5" ] && ok "SESSION-005.md exists (one record per developer work session, D-019)" || bad "SESSION-005.md missing"
for d in "Session identity" "| 2 | Date/time" "| 3 | Role" "| 4 | Phase" "Starting repository state" "Work performed" "Evidence produced" "Decisions/actions" "Resulting commits" "| 10 | Validation" "Stopping boundary" "Next responsible role"; do
  rg -q -F "$d" "$S5" && ok "SESSION-005 determination present: $d" || bad "SESSION-005 determination missing: $d"
done
rg -q -F "SESSION-005.md" "$SR" && ok "sessions/README.md record index includes SESSION-005" || bad "sessions/README.md index lacks SESSION-005 row"
rg -q -F '[developer-reported]' "$S5" && ok "SESSION-005 carries evidence-class labels" || bad "SESSION-005 lacks evidence-class labels"
rg -q -F '[architect-verified' "$S5" && ok "SESSION-005 carries architect-verified labels" || bad "SESSION-005 lacks architect-verified labels"
rg -q -F "not fabricated" "$S5" && ok "SESSION-005 states the no-fabricated-timestamps rule" || bad "SESSION-005 lacks the no-fabrication statement"

echo "=== 9. I-003 resolution confirmed with dated evidence ==="
rg -q -F "confirmed by the architect review of Phase 4 — outcome \`PASS\` (2026-10-01)" "$IS" && ok "ISSUES.md I-003 Closed-by row carries the dated PASS confirmation" || bad "ISSUES.md I-003 confirmation missing"
rg -q -F "$IMPL" "$IS" && ok "ISSUES.md I-003 resolution evidence references the implementation SHA" || bad "ISSUES.md I-003 lacks the implementation SHA"

echo "=== 10. Documentation-only scope (no product/DB/deployment/Doable-source changes) ==="
BADPATHS=$(echo "$CHANGED" | rg -v '^(worklog\.md|docs/project-control/.*)$' 2>/dev/null || true)
[ -z "$BADPATHS" ] && ok "all changed paths are within worklog.md + docs/project-control/** (documentation-only)" || bad "unexpected changed paths: $BADPATHS"
echo "$CHANGED" | rg -q '^(src|packages)/' && bad "product source changed" || ok "no src/ or packages/ changes"
if echo "$CHANGED" | rg -q '(^|/)(migrations?|db)/|\.sql$|schema\.'; then bad "database/migration files changed"; else ok "no DB/migration files changed"; fi
echo "$CHANGED" | rg -q 'vercel\.json|vercel\.' && bad "Vercel configuration changed" || ok "no Vercel configuration changes"
echo "$CHANGED" | rg -q 'docs/doable-source/' && bad "immutable Doable-source trees changed" || ok "no Doable-source changes"
echo "$CHANGED" | rg -q '^(README\.md|AGENTS\.md)$|AGENTS\.md$' && bad "README/AGENTS files modified" || ok "no README.md/AGENTS.md files modified"
[ -f "$S5" ] && echo "$CHANGED" | rg -q 'docs/project-control/sessions/SESSION-00[1-4]\.md' && bad "existing session records were modified (append-only violation)" || ok "existing session records SESSION-001..004 untouched"

echo "=== 11. No secrets/tokens/credentials ==="
if rg -n 'ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|supabase\.co/[A-Za-z0-9]|service_role[a-z_]*[[:space:]]*[:=]' "$WL" docs/project-control/ >/dev/null 2>&1; then
  bad "credential-pattern match found in worklog.md or docs/project-control/"
else
  ok "credential-pattern scan of worklog.md + docs/project-control/: no matches"
fi

echo "=== 12. Lightweight repository validation (read-only) ==="
if npm run validate:model-config >/tmp/phase4-closure-model-config.log 2>&1; then
  ok "npm run validate:model-config exited 0 (read-only; unchanged product state)"
else
  bad "npm run validate:model-config failed (see /tmp/phase4-closure-model-config.log)"
fi

echo "=== 13. Commit, push, clean tree, and synchronization (post-commit mode) ==="
if [ "$MODE" = "HEAD commit (post-commit)" ]; then
  MSG=$(git log --format='%s' -1 HEAD)
  [ "$MSG" = "docs: record architect approval of phase 4" ] && ok "HEAD commit message = 'docs: record architect approval of phase 4'" || bad "HEAD commit message is '$MSG'"
  PAR=$(git rev-parse HEAD^)
  [ "$PAR" = "$IMPL" ] && ok "HEAD is the immediate child of the reviewed implementation $IMPL" || bad "HEAD parent is $PAR, expected $IMPL"
  [ -z "$(git status --porcelain)" ] && ok "working tree clean after commit" || bad "working tree not clean"
  git fetch --prune origin >/dev/null 2>&1
  L=$(git rev-parse HEAD); R=$(git rev-parse origin/feature/ai-core-from-doable-source)
  [ "$L" = "$R" ] && ok "local HEAD = origin/feature/ai-core-from-doable-source ($L)" || bad "local $L != remote $R"
else
  [ -z "$(git status --porcelain | rg -v '^[AM] ')" ] && ok "pre-commit: no unstaged or stray changes beyond the staged set" || bad "pre-commit: unstaged/stray changes present"
  echo "note: commit message / parent / push / sync checks activate in HEAD-commit mode (re-run after commit)"
fi

echo ""
echo "RESULT: $PASS PASS / $FAIL FAIL (mode: $MODE)"
[ "$FAIL" -eq 0 ] || exit 1
