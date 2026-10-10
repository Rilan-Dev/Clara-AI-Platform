#!/usr/bin/env python3
"""WS-1.2 wiring for chat.ts — line-splice based (mixed line endings safe)."""

PATH = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts"

with open(PATH, "rb") as f:
    raw = f.read().decode("utf-8")

lines = raw.split("\n")
# Keep each line's original \r suffix (last element after split has none).

def find_idx(predicate, start=0):
    for i in range(start, len(lines)):
        if predicate(lines[i]):
            return i
    raise SystemExit(f"anchor not found from line {start}")

def eol_of(i: int) -> str:
    return "\r" if lines[i].endswith("\r") else ""

def splice(start: int, end: int, new_block: list[str]) -> None:
    """Replace lines[start:end+1] with new_block, preserving the EOL style of
    the first replaced line."""
    eol = eol_of(start)
    new_lines = [l + eol for l in new_block]
    lines[start:end + 1] = new_lines

# ── 1. Imports: add quota-admission import after analytics-db import ────────
i = find_idx(lambda l: l.strip().startswith("import { logQueryEvent, finalizeQueryEvent }"))
eol = eol_of(i)
lines.insert(i + 1, 'import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";' + eol)
print("ok: imports")

# ── 2. Mode A: replace guard + log block with atomic admission ──────────────
# Anchor A1: the "Plan limit" comment block start (Mode A, unique via "daily request quota")
a1 = find_idx(lambda l: "Plan limit: daily request quota" in l)
# Walk back to include the two leading comment lines? The comment starts at a1's
# preceding line containing "──" only — instead start AT a1's comment line.
# Find the org resolution line:
a_org = find_idx(lambda l: l.strip().startswith("const orgRows = await dbQuery"), a1)
# Find logQueryEvent call start (Mode A): after authCtx/query/sessionId lines
a_log = find_idx(lambda l: l.strip().startswith("const eventId = await logQueryEvent({"), a_org)
# Find its closing "});" line:
a_end = find_idx(lambda l: l.strip() == "});", a_log)

new_block = """  // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ─────────────
  // ONE transaction: advisory-lock the org, resolve limits, count the window,
  // then INSERT the pending audit row — check-and-increment cannot race, and
  // quota state can never diverge from the audit trail.
  // Enforced BEFORE any retrieval/LLM work so over-limit orgs cost nothing.
  // (Named dbQuery — `query` below shadows it with the chat question text.)
  const orgRows = await dbQuery<{ org_id: string }>(
    `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
    [kbId]
  );
  const orgId = orgRows[0]?.org_id ?? null;

  // Audit context — workspace chat is authenticated; the question is still
  // logged for anonymous surfaces (user_id NULL).
  const authCtx = await getAuthContext(request).catch(() => null);

  const query = latest.content;
  const retrievalQuery = buildConversationAwareSearchQuery(messages, query);
  const recentConversationContextBlock = buildRecentConversationContextBlock(messages);
  const t0 = Date.now();
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;

  console.log(`[chat/kb] kbId=${kbId} query="${query.slice(0, 100)}"`);

  // Analytics + audit trail + daily quota, atomically admitted:
  //   • the prompt is audited even when retrieval or the LLM later fails
  //   • the daily quota counts immediately (no abort-the-stream bypass)
  //   • concurrent requests cannot race past the limit (advisory lock)
  //   • crossing 80% of the daily limit streams a soft warning banner
  // Finalised with the AI answer + metering once the stream completes.
  const admission = await admitQueryEvent({
    orgId, kbId, queryText: query, sessionId,
    userId: authCtx?.user.id ?? null, surface: "workspace",
  });
  if (!admission.admitted) {
    return admissionDeniedResponse(admission);
  }
  const eventId = admission.eventId;
  const quotaWarning = admission.warning;""".split("\n")

# The replaced range: from the comment line right above a1? No — a1 IS the
# "Plan limit" comment. Replace from a1 through a_end.
splice(a1, a_end, new_block)
print("ok: mode A admission")

# ── 3. Mode A stream: emit the 80% soft warning after sources event ─────────
s_src = find_idx(lambda l: l.strip() == 'write({ type: "sources", payload: sources });')
eol = eol_of(s_src)
insert_lines = [
    "",
    "      // WS-1.2: 80% soft warning — the client renders a dismissible banner.",
    "      if (quotaWarning) {",
    '        write({ type: "quota_warning", payload: quotaWarning });',
    "      }",
]
for offset, text in enumerate(insert_lines, start=1):
    lines.insert(s_src + offset, text + eol)
print("ok: mode A quota_warning event")

with open(PATH, "wb") as f:
    f.write("\n".join(lines).encode("utf-8"))
print("chat.ts Mode A quota admission wired")
