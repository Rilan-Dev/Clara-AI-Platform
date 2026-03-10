"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalQueryKeys } from "@/services/api/query-keys";
import { portalService } from "@/services/api/portal.service";
import type { AssistantConfig } from "@/services/api/portal.types";

export function useAssistantConfig(kbId: string) {
  return useQuery({
    queryKey: portalQueryKeys.assistantConfig(kbId),
    queryFn: () => portalService.getAssistantConfig(kbId),
    enabled: Boolean(kbId),
  });
}

export function useUpdateAssistantConfig(kbId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<AssistantConfig>) => portalService.updateAssistantConfig(kbId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalQueryKeys.assistantConfig(kbId) });
    },
  });
}
