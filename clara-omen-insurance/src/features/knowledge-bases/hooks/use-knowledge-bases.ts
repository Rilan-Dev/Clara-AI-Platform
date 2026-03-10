"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrgId } from "@/config/app";
import { portalQueryKeys } from "@/services/api/query-keys";
import { portalService } from "@/services/api/portal.service";

export function useKnowledgeBases() {
  const orgId = getOrgId();

  return useQuery({
    queryKey: portalQueryKeys.knowledgeBases(orgId),
    queryFn: () => portalService.getKnowledgeBases(orgId),
  });
}

export function useDocuments(kbId: string) {
  return useQuery({
    queryKey: portalQueryKeys.documents(kbId),
    queryFn: () => portalService.getDocuments(kbId),
    enabled: Boolean(kbId),
    refetchInterval: (query) => {
      const documents = query.state.data ?? [];
      return documents.some((doc) => doc.status === "pending" || doc.status === "processing") ? 4_000 : false;
    },
  });
}

export function useUploadDocument(kbId: string, onProgress?: (value: number) => void) {
  const queryClient = useQueryClient();
  const orgId = getOrgId();

  return useMutation({
    mutationFn: (file: File) => portalService.uploadDocument(kbId, file, onProgress),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portalQueryKeys.documents(kbId) }),
        queryClient.invalidateQueries({ queryKey: portalQueryKeys.knowledgeBases(orgId) }),
      ]);
    },
  });
}
