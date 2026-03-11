"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isApiError } from "@clara/api-client";

export function SharedQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 45_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry(failureCount: number, error: unknown) {
              if (isApiError(error) && [400, 401, 403, 404].includes(error.status)) {
                return false;
              }

              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
