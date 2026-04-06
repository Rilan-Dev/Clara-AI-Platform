import OpenAI from "openai";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (client) {
    return client;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your environment before calling the OpenAI API.",
    );
  }

  client = new OpenAI({ apiKey });
  return client;
}
