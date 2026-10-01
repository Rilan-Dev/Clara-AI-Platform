#!/usr/bin/env bash
#
# correction-cycle-test.sh — deterministic demonstration of the Phase 6 correction and issue-control workflow
#
# Established by Phase 6 — Correction and Issue-Control Workflow (2026-10-01; plan Phase 6).
# Corrected by the Phase 6 P2/P3 closure-policy correction (2026-10-01; issue I-013; corrective
# handoff CH-001; correction baseline c0cca964064286c25dcf22c8f86038baaacd7ebe): Phase 6 introduces
# NO P2/P3 exception mechanism — an acceptance-violating P2/P3 is closure-blocking while unresolved
# and must be resolved before closure, regardless of any recorded exception; the P0 cases and the
# P1 exception model are unchanged from the Phase 5 contract.
# Binding workflow rules: VERIFICATION_STATE.md §"Correction and issue-control workflow (durable)".
# Canonical issue schema / lifecycle / severity model: docs/project-control/ISSUES.md §"Issue-control system".
# Canonical correction-handoff form: docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md.
#
# What this test demonstrates (the four required examples plus severity-model edge cases):
#   - Example A — correction required: the lifecycle walk OPEN → TRIAGED → CORRECTION_REQUIRED →
#     CORRECTION_IN_PROGRESS → CORRECTION_SUBMITTED → REVIEW_PENDING is valid, and the issue is NOT
#     automatically RESOLVED at any developer-controlled step; closure eligibility stays FAIL while
#     the blocking correction is open. A developer-effected "resolution" and a skipped state are rejected.
#   - Example B — correction accepted: REVIEW_PENDING → RESOLVED is valid ONLY with architect-verified
#     re-review evidence; a repeat cycle (REVIEW_PENDING → CORRECTION_REQUIRED) is also valid.
#   - Example C — scope expansion attempt: a correction commit whose changed paths are within the approved
#     corrective scope is accepted; a commit carrying one unrelated path is REJECTED — an unrelated change
#     cannot be accepted as part of the correction scope.
#   - Example D — P0: a P0 issue remains closure-blocking even if the corrective work is otherwise complete
#     (gates PASS, tests passed, developer claims complete) — including a WONT_FIX'd P0 (no exception path);
#     only RESOLVED (architect-verified) unblocks.
#   - Severity-model edge cases (corrected semantics): a P1 DEFERRED with an architect-approved
#     exception does not block (the P1 exception mechanism of the Phase 5 contract — unchanged);
#     a P2/P3 that is NOT acceptance-violating does not automatically block closure; a P2 or P3
#     that violates an acceptance criterion blocks closure while unresolved and must be resolved;
#     an unresolved acceptance-violating P2/P3 with an ALLEGED architect-approved exception is
#     STILL closure-ineligible — Phase 6 defines no P2/P3 exception path, so the exception flag
#     has no clearing effect for P2/P3 (resolution is the only path).
#
# THIS TEST MODELS STATE TRANSITIONS ON EMBEDDED FIXTURES ONLY. It does NOT perform, simulate, or claim
# any actual ChatGPT architect review. The "architect-verified" evidence values below are fixture INPUTS
# representing outcomes a real architect review would have recorded — they are not outcomes produced by
# this test, and running this test is never itself evidence of any phase's completion or any issue's
# resolution.
#
# Properties: read-only (no repository writes, no network, no filesystem changes); deterministic (fixed
# inputs, no clock/randomness — identical output on every run); self-contained (fixtures embedded below;
# bash + standard utilities only); NO application or production-runtime dependency. It is a governance
# artifact, NOT a CI gate.
#
# Usage:   bash docs/project-control/verification/correction-cycle-test.sh
# Exit:    0 iff every case computes its expected determination; 1 otherwise.

set -u

