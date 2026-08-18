/**
 * src/modules/knowledge-bases/core/config-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes the full AI session system prompt from a KB's AssistantConfig row.
 * Runs server-side only — the raw config is never exposed to the browser bundle.
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
  /**
   * Surface this prompt is for.
   * - "realtime" / "voice" (default): registers rag_search tool — must call it
   * - "embed": RAG context already injected — do NOT output tool-call text
   */
  surface?: "embed" | "realtime" | "voice" | "chat";
};

/**
 * Builds the complete system prompt string for an AI session.
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

  // Tool-use instruction — only for realtime/voice surface where rag_search is actually registered.
  // Embed chat pre-injects context into the system message, so no tool call is needed there.
  if (ctx.surface !== "embed") {
    parts.push(
      "IMPORTANT: You MUST call the rag_search function before answering ANY user question. " +
      "Do not answer from general knowledge. Always call rag_search first, wait for the result, " +
      "then answer based only on what was returned. " +
      "Never fabricate information that is not present in the retrieved context."
    );
  } else {
    parts.push(
      "IMPORTANT: You MUST answer using the retrieved knowledge-base context provided above. " +
      "Do not answer factual policy questions from general knowledge. " +
      "Treat a broad or naturally worded question as in-scope when the retrieved passages contain " +
      "related facts. Synthesize the relevant passages instead of refusing merely because there is " +
      "no exact phrase match. If several passages cover different products or coverage areas, give a " +
      "useful concise summary and ask which area the user wants to explore. " +
      "Never fabricate information that is not present in the retrieved context."
    );
  }

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
      "Strict mode is ON. Use it as a knowledge-safety rule, not as a trigger for refusing broad questions. " +
      "If retrieved context contains relevant information, answer the user's question from that context even " +
      "when the wording is broad, abbreviated, contains spelling mistakes, or does not exactly match a source. " +
      "If the user asks a clearly in-domain but ambiguous question, ask a short clarification or provide a " +
      "brief summary of the relevant retrieved information. " +
      "Only when the question is genuinely outside the assistant's configured domain OR there is no relevant " +
      "knowledge-base information should you refuse. For a genuinely out-of-scope request, say exactly: " +
      `"${config.outOfScopeReply}"`
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
    "For a broad in-domain question, give the most useful answer supported by the " +
    "retrieved material instead of repeating the out-of-scope message."
  );

  // ── 8. Embed-specific UX override ─────────────────────────────────────────
  if (ctx.surface === "embed") {
    parts.push(
      "Respond directly and completely to the user's question using only the provided knowledge-base context. " +
      "Do not mention 'retrieval', 'documents', 'RAG', 'context', or any internal process. " +
      "Never output '[Calling rag_search...]' or any function-call text. " +
      "Speak like a knowledgeable human expert. Keep answers clear, accurate and complete. " +
      "If the question is broad but related to the configured insurance domain, summarize the relevant coverage " +
      "facts from the supplied snippets and invite the user to narrow down the policy type if needed."
    );
  }

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
