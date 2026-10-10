#!/usr/bin/env python3
"""WS-1.4: mutation audit wiring — KB create/delete, doc upload/delete,
quota-denial events. Fire-and-forget via writeAuditLog (audit_logs table)."""

def patch(path, subs):
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8")
    ok = 0
    for label, old, new in subs:
        matched = False
        for eol in ("\r\n", "\n"):
            old_e = old.replace("\n", eol)
            if old_e in raw:
                if raw.count(old_e) != 1:
                    print(f"WARN: {label} not unique — skipped")
                    matched = True
                    break
                raw = raw.replace(old_e, new.replace("\n", eol))
                print(f"ok: {label}")
                matched = True
                ok += 1
                break
        if not matched:
            print(f"MISS: {label}")
    with open(path, "wb") as f:
        f.write(raw.encode("utf-8"))
    return ok

KBS = "/home/z/my-project/Clara-AI-Platform/src/modules/knowledge-bases/api/kbs.ts"
DOCS = "/home/z/my-project/Clara-AI-Platform/src/modules/knowledge-bases/api/documents.ts"
QUOTA = "/home/z/my-project/Clara-AI-Platform/src/lib/quota-admission.ts"

# ── kbs.ts ────────────────────────────────────────────────────────────────────
patch(KBS, [
    (
        "import",
        'import { planGuard, planLimitResponse } from "@/lib/plan-guard";',
        'import { planGuard, planLimitResponse } from "@/lib/plan-guard";\n'
        'import { writeAuditLog } from "@/modules/auth/core/db";',
    ),
    (
        "create audit",
        """    return NextResponse.json(kb, { status: 201 });""",
        """    // WS-1.4: mutation audit — who created which KB, when.
    void writeAuditLog({
      userId: auth.user.id,
      orgId: agent.orgId,
      action: "kb.create",
      resourceType: "knowledge_base",
      resourceId: kb.id,
      newData: { name: kb.name, agentId },
    }).catch(() => undefined);
    return NextResponse.json(kb, { status: 201 });""",
    ),
    (
        "delete audit",
        """    try { await getQdrantClient().deleteCollection(collectionName); }
    catch (qdrantErr) { console.warn(`[kbs] deleteKb: could not delete Qdrant collection "${collectionName}":`, (qdrantErr as Error).message); }
    return NextResponse.json({ deleted: true });""",
        """    try { await getQdrantClient().deleteCollection(collectionName); }
    catch (qdrantErr) { console.warn(`[kbs] deleteKb: could not delete Qdrant collection "${collectionName}":`, (qdrantErr as Error).message); }
    // WS-1.4: mutation audit — destructive action on tenant content.
    void writeAuditLog({
      userId: auth.user.id,
      orgId: null,
      action: "kb.delete",
      resourceType: "knowledge_base",
      resourceId: kbId,
      newData: { collection: collectionName },
    }).catch(() => undefined);
    return NextResponse.json({ deleted: true });""",
    ),
])

# ── documents.ts ──────────────────────────────────────────────────────────────
patch(DOCS, [
    (
        "import",
        'import { planGuard, planLimitResponse } from "@/lib/plan-guard";',
        'import { planGuard, planLimitResponse } from "@/lib/plan-guard";\n'
        'import { writeAuditLog } from "@/modules/auth/core/db";',
    ),
    (
        "delete audit",
        """    const kb = await getKnowledgeBaseById(kbId);
    if (kb) await deleteDocumentChunks(kb.qdrantCollection, docId);
    await deleteDocument(docId);
    return NextResponse.json({ deleted: true });""",
        """    const kb = await getKnowledgeBaseById(kbId);
    if (kb) await deleteDocumentChunks(kb.qdrantCollection, docId);
    await deleteDocument(docId);
    // WS-1.4: mutation audit — destructive action on tenant content.
    void writeAuditLog({
      userId: auth.user.id,
      orgId: orgIdFor(kbId),
      action: "document.delete",
      resourceType: "document",
      resourceId: docId,
      newData: { kbId, title: doc.title },
    }).catch(() => undefined);
    return NextResponse.json({ deleted: true });""",
    ),
])

# upload audit: insert right before the final success response of the upload
# handler — find the return after job creation. The response shape differs;
# anchor on the errors/results return.
with open(DOCS, "rb") as f:
    docs_raw = f.read().decode("utf-8")

upload_anchor_variants = [
    """    return NextResponse.json({ results: results.map(r => ({ document: r.document, jobId: r.jobId })), errors }, { status: 202 });""",
]
upload_new = """    // WS-1.4: mutation audit — every accepted upload is on record.
    if (results.length > 0) {
      void writeAuditLog({
        userId: auth.user.id,
        orgId,
        action: "document.upload",
        resourceType: "knowledge_base",
        resourceId: kbId,
        newData: {
          accepted: results.map((r) => ({ id: r.document.id, title: r.document.title, size: r.document.fileSize })),
          rejected: errors,
        },
      }).catch(() => undefined);
    }
    return NextResponse.json({ results: results.map(r => ({ document: r.document, jobId: r.jobId })), errors }, { status: 202 });"""

inserted = False
for av in upload_anchor_variants:
    for eol in ("\r\n", "\n"):
        av_e = av.replace("\n", eol)
        if av_e in docs_raw:
            if docs_raw.count(av_e) == 1:
                docs_raw = docs_raw.replace(av_e, upload_new.replace("\n", eol))
                print("ok: upload audit")
                inserted = True
            break
    if inserted:
        break
if not inserted:
    print("MISS: upload audit (anchor not found — check the response shape)")

# helper for org resolution in the delete handler
helper = """

/** Best-effort org resolution for mutation audit rows (kb → agent → org). */
async function orgIdFor(kbId: string): Promise<string | null> {
  try {
    const { query } = await import("@/lib/db");
    const rows = await query<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
      [kbId],
    );
    return rows[0]?.org_id ?? null;
  } catch {
    return null;
  }
}
"""
docs_raw = docs_raw.rstrip("\n") + helper
with open(DOCS, "wb") as f:
    f.write(docs_raw.encode("utf-8"))
print("ok: documents helper appended")

# ── quota-admission.ts: audit 402 denials ─────────────────────────────────────
patch(QUOTA, [
    (
        "import",
        'import { redactText, redactionEntries } from "@/lib/redact";',
        'import { redactText, redactionEntries } from "@/lib/redact";',
    ),
    (
        "denial audit",
        """      // 5. Over the limit → refuse BEFORE any retrieval/LLM spend.
      if (current >= limits.max_req_day) {
        return {""",
        """      // 5. Over the limit → refuse BEFORE any retrieval/LLM spend.
      if (current >= limits.max_req_day) {
        // WS-1.4: the refusal itself is audited (fire-and-forget).
        try {
          const { writeAuditLog } = await import("@/modules/auth/core/db");
          void writeAuditLog({
            orgId,
            action: "quota.denied",
            resourceType: "query_event",
            newData: {
              limitKey: "max_req_day",
              current,
              limit: limits.max_req_day,
              planId: limits.plan_id,
              downgraded: limits.downgraded,
              kbId,
              surface: input.surface ?? "workspace",
            },
          }).catch(() => undefined);
        } catch { /* audit import failure must not affect the refusal */ }
        return {""",
    ),
])

print("mutation audit wiring complete")
