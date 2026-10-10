#!/usr/bin/env python3
"""Insert Phase 6.4 upload rate limit into documents.ts (CRLF-safe binary edit)."""
import os

os.chdir("/home/z/my-project/Clara-AI-Platform")
path = "src/modules/knowledge-bases/api/documents.ts"
with open(path, "rb") as f:
    content = f.read()

# 1. Add the rate-limit import after the plan-guard import line.
import_old = 'import { planGuard, planLimitResponse } from "@/lib/plan-guard";'.encode("utf-8")
idx = content.find(import_old)
assert idx != -1, "import anchor not found"
nl = b"\r\n" if b"\r\n" in content[idx:idx + 200] else b"\n"
import_new = import_old + nl + 'import { hit, rateLimitResponse, UPLOAD_RATE } from "@/lib/rate-limit";'.encode("utf-8")
assert content.count(import_old) == 1
content = content.replace(import_old, import_new)

# 2. Insert the upload rate limit after orgId resolution in uploadDocumentsHandler.
old = "    const orgId = orgRows[0]?.org_id ?? null;\n".encode("utf-8")
new = """    const orgId = orgRows[0]?.org_id ?? null;

    // ── Phase 6.4: upload rate limit (10 req / min / org) ──────────────────
    // Applied per request (not per file) BEFORE parsing the multipart body,
    // so oversized bursts never reach formData() or plan-limit queries.
    {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip") ?? "unknown";
      const gate = hit(`upload:${orgId ? `org:${orgId}` : `ip:${ip}`}`, UPLOAD_RATE.limit, UPLOAD_RATE.windowMs);
      if (!gate.allowed) {
        const rl = rateLimitResponse(gate.retryAfterSec, "Upload request limit reached. Please try again shortly.");
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }
""".encode("utf-8")

i = content.find(old)
assert i != -1, "orgId anchor not found"
site_nl = b"\r\n" if b"\r\n" in content[max(0, i - 50):i + 300] else b"\n"
new_block = new.replace(b"\n", site_nl)
print("site newline:", site_nl, "occurrences of old:", content.count(old))
assert content.count(old) == 1
content = content.replace(old, new_block)

with open(path, "wb") as f:
    f.write(content)
print("documents.ts patched OK")
