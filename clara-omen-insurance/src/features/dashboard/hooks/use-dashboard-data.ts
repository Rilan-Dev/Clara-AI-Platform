"use client";

import { useQuery } from "@tanstack/react-query";
import { getOrgId } from "@/config/app";
import { portalQueryKeys } from "@/services/api/query-keys";
import { portalService } from "@/services/api/portal.service";

export function useDashboardData() {
  const orgId = getOrgId();

  return useQuery({
    queryKey: [...portalQueryKeys.all(), "dashboard", orgId],
    queryFn: async () => {
      const [knowledgeBases, subscriptionData] = await Promise.all([
        portalService.getKnowledgeBases(orgId),
        portalService.getSubscription(orgId),
      ]);

      return {
        knowledgeBases,
        usage: subscriptionData.usage,
        plan: subscriptionData.subscription,
      };
    },
  });
}
