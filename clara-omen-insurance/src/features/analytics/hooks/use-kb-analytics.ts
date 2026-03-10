"use client";

import { useQuery } from "@tanstack/react-query";
import { portalQueryKeys } from "@/services/api/query-keys";
import { portalService } from "@/services/api/portal.service";

export function useKnowledgeBaseAnalytics(kbId: string, range = "30d") {
  return useQuery({
    queryKey: portalQueryKeys.analytics(kbId, range),
    queryFn: () => portalService.getAnalytics(kbId, range),
    enabled: Boolean(kbId),
  });
}
