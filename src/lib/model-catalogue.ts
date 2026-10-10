/**
 * WS-0.4 Model catalogue split (plan §2.4): chat models and embedding models
 * live in separate families. A chat model id can never appear in an embedding
 * field — `assertEmbeddingModel` / `assertChatModel` throw hard errors.
 * Pricing is stored as integer micro-dollars per million tokens so the
 * usage-event cost computation never touches floats.
 */
export type ModelFamily = "chat" | "embedding";

export type ModelSpec = {
  id: string;
  family: ModelFamily;
  displayName: string;
  provider: string;
  contextTokens: number;
  inputCostPerMillionMicros: number; // micro-USD per 1M input tokens
  outputCostPerMillionMicros: number; // micro-USD per 1M output tokens
  dimensions?: number; // embedding models only
  tier: number; // minimum plan tier: 0 free, 1 starter, 2 pro, 3 enterprise
};

export const MODEL_CATALOGUE: ModelSpec[] = [
  // ---- chat family (the gpt-5.6 family + gpt-4o variants) ----
  {
    id: "gpt-5.6-sol",
    family: "chat",
    displayName: "GPT-5.6 Sol",
    provider: "openai",
    contextTokens: 128000,
    inputCostPerMillionMicros: 150_000, // $0.15 / 1M
    outputCostPerMillionMicros: 600_000, // $0.60 / 1M
    tier: 0,
  },
  {
    id: "gpt-4o-mini",
    family: "chat",
    displayName: "GPT-4o mini",
    provider: "openai",
    contextTokens: 128000,
    inputCostPerMillionMicros: 150_000,
    outputCostPerMillionMicros: 600_000,
    tier: 0,
  },
  {
    id: "gpt-4o",
    family: "chat",
    displayName: "GPT-4o",
    provider: "openai",
    contextTokens: 128000,
    inputCostPerMillionMicros: 2_500_000,
    outputCostPerMillionMicros: 10_000_000,
    tier: 1,
  },
  {
    id: "gpt-5.6-luna",
    family: "chat",
    displayName: "GPT-5.6 Luna",
    provider: "openai",
    contextTokens: 200000,
    inputCostPerMillionMicros: 3_000_000,
    outputCostPerMillionMicros: 12_000_000,
    tier: 1,
  },
  {
    id: "gpt-5.6-terra",
    family: "chat",
    displayName: "GPT-5.6 Terra",
    provider: "openai",
    contextTokens: 400000,
    inputCostPerMillionMicros: 5_000_000,
    outputCostPerMillionMicros: 20_000_000,
    tier: 2,
  },
  // ---- embedding family (text-embedding-3) ----
  {
    id: "text-embedding-3-small",
    family: "embedding",
    displayName: "text-embedding-3-small",
    provider: "openai",
    contextTokens: 8191,
    inputCostPerMillionMicros: 20_000, // $0.02 / 1M
    outputCostPerMillionMicros: 0,
    dimensions: 1536,
    tier: 0,
  },
  {
    id: "text-embedding-3-large",
    family: "embedding",
    displayName: "text-embedding-3-large",
    provider: "openai",
    contextTokens: 8191,
    inputCostPerMillionMicros: 130_000, // $0.13 / 1M
    outputCostPerMillionMicros: 0,
    dimensions: 3072,
    tier: 1,
  },
];

export function getModel(id: string): ModelSpec | undefined {
  return MODEL_CATALOGUE.find((m) => m.id === id);
}

export function chatModels(): ModelSpec[] {
  return MODEL_CATALOGUE.filter((m) => m.family === "chat");
}

export function embeddingModels(): ModelSpec[] {
  return MODEL_CATALOGUE.filter((m) => m.family === "embedding");
}

/** Hard guard: a chat model id in an embedding field is an explained error. */
export function assertEmbeddingModel(id: string): ModelSpec {
  const m = getModel(id);
  if (!m || m.family !== "embedding") {
    throw new Error(
      `'${id}' is not a valid embedding model. Select from: ${embeddingModels()
        .map((e) => e.id)
        .join(", ")}.`
    );
  }
  return m;
}

export function assertChatModel(id: string): ModelSpec {
  const m = getModel(id);
  if (!m || m.family !== "chat") {
    throw new Error(
      `'${id}' is not a valid chat model. Select from: ${chatModels()
        .map((e) => e.id)
        .join(", ")}.`
    );
  }
  return m;
}

/** Integer micro-dollar cost for a billable invocation. */
export function costMicros(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const m = getModel(modelId);
  if (!m) return 0;
  const cost =
    (BigInt(promptTokens) * BigInt(m.inputCostPerMillionMicros)) /
      BigInt(1_000_000) +
    (BigInt(completionTokens) * BigInt(m.outputCostPerMillionMicros)) /
      BigInt(1_000_000);
  return Number(cost);
}