# ---------------------------------------------------------------------------
# Evaluator 1 — issue-lifecycle transition validity (ISSUES.md §2)
#
# Implements the canonical transition table including WHO may effect each
# transition and the evidence required. The actor is 'architect' or 'developer';
# evidence is 'architect-verified' or 'developer-reported'.
#
# Hard invariants:
#   * RESOLVED is reachable ONLY with architect-verified evidence (a developer
#     claim never resolves an issue), and only from a valid predecessor state.
#   * The developer may effect only OPEN(new), CORRECTION_IN_PROGRESS,
#     CORRECTION_SUBMITTED, and REVIEW_PENDING registration.
# ---------------------------------------------------------------------------
issue_transition_valid() {
    local from="$1" to="$2" actor="$3" evidence="$4"

    # Invariant: any transition INTO RESOLVED requires architect-verified evidence
    # and an architect actor (only architect verification establishes resolution).
    if [ "$to" = "RESOLVED" ]; then
        if [ "$actor" != "architect" ] || [ "$evidence" != "architect-verified" ]; then
            echo "REJECTED: transition into RESOLVED requires an architect actor with architect-verified evidence — a developer correction claim never resolves an issue"
            return 1
        fi
        case "$from" in
            OPEN|TRIAGED|REVIEW_PENDING|DEFERRED|BLOCKED)
                echo "VALID: ${from} -> RESOLVED effected by architect with architect-verified resolution evidence"
                return 0 ;;
            *)
                echo "REJECTED: ${from} -> RESOLVED is not a valid transition (canonical path: REVIEW_PENDING -> RESOLVED; resolution without a correction cycle only from OPEN/TRIAGED by architect verification)"
                return 1 ;;
        esac
    fi

    # Invariant: the developer may effect only these transitions.
    if [ "$actor" = "developer" ]; then
        case "${from}->${to}" in
            "CORRECTION_REQUIRED->CORRECTION_IN_PROGRESS"|"CORRECTION_IN_PROGRESS->CORRECTION_SUBMITTED"|"CORRECTION_SUBMITTED->REVIEW_PENDING")
                echo "VALID: ${from} -> ${to} effected by developer (bounded corrective work / submission / registration)" ; return 0 ;;
            *)
                echo "REJECTED: ${from} -> ${to} cannot be effected by the developer (architect-only transition)" ; return 1 ;;
        esac
    fi

    # Architect-effected transitions (evidence class unconstrained here except for RESOLVED above).
    case "${from}->${to}" in
        "OPEN->TRIAGED"|"OPEN->WONT_FIX"|"OPEN->DEFERRED"|"OPEN->BLOCKED"|"OPEN->RESOLVED"|"OPEN->OPEN") ;;
        "TRIAGED->CORRECTION_REQUIRED"|"TRIAGED->RESOLVED"|"TRIAGED->WONT_FIX"|"TRIAGED->DEFERRED"|"TRIAGED->BLOCKED") ;;
        "CORRECTION_REQUIRED->CORRECTION_IN_PROGRESS"|"CORRECTION_IN_PROGRESS->CORRECTION_SUBMITTED"|"CORRECTION_SUBMITTED->REVIEW_PENDING") ;;
        "REVIEW_PENDING->RESOLVED"|"REVIEW_PENDING->CORRECTION_REQUIRED"|"REVIEW_PENDING->WONT_FIX"|"REVIEW_PENDING->DEFERRED") ;;
        "DEFERRED->TRIAGED"|"DEFERRED->CORRECTION_REQUIRED"|"BLOCKED->TRIAGED"|"BLOCKED->CORRECTION_REQUIRED"|"RESOLVED->OPEN") ;;
        *)
            echo "REJECTED: ${from} -> ${to} is not in the canonical transition table" ; return 1 ;;
    esac
    echo "VALID: ${from} -> ${to} effected by architect"
    return 0
}

# ---------------------------------------------------------------------------
# Evaluator 2 — correction scope check (scope-integrity rule; Example C)
#
# A correction commit is within the approved corrective scope only if EVERY
# changed path is within the approved scope list. One unrelated path => the
# commit is rejected as a scope violation (never silently absorbed).
# ---------------------------------------------------------------------------
correction_scope_check() {
    local changed="$1" approved="$2" path ok=1
    # changed / approved: whitespace-separated path lists
    for path in $changed; do
        case " $approved " in
            *" $path "*) ;;
            *) echo "REJECTED: changed path '${path}' is OUTSIDE the approved corrective scope — an unrelated change cannot be accepted as part of the correction"; ok=0 ;;
        esac
    done
    if [ "$ok" -eq 1 ]; then
        echo "ACCEPTED: every changed path is within the approved corrective scope"
        return 0
    fi
    return 1
}

