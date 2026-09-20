"use client";
/**
 * SystemPromptPreview — live preview of the composed system prompt
 * Shows what the assistant will actually receive based on current config.
 */
import { useMemo } from "react";
import type { AssistantConfig } from "@/modules/admin-ui/api";

const LANG_NAMES: Record<string, string> = {
  en: "English", ar: "Arabic", fr: "French", es: "Spanish",
  de: "German", zh: "Chinese", ja: "Japanese", pt: "Portuguese",
  tr: "Turkish", ru: "Russian", hi: "Hindi",
};

type Props = { config: AssistantConfig; contextName: string };

export function SystemPromptPreview({ config, contextName }: Props) {
  const preview = useMemo(() => {
    const lines: string[] = [];
    lines.push(`You are ${config.assistantName}, a helpful assistant for "${contextName}".`);
    lines.push("");

    if (config.systemPrompt) {
      lines.push("## Core Instructions");
      lines.push(config.systemPrompt);
      lines.push("");
    }

    if (config.rules.length > 0) {
      lines.push("## Behaviour Rules");
      config.rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
      lines.push("");
    }

    lines.push("## Language Policy");
    const langName = LANG_NAMES[config.defaultLanguage] ?? config.defaultLanguage;
    if (config.alwaysRespondIn) {
      const fixed = LANG_NAMES[config.alwaysRespondIn] ?? config.alwaysRespondIn;
      lines.push(`Always respond in ${fixed}, regardless of the user's language.`);
    } else {
      lines.push(`Default response language: ${langName}.`);
      if (config.allowedLanguages.length > 1) {
        const langs = config.allowedLanguages.map((l) => LANG_NAMES[l] ?? l).join(", ");
        lines.push(`Supported languages: ${langs}.`);
      }
    }
    lines.push("");

    if (config.strictMode) {
      lines.push("## Scope");
      lines.push(`If a question is outside the scope of this knowledge base, reply: "${config.outOfScopeReply}"`);
      lines.push("");
    }

    lines.push("## Parameters");
    lines.push(`Temperature: ${config.temperature} · Max tokens: ${config.maxTokens} · Cite sources: ${config.citeSources ? "yes" : "no"}`);

    return lines.join("\n");
  }, [config, contextName]);

  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="text-xs font-medium text-muted-foreground font-mono">system_prompt preview</span>
      </div>
      <pre className="p-4 text-xs leading-relaxed text-foreground whitespace-pre-wrap font-mono overflow-auto max-h-80">
        {preview}
      </pre>
    </div>
  );
}
