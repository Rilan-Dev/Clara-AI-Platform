import type { AssistantConfig } from "./models";
import { buildLanguageGuidance, describeLanguage, resolveLanguagePreferences } from "@/modules/assistant/core/config";

export type SessionPromptContext = { kbName: string; kbDescription?: string | null; orgName?: string; documentCount?: number; documentTitles?: string[]; surface?: "embed" | "realtime" | "voice" | "chat"; allowedLanguages?: string[]; responseLanguage?: string | null };

export function buildSystemPrompt(config: AssistantConfig, ctx: SessionPromptContext): string {
  const parts: string[] = [];
  const orgPhrase = ctx.orgName ? ` for ${ctx.orgName}` : "";
  parts.push(`You are ${config.assistantName}, a voice assistant${orgPhrase}.`);
  if (config.systemPrompt.trim()) parts.push(config.systemPrompt.trim());
  if (ctx.documentCount !== undefined && ctx.documentCount > 0) parts.push(`You have access to the "${ctx.kbName}" knowledge base, which contains ${ctx.documentCount} document${ctx.documentCount === 1 ? "" : "s"}.`); else parts.push(`You have access to the "${ctx.kbName}" knowledge base.`);
  if (ctx.kbDescription?.trim()) parts.push(`Knowledge-base scope and purpose:\n${ctx.kbDescription.trim()}`);
  if (config.welcomeMessage.trim()) parts.push(`Configured visitor welcome/capability guidance:\n${config.welcomeMessage.trim()}`);
  if (ctx.documentTitles?.length) {
    parts.push(
      "The indexed documents are:\n" +
        ctx.documentTitles.map((title, index) => `  ${index + 1}. ${title}`).join("\n"),
    );
  }

  // Clara is a RAG assistant, not a retrieval-error bot. Retrieved evidence is
  // authoritative for factual/domain answers, but retrieval failure must never
  // suppress normal conversation such as greetings, thanks, acknowledgements,
  // or simple conversational follow-ups.
  parts.push(
    "CORE RESPONSE POLICY: Be a natural AI assistant. Use retrieved knowledge-base evidence whenever the user asks a factual or domain-specific question. Never invent domain facts when evidence is missing. If retrieval returns no relevant evidence, do NOT emit a canned topic-restriction sentence. For ordinary conversation (greetings, thanks, pleasantries, acknowledgements, or simple social conversation), respond naturally and briefly even when the knowledge base has no matching passage. For a domain-specific question with no supporting evidence, say clearly that you do not have enough information in the configured knowledge base to answer accurately, then optionally suggest a useful related question. Never mention retrieval, Qdrant, embeddings, providers, models, or internal context to the visitor.",
  );

  if (ctx.surface !== "embed") {
    parts.push("IMPORTANT: Ground factual/domain answers in the Clara knowledge-base context supplied to you. Retrieved passages are the source of truth. If no relevant passages are supplied, do not fabricate an answer.");
  } else {
    parts.push("PUBLIC VISITOR CHAT RULE: Respond directly and naturally. Use supplied knowledge-base context as the source of truth for factual/domain questions. Treat broad or naturally worded questions as in-scope when retrieved passages contain related facts and synthesize those facts instead of refusing because there is no exact phrase match. For ordinary conversation, answer normally. If a factual/domain question has no supporting context, explain that the configured knowledge base does not contain enough information rather than using a generic topic-restriction refusal. Never make the visitor choose a knowledge base, product, policy type, provider, model, or other configuration.");
  }

  if (config.rules.length > 0) { parts.push("Behaviour rules — follow these strictly:"); config.rules.forEach((rule, index) => parts.push(`  ${index + 1}. ${rule}`)); }

  // Managed FAQ (ElevenLabs-style FAQ tab): canonical Q/A pairs ride the
  // assistant config and are injected as a grounded block the assistant
  // should reuse verbatim when the visitor's question matches.
  const faqItems = config.faqItems ?? [];
  if (faqItems.length > 0) {
    const faqBlock = faqItems
      .map((item, index) => `  Q${index + 1}: ${item.question.trim()}\n  A${index + 1}: ${item.answer.trim()}`)
      .join("\n");
    parts.push(
      "Frequently asked questions — when the visitor's question matches one of these (including paraphrases), answer using the canonical answer below, lightly adapted to the conversation:\n" +
        faqBlock,
    );
  }

  const projectLanguages = [...new Set((ctx.allowedLanguages ?? []).map((language) => language.trim().toLowerCase()).filter(Boolean))];
  const hasProjectBoundary = projectLanguages.length > 0;
  const customerLanguages = hasProjectBoundary ? projectLanguages : config.allowedLanguages;
  const realtimeAdaptiveLanguage =
    ctx.surface === "realtime" && projectLanguages.length > 1;
  const requestedAssistantLanguage =
    realtimeAdaptiveLanguage
      ? ctx.responseLanguage ?? config.defaultLanguage
      : config.alwaysRespondIn ?? ctx.responseLanguage ?? config.defaultLanguage;
  const assistantLanguageIsAllowed =
    !hasProjectBoundary ||
    (!!requestedAssistantLanguage &&
      projectLanguages.includes(requestedAssistantLanguage.trim().toLowerCase()));
  const effectiveAssistantLanguage = assistantLanguageIsAllowed
    ? requestedAssistantLanguage
    : projectLanguages[0] ?? "en";
  const languagePreferences = resolveLanguagePreferences({
    assistant: effectiveAssistantLanguage,
    customer: customerLanguages,
  });
  const languageGuidance = buildLanguageGuidance(languagePreferences);
  const configuredLanguages = (hasProjectBoundary ? projectLanguages : languagePreferences.customer)
    .map(describeLanguage)
    .join(", ");
  const forcedLanguage = describeLanguage(languagePreferences.assistant);
  parts.push(
    realtimeAdaptiveLanguage
      ? `Language policy: Default to ${forcedLanguage}, but in realtime voice conversations mirror the customer's spoken language when it is one of the project-approved languages: ${configuredLanguages}. Never switch outside this allowlist. Do not use a translation layer; use the provider's native language handling.`
      : `Language policy: Always respond in ${forcedLanguage} and only use these project-approved output languages: ${configuredLanguages}. ` +
        "The project language assignment is a hard tenant boundary. Never speak, switch, translate, or generate audio in a language outside this allowlist. " +
        "If the user speaks or requests an unsupported language, continue in the effective default allowed language instead. " +
        `For the remaining approved languages, ${languageGuidance.session} Do not switch output language unless the project configuration is changed.`,
  );

  if (config.strictMode) parts.push("Strict mode is ON. Use it as a knowledge-safety rule, not as a trigger for refusing normal conversation or broad questions. If retrieved context contains relevant information, answer the user's question from that context even when the wording is broad, abbreviated, contains spelling mistakes, or does not exactly match a source. Capability/onboarding questions such as what you can do, how you can help, what topics you cover, or what the visitor can ask are NOT out of scope: answer them using the configured welcome/capability guidance and the knowledge-base scope above. Ordinary greetings, thanks, acknowledgements, and pleasantries are also always allowed. Only a genuinely domain-specific question without supporting evidence should receive the configured knowledge-boundary response. Never use the configured out-of-scope reply for simple conversation. " + `For a genuinely out-of-scope domain request, say exactly: "${config.outOfScopeReply}"`);
  else parts.push(`If a domain-specific question is outside this knowledge base, acknowledge the limitation and reply: "${config.outOfScopeReply}"`);

  if (config.citeSources) parts.push("When your answer draws from specific document snippets, append inline source references such as [S1], [S2] at the end of the relevant sentence.");
  parts.push("Keep answers concise, warm, and conversational. Do not mention 'retrieval', 'documents', 'RAG', or 'context' — speak like a well-briefed human expert, not a search engine.");
  return parts.join("\n\n");
}

export function buildLanguageGuidanceFromConfig(config: AssistantConfig): { session: string; follow: string } {
  const preferences = resolveLanguagePreferences({ assistant: config.alwaysRespondIn ?? config.defaultLanguage, customer: config.allowedLanguages });
  const guidance = buildLanguageGuidance(preferences);
  return { session: config.alwaysRespondIn && preferences.assistant ? `Always respond in ${describeLanguage(preferences.assistant)}. Do not switch output language unless this configuration is changed.` : guidance.session, follow: config.alwaysRespondIn && preferences.assistant ? `Continue in ${describeLanguage(preferences.assistant)}.` : guidance.follow };
}
