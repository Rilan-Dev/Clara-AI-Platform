import { ProviderFactory } from "@/modules/ai-core/factory";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Collects a full (non-streaming) chat completion from the active provider.
 */
export async function getChatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number },
): Promise<string> {
  if (messages.length === 0) {
    throw new Error("Cannot request a chat completion without messages.");
  }

  const provider = ProviderFactory.getProvider();
  const chunks: string[] = [];

  for await (const delta of provider.chatStream(messages, {
    temperature: options?.temperature ?? 0.2,
  })) {
    chunks.push(delta);
  }

  const reply = chunks.join("");
  if (!reply.trim()) {
    throw new Error("The language model did not return a response.");
  }

  return reply.trim();
}
