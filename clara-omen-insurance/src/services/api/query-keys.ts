export const portalQueryKeys = {
  all: () => ["omen-portal"] as const,
  knowledgeBases: (orgId: string) => ["omen-portal", "knowledge-bases", orgId] as const,
  documents: (kbId: string) => ["omen-portal", "documents", kbId] as const,
  subscription: (orgId: string) => ["omen-portal", "subscription", orgId] as const,
  analytics: (kbId: string, range: string) => ["omen-portal", "analytics", kbId, range] as const,
  assistantConfig: (kbId: string) => ["omen-portal", "assistant-config", kbId] as const,
};
