### 2. Issue lifecycle (canonical states, valid transitions, authority)

```text
OPEN
  ↓ (architect triage: severity + disposition assigned)
TRIAGED
  ↓ (architect issues corrective handoff — templates/CORRECTION_HANDOFF_TEMPLATE.md)
CORRECTION_REQUIRED
  ↓ (developer begins the bounded correction)
CORRECTION_IN_PROGRESS
  ↓ (developer delivers correction commit + evidence report)
CORRECTION_SUBMITTED
  ↓ (submission registered in the durable state — VERIFICATION_STATE.md review trail)
REVIEW_PENDING
  ↓ (architect re-review of the correction)
RESOLVED  [terminal success — architect-verified resolution evidence only]

Non-progress / terminal states (architect-directed only):
TRIAGED → WONT_FIX (architect explicitly declines the fix — DECISIONS.md reference required)
TRIAGED → DEFERRED (awaiting a later phase/decision)
TRIAGED → BLOCKED (external dependency prevents progress; reactivated by architect direction)
REVIEW_PENDING → CORRECTION_REQUIRED (re-review found the correction insufficient — repeat cycle)
```

Valid transitions, who may effect them, and the evidence required:

| From | To | Effected by | Required evidence |
|---|---|---|---|
| — (new finding) | `OPEN` | architect **or** developer (reporting a discovered defect — `[developer-reported]` finding) | finding + observable evidence; phase/context identified |
| `OPEN` | `TRIAGED` | architect | severity assigned (P0–P3) + disposition determined |
| `OPEN` | `RESOLVED` | architect | `[architect-verified]` resolution evidence (e.g. the finding is demonstrated already-addressed or mistaken) — never a developer claim |
| `OPEN` | `WONT_FIX` / `DEFERRED` / `BLOCKED` | architect | architect decision recorded (a `DECISIONS.md` reference for `WONT_FIX`; architect direction for `DEFERRED`/`BLOCKED`) |
| `TRIAGED` | `CORRECTION_REQUIRED` | architect | corrective handoff issued (materialized from `templates/CORRECTION_HANDOFF_TEMPLATE.md` into `ZAI_HANDOFF.md` Part II), referencing this issue ID |
| `TRIAGED` | `RESOLVED` / `WONT_FIX` / `DEFERRED` / `BLOCKED` | architect | as above |
| `CORRECTION_REQUIRED` | `CORRECTION_IN_PROGRESS` | developer | corrective handoff received and verified per `ZAI_HANDOFF.md` §I.6; corrective work begun |
| `CORRECTION_IN_PROGRESS` | `CORRECTION_SUBMITTED` | developer | the focused correction commit exists (referencing the issue ID) and the correction evidence report is delivered — `[developer-reported]` |
| `CORRECTION_SUBMITTED` | `REVIEW_PENDING` | developer (registration) | the submission recorded in the durable state (`VERIFICATION_STATE.md` under the related phase; issue record updated) — awaiting architect re-review |
| `REVIEW_PENDING` | `RESOLVED` | **architect only** | an actual ChatGPT re-review of the correction — `[architect-verified]` resolution evidence |
| `REVIEW_PENDING` | `CORRECTION_REQUIRED` | architect | re-review outcome `CORRECTION_REQUIRED` (repeat cycle; a further corrective handoff) |
| `REVIEW_PENDING` | `WONT_FIX` / `DEFERRED` | architect | architect decision recorded |
| `DEFERRED` / `BLOCKED` | `TRIAGED` (or `CORRECTION_REQUIRED`) | architect | dated architect re-activation direction in the issue record |
| `RESOLVED` | `OPEN` | architect | dated reopen note (regression/recurrence); the record keeps its ID and gains a dated reopen annotation |

Rules (binding):

1. Consecutive architect transitions may be effected within one architect action — e.g. a `CORRECTION_REQUIRED` review outcome records `OPEN → TRIAGED → CORRECTION_REQUIRED` on the issue at once; the states record the determination sequence, not separate clock events.
2. `CORRECTION_SUBMITTED` **never** auto-transitions to `RESOLVED`. An issue is not resolved merely because Z.AI says it is fixed — **only architect verification can establish `architect-verified` resolution**.
3. `RESOLVED` always requires `[architect-verified]` resolution evidence, from whichever state it is reached.
4. The developer may effect only: `OPEN` (reporting a discovered finding), `CORRECTION_IN_PROGRESS`, `CORRECTION_SUBMITTED`, and the `REVIEW_PENDING` registration. Every other transition is architect-only.
5. A newly discovered issue during a correction, outside the corrective scope, is **not** absorbed into the correction: STOP → record it here as a new `OPEN` issue (`[developer-reported]`) → await architect direction.
6. Statuses use the canonical uppercase vocabulary above; the pre-Phase-6 lowercase values in the legacy entries below are the same states (see §"Legacy entries").

### 3. Canonical issue-record schema (from Phase 6 onward)
