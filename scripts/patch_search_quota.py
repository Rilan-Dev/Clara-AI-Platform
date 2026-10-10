#!/usr/bin/env python3
"""WS-1.2: atomic admission for one-shot search flows (rag.ts + embed/search)."""

def patch(path, subs):
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8")
    for label, old, new in subs:
        matched = False
        for eol in ("\r\n", "\n"):
            old_e = old.replace("\n", eol)
            if old_e in raw:
                if raw.count(old_e) != 1:
                    print(f"WARN: {path}: {label} not unique — skipped")
                    matched = True
                    break
                raw = raw.replace(old_e, new.replace("\n", eol))
                print(f"ok: {path}: {label}")
                matched = True
                break
        if not matched:
            print(f"MISS: {path}: {label}")
    with open(path, "wb") as f:
        f.write(raw.encode("utf-8"))

RAG = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/rag.ts"
SEARCH = "/home/z/my-project/Clara-AI-Platform/src/app/api/embed/search/route.ts"

# ── rag.ts ────────────────────────────────────────────────────────────────────
patch(RAG, [
    (
        "import add",
        'import { logQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
        'import { logQueryEvent, finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";\n'
        'import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";',
    ),
    (
        "guard → admission",
        """      // ── Plan limit: daily request quota (org-wide, rolling 24h) ────────────
      const orgRows = await dbQuery<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
        [kb.id]
      );
      const orgId = orgRows[0]?.org_id ?? null;
      if (orgId) {
        const reqGuard = await planGuard(orgId, "requests");
        if (!reqGuard.allowed) {
          const blocked = reqGuard as { reason: string };
          return NextResponse.json(
            { error: "plan_limit_exceeded", code: "plan_limit_exceeded", message: blocked.reason },
            { status: 402 }
          );
        }
      }""",
        """      // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ────────────
      // Advisory-locked check-and-insert: search requests cannot race past
      // the limit, and the audit row exists before any retrieval spend.
      const orgRows = await dbQuery<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
        [kb.id]
      );
      const orgId = orgRows[0]?.org_id ?? null;
      const searchAdmission = await admitQueryEvent({
        orgId,
        kbId: kb.id,
        queryText: query,
        surface: "search",
      });
      if (!searchAdmission.admitted) {
        return admissionDeniedResponse(searchAdmission);
      }""",
    ),
    (
        "log → finalize",
        """      void logQueryEvent({
        kbId: kb.id,
        queryText: query,
        sourceCount: vectorResults.length + graphHits.length,
        latencyMs: Date.now() - t0,
        orgId,
        surface: "search",
        status: "ok",
      });""",
        """      void finalizeQueryEvent(searchAdmission.admitted ? searchAdmission.eventId : null, {
        answerText: "",
        sourceCount: vectorResults.length + graphHits.length,
        latencyMs: Date.now() - t0,
        status: "ok",
      });""",
    ),
])

# rag.ts: drop planGuard import if now unused
import re
with open(RAG, "rb") as f:
    raw = f.read().decode("utf-8")
if "planGuard(" not in raw:
    raw2 = re.sub(r'import \{ planGuard \} from "@/lib/plan-guard";\r?\n', "", raw, count=1)
    if raw2 != raw:
        with open(RAG, "wb") as f:
            f.write(raw2.encode("utf-8"))
        print("ok: rag.ts planGuard import removed")
if "logQueryEvent(" not in raw2:
    raw3 = raw2.replace(
        'import { logQueryEvent, finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
        'import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
    )
    with open(RAG, "wb") as f:
        f.write(raw3.encode("utf-8"))
    print("ok: rag.ts logQueryEvent import trimmed")

# ── embed/search/route.ts ─────────────────────────────────────────────────────
patch(SEARCH, [
    (
        "import add",
        'import { logQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
        'import { logQueryEvent, finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";\n'
        'import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";',
    ),
    (
        "guard → admission",
        """    // ── Plan limit: daily request quota (org-wide, rolling 24h) ────────────
    // Voice turns and phone calls hit this endpoint — they count too.
    const t0 = Date.now();
    const orgRows = await dbQuery<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
      [kbId]
    );
    const orgId = orgRows[0]?.org_id ?? null;
    if (orgId) {
      const reqGuard = await planGuard(orgId, "requests");
      if (!reqGuard.allowed) {
        const blocked = reqGuard as { reason: string };
        return NextResponse.json(
          { error: "plan_limit_exceeded", code: "plan_limit_exceeded", message: blocked.reason },
          { status: 402, headers: corsHeaders }
        );
      }
    }""",
        """    // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ────────────
    // Voice turns and phone calls hit this endpoint — they count too.
    // Advisory-locked check-and-insert: search requests cannot race past the
    // limit, and the audit row exists before any retrieval spend.
    const t0 = Date.now();
    const orgRows = await dbQuery<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kbx ON kbx.agent_id = a.id WHERE kbx.id = $1`,
      [kbId]
    );
    const orgId = orgRows[0]?.org_id ?? null;
    const searchAdmission = await admitQueryEvent({
      orgId,
      kbId,
      queryText: query,
      surface: "voice",
    });
    if (!searchAdmission.admitted) {
      const denied = searchAdmission;
      return NextResponse.json(
        { error: "plan_limit_exceeded", code: "plan_limit_exceeded", message: denied.reason,
          limitKey: denied.limitKey, current: denied.current, limit: denied.limit },
        { status: 402, headers: corsHeaders }
      );
    }""",
    ),
    (
        "log → finalize",
        """    // Voice / phone queries are part of the audit trail (no LLM answer is
    // generated here — the voice provider composes the spoken response).
    void logQueryEvent({
      kbId,
      queryText: query,
      sourceCount: results.length,
      latencyMs: Date.now() - t0,
      orgId,
      surface: "voice",
      status: "ok",
    });""",
        """    // Voice / phone queries are part of the audit trail (no LLM answer is
    // generated here — the voice provider composes the spoken response).
    // WS-1.2: the row was atomically admitted before retrieval — finalise it.
    void finalizeQueryEvent(searchAdmission.admitted ? searchAdmission.eventId : null, {
      answerText: "",
      sourceCount: results.length,
      latencyMs: Date.now() - t0,
      status: "ok",
    });""",
    ),
])

with open(SEARCH, "rb") as f:
    raw = f.read().decode("utf-8")
if "planGuard(" not in raw:
    raw2 = re.sub(r'import \{ planGuard \} from "@/lib/plan-guard";\r?\n', "", raw, count=1)
    if raw2 != raw:
        with open(SEARCH, "wb") as f:
            f.write(raw2.encode("utf-8"))
        print("ok: embed/search planGuard import removed")
    if "logQueryEvent(" not in raw2:
        raw3 = raw2.replace(
            'import { logQueryEvent, finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
            'import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";',
        )
        with open(SEARCH, "wb") as f:
            f.write(raw3.encode("utf-8"))
        print("ok: embed/search logQueryEvent import trimmed")
