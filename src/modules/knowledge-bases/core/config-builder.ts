/**
 * src/modules/knowledge-bases/core/config-builder.ts
 *
 * Server-side builder for the assistant system prompt.
 */

import type { AssistantConfig } from "./models";
import {
  buildLanguageGuidance,
  describeLanguage,
  resolveLanguagePreferences,
} from "@/modules/assistant/core/config";

export type SessionPromptContext = {
  kbName: string;
  orgName?: string;
  documentCount?: number;
  documentTitles?: string[];
  surface?: "embed" | "realtime" | "voice" | "chat";
  /** Project-level language allowlist. When present it is authoritative. */
  allowedLanguages?: string[];
};

export function buildSystemPrompt(
  config: AssistantConfig,
  ctx: SessionPromptContext,
): string {
  const parts: string[] = [];
  const orgPhrase = ctx.orgName ? ` for ${ctx.orgName}` : "";
  parts.push(`You are ${config.assistantName}, a voice assistant${orgPhrase}.`);

  if (config.systemPrompt.trim()) parts.push(config.systemPrompt.trim());

  if (ctx.documentCount !== undefined && ctx.documentCount > 0) {
    parts.push(
      `You have access to the "${ctx.kbName}" knowledge base, which contains ${ctx.documentCount} document${ctx.documentCount === 1 ? "" : "s"}.`,
    );
  } else {
    parts.push(`You have access to the "${ctx.kbName}" knowledge base.`);
  }

  if (ctx.documentTitles?.length) {
    parts.push(
      "The indexed documents are:\n" +
        ctx.documentTitles.map((title, index) => `  ${index + 1}. ${title}`).join("\n"),
    );
  }

  if (ctx.surface !== "embed") {
    parts.push(
      "IMPORTANT: You MUST call the rag_search function before answering ANY user question. " +
        "Do not answer from general knowledge. Always call rag_search first, wait for the result, then answer based only on what was returned. " +
        "Never fabricate information that is not present in the retrieved context.",
    );
  } else {
    parts.push(
      "IMPORTANT: You MUST answer using the retrieved knowledge-base context provided above. " +
        "Do not answer factual policy questions from general knowledge. Treat a broad or naturally worded question as in-scope when the retrieved passages contain related facts. " +
        "Synthesize the relevant passages instead of refusing merely because there is no exact phrase match. " +
        "For broad questions that match multiple products or coverage areas, ALWAYS give a useful summary of the relevant retrieved facts FIRST. " +
        "Do not ask the user to choose a policy type before answering. A follow-up question may be offered only AFTER the answer if it would help narrow the discussion. " +
        "Never fabricate information that is not present in the retrieved context.",
    );
  }

  if (config.rules.length > 0) {
    parts.push("Behaviour rules — follow these strictly:");
    config.rules.forEach((rule, index) => parts.push(`  ${index + 1}. ${rule}`));
  }

  // A project assignment is a hard tenant boundary. Assistant-level language
  // preferences can narrow it, but can never add a language to the project.
  const projectLanguages = (ctx.allowedLanguages ?? [])
    .map((language) => language.trim())
    .filter(Boolean);
  const customerLanguages = projectLanguages.length > 0 ? projectLanguages : config.allowedLanguages;
  const languagePreferences = resolveLanguagePreferences({
    assistant: config.alwaysRespondIn ?? config.defaultLanguage,
    customer: customerLanguages,
  });
  const languageGuidance = buildLanguageGuidance(languagePreferences);
  const configuredLanguages = projectLanguages.length > 0
    ? projectLanguages.map(describeLanguage).join(", ")
    : languagePreferences.customer.map(describeLanguage).join(", ");

  if (config.alwaysRespondIn && languagePreferences.assistant) {
    const forcedLanguage = describeLanguage(languagePreferences.assistant);
    parts.push(
      `Language policy: Always respond in ${forcedLanguage}. ` +
        `The project only permits these output languages: ${configuredLanguages}. ` +
        "Never speak, switch, or translate into a language outside this project allowlist. " +
        "If the user speaks or requests an unsupported language, continue in the configured allowed language instead. " +
        "Do not switch output language unless the project configuration is changed.",
    );
  } else {
    parts.push(
      `Language policy: ${languageGuidance.session} ` +
        `The project only permits these output languages: ${configuredLanguages}. ` +
        "Never speak, switch, or translate into a language outside this project allowlist. " +
        "If the user speaks or requests an unsupported language, respond in the project's default allowed language instead.",
    );
  }

  if (config.strictMode) {
    parts.push(
      "Strict mode is ON. Use it as a knowledge-safety rule, not as a trigger for refusing broad questions. " +
        "If retrieved context contains relevant information, answer the user's question from that context even when the wording is broad, abbreviated, contains spelling mistakes, or does not exactly match a source. " +
        "Only when the question is genuinely outside the assistant's configured domain OR there is no relevant knowledge-base information should you refuse. " +
        `For a genuinely out-of-scope request, say exactly: "${config.outOfScopeReply}"`,
    );
  } else {
    parts.push(`If a question is outside this knowledge base, acknowledge it and reply: "${config.outOfScopeReply}"`);
  }

  if (config.citeSources) {
    parts.push(
      "When your answer draws from specific document snippets, append inline source references such as [S1], [S2] at the end of the relevant sentence.",
    );
  }

  parts.push(
    "You are speaking aloud in real time. Keep answers concise, warm, and conversational. " +
      "Do not mention 'retrieval', 'documents', 'RAG', or 'context' — speak like a well-briefed human expert, not a search engine.",
  );

  if (ctx.surface === "embed") {
    parts.push(
      "PUBLIC VISITOR CHAT RULE: Respond directly to the user's question using only the supplied knowledge-base context. " +
        "Never make the visitor choose a knowledge base, product, policy type, provider, model, or other configuration. " +
        "If the visitor asks a broad question, answer first with the relevant retrieved facts. " +
        "Never output function-call text or mention internal retrieval processes.",
    );
  }

  return parts.join("\n\n");
}

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
    session: config.alwaysRespondIn && preferences.assistant
      ? `Always respond in ${describeLanguage(preferences.assistant)}. Do not switch output language unless this configuration is changed.`
      : guidance.session,
    follow: config.alwaysRespondIn && preferences.assistant
      ? `Continue in ${describeLanguage(preferences.assistant)}.`
      : guidance.follow,
  };
}