# ---------------------------------------------------------------------------
# Evaluator 3 — closure eligibility with the issue model (maps the issue
# register onto the Phase 5 closure-eligibility rules R1–R6; R7 remains a
# live-repository check outside fixture scope, as in the Phase 5 test).
#
# Issue fixture lines:  ID|SEVERITY|STATUS|FLAGS
#   SEVERITY : P0 | P1 | P2 | P3
#   STATUS   : OPEN | TRIAGED | CORRECTION_REQUIRED | CORRECTION_IN_PROGRESS |
#              CORRECTION_SUBMITTED | REVIEW_PENDING | RESOLVED | WONT_FIX |
#              DEFERRED | BLOCKED
#   FLAGS    : comma-separated; 'exception=REF' = architect-approved exception
#              (an actual DECISIONS.md reference in real use — the P1 exception
#              mechanism of the Phase 5 contract; it has NO effect for P2/P3:
#              Phase 6 defines no P2/P3 exception path); 'av' = the issue
#              violates an acceptance criterion / explicit blocking condition.
#
# Derived quantities (fed into R1–R6):
#   P0_OPEN   = P0 issues not RESOLVED (any other state — incl. WONT_FIX/DEFERRED:
#               there is no P0 exception path)
#   P1_UNHANDLED = P1 issues not RESOLVED lacking an architect-approved exception
#   BLOCKING_CORRECTION_OPEN = an issue in a correction-cycle state
#               (CORRECTION_REQUIRED/CORRECTION_IN_PROGRESS/CORRECTION_SUBMITTED/
#               REVIEW_PENDING) that is closure-blocking per the severity model
#               (P0 always; P1 unless exceptioned; P2/P3 iff acceptance-violating
#               — with NO P2/P3 exception path: an exception flag never clears
#               an acceptance-violating P2/P3; resolution is the only path)
# ---------------------------------------------------------------------------
derive_issue_counts() {
    local issues="$1" line id sev status flags
    P0_OPEN=0; P1_UNHANDLED=0; BLOCKING_CORRECTION_OPEN=no
    while IFS= read -r line; do
        case "$line" in ''|\#*) continue ;; esac
        id="${line%%|*}"; line="${line#*|}"
        sev="${line%%|*}"; line="${line#*|}"
        status="${line%%|*}"
        flags="${line#*|}"
        local exceptioned=0 av=0
        case ",$flags," in *",exception="*) exceptioned=1 ;; esac
        case ",$flags," in *",av"*) av=1 ;; esac
        if [ "$status" != "RESOLVED" ]; then
            if [ "$sev" = "P0" ]; then
                P0_OPEN=$((P0_OPEN + 1))
            elif [ "$sev" = "P1" ] && [ "$exceptioned" -eq 0 ]; then
                P1_UNHANDLED=$((P1_UNHANDLED + 1))
            fi
            local blocking=0
            case "$status" in
                CORRECTION_REQUIRED|CORRECTION_IN_PROGRESS|CORRECTION_SUBMITTED|REVIEW_PENDING)
                    # P0 always blocks (no exception path). P1 blocks unless it carries the
                    # recorded architect-approved exception (R5). P2/P3 block iff acceptance-
                    # violating — with NO exception path (Phase 6 correction: the exception
                    # flag has no clearing effect for P2/P3; an acceptance-violating P2/P3
                    # must be resolved before closure; 'exceptioned' is deliberately ignored
                    # on this branch).
                    if [ "$sev" = "P0" ]; then blocking=1
                    elif [ "$sev" = "P1" ] && [ "$exceptioned" -eq 0 ]; then blocking=1
                    elif { [ "$sev" = "P2" ] || [ "$sev" = "P3" ]; } && [ "$av" -eq 1 ]; then blocking=1
                    fi ;;
            esac
            if [ "$blocking" -eq 1 ]; then BLOCKING_CORRECTION_OPEN=yes; fi
        fi
    done <<< "$issues"
}

