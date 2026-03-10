export const portalQueryKeys = {
  all: () => ["techvision-portal"] as const,
  knowledgeBases: (orgId: string) => ["techvision-portal", "knowledge-bases", orgId] as const,
  documents: (kbId: string) => ["techvision-portal", "documents", kbId] as const,
  subscription: (orgId: string) => ["techvision-portal", "subscription", orgId] as const,
  analytics: (kbId: string, range: string) => ["techvision-portal", "analytics", kbId, range] as const,
};
