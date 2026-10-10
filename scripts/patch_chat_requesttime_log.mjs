#!/usr/bin/env node
/**
 * patch_chat_requesttime_log.mjs — move query-event logging to REQUEST time
 * in chat.ts (audit even when retrieval/LLM fails; quota counts immediately).
 * Ending-agnostic (file mixes CRLF + LF).
 */
import fs from "node:fs";

const FILE = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts";
let src = fs.readFileSync(FILE, "utf8");
const crlf = (s) => s.replace(/\r?\n/g, "\r\n");

function apply(name, find, replace) {
  if (src.includes(replace)) { console.log(`✓ ${name}: already applied`); return; }
  if (src.includes(crlf(replace))) { console.log(`✓ ${name}: already applied (crlf)`); return; }

  // Build a regex that tolerates \r? before every line break — the file mixes
  // CRLF and LF at line granularity.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escapeRe(find).replace(/\\?\n/g, "\\r?\\n"), "m");
  const match = src.match(pattern);
  if (!match) { console.error(`✗ ${name}: NOT FOUND`); process.exitCode = 1; return; }

  // Count occurrences to guarantee uniqueness.
  const all = src.match(new RegExp(pattern.source, "gm"));
  if (all && all.length > 1) { console.error(`✗ ${name}: NOT UNIQUE (${all.length})`); process.exitCode = 1; return; }

  // Detect the dominant line ending of the matched text to keep the
  // replacement consistent with its surroundings.
  const matched = match[0];
  const useCrlf = (matched.match(/\r\n/g) || []).length > (matched.match(/(?<!\r)\n/g) || []).length;
  // Function form — `matched` and `replace` both contain `$` sequences that
  // String.replace would otherwise interpret as replacement patterns.
  src = src.replace(matched, () => (useCrlf ? crlf(replace) : replace));
  console.log(`✓ ${name}: patched (${useCrlf ? "CRLF" : "LF"} dominant)`);
}

apply(
  "request-time logging",
  `  console.log(\`[chat/kb] kbId=\${kbId} query="\${query.slice(0, 100)}"\`);

  // RAG search across the full KB collection
  const providerConfig = toProviderConfig(resolved);
  const results = await searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 6, {
    providerConfig,
  });
  const latencyMs = Date.now() - t0;

  // Analytics + audit trail. Inserted at request time with status='pending'
  // (counts toward the daily quota immediately), finalised with the AI answer
  // once the stream completes.
  const eventId = await logQueryEvent({
    kbId, queryText: query, sourceCount: results.length, latencyMs, sessionId,
    orgId, userId: authCtx?.user.id ?? null, surface: "workspace",
  });`,
  `  console.log(\`[chat/kb] kbId=\${kbId} query="\${query.slice(0, 100)}"\`);

  // Analytics + audit trail. Inserted at REQUEST time with status='pending':
  //   • the prompt is audited even when retrieval or the LLM later fails
  //   • the daily quota counts immediately (no abort-the-stream bypass)
  // Finalised with the AI answer once the stream completes.
  const eventId = await logQueryEvent({
    kbId, queryText: query, sessionId,
    orgId, userId: authCtx?.user.id ?? null, surface: "workspace",
    status: "pending",
  });

  // RAG search across the full KB collection
  const providerConfig = toProviderConfig(resolved);
  let results: Awaited<ReturnType<typeof searchKbEmbedded>>;
  try {
    results = await searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 6, {
      providerConfig,
    });
  } catch (searchErr) {
    // Retrieval failed — mark the audit row as an error, then surface it.
    void finalizeQueryEvent(eventId, {
      answerText: "", status: "error",
      latencyMs: Date.now() - t0,
    });
    throw searchErr;
  }
  const latencyMs = Date.now() - t0;
  void finalizeQueryEvent(eventId, {
    answerText: "", status: "pending", latencyMs, // patch latency, keep pending
  });`
);

fs.writeFileSync(FILE, src, "utf8");
console.log("saved:", FILE);