closure_eligibility_with_issues() {
    local issues="$1" line key value gate val status
    local -A S=()
    while IFS= read -r line; do
        case "$line" in ''|\#*) continue ;; esac
        key="${line%%=*}"
        value="${line#*=}"
        S["$key"]="$value"
    done <<< "$2"

    derive_issue_counts "$issues"

    local -a reasons=()
    # R1 — required gates (A, B, C, D) must be PASS
    for gate in A B C D; do
        val="${S[GATE_$gate]:-MISSING}"
        status="${val%%:*}"
        if [ "$status" != "PASS" ]; then
            reasons+=("required Gate $gate is '${status}' (expected PASS)")
        fi
    done
    # R3 — Gate D PASS must be architect-verified
    val="${S[GATE_D]:-MISSING}"
    if [ "${val%%:*}" = "PASS" ]; then
        local dclass="${val#PASS:}"
        dclass="${dclass%%:*}"
        if [ "$dclass" != "architect-verified" ]; then
            reasons+=("Gate D PASS is '${dclass}' — only an actual architect review satisfies Gate D")
        fi
    fi
    # R2 — conditional gates recorded
    val="${S[GATE_E]:-MISSING}"
    if [ "${val%%:*}" != "NOT_APPLICABLE" ]; then
        reasons+=("Gate E is '${val%%:*}' — a recorded NOT_APPLICABLE applicability assessment is required")
    fi
    val="${S[GATE_F]:-MISSING}"
    if [ "${val%%:*}" != "NOT_APPLICABLE" ]; then
        reasons+=("Gate F is '${val%%:*}' — a recorded NOT_APPLICABLE applicability assessment is required")
    fi
    # R4 — P0 count = 0 (no exception path)
    if [ "$P0_OPEN" != "0" ]; then
        reasons+=("P0 open count = ${P0_OPEN} — P0 unconditionally prevents closure (no exception path)")
    fi
    # R5 — P1 count = 0 or every P1 carries an architect-approved exception
    if [ "$P1_UNHANDLED" != "0" ]; then
        reasons+=("P1 unhandled count = ${P1_UNHANDLED} (no recorded architect-approved exception)")
    fi
    # R6 — no unresolved blocking correction is open
    if [ "$BLOCKING_CORRECTION_OPEN" = "yes" ]; then
        reasons+=("an unresolved blocking correction is open (a closure-blocking issue is in a correction-cycle state)")
    fi

    if [ "${#reasons[@]}" -eq 0 ]; then
        echo "PASS"
    else
        local joined
        joined="$(printf '%s; ' "${reasons[@]}")"
        echo "FAIL (${joined%??})"
    fi
}

# ---------------------------------------------------------------------------
# Case runners
# ---------------------------------------------------------------------------
TOTAL=0
CORRECT=0

expect_transition() {
    local name="$1" expected="$2" from="$3" to="$4" actor="$5" evidence="$6" outcome verdict
    TOTAL=$((TOTAL + 1))
    outcome="$(issue_transition_valid "$from" "$to" "$actor" "$evidence")"
    verdict="${outcome%%:*}"
    if [ "$verdict" = "$expected" ]; then
        CORRECT=$((CORRECT + 1))
        printf '[%-46s] %-30s -> %-22s actor=%-9s => %s MATCH\n' "$name" "$from" "$to" "$actor" "$outcome"
    else
        CORRECT=$CORRECT
        printf '[%-46s] %-30s -> %-22s actor=%-9s => %s MISMATCH (expected %s)\n' "$name" "$from" "$to" "$actor" "$outcome" "$expected"
    fi
}

expect_scope() {
    local name="$1" expected="$2" changed="$3" approved="$4" outcome verdict
    TOTAL=$((TOTAL + 1))
    outcome="$(correction_scope_check "$changed" "$approved")"
    verdict="${outcome%%:*}"
    if [ "$verdict" = "$expected" ]; then
        CORRECT=$((CORRECT + 1))
        printf '[%-46s] changed=[%s] => %s MATCH\n' "$name" "$changed" "$outcome"
    else
        printf '[%-46s] changed=[%s] => %s MISMATCH (expected %s)\n' "$name" "$changed" "$outcome" "$expected"
    fi
}

