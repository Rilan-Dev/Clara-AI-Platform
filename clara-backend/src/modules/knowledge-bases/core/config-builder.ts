/**
 * src/modules/knowledge-bases/core/config-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes the full OpenAI Realtime session system prompt from a KB's
 * AssistantConfig row. Runs server-side only — the raw config is never
 * exposed to the browser bundle.
 *
 * The resulting prompt has five layers:
 *   1. Identity       — who the assistant is and who it serves
 *   2. Knowledge Base — which KB it has access to and how many documents
 *   3. Behaviour Rules— enumerated plain-English rules from config.rules[]
 *   4. Language       — output-language policy
 *   5. Strict mode    — refuse / redirect out-of-scope questions
 */

import type { AssistantConfig } from "./models";
import { describeLanguage } from "@/modules/assistant/core/config";

export type SessionPromptContext = {
  /** KB display name, e.g. "HR Policy Docs" */
  kbName: string;
  /** Organisation name, e.g. "Acme Corp" */
  orgName?: string;
  /** Number of documents currently indexed in the KB */
  documentCount?: number;
  /** Titles of indexed documents (shown in prompt so model knows what exists) */
  documentTitles?: string[];
};

/**
 * Builds the complete system prompt string for an OpenAI Realtime session.
 *
 * @param config   The AssistantConfig row for this KB
 * @param ctx      Runtime context (KB name, org name, doc list)
 * @returns        Full system prompt string ready to pass to the API
 */
export function buildSystemPrompt(
  config: AssistantConfig,
  ctx: SessionPromptContext
): string {
  const parts: string[] = [];

  // ── 1. Identity ────────────────────────────────────────────────────────────
  const orgPhrase = ctx.orgName ? ` for ${ctx.orgName}` : "";
  parts.push(
    `You are ${config.assistantName}, a voice assistant${orgPhrase}.`
  );

  if (config.systemPrompt.trim()) {
    parts.push(config.systemPrompt.trim());
  }

  // ── 2. Knowledge Base scope ────────────────────────────────────────────────
  if (ctx.documentCount !== undefined && ctx.documentCount > 0) {
    parts.push(
      `You have access to the "${ctx.kbName}" knowledge base, which contains ` +
      `${ctx.documentCount} document${ctx.documentCount === 1 ? "" : "s"}.`
    );
  } else {
    parts.push(`You have access to the "${ctx.kbName}" knowledge base.`);
  }

  if (ctx.documentTitles && ctx.documentTitles.length > 0) {
    parts.push(
      "The indexed documents are:\n" +
      ctx.documentTitles.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
    );
  }

  // Explicit tool-use instruction — without this the realtime model answers
  // from general knowledge instead of calling rag_search.
  parts.push(
    "IMPORTANT: You MUST call the rag_search function before answering ANY user question. " +
    "Do not answer from general knowledge. Always call rag_search first, wait for the result, " +
    "then answer based only on what was returned. " +
    "Never fabricate information that is not present in the retrieved context."
  );

  // ── 3. Behaviour Rules ─────────────────────────────────────────────────────
  if (config.rules.length > 0) {
    parts.push("Behaviour rules — follow these strictly:");
    config.rules.forEach((rule, i) => {
      parts.push(`  ${i + 1}. ${rule}`);
    });
  }

  // ── 4. Language policy ─────────────────────────────────────────────────────
  if (config.alwaysRespondIn) {
    const lang = describeLanguage(config.alwaysRespondIn);
    parts.push(`Always respond in ${lang}, regardless of the language the user speaks.`);
  } else {
    const defaultLang = describeLanguage(config.defaultLanguage);
    parts.push(`Default response language: ${defaultLang}.`);

    if (config.allowedLanguages.length > 1) {
      const others = config.allowedLanguages
        .filter((l) => l !== config.defaultLanguage)
        .map(describeLanguage)
        .join(", ");
      parts.push(
        `You may also respond in: ${others}. ` +
        `Mirror the language the user is speaking, then guide the conversation ` +
        `back to ${defaultLang} if they switch away.`
      );
    }
  }

  // ── 5. Strict mode / out-of-scope handling ─────────────────────────────────
  if (config.strictMode) {
    parts.push(
      "Strict mode is ON. If a question cannot be answered from the documents " +
      "in this knowledge base, do NOT speculate or use general knowledge. " +
      `Instead, say exactly: "${config.outOfScopeReply}"`
    );
  } else {
    parts.push(
      `If a question is outside this knowledge base, acknowledge it and reply: ` +
      `"${config.outOfScopeReply}"`
    );
  }

  // ── 6. Source citation ─────────────────────────────────────────────────────
  if (config.citeSources) {
    parts.push(
      "When your answer draws from specific document snippets, append inline " +
      "source references such as [S1], [S2] at the end of the relevant sentence."
    );
  }

  // ── 7. Voice UX guidance ──────────────────────────────────────────────────
  parts.push(
    "You are speaking aloud in real time. " +
    "Keep answers concise, warm, and conversational. " +
    "Do not mention 'retrieval', 'documents', 'RAG', or 'context' — speak like " +
    "a well-briefed human expert, not a search engine. " +
    "Remember: always call rag_search before every answer, without exception."
  );

  return parts.join("\n\n");
}

/**
 * Builds the language-guidance fragment used by the client hook's session.update.
 * Kept separate so it can be updated per-session without the full system prompt.
 */
export function buildLanguageGuidanceFromConfig(config: AssistantConfig): {
  session: string;
  follow: string;
} {
  const primary = describeLanguage(config.defaultLanguage);
  const adapt =
    "If the user switches languages, mirror them briefly, then guide the " +
    `conversation back to ${primary}.`;

  const session = config.alwaysRespondIn
    ? `Always respond in ${describeLanguage(config.alwaysRespondIn)}.`
    : [`Default to ${primary}.`, adapt].join(" ");

  const follow = config.alwaysRespondIn
    ? `Continue in ${describeLanguage(config.alwaysRespondIn)}.`
    : [`When expanding on an answer, continue in ${primary} unless the user requests otherwise.`, adapt].join(" ");

  return { session, follow };
}
