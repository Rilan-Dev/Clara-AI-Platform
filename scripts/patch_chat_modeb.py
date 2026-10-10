#!/usr/bin/env python3
"""WS-1.2 wiring for chat.ts Mode B (legacy document chat): quota + audit."""

PATH = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts"

with open(PATH, "rb") as f:
    raw = f.read().decode("utf-8")

lines = raw.split("\n")

def find_idx(predicate, start=0, occurrence=1):
    seen = 0
    for i in range(start, len(lines)):
        if predicate(lines[i]):
            seen += 1
            if seen == occurrence:
                return i
    raise SystemExit(f"anchor not found (occurrence {occurrence})")

def eol_of(i: int) -> str:
    return "\r" if lines[i].endswith("\r") else ""

# ── 1. Mode B: admission after the document lookup ──────────────────────────
doc_line = find_idx(lambda l: l.strip().startswith("const documentRecord = await getDocumentById"))
notavail = find_idx(lambda l: '"The requested document is not available."' in l, doc_line)
eol = eol_of(doc_line)

mode_b_block = """
    // ── WS-1.2: close the Mode-B bypass ────────────────────────────────────
    // Legacy document-scoped chat previously skipped BOTH the daily request
    // quota and the query audit trail — an enforcement hole. Workspace chat
    // is authenticated, so the caller's org membership supplies quota
    // attribution; the audit row is inserted with kb_id NULL (legacy
    // documents live in the Qdrant catalog, not in knowledge_bases).
    const modeBAuth = await getAuthContext(request).catch(() => null);
    let modeBOrgId: string | null = null;
    if (modeBAuth && !modeBAuth.user.isSuperAdmin) {
      const modeBOrgRows = await dbQuery<{ org_id: string }>(
        `SELECT om.org_id FROM org_members om WHERE om.user_id = $1 ORDER BY om.created_at ASC LIMIT 1`,
        [modeBAuth.user.id]
      );
      modeBOrgId = modeBOrgRows[0]?.org_id ?? null;
    }
    const modeBAdmission = await admitQueryEvent({
      orgId: modeBOrgId,
      kbId: null,
      queryText: latest.content,
      userId: modeBAuth?.user.id ?? null,
      surface: "workspace",
    });
    if (!modeBAdmission.admitted) {
      return admissionDeniedResponse(modeBAdmission);
    }
    const modeBEventId = modeBAdmission.eventId;
    const modeBQuotaWarning = modeBAdmission.warning;
""".strip("\n").split("\n")

for offset, text in enumerate(mode_b_block, start=1):
    lines.insert(notavail + offset, text + eol)
print("ok: mode B admission")

# ── 2. Mode B fallback stream: warning + finalize ───────────────────────────
# The fallback block emits: document → sources → token(friendlyFallback) → done
fallback_token = find_idx(lambda l: "emit the entire fallback as a single token event" in l)
eol = eol_of(fallback_token)

# quota_warning right after the sources event of the fallback block
fb_sources = find_idx(lambda l: l.strip() == 'writeEvent({ type: "sources", payload: retrieved });',
                      start=fallback_token - 12, occurrence=1)
lines.insert(fb_sources + 1, "" + eol)
lines.insert(fb_sources + 2, "          // WS-1.2: 80% soft warning banner." + eol)
lines.insert(fb_sources + 3, "          if (modeBQuotaWarning) {" + eol)
lines.insert(fb_sources + 4, '            writeEvent({ type: "quota_warning", payload: modeBQuotaWarning });' + eol)
lines.insert(fb_sources + 5, "          }" + eol)

# finalize before the fallback's done event (recompute positions after inserts)
fb_token_call = find_idx(lambda l: l.strip() == 'writeEvent({ type: "token", payload: friendlyFallback });',
                         start=fallback_token)
lines.insert(fb_token_call + 1, "          // WS-1.2: audit the fallback answer too." + eol)
lines.insert(fb_token_call + 2, "          void finalizeQueryEvent(modeBEventId, { answerText: friendlyFallback, status: \"ok\" });" + eol)
print("ok: mode B fallback finalize")

# ── 3. Mode B normal stream: error flag, warning, finalize with metering ────
nb_start = find_idx(lambda l: l.strip() == "let streamedAny = false;")
eol = eol_of(nb_start)
lines.insert(nb_start + 1, "          let streamFailed = false;" + eol)

# catch block: set the flag (the catch writes the error event)
nb_catch = find_idx(lambda l: "console.error(\"[chat] streaming error:\"" in l, start=nb_start)
lines.insert(nb_catch, "            streamFailed = true;" + eol)
print("ok: mode B error flag")

# quota_warning after the sources event of the normal block (the sources
# event sits a few lines BEFORE the async IIFE that defines nb_start)
nb_sources = find_idx(lambda l: l.strip() == 'writeEvent({ type: "sources", payload: retrieved });',
                      start=nb_start - 20)
lines.insert(nb_sources + 1, "" + eol)
lines.insert(nb_sources + 2, "          // WS-1.2: 80% soft warning banner." + eol)
lines.insert(nb_sources + 3, "          if (modeBQuotaWarning) {" + eol)
lines.insert(nb_sources + 4, '            writeEvent({ type: "quota_warning", payload: modeBQuotaWarning });' + eol)
lines.insert(nb_sources + 5, "          }" + eol)

# finalize in the finally block
nb_finally = find_idx(lambda l: l.strip() == "} finally {", start=nb_start)
done_line = find_idx(lambda l: l.strip() == 'writeEvent({ type: "done" });', start=nb_finally)
finalize_block = [
    "            // WS-1.2 + WS-1.1: audit the answer + record token metering",
    "            // for the legacy path (previously neither was captured).",
    "            void finalizeQueryEvent(modeBEventId, {",
    "              answerText: bufferedAnswer,",
    '              status: streamFailed ? "error" : "ok",',
    "              metering: usageRef.value",
    "                ? {",
    "                    model: provider.getModelName(\"chat\"),",
    "                    provider: provider.getProviderName(),",
    "                    promptTokens: usageRef.value.promptTokens,",
    "                    completionTokens: usageRef.value.completionTokens,",
    "                  }",
    "                : null,",
    "            });",
]
for offset, text in enumerate(finalize_block, start=0):
    lines.insert(done_line + offset, text + eol)
print("ok: mode B finalize with metering")

with open(PATH, "wb") as f:
    f.write("\n".join(lines).encode("utf-8"))
print("chat.ts Mode B bypass closed")
