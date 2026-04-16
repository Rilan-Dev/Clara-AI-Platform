export type RagMode = "classic" | "hybrid" | "agentic";

export type RagRuntimeConfig = {
  requestedMode: RagMode;
  ragMode: RagMode;
  enableGraphRag: boolean;
  enableAgentLoop: boolean;
  enableSelfEval: boolean;
  enableMcp: boolean;
  graphStoreProvider: string;
};

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeRagMode(value: unknown): RagMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "classic" || normalized === "hybrid" || normalized === "agentic") return normalized;
  return null;
}

export function getRagRuntimeConfig(options?: { requestedMode?: unknown }): RagRuntimeConfig {
  const envMode = normalizeRagMode(process.env.RAG_MODE) ?? "classic";
  const requestedMode = normalizeRagMode(options?.requestedMode) ?? envMode;
  const enableGraphRag = parseBooleanEnv(process.env.ENABLE_GRAPH_RAG, requestedMode !== "classic");
  const enableAgentLoop = parseBooleanEnv(process.env.ENABLE_AGENT_LOOP, requestedMode === "agentic");
  const enableSelfEval = parseBooleanEnv(process.env.ENABLE_SELF_EVAL, requestedMode === "agentic");
  const enableMcp = parseBooleanEnv(process.env.ENABLE_MCP, false);

  let ragMode: RagMode = requestedMode;
  if (ragMode === "agentic" && !enableAgentLoop) ragMode = enableGraphRag ? "hybrid" : "classic";
  if (ragMode === "hybrid" && !enableGraphRag) ragMode = "classic";

  return {
    requestedMode,
    ragMode,
    enableGraphRag,
    enableAgentLoop,
    enableSelfEval,
    enableMcp,
    graphStoreProvider: process.env.GRAPH_STORE_PROVIDER ?? "memory",
  };
}
