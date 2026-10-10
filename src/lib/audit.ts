import crypto from "crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-contract";

/**
 * WS-1.4 Audit logging of prompts and answers (plan §3.4).
 *
 * Every user prompt and every AI-generated answer is a first-class immutable
 * fact: the row captures actor, org, agent, KB, conversation, full text,
 * model, tokens, a redaction list of what was masked, and a tamper-evident
 * hash chain — each row hashes its content together with the previous row's
 * hash, so any after-the-fact modification breaks the chain visibly.
 */

export type AuditAction = "PROMPT" | "ANSWER" | "CONFIG" | "BILLING" | "REVEAL";

export type Redaction = {
  field: "promptText" | "answerText";
  type: "email" | "phone" | "card";
  original: string; // kept in the reveal vault, never rendered raw
};

// --------------------------------------------------------------------------
// PII redaction — masks emails, phone numbers, payment identifiers by default
// --------------------------------------------------------------------------
const PATTERNS: { type: Redaction["type"]; re: RegExp }[] = [
  { type: "email", re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g },
  { type: "phone", re: /(?:\+91[-\s]?|0)?[6-9]\d{9}\b|\+\d{1,3}[-\s]?\d{7,12}/g },
  { type: "card", re: /\b(?:\d[ -]*?){13,16}\b/g },
];

export function redactText(
  text: string,
  field: Redaction["field"]
): { text: string; redactions: Redaction[] } {
  let out = text;
  const redactions: Redaction[] = [];
  for (const { type, re } of PATTERNS) {
    out = out.replace(re, (match) => {
      const masked = match.replace(/[a-zA-Z0-9]/g, (ch, i) =>
        i < Math.min(2, Math.floor(match.length / 4)) ? ch : "*"
      );
      redactions.push({ field, type, original: match });
      return masked;
    });
  }
  return { text: out, redactions };
}

// --------------------------------------------------------------------------
// Hash chain — rowHash = sha256(seq | prevHash | canonical fields)
// --------------------------------------------------------------------------
export function canonicalRow(r: {
  seq: number;
  prevHash: string;
  orgId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  agentId?: string | null;
  kbId?: string | null;
  conversationId?: string | null;
  promptText?: string | null;
  answerText?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  redactions?: string | null;
  revealOfId?: string | null;
  justification?: string | null;
  createdAt: Date;
}): string {
  return [
    r.seq,
    r.prevHash,
    r.orgId,
    r.actorUserId,
    r.actorRole,
    r.action,
    r.agentId ?? "",
    r.kbId ?? "",
    r.conversationId ?? "",
    r.promptText ?? "",
    r.answerText ?? "",
    r.model ?? "",
    r.promptTokens ?? 0,
    r.completionTokens ?? 0,
    r.redactions ?? "[]",
    r.revealOfId ?? "",
    r.justification ?? "",
    r.createdAt.toISOString(),
  ].join("\u241f");
}

