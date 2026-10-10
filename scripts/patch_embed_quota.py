#!/usr/bin/env python3
"""WS-1.2: swap guard+log for atomic admission in embed chat, rag, embed search."""

def patch(path, subs):
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8")
    changed = 0
    for label, old, new in subs:
        matched = False
        for eol in ("\r\n", "\n"):
            old_e = old.replace("\n", eol)
            if old_e in raw:
                if raw.count(old_e) != 1:
                    print(f"WARN: {path}: {label} not unique — skipping")
                    matched = True
                    break
                raw = raw.replace(old_e, new.replace("\n", eol))
                print(f"ok: {path}: {label}")
                matched = True
                changed += 1
                break
        if not matched:
            print(f"MISS: {path}: {label}")
    with open(path, "wb") as f:
        f.write(raw.encode("utf-8"))
    return changed

# ── embed/chat/route.ts ──────────────────────────────────────────────────────
patch("/home/z/my-project/Clara-AI-Platform/src/app/api/embed/chat/route.ts", [
    (
        "import",
        'import { logQueryEvent, finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
        'import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";\n'
        'import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";',
    ),
    (
        "admission",
        """    // ── Plan limit: daily request quota (org-wide, rolling 24h) ────────────
    // Enforced before retrieval/LLM work so over-limit orgs cost nothing.
    if (ctx.orgId) {
      const reqGuard = await planGuard(ctx.orgId, "requests");
      if (!reqGuard.allowed) {
        const blocked = reqGuard as { reason: string };
        return NextResponse.json(
          { error: "plan_limit_exceeded", code: "plan_limit_exceeded", message: blocked.reason },
          { status: 402, headers: corsHeaders },
        );
      }
    }""",
        """    // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ────────────
    // Advisory-locked check-and-insert: concurrent embed requests cannot race
    // past the limit, and quota state cannot diverge from the audit trail.
    // Enforced before retrieval/LLM work so over-limit orgs cost nothing.""",
    ),
    (
        "log swap",
        """    // Audit trail — inserted at REQUEST time (status='pending') so the prompt
    // is audited and the daily quota counts even when retrieval later fails.
    const eventId = await logQueryEvent({
      kbId: ctx.kbId,
      queryText: query,
      sessionId: body.sessionId,
      orgId: ctx.orgId,
      surface: "embed",
      status: "pending",
    });""",
        """    // Audit trail + daily quota, atomically admitted (status='pending') so
    // the prompt is audited, the quota counts even when retrieval later
    // fails, and a crossing of 80% of the daily limit carries a warning the
    // widget can surface as a dismissible banner.
    const admission = await admitQueryEvent({
      kbId: ctx.kbId,
      queryText: query,
      sessionId: body.sessionId,
      orgId: ctx.orgId,
      surface: "embed",
    });
    if (!admission.admitted) {
      return admissionDeniedResponse(admission) as NextResponse;
    }
    const eventId = admission.eventId;
    const quotaWarning = admission.warning;""",
    ),
    (
        "quota_warning event",
        """        if (sources.length > 0) {
          write({
            type: "sources",
            payload: sources.map((result, index) => ({
              index: index + 1,
              title: result.title,
              snippet: result.snippet.slice(0, 200),
              score: result.score,
            })),
          });
        }""",
        """        if (sources.length > 0) {
          write({
            type: "sources",
            payload: sources.map((result, index) => ({
              index: index + 1,
              title: result.title,
              snippet: result.snippet.slice(0, 200),
              score: result.score,
            })),
          });
        }

        // WS-1.2: 80% soft warning — the widget renders a dismissible banner.
        if (quotaWarning) {
          write({ type: "quota_warning", payload: quotaWarning });
        }""",
    ),
])

# planGuard import removal in embed chat (now unused)
with open("/home/z/my-project/Clara-AI-Platform/src/app/api/embed/chat/route.ts", "rb") as f:
    raw = f.read().decode("utf-8")
import re
raw2 = re.sub(r'import \{ planGuard \} from "@/lib/plan-guard";\r?\n', "", raw, count=1)
if raw2 != raw:
    with open("/home/z/my-project/Clara-AI-Platform/src/app/api/embed/chat/route.ts", "wb") as f:
        f.write(raw2.encode("utf-8"))
    print("ok: embed chat planGuard import removed")
