/**
 * src/modules/knowledge-bases/core/config-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes the full AI session system prompt from a KB's AssistantConfig row.
 * Runs server-side only — the raw config is never exposed to the browser bundle.
 */

import type { AssistantConfig } from "./models";
import {
  buildLanguageGuidance,
  describeLanguage,
  resolveLanguagePreferences,
} from "@/modules/assistant/core/config";

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
      "no exact phrase match. " +
      "For broad questions that match multiple products or coverage areas, ALWAYS give a useful " +
      "summary of the relevant retrieved facts FIRST. Do not ask the user to choose a policy type " +
      "before answering. A follow-up question may be offered only AFTER the answer if it would help " +
      "narrow the discussion. " +
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
  // Normalize persisted values before composing the prompt so a stale/invalid
  // DB value cannot silently produce contradictory language instructions.
  const languagePreferences = resolveLanguagePreferences({
    assistant: config.alwaysRespondIn ?? config.defaultLanguage,
    customer: config.allowedLanguages,
  });
  const languageGuidance = buildLanguageGuidance(languagePreferences);

  if (config.alwaysRespondIn) {
    const forcedLanguage = describeLanguage(languagePreferences.assistant);
    parts.push(
      `Language policy: Always respond in ${forcedLanguage}, regardless of the language the user speaks. ` +
      "Do not switch output language unless this configuration is changed."
    );
  } else {
    parts.push(
      `Language policy: ${languageGuidance.session} ` +
      `The configured customer languages are ${languagePreferences.customer.map(describeLanguage).join(", ")}.`
    );
  }

  // ── 5. Strict mode / out-of-scope handling ─────────────────────────────────
  if (config.strictMode) {
    parts.push(
      "Strict mode is ON. Use it as a knowledge-safety rule, not as a trigger for refusing broad questions. " +
      "If retrieved context contains relevant information, answer the user's question from that context even " +
      "when the wording is broad, abbreviated, contains spelling mistakes, or does not exactly match a source. " +
      "If the user asks a clearly in-domain but ambiguous question, DO NOT refuse and DO NOT ask for clarification " +
      "instead of answering. First provide the best concise answer supported by the retrieved information; only " +
      "then ask one optional follow-up question if additional specificity would genuinely help. " +
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
      "PUBLIC VISITOR CHAT RULE: Respond directly to the user's question using only the supplied knowledge-base " +
      "context. Never make the visitor choose a knowledge base, product, policy type, provider, model, or other " +
      "configuration. If the visitor asks a broad question such as 'What does my insurance cover?', answer first " +
      "with the relevant coverage categories and facts present in the retrieved snippets. Do not respond with only " +
      "a clarification question. Do not repeat the configured out-of-scope reply when relevant snippets are present. " +
      "A short follow-up such as 'If you mean a specific policy, I can explain that too' is allowed only after " +
      "giving the useful answer. Never mention 'retrieval', 'documents', 'RAG', 'context', or internal processes. " +
      "Never output '[Calling rag_search...]' or function-call text."
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
  const preferences = resolveLanguagePreferences({
    assistant: config.alwaysRespondIn ?? config.defaultLanguage,
    customer: config.allowedLanguages,
  });
  const guidance = buildLanguageGuidance(preferences);

  return {
    session: config.alwaysRespondIn
      ? `Always respond in ${describeLanguage(preferences.assistant)}. Do not switch output language unless this configuration is changed.`
      : guidance.session,
    follow: config.alwaysRespondIn
      ? `Continue in ${describeLanguage(preferences.assistant)}.`
      : guidance.follow,
  };
}
