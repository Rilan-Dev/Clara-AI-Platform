#!/usr/bin/env node
/**
 * patch_chat_audit.mjs — wire plan-limit guard + Q&A audit into
 * src/modules/assistant/api/chat.ts (file uses CRLF line endings, so the
 * standard Edit tool can't match its content reliably).
 *
 * Idempotent: skips any block that is already present.
 */
import fs from "node:fs";

const FILE = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts";
let src = fs.readFileSync(FILE, "utf8");

/** Convert an LF-written snippet to CRLF style. */
const crlf = (s) => s.replace(/\r?\n/g, "\r\n");

function apply(name, find, replace) {
  // Mixed line endings in this file — try the LF form first, then CRLF.
  for (const variant of [
    { f: find, r: replace },
    { f: crlf(find), r: crlf(replace) },
  ]) {
    if (src.includes(variant.r)) {
      console.log(`✓ ${name}: already applied`);
      return;
    }
  }
  for (const variant of [
    { f: find, r: replace },
    { f: crlf(find), r: crlf(replace) },
  ]) {
    const first = src.indexOf(variant.f);
    if (first === -1) continue;
    if (src.indexOf(variant.f, first + 1) !== -1) {
      console.error(`✗ ${name}: pattern NOT UNIQUE (lf=${variant.f === find})`);
      process.exitCode = 1;
      return;
    }
    src = src.slice(0, first) + variant.r + src.slice(first + variant.f.length);
    console.log(`✓ ${name}: patched (${variant.f === find ? "LF" : "CRLF"})`);
    return;
  }
  console.error(`✗ ${name}: pattern NOT FOUND`);
  process.exitCode = 1;
}

// ── 0. Imports + signature: request into postChatKb, query from lib/db ───────
apply(
  "imports",
  `import { ensureMigrated } from "@/lib/db/migrate";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { planGuard } from "@/lib/plan-guard";`,
  `import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { planGuard } from "@/lib/plan-guard";`
);

apply(
  "postChatKb signature",
  `async function postChatKb(
  kbId: string,
  messages: ClientMessage[],
  body: Record<string, unknown>
): Promise<NextResponse> {`,
  `async function postChatKb(
  request: NextRequest,
  kbId: string,
  messages: ClientMessage[],
  body: Record<string, unknown>
): Promise<NextResponse> {`
);

apply(
  "postChatKb call site",
  `    if (kbId) {
      return await postChatKb(kbId, messages, body);
    }`,
  `    if (kbId) {
      return await postChatKb(request, kbId, messages, body);
    }`
);

// ── 1. Plan guard + audit context after the KB status check ──────────────────
apply(
  "plan-guard block",
  `  const query = latest.content;
  const retrievalQuery = buildConversationAwareSearchQuery(messages, query);`,
  `  // ── Plan limit: daily request quota (org-wide, rolling 24h) ─────────────
  // Enforced BEFORE any retrieval/LLM work so over-limit orgs cost nothing.
  const orgRows = await query<{ org_id: string }>(
    \`SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1\`,
    [kbId]
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
  }

  // Audit context — workspace chat is authenticated; the question is still
  // logged for anonymous surfaces (user_id NULL).
  const authCtx = await getAuthContext(request).catch(() => null);

  const query = latest.content;
  const retrievalQuery = buildConversationAwareSearchQuery(messages, query);`
);

// ── 2. logQueryEvent call → full audit context + event id ────────────────────
apply(
  "logQueryEvent call",
  `  // Analytics (fire-and-forget)
  void logQueryEvent({ kbId, queryText: query, sourceCount: results.length, latencyMs, sessionId });`,
  `  // Analytics + audit trail. Inserted at request time with status='pending'
  // (counts toward the daily quota immediately), finalised with the AI answer
  // once the stream completes.
  const eventId = await logQueryEvent({
    kbId, queryText: query, sourceCount: results.length, latencyMs, sessionId,
    orgId, userId: authCtx?.user.id ?? null, surface: "workspace",
  });`
);

// ── 3. Stream loop → buffer the answer + finalize ────────────────────────────
apply(
  "stream answer capture",
  `        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
          });
          for await (const delta of completionStream) {
            if (delta) write({ type: "token", payload: delta });
          }
        } catch (err) {
          write({ type: "error", payload: (err as Error).message });
        } finally {
          write({ type: "done" });
          controller.close();
        }`,
  `        let answerBuffer = "";
        let streamError: string | null = null;
        const streamT0 = Date.now();
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
          });
          for await (const delta of completionStream) {
            if (delta) {
              answerBuffer += delta;
              write({ type: "token", payload: delta });
            }
          }
        } catch (err) {
          streamError = (err as Error).message;
          write({ type: "error", payload: streamError });
        } finally {
          // Persist the AI-generated answer for the platform audit trail.
          void finalizeQueryEvent(eventId, {
            answerText: answerBuffer,
            status: streamError ? "error" : "ok",
            latencyMs: Date.now() - streamT0,
          });
          write({ type: "done" });
          controller.close();
        }`
);

fs.writeFileSync(FILE, src, "utf8");
console.log("saved:", FILE);