expect_eligibility() {
    local name="$1" expected="$2" issues="$3" gates="$4" computed eligibility
    TOTAL=$((TOTAL + 1))
    computed="$(closure_eligibility_with_issues "$issues" "$gates")"
    eligibility="${computed%% *}"
    if [ "$eligibility" = "$expected" ]; then
        CORRECT=$((CORRECT + 1))
        printf '[%-46s] tests=passed developer-claim=yes => closure eligibility %s MATCH\n' "$name" "$eligibility"
    else
        printf '[%-46s] tests=passed developer-claim=yes => closure eligibility %s MISMATCH (expected %s)\n' "$name" "$eligibility" "$expected"
        printf '    computed detail: %s\n' "$computed"
    fi
}

ALL_GATES_PASS='GATE_A=PASS:developer-reported
GATE_B=PASS:developer-reported
GATE_C=PASS:developer-reported
GATE_D=PASS:architect-verified:fixture-input-representing-a-recorded-architect-review
GATE_E=NOT_APPLICABLE:assessed-no-database-surface
GATE_F=NOT_APPLICABLE:assessed-no-deployment-surface
TESTS_PASSED=yes
DEVELOPER_COMPLETION_CLAIM=yes'

echo "== correction-cycle-test.sh — deterministic correction-workflow demonstration (Phase 6, 2026-10-01) =="
echo "Contract: VERIFICATION_STATE.md §Correction and issue-control workflow · Register: ISSUES.md §Issue-control system"
echo "Rule under test: an architect finding becomes a traced, bounded correction cycle —"
echo "issue record -> corrective handoff -> bounded developer correction -> verification ->"
echo "architect re-review -> resolution; scope cannot silently expand; P0 never stops blocking."
echo "NOTE: this test models state transitions on fixtures only — it performs/claims NO actual architect review."
echo ""

# ===========================================================================
# Example A — correction required (the issue is NOT automatically RESOLVED)
# ===========================================================================

# A1 — the full valid lifecycle walk; every step is a valid transition, and at
# CORRECTION_SUBMITTED the issue is NOT resolved. With the blocking P1 correction
# open, closure eligibility computes FAIL even though gates/tests/claims are green.
echo "-- Example A — correction required: no automatic resolution --"
for step in "OPEN TRIAGED architect developer-reported" \
            "TRIAGED CORRECTION_REQUIRED architect architect-verified" \
            "CORRECTION_REQUIRED CORRECTION_IN_PROGRESS developer developer-reported" \
            "CORRECTION_IN_PROGRESS CORRECTION_SUBMITTED developer developer-reported" \
            "CORRECTION_SUBMITTED REVIEW_PENDING developer developer-reported"; do
    set -- $step
    expect_transition "example-a-lifecycle-step-$1-to-$2" "VALID" "$1" "$2" "$3" "$4"
done
expect_transition "example-a-dev-declares-resolved" "REJECTED" "CORRECTION_SUBMITTED" "RESOLVED" "developer" "developer-reported"
expect_transition "example-a-skip-to-review-pending" "REJECTED" "OPEN" "REVIEW_PENDING" "developer" "developer-reported"
expect_eligibility  "example-a-blocking-correction-open" "FAIL" \
    "I-100|P1|REVIEW_PENDING|" "$ALL_GATES_PASS"

# ===========================================================================
# Example B — correction accepted (resolution ONLY via architect verification)
# ===========================================================================

echo "-- Example B — correction accepted: architect-verified resolution --"
expect_transition "example-b-architect-resolves" "VALID" "REVIEW_PENDING" "RESOLVED" "architect" "architect-verified"
expect_transition "example-b-dev-evidence-resolves" "REJECTED" "REVIEW_PENDING" "RESOLVED" "architect" "developer-reported"
expect_transition "example-b-repeat-cycle" "VALID" "REVIEW_PENDING" "CORRECTION_REQUIRED" "architect" "architect-verified"
expect_eligibility  "example-b-resolved-issue-unblocked" "PASS" \
    "I-100|P1|RESOLVED|" "$ALL_GATES_PASS"

# ===========================================================================
# Example C — scope expansion attempt (unrelated change cannot ride along)
# ===========================================================================

echo "-- Example C — scope expansion attempt --"
expect_scope "example-c-in-scope-commit" "ACCEPTED" \
    "docs/project-control/VERIFICATION_STATE.md docs/project-control/ISSUES.md worklog.md" \
    "docs/project-control/VERIFICATION_STATE.md docs/project-control/ISSUES.md worklog.md docs/project-control/CURRENT_PHASE.md"