export function rowHash(canonical: string): string {
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const GENESIS = "0".repeat(64);

export type AuditInput = {
  orgId: string;
  actorUserId: string;
  actorRole: string;
  action: AuditAction;
  agentId?: string | null;
  kbId?: string | null;
  conversationId?: string | null;
  promptText?: string | null;
  answerText?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  revealOfId?: string | null;
  justification?: string | null;
  /** tx handle so the write shares the transaction that persists the message */
  tx?: PrismaTx;
};

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Append one hash-chained audit row. Runs inside the caller's transaction
 * when `tx` is provided — an answer can never exist unlogged.
 */
export async function appendAudit(input: AuditInput) {
  const client = input.tx ?? db;
  const last = await client.auditLog.findFirst({
    orderBy: { seq: "desc" },
    select: { seq: true, rowHash: true },
  });
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.rowHash ?? GENESIS;
  const createdAt = new Date();

  const redactionList: Redaction[] = [];
  let promptText = input.promptText ?? null;
  let answerText = input.answerText ?? null;
  if (promptText) {
    const r = redactText(promptText, "promptText");
    promptText = r.text;
    redactionList.push(...r.redactions);
  }
  if (answerText) {
    const r = redactText(answerText, "answerText");
    answerText = r.text;
    redactionList.push(...r.redactions);
  }

  const canonical = canonicalRow({
    seq,
    prevHash,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: input.action,
    agentId: input.agentId ?? null,
    kbId: input.kbId ?? null,
    conversationId: input.conversationId ?? null,
    promptText,
    answerText,
    model: input.model ?? null,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    redactions: JSON.stringify(
      redactionList.map(({ field, type }) => ({ field, type }))
    ),
    revealOfId: input.revealOfId ?? null,
    justification: input.justification ?? null,
    createdAt,
  });

  return client.auditLog.create({
    data: {
      seq,
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      agentId: input.agentId ?? null,
      kbId: input.kbId ?? null,
      conversationId: input.conversationId ?? null,
      promptText,
      answerText,
      model: input.model ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      redactions: JSON.stringify(
        redactionList.map(({ field, type }) => ({ field, type }))
      ),
      vault: JSON.stringify(redactions),
      revealOfId: input.revealOfId ?? null,
      justification: input.justification ?? null,
      prevHash,
      rowHash: rowHash(canonical),
      createdAt,
    },
  });
}

// --------------------------------------------------------------------------
// Chain verification — recomputes every hash and reports integrity loudly.
// --------------------------------------------------------------------------
export async function verifyChain() {
  const rows = await db.auditLog.findMany({ orderBy: { seq: "asc" } });
  let prevHash = GENESIS;
  let checked = 0;
  let firstBreak: { seq: number; id: string; reason: string } | null = null;

  for (const r of rows) {
    const expected = rowHash(
      canonicalRow({
        seq: r.seq,
        prevHash,
        orgId: r.orgId,
        actorUserId: r.actorUserId,
        actorRole: r.actorRole,
        action: r.action,
        agentId: r.agentId,
        kbId: r.kbId,
        conversationId: r.conversationId,
        promptText: r.promptText,
        answerText: r.answerText,
        model: r.model,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        redactions: r.redactions,
        revealOfId: r.revealOfId,
        justification: r.justification,
        createdAt: r.createdAt,
      })
    );
    if (r.prevHash !== prevHash) {
      firstBreak = {
        seq: r.seq,
        id: r.id,
        reason: `prevHash linkage broken at seq ${r.seq}: expected ${prevHash.slice(0, 12)}…, found ${r.prevHash.slice(0, 12)}…`,
      };
      break;
    }
    if (r.rowHash !== expected) {
      firstBreak = {
        seq: r.seq,
        id: r.id,
        reason: `rowHash mismatch at seq ${r.seq}: content was modified after the fact`,
      };
      break;
    }
    prevHash = r.rowHash;
    checked += 1;
  }

  return {
    ok: rows.length > 0 && !firstBreak,
    checked,
    total: rows.length,
    firstBreak,
    verifiedAt: new Date().toISOString(),
  };
}

// --------------------------------------------------------------------------
// Recorded reveal — platform admins with a justification can see the
// original text; the reveal itself is audited.
// --------------------------------------------------------------------------
export async function revealAuditRow(
  auditRowId: string,
  adminUserId: string,
  justification: string
) {
  if (!justification || justification.trim().length < 10) {
    throw new ApiError(
      422,
      "JUSTIFICATION_REQUIRED",
      "A recorded justification of at least 10 characters is required to reveal redacted content.",
      { fields: { justification: "Provide the reason for this reveal (ticket ID, case…)." } }
    );
  }
  const row = await db.auditLog.findUnique({ where: { id: auditRowId } });
  if (!row) throw new ApiError(404, "AUDIT_ROW_NOT_FOUND", "Audit row not found.");

  const reveal = await appendAudit({
    orgId: row.orgId,
    actorUserId: adminUserId,
    actorRole: "platform_admin",
    action: "REVEAL",
    revealOfId: row.id,
    justification: justification.trim(),
    promptText: null,
    answerText: null,
  });

  const vault = JSON.parse(row.vault || "[]") as Redaction[];
  return {
    revealId: reveal.id,
    originals: vault,
    promptText: row.promptText,
    answerText: row.answerText,
  };
}