expect_scope "example-c-unrelated-path-rejected" "REJECTED" \
    "docs/project-control/VERIFICATION_STATE.md src/modules/ai-core/provider.ts docs/project-control/ISSUES.md" \
    "docs/project-control/VERIFICATION_STATE.md docs/project-control/ISSUES.md worklog.md"

# ===========================================================================
# Example D — P0 remains closure-blocking even if corrective work is complete
# ===========================================================================

echo "-- Example D — P0 unconditionally blocks closure --"
expect_eligibility "example-d-p0-correction-submitted" "FAIL" \
    "I-200|P0|CORRECTION_SUBMITTED|" "$ALL_GATES_PASS"
expect_eligibility "example-d-p0-wont-fix-acknowledged" "FAIL" \
    "I-201|P0|WONT_FIX|" "$ALL_GATES_PASS"
expect_eligibility "example-d-p0-resolved-unblocks" "PASS" \
    "I-202|P0|RESOLVED|" "$ALL_GATES_PASS"

# ===========================================================================
# Severity-model edge cases
# ===========================================================================

echo "-- Severity-model edge cases (corrected P2/P3 closure semantics) --"
expect_eligibility "severity-p1-deferred-with-exception" "PASS" \
    "I-300|P1|DEFERRED|exception=D-0EX" "$ALL_GATES_PASS"
expect_eligibility "severity-p2-acceptance-violation-blocks" "FAIL" \
    "I-301|P2|CORRECTION_REQUIRED|av" "$ALL_GATES_PASS"
# P2/P3 not acceptance-violating: do NOT automatically block closure (even mid-correction-cycle)
expect_eligibility "severity-p2-non-av-does-not-block" "PASS" \
    "I-302|P2|CORRECTION_REQUIRED|" "$ALL_GATES_PASS"
expect_eligibility "severity-p3-non-av-does-not-block" "PASS" \
    "I-303|P3|REVIEW_PENDING|" "$ALL_GATES_PASS"
# P3 acceptance-violating: blocks while unresolved, like P2
expect_eligibility "severity-p3-av-blocks" "FAIL" \
    "I-304|P3|CORRECTION_REQUIRED|av" "$ALL_GATES_PASS"
# NO P2/P3 exception path: an alleged architect-approved exception does NOT clear an
# unresolved acceptance-violating P2/P3 — the state remains closure-ineligible (FAIL)
expect_eligibility "severity-p2-av-alleged-exception-rejected" "FAIL" \
    "I-305|P2|CORRECTION_REQUIRED|av,exception=D-0EX" "$ALL_GATES_PASS"
expect_eligibility "severity-p3-av-alleged-exception-rejected" "FAIL" \
    "I-306|P3|REVIEW_PENDING|av,exception=D-0EX" "$ALL_GATES_PASS"

echo ""
if [ "$CORRECT" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    echo "RESULT: ${CORRECT}/${TOTAL} determinations correct — correction workflow demonstrated."
    echo "  Example A proves: CORRECTION_SUBMITTED does not auto-resolve; developer resolutions are rejected;"
    echo "                    an open blocking correction keeps closure eligibility FAIL."
    echo "  Example B proves: RESOLVED requires architect-verified evidence; a repeat correction cycle is valid."
    echo "  Example C proves: a correction commit with an unrelated path is rejected — scope cannot silently expand."
    echo "  Example D proves: a P0 blocks closure while unresolved (even submitted or WONT_FIX'd) — no exception path."
    echo "  Severity edges prove: a P1 DEFERRED with an architect-approved exception does not block; a"
    echo "                    non-acceptance-violating P2/P3 does not automatically block closure; an"
    echo "                    acceptance-violating P2/P3 blocks while unresolved and must be resolved — an"
    echo "                    alleged architect exception does NOT clear it (no P2/P3 exception path)."
    echo "Exit status: 0"
    exit 0
else
    echo "RESULT: ${CORRECT}/${TOTAL} determinations correct — FAILURE: the evaluator diverges from the workflow contract."
    echo "Exit status: 1"
    exit 1
fi
